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
    console.log("VAD: onSpeechStart");
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
      console.log("VAD: onSpeechEnd");
      setVADState(prev => ({
        ...prev,
        actualUserSpeaking: false,
        shouldShowOrb: false
      }));

      config.onSpeechEnd?.(audio);
    },
    [config.onSpeechEnd]
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
