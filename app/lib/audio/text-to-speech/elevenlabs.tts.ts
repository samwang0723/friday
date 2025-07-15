import { ElevenLabsClient } from "elevenlabs";
import { ttsConfigs } from "@/config";
import type { ITextToSpeechService } from "@/lib/audio/types";
import type { TextToSpeechConfig } from "@/config";

const getElevenLabsClient = (apiKey: string | undefined) => {
  if (!apiKey) {
    console.warn(
      "ELEVENLABS_API_KEY is not set. ElevenLabs services will not be available."
    );
    return null;
  }
  return new ElevenLabsClient({ apiKey });
};

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

export class ElevenLabsTextToSpeechService implements ITextToSpeechService {
  async synthesize(text: string, abortSignal?: AbortSignal): Promise<Response> {
    const config = ttsConfigs.elevenlabs as TextToSpeechConfig;
    if (!config || !config.apiKey || !config.voiceId) {
      console.error(
        "ElevenLabs API key or Voice ID is not configured for TTS."
      );
      return new Response(
        "ElevenLabs API key or Voice ID is not configured for TTS.",
        { status: 500 }
      );
    }

    const elevenlabs = getElevenLabsClient(config.apiKey);
    if (!elevenlabs)
      return new Response("ElevenLabs client not initialized", { status: 500 });

    try {
      // Check if operation was cancelled before starting
      if (abortSignal?.aborted) {
        console.info("ElevenLabs TTS operation was cancelled before starting");
        return new Response(
          "ElevenLabs TTS operation was cancelled before starting",
          { status: 200 }
        );
      }

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
        // Check for cancellation during stream processing
        if (abortSignal?.aborted) {
          console.info(
            "ElevenLabs TTS operation was cancelled during stream processing"
          );
          return new Response(
            "ElevenLabs TTS operation was cancelled during stream processing",
            { status: 200 }
          );
        }
        chunks.push(chunk);
      }

      // Convert S16LE to F32LE
      const s16leBuffer = Buffer.concat(chunks);
      const f32leData = convertS16LEToF32LE(s16leBuffer);

      return new Response(f32leData, { status: 200 });
    } catch (error) {
      // Handle AbortError specifically
      if (error instanceof Error && error.name === "AbortError") {
        console.info("ElevenLabs TTS operation was aborted");
        return new Response("ElevenLabs TTS operation was aborted", {
          status: 200
        });
      }
      console.error("ElevenLabs TTS failed:", error);
      return new Response("ElevenLabs TTS failed", { status: 500 });
    }
  }

  async synthesizeStream(
    textChunks: AsyncIterable<string>,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    const config = ttsConfigs.elevenlabs as TextToSpeechConfig;
    if (!config || !config.apiKey || !config.voiceId) {
      console.error(
        "ElevenLabs API key or Voice ID is not configured for TTS."
      );
      throw new Error(
        "ElevenLabs API key or Voice ID is not configured for TTS."
      );
    }

    const elevenlabs = getElevenLabsClient(config.apiKey);
    if (!elevenlabs) {
      throw new Error("ElevenLabs client not initialized");
    }

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let textBuffer = "";
          const sentenceEnders = [".", "!", "?", "\n"];
          const minChunkSize = 20; // Minimum characters before sending to TTS

          // Process a text chunk through ElevenLabs API
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
                  break; // Wait for more text
                }
              } else {
                break; // Wait for more text
              }
            }
          }

          // Process any remaining text
          if (textBuffer.trim() && !abortSignal?.aborted) {
            await processTextChunk(textBuffer.trim());
          }

          controller.close();
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            console.info("ElevenLabs chunked streaming was aborted");
          } else {
            console.error("ElevenLabs chunked streaming failed:", error);
            controller.error(error);
          }
          controller.close();
        }
      },
      cancel() {
        console.log("ElevenLabs chunked streaming was cancelled by client");
      }
    });
  }
}
