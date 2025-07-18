import { useMicVAD } from "@ricky0123/vad-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Calculate RMS energy in dBFS from audio samples
function calculateRMSdBFS(audioData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  const rms = Math.sqrt(sum / audioData.length);
  // Convert to dBFS (reference level = 1.0)
  return rms > 0 ? 20 * Math.log10(rms) : -100; // -100 dBFS for silence
}

// Calculate spectral centroid to distinguish speech from noise
function calculateSpectralCentroid(
  audioData: Float32Array,
  sampleRate: number = 16000
): number {
  const fftSize = 1024;
  const halfSize = fftSize / 2;

  // Create a simple DFT for spectral analysis
  const magnitudes = new Float32Array(halfSize);
  const frequencies = new Float32Array(halfSize);

  // Calculate magnitude spectrum
  for (let k = 0; k < halfSize; k++) {
    let real = 0;
    let imag = 0;

    for (let n = 0; n < Math.min(audioData.length, fftSize); n++) {
      const angle = (-2 * Math.PI * k * n) / fftSize;
      real += audioData[n] * Math.cos(angle);
      imag += audioData[n] * Math.sin(angle);
    }

    magnitudes[k] = Math.sqrt(real * real + imag * imag);
    frequencies[k] = (k * sampleRate) / fftSize;
  }

  // Calculate weighted centroid
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < halfSize; i++) {
    numerator += frequencies[i] * magnitudes[i];
    denominator += magnitudes[i];
  }

  return denominator > 0 ? numerator / denominator : 0;
}

// Check if audio has speech-like characteristics
function isSpeechLike(audioData: Float32Array, config: VADOrbConfig): boolean {
  // RMS energy check
  if (config.rmsEnergyThreshold !== undefined) {
    const rmsLevel = calculateRMSdBFS(audioData);
    if (rmsLevel < config.rmsEnergyThreshold) {
      return false;
    }
  }

  // Spectral centroid check (speech typically has centroid between 500-3000 Hz)
  if (config.spectralCentroidThreshold !== undefined) {
    const centroid = calculateSpectralCentroid(audioData);
    if (centroid < 200 || centroid > 4000) {
      console.log(
        `VAD: Spectral centroid ${centroid.toFixed(0)}Hz outside speech range`
      );
      return false;
    }
  }

  return true;
}

interface VADOrbConfig {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  isStreaming?: boolean;
  positiveSpeechThreshold?: number;
  minSpeechFrames?: number;
  rmsEnergyThreshold?: number; // RMS energy threshold in dBFS (e.g., -40)
  minSpeechDuration?: number; // Minimum speech duration in ms (e.g., 500)
  maxSpeechGap?: number; // Maximum gap between speech segments in ms (e.g., 300)
  spectralCentroidThreshold?: number; // Frequency analysis threshold (e.g., 1000 Hz)
}

interface VADOrbState {
  loading: boolean;
  errored: boolean;
  actualUserSpeaking: boolean; // Real user speech detection
  shouldShowOrb: boolean; // Visual indicator for orb
  speechStartTime: number; // Timestamp when speech started
  lastSpeechTime: number; // Timestamp of last speech detection
}

export function useVADWithOrbControl(config: VADOrbConfig) {
  const vadRef = useRef<any>(null);
  const [vadState, setVADState] = useState<VADOrbState>({
    loading: true,
    errored: false,
    actualUserSpeaking: false,
    shouldShowOrb: false,
    speechStartTime: 0,
    lastSpeechTime: 0
  });

  // Track when audio playback started to filter out immediate echo
  const audioStartTimeRef = useRef<number>(0);

  // Update audio start time when streaming begins
  useEffect(() => {
    if (config.isStreaming) {
      audioStartTimeRef.current = Date.now();
    }
  }, [config.isStreaming]);

  const onSpeechStart = useCallback(() => {
    const now = Date.now();
    const timeSinceAudioStart = now - audioStartTimeRef.current;
    console.log("VAD: onSpeechStart");

    // Filter out speech detection that happens very soon after audio starts
    // This is likely echo from the speakers
    const isLikelyEcho = config.isStreaming && timeSinceAudioStart < 1000;

    setVADState(prev => ({
      ...prev,
      actualUserSpeaking: true,
      shouldShowOrb: !isLikelyEcho, // Don't show orb if it's likely echo
      speechStartTime: now,
      lastSpeechTime: now
    }));

    // Only trigger interruption for actual user speech, not echo
    if (!isLikelyEcho) {
      config.onSpeechStart?.();
    }
  }, [config.isStreaming, config.onSpeechStart]);

  const onSpeechEnd = useCallback(
    (audio: Float32Array) => {
      const now = Date.now();
      console.log("VAD: onSpeechEnd");

      // Apply multi-layer speech filtering
      const speechAnalysis = {
        rmsLevel: calculateRMSdBFS(audio),
        spectralCentroid: calculateSpectralCentroid(audio),
        duration: 0,
        isValid: true
      };

      setVADState(prev => {
        speechAnalysis.duration = now - prev.speechStartTime;

        // Duration check - ignore very short sounds (< 200ms) like coughs, clicks
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
        if (speechAnalysis.isValid && !isSpeechLike(audio, config)) {
          console.log(`VAD: Audio failed speech-like analysis`);
          speechAnalysis.isValid = false;
        }

        console.log(
          `VAD: Analysis - RMS: ${speechAnalysis.rmsLevel.toFixed(2)}dBFS, Centroid: ${speechAnalysis.spectralCentroid.toFixed(0)}Hz, Duration: ${speechAnalysis.duration}ms, Valid: ${speechAnalysis.isValid}`
        );

        if (!speechAnalysis.isValid) {
          return {
            ...prev,
            actualUserSpeaking: false,
            shouldShowOrb: false
          };
        }

        return {
          ...prev,
          actualUserSpeaking: false,
          shouldShowOrb: false,
          lastSpeechTime: now
        };
      });

      // Only trigger callback for valid speech
      if (speechAnalysis.isValid) {
        config.onSpeechEnd?.(audio);
      } else {
        console.log("VAD: Speech filtered out, not calling onSpeechEnd");
      }
    },
    [config]
  );

  const [audioStream, setAudioStream] = useState<MediaStream | undefined>();

  // Create enhanced audio stream on mount
  useEffect(() => {
    const createEnhancedStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
            sampleRate: 16000,
            channelCount: 1
          }
        });
        console.log(
          "VAD: Enhanced audio stream created with noise suppression and echo cancellation"
        );
        setAudioStream(stream);
      } catch (error) {
        console.warn(
          "VAD: Failed to create enhanced audio stream, falling back to default:",
          error
        );
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            audio: true
          });
          setAudioStream(fallbackStream);
        } catch (fallbackError) {
          console.error(
            "VAD: Failed to create any audio stream:",
            fallbackError
          );
        }
      }
    };

    createEnhancedStream();

    // Cleanup stream on unmount
    return () => {
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const onVADMisfire = useCallback(() => {
    console.log("VAD: onVADMisfire - false positive speech detection");
    setVADState(prev => ({
      ...prev,
      actualUserSpeaking: false,
      shouldShowOrb: false
    }));
  }, []);

  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechStart,
    onSpeechEnd,
    onVADMisfire,
    positiveSpeechThreshold: config.positiveSpeechThreshold || 0.6,
    minSpeechFrames: config.minSpeechFrames || 4,
    stream: audioStream
  });

  useEffect(() => {
    vadRef.current = vad;
    setVADState(prev => ({
      ...prev,
      loading: vad?.loading || false,
      errored: Boolean(vad?.errored)
    }));
  }, [vad?.loading, vad?.errored]);

  return {
    loading: vadState.loading,
    errored: vadState.errored,
    userSpeaking: vadState.shouldShowOrb, // Use filtered state for UI
    actualUserSpeaking: vadState.actualUserSpeaking, // Real detection for logic
    start: () => vadRef.current?.start(),
    pause: () => vadRef.current?.pause(),
    vad: vadRef.current
  };
}
