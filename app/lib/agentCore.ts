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

export interface ClientContext {
  timezone?: string;
  clientDatetime?: string;
  locale?: string;
}

export class AgentCoreService {
  private baseURL: string;
  private streamTimeout: number;

  constructor() {
    this.baseURL = agentCoreConfig.baseURL;
    this.streamTimeout = agentCoreConfig.streamTimeout;
    console.info(
      `Initialized Agent-Core Engine with base URL: ${this.baseURL}`
    );
  }

  private getHeaders(
    token?: string,
    timezone?: string,
    clientDatetime?: string,
    locale?: string
  ): Record<string, string> {
    console.log("getHeaders called with:", {
      token: !!token,
      timezone,
      clientDatetime,
      locale
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };

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
        body: JSON.stringify({ message })
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
        body: JSON.stringify({ message }),
        signal: controller.signal
      });

      if (!response.ok) {
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
