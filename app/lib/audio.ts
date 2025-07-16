/**
 * Simplified Audio Services
 * Direct provider integrations without complex abstractions
 */

import Groq from "groq-sdk";
import { ElevenLabsClient } from "elevenlabs";
import { transcriptionConfigs, ttsConfigs } from "@/config";
import type { TextToSpeechConfig } from "@/config";

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
export async function transcribeAudio(audio: Buffer, engine: string = "groq"): Promise<string> {
  try {
    if (engine === "groq") {
      const config = transcriptionConfigs.groq;
      if (!config || !config.apiKey) {
        console.error("Groq API key is not configured for transcription.");
        return "";
      }

      const groq = new Groq();
      const audioFile = new File([new Uint8Array(audio.buffer)], "audio.wav", {
        type: "audio/wav"
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
    if (engine === "cartesia") {
      const config = ttsConfigs.cartesia as TextToSpeechConfig;
      if (!config || !config.apiKey || !config.voiceId) {
        console.error("Cartesia API key or Voice ID is not configured for TTS.");
        return new Response("Cartesia TTS not configured", { status: 500 });
      }

      if (abortSignal?.aborted) {
        return new Response("TTS operation cancelled", { status: 200 });
      }

      const response = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          "Cartesia-Version": "2024-06-30",
          "Content-Type": "application/json",
          "X-API-Key": config.apiKey
        },
        body: JSON.stringify({
          model_id: config.modelName,
          transcript: text,
          voice: {
            mode: "id",
            id: config.voiceId
          },
          output_format: {
            container: "raw",
            encoding: "pcm_f32le",
            sample_rate: 24000
          }
        }),
        signal: abortSignal
      });

      return response;
    }
    
    if (engine === "elevenlabs") {
      const config = ttsConfigs.elevenlabs as TextToSpeechConfig;
      if (!config || !config.apiKey || !config.voiceId) {
        console.error("ElevenLabs API key or Voice ID is not configured for TTS.");
        return new Response("ElevenLabs TTS not configured", { status: 500 });
      }

      if (abortSignal?.aborted) {
        return new Response("TTS operation cancelled", { status: 200 });
      }

      const elevenlabs = new ElevenLabsClient({ apiKey: config.apiKey });

      const audioStream = await elevenlabs.textToSpeech.convertAsStream(
        config.voiceId,
        {
          text,
          model_id: config.modelName,
          output_format: "pcm_24000"
        }
      );

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        if (abortSignal?.aborted) {
          return new Response("TTS operation cancelled", { status: 200 });
        }
        chunks.push(chunk);
      }

      // Convert S16LE to F32LE
      const s16leBuffer = Buffer.concat(chunks);
      const f32leData = convertS16LEToF32LE(s16leBuffer);

      return new Response(f32leData, { status: 200 });
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
        // Common text processing logic
        const processTextChunks = async (processTextChunk: (text: string) => Promise<void>) => {
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
                if (index !== -1 && (sentenceEnd === -1 || index < sentenceEnd)) {
                  sentenceEnd = index;
                }
              }

              if (sentenceEnd !== -1) {
                // Process complete sentence
                const sentence = textBuffer.substring(0, sentenceEnd + 1).trim();
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
            throw new Error("Cartesia API key or Voice ID is not configured for TTS.");
          }

          const processTextChunk = async (text: string) => {
            if (!text.trim() || abortSignal?.aborted) return;

            try {
              const response = await fetch("https://api.cartesia.ai/tts/sse", {
                method: "POST",
                headers: {
                  "Cartesia-Version": "2025-04-16",
                  "Authorization": `Bearer ${config.apiKey}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  model_id: config.modelName,
                  transcript: text,
                  voice: {
                    mode: "id",
                    id: config.voiceId
                  },
                  output_format: {
                    container: "raw",
                    encoding: "pcm_f32le",
                    sample_rate: 24000
                  },
                  language: "en"
                }),
                signal: abortSignal
              });

              if (!response.ok) {
                console.error(`Cartesia API error: ${response.status}`);
                return;
              }

              if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  if (abortSignal?.aborted) {
                    reader.cancel();
                    return;
                  }

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() || "";

                  for (const line of lines) {
                    if (line.startsWith("data: ")) {
                      const dataStr = line.slice(6);
                      if (dataStr === "[DONE]") continue;

                      try {
                        const eventData = JSON.parse(dataStr);
                        if (eventData.type === "chunk" && eventData.data) {
                          // Convert base64 to Uint8Array
                          const binaryString = atob(eventData.data);
                          const audioData = new Uint8Array(binaryString.length);
                          for (let i = 0; i < binaryString.length; i++) {
                            audioData[i] = binaryString.charCodeAt(i);
                          }
                          controller.enqueue(audioData);
                        }
                      } catch (e) {
                        console.warn("Failed to parse SSE event:", e);
                      }
                    }
                  }
                }
              }
            } catch (error) {
              if (error instanceof Error && error.name !== "AbortError") {
                console.error("Error processing text chunk:", error);
              }
            }
          };

          await processTextChunks(processTextChunk);

        } else if (engine === "elevenlabs") {
          const config = ttsConfigs.elevenlabs as TextToSpeechConfig;
          if (!config || !config.apiKey || !config.voiceId) {
            throw new Error("ElevenLabs API key or Voice ID is not configured for TTS.");
          }

          const elevenlabs = new ElevenLabsClient({ apiKey: config.apiKey });

          const processTextChunk = async (text: string) => {
            if (!text.trim() || abortSignal?.aborted) return;

            try {
              const audioStream = await elevenlabs.textToSpeech.convertAsStream(
                config.voiceId!,
                {
                  text,
                  model_id: config.modelName,
                  output_format: "pcm_24000"
                }
              );

              // Collect chunks and convert to F32LE
              const chunks: Buffer[] = [];
              for await (const chunk of audioStream) {
                if (abortSignal?.aborted) {
                  return;
                }
                chunks.push(chunk);
              }

              // Convert S16LE to F32LE and enqueue
              const s16leBuffer = Buffer.concat(chunks);
              const f32leData = convertS16LEToF32LE(s16leBuffer);
              controller.enqueue(f32leData);
            } catch (error) {
              if (error instanceof Error && error.name !== "AbortError") {
                console.error("Error processing text chunk:", error);
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