"use client";

import { track } from "@vercel/analytics";
import { useTranslations } from "next-intl";
import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { toast } from "sonner";

// Debounce utility for high-frequency updates
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Components
import ChatForm from "@/components/ChatForm";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import MessageDisplay from "@/components/MessageDisplay";
import NotificationButton from "@/components/NotificationButton";
import NotificationModal from "@/components/NotificationModal";
import NotificationStatus from "@/components/NotificationStatus";
import {
  PerformanceMonitor,
  useRenderTracking
} from "@/components/PerformanceMonitor";
import Settings from "@/components/Settings";
import SettingsButton from "@/components/SettingsButton";
import VoiceOrb from "@/components/VoiceOrb";

// Services and utilities
import { AgentCoreService } from "@/lib/agentCore";

// Hooks
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useLocaleManager } from "@/hooks/useLocaleManager";
import { useNotificationHandlers } from "@/hooks/useNotificationHandlers";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { useAuth } from "@/lib/hooks/useAuth";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { usePusher } from "@/lib/hooks/usePusher";
import { useSettings } from "@/lib/hooks/useSettings";
import {
  getVADConfigForSensitivity,
  useVADManager
} from "@/lib/hooks/useVADManager";
import { useWebMRecorder } from "@/lib/hooks/useWebMRecorder";

// Types

interface AgentCoreState {
  instance: AgentCoreService | null;
  isInitialized: boolean;
}

export default function Home() {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);

  // Agent Core state
  const [agentCore, setAgentCore] = useState<AgentCoreState>({
    instance: null,
    isInitialized: false
  });

  // Core hooks
  const auth = useAuth();
  const { settings, updateSettings, isLoaded: settingsLoaded } = useSettings();
  const { addNotification } = useNotifications();
  const localeManager = useLocaleManager();

  // Voice chat functionality
  const voiceChat = useVoiceChat({ settings, auth });

  // Notification handlers
  const notificationHandlers = useNotificationHandlers({
    auth,
    addNotification,
    submit: voiceChat.submit
  });

  // Initialize Agent Core service
  useEffect(() => {
    if (!agentCore.instance && auth.isAuthenticated) {
      console.log("Creating new AgentCore instance");
      setAgentCore({
        instance: new AgentCoreService(() => {
          console.log("401 detected - triggering logout from AgentCore");
          auth.logout();
        }),
        isInitialized: false
      });
    }
  }, [agentCore.instance, auth.isAuthenticated, auth]);

  // Initialize Agent Core chat session after authentication
  useEffect(() => {
    const initAgentCore = async () => {
      // Debug: Log all initialization conditions
      console.log("AgentCore init check:", {
        isAuthenticated: auth.isAuthenticated,
        isInitialized: agentCore.isInitialized,
        hasInstance: !!agentCore.instance,
        isLocaleInitialized: localeManager.isLocaleInitialized,
        locale: localeManager.getCurrentLocale()
      });

      if (
        auth.isAuthenticated &&
        !agentCore.isInitialized &&
        agentCore.instance &&
        localeManager.isLocaleInitialized
      ) {
        try {
          const accessToken = auth.getToken();
          if (accessToken) {
            const currentLocale = localeManager.getCurrentLocale();
            console.log("Initializing Agent Core with locale:", currentLocale);

            await agentCore.instance.initChat(accessToken, {
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              clientDatetime: new Date().toISOString(),
              locale: currentLocale
            });

            setAgentCore(prev => ({
              ...prev,
              isInitialized: true
            }));

            console.log("Agent Core chat session initialized");
          } else {
            console.warn(
              "No access token available for AgentCore initialization"
            );
          }
        } catch (error) {
          console.error("Failed to initialize Agent Core:", error);
        }
      } else {
        console.log("AgentCore initialization skipped - conditions not met");
      }
    };

    initAgentCore();
  }, [
    auth.isAuthenticated,
    agentCore.isInitialized,
    agentCore.instance,
    localeManager.isLocaleInitialized
    // Removed function references that change on every render
  ]);

  // Reset agent core state on logout
  useEffect(() => {
    if (!auth.isAuthenticated) {
      voiceChat.stopCurrentRequest();
      setAgentCore({
        instance: null,
        isInitialized: false
      });
    }
  }, [auth.isAuthenticated]); // Remove voiceChat dependency

  // Keyboard shortcuts
  useKeyboardShortcuts({
    isAuthenticated: auth.isAuthenticated,
    inputRef,
    updateChatState: voiceChat.updateChatState
  });

  // Initialize audio player when enabled
  useEffect(() => {
    if (settings.audioEnabled && !voiceChat.player?.isPlayerInitialized) {
      voiceChat.player?.initAudioPlayer();
    }
  }, [settings.audioEnabled]); // Remove voiceChat.player dependency

  // Refs for VAD and WebM recording
  const vadManagerRef = useRef<any>(null);
  const webmRecorderRef = useRef<any>(null);

  // VAD callbacks with performance optimization
  const onSpeechStart = useCallback(() => {
    if (!auth.isAuthenticated) return;

    // Start WebM recording
    const recorder = webmRecorderRef.current;
    if (recorder?.state.isAvailable && !recorder.state.isRecording) {
      console.log("Starting WebM recording");
      recorder.startRecording();
    }

    // Interrupt current stream when user starts speaking
    if (voiceChat.chatState.message || voiceChat.chatState.isStreaming) {
      console.log("Interrupting current stream - user started speaking");
      voiceChat.stopCurrentRequest();
    }
  }, [
    auth.isAuthenticated,
    voiceChat.stopCurrentRequest,
    voiceChat.chatState.message,
    voiceChat.chatState.isStreaming
  ]);

  const onSpeechEnd = useCallback(
    async (isValid: boolean, _audio: Float32Array) => {
      if (!auth.isAuthenticated) return;

      try {
        // Stop WebM recording and get the blob directly
        const recorder = webmRecorderRef.current;
        if (recorder?.state.isRecording) {
          console.log("Stopping WebM recording");
          const webmBlob = await recorder.stopRecording();

          if (webmBlob && isValid) {
            console.log("WebM recording completed, blob size:", webmBlob.size);

            // Submit the audio as WebM
            startTransition(() => voiceChat.submit(webmBlob));

            track("Speech input");
          } else {
            console.warn("No WebM blob received from recorder");
          }
        } else {
          console.warn("WebM recorder was not recording when speech ended");
        }
      } catch (error) {
        console.error("Error with WebM recording:", error);
      }
    },
    [auth.isAuthenticated, voiceChat.submit]
  );

  const onVADMisfire = useCallback(async () => {
    // Stop the WebM recorder on a VAD misfire
    console.log("VAD misfire detected");
    try {
      // Stop WebM recording and get the blob directly
      const recorder = webmRecorderRef.current;
      if (recorder?.state.isRecording) {
        console.log("Stopping WebM recording on VAD misfire and do nothing");
        await recorder.stopRecording();
      } else {
        console.warn("WebM recorder was not recording when VAD misfire");
      }

      // No browser-specific VAD handling needed
    } catch (error) {
      console.error("Error with WebM recording:", error);
    }
  }, []);

  // Memoize VAD configuration to prevent unnecessary recalculations
  const vadConfig = useMemo(
    () => getVADConfigForSensitivity(settings.vadSensitivity),
    [settings.vadSensitivity]
  );

  const vadCallbacks = useMemo(
    () => ({
      onSpeechStart,
      onSpeechEnd,
      onVADMisfire
    }),
    [onSpeechStart, onSpeechEnd, onVADMisfire]
  );

  // Extract streaming state separately to avoid infinite loops
  const isStreaming = voiceChat.chatState.isStreaming;

  const vadManagerState = useMemo(
    () => ({
      isStreaming,
      isAuthenticated: auth.isAuthenticated,
      audioEnabled: settings.audioEnabled,
      settingsLoaded: settingsLoaded
    }),
    [isStreaming, auth.isAuthenticated, settings.audioEnabled, settingsLoaded]
  );

  // VAD Manager setup
  const vadManager = useVADManager(vadConfig, vadCallbacks, vadManagerState);
  const vadState = vadManager.state;

  // Debounce VAD state updates to prevent excessive re-renders
  const debouncedVadState = useDebounce(vadState, 50);

  // WebM Recorder setup - uses same audio stream as VAD
  const webmRecorder = useWebMRecorder(vadManager.audioStream);

  // Update refs
  React.useEffect(() => {
    vadManagerRef.current = vadManager;
    webmRecorderRef.current = webmRecorder;
  }, [vadManager, webmRecorder]);

  // Pusher integration with notification handlers
  const pusher = usePusher({
    isAuthenticated: auth.isAuthenticated,
    getToken: auth.getToken,
    eventHandlers: {
      onEmailNotification: notificationHandlers.handleEmailNotification,
      onCalendarUpcoming: notificationHandlers.handleCalendarUpcoming,
      onCalendarNew: notificationHandlers.handleCalendarNew,
      onSystemNotification: notificationHandlers.handleSystemNotification,
      onChatMessage: notificationHandlers.handleChatMessage
    }
  });

  // Global error handler for VAD worker errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (
        event.message &&
        event.message.includes("replace is not a function")
      ) {
        console.log("VAD: Caught worker error, attempting to restart VAD");
        event.preventDefault();

        // Try to restart VAD after a delay
        setTimeout(() => {
          if (auth.isAuthenticated && settings.audioEnabled) {
            vadManagerRef.current?.start();
          }
        }, 2000);
      }
    };

    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, [auth.isAuthenticated, settings.audioEnabled]); // Removed vadManager dependency

  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!auth.isAuthenticated) {
        toast.error(t("auth.loginToContinue"));
        return;
      }
      // Get current input value directly from the form element
      const formData = new FormData(e.target as HTMLFormElement);
      const inputValue = (formData.get("chatInput") as string) || "";
      startTransition(() => voiceChat.submit(inputValue));
    },
    [auth.isAuthenticated, t, voiceChat.submit]
  );

  const handleLogout = useCallback(async () => {
    try {
      voiceChat.stopCurrentRequest();
      voiceChat.resetMessages();
      await auth.logout();
      toast.success(t("success.signedOut"));
    } catch (error) {
      console.error("Failed to logout:", error);
      toast.error(t("errors.signOutFailed"));
    }
  }, [voiceChat.stopCurrentRequest, voiceChat.resetMessages, auth.logout, t]);

  const handleSettingsChange = useCallback(
    (newSettings: typeof settings) => {
      updateSettings(newSettings);
      console.log("Settings updated:", newSettings);
    },
    [updateSettings]
  );

  const handleClearHistory = useCallback(async () => {
    if (!auth.isAuthenticated) {
      toast.error(t("settings.clearHistoryLoginRequired"));
      return;
    }

    if (!agentCore.instance) {
      toast.error(t("settings.clearHistoryNotInitialized"));
      return;
    }

    try {
      const accessToken = auth.getToken();
      if (accessToken) {
        const currentLocale = localeManager.getCurrentLocale();
        await agentCore.instance.clearHistory(accessToken, {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          clientDatetime: new Date().toISOString(),
          locale: currentLocale
        });
        toast.success(t("settings.clearHistorySuccess"));
      } else {
        toast.error(t("settings.clearHistoryNoToken"));
      }
    } catch (error) {
      console.error("Failed to clear chat history:", error);
      toast.error(t("settings.clearHistoryFailed"));
    }
  }, [
    auth.isAuthenticated,
    agentCore.instance,
    t
    // Removed function references that change on every render
  ]);

  // Performance monitoring in development (after all hooks are defined)
  // Only track stable properties to avoid re-renders from streaming message updates
  useRenderTracking("HomePage", [
    auth.isAuthenticated,
    voiceChat.chatState.isStreaming, // Only track streaming state, not the changing message
    settings.audioEnabled, // Only track relevant settings that affect rendering
    debouncedVadState.userSpeaking // Use debounced VAD state
  ]);

  return (
    <>
      <PerformanceMonitor componentName="HomePage" />
      <div className="pb-4 min-h-28" />

      {!auth.isAuthenticated && <GoogleLoginButton disabled={auth.loading} />}

      <ChatForm
        isAuthenticated={auth.isAuthenticated}
        isSettingsOpen={isSettingsOpen}
        input={voiceChat.chatState.input}
        isPending={voiceChat.isPending}
        isStreaming={voiceChat.chatState.isStreaming}
        onInputChange={value => voiceChat.updateChatState({ input: value })}
        onSubmit={handleFormSubmit}
        inputRef={inputRef}
      />

      <MessageDisplay
        isSettingsOpen={isSettingsOpen}
        authLoading={auth.loading}
        isAuthenticated={auth.isAuthenticated}
        currentMessage={voiceChat.chatState.message}
        messages={voiceChat.messages}
        vadState={debouncedVadState}
      />

      {/* Memoize VoiceOrb props to prevent unnecessary re-renders */}
      <VoiceOrb
        isAuthenticated={auth.isAuthenticated}
        isLoading={debouncedVadState.loading}
        isErrored={debouncedVadState.errored}
        isUserSpeaking={debouncedVadState.userSpeaking}
        hasMessage={!!voiceChat.chatState.message}
      />

      <SettingsButton onClick={() => setIsSettingsOpen(true)} />

      {/* Connected Status - Center Top */}
      {auth.isAuthenticated && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-10">
          <NotificationStatus
            status={pusher.status}
            statusText={pusher.statusText}
          />
        </div>
      )}

      {/* Notification Button - Top Right */}
      {auth.isAuthenticated && (
        <div className="fixed top-4 right-4 z-10">
          <NotificationButton
            onClick={() => setIsNotificationModalOpen(true)}
          />
        </div>
      )}

      {/* Settings Component */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={handleLogout}
        onClearHistory={handleClearHistory}
        isAuthenticated={auth.isAuthenticated}
        settings={settings}
        settingsLoaded={settingsLoaded}
        onSettingsChange={handleSettingsChange}
      />

      {/* Notification Modal */}
      <NotificationModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
      />

      {/* Privacy Policy Link and Company Disclaimer */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex flex-col items-center space-y-2">
          <a
            href="/privacy"
            className="text-xs text-gray-400 hover:text-gray-300 transition-colors underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-sm"
          >
            {t("privacy.title")}
          </a>
          <p className="text-xs text-gray-500 text-center" role="contentinfo">
            © 2025 Friday Intelligence Inc. All rights reserved.
          </p>
        </div>
      </div>
    </>
  );
}
