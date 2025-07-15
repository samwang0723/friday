import { useRef, useState } from "react";

export function usePlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const nextStartTime = useRef<number>(0);
  const isStreamingPlayback = useRef<boolean>(false);

  async function play(stream: ReadableStream, callback: () => void) {
    stop();
    audioContext.current = new AudioContext({ sampleRate: 24000 });

    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let result = await reader.read();

    // Read all chunks first
    while (!result.done) {
      chunks.push(result.value);
      result = await reader.read();
    }

    // Combine all chunks into a single buffer
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combinedBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    try {
      // Try to decode as WAV first (for Groq)
      const audioBuffer = await audioContext.current.decodeAudioData(
        combinedBuffer.buffer
      );
      await playAudioBuffer(audioBuffer, callback);
    } catch (error) {
      // If WAV decoding fails, try as raw PCM (for Cartesia)
      console.log("WAV decoding failed, trying raw PCM format");
      await playRawPCM(combinedBuffer, callback);
    }
  }

  async function playStream(stream: ReadableStream, callback: () => void) {
    stop();
    audioContext.current = new AudioContext({ sampleRate: 24000 });
    isStreamingPlayback.current = true;
    nextStartTime.current = audioContext.current.currentTime;

    const reader = stream.getReader();
    const chunkQueue: Uint8Array[] = [];
    let isProcessing = false;
    let streamEnded = false;
    let pendingBuffers: AudioBuffer[] = [];

    setIsPlaying(true);

    const processChunk = async () => {
      if (isProcessing || chunkQueue.length === 0) return;

      isProcessing = true;
      const chunk = chunkQueue.shift()!;

      try {
        // Try to decode the chunk as audio
        const arrayBuffer = chunk.buffer.slice(
          chunk.byteOffset,
          chunk.byteOffset + chunk.byteLength
        );
        const audioBuffer = await audioContext.current!.decodeAudioData(
          arrayBuffer as ArrayBuffer
        );

        // Queue the buffer for playback
        pendingBuffers.push(audioBuffer);

        // Play the buffer if we have an audio context
        if (audioContext.current && isStreamingPlayback.current) {
          await playBufferAtTime(audioBuffer);
        }
      } catch (error) {
        console.warn("Failed to decode audio chunk, trying as raw PCM:", error);
        // For raw PCM data (Cartesia), we need to handle it differently
        try {
          const audioBuffer = createPCMBuffer(chunk);
          pendingBuffers.push(audioBuffer);

          if (audioContext.current && isStreamingPlayback.current) {
            await playBufferAtTime(audioBuffer);
          }
        } catch (pcmError) {
          console.error("Failed to process audio chunk:", pcmError);
        }
      }

      isProcessing = false;

      // Process next chunk if available
      if (chunkQueue.length > 0) {
        setTimeout(processChunk, 0);
      } else if (streamEnded && pendingBuffers.length === 0) {
        // Stream ended and all buffers played
        stop();
        callback();
      }
    };

    const playBufferAtTime = async (audioBuffer: AudioBuffer) => {
      if (!audioContext.current || !isStreamingPlayback.current) return;

      const bufferSource = audioContext.current.createBufferSource();
      bufferSource.buffer = audioBuffer;
      bufferSource.connect(audioContext.current.destination);

      // Schedule playback
      const startTime = Math.max(
        nextStartTime.current,
        audioContext.current.currentTime
      );
      bufferSource.start(startTime);
      nextStartTime.current = startTime + audioBuffer.duration;

      // Handle buffer end
      bufferSource.onended = () => {
        const bufferIndex = pendingBuffers.indexOf(audioBuffer);
        if (bufferIndex > -1) {
          pendingBuffers.splice(bufferIndex, 1);
        }

        if (streamEnded && pendingBuffers.length === 0) {
          stop();
          callback();
        }
      };
    };

    const createPCMBuffer = (data: Uint8Array): AudioBuffer => {
      if (!audioContext.current) throw new Error("No audio context");

      // Process raw PCM data (Float32 format from Cartesia)
      const length = Math.floor(data.length / 4) * 4;
      const buffer = new Float32Array(data.buffer, data.byteOffset, length / 4);

      const audioBuffer = audioContext.current.createBuffer(
        1,
        buffer.length,
        audioContext.current.sampleRate
      );
      audioBuffer.copyToChannel(buffer, 0);

      return audioBuffer;
    };

    // Start reading the stream
    const readStream = async () => {
      try {
        while (true) {
          const result = await reader.read();

          if (result.done) {
            streamEnded = true;
            // Process any remaining chunks
            if (chunkQueue.length > 0) {
              setTimeout(processChunk, 0);
            } else if (pendingBuffers.length === 0) {
              stop();
              callback();
            }
            break;
          }

          chunkQueue.push(result.value);

          // Start processing if not already doing so
          if (!isProcessing) {
            setTimeout(processChunk, 0);
          }
        }
      } catch (error) {
        console.error("Error reading stream:", error);
        stop();
        callback();
      }
    };

    readStream();
  }

  async function playAudioBuffer(
    audioBuffer: AudioBuffer,
    callback: () => void
  ) {
    if (!audioContext.current) return;

    source.current = audioContext.current.createBufferSource();
    source.current.buffer = audioBuffer;
    source.current.connect(audioContext.current.destination);
    source.current.onended = () => {
      stop();
      callback();
    };

    setIsPlaying(true);
    source.current.start();
  }

  async function playRawPCM(data: Uint8Array, callback: () => void) {
    if (!audioContext.current) return;

    // Process raw PCM data (Float32 format from Cartesia)
    const length = Math.floor(data.length / 4) * 4;
    const buffer = new Float32Array(data.buffer, 0, length / 4);

    const audioBuffer = audioContext.current.createBuffer(
      1,
      buffer.length,
      audioContext.current.sampleRate
    );
    audioBuffer.copyToChannel(buffer, 0);

    source.current = audioContext.current.createBufferSource();
    source.current.buffer = audioBuffer;
    source.current.connect(audioContext.current.destination);
    source.current.onended = () => {
      stop();
      callback();
    };

    setIsPlaying(true);
    source.current.start();
  }

  function stop() {
    isStreamingPlayback.current = false;
    audioContext.current?.close();
    audioContext.current = null;
    source.current = null;
    nextStartTime.current = 0;
    setIsPlaying(false);
  }

  return {
    isPlaying,
    play,
    playStream,
    stop
  };
}
