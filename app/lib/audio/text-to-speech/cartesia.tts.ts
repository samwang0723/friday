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
}
