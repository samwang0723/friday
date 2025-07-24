import React, { useCallback, useRef, useState } from "react";

export interface WebMRecorderConfig {
  mimeType?: string;
  audioBitsPerSecond?: number;
  timeSlice?: number; // Chunk recording into intervals (ms)
  maxDuration?: number; // Maximum recording duration (ms)
  minBlobSize?: number; // Minimum valid blob size (bytes)
}

export interface WebMRecorderState {
  isRecording: boolean;
  isAvailable: boolean;
  error: string | null;
  recordingDuration: number; // Current recording duration in ms
  blobSize: number; // Size of recorded blob in bytes
}

export interface WebMRecorder {
  state: WebMRecorderState;
  startRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
}

/**
 * Hook for direct WebM recording from microphone
 * Provides real-time WebM encoding without Float32Array conversion
 */
export function useWebMRecorder(
  stream: MediaStream | undefined,
  config: WebMRecorderConfig = {}
): WebMRecorder {
  const [state, setState] = useState<WebMRecorderState>({
    isRecording: false,
    isAvailable: false,
    error: null,
    recordingDuration: 0,
    blobSize: 0
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Default configuration
  const mimeType = config.mimeType || "audio/webm;codecs=opus";
  const audioBitsPerSecond = config.audioBitsPerSecond || 128000;
  const timeSlice = config.timeSlice || 10; // 10ms chunks
  const maxDuration = config.maxDuration || 60000; // 60 seconds max
  const minBlobSize = config.minBlobSize || 512; // 512 bytes minimum

  // Check if MediaRecorder and WebM are supported
  const isSupported = useCallback(() => {
    if (!window.MediaRecorder) {
      return false;
    }
    return MediaRecorder.isTypeSupported(mimeType);
  }, [mimeType]);

  // Initialize MediaRecorder when stream becomes available
  const initializeRecorder = useCallback(() => {
    if (!stream || !isSupported()) {
      setState(prev => ({
        ...prev,
        isAvailable: false,
        error: !stream
          ? "No audio stream available"
          : "WebM format not supported"
      }));
      return;
    }

    try {
      const options = {
        mimeType,
        audioBitsPerSecond
      };

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log(`WebM chunk received: ${event.data.size} bytes`);
        }
      };

      mediaRecorder.onerror = event => {
        console.error("MediaRecorder error:", event);
        // Clear timers on error
        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
          durationTimerRef.current = null;
        }
        if (maxDurationTimerRef.current) {
          clearTimeout(maxDurationTimerRef.current);
          maxDurationTimerRef.current = null;
        }
        setState(prev => ({
          ...prev,
          error: "Recording error occurred",
          isRecording: false,
          recordingDuration: 0
        }));
      };

      setState(prev => ({
        ...prev,
        isAvailable: true,
        error: null
      }));

      console.log("WebM MediaRecorder initialized successfully");
    } catch (error) {
      console.error("Failed to initialize MediaRecorder:", error);
      setState(prev => ({
        ...prev,
        isAvailable: false,
        error: "Failed to initialize recorder"
      }));
    }
  }, [stream, isSupported, mimeType, audioBitsPerSecond]);

  // Cleanup function for timers and recorder
  const cleanup = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
  }, []);

  // Initialize recorder when stream changes
  React.useEffect(() => {
    initializeRecorder();

    return cleanup;
  }, [initializeRecorder, cleanup]);

  const startRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || !state.isAvailable) {
      console.warn("Cannot start recording: recorder not available");
      return;
    }

    if (recorder.state === "recording") {
      console.warn("Recording already in progress");
      return;
    }

    try {
      // Clear previous chunks and reset state
      chunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      // Start recording with timeSlice for better chunking
      recorder.start(timeSlice);

      // Start duration tracking timer
      durationTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - recordingStartTimeRef.current;
        setState(prev => ({
          ...prev,
          recordingDuration: elapsed
        }));
      }, 100); // Update every 100ms for smooth UI

      // Set maximum duration timer to prevent overly long recordings
      maxDurationTimerRef.current = setTimeout(() => {
        console.warn(
          `WebM recording reached maximum duration (${maxDuration}ms), stopping automatically`
        );
        stopRecording();
      }, maxDuration);

      setState(prev => ({
        ...prev,
        isRecording: true,
        error: null,
        recordingDuration: 0,
        blobSize: 0
      }));

      console.log(
        `WebM recording started with ${timeSlice}ms timeSlice, max duration: ${maxDuration}ms`
      );
    } catch (error) {
      console.error("Failed to start recording:", error);
      cleanup(); // Clean up timers on error
      setState(prev => ({
        ...prev,
        error: "Failed to start recording"
      }));
    }
  }, [state.isAvailable]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise(resolve => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state !== "recording") {
        console.warn("Cannot stop recording: not currently recording");
        resolve(null);
        return;
      }

      // Set up stop handler
      const handleStop = () => {
        try {
          // Clear timers first
          if (durationTimerRef.current) {
            clearInterval(durationTimerRef.current);
            durationTimerRef.current = null;
          }
          if (maxDurationTimerRef.current) {
            clearTimeout(maxDurationTimerRef.current);
            maxDurationTimerRef.current = null;
          }

          // Create WebM blob from chunks
          const webmBlob = new Blob(chunksRef.current, { type: mimeType });
          const finalDuration = Date.now() - recordingStartTimeRef.current;

          // Validate blob size
          if (webmBlob.size < minBlobSize) {
            console.warn(
              `WebM blob too small (${webmBlob.size} bytes, minimum: ${minBlobSize}), likely invalid recording`
            );
            setState(prev => ({
              ...prev,
              isRecording: false,
              error: `Recording too short or invalid (${webmBlob.size} bytes)`,
              recordingDuration: finalDuration,
              blobSize: webmBlob.size
            }));
            resolve(null);
            return;
          }

          setState(prev => ({
            ...prev,
            isRecording: false,
            recordingDuration: finalDuration,
            blobSize: webmBlob.size,
            error: null
          }));

          console.log(
            `WebM recording stopped successfully - Duration: ${finalDuration}ms, Blob size: ${webmBlob.size} bytes, Chunks: ${chunksRef.current.length}`
          );
          resolve(webmBlob);
        } catch (error) {
          console.error("Error creating WebM blob:", error);
          setState(prev => ({
            ...prev,
            isRecording: false,
            error: "Failed to create recording",
            recordingDuration: 0,
            blobSize: 0
          }));
          resolve(null);
        }

        // Cleanup listener
        recorder.removeEventListener("stop", handleStop);
      };

      // Add stop event listener
      recorder.addEventListener("stop", handleStop);

      // Stop recording
      try {
        recorder.stop();
      } catch (error) {
        console.error("Error stopping recorder:", error);
        recorder.removeEventListener("stop", handleStop);
        // Clear timers on stop error
        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
          durationTimerRef.current = null;
        }
        if (maxDurationTimerRef.current) {
          clearTimeout(maxDurationTimerRef.current);
          maxDurationTimerRef.current = null;
        }
        setState(prev => ({
          ...prev,
          isRecording: false,
          error: "Failed to stop recording",
          recordingDuration: 0,
          blobSize: 0
        }));
        resolve(null);
      }
    });
  }, [mimeType]);

  return {
    state,
    startRecording,
    stopRecording
  };
}
