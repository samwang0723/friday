import Groq from "groq-sdk";
import { headers } from "next/headers";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { after } from "next/server";
import { AgentCoreService } from "@/lib/agentCore";
import {
  getTextToSpeechService,
  getTranscriptionService
} from "@/lib/audio/providers";
import type { IEnhancedTextToSpeechService } from "@/lib/audio/types";

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

interface StreamingTextToSpeechService {
  synthesizeChunkedStream(
    textChunks: AsyncIterable<string>,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>>;
}

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

    // Use streaming or non-streaming based on settings
    if (settings.streaming) {
      console.log("Using real-time streaming pipeline");

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

      // Get TTS service and create chunked stream
      const ttsService = getTextToSpeechService(settings.ttsEngine);

      // Use enhanced chunked streaming if available
      if (
        "supportsChunkedStreaming" in ttsService &&
        (ttsService as IEnhancedTextToSpeechService).supportsChunkedStreaming()
      ) {
        console.log("Using enhanced chunked streaming");
        const audioStream = await (
          ttsService as IEnhancedTextToSpeechService
        ).synthesizeChunkedStream(textStream, abortController.signal);

        // Clean up the request from tracking since it completed successfully
        requestManager.completeRequest(accessToken);

        console.timeEnd(
          "streaming completion " + request.headers.get("x-vercel-id") ||
            "local"
        );

        console.time("stream " + request.headers.get("x-vercel-id") || "local");
        after(() => {
          console.timeEnd(
            "stream " + request.headers.get("x-vercel-id") || "local"
          );
        });

        return new Response(audioStream, {
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Transcript": encodeURIComponent(transcript),
            "X-Response": "enhanced-streaming" // Indicate this is enhanced streaming
          }
        });
      }

      // Fallback to sentence-based streaming pipeline
      console.log("Using sentence-based streaming pipeline");
      const audioStream = await createRealtimeAudioStream(
        textStream,
        ttsService,
        abortController.signal
      );

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

      return new Response(audioStream, {
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Transcript": encodeURIComponent(transcript),
          "X-Response": "streaming" // Indicate this is a streaming response
        }
      });
    }

    // Non-streaming path (original implementation)
    let accumulatedResponse = "";

    // Stream the response from Agent Core
    for await (const chunk of agentCore.chatStream(
      `
      - User location is ${await location()}.
			- The current time is ${await time()}.
			${transcript}
      `,
      accessToken as string,
      clientContext,
      abortController.signal // Pass abort signal to Agent Core
    )) {
      // Check if request was cancelled during streaming
      if (abortController.signal.aborted) {
        console.log("Request cancelled during Agent Core streaming");
        return new Response("Request cancelled", { status: 200 });
      }
      accumulatedResponse += chunk;
    }

    console.timeEnd(
      "streaming completion " + request.headers.get("x-vercel-id") || "local"
    );

    // Check if request was cancelled after streaming
    if (abortController.signal.aborted) {
      console.log("Request cancelled after Agent Core streaming");
      return new Response("Request cancelled", { status: 200 });
    }

    if (!accumulatedResponse) {
      return new Response("No response from Agent Core", { status: 500 });
    }

    console.time(
      "tts request " + request.headers.get("x-vercel-id") || "local"
    );

    const ttsService = getTextToSpeechService(settings.ttsEngine);

    console.log("Using non-streaming TTS");
    const voice = await ttsService.synthesize(
      accumulatedResponse,
      abortController.signal
    );

    // Clean up the request from tracking since it completed successfully
    requestManager.completeRequest(accessToken);

    console.timeEnd(
      "tts request " + request.headers.get("x-vercel-id") || "local"
    );

    if (!voice.ok) {
      console.error(await voice.text());
      return new Response("Voice synthesis failed", { status: 500 });
    }

    console.time("stream " + request.headers.get("x-vercel-id") || "local");
    after(() => {
      console.timeEnd(
        "stream " + request.headers.get("x-vercel-id") || "local"
      );
    });

    return new Response(voice.body, {
      headers: {
        "X-Transcript": encodeURIComponent(transcript),
        "X-Response": encodeURIComponent(accumulatedResponse)
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

/**
 * Creates a real-time streaming pipeline that processes text chunks immediately
 * and streams audio as it becomes available
 */
async function createRealtimeAudioStream(
  textStream: AsyncIterable<string>,
  ttsService: any,
  abortSignal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let textBuffer = "";
        let chunkIndex = 0;
        const sentenceEnders = [".", "!", "?", "\n"];
        const minFallbackWords = 15; // Minimum words before forced processing
        const paragraphQueue: string[] = [];
        let isProcessing = false;

        // Create a silence buffer for smooth transitions between paragraphs
        const createSilenceBuffer = (durationMs: number): Uint8Array => {
          // Create a minimal MP3 silence frame (approximately 26ms per frame)
          const framesNeeded = Math.ceil(durationMs / 26);
          // MP3 silence frame (mono, 22050 Hz, 32 kbps)
          const silenceFrame = new Uint8Array([
            0xff,
            0xfb,
            0x90,
            0x00, // MP3 header
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00, // Silent data
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00
          ]);

          // Return a buffer with multiple silence frames
          const totalLength = silenceFrame.length * Math.min(framesNeeded, 4); // Cap at ~100ms
          const buffer = new Uint8Array(totalLength);
          for (let i = 0; i < totalLength; i += silenceFrame.length) {
            buffer.set(silenceFrame, i);
          }
          return buffer;
        };

        const processParagraph = async (paragraph: string) => {
          if (!paragraph.trim() || abortSignal?.aborted) return;

          const currentIndex = chunkIndex++;
          try {
            console.log(
              `Processing paragraph ${currentIndex} for TTS: "${paragraph.slice(
                0,
                50
              )}..."`
            );

            // Get audio stream for this paragraph
            const audioStream = await ttsService.synthesizeStream(
              paragraph,
              abortSignal
            );

            // Buffer the complete audio for this paragraph to ensure clean boundaries
            const audioChunks: Uint8Array[] = [];
            const reader = audioStream.getReader();

            try {
              while (true) {
                if (abortSignal?.aborted) {
                  console.log(`Aborting paragraph ${currentIndex} processing`);
                  break;
                }

                const { done, value } = await reader.read();
                if (done) break;

                audioChunks.push(value);
              }

              // Combine all chunks into a single complete audio buffer
              if (audioChunks.length > 0) {
                const totalLength = audioChunks.reduce(
                  (sum, chunk) => sum + chunk.length,
                  0
                );
                const completeAudio = new Uint8Array(totalLength);
                let offset = 0;

                for (const chunk of audioChunks) {
                  completeAudio.set(chunk, offset);
                  offset += chunk.length;
                }

                // Stream the complete paragraph audio as one piece
                console.log(
                  `Streaming complete paragraph ${currentIndex}, size: ${totalLength}`
                );
                controller.enqueue(completeAudio);

                // Add a small silence gap between paragraphs for smooth transitions
                if (!abortSignal?.aborted) {
                  const silenceBuffer = createSilenceBuffer(150); // 150ms silence
                  controller.enqueue(silenceBuffer);
                  console.log(
                    `Added silence buffer after paragraph ${currentIndex}`
                  );
                }
              }

              console.log(`Completed paragraph ${currentIndex} processing`);
            } finally {
              reader.releaseLock();
            }
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              console.log(`Paragraph ${currentIndex} processing was aborted`);
            } else {
              console.error(
                `Error processing paragraph ${currentIndex}:`,
                error
              );
            }
          }
        };

        const processQueue = async () => {
          if (isProcessing || paragraphQueue.length === 0) return;

          isProcessing = true;
          try {
            while (paragraphQueue.length > 0 && !abortSignal?.aborted) {
              const paragraph = paragraphQueue.shift();
              if (paragraph) {
                await processParagraph(paragraph);
              }
            }
          } finally {
            isProcessing = false;
          }
        };

        // Process text chunks as they arrive
        for await (const chunk of textStream) {
          if (abortSignal?.aborted) {
            console.log("Text stream processing aborted");
            break;
          }

          textBuffer += chunk;

          // Enhanced paragraph-based segmentation

          // Check for complete paragraphs ending with sentence enders
          let lastCompleteIndex = -1;
          for (let i = textBuffer.length - 1; i >= 0; i--) {
            if (sentenceEnders.includes(textBuffer[i])) {
              // Found a sentence ender, check if it's followed by whitespace or end of string
              if (i === textBuffer.length - 1 || /\s/.test(textBuffer[i + 1])) {
                lastCompleteIndex = i;
                break;
              }
            }
          }

          if (lastCompleteIndex > -1) {
            // Extract complete paragraph(s)
            const completeParagraph = textBuffer.substring(
              0,
              lastCompleteIndex + 1
            );
            const remainingText = textBuffer.substring(lastCompleteIndex + 1);

            if (completeParagraph.trim()) {
              console.log(
                `Queueing complete paragraph: "${completeParagraph.slice(
                  0,
                  50
                )}..."`
              );
              paragraphQueue.push(completeParagraph.trim());
              // Start processing queue if not already processing
              processQueue();
            }

            textBuffer = remainingText;
          } else {
            // No complete paragraph found, check if we need forced processing
            const wordCount = textBuffer.trim().split(/\s+/).length;
            if (wordCount >= minFallbackWords) {
              // Find the last complete word boundary for forced processing
              const lastSpaceIndex = textBuffer.lastIndexOf(" ");
              if (lastSpaceIndex > 0) {
                const processableText = textBuffer.substring(0, lastSpaceIndex);
                const remainingText = textBuffer.substring(lastSpaceIndex + 1);

                if (processableText.trim()) {
                  console.log(
                    `Queueing long text for processing: "${processableText.slice(
                      0,
                      50
                    )}..."`
                  );
                  paragraphQueue.push(processableText.trim());
                  // Start processing queue if not already processing
                  processQueue();
                }

                textBuffer = remainingText;
              }
            }
          }
        }

        // Process any remaining text
        if (textBuffer.trim() && !abortSignal?.aborted) {
          console.log(
            `Queueing final text chunk: "${textBuffer.slice(0, 50)}..."`
          );
          paragraphQueue.push(textBuffer.trim());
        }

        // Process the final queue and wait for completion
        await processQueue();

        // Wait for any ongoing processing to complete
        while (isProcessing && !abortSignal?.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        console.log("Real-time streaming pipeline completed");
        controller.close();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("Real-time streaming pipeline was aborted");
          controller.close();
        } else {
          console.error("Real-time streaming pipeline failed:", error);
          controller.error(error);
        }
      }
    },
    cancel() {
      console.log("Real-time streaming pipeline was cancelled by client");
    }
  });
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
    const transcriptionService = getTranscriptionService(sttEngine);
    const transcript = await transcriptionService.transcribe(
      Buffer.from(await input.arrayBuffer())
    );

    return transcript.trim() || "";
  } catch {
    return null; // Empty audio file
  }
}
