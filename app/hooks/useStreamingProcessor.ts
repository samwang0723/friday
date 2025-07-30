import type { StreamingProcessorHookReturn } from "@/types/voiceChat";
import { SSEProcessor } from "@/utils/sseProcessor";
import { useCallback, useRef } from "react";

export function useStreamingProcessor(): StreamingProcessorHookReturn {
  const processorRef = useRef<SSEProcessor | null>(null);

  const processSSEStream = useCallback(
    async (
      response: Response,
      onTextUpdate: (text: string) => void,
      onAudioChunk: (chunk: ArrayBuffer) => void,
      onStreamComplete: (finalText: string, latency: number) => void,
      onError: (error: Error) => void,
      submittedAt: number
    ): Promise<void> => {
      // Clean up any existing processor
      if (processorRef.current) {
        console.debug(
          "StreamingProcessor: Stopping existing processor for new stream"
        );
        processorRef.current.stop();
      }

      // Create new processor with the original submission timestamp
      processorRef.current = new SSEProcessor(
        onTextUpdate,
        onAudioChunk,
        onStreamComplete,
        onError,
        submittedAt
      );

      try {
        console.debug("StreamingProcessor: Starting stream processing");
        await processorRef.current.processStream(response);
        console.debug(
          "StreamingProcessor: Stream processing completed successfully"
        );
      } catch (error) {
        console.error(
          "StreamingProcessor: Error processing SSE stream:",
          error
        );
        onError(error as Error);
      } finally {
        console.debug("StreamingProcessor: Cleaning up processor");
        processorRef.current = null;
      }
    },
    []
  );

  const stopTypingAnimation = useCallback(() => {
    if (processorRef.current) {
      console.debug("StreamingProcessor: Stopping typing animation");
      processorRef.current.stop();
    }
  }, []);

  return {
    processSSEStream,
    stopTypingAnimation
  };
}
