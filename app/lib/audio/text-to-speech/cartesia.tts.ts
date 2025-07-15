import { ttsConfigs } from "@/config";
import type { ITextToSpeechService } from "@/lib/audio/types";
import type { TextToSpeechConfig } from "@/config";

export class CartesiaTextToSpeechService implements ITextToSpeechService {
  async synthesize(text: string, abortSignal?: AbortSignal): Promise<Response> {
    const config = ttsConfigs.cartesia as TextToSpeechConfig;
    if (!config || !config.apiKey || !config.voiceId) {
      console.error("Cartesia API key or Voice ID is not configured for TTS.");
      return new Response(
        "Cartesia API key or Voice ID is not configured for TTS.",
        { status: 500 }
      );
    }

    try {
      // Check if operation was cancelled before making the API call
      if (abortSignal?.aborted) {
        console.info("Cartesia TTS operation was cancelled before API call");
        return new Response(
          "Cartesia TTS operation was cancelled before API call",
          { status: 200 }
        );
      }

      const response = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          "Cartesia-Version": "2024-06-30",
          "Content-Type": "application/json",
          "X-API-Key": process.env.CARTESIA_API_KEY!
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
        })
      });

      // Check if operation was cancelled after the API call
      if (abortSignal?.aborted) {
        console.info("Cartesia TTS operation was cancelled after API call");
        return new Response(
          "Cartesia TTS operation was cancelled after API call",
          { status: 200 }
        );
      }

      return response;
    } catch (error) {
      // Handle AbortError gracefully
      if (error instanceof Error && error.name === "AbortError") {
        console.info("Cartesia TTS operation was cancelled");
        return new Response("Cartesia TTS operation was cancelled", {
          status: 200
        });
      }
      console.error("Cartesia TTS failed:", error);
      return new Response("Cartesia TTS failed", { status: 500 });
    }
  }

  async synthesizeStream(
    textChunks: AsyncIterable<string>,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    const config = ttsConfigs.cartesia as TextToSpeechConfig;
    if (!config || !config.apiKey || !config.voiceId) {
      console.error("Cartesia API key or Voice ID is not configured for TTS.");
      throw new Error(
        "Cartesia API key or Voice ID is not configured for TTS."
      );
    }

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let textBuffer = "";
          const sentenceEnders = [".", "!", "?", "\n"];
          const minChunkSize = 20; // Minimum characters before sending to TTS

          // Process a text chunk through Cartesia SSE API
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
            console.info("Cartesia chunked streaming was aborted");
          } else {
            console.error("Cartesia chunked streaming failed:", error);
            controller.error(error);
          }
          controller.close();
        }
      },
      cancel() {
        console.info("Cartesia chunked streaming was cancelled by client");
      }
    });
  }
}
