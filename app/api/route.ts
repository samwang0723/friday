import { headers } from "next/headers";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { after } from "next/server";
import { AgentCoreService } from "@/lib/agentCore";
import {
  getTextToSpeechService,
  getTranscriptionService
} from "@/lib/audio/providers";

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

      // Get TTS service and create audio stream directly
      const ttsService = getTextToSpeechService(settings.ttsEngine);

      console.log("Using streaming TTS with text chunks");
      const audioStream = await ttsService.synthesizeStream(
        textStream,
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
