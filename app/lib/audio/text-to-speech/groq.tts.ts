import Groq from "groq-sdk";
import { ttsConfigs } from "@/config";
import type { ITextToSpeechService } from "@/lib/audio/types";

const groq = new Groq();

export class GroqTextToSpeechService implements ITextToSpeechService {
  async synthesize(text: string, abortSignal?: AbortSignal): Promise<Response> {
    const config = ttsConfigs.groq;
    if (!config || !config.apiKey) {
      console.error("Groq API key is not configured for TTS.");
      return new Response("Groq API key is not configured for TTS.", {
        status: 500
      });
    }

    if (!groq)
      return new Response("Groq client not initialized", { status: 500 });

    try {
      if (abortSignal?.aborted) {
        console.info("Groq TTS synthesis was cancelled");
        return new Response("Groq TTS operation was cancelled", {
          status: 200
        });
      }

      const response = await groq.audio.speech.create({
        model: config.modelName,
        voice: config.voiceId!,
        input: text,
        response_format: "wav"
      });

      // Check for cancellation before processing the response
      if (abortSignal?.aborted) {
        console.info("Groq TTS cancelled before ArrayBuffer conversion");
        return new Response(
          "Groq TTS cancelled before ArrayBuffer conversion",
          { status: 200 }
        );
      }

      // Final check for cancellation after ArrayBuffer conversion
      if (abortSignal?.aborted) {
        console.info("Groq TTS cancelled after ArrayBuffer conversion");
        return new Response("Groq TTS cancelled after ArrayBuffer conversion", {
          status: 200
        });
      }

      return response;
    } catch (error) {
      // Handle AbortError specifically
      if (error instanceof Error && error.name === "AbortError") {
        console.info("Groq TTS operation was cancelled");
        return new Response("Groq TTS operation was cancelled", {
          status: 200
        });
      }
      console.error("Groq TTS failed:", error);
      return new Response("Groq TTS failed", { status: 500 });
    }
  }
}
