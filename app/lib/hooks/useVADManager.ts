import { useMicVAD } from "@ricky0123/vad-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Calculate RMS energy in dBFS from audio samples
function calculateRMSdBFS(audioData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  const rms = Math.sqrt(sum / audioData.length);
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

// Simplified speech detection using only RMS energy
function isSpeechLike(
  audio: Float32Array,
  config: VADConfig,
  isStreaming?: boolean
): boolean {
  const rmsLevel = calculateRMSdBFS(audio);

  // RMS energy threshold: speech needs sufficient energy (higher than threshold)
  // Made more sensitive to capture quieter speech
  const rmsThreshold = isStreaming ? -45 : config.rmsEnergyThreshold || -40;
  if (rmsLevel < rmsThreshold) {
    console.log(
      `VAD: Audio filtered - RMS too low: ${rmsLevel.toFixed(2)}dBFS < ${rmsThreshold}dBFS`
    );
    return false; // Too quiet, likely silence or background noise
  }

  console.log(
    `VAD: Audio passed speech-like analysis - RMS: ${rmsLevel.toFixed(2)}dBFS`
  );
  return true;
}

export interface VADConfig {
  positiveSpeechThreshold?: number;
  minSpeechFrames?: number;
  rmsEnergyThreshold?: number;
  minSpeechDuration?: number;
  spectralCentroidThreshold?: number;
}

export type VADSensitivity = "low" | "medium" | "high";

// Convert sensitivity setting to VAD configuration
// Adjusted for more natural speech patterns with pauses
export function getVADConfigForSensitivity(
  sensitivity: VADSensitivity
): VADConfig {
  switch (sensitivity) {
    case "low":
      return {
        positiveSpeechThreshold: 0.9, // Much higher threshold for long sentences
        minSpeechFrames: 12, // More frames needed to start
        rmsEnergyThreshold: -30, // Higher threshold, requires louder speech
        minSpeechDuration: 800, // Much longer minimum to avoid cutting sentences
        spectralCentroidThreshold: 400
      };
    case "medium":
      return {
        positiveSpeechThreshold: 0.5, // Higher threshold for natural pauses
        minSpeechFrames: 9, // More frames to avoid quick cuts
        rmsEnergyThreshold: -35, // Slightly higher threshold
        minSpeechDuration: 400, // Longer minimum to capture full thoughts
        spectralCentroidThreshold: 300
      };
    case "high":
      return {
        positiveSpeechThreshold: 0.3, // Still sensitive but not too quick
        minSpeechFrames: 6, // Reasonable frame count
        rmsEnergyThreshold: -40, // Standard threshold
        minSpeechDuration: 100, // Minimum to avoid cutting mid-sentence
        spectralCentroidThreshold: 200
      };
    default:
      return getVADConfigForSensitivity("medium");
  }
}

export interface VADCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (isValid: boolean, audio: Float32Array) => void;
  onVADMisfire?: () => void;
}

export interface VADContext {
  isStreaming?: boolean;
  isAuthenticated?: boolean;
  audioEnabled?: boolean;
  settingsLoaded?: boolean;
}

export interface VADState {
  loading: boolean;
  errored: boolean;
  userSpeaking: boolean;
  actualUserSpeaking: boolean;
}

export interface VADManager {
  state: VADState;
  start: () => void;
  pause: () => void;
  isRunning: boolean;
  audioStream: MediaStream | undefined;
}

export function useVADManager(
  config: VADConfig,
  callbacks: VADCallbacks,
  context: VADContext
): VADManager {
  const [vadState, setVADState] = useState({
    loading: false,
    errored: false,
    userSpeaking: false,
    actualUserSpeaking: false,
    lastSpeechTime: 0,
    shouldShowOrb: false
  });

  // Separate ref for speechStartTime to avoid circular dependencies
  const speechStartTimeRef = useRef<number>(0);

  const audioStartTimeRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const maxRetries = 3;
  const baseRetryDelay = 1000; // 1 second

  // Track when audio starts for echo detection
  useEffect(() => {
    if (context.isStreaming) {
      audioStartTimeRef.current = Date.now();
    }
  }, [context.isStreaming]);

  // Memoize callback functions to prevent recreation
  const onSpeechStartCallback = useCallback(() => {
    callbacks.onSpeechStart?.();
  }, [callbacks.onSpeechStart]);

  const onSpeechStart = useCallback(() => {
    const now = Date.now();
    const timeSinceAudioStart = now - audioStartTimeRef.current;

    // Filter out speech detection that happens very soon after audio starts
    const isLikelyEcho = context.isStreaming && timeSinceAudioStart < 100;

    console.log(
      `VAD: Speech detected - Time since audio start: ${timeSinceAudioStart}ms, Is likely echo: ${isLikelyEcho}, Is streaming: ${context.isStreaming}`
    );

    speechStartTimeRef.current = now;
    setVADState(prev => ({
      ...prev,
      actualUserSpeaking: true,
      userSpeaking: !isLikelyEcho,
      shouldShowOrb: !isLikelyEcho,
      lastSpeechTime: now
    }));

    // Only trigger interruption for actual user speech, not echo
    if (!isLikelyEcho) {
      console.log("VAD: Triggering speech start callback");
      onSpeechStartCallback();
    } else {
      console.log(
        "VAD: Suppressing speech start callback due to echo detection"
      );
    }
  }, [context.isStreaming, onSpeechStartCallback]);

  // Memoize speech end callback to prevent recreation
  const onSpeechEndCallback = useCallback(
    (isValid: boolean, audio: Float32Array) => {
      callbacks.onSpeechEnd?.(isValid, audio);
    },
    [callbacks.onSpeechEnd]
  );

  const onSpeechEnd = useCallback(
    (audio: Float32Array) => {
      const now = Date.now();
      console.log("VAD: Speech ended");

      // Apply simplified speech filtering
      const speechAnalysis = {
        rmsLevel: calculateRMSdBFS(audio),
        duration: now - speechStartTimeRef.current,
        isValid: true
      };

      // Duration check - ignore very short sounds
      if (
        config.minSpeechDuration !== undefined &&
        speechAnalysis.duration < config.minSpeechDuration
      ) {
        console.log(
          `VAD: Speech too short (${speechAnalysis.duration}ms), ignoring`
        );
        speechAnalysis.isValid = false;
      }

      // Apply comprehensive speech-like analysis
      if (
        speechAnalysis.isValid &&
        !isSpeechLike(audio, config, context.isStreaming)
      ) {
        console.log(`VAD: Audio failed speech-like analysis`);
        speechAnalysis.isValid = false;
      }

      console.log(
        `VAD: Speech Analysis Results:\n` +
          `  - RMS Level: ${speechAnalysis.rmsLevel.toFixed(2)}dBFS (threshold: ${config.rmsEnergyThreshold || -40}dBFS)\n` +
          `  - Duration: ${speechAnalysis.duration}ms (minimum: ${config.minSpeechDuration || 250}ms)\n` +
          `  - Audio Length: ${audio.length} samples\n` +
          `  - Is Streaming: ${context.isStreaming}\n` +
          `  - Final Result: ${speechAnalysis.isValid ? "VALID SPEECH" : "FILTERED OUT"}`
      );

      setVADState(prev => ({
        ...prev,
        actualUserSpeaking: false,
        userSpeaking: false,
        shouldShowOrb: false,
        ...(speechAnalysis.isValid && { lastSpeechTime: now })
      }));

      onSpeechEndCallback(speechAnalysis.isValid, audio);
    },
    [config, context.isStreaming, onSpeechEndCallback]
  );

  // Create enhanced audio stream
  const [audioStream, setAudioStream] = useState<MediaStream | undefined>();
  const audioStreamRef = useRef<MediaStream | undefined>(undefined);
  const streamCreationTimeoutRef = useRef<NodeJS.Timeout | undefined>(
    undefined
  );

  // Keep ref in sync with state
  useEffect(() => {
    audioStreamRef.current = audioStream;
  }, [audioStream]);

  // Enhanced stream cleanup utility
  const cleanupAudioStream = useCallback((stream?: MediaStream) => {
    const streamToClean = stream || audioStreamRef.current;
    if (streamToClean) {
      try {
        streamToClean.getTracks().forEach(track => {
          if (track.readyState !== "ended") {
            track.stop();
          }
        });
      } catch (error) {
        console.warn("VAD: Error during stream cleanup:", error);
      }

      if (streamToClean === audioStreamRef.current) {
        audioStreamRef.current = undefined;
        setAudioStream(undefined);
      }
    }
  }, []);

  useEffect(() => {
    const createEnhancedStream = async () => {
      // Clear any existing timeout
      if (streamCreationTimeoutRef.current) {
        clearTimeout(streamCreationTimeoutRef.current);
        streamCreationTimeoutRef.current = undefined;
      }

      // Clean up existing stream first
      cleanupAudioStream();

      if (
        !context.isAuthenticated ||
        !context.audioEnabled ||
        !context.settingsLoaded
      ) {
        return;
      }

      try {
        // Add timeout protection for stream creation
        const streamPromise = navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          streamCreationTimeoutRef.current = setTimeout(() => {
            reject(new Error("Stream creation timeout after 10 seconds"));
          }, 10000);
        });

        const stream = await Promise.race([streamPromise, timeoutPromise]);

        // Clear timeout on success
        if (streamCreationTimeoutRef.current) {
          clearTimeout(streamCreationTimeoutRef.current);
          streamCreationTimeoutRef.current = undefined;
        }

        // Verify stream is still valid before setting
        if (
          stream &&
          stream.getTracks().length > 0 &&
          stream.getTracks()[0].readyState === "live"
        ) {
          audioStreamRef.current = stream;
          setAudioStream(stream);
          console.log("VAD: Audio stream created successfully");
        } else {
          console.warn("VAD: Created stream is invalid, cleaning up");
          cleanupAudioStream(stream);
          setVADState(prev => ({ ...prev, errored: true }));
        }
      } catch (error) {
        // Clear timeout on error
        if (streamCreationTimeoutRef.current) {
          clearTimeout(streamCreationTimeoutRef.current);
          streamCreationTimeoutRef.current = undefined;
        }

        console.error("VAD: Failed to create audio stream:", error);
        setVADState(prev => ({ ...prev, errored: true }));

        // Clean up any partial streams
        cleanupAudioStream();
      }
    };

    createEnhancedStream();

    return () => {
      // Clear timeout on cleanup
      if (streamCreationTimeoutRef.current) {
        clearTimeout(streamCreationTimeoutRef.current);
        streamCreationTimeoutRef.current = undefined;
      }

      // Use enhanced cleanup function
      cleanupAudioStream();
    };
  }, [
    context.isAuthenticated,
    context.audioEnabled,
    context.settingsLoaded,
    cleanupAudioStream
  ]);

  // Memoize VAD misfire callback
  const onVADMisfireCallback = useCallback(() => {
    callbacks.onVADMisfire?.();
  }, [callbacks.onVADMisfire]);

  // Initialize VAD with error handling
  const vad = useMicVAD({
    startOnLoad: true,
    model: "v5",
    submitUserSpeechOnPause: false,
    positiveSpeechThreshold: config.positiveSpeechThreshold || 0.5,
    minSpeechFrames: config.minSpeechFrames || 9,
    userSpeakingThreshold: 0.6,
    negativeSpeechThreshold: 0.35, // Lower threshold to be less aggressive about ending
    redemptionFrames: 24, // Increased to allow for natural pauses in speech
    preSpeechPadFrames: 3, // More padding for natural starts
    frameSamples: 512, // For the older (default) Silero model, this should probably be 1536. For the new, Silero version 5 model, it should be 512. default: 1536
    stream: audioStream,
    onSpeechStart,
    onSpeechEnd,
    onVADMisfire: () => {
      console.log("VAD: Misfire detected, resetting Orb state");
      setVADState(prev => ({
        ...prev,
        actualUserSpeaking: false,
        userSpeaking: false,
        shouldShowOrb: false
      }));
      onVADMisfireCallback();
    }
  });

  // Enhanced error recovery with retry logic
  const retryVADInitialization = useCallback(() => {
    if (retryCountRef.current >= maxRetries) {
      console.error(
        `VAD: Maximum retry attempts (${maxRetries}) reached, giving up`
      );
      return;
    }

    retryCountRef.current += 1;
    const retryDelay = baseRetryDelay * Math.pow(2, retryCountRef.current - 1); // Exponential backoff

    console.log(
      `VAD: Retrying initialization (attempt ${retryCountRef.current}/${maxRetries}) in ${retryDelay}ms`
    );

    retryTimeoutRef.current = setTimeout(() => {
      setVADState(prev => ({ ...prev, errored: false }));
      // The auto-management effect will handle restarting
    }, retryDelay);
  }, [maxRetries, baseRetryDelay]);

  // Update VAD state based on hook state with retry logic
  useEffect(() => {
    const wasErrored = vadState.errored;
    const isNowErrored = Boolean(vad.errored);

    setVADState(prev => ({
      ...prev,
      loading: vad.loading || false,
      errored: isNowErrored
    }));

    // Trigger retry on new error if conditions are met
    if (
      !wasErrored &&
      isNowErrored &&
      context.isAuthenticated &&
      context.audioEnabled &&
      context.settingsLoaded
    ) {
      console.log("VAD: Error detected, initiating retry logic");
      retryVADInitialization();
    }

    // Reset retry count on successful recovery
    if (wasErrored && !isNowErrored) {
      console.log("VAD: Error cleared, resetting retry count");
      retryCountRef.current = 0;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = undefined;
      }
    }
  }, [
    vad.loading,
    vad.errored,
    vadState.errored,
    context.isAuthenticated,
    context.audioEnabled,
    context.settingsLoaded,
    retryVADInitialization
  ]);

  // State validation utility
  const validateVADState = useCallback(() => {
    const issues = [];

    if (isActiveRef.current && vad.errored) {
      issues.push("VAD marked as active but is in error state");
    }

    if (isActiveRef.current && !audioStream) {
      issues.push("VAD marked as active but no audio stream available");
    }

    if (vadState.userSpeaking && !isActiveRef.current) {
      issues.push("User speaking detected but VAD not active");
    }

    if (issues.length > 0) {
      console.warn("VAD State validation issues:", issues);

      // Auto-correct common issues
      if (isActiveRef.current && (vad.errored || !audioStream)) {
        console.log("VAD: Auto-correcting invalid active state");
        isActiveRef.current = false;
        setVADState(prev => ({
          ...prev,
          userSpeaking: false,
          actualUserSpeaking: false,
          shouldShowOrb: false
        }));
      }
    }

    return issues.length === 0;
  }, [vad.errored, audioStream, vadState.userSpeaking]);

  // Periodic state validation (development mode only)
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const validationInterval = setInterval(validateVADState, 5000);
      return () => clearInterval(validationInterval);
    }
  }, [validateVADState]);

  // Auto-manage VAD based on context
  useEffect(() => {
    if (
      !context.isAuthenticated ||
      !context.audioEnabled ||
      !context.settingsLoaded
    ) {
      if (isActiveRef.current) {
        console.log(
          "VAD: Pausing due to authentication/audio disabled/settings not loaded"
        );
        vad.pause();
        isActiveRef.current = false;
      }
      return;
    }

    if (vad.loading || vad.errored) {
      return;
    }

    if (!audioStream) {
      console.log("VAD: Waiting for audio stream before starting");
      return;
    }

    if (!isActiveRef.current) {
      console.log("VAD: Starting automatically");
      validateVADState(); // Validate before auto-starting
      vad.start();
      isActiveRef.current = true;
    }
  }, [
    context.isAuthenticated,
    context.audioEnabled,
    context.settingsLoaded,
    vad.loading,
    vad.errored,
    audioStream,
    validateVADState
  ]);

  const start = useCallback(() => {
    if (
      !context.isAuthenticated ||
      !context.audioEnabled ||
      !context.settingsLoaded
    ) {
      console.log(
        "VAD: Cannot start - not authenticated, audio disabled, or settings not loaded"
      );
      return;
    }

    if (vad.loading || vad.errored) {
      console.log("VAD: Cannot start - loading or errored");
      return;
    }

    if (!audioStream) {
      console.log("VAD: Cannot start - no audio stream available");
      return;
    }

    if (!isActiveRef.current) {
      console.log("VAD: Starting manually");
      validateVADState(); // Validate before starting
      vad.start();
      isActiveRef.current = true;
    }
  }, [
    context.isAuthenticated,
    context.audioEnabled,
    context.settingsLoaded,
    vad.loading,
    vad.errored,
    audioStream,
    validateVADState
  ]);

  const pause = useCallback(() => {
    if (isActiveRef.current) {
      console.log("VAD: Pausing manually");
      vad.pause();
      isActiveRef.current = false;
    }
  }, []);

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = undefined;
      }
    };
  }, []);

  // Memoize the state object to prevent infinite re-renders
  const memoizedState = useMemo(
    () => ({
      loading: vadState.loading,
      errored: vadState.errored,
      userSpeaking: vadState.shouldShowOrb,
      actualUserSpeaking: vadState.actualUserSpeaking
    }),
    [
      vadState.loading,
      vadState.errored,
      vadState.shouldShowOrb,
      vadState.actualUserSpeaking
    ]
  );

  // Memoize the entire return object
  return useMemo(
    () => ({
      state: memoizedState,
      start,
      pause,
      isRunning: isActiveRef.current,
      audioStream: audioStream
    }),
    [memoizedState, start, pause, audioStream]
  );
}
