import { ElevenLabsClient } from "elevenlabs";
import { ttsConfigs } from "@/config";
import type {
  ITextToSpeechService,
  IEnhancedTextToSpeechService
} from "@/lib/audio/types";
import type { TextToSpeechConfig } from "@/config";

const getElevenLabsClient = (apiKey: string | undefined) => {
  if (!apiKey) {
    console.warn(
      "ELEVENLABS_API_KEY is not set. ElevenLabs services will not be available."
    );
    return null;
  }
  return new ElevenLabsClient({ apiKey });
};

export class ElevenLabsTextToSpeechService
  implements IEnhancedTextToSpeechService
{
  async synthesize(text: string, abortSignal?: AbortSignal): Promise<Response> {
    const config = ttsConfigs.elevenlabs as TextToSpeechConfig;
    if (!config || !config.apiKey || !config.voiceId) {
      console.error(
        "ElevenLabs API key or Voice ID is not configured for TTS."
      );
      return new Response(
        "ElevenLabs API key or Voice ID is not configured for TTS.",
        { status: 500 }
      );
    }

    const elevenlabs = getElevenLabsClient(config.apiKey);
    if (!elevenlabs)
      return new Response("ElevenLabs client not initialized", { status: 500 });

    try {
      // Check if operation was cancelled before starting
      if (abortSignal?.aborted) {
        console.info("ElevenLabs TTS operation was cancelled before starting");
        return new Response(
          "ElevenLabs TTS operation was cancelled before starting",
          { status: 200 }
        );
      }

      const audioStream = await elevenlabs.textToSpeech.convertAsStream(
        config.voiceId,
        {
          text,
          model_id: config.modelName,
          output_format: "mp3_22050_32"
        }
      );

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        // Check for cancellation during stream processing
        if (abortSignal?.aborted) {
          console.info(
            "ElevenLabs TTS operation was cancelled during stream processing"
          );
          return new Response(
            "ElevenLabs TTS operation was cancelled during stream processing",
            { status: 200 }
          );
        }
        chunks.push(chunk);
      }

      return new Response(Buffer.concat(chunks), { status: 200 });
    } catch (error) {
      // Handle AbortError specifically
      if (error instanceof Error && error.name === "AbortError") {
        console.info("ElevenLabs TTS operation was aborted");
        return new Response("ElevenLabs TTS operation was aborted", {
          status: 200
        });
      }
      console.error("ElevenLabs TTS failed:", error);
      return new Response("ElevenLabs TTS failed", { status: 500 });
    }
  }

  async synthesizeStream(
    text: string,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    const config = ttsConfigs.elevenlabs as TextToSpeechConfig;
    if (!config || !config.apiKey || !config.voiceId) {
      console.error(
        "ElevenLabs API key or Voice ID is not configured for TTS."
      );
      throw new Error(
        "ElevenLabs API key or Voice ID is not configured for TTS."
      );
    }

    const elevenlabs = getElevenLabsClient(config.apiKey);
    if (!elevenlabs) {
      throw new Error("ElevenLabs client not initialized");
    }

    try {
      // Check if operation was cancelled before starting
      if (abortSignal?.aborted) {
        console.info(
          "ElevenLabs TTS streaming operation was cancelled before starting"
        );
        throw new Error(
          "ElevenLabs TTS streaming operation was cancelled before starting"
        );
      }

      const audioStream = await elevenlabs.textToSpeech.convertAsStream(
        config.voiceId,
        {
          text,
          model_id: config.modelName,
          output_format: "pcm_24000"
        }
      );

      return new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of audioStream) {
              // Check for cancellation during stream processing
              if (abortSignal?.aborted) {
                console.info(
                  "ElevenLabs TTS streaming operation was cancelled during processing"
                );
                controller.close();
                return;
              }

              // Enqueue the chunk as Uint8Array
              controller.enqueue(new Uint8Array(chunk));
            }
            controller.close();
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              console.info("ElevenLabs TTS streaming operation was aborted");
              controller.close();
            } else {
              console.error("ElevenLabs TTS streaming failed:", error);
              controller.error(error);
            }
          }
        },
        cancel() {
          console.info("ElevenLabs TTS streaming was cancelled by client");
        }
      });
    } catch (error) {
      // Handle AbortError specifically
      if (error instanceof Error && error.name === "AbortError") {
        console.info("ElevenLabs TTS streaming operation was aborted");
        throw error;
      }
      console.error("ElevenLabs TTS streaming failed:", error);
      throw error;
    }
  }

  /**
   * Check if the service supports real-time chunked streaming
   */
  supportsChunkedStreaming(): boolean {
    return true; // ElevenLabs supports real-time streaming
  }

  /**
   * Process text chunks in real-time as they arrive
   * Each paragraph is processed immediately and audio is streamed back
   */
  async synthesizeChunkedStream(
    textChunks: AsyncIterable<string>,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    const config = ttsConfigs.elevenlabs as TextToSpeechConfig;
    if (!config || !config.apiKey || !config.voiceId) {
      console.error(
        "ElevenLabs API key or Voice ID is not configured for TTS."
      );
      throw new Error(
        "ElevenLabs API key or Voice ID is not configured for TTS."
      );
    }

    // Capture the service instance to use within the ReadableStream
    const service = this;

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let textBuffer = "";
          let chunkIndex = 0;
          const sentenceEnders = [".", "!", "?", "\n"];
          const minFallbackWords = 15; // Minimum words before forced processing
          const paragraphQueue: string[] = [];
          let isProcessing = false;

          // Create a silence buffer for smooth transitions
          const createSilenceBuffer = (durationMs: number): Uint8Array => {
            // Create MP3 silence frames for ElevenLabs
            const framesNeeded = Math.ceil(durationMs / 26);
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

            const totalLength = silenceFrame.length * Math.min(framesNeeded, 4);
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
                `ElevenLabs processing paragraph ${currentIndex}: "${paragraph.slice(
                  0,
                  50
                )}..."`
              );

              // Create individual stream for this paragraph
              const audioStream = await service.synthesizeStream(
                paragraph,
                abortSignal
              );
              const reader = audioStream.getReader();

              // Buffer the complete audio for this paragraph
              const audioChunks: Uint8Array[] = [];

              try {
                while (true) {
                  if (abortSignal?.aborted) {
                    console.log(
                      `Aborting ElevenLabs paragraph ${currentIndex} processing`
                    );
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
                    `Streaming complete ElevenLabs paragraph ${currentIndex}, size: ${totalLength}`
                  );
                  controller.enqueue(completeAudio);

                  // Add silence gap between paragraphs
                  if (!abortSignal?.aborted) {
                    const silenceBuffer = createSilenceBuffer(150); // 150ms silence
                    controller.enqueue(silenceBuffer);
                    console.log(
                      `Added ElevenLabs silence buffer after paragraph ${currentIndex}`
                    );
                  }
                }

                console.log(
                  `Completed ElevenLabs paragraph ${currentIndex} processing`
                );
              } finally {
                reader.releaseLock();
              }
            } catch (error) {
              if (error instanceof Error && error.name === "AbortError") {
                console.log(
                  `ElevenLabs paragraph ${currentIndex} processing was aborted`
                );
              } else {
                console.error(
                  `Error processing ElevenLabs paragraph ${currentIndex}:`,
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

          // Process text chunks to build paragraphs
          for await (const chunk of textChunks) {
            if (abortSignal?.aborted) {
              console.log("ElevenLabs chunked streaming aborted");
              break;
            }

            textBuffer += chunk;

            // Check for complete paragraphs ending with sentence enders
            let lastCompleteIndex = -1;
            for (let i = textBuffer.length - 1; i >= 0; i--) {
              if (sentenceEnders.includes(textBuffer[i])) {
                // Found a sentence ender, check if it's followed by whitespace or end of string
                if (
                  i === textBuffer.length - 1 ||
                  /\s/.test(textBuffer[i + 1])
                ) {
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
                  `ElevenLabs queueing complete paragraph: "${completeParagraph.slice(
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
                  const processableText = textBuffer.substring(
                    0,
                    lastSpaceIndex
                  );
                  const remainingText = textBuffer.substring(
                    lastSpaceIndex + 1
                  );

                  if (processableText.trim()) {
                    console.log(
                      `ElevenLabs queueing long text for processing: "${processableText.slice(
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
              `ElevenLabs queueing final text chunk: "${textBuffer.slice(
                0,
                50
              )}..."`
            );
            paragraphQueue.push(textBuffer.trim());
          }

          // Process the final queue and wait for completion
          await processQueue();

          // Wait for any ongoing processing to complete
          while (isProcessing && !abortSignal?.aborted) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          console.log("ElevenLabs chunked streaming completed");
          controller.close();
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            console.log("ElevenLabs chunked streaming was aborted");
            controller.close();
          } else {
            console.error("ElevenLabs chunked streaming failed:", error);
            controller.error(error);
          }
        }
      },
      cancel() {
        console.log("ElevenLabs chunked streaming was cancelled by client");
      }
    });
  }
}
