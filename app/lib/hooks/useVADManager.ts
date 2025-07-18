import { useMicVAD } from "@ricky0123/vad-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Calculate RMS energy in dBFS from audio samples
function calculateRMSdBFS(audioData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  const rms = Math.sqrt(sum / audioData.length);
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

// Calculate spectral centroid for frequency analysis
function calculateSpectralCentroid(audioData: Float32Array): number {
  const fftSize = 2048;
  const sampleRate = 16000;
  const fft = new Float32Array(fftSize);
  
  for (let i = 0; i < Math.min(audioData.length, fftSize); i++) {
    fft[i] = audioData[i];
  }

  let magnitude = 0;
  let weightedSum = 0;

  for (let i = 0; i < fftSize / 2; i++) {
    const freq = (i * sampleRate) / fftSize;
    const mag = Math.abs(fft[i]);
    magnitude += mag;
    weightedSum += freq * mag;
  }
  
  return magnitude > 0 ? weightedSum / magnitude : 0;
}

// Enhanced speech detection using multiple audio features
function isSpeechLike(
  audio: Float32Array,
  config: VADConfig,
  isStreaming?: boolean
): boolean {
  const rmsLevel = calculateRMSdBFS(audio);
  const spectralCentroid = calculateSpectralCentroid(audio);

  const rmsThreshold = isStreaming ? -40 : config.rmsEnergyThreshold || -35;
  const centroidThreshold = isStreaming
    ? 800
    : config.spectralCentroidThreshold || 1000;

  if (rmsLevel < rmsThreshold) {
    return false;
  }

  if (spectralCentroid < centroidThreshold) {
    return false;
  }

  return true;
}

export interface VADConfig {
  positiveSpeechThreshold?: number;
  minSpeechFrames?: number;
  rmsEnergyThreshold?: number;
  minSpeechDuration?: number;
  spectralCentroidThreshold?: number;
}

export interface VADCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
}

export interface VADContext {
  isStreaming?: boolean;
  isAuthenticated?: boolean;
  audioEnabled?: boolean;
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
    speechStartTime: 0,
    lastSpeechTime: 0,
    shouldShowOrb: false
  });

  const audioStartTimeRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(false);

  // Track when audio starts for echo detection
  useEffect(() => {
    if (context.isStreaming) {
      audioStartTimeRef.current = Date.now();
    }
  }, [context.isStreaming]);

  const onSpeechStart = useCallback(() => {
    const now = Date.now();
    const timeSinceAudioStart = now - audioStartTimeRef.current;
    console.log("VAD: Speech detected");

    // Filter out speech detection that happens very soon after audio starts
    const isLikelyEcho = context.isStreaming && timeSinceAudioStart < 1000;

    setVADState(prev => ({
      ...prev,
      actualUserSpeaking: true,
      userSpeaking: !isLikelyEcho,
      shouldShowOrb: !isLikelyEcho,
      speechStartTime: now,
      lastSpeechTime: now
    }));

    // Only trigger interruption for actual user speech, not echo
    if (!isLikelyEcho) {
      callbacks.onSpeechStart?.();
    }
  }, [context.isStreaming, callbacks.onSpeechStart]);

  const onSpeechEnd = useCallback(
    (audio: Float32Array) => {
      const now = Date.now();
      console.log("VAD: Speech ended");

      // Apply multi-layer speech filtering
      const speechAnalysis = {
        rmsLevel: calculateRMSdBFS(audio),
        spectralCentroid: calculateSpectralCentroid(audio),
        duration: now - vadState.speechStartTime,
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
        `VAD: Analysis - RMS: ${speechAnalysis.rmsLevel.toFixed(2)}dBFS, Centroid: ${speechAnalysis.spectralCentroid.toFixed(0)}Hz, Duration: ${speechAnalysis.duration}ms, Valid: ${speechAnalysis.isValid}`
      );

      setVADState(prev => ({
        ...prev,
        actualUserSpeaking: false,
        userSpeaking: false,
        shouldShowOrb: false,
        ...(speechAnalysis.isValid && { lastSpeechTime: now })
      }));

      // Only trigger callback for valid speech
      if (speechAnalysis.isValid) {
        callbacks.onSpeechEnd?.(audio);
      } else {
        console.log("VAD: Speech filtered out, not calling onSpeechEnd");
      }
    },
    [
      config,
      context.isStreaming,
      callbacks.onSpeechEnd,
      vadState.speechStartTime
    ]
  );

  // Create enhanced audio stream
  const [audioStream, setAudioStream] = useState<MediaStream | undefined>();

  useEffect(() => {
    const createEnhancedStream = async () => {
      if (!context.isAuthenticated || !context.audioEnabled) {
        setAudioStream(undefined);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        setAudioStream(stream);
      } catch (error) {
        console.error("VAD: Failed to create audio stream:", error);
        setVADState(prev => ({ ...prev, errored: true }));
      }
    };

    createEnhancedStream();

    return () => {
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [context.isAuthenticated, context.audioEnabled]);

  // Initialize VAD with error handling
  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechStart,
    onSpeechEnd,
    onVADMisfire: () => {
      console.log("VAD: Misfire detected");
    },
    positiveSpeechThreshold: config.positiveSpeechThreshold || 0.7,
    minSpeechFrames: config.minSpeechFrames || 6,
    stream: audioStream
  });

  // Update VAD state based on hook state
  useEffect(() => {
    setVADState(prev => ({
      ...prev,
      loading: vad.loading || false,
      errored: Boolean(vad.errored)
    }));
  }, [vad.loading, vad.errored]);

  // Auto-manage VAD based on context
  useEffect(() => {
    if (!context.isAuthenticated || !context.audioEnabled) {
      if (isActiveRef.current) {
        console.log("VAD: Pausing due to authentication/audio disabled");
        vad.pause();
        isActiveRef.current = false;
      }
      return;
    }

    if (vad.loading || vad.errored) {
      return;
    }

    if (!isActiveRef.current) {
      console.log("VAD: Starting automatically");
      vad.start();
      isActiveRef.current = true;
    }
  }, [context.isAuthenticated, context.audioEnabled, vad.loading, vad.errored]);

  const start = useCallback(() => {
    if (!context.isAuthenticated || !context.audioEnabled) {
      console.log("VAD: Cannot start - not authenticated or audio disabled");
      return;
    }

    if (vad.loading || vad.errored) {
      console.log("VAD: Cannot start - loading or errored");
      return;
    }

    if (!isActiveRef.current) {
      console.log("VAD: Starting manually");
      vad.start();
      isActiveRef.current = true;
    }
  }, [context.isAuthenticated, context.audioEnabled, vad.loading, vad.errored]);

  const pause = useCallback(() => {
    if (isActiveRef.current) {
      console.log("VAD: Pausing manually");
      vad.pause();
      isActiveRef.current = false;
    }
  }, []);

  return {
    state: {
      loading: vadState.loading,
      errored: vadState.errored,
      userSpeaking: vadState.shouldShowOrb,
      actualUserSpeaking: vadState.actualUserSpeaking
    },
    start,
    pause,
    isRunning: isActiveRef.current
  };
}