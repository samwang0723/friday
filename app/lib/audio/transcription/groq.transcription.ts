import Groq from "groq-sdk";
import { transcriptionConfigs } from "@/config";
import type { ITranscriptionService } from "@/lib/audio/types";

const groq = new Groq();

export class GroqTranscriptionService implements ITranscriptionService {
  async transcribe(audio: Buffer): Promise<string> {
    try {
      const config = transcriptionConfigs.groq;
      if (!config || !config.apiKey) {
        console.error("Groq API key is not configured for TTS.");
        return "";
      }
      const audioFile = new File([new Uint8Array(audio.buffer)], "audio.wav", {
        type: "audio/wav"
      });

      const { text } = await groq.audio.transcriptions.create({
        file: audioFile,
        model: config.modelName
      });

      return text.trim() || "";
    } catch {
      return ""; // Empty audio file
    }
  }
}
