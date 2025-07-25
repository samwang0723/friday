import { startAudioPlayerWorklet } from "@/lib/audio";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { toast } from "sonner";

export function useAudioPlayer() {
  const audioPlayerNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioPlayerContextRef = useRef<AudioContext | null>(null);
  const initializationPromiseRef = useRef<Promise<void> | null>(null);
  const [isPlayerInitialized, setPlayerInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  const initAudioPlayer = useCallback(async () => {
    // Prevent multiple simultaneous initialization attempts
    if (audioPlayerNodeRef.current) return;
    if (initializationPromiseRef.current) {
      await initializationPromiseRef.current;
      return;
    }

    const initPromise = (async () => {
      try {
        setInitializationError(null);
        const [node, context] = await startAudioPlayerWorklet();
        
        // Verify the context and node are valid before storing
        if (!context || !node) {
          throw new Error("Invalid audio context or worklet node");
        }

        // Add error event listener to the context
        context.addEventListener('statechange', () => {
          if (context.state === 'suspended') {
            console.warn("Audio context was suspended");
          }
        });

        audioPlayerNodeRef.current = node;
        audioPlayerContextRef.current = context;
        setPlayerInitialized(true);
        
        console.log("Audio player initialized successfully");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        console.error("Failed to initialize audio player:", error);
        setInitializationError(errorMessage);
        toast.error("Failed to initialize audio player.");
        throw error;
      } finally {
        initializationPromiseRef.current = null;
      }
    })();

    initializationPromiseRef.current = initPromise;
    await initPromise;
  }, []);

  const playAudioChunk = useCallback((chunk: ArrayBuffer) => {
    try {
      if (!audioPlayerNodeRef.current || !audioPlayerContextRef.current) {
        console.warn("Audio player not initialized, cannot play chunk");
        return;
      }

      const context = audioPlayerContextRef.current;
      
      // Handle suspended context state
      if (context.state === "suspended") {
        context.resume().catch(error => {
          console.error("Failed to resume audio context:", error);
        });
      }
      
      // Verify the worklet node is still connected
      if (audioPlayerNodeRef.current.port) {
        audioPlayerNodeRef.current.port.postMessage(chunk);
      } else {
        console.warn("Audio worklet node port is not available");
      }
    } catch (error) {
      console.error("Error playing audio chunk:", error);
    }
  }, []);

  const stop = useCallback(() => {
    try {
      if (audioPlayerNodeRef.current?.port) {
        audioPlayerNodeRef.current.port.postMessage({ command: "endOfAudio" });
      }
    } catch (error) {
      console.error("Error stopping audio player:", error);
    }
  }, []);

  // Enhanced cleanup with proper error handling
  const cleanup = useCallback(() => {
    try {
      if (audioPlayerNodeRef.current) {
        audioPlayerNodeRef.current.disconnect();
        audioPlayerNodeRef.current = null;
      }
      
      if (audioPlayerContextRef.current && audioPlayerContextRef.current.state !== 'closed') {
        audioPlayerContextRef.current.close().catch(error => {
          console.warn("Error closing audio context:", error);
        });
        audioPlayerContextRef.current = null;
      }
      
      setPlayerInitialized(false);
      setInitializationError(null);
    } catch (error) {
      console.error("Error during audio player cleanup:", error);
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Memoize return object to prevent unnecessary re-renders
  return useMemo(() => ({
    isPlayerInitialized,
    initializationError,
    initAudioPlayer,
    playAudioChunk,
    stop,
    cleanup
  }), [isPlayerInitialized, initializationError, initAudioPlayer, playAudioChunk, stop, cleanup]);
}
