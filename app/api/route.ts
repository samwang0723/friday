import { AgentCoreService } from "@/lib/agentCore";
import { headers } from "next/headers";
import { z } from "zod";
import { zfd } from "zod-form-data";

const agentCore = new AgentCoreService();

// Request manager to track active requests per bearer token
class RequestManager {
  private activeRequests = new Map<string, AbortController>();

  /**
   * Creates a new abort controller for the given token and cancels any existing request
   * @param token - Bearer token to track requests for
   * @returns AbortController for the new request
   */
  createRequest(token: string): AbortController {
    // Cancel any existing request for this token
    const existingController = this.activeRequests.get(token);
    if (existingController) {
      console.debug(
        `RequestManager: Cancelling previous request for token: ${token.slice(0, 10)}...`
      );
      existingController.abort();

      // Log the state to help debug cancellation issues
      console.debug(
        `RequestManager: Previous request aborted. Signal state: ${existingController.signal.aborted}`
      );
    }

    // Create new controller for this request
    const controller = new AbortController();
    this.activeRequests.set(token, controller);

    console.debug(
      `RequestManager: Created new request for token: ${token.slice(0, 10)}...`
    );

    return controller;
  }

  /**
   * Cleanup completed request from tracking
   * @param token - Bearer token to cleanup
   */
  completeRequest(token: string): void {
    const wasActive = this.activeRequests.has(token);
    this.activeRequests.delete(token);
    console.debug(
      `RequestManager: Completed request cleanup for token: ${token.slice(0, 10)}... (was active: ${wasActive})`
    );
  }

  /**
   * Check if a request is still active (not cancelled)
   * @param token - Bearer token to check
   * @returns boolean indicating if request is active
   */
  isRequestActive(token: string): boolean {
    const controller = this.activeRequests.get(token);
    return controller ? !controller.signal.aborted : false;
  }
}

// Global request manager instance
const requestManager = new RequestManager();

const schema = zfd
  .formData({
    input: z.union([zfd.text(), zfd.file()]).optional(),
    message: zfd.repeatableOfType(
      zfd.json(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string()
        })
      )
    ),
    settings: zfd
      .json(
        z.object({
          sttEngine: z.string(),
          ttsEngine: z.string(),
          audioEnabled: z.boolean().optional()
        })
      )
      .optional()
  })
  .refine(data => data.input !== undefined, {
    message: "Data input must be provided"
  });

export async function POST(request: Request) {
  console.time("transcribe " + request.headers.get("x-vercel-id") || "local");

  // Log the Authorization header
  const authHeader = request.headers.get("Authorization");
  let accessToken: string | null = null;

  if (authHeader) {
    console.log("Authorization header received:");

    // Extract Bearer token
    if (authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.substring(7);
    }
  } else {
    console.log("No Authorization header found");
    return new Response("Authorization required", { status: 401 });
  }

  if (!accessToken) {
    return new Response("Valid Bearer token required", { status: 401 });
  }

  // Create abort controller for this entire request and cancel any previous ones
  const abortController = requestManager.createRequest(accessToken);

  // Ensure cleanup happens regardless of how the request ends
  const cleanup = () => {
    console.debug(
      `Main: Cleaning up request for token: ${accessToken.slice(0, 10)}...`
    );
    requestManager.completeRequest(accessToken);
  };

  try {
    const formData = await request.formData();
    console.log("FormData entries:");
    for (const [key, value] of formData.entries()) {
      console.log(`  ${key}:`, value);
    }

    const { data, success, error } = schema.safeParse(formData);
    if (!success) {
      console.log("Schema validation failed:", error);
      return new Response("Invalid request", { status: 400 });
    }

    // Get settings with defaults
    const settings = data.settings || {
      sttEngine: "groq",
      ttsEngine: "elevenlabs",
      audioEnabled: true
    };

    console.log("Using settings:", settings);

    // Check if request was cancelled during form parsing
    if (abortController.signal.aborted) {
      console.log("Main: Request cancelled during form parsing");
      return new Response("Request cancelled", { status: 200 });
    }

    // Check if request was cancelled during transcription
    if (abortController.signal.aborted) {
      console.log("Main: Request cancelled during transcription");
      return new Response("Request cancelled", { status: 200 });
    }

    console.timeEnd(
      "transcribe " + request.headers.get("x-vercel-id") || "local"
    );
    console.time(
      "streaming completion " + request.headers.get("x-vercel-id") || "local"
    );

    // Use Agent Core streaming service
    const requestHeaders = await headers();
    const acceptLanguage = requestHeaders.get("accept-language");

    // Extract the primary locale from accept-language header
    const locale = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim();

    const clientContext = {
      timezone:
        requestHeaders.get("x-vercel-ip-timezone") ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      clientDatetime: new Date().toISOString(),
      locale: locale
    };

    // Create SSE response stream for voice realtime
    const sseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let isControllerClosed = false;
        let currentTranscript = "";
        const responseHeaders: Record<string, string> = {};

        // Listen for abort signal
        abortController.signal.addEventListener("abort", () => {
          console.debug(
            "Voice SSE: Abort signal received, marking controller as closed"
          );
          isControllerClosed = true;
        });

        // Safe enqueue helper
        const safeEnqueue = (data: Uint8Array): boolean => {
          if (isControllerClosed || abortController.signal.aborted) {
            console.debug(
              "Voice SSE: Skipping enqueue - controller closed or request aborted"
            );
            return false;
          }

          try {
            if (!controller || typeof controller.enqueue !== "function") {
              console.debug(
                "Voice SSE: Controller is invalid, marking as closed"
              );
              isControllerClosed = true;
              return false;
            }

            controller.enqueue(data);
            return true;
          } catch (error: any) {
            if (
              error?.code === "ERR_INVALID_STATE" ||
              error?.message?.includes("Controller is already closed") ||
              error?.message?.includes("already been closed")
            ) {
              console.debug(
                "Voice SSE: Controller closed error detected:",
                error?.message
              );
              isControllerClosed = true;
              return false;
            }

            console.debug(
              "Voice SSE: Controller enqueue failed:",
              error?.message || error
            );
            isControllerClosed = true;
            return false;
          }
        };

        // Safe close helper
        const safeClose = () => {
          if (isControllerClosed) {
            console.debug(
              "Voice SSE: Controller already closed, skipping close"
            );
            return;
          }

          try {
            if (controller && typeof controller.close === "function") {
              console.debug("Voice SSE: Closing controller");
              controller.close();
            }
            isControllerClosed = true;
          } catch (error: any) {
            if (
              error?.code === "ERR_INVALID_STATE" ||
              error?.message?.includes("Controller is already closed") ||
              error?.message?.includes("already been closed")
            ) {
              console.debug(
                "Voice SSE: Controller was already closed during close attempt"
              );
              isControllerClosed = true;
              return;
            }

            console.debug(
              "Voice SSE: Controller close failed:",
              error?.message || error
            );
            isControllerClosed = true;
          }
        };

        // Helper function to format events as SSE - reusable for both text and voice
        const formatEventAsSSE = (event: {
          type: string;
          [key: string]: any;
        }): string => {
          let sseEvent = "";

          switch (event.type) {
            case "transcript":
              currentTranscript = event.transcript || "";
              console.log(
                "Received transcript from AgentCore:",
                currentTranscript
              );

              // Store transcript for response header
              if (currentTranscript) {
                responseHeaders["X-Transcript"] =
                  encodeURIComponent(currentTranscript);
              }

              sseEvent = `event: transcript\ndata: ${JSON.stringify({
                data: event.transcript
              })}\n\n`;
              break;

            case "text":
              sseEvent = `event: text\ndata: ${JSON.stringify({
                data: event.text
              })}\n\n`;
              break;

            case "audio":
              if (event.audioChunk) {
                // Convert ArrayBuffer to base64
                const base64Audio = Buffer.from(event.audioChunk).toString(
                  "base64"
                );
                sseEvent = `event: audio\ndata: ${JSON.stringify({
                  data: base64Audio,
                  index: event.index || 0
                })}\n\n`;
              }
              break;

            case "complete":
              sseEvent = `event: complete\ndata: ${JSON.stringify({
                fullText: event.fullText
              })}\n\n`;
              break;

            case "status":
              sseEvent = `event: status\ndata: ${JSON.stringify({
                message: event.message || "Status update"
              })}\n\n`;
              break;

            case "error":
              sseEvent = `event: error\ndata: ${JSON.stringify({
                message: event.message || "Stream error"
              })}\n\n`;
              break;
          }

          return sseEvent;
        };

        try {
          // Detect input type and route accordingly
          if (!data.input) {
            console.error("No input provided");
            const errorEvent = `event: error\ndata: ${JSON.stringify({
              message: "Input is required"
            })}\n\n`;
            safeEnqueue(encoder.encode(errorEvent));
            safeClose();
            return;
          }

          // Handle text input using chatStream
          if (typeof data.input === "string") {
            console.debug("Text SSE: Processing text input:", data.input);

            // Use AgentCore chat streaming for text-only input
            const chatStream = agentCore.chatStream(
              data.input,
              accessToken as string,
              clientContext,
              abortController.signal
            );

            console.debug("Text SSE: chatStream created successfully");

            // Process chat stream events
            let eventCount = 0;
            for await (const event of chatStream) {
              eventCount++;

              console.debug(
                `Text SSE: Received chunk #${eventCount}:`,
                event.type,
                event
              );

              if (abortController.signal.aborted || isControllerClosed) {
                console.debug(
                  "Text SSE: Text streaming interrupted - abort signal or controller closed"
                );
                break;
              }

              // Use reusable event formatting function
              const sseEvent = formatEventAsSSE(event);

              if (sseEvent && !safeEnqueue(encoder.encode(sseEvent))) {
                console.debug(
                  "Text SSE: Text streaming stopped - failed to enqueue"
                );
                break;
              }

              // Exit after complete or error events
              if (event.type === "complete" || event.type === "error") {
                break;
              }
            }
            console.debug(
              `Text SSE: Text streaming completed after ${eventCount} chunks`
            );
            if (eventCount === 0) {
              console.error(
                "Text SSE: No chunks received from agentCore.chatStream!"
              );
            }
            safeClose();

            // Clean up request tracking after stream completion
            cleanup();
            return;
          }

          // Handle file input for voice streaming
          if (!(data.input instanceof File)) {
            console.error(
              "Invalid input type for voice streaming, got:",
              typeof data.input
            );
            const errorEvent = `event: error\ndata: ${JSON.stringify({
              message: "File input required for voice streaming"
            })}\n\n`;
            safeEnqueue(encoder.encode(errorEvent));
            safeClose();
            return;
          }

          // Use AgentCore voice streaming
          console.debug(
            "Voice SSE: Creating voiceStream with settings:",
            settings
          );
          console.debug(
            "Voice SSE: Input file size:",
            data.input.size,
            "bytes"
          );

          const voiceStream = agentCore.voiceStream(
            data.input,
            settings.ttsEngine as "cartesia" | "elevenlabs" | "cartesiachinese",
            accessToken as string,
            clientContext,
            abortController.signal,
            {
              audioEnabled: settings.audioEnabled,
              includeText: true,
              includeMetadata: true
            }
          );

          console.debug("Voice SSE: voiceStream created successfully");

          // Process voice stream events
          console.debug("Voice SSE: Starting to iterate over voiceStream");

          let eventCount = 0;
          for await (const event of voiceStream) {
            eventCount++;
            console.debug(
              `Voice SSE: Received event #${eventCount}:`,
              event.type,
              event
            );

            if (abortController.signal.aborted || isControllerClosed) {
              console.debug(
                "Voice SSE: Voice streaming interrupted - abort signal or controller closed"
              );
              break;
            }

            // Use reusable event formatting function
            const sseEvent = formatEventAsSSE(event);

            if (sseEvent && !safeEnqueue(encoder.encode(sseEvent))) {
              console.debug(
                "Voice SSE: Voice streaming stopped - failed to enqueue"
              );
              break;
            }

            // Exit after complete or error events
            if (event.type === "complete" || event.type === "error") {
              break;
            }
          }

          console.debug(
            `Voice SSE: Voice streaming completed after ${eventCount} events`
          );
          if (eventCount === 0) {
            console.error(
              "Voice SSE: No events received from agentCore.voiceStream!"
            );
          }
          safeClose();

          // Clean up request tracking after stream completion
          cleanup();
        } catch (error) {
          console.debug(
            "Voice SSE: Error in voice streaming pipeline:",
            error instanceof Error ? error.message : error
          );

          // Send error event only if controller is still open
          if (!isControllerClosed && !abortController.signal.aborted) {
            const errorEvent = `event: error\ndata: ${JSON.stringify({
              message: error instanceof Error ? error.message : "Unknown error"
            })}\n\n`;
            safeEnqueue(encoder.encode(errorEvent));
          }
          safeClose();
          cleanup();
        }
      }
    });

    // Build response headers based on input type
    const finalResponseHeaders: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    };

    // Set response type based on input
    if (data.input && typeof data.input === "string") {
      finalResponseHeaders["X-Response-Type"] = "text-stream";
      finalResponseHeaders["X-Input-Type"] = "text";
    } else {
      finalResponseHeaders["X-Response-Type"] = "voice-realtime-stream";
      finalResponseHeaders["X-Input-Type"] = "audio";
    }

    // Return response - cleanup will be handled by stream controller
    return new Response(sseStream, {
      headers: finalResponseHeaders
    });
  } catch (error) {
    // Clean up the request from tracking if it failed
    cleanup();

    // Handle AbortError specifically (when request was cancelled)
    if (error instanceof Error && error.name === "AbortError") {
      console.debug("Main: Request was cancelled by newer request");
      return new Response("Request cancelled", { status: 200 });
    }

    console.error("Request failed:", error);
    return new Response("Request failed", { status: 500 });
  }
}
