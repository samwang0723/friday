import { useCallback, useEffect, useMemo, useRef } from "react";

interface StreamQueueItem {
  stream: ReadableStream;
  callback: () => void;
}

export function usePlayer() {
  const audioContext = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const streamQueue = useRef<StreamQueueItem[]>([]);
  const isProcessing = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contextCreatedRef = useRef(false);

  const processNextStream = useCallback(async function processNextStream() {
    if (isProcessing.current || streamQueue.current.length === 0) {
      return;
    }

    isProcessing.current = true;
    const { stream, callback } = streamQueue.current.shift()!;

    try {
      await playStream(stream, callback);
    } finally {
      isProcessing.current = false;
      // Process next stream in queue if available
      if (streamQueue.current.length > 0) {
        // Add minimal delay before playing next stream for smooth transitions
        timeoutRef.current = setTimeout(() => {
          processNextStream();
        }, 50);
      }
    }
  }, []);

  const createAudioContext = useCallback(() => {
    if (!audioContext.current || audioContext.current.state === "closed") {
      audioContext.current = new AudioContext({ sampleRate: 24000 });
      contextCreatedRef.current = true;
    }

    // Resume context if suspended
    if (audioContext.current.state === "suspended") {
      audioContext.current.resume();
    }

    return audioContext.current;
  }, []);

  async function playStream(stream: ReadableStream, callback: () => void) {
    const context = createAudioContext();

    let nextStartTime = context.currentTime;
    const reader = stream.getReader();
    let leftover = new Uint8Array();
    let result = await reader.read();
    let lastSource: AudioBufferSourceNode | null = null;

    while (!result.done && context && context.state !== "closed") {
      const data = new Uint8Array(leftover.length + result.value.length);
      data.set(leftover);
      data.set(result.value, leftover.length);

      const length = Math.floor(data.length / 4) * 4;
      const remainder = data.length % 4;
      const buffer = new Float32Array(data.buffer, 0, length / 4);

      leftover = new Uint8Array(data.buffer, length, remainder);

      // Check if audio context is still valid
      if (!context || (context.state as string) === "closed") {
        break;
      }

      const audioBuffer = context.createBuffer(
        1,
        buffer.length,
        context.sampleRate
      );
      audioBuffer.copyToChannel(buffer, 0);

      source.current = context.createBufferSource();
      source.current.buffer = audioBuffer;
      source.current.connect(context.destination);
      source.current.start(nextStartTime);

      // Keep reference to the last created source for onended handler
      lastSource = source.current;
      nextStartTime += audioBuffer.duration;

      result = await reader.read();
    }

    // Set onended handler on the last source that was created
    // Use lastSource instead of source.current to avoid race conditions
    if (lastSource && context && context.state !== "closed") {
      lastSource.onended = () => {
        // Only close context if we created it for this stream
        if (contextCreatedRef.current && audioContext.current) {
          audioContext.current.close();
          audioContext.current = null;
          contextCreatedRef.current = false;
        }
        callback();
      };
    } else {
      // If no source was created or context is invalid, still call callback
      if (contextCreatedRef.current && audioContext.current) {
        audioContext.current.close();
        audioContext.current = null;
        contextCreatedRef.current = false;
      }
      callback();
    }
  }

  const play = useCallback(async function play(
    stream: ReadableStream,
    callback: () => void
  ) {
    // Add stream to queue
    streamQueue.current.push({ stream, callback });

    // If not currently processing, start processing the queue
    if (!isProcessing.current) {
      processNextStream();
    }
  }, []);

  const stop = useCallback(function stop() {
    // Clear any pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Clear the queue
    streamQueue.current = [];
    isProcessing.current = false;

    // Stop current playback
    if (source.current) {
      try {
        // Only stop if the source hasn't already ended
        if (
          source.current.context &&
          source.current.context.state !== "closed"
        ) {
          source.current.stop();
        }
        source.current.disconnect();
      } catch (e) {
        // Ignore errors if source is already stopped or disconnected
        console.log("Source cleanup error (likely already stopped):", e);
      }
      source.current = null;
    }

    // Clean up audio context
    if (audioContext.current) {
      try {
        if (audioContext.current.state !== "closed") {
          audioContext.current.close();
        }
      } catch (e) {
        console.log("AudioContext cleanup error:", e);
      }
      audioContext.current = null;
      contextCreatedRef.current = false;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Clean up AudioContext on unmount
      if (audioContext.current && audioContext.current.state !== "closed") {
        audioContext.current.close();
      }
    };
  }, []);

  return useMemo(
    () => ({
      play,
      stop
    }),
    [play, stop]
  );
}
