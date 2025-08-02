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
      submittedAt: number,
      onTranscript?: (transcript: string) => void,
      onStatus?: (status: string) => void
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
        submittedAt,
        onTranscript,
        onStatus
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
        
        // Enhanced error categorization
        const typedError = error as Error;
        if (typedError.name === "AbortError") {
          console.debug("StreamingProcessor: Stream was aborted");
          onError(new Error("STREAM_ABORTED"));
        } else if (typedError.message?.includes("Network")) {
          console.debug("StreamingProcessor: Network error detected");
          onError(new Error("NETWORK_ERROR"));
        } else if (typedError.message?.includes("timeout")) {
          console.debug("StreamingProcessor: Timeout error detected");
          onError(new Error("STREAM_TIMEOUT"));
        } else {
          onError(typedError);
        }
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

  const getProcessorState = useCallback(() => {
    return processorRef.current?.getState() || null;
  }, []);

  const isProcessorActive = useCallback(() => {
    return processorRef.current?.isProcessing() || false;
  }, []);

  return {
    processSSEStream,
    stopTypingAnimation,
    getProcessorState,
    isProcessorActive
  };
}
