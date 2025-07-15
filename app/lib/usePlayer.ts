import { useRef, useState } from "react";

interface StreamQueueItem {
  stream: ReadableStream;
  callback: () => void;
}

export function usePlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const streamQueue = useRef<StreamQueueItem[]>([]);
  const isProcessing = useRef(false);

  async function processNextStream() {
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
        // Add 100ms delay before playing next stream
        setTimeout(() => {
          processNextStream();
        }, 800);
      }
    }
  }

  async function playStream(stream: ReadableStream, callback: () => void) {
    audioContext.current = new AudioContext({ sampleRate: 24000 });

    let nextStartTime = audioContext.current.currentTime;
    const reader = stream.getReader();
    let leftover = new Uint8Array();
    let result = await reader.read();
    setIsPlaying(true);

    while (!result.done && audioContext.current) {
      const data = new Uint8Array(leftover.length + result.value.length);
      data.set(leftover);
      data.set(result.value, leftover.length);

      const length = Math.floor(data.length / 4) * 4;
      const remainder = data.length % 4;
      const buffer = new Float32Array(data.buffer, 0, length / 4);

      leftover = new Uint8Array(data.buffer, length, remainder);

      const audioBuffer = audioContext.current.createBuffer(
        1,
        buffer.length,
        audioContext.current.sampleRate
      );
      audioBuffer.copyToChannel(buffer, 0);

      source.current = audioContext.current.createBufferSource();
      source.current.buffer = audioBuffer;
      source.current.connect(audioContext.current.destination);
      source.current.start(nextStartTime);

      nextStartTime += audioBuffer.duration;

      result = await reader.read();
      if (result.done) {
        source.current.onended = () => {
          // Clean up current stream
          audioContext.current?.close();
          audioContext.current = null;
          setIsPlaying(streamQueue.current.length > 0);
          callback();
        };
      }
    }
  }

  async function play(stream: ReadableStream, callback: () => void) {
    // Add stream to queue
    streamQueue.current.push({ stream, callback });

    // If not currently processing, start processing the queue
    if (!isProcessing.current) {
      processNextStream();
    }
  }

  function stop() {
    // Clear the queue
    streamQueue.current = [];
    isProcessing.current = false;

    // Stop current playback
    if (source.current) {
      try {
        source.current.stop();
        source.current.disconnect();
      } catch (e) {
        // Ignore errors if source is already stopped
      }
      source.current = null;
    }

    audioContext.current?.close();
    audioContext.current = null;
    setIsPlaying(false);
  }

  return {
    isPlaying,
    play,
    stop
  };
}
