import { useCallback, useRef } from "react";
import type { StreamingProcessorHookReturn } from "@/types/voiceChat";
import { SSEProcessor } from "@/utils/sseProcessor";

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
        await processorRef.current.processStream(response);
      } catch (error) {
        console.error("Error processing SSE stream:", error);
        onError(error as Error);
      } finally {
        processorRef.current = null;
      }
    },
    []
  );

  const stopTypingAnimation = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.stop();
    }
  }, []);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.stop();
      processorRef.current = null;
    }
  }, []);

  return {
    processSSEStream,
    stopTypingAnimation
  };
}
