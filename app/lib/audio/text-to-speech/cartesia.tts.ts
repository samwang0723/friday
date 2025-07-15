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
    text: string,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    const config = ttsConfigs.cartesia as TextToSpeechConfig;
    if (!config || !config.apiKey || !config.voiceId) {
      console.error("Cartesia API key or Voice ID is not configured for TTS.");
      throw new Error(
        "Cartesia API key or Voice ID is not configured for TTS."
      );
    }

    try {
      // Check if operation was cancelled before making the API call
      if (abortSignal?.aborted) {
        console.info(
          "Cartesia TTS streaming operation was cancelled before API call"
        );
        throw new Error(
          "Cartesia TTS streaming operation was cancelled before API call"
        );
      }

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

      // Check if operation was cancelled after the API call
      if (abortSignal?.aborted) {
        console.info(
          "Cartesia TTS streaming operation was cancelled after API call"
        );
        throw new Error(
          "Cartesia TTS streaming operation was cancelled after API call"
        );
      }

      if (!response.ok) {
        throw new Error(
          `Cartesia API error: ${response.status} ${response.statusText}`
        );
      }

      // Handle Server-Sent Events stream
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        return new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              let buffer = "";

              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  controller.close();
                  break;
                }

                // Check for cancellation during processing
                if (abortSignal?.aborted) {
                  console.info(
                    "Cartesia TTS streaming operation was cancelled during processing"
                  );
                  controller.close();
                  return;
                }

                // Decode and process SSE data
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || ""; // Keep incomplete line in buffer

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6); // Remove 'data: ' prefix

                    if (dataStr === "[DONE]") {
                      controller.close();
                      return;
                    }

                    try {
                      const eventData = JSON.parse(dataStr);

                      // Handle audio data events
                      if (eventData.type === "chunk" && eventData.data) {
                        // Convert base64 audio data to Uint8Array
                        const binaryString = atob(eventData.data);
                        const audioData = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                          audioData[i] = binaryString.charCodeAt(i);
                        }
                        controller.enqueue(audioData);
                      }
                    } catch (parseError) {
                      console.warn(
                        "Failed to parse SSE event data:",
                        parseError
                      );
                    }
                  }
                }
              }
            } catch (error) {
              if (error instanceof Error && error.name === "AbortError") {
                console.info("Cartesia TTS streaming operation was aborted");
                controller.close();
              } else {
                console.error("Cartesia TTS streaming failed:", error);
                controller.error(error);
              }
            }
          },
          cancel() {
            console.info("Cartesia TTS streaming was cancelled by client");
            reader.cancel();
          }
        });
      } else {
        throw new Error("No response body received from Cartesia SSE API");
      }
    } catch (error) {
      // Handle AbortError gracefully
      if (error instanceof Error && error.name === "AbortError") {
        console.info("Cartesia TTS streaming operation was cancelled");
        throw error;
      }
      console.error("Cartesia TTS streaming failed:", error);
      throw error;
    }
  }
}
