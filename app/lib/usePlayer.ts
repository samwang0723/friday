import { useRef, useState } from "react";

export function usePlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);

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
