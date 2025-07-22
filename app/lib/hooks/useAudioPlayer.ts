import { startAudioPlayerWorklet } from "@/lib/audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function useAudioPlayer() {
  const audioPlayerNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioPlayerContextRef = useRef<AudioContext | null>(null);
  const [isPlayerInitialized, setPlayerInitialized] = useState(false);

  const initAudioPlayer = useCallback(async () => {
    if (audioPlayerNodeRef.current) return;
    try {
      const [node, context] = await startAudioPlayerWorklet();
      audioPlayerNodeRef.current = node;
      audioPlayerContextRef.current = context;
      setPlayerInitialized(true);
    } catch (error) {
      console.error("Failed to initialize audio player:", error);
      toast.error("Failed to initialize audio player.");
    }
  }, []);

  const playAudioChunk = useCallback((chunk: ArrayBuffer) => {
    if (audioPlayerNodeRef.current && audioPlayerContextRef.current) {
      if (audioPlayerContextRef.current.state === "suspended") {
        audioPlayerContextRef.current.resume();
      }
      audioPlayerNodeRef.current.port.postMessage(chunk);
    }
  }, []);

  const stop = useCallback(() => {
    if (audioPlayerNodeRef.current) {
      audioPlayerNodeRef.current.port.postMessage({ command: "endOfAudio" });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (audioPlayerContextRef.current) {
        audioPlayerContextRef.current.close();
      }
    };
  }, []);

  return {
    isPlayerInitialized,
    initAudioPlayer,
    playAudioChunk,
    stop
  };
}
