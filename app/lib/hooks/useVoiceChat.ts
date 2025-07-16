/**
 * Voice Chat Hook
 * Manages voice chat functionality including VAD, transcription, and TTS
 */

import { useRef, useEffect, useState } from "react";
import { usePlayer } from "@/lib/usePlayer";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import { AgentCoreService } from "@/lib/agentCore";
import { track } from "@vercel/analytics";

interface VoiceChatState {
  isStreaming: boolean;
  message: string;
  input: string;
  agentCoreInitialized: boolean;
}

interface VoiceChatConfig {
  sttEngine: string;
  ttsEngine: string;
}

export function useVoiceChat(
  isAuthenticated: boolean,
  getToken: () => string | null,
  config: VoiceChatConfig,
  onSpeechEnd?: (audio: Blob) => void
) {
  const player = usePlayer();
  const agentCoreRef = useRef<AgentCoreService | null>(null);
  const currentRequestRef = useRef<AbortController | null>(null);

  const [chatState, setChatState] = useState<VoiceChatState>({
    isStreaming: false,
    message: "",
    input: "",
    agentCoreInitialized: false
  });

  // Initialize Agent Core service
  useEffect(() => {
    if (!agentCoreRef.current) {
      agentCoreRef.current = new AgentCoreService();
    }
  }, []);

  // Initialize Agent Core chat session after authentication
  useEffect(() => {
    const initAgentCore = async () => {
      if (isAuthenticated && !chatState.agentCoreInitialized && agentCoreRef.current) {
        try {
          const accessToken = getToken();
          if (accessToken) {
            await agentCoreRef.current.initChat(accessToken, {
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              clientDatetime: new Date().toISOString()
            });
            setChatState(prev => ({
              ...prev,
              agentCoreInitialized: true
            }));
            console.log("Agent Core chat session initialized");
          }
        } catch (error) {
          console.error("Failed to initialize Agent Core:", error);
        }
      }
    };

    initAgentCore();
  }, [isAuthenticated, chatState.agentCoreInitialized, getToken]);

  const vad = useMicVAD({
    startOnLoad: isAuthenticated,
    onSpeechStart: () => {
      if (!isAuthenticated) return;

      // Interrupt immediately when user starts speaking
      if (chatState.message || chatState.isStreaming) {
        console.log("Interrupting current stream - user started speaking");

        // Cancel current request immediately
        if (currentRequestRef.current) {
          console.log("Cancelling current request due to speech start");
          currentRequestRef.current.abort();
          currentRequestRef.current = null;
        }

        // Stop audio playback immediately
        player.stop();

        // Reset streaming state immediately
        setChatState(prev => ({
          ...prev,
          isStreaming: false,
          message: ""
        }));
      }
    },
    onSpeechEnd: (audio) => {
      if (!isAuthenticated) return;

      // Stop any remaining audio playback before processing new input
      player.stop();

      // Process the completed speech input
      const wav = utils.encodeWAV(audio);
      const blob = new Blob([wav], { type: "audio/wav" });
      
      // Call the provided callback with the audio blob
      if (onSpeechEnd) {
        onSpeechEnd(blob);
      }
      
      track("Speech input");
      
      const isFirefox = navigator.userAgent.includes("Firefox");
      if (isFirefox) vad.pause();
    },
    positiveSpeechThreshold: 0.6,
    minSpeechFrames: 4
  });

  // VAD management
  useEffect(() => {
    if (isAuthenticated && vad && !vad.loading && !vad.errored) {
      vad.start();
    } else if (!isAuthenticated && vad) {
      vad.pause();
    }
  }, [isAuthenticated, vad]);

  const updateChatState = (updates: Partial<VoiceChatState>) => {
    setChatState(prev => ({ ...prev, ...updates }));
  };

  const stopCurrentRequest = () => {
    if (currentRequestRef.current) {
      currentRequestRef.current.abort();
      currentRequestRef.current = null;
    }
    player.stop();
  };

  const resetChat = () => {
    setChatState({
      isStreaming: false,
      message: "",
      input: "",
      agentCoreInitialized: false
    });
  };

  return {
    chatState,
    updateChatState,
    vad,
    player,
    agentCoreRef,
    currentRequestRef,
    stopCurrentRequest,
    resetChat
  };
}