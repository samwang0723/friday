import { headers } from "next/headers";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { after } from "next/server";
import { AgentCoreService } from "@/lib/agentCore";
import { transcribeAudio, synthesizeSpeechStream } from "@/lib/audio";

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
      console.log(
        `Cancelling previous request for token: ${token.slice(0, 10)}...`
      );
      existingController.abort();
    }

    // Create new controller for this request
    const controller = new AbortController();
    this.activeRequests.set(token, controller);

    return controller;
  }

  /**
   * Cleanup completed request from tracking
   * @param token - Bearer token to cleanup
   */
  completeRequest(token: string): void {
    this.activeRequests.delete(token);
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

const schema = zfd.formData({
  input: z.union([zfd.text(), zfd.file()]),
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
        streaming: z.boolean().optional() // Add streaming support
      })
    )
    .optional()
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

  try {
    const { data, success } = schema.safeParse(await request.formData());
    if (!success) return new Response("Invalid request", { status: 400 });

    // Get settings with defaults
    const settings = data.settings || {
      sttEngine: "groq",
      ttsEngine: "elevenlabs",
      streaming: false
    };

    console.log("Using settings:", settings);

    // Check if request was cancelled during form parsing
    if (abortController.signal.aborted) {
      console.log("Request cancelled during form parsing");
      return new Response("Request cancelled", { status: 200 });
    }

    const transcript = await getTranscript(data.input, settings.sttEngine);
    if (!transcript) return new Response("Invalid audio", { status: 400 });

    console.log("Transcript:", transcript);

    // Check if request was cancelled during transcription
    if (abortController.signal.aborted) {
      console.log("Request cancelled during transcription");
      return new Response("Request cancelled", { status: 200 });
    }

    console.timeEnd(
      "transcribe " + request.headers.get("x-vercel-id") || "local"
    );
    console.time(
      "streaming completion " + request.headers.get("x-vercel-id") || "local"
    );

    // Use Agent Core streaming service
    const clientContext = {
      timezone:
        (await headers()).get("x-vercel-ip-timezone") ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      clientDatetime: new Date().toISOString()
    };

    // Always use streaming pipeline with SSE
    console.log("Using real-time streaming pipeline with SSE");

      // Create SSE response stream
      const sseStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let isControllerClosed = false;

          // Listen for abort signal to immediately mark controller as closed
          abortController.signal.addEventListener("abort", () => {
            isControllerClosed = true;
          });

          // Safe enqueue helper that checks controller state and abort signal
          const safeEnqueue = (data: Uint8Array): boolean => {
            // First check if we already know the controller is closed or request is aborted
            if (isControllerClosed || abortController.signal.aborted) {
              return false;
            }

            try {
              // Additional check: try to access controller properties to detect if it's closed
              // This is a more robust way to check controller state
              if (!controller || typeof controller.enqueue !== "function") {
                isControllerClosed = true;
                return false;
              }

              controller.enqueue(data);
              return true;
            } catch (error: any) {
              // Handle specific controller closed errors
              if (
                error?.code === "ERR_INVALID_STATE" ||
                error?.message?.includes("Controller is already closed") ||
                error?.message?.includes("already been closed")
              ) {
                isControllerClosed = true;
                return false;
              }

              // Log other unexpected errors but still mark controller as closed
              console.log(
                "Controller enqueue failed:",
                error?.message || error
              );
              isControllerClosed = true;
              return false;
            }
          };

          // Safe close helper
          const safeClose = () => {
            if (isControllerClosed) {
              return; // Already closed, nothing to do
            }

            try {
              // Check if controller is still valid before closing
              if (controller && typeof controller.close === "function") {
                controller.close();
              }
              isControllerClosed = true;
            } catch (error: any) {
              // Handle specific controller closed errors silently
              if (
                error?.code === "ERR_INVALID_STATE" ||
                error?.message?.includes("Controller is already closed") ||
                error?.message?.includes("already been closed")
              ) {
                isControllerClosed = true;
                return;
              }

              // Log other unexpected errors
              console.log("Controller close failed:", error?.message || error);
              isControllerClosed = true;
            }
          };

          try {
            // Create Agent Core text stream
            const textStream = agentCore.chatStream(
              `
              - User location is ${await location()}.
              - The current time is ${await time()}.
              ${transcript}
              `,
              accessToken as string,
              clientContext,
              abortController.signal
            );

            // Use simplified TTS streaming

            // Create a text accumulator for SSE events
            const textChunks: string[] = [];

            // Create an async generator that emits text via SSE and passes to TTS
            async function* textWithSSE() {
              for await (const chunk of textStream) {
                if (abortController.signal.aborted || isControllerClosed) {
                  break;
                }

                // Store and send text chunk via SSE
                textChunks.push(chunk);
                const textEvent = `event: text\ndata: ${JSON.stringify({
                  content: chunk
                })}\n\n`;

                if (!safeEnqueue(encoder.encode(textEvent))) {
                  break; // Stop if we can't enqueue (controller closed)
                }

                // Pass chunk to TTS
                yield chunk;
              }
            }

            // Create audio stream from text
            const audioStream = synthesizeSpeechStream(
              textWithSSE(),
              settings.ttsEngine,
              abortController.signal
            );

            // Stream audio with buffering for better performance
            const reader = audioStream.getReader();
            const audioBuffer: Uint8Array[] = [];
            const BUFFER_SIZE = 16384; // 16KB buffer
            let currentBufferSize = 0;
            let audioChunkIndex = 0;

            while (true) {
              // Check abort signal and controller state before each iteration
              if (abortController.signal.aborted || isControllerClosed) {
                break;
              }

              const { done, value } = await reader.read();

              if (done) {
                // Send any remaining buffered audio
                if (
                  audioBuffer.length > 0 &&
                  !isControllerClosed &&
                  !abortController.signal.aborted
                ) {
                  const combinedBuffer = new Uint8Array(currentBufferSize);
                  let offset = 0;
                  for (const chunk of audioBuffer) {
                    combinedBuffer.set(chunk, offset);
                    offset += chunk.length;
                  }

                  const audioEvent = `event: audio\ndata: ${JSON.stringify({
                    chunk: Buffer.from(combinedBuffer).toString("base64"),
                    index: audioChunkIndex++
                  })}\n\n`;
                  safeEnqueue(encoder.encode(audioEvent));
                }

                // Send complete event
                if (!isControllerClosed && !abortController.signal.aborted) {
                  const completeEvent = `event: complete\ndata: ${JSON.stringify(
                    {
                      fullText: textChunks.join("")
                    }
                  )}\n\n`;
                  safeEnqueue(encoder.encode(completeEvent));
                }
                break;
              }

              if (
                value &&
                !isControllerClosed &&
                !abortController.signal.aborted
              ) {
                // Buffer audio chunks
                audioBuffer.push(new Uint8Array(value));
                currentBufferSize += value.byteLength;
                // Send buffered audio when buffer is full
                if (currentBufferSize >= BUFFER_SIZE) {
                  const combinedBuffer = new Uint8Array(currentBufferSize);
                  let offset = 0;
                  for (const chunk of audioBuffer) {
                    combinedBuffer.set(chunk, offset);
                    offset += chunk.length;
                  }

                  const audioEvent = `event: audio\ndata: ${JSON.stringify({
                    chunk: Buffer.from(combinedBuffer).toString("base64"),
                    index: audioChunkIndex++
                  })}\n\n`;

                  if (!safeEnqueue(encoder.encode(audioEvent))) {
                    break; // Stop if we can't enqueue (controller closed)
                  }

                  // Clear buffer
                  audioBuffer.length = 0;
                  currentBufferSize = 0;
                }
              }
            }

            safeClose();
          } catch (error) {
            // Send error event only if controller is still open
            if (!isControllerClosed && !abortController.signal.aborted) {
              const errorEvent = `event: error\ndata: ${JSON.stringify({
                message:
                  error instanceof Error ? error.message : "Unknown error"
              })}\n\n`;
              safeEnqueue(encoder.encode(errorEvent));
            }
            safeClose();
          }
        }
      });

      // Clean up the request from tracking since it completed successfully
      requestManager.completeRequest(accessToken);

      console.timeEnd(
        "streaming completion " + request.headers.get("x-vercel-id") || "local"
      );

      console.time("stream " + request.headers.get("x-vercel-id") || "local");
      after(() => {
        console.timeEnd(
          "stream " + request.headers.get("x-vercel-id") || "local"
        );
      });

      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Transcript": encodeURIComponent(transcript),
          "X-Response-Type": "sse-stream"
        }
      });
  } catch (error) {
    // Clean up the request from tracking if it failed
    requestManager.completeRequest(accessToken);

    // Handle AbortError specifically (when request was cancelled)
    if (error instanceof Error && error.name === "AbortError") {
      console.log("Request was cancelled by newer request");
      return new Response("Request cancelled", { status: 200 });
    }

    console.error("Request failed:", error);
    return new Response("Request failed", { status: 500 });
  }
}

async function location() {
  const headersList = await headers();

  const country = headersList.get("x-vercel-ip-country");
  const region = headersList.get("x-vercel-ip-country-region");
  const city = headersList.get("x-vercel-ip-city");

  if (!country || !region || !city) return "unknown";

  return `${city}, ${region}, ${country}`;
}

async function time() {
  const headersList = await headers();
  const timeZone = headersList.get("x-vercel-ip-timezone") || undefined;
  return new Date().toLocaleString("en-US", { timeZone });
}

async function getTranscript(input: string | File, sttEngine: string = "groq") {
  if (typeof input === "string") return input;

  try {
    const transcript = await transcribeAudio(
      Buffer.from(await input.arrayBuffer()),
      sttEngine
    );

    return transcript.trim() || "";
  } catch {
    return null; // Empty audio file
  }
}
