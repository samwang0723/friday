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

  async synthesizeStream(
    text: string,
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

    try {
      // Check if operation was cancelled before starting
      if (abortSignal?.aborted) {
        console.info(
          "ElevenLabs TTS streaming operation was cancelled before starting"
        );
        throw new Error(
          "ElevenLabs TTS streaming operation was cancelled before starting"
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

      return new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of audioStream) {
              // Check for cancellation during stream processing
              if (abortSignal?.aborted) {
                console.info(
                  "ElevenLabs TTS streaming operation was cancelled during processing"
                );
                controller.close();
                return;
              }

              // Enqueue the chunk as Uint8Array
              controller.enqueue(new Uint8Array(chunk));
            }
            controller.close();
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              console.info("ElevenLabs TTS streaming operation was aborted");
              controller.close();
            } else {
              console.error("ElevenLabs TTS streaming failed:", error);
              controller.error(error);
            }
          }
        },
        cancel() {
          console.info("ElevenLabs TTS streaming was cancelled by client");
        }
      });
    } catch (error) {
      // Handle AbortError specifically
      if (error instanceof Error && error.name === "AbortError") {
        console.info("ElevenLabs TTS streaming operation was aborted");
        throw error;
      }
      console.error("ElevenLabs TTS streaming failed:", error);
      throw error;
    }
  }
}
