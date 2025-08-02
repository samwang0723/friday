export interface Message {
  role: "user" | "assistant";
  content: string;
  latency?: number;
}

export interface ChatState {
  isStreaming: boolean;
  message: string;
  input: string;
  agentCoreInitialized: boolean;
  transcript?: string;
  status?: string;
  streamPhase?: "transcript" | "text" | "audio" | "completing" | "completed";
  audioPlayerReady?: boolean;
}

export interface LocaleState {
  clientLocale: string;
  isInitialized: boolean;
}

export interface RequestState {
  currentController: AbortController | null;
  isProcessing: boolean;
}

export interface StreamingState {
  buffer: string;
  accumulatedText: string;
  displayedText: string;
  textQueue: string;
  typingIntervalId: number | null;
  finalLatency: number;
  firstPacketLatency: number;
  firstPacketReceived: boolean;
  audioStreamStarted: boolean;
  audioStreamClosed: boolean;
}

export interface AudioChunkData {
  index: number;
  chunk: Uint8Array;
}

export interface SSEventData {
  eventType: string;
  eventData: string;
}

export interface TextEventData {
  content: string;
}

export interface AudioEventData {
  chunk: string;
  index?: number;
}

export interface CompleteEventData {
  fullText: string;
}

export interface ErrorEventData {
  message: string;
}

export interface TranscriptEventData {
  content: string;
}

export interface StatusEventData {
  message: string;
}

export interface VoiceRealtimeEvent {
  type: "transcript" | "text" | "audio" | "complete" | "status" | "error";
  transcript?: string;
  text?: string;
  audioChunk?: ArrayBuffer;
  index?: number;
  fullText?: string;
  message?: string;
  metadata?: any;
}

export type ChatSubmissionData = string | Blob | { transcript: string };

export interface VoiceChatConfig {
  typingAnimationDelay: number;
  audioStreamCloseDelay: number;
  messageQueueDelay: number;
  vadRestartDelay: number;
}

export interface VoiceChatHookReturn {
  messages: Message[];
  submit: (data: ChatSubmissionData) => void;
  isPending: boolean;
  chatState: ChatState;
  updateChatState: (updates: Partial<ChatState>) => void;
  stopCurrentRequest: () => void;
  resetMessages: () => void;
  player?: any; // Audio player instance
}

export interface LocaleManagerHookReturn {
  clientLocale: string;
  getCurrentLocale: () => string;
  isLocaleInitialized: boolean;
}

export interface RequestManagerHookReturn {
  currentController: AbortController | null;
  createNewRequest: () => AbortController;
  cancelCurrentRequest: () => void;
  isProcessing: boolean;
}

export interface StreamingProcessorHookReturn {
  processSSEStream: (
    response: Response,
    onTextUpdate: (text: string) => void,
    onAudioChunk: (chunk: ArrayBuffer) => void,
    onStreamComplete: (finalText: string, latency: number) => void,
    onError: (error: Error) => void,
    submittedAt: number,
    onTranscript?: (transcript: string) => void,
    onStatus?: (status: string) => void
  ) => Promise<void>;
  stopTypingAnimation: () => void;
  getProcessorState: () => StreamingState | null;
  isProcessorActive: () => boolean;
}

export interface ErrorTranslationMap {
  [key: string]: string;
}

export interface VoiceChatServiceConfig {
  apiEndpoint: string;
  timeout: number;
}

export interface SubmissionPayload {
  formData: FormData;
  headers: HeadersInit;
  signal: AbortSignal;
}

export interface ResponseTypeHandlers {
  single: (
    response: Response,
    userMessage: Message,
    submittedAt: number
  ) => Promise<Message[]>;
  "text-only": (
    response: Response,
    userMessage: Message,
    submittedAt: number
  ) => Promise<Message[]>;
  streaming: (
    response: Response,
    userMessage: Message,
    submittedAt: number
  ) => Promise<Message[]>;
}

export interface NotificationHandlersHookReturn {
  handleEmailNotification: (
    data: import("@/lib/types/pusher").EmailNotificationData
  ) => void;
  handleCalendarUpcoming: (
    data: import("@/lib/types/pusher").CalendarEventData
  ) => void;
  handleCalendarNew: (
    data: import("@/lib/types/pusher").CalendarEventData
  ) => void;
  handleSystemNotification: (
    data: import("@/lib/types/pusher").SystemNotificationData
  ) => void;
  handleChatMessage: (
    data: import("@/lib/types/pusher").ChatMessageData
  ) => void;
  processMessageQueue: () => Promise<void>;
}

export interface KeyboardShortcutsConfig {
  isAuthenticated: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  updateChatState: (updates: Partial<ChatState>) => void;
}

export interface VoiceChatInterfaceProps {
  isAuthenticated: boolean;
  authLoading: boolean;
  chatState: ChatState;
  messages: Message[];
  vadState: any;
  settings: any;
  settingsLoaded: boolean;
  onChatSubmit: (data: ChatSubmissionData) => void;
  onSettingsChange: (settings: any) => void;
  onLogout: () => Promise<void>;
  onClearHistory: () => Promise<void>;
}

export interface AuthenticatedLayoutProps {
  children: React.ReactNode;
  pusherStatus: import("@/lib/types/pusher").ConnectionStatus;
  pusherStatusText: string;
  onNotificationClick: () => void;
}

export interface ChatInterfaceProps {
  isAuthenticated: boolean;
  isSettingsOpen: boolean;
  input: string;
  isPending: boolean;
  isStreaming: boolean;
  currentMessage: string;
  messages: Message[];
  vadState: any;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export interface NotificationSystemProps {
  isAuthenticated: boolean;
  pusherStatus: import("@/lib/types/pusher").ConnectionStatus;
  pusherStatusText: string;
  onNotificationClick: () => void;
}
