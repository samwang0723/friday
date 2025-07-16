export const serverConfig = {
  port: process.env.PORT || 3000,
  logLevel: process.env.LOG_LEVEL || "info"
};

export type ModelProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "groq"
  | "cartesia"
  | "deepgram"
  | "elevenlabs"
  | "azure"
  | "minimax";

export interface ModelConfig {
  provider: ModelProvider;
  modelName: string;
  apiKey?: string;
  baseURL?: string;
}

export interface TranscriptionConfig extends ModelConfig {
  format?: "wav" | "webm";
  language?: string;
  encoding?: string;
  sampleRate?: number;
  inputType?: "raw" | "container";
}

// Transcription Model Configurations
export const transcriptionConfigs: Record<string, TranscriptionConfig> = {
  groq: {
    provider: "groq",
    modelName: "whisper-large-v3",
    apiKey: process.env.GROQ_API_KEY,
    format: (process.env.GROQ_TRANSCRIPTION_FORMAT as "wav" | "webm") || "wav",
    inputType: "container"
  }
};

export interface TextToSpeechConfig extends ModelConfig {
  voiceId?: string;
  groupId?: string; // Add Group ID for MiniMax
}

// Text-to-Speech Model Configurations
export const ttsConfigs: Record<string, TextToSpeechConfig> = {
  groq: {
    provider: "groq",
    modelName: "playai-tts",
    apiKey: process.env.GROQ_API_KEY,
    voiceId: process.env.GROQ_VOICE_ID
  },
  cartesia: {
    provider: "cartesia",
    modelName: "sonic-english",
    apiKey: process.env.CARTESIA_API_KEY,
    voiceId: process.env.CARTESIA_VOICE_ID
  },
  deepgram: {
    provider: "deepgram",
    modelName: "aura-2-iris-en",
    apiKey: process.env.DEEPGRAM_API_KEY
  },
  elevenlabs: {
    provider: "elevenlabs",
    modelName: process.env.ELEVENLABS_MODEL_NAME || "eleven_multilingual_v2",
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID
  },
  azure: {
    provider: "azure",
    modelName: "azure-tts",
    apiKey: process.env.AZURE_SPEECH_API_KEY,
    voiceId: process.env.AZURE_TTS_VOICE_ID || "en-GB-OllieMultilingualNeural"
  },
  minimax: {
    provider: "minimax",
    modelName: process.env.MINIMAX_TTS_MODEL || "speech-02-hd",
    apiKey: process.env.MINIMAX_API_KEY,
    voiceId: process.env.MINIMAX_VOICE_ID,
    groupId: process.env.MINIMAX_GROUP_ID,
    baseURL: "https://api.minimaxi.chat"
  }
};

// Agent-core Configuration
export interface AgentCoreConfig {
  baseURL: string;
  streamTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

export const agentCoreConfig: AgentCoreConfig = {
  baseURL:
    process.env.NEXT_PUBLIC_AGENT_CORE_API || "http://localhost:3030/api/v1",
  streamTimeout: parseInt(process.env.AGENT_CORE_STREAM_TIMEOUT || "30000"),
  maxRetries: parseInt(process.env.AGENT_CORE_MAX_RETRIES || "3"),
  retryDelay: parseInt(process.env.AGENT_CORE_RETRY_DELAY || "1000")
};
