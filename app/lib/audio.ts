/**
 * Simplified Audio Services
 * Direct provider integrations without complex abstractions
 */

import type { TextToSpeechConfig } from "@/config";
import { transcriptionConfigs, ttsConfigs } from "@/config";
import { CartesiaClient } from "@cartesia/cartesia-js";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import Groq from "groq-sdk";

/**
 * Sanitizes and validates text for TTS processing
 * @param text - Raw text input
 * @param minLength - Minimum required length (default: 3)
 * @returns Sanitized text or null if invalid
 */
export function sanitizeTextForTTS(
  text: string,
  minLength: number = 3
): string | null {
  // Initial validation
  const cleanText = text.trim();
  if (!cleanText) {
    console.warn("Empty text provided for TTS");
    return null;
  }

  if (cleanText.length < minLength) {
    console.warn("Text chunk too short, skipping:", cleanText);
    return null;
  }

  // Remove problematic characters that might cause API issues
  const sanitizedText = cleanText
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  if (!sanitizedText) {
    console.warn("Text chunk empty after sanitization, skipping");
    return null;
  }

  return sanitizedText;
}

// Convert 16-bit signed little-endian PCM to 32-bit float little-endian PCM
function convertS16LEToF32LE(input: Buffer): Uint8Array {
  // Each S16LE sample is 2 bytes, each F32LE sample is 4 bytes
  const sampleCount = input.length / 2;
  const output = new ArrayBuffer(sampleCount * 4);
  const view = new DataView(output);

  for (let i = 0; i < sampleCount; i++) {
    // Read 16-bit signed integer (little-endian)
    const sample = input.readInt16LE(i * 2);
    // Convert to float [-1.0, 1.0] by dividing by 32768.0
    const floatSample = sample / 32768.0;
    // Write 32-bit float (little-endian)
    view.setFloat32(i * 4, floatSample, true);
  }

  return new Uint8Array(output);
}

// Simple transcription function
export async function transcribeAudio(
  audio: Buffer,
  engine: string = "groq"
): Promise<string> {
  try {
    if (engine === "groq") {
      const config = transcriptionConfigs.groq;
      if (!config || !config.apiKey) {
        console.error("Groq API key is not configured for transcription.");
        return "";
      }

      const groq = new Groq();

      const audioFile = new File([audio], "audio.webm", {
        type: "audio/webm"
      });
      const { text } = await groq.audio.transcriptions.create({
        file: audioFile,
        model: config.modelName
      });

      return text.trim() || "";
    }

    // Add other providers here as needed
    return "";
  } catch (error) {
    console.error("Transcription failed:", error);
    return "";
  }
}

// Simple TTS function
export async function synthesizeSpeech(
  text: string,
  engine: string = "cartesia",
  abortSignal?: AbortSignal
): Promise<Response> {
  try {
    // Validate and sanitize text input
    const sanitizedText = sanitizeTextForTTS(text);
    if (!sanitizedText) {
      return new Response("Invalid text content", { status: 400 });
    }

    if (engine === "cartesia") {
      const config = ttsConfigs.cartesia as TextToSpeechConfig;
      if (!config || !config.apiKey || !config.voiceId) {
        console.error(
          "Cartesia API key or Voice ID is not configured for TTS."
        );
        return new Response("Cartesia TTS not configured", { status: 500 });
      }

      if (abortSignal?.aborted) {
        return new Response("TTS operation cancelled", { status: 200 });
      }

      // Additional validation for voice ID
      if (!config.voiceId.trim()) {
        console.error("Cartesia voice ID is empty");
        return new Response("Invalid voice configuration", { status: 500 });
      }

      const cartesia = new CartesiaClient({ apiKey: config.apiKey });

      const audioResponse = await cartesia.tts.bytes({
        modelId: config.modelName,
        transcript: sanitizedText,
        voice: {
          mode: "id",
          id: config.voiceId
        },
        outputFormat: {
          container: "raw",
          encoding: "pcm_f32le",
          sampleRate: 24000
        }
      });

      return new Response(audioResponse, { status: 200 });
    }

    if (engine === "elevenlabs") {
      const config = ttsConfigs.elevenlabs as TextToSpeechConfig;
      if (!config || !config.apiKey || !config.voiceId) {
        console.error(
          "ElevenLabs API key or Voice ID is not configured for TTS."
        );
        return new Response("ElevenLabs TTS not configured", { status: 500 });
      }

      if (abortSignal?.aborted) {
        return new Response("TTS operation cancelled", { status: 200 });
      }

      // Additional validation for voice ID
      if (!config.voiceId.trim()) {
        console.error("ElevenLabs voice ID is empty");
        return new Response("Invalid voice configuration", { status: 500 });
      }

      const elevenlabs = new ElevenLabsClient({ apiKey: config.apiKey });

      const audioStream = await elevenlabs.textToSpeech.stream(config.voiceId, {
        text: sanitizedText,
        modelId: config.modelName,
        outputFormat: "pcm_24000"
      });

      const chunks: Buffer[] = [];
      const reader = audioStream.getReader();
      try {
        while (true) {
          if (abortSignal?.aborted) {
            return new Response("TTS operation cancelled", { status: 200 });
          }
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }

      // Convert S16LE to F32LE
      const s16leBuffer = Buffer.concat(chunks);
      const f32leData = convertS16LEToF32LE(s16leBuffer);

      return new Response(f32leData, { status: 200 });
    }

    if (engine === "minimax") {
      const config = ttsConfigs.minimax as TextToSpeechConfig;
      if (!config || !config.apiKey || !config.groupId) {
        console.error("Minimax API key or Group ID is not configured for TTS.");
        return new Response("Minimax TTS not configured", { status: 500 });
      }

      if (abortSignal?.aborted) {
        return new Response("TTS operation cancelled", { status: 200 });
      }

      // Additional validation for voice ID
      if (!config.voiceId?.trim()) {
        console.error("Minimax voice ID is empty");
        return new Response("Invalid voice configuration", { status: 500 });
      }

      try {
        const url = `https://api.minimax.io/v1/t2a_v2?GroupId=${config.groupId}`;
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`
        };

        const body = {
          model: config.modelName,
          text: sanitizedText,
          stream: false,
          voice_setting: {
            voice_id: config.voiceId,
            speed: 1.0,
            vol: 1.0,
            pitch: 0
          },
          audio_setting: {
            sample_rate: 24000,
            bitrate: 128000,
            format: "pcm",
            channel: 1
          }
        };

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: abortSignal
        });

        if (!response.ok) {
          throw new Error(`Minimax API error: ${response.status}`);
        }

        const result = await response.json();

        if (result.data && result.data.audio) {
          // Decode hex audio data (PCM format from Minimax)
          const audioHex = result.data.audio;
          const pcmBuffer = Buffer.from(audioHex, "hex");

          // Convert to F32LE format to match other vendors
          const f32leData = convertS16LEToF32LE(pcmBuffer);

          return new Response(f32leData, { status: 200 });
        } else {
          throw new Error("No audio data received from Minimax");
        }
      } catch (error) {
        console.error("Minimax TTS synthesis failed:", error);
        return new Response("Minimax TTS synthesis failed", { status: 500 });
      }
    }

    throw new Error(`Unsupported TTS engine: ${engine}`);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.info("TTS operation was cancelled");
      return new Response("TTS operation cancelled", { status: 200 });
    }
    console.error("TTS synthesis failed:", error);
    return new Response("TTS synthesis failed", { status: 500 });
  }
}

// Simple streaming TTS function
export function synthesizeSpeechStream(
  textChunks: AsyncIterable<string>,
  engine: string = "cartesia",
  abortSignal?: AbortSignal
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Add initial configuration validation and diagnostics
        if (engine === "cartesia") {
          const config = ttsConfigs.cartesia as TextToSpeechConfig;
          if (!config || !config.apiKey || !config.voiceId) {
            throw new Error(
              "Cartesia API key or Voice ID is not configured for TTS."
            );
          }
          console.log("Cartesia TTS config validated:", {
            hasApiKey: !!config.apiKey,
            voiceId: config.voiceId,
            modelName: config.modelName
          });
        } else if (engine === "elevenlabs") {
          const config = ttsConfigs.elevenlabs as TextToSpeechConfig;
          if (!config || !config.apiKey || !config.voiceId) {
            throw new Error(
              "ElevenLabs API key or Voice ID is not configured for TTS."
            );
          }
          console.log("ElevenLabs TTS config validated:", {
            hasApiKey: !!config.apiKey,
            voiceId: config.voiceId,
            modelName: config.modelName
          });
        } else if (engine === "minimax") {
          const config = ttsConfigs.minimax as TextToSpeechConfig;
          if (!config || !config.apiKey || !config.groupId) {
            throw new Error(
              "Minimax API key or Group ID is not configured for TTS."
            );
          }
          console.log("Minimax TTS config validated:", {
            hasApiKey: !!config.apiKey,
            hasGroupId: !!config.groupId,
            voiceId: config.voiceId,
            modelName: config.modelName
          });
        }

        // Common text processing logic
        const processTextChunks = async (
          processTextChunk: (text: string) => Promise<void>
        ) => {
          let textBuffer = "";
          const sentenceEnders = [".", "!", "?", "\n"];
          const minChunkSize = 20;

          // Process incoming text chunks
          for await (const chunk of textChunks) {
            if (abortSignal?.aborted) break;

            textBuffer += chunk;

            // Look for sentence boundaries
            while (textBuffer.length >= minChunkSize) {
              let sentenceEnd = -1;

              // Find the nearest sentence ender
              for (const ender of sentenceEnders) {
                const index = textBuffer.indexOf(ender);
                if (
                  index !== -1 &&
                  (sentenceEnd === -1 || index < sentenceEnd)
                ) {
                  sentenceEnd = index;
                }
              }

              if (sentenceEnd !== -1) {
                // Process complete sentence
                const sentence = textBuffer
                  .substring(0, sentenceEnd + 1)
                  .trim();
                textBuffer = textBuffer.substring(sentenceEnd + 1);

                if (sentence) {
                  await processTextChunk(sentence);
                }
              } else if (textBuffer.length > 100) {
                // Force process if buffer gets too large
                const lastSpace = textBuffer.lastIndexOf(" ", 100);
                if (lastSpace > 0) {
                  const chunk = textBuffer.substring(0, lastSpace).trim();
                  textBuffer = textBuffer.substring(lastSpace + 1);

                  if (chunk) {
                    await processTextChunk(chunk);
                  }
                } else {
                  break;
                }
              } else {
                break;
              }
            }
          }

          // Process any remaining text
          if (textBuffer.trim() && !abortSignal?.aborted) {
            await processTextChunk(textBuffer.trim());
          }
        };

        if (engine === "cartesia") {
          const config = ttsConfigs.cartesia as TextToSpeechConfig;
          if (!config || !config.apiKey || !config.voiceId) {
            throw new Error(
              "Cartesia API key or Voice ID is not configured for TTS."
            );
          }

          const cartesia = new CartesiaClient({ apiKey: config.apiKey });

          const processTextChunk = async (text: string) => {
            if (abortSignal?.aborted) return;

            // Validate and sanitize text content
            const sanitizedText = sanitizeTextForTTS(text);
            if (!sanitizedText) return;

            try {
              // Validate configuration before making API call
              if (!config.voiceId || config.voiceId.trim() === "") {
                throw new Error("Cartesia voice ID is not configured or empty");
              }

              const response = await cartesia.tts.sse({
                modelId: config.modelName,
                transcript: sanitizedText,
                voice: {
                  mode: "id",
                  id: config.voiceId!
                },
                outputFormat: {
                  container: "raw",
                  encoding: "pcm_f32le",
                  sampleRate: 24000
                }
              });

              for await (const chunk of response) {
                if (abortSignal?.aborted || chunk.type === "done") return;

                if (chunk.type === "chunk" && chunk.data) {
                  const audioData = Uint8Array.from(atob(chunk.data), c =>
                    c.charCodeAt(0)
                  );
                  controller.enqueue(audioData);
                }
              }
            } catch (error) {
              if (error instanceof Error && error.name !== "AbortError") {
                // Enhanced error logging for 400 errors
                if (error.message.includes("Status code: 400")) {
                  console.error("Cartesia API 400 error details:", {
                    originalText: text,
                    sanitizedText: sanitizedText,
                    textLength: sanitizedText.length,
                    voiceId: config.voiceId,
                    modelName: config.modelName,
                    error: error.message
                  });
                } else {
                  console.error("Error processing text chunk:", error);
                }
              }
            }
          };

          await processTextChunks(processTextChunk);
        } else if (engine === "elevenlabs") {
          const config = ttsConfigs.elevenlabs as TextToSpeechConfig;
          if (!config || !config.apiKey || !config.voiceId) {
            throw new Error(
              "ElevenLabs API key or Voice ID is not configured for TTS."
            );
          }

          const elevenlabs = new ElevenLabsClient({ apiKey: config.apiKey });

          const processTextChunk = async (text: string) => {
            if (abortSignal?.aborted) return;

            // Validate and sanitize text content
            const sanitizedText = sanitizeTextForTTS(text);
            if (!sanitizedText) return;

            try {
              // Validate configuration before making API call
              if (!config.voiceId || config.voiceId.trim() === "") {
                throw new Error(
                  "ElevenLabs voice ID is not configured or empty"
                );
              }

              const audioStream = await elevenlabs.textToSpeech.stream(
                config.voiceId!,
                {
                  text: sanitizedText,
                  modelId: config.modelName,
                  outputFormat: "pcm_24000"
                }
              );

              // Collect chunks and convert to F32LE
              const chunks: Buffer[] = [];
              const reader = audioStream.getReader();
              try {
                while (true) {
                  if (abortSignal?.aborted) {
                    return;
                  }
                  const { done, value } = await reader.read();
                  if (done) break;
                  chunks.push(Buffer.from(value));
                }
              } finally {
                reader.releaseLock();
              }

              // Convert S16LE to F32LE and enqueue
              const s16leBuffer = Buffer.concat(chunks);
              const f32leData = convertS16LEToF32LE(s16leBuffer);
              controller.enqueue(f32leData);
            } catch (error) {
              if (error instanceof Error && error.name !== "AbortError") {
                // Enhanced error logging for 400 errors
                if (
                  error.message.includes("Status code: 400") ||
                  error.message.includes("400")
                ) {
                  console.error("ElevenLabs API 400 error details:", {
                    originalText: text,
                    sanitizedText: sanitizedText,
                    textLength: sanitizedText.length,
                    voiceId: config.voiceId,
                    modelName: config.modelName,
                    error: error.message
                  });
                } else {
                  console.error("Error processing text chunk:", error);
                }
              }
            }
          };

          await processTextChunks(processTextChunk);
        } else if (engine === "minimax") {
          const config = ttsConfigs.minimax as TextToSpeechConfig;
          if (!config || !config.apiKey || !config.groupId) {
            throw new Error(
              "Minimax API key or Group ID is not configured for TTS."
            );
          }

          const processTextChunk = async (text: string) => {
            if (abortSignal?.aborted) return;

            // Validate and sanitize text content
            const sanitizedText = sanitizeTextForTTS(text);
            if (!sanitizedText) return;

            try {
              // Validate configuration before making API call
              if (!config.voiceId || config.voiceId.trim() === "") {
                throw new Error("Minimax voice ID is not configured or empty");
              }

              const url = `https://api.minimax.io/v1/t2a_v2?GroupId=${config.groupId}`;
              const headers = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`
              };

              const body = {
                model: config.modelName,
                text: sanitizedText,
                stream: true,
                voice_setting: {
                  voice_id: config.voiceId,
                  speed: 1.0,
                  vol: 1.0,
                  pitch: 0
                },
                audio_setting: {
                  sample_rate: 24000,
                  bitrate: 128000,
                  format: "pcm",
                  channel: 1
                }
              };

              const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: abortSignal
              });

              if (!response.ok) {
                throw new Error(`Minimax API error: ${response.status}`);
              }

              if (!response.body) {
                throw new Error("No response body from Minimax");
              }

              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";

              try {
                while (true) {
                  if (abortSignal?.aborted) return;

                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });

                  // Split by newlines to process complete JSON objects
                  const lines = buffer.split("\n");

                  // Keep the last incomplete line in buffer
                  buffer = lines.pop() || "";

                  for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine === "" || !trimmedLine.startsWith("data: "))
                      continue;

                    try {
                      // Extract JSON from SSE format: "data: {...}"
                      const jsonStr = trimmedLine.slice(6); // Remove "data: " prefix
                      const data = JSON.parse(jsonStr);

                      // Process audio chunks with status: 1 (intermediate chunks)
                      if (
                        data.data &&
                        data.data.audio &&
                        data.data.status === 1
                      ) {
                        // Decode hex audio data (PCM format from Minimax)
                        const audioHex = data.data.audio;
                        const pcmBuffer = Buffer.from(audioHex, "hex");

                        // Convert to F32LE format to match other vendors
                        const f32leData = convertS16LEToF32LE(pcmBuffer);
                        controller.enqueue(f32leData);
                      }
                      // Status 2 indicates final chunk with extra_info - we can ignore it
                    } catch (parseError) {
                      console.warn(
                        "Minimax streaming parse error:",
                        parseError,
                        "Line:",
                        trimmedLine
                      );
                      continue;
                    }
                  }
                }
              } finally {
                reader.releaseLock();
              }
            } catch (error) {
              if (error instanceof Error && error.name !== "AbortError") {
                console.error("Error processing Minimax text chunk:", {
                  originalText: text,
                  sanitizedText: sanitizedText,
                  textLength: sanitizedText.length,
                  voiceId: config.voiceId,
                  groupId: config.groupId,
                  modelName: config.modelName,
                  error: error.message
                });
              }
            }
          };

          await processTextChunks(processTextChunk);
        } else {
          throw new Error(`Unsupported streaming TTS engine: ${engine}`);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.info("Streaming TTS was aborted");
        } else {
          console.error("Streaming TTS failed:", error);
          controller.error(error);
        }
      } finally {
        try {
          controller.close();
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          // Controller might already be closed
        }
      }
    },
    cancel() {
      console.info("Streaming TTS was cancelled by client");
    }
  });
}
