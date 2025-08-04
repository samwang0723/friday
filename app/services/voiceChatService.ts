import type {
  Message,
  ChatSubmissionData,
  SubmissionPayload,
  ErrorTranslationMap,
  VoiceChatServiceConfig
} from "@/types/voiceChat";
import { getCurrentLocale } from "@/utils/localeUtils";

export class VoiceChatService {
  private config: VoiceChatServiceConfig;

  constructor(config: Partial<VoiceChatServiceConfig> = {}) {
    this.config = {
      apiEndpoint: "/api",
      timeout: 120000, // 2 minutes
      ...config
    };
  }

  public async submitChat(
    data: ChatSubmissionData,
    prevMessages: Message[],
    settings: any,
    accessToken: string | null,
    signal: AbortSignal
  ): Promise<Response> {
    const payload = this.prepareSubmissionPayload(
      data,
      prevMessages,
      settings,
      accessToken,
      signal
    );

    const response = await fetch(this.config.apiEndpoint, {
      method: "POST",
      headers: payload.headers,
      body: payload.formData,
      signal: payload.signal
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response;
  }

  private prepareSubmissionPayload(
    data: ChatSubmissionData,
    prevMessages: Message[],
    settings: any,
    accessToken: string | null,
    signal: AbortSignal
  ): SubmissionPayload {
    const formData = new FormData();
    const headers: HeadersInit = {};

    // Handle different data types
    if (typeof data === "string") {
      if (data === "__reset__") {
        // Special reset case
        formData.append("input", data);
      } else {
        formData.append("input", data);
      }
    } else if (data instanceof Blob) {
      // Determine filename based on blob type
      const filename = data.type === "audio/wav" ? "audio.wav" : "audio.webm";
      formData.append("input", data, filename);
    } else if (data && typeof data === "object" && "transcript" in data) {
      formData.append("transcript", data.transcript);
    } else {
      throw new Error("Invalid data type for chat submission");
    }

    // Add previous messages
    for (const message of prevMessages) {
      formData.append("message", JSON.stringify(message));
    }

    // Add settings
    formData.append("settings", JSON.stringify(settings));

    // Add authorization header
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    // Add locale header
    const currentLocale = getCurrentLocale();
    if (currentLocale) {
      headers["Accept-Language"] = currentLocale;
    }

    return {
      formData,
      headers,
      signal
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    const errorMessage = await response.text();

    switch (status) {
      case 401:
        throw new Error("UNAUTHORIZED");
      case 429:
        throw new Error("TOO_MANY_REQUESTS");
      default:
        throw new Error(errorMessage || "REQUEST_FAILED");
    }
  }

  public extractTranscript(response: Response): string {
    return decodeURIComponent(response.headers.get("X-Transcript") || "");
  }

  public getResponseType(response: Response): string | null {
    return response.headers.get("X-Response-Type");
  }

  public extractResponseText(response: Response): string {
    return decodeURIComponent(response.headers.get("X-Response-Text") || "");
  }

  public async handleSingleResponse(
    response: Response,
    userMessage: Message,
    submittedAt: number,
    onAudioChunk: (chunk: ArrayBuffer) => void
  ): Promise<Message[]> {
    const responseText = this.extractResponseText(response);

    if (!responseText) {
      throw new Error("NO_RESPONSE_TEXT");
    }

    // Play the audio
    const audioArrayBuffer = await response.arrayBuffer();
    onAudioChunk(audioArrayBuffer);

    // Create assistant message
    const assistantMessage: Message = {
      role: "assistant",
      content: responseText,
      latency: Date.now() - submittedAt
    };

    return [userMessage, assistantMessage];
  }

  public async handleTextOnlyResponse(
    response: Response,
    userMessage: Message,
    submittedAt: number
  ): Promise<Message[]> {
    const responseText = this.extractResponseText(response);

    if (!responseText) {
      throw new Error("NO_RESPONSE_TEXT");
    }

    // Create assistant message
    const assistantMessage: Message = {
      role: "assistant",
      content: responseText,
      latency: Date.now() - submittedAt
    };

    return [userMessage, assistantMessage];
  }

  public translateError(
    apiErrorMessage: string,
    t: (key: string) => string
  ): string {
    const errorMap: ErrorTranslationMap = {
      "Invalid audio": t("errors.invalidAudio"),
      "Request cancelled": t("errors.requestCancelled"),
      "Authorization required": t("errors.authRequired"),
      "Valid Bearer token required": t("errors.tokenRequired"),
      "Invalid request": t("errors.invalidRequest"),
      "TTS generation failed": t("errors.ttsGenerationFailed"),
      "Request failed": t("errors.requestFailed"),
      UNAUTHORIZED: t("errors.sessionExpired"),
      TOO_MANY_REQUESTS: t("errors.tooManyRequests"),
      NO_RESPONSE_TEXT: t("errors.noResponse"),
      NO_TRANSCRIPT: t("errors.noTranscript")
    };

    return errorMap[apiErrorMessage] || apiErrorMessage || t("common.error");
  }
}
