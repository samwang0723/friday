/**
 * Simplified Agent Core Service
 * Direct API calls without complex retry logic and abstractions
 */

import { agentCoreConfig } from "@/config";

// AgentCore supported locales (backend constraint)
const AGENT_CORE_SUPPORTED_LOCALES = [
  "en",
  "es",
  "fr",
  "zh",
  "ja",
  "ko"
] as const;
type AgentCoreLocale = (typeof AGENT_CORE_SUPPORTED_LOCALES)[number];

// Map client locales to AgentCore supported locales
function mapToAgentCoreLocale(locale?: string): AgentCoreLocale | undefined {
  if (!locale) return undefined;

  // Direct mapping for supported locales
  if (AGENT_CORE_SUPPORTED_LOCALES.includes(locale as AgentCoreLocale)) {
    return locale as AgentCoreLocale;
  }

  // Map variants to base locales
  if (locale.startsWith("zh")) return "zh";

  // Default to undefined for unsupported locales
  return undefined;
}

export interface ChatResponse {
  response: string;
}

export interface VoiceStreamResponse {
  transcript?: string;
  text?: string;
  audioChunk?: ArrayBuffer;
  index?: number;
  fullText?: string;
  type: "transcript" | "text" | "audio" | "complete" | "error" | "status";
  message?: string; // For error and status events
  metadata?: any; // For metadata when include_metadata=true
}

export interface ClientContext {
  timezone?: string;
  clientDatetime?: string;
  locale?: string;
}

export class AgentCoreService {
  private baseURL: string;
  private streamTimeout: number;
  private onLogout?: () => void;

  constructor(onLogout?: () => void) {
    this.baseURL = agentCoreConfig.baseURL;
    this.streamTimeout = agentCoreConfig.streamTimeout;
    this.onLogout = onLogout;
    console.info(
      `Initialized Agent-Core Engine with base URL: ${this.baseURL}`
    );
  }

  private getHeaders(
    token?: string,
    timezone?: string,
    clientDatetime?: string,
    locale?: string,
    isMultipart?: boolean
  ): Record<string, string> {
    console.log("getHeaders called with:", {
      token: !!token,
      timezone,
      clientDatetime,
      locale,
      isMultipart
    });

    const headers: Record<string, string> = {
      Accept: "application/json"
    };

    // Only set Content-Type for non-multipart requests
    if (!isMultipart) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (timezone) {
      headers["X-Client-Timezone"] = timezone;
    }

    if (clientDatetime) {
      headers["X-Client-Datetime"] = clientDatetime;
    }

    if (locale) {
      const mappedLocale = mapToAgentCoreLocale(locale);
      console.log("Original locale:", locale, "Mapped locale:", mappedLocale);
      if (mappedLocale) {
        headers["X-Locale"] = mappedLocale;
        console.log("X-Locale header added:", mappedLocale);
      } else {
        console.log("No mapped locale, X-Locale header not added");
      }
    } else {
      console.log("No locale provided to getHeaders");
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      if (response.status === 401) {
        console.warn("Received 401 Unauthorized - triggering logout");
        this.onLogout?.();
      }
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      console.error("Failed to parse JSON response:", error);
      throw new Error("Invalid JSON response from server");
    }
  }

  async initChat(token: string, context?: ClientContext): Promise<void> {
    try {
      console.info("Initializing agent-core chat session");

      const response = await fetch(`${this.baseURL}/chat/init`, {
        method: "POST",
        headers: this.getHeaders(
          token,
          context?.timezone,
          context?.clientDatetime,
          context?.locale
        ),
        body: JSON.stringify({})
      });

      await this.handleResponse(response);
      console.info("Agent-core chat session initialized successfully");
    } catch (error) {
      console.error("Failed to initialize agent-core chat:", error);
      throw error;
    }
  }

  async chat(
    message: string,
    token: string,
    context?: ClientContext
  ): Promise<ChatResponse> {
    try {
      console.info("Sending message to agent-core chat");

      const response = await fetch(`${this.baseURL}/chat`, {
        method: "POST",
        headers: this.getHeaders(
          token,
          context?.timezone,
          context?.clientDatetime,
          context?.locale
        ),
        body: JSON.stringify({
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: message
              }
            ]
          }
        })
      });

      return await this.handleResponse<ChatResponse>(response);
    } catch (error) {
      console.error("Failed to send message to agent-core:", error);
      throw error;
    }
  }

  async *chatStream(
    message: string,
    token: string,
    context?: ClientContext,
    externalAbort?: AbortSignal
  ): AsyncGenerator<string> {
    try {
      console.info("Starting agent-core chat stream");

      // Create local AbortController for timeout management
      const controller = new AbortController();
      let timeoutId: NodeJS.Timeout | null = null;

      // Set up external cancellation support
      if (externalAbort) {
        if (externalAbort.aborted) {
          console.info(
            "External abort signal already triggered, cancelling stream"
          );
          return;
        }
        externalAbort.addEventListener("abort", () => {
          console.info("External abort signal received, cancelling stream");
          controller.abort();
        });
      }

      // Set up timeout
      timeoutId = setTimeout(() => {
        console.warn(`Stream timeout after ${this.streamTimeout}ms, aborting`);
        controller.abort();
      }, this.streamTimeout);

      const headers = this.getHeaders(
        token,
        context?.timezone,
        context?.clientDatetime,
        context?.locale
      );
      headers["Accept"] = "text/event-stream";
      headers["Cache-Control"] = "no-cache";

      const response = await fetch(`${this.baseURL}/chat/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: message
              }
            ]
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.warn(
            "Received 401 Unauthorized in stream - triggering logout"
          );
          this.onLogout?.();
        }
        await this.handleResponse(response);
      }

      if (!response.body) {
        throw new Error("No response body received");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages (separated by double newlines)
          const messages = buffer.split("\n\n");
          buffer = messages.pop() || ""; // Keep incomplete message in buffer

          for (const message of messages) {
            if (!message.trim()) continue;

            const lines = message.split("\n");
            let data = "";
            let eventType = "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                data = line.slice(6);
              } else if (line.startsWith("event: ")) {
                eventType = line.slice(7);
              }
            }

            // Handle different event types
            if (eventType === "error") {
              throw new Error(`Stream error: ${data}`);
            }

            if (data === "[DONE]") {
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              return;
            }

            if (data && data !== "") {
              try {
                // Try to parse as JSON first
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  yield parsed.text;
                } else if (typeof parsed === "string") {
                  yield parsed;
                }
              } catch {
                // If not JSON, yield as plain text
                yield data;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      const err = error as Error;

      // Handle AbortError specifically
      if (err.name === "AbortError") {
        if (externalAbort?.aborted) {
          console.info("Stream cancelled by external abort signal");
        } else {
          console.info("Stream cancelled due to timeout");
        }
        return; // Gracefully exit without throwing
      }

      console.error("Agent-core chat stream failed:", error);
      throw error;
    }
  }

  async *voiceStream(
    audioFile: File,
    ttsEngine: "cartesia" | "elevenlabs" | "minimax",
    token: string,
    context?: ClientContext,
    externalAbort?: AbortSignal,
    settings?: {
      audioEnabled?: boolean;
      streaming?: boolean;
      includeText?: boolean;
      textFormat?: string;
      includeMetadata?: boolean;
    }
  ): AsyncGenerator<VoiceStreamResponse> {
    try {
      // Create local AbortController for timeout management
      const controller = new AbortController();
      let timeoutId: NodeJS.Timeout | null = null;

      // Set up external cancellation support
      if (externalAbort) {
        if (externalAbort.aborted) {
          return;
        }
        externalAbort.addEventListener("abort", () => {
          controller.abort();
        });
      }

      // Set up timeout
      timeoutId = setTimeout(() => {
        console.warn(
          `Voice stream timeout after ${this.streamTimeout}ms, aborting`
        );
        controller.abort();
      }, this.streamTimeout);

      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("engine", ttsEngine); // Changed from 'ttsEngine' to 'engine' per spec

      if (settings) {
        formData.append("settings", JSON.stringify(settings));
      }

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (settings?.includeText !== undefined) {
        queryParams.append("include_text", settings.includeText.toString());
      }
      if (settings?.textFormat) {
        queryParams.append("text_format", settings.textFormat);
      }
      if (settings?.includeMetadata !== undefined) {
        queryParams.append(
          "include_metadata",
          settings.includeMetadata.toString()
        );
      }

      const queryString = queryParams.toString();
      const url = `${this.baseURL}/voice/realtime${queryString ? `?${queryString}` : ""}`;

      const headers = this.getHeaders(
        token,
        context?.timezone,
        context?.clientDatetime,
        context?.locale,
        true // isMultipart = true
      );
      headers["Accept"] = "text/event-stream";
      headers["Cache-Control"] = "no-cache";

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.warn(
            "Received 401 Unauthorized in voice stream - triggering logout"
          );
          this.onLogout?.();
        }
        console.error("AgentCore: Non-ok response, calling handleResponse");
        await this.handleResponse(response);
      }

      if (!response.body) {
        throw new Error("No response body received");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          chunkCount++;
          console.log(
            `AgentCore: Read chunk #${chunkCount}, done: ${done}, valueLength: ${value?.length}`
          );

          if (done) {
            console.log(`AgentCore: Stream done after ${chunkCount} chunks`);
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages (separated by double newlines)
          const messages = buffer.split("\n\n");
          buffer = messages.pop() || ""; // Keep incomplete message in buffer

          for (const message of messages) {
            if (!message.trim()) continue;

            const lines = message.split("\n");
            let data = "";
            let eventType = "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                data = line.slice(6);
              } else if (line.startsWith("event: ")) {
                eventType = line.slice(7);
              }
            }

            // If no explicit event type, try to extract from JSON data
            if (!eventType && data) {
              try {
                const parsed = JSON.parse(data);
                eventType = parsed.type;
              } catch (parseError) {
                console.log(
                  "Could not parse data to extract type:",
                  parseError
                );
              }
            }

            // Skip keep-alive and empty events
            if (data === "keep-alive" || !data) {
              console.log("Skipping keep-alive or empty event");
              continue;
            }

            // Handle different event types
            if (eventType === "error") {
              try {
                const errorData = JSON.parse(data);
                yield {
                  type: "error",
                  message: errorData.message || "Voice stream error"
                };
                throw new Error(
                  `Voice stream error: ${errorData.message || data}`
                );
              } catch {
                yield {
                  type: "error",
                  message: "Voice stream error"
                };
                throw new Error(`Voice stream error: ${data}`);
              }
            }

            if (data === "[DONE]") {
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              return;
            }

            if (data && data !== "") {
              try {
                const parsed = JSON.parse(data);

                if (eventType === "transcript") {
                  yield {
                    type: "transcript",
                    transcript:
                      parsed.data || parsed.content || parsed.transcript,
                    metadata: parsed.metadata
                  };
                } else if (eventType === "text") {
                  yield {
                    type: "text",
                    text: parsed.data || parsed.content || parsed.text,
                    metadata: parsed.metadata
                  };
                } else if (eventType === "audio") {
                  // Decode base64 audio chunk
                  if (parsed.data || parsed.chunk) {
                    const audioBuffer = Uint8Array.from(
                      atob(parsed.data || parsed.chunk),
                      c => c.charCodeAt(0)
                    ).buffer;
                    yield {
                      type: "audio",
                      audioChunk: audioBuffer,
                      index: parsed.index,
                      metadata: parsed.metadata
                    };
                  }
                } else if (eventType === "status") {
                  yield {
                    type: "status",
                    message: parsed.message || parsed.status,
                    metadata: parsed.metadata
                  };
                } else if (eventType === "complete") {
                  yield {
                    type: "complete",
                    fullText: parsed.fullText,
                    metadata: parsed.metadata
                  };
                  if (timeoutId) {
                    clearTimeout(timeoutId);
                  }
                  return;
                }
              } catch (parseError) {
                console.warn(
                  "Failed to parse voice stream data:",
                  parseError,
                  data
                );
                // Continue processing other messages instead of failing
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      const err = error as Error;

      // Handle AbortError specifically
      if (err.name === "AbortError") {
        if (externalAbort?.aborted) {
          console.info("Voice stream cancelled by external abort signal");
        } else {
          console.info("Voice stream cancelled due to timeout");
        }
        return; // Gracefully exit without throwing
      }

      console.error("Agent-core voice stream failed:", error);
      throw error;
    }
  }

  async clearHistory(token: string, context?: ClientContext): Promise<void> {
    try {
      console.info("Clearing agent-core chat history");
      const headers = this.getHeaders(
        token,
        context?.timezone,
        context?.clientDatetime,
        context?.locale
      );
      const response = await fetch(`${this.baseURL}/chat/history`, {
        method: "DELETE",
        headers
      });

      await this.handleResponse(response);
      console.info("Agent-core chat history cleared successfully");
    } catch (error) {
      console.error("Failed to clear agent-core chat history:", error);
      throw error;
    }
  }

  async healthCheck(context?: ClientContext): Promise<{ status: string }> {
    try {
      console.info("Performing agent-core health check");

      const response = await fetch(`${this.baseURL}/health`, {
        method: "GET",
        headers: this.getHeaders(
          undefined,
          context?.timezone,
          context?.clientDatetime,
          context?.locale
        )
      });

      return await this.handleResponse<{ status: string }>(response);
    } catch (error) {
      console.error("Agent-core health check failed:", error);
      throw error;
    }
  }
}
