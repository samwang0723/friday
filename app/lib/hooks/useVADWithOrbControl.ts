import { useMicVAD } from "@ricky0123/vad-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface VADOrbConfig {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  isStreaming?: boolean;
  positiveSpeechThreshold?: number;
  minSpeechFrames?: number;
}

interface VADOrbState {
  loading: boolean;
  errored: boolean;
  actualUserSpeaking: boolean; // Real user speech detection
  shouldShowOrb: boolean; // Visual indicator for orb
}

export function useVADWithOrbControl(config: VADOrbConfig) {
  const vadRef = useRef<any>(null);
  const [vadState, setVADState] = useState<VADOrbState>({
    loading: true,
    errored: false,
    actualUserSpeaking: false,
    shouldShowOrb: false
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

    // Filter out speech detection that happens very soon after audio starts
    // This is likely echo from the speakers
    const isLikelyEcho = config.isStreaming && timeSinceAudioStart < 1000;

    setVADState(prev => ({
      ...prev,
      actualUserSpeaking: true,
      shouldShowOrb: !isLikelyEcho // Don't show orb if it's likely echo
    }));

    // Only trigger interruption for actual user speech, not echo
    if (!isLikelyEcho) {
      config.onSpeechStart?.();
    }
  }, [config.isStreaming, config.onSpeechStart]);

  const onSpeechEnd = useCallback(
    (audio: Float32Array) => {
      setVADState(prev => ({
        ...prev,
        actualUserSpeaking: false,
        shouldShowOrb: false
      }));

      config.onSpeechEnd?.(audio);
    },
    [config.onSpeechEnd]
  );

  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechStart,
    onSpeechEnd,
    positiveSpeechThreshold: config.positiveSpeechThreshold || 0.6,
    minSpeechFrames: config.minSpeechFrames || 4
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
