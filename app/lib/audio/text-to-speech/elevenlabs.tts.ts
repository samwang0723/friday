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
          output_format: "mp3_22050_32"
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

      return new Response(Buffer.concat(chunks), { status: 200 });
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
}
