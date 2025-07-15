import type { ITranscriptionService, ITextToSpeechService } from "./types";
import { GroqTranscriptionService } from "@/lib/audio/transcription";
import {
  CartesiaTextToSpeechService,
  ElevenLabsTextToSpeechService
} from "@/lib/audio/text-to-speech";

const transcriptionServices: Record<string, ITranscriptionService> = {
  groq: new GroqTranscriptionService()
};

const ttsServices: Record<string, ITextToSpeechService> = {
  cartesia: new CartesiaTextToSpeechService(),
  elevenlabs: new ElevenLabsTextToSpeechService()
};

export function getTranscriptionService(
  provider: string
): ITranscriptionService {
  const service = transcriptionServices[provider];
  if (!service) {
    console.warn(
      `Transcription provider '${provider}' not found. Defaulting to 'groq'.`
    );
    return transcriptionServices.groq as ITranscriptionService;
  }
  return service;
}

export function getTextToSpeechService(provider: string): ITextToSpeechService {
  const service = ttsServices[provider];
  if (!service) {
    console.warn(
      `TTS provider '${provider}' not found. Defaulting to 'elevenlabs'.`
    );
    return ttsServices.elevenlabs as ITextToSpeechService;
  }
  return service;
}
