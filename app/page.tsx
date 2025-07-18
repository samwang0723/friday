"use client";

import ChatForm from "@/components/ChatForm";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import MessageDisplay from "@/components/MessageDisplay";
import Settings, { SettingsState } from "@/components/Settings";
import SettingsButton from "@/components/SettingsButton";
import VoiceOrb from "@/components/VoiceOrb";
import { AgentCoreService } from "@/lib/agentCore";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePlayer } from "@/lib/hooks/usePlayer";
import { useVADWithOrbControl } from "@/lib/hooks/useVADWithOrbControl";
import { utils } from "@ricky0123/vad-react";
import { track } from "@vercel/analytics";
import { useLocale, useTranslations } from "next-intl";
import React, {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { toast } from "sonner";

type Message = {
  role: "user" | "assistant";
  content: string;
  latency?: number;
};

interface ChatState {
  isStreaming: boolean;
  message: string;
  input: string;
  agentCoreInitialized: boolean;
}

// Helper function to get current locale from client-side sources
function getCurrentLocale(): string {
  if (typeof document !== "undefined") {
    // Check URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const urlLocale = urlParams.get("locale");
    if (urlLocale) {
      console.log("Found locale in URL:", urlLocale);
      return urlLocale;
    }

    // Check cookies
    const cookies = document.cookie.split(";");
    const localeCookie = cookies.find(cookie =>
      cookie.trim().startsWith("locale=")
    );
    if (localeCookie) {
      const localeValue = localeCookie.split("=")[1];
      console.log("Found locale cookie:", localeValue);
      return localeValue;
    }

    // Check localStorage as fallback
    const storedLocale = localStorage.getItem("locale");
    if (storedLocale) {
      console.log("Found locale in localStorage:", storedLocale);
      return storedLocale;
    }

    console.log("No locale found, available cookies:", document.cookie);
    console.log("Current URL:", window.location.href);
  }
  console.log("Document not available (SSR)");
  return "en"; // fallback to default
}

export default function Home() {
  const t = useTranslations();
  const locale = useLocale();

  // Map API error messages to translation keys
  const getTranslatedError = (apiErrorMessage: string): string => {
    const errorMap: Record<string, string> = {
      "Invalid audio": t("errors.invalidAudio"),
      "Request cancelled": t("errors.requestCancelled"),
      "Authorization required": t("errors.authRequired"),
      "Valid Bearer token required": t("errors.tokenRequired"),
      "Invalid request": t("errors.invalidRequest"),
      "TTS generation failed": t("errors.ttsGenerationFailed"),
      "Request failed": t("errors.requestFailed")
    };

    return errorMap[apiErrorMessage] || apiErrorMessage || t("common.error");
  };
  const [clientLocale, setClientLocale] = useState<string>("en");

  // Get locale from client-side cookie after component mounts
  useEffect(() => {
    const currentLocale = getCurrentLocale();
    setClientLocale(currentLocale);
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const player = usePlayer();
  const agentCoreRef = useRef<AgentCoreService | null>(null);
  const currentRequestRef = useRef<AbortController | null>(null);

  // UI state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({
    sttEngine: "groq",
    ttsEngine: "elevenlabs",
    streaming: true
  });

  // Chat state
  const [chatState, setChatState] = useState<ChatState>({
    isStreaming: false,
    message: "",
    input: "",
    agentCoreInitialized: false
  });

  // Authentication hook
  const auth = useAuth();

  // Initialize Agent Core service
  useEffect(() => {
    if (!agentCoreRef.current) {
      agentCoreRef.current = new AgentCoreService();
    }
  }, []);

  // Initialize Agent Core chat session after authentication
  useEffect(() => {
    const initAgentCore = async () => {
      if (
        auth.isAuthenticated &&
        !chatState.agentCoreInitialized &&
        agentCoreRef.current
      ) {
        try {
          const accessToken = auth.getToken();
          if (accessToken) {
            const currentLocale = getCurrentLocale();
            console.log("Next-intl locale:", locale);
            console.log("Client locale state:", clientLocale);
            console.log("Fresh locale check:", currentLocale);
            await agentCoreRef.current.initChat(accessToken, {
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              clientDatetime: new Date().toISOString(),
              locale: currentLocale
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
  }, [auth.isAuthenticated, chatState.agentCoreInitialized, clientLocale]);

  // Helper function to update chat state
  const updateChatState = useCallback((updates: Partial<ChatState>) => {
    setChatState(prev => ({ ...prev, ...updates }));
  }, []);

  // Helper function to stop current request
  const stopCurrentRequest = useCallback(() => {
    if (currentRequestRef.current) {
      currentRequestRef.current.abort();
      currentRequestRef.current = null;
    }
  }, []);

  // Reset chat state on logout
  useEffect(() => {
    if (!auth.isAuthenticated) {
      stopCurrentRequest();
      player.stop();
      setChatState({
        isStreaming: false,
        message: "",
        input: "",
        agentCoreInitialized: false
      });
    }
  }, [auth.isAuthenticated]);

  // Define the action state
  const [messages, submit, isPending] = useActionState<
    Array<Message>,
    string | Blob
  >(async (prevMessages, data) => {
    // Handle reset case for logout
    if (typeof data === "string" && data === "__reset__") {
      return [];
    }

    if (!auth.isAuthenticated) {
      toast.error(t("auth.loginToContinue"));
      return prevMessages;
    }

    // Cancel any previous request
    if (currentRequestRef.current) {
      console.log("Cancelling previous request in submit");
      currentRequestRef.current.abort();
    }

    // Stop any ongoing audio playback
    player.stop();

    // Create new AbortController for this request
    const abortController = new AbortController();
    currentRequestRef.current = abortController;

    const formData = new FormData();

    if (typeof data === "string") {
      formData.append("input", data);
      track("Text input");
    } else {
      formData.append("input", data, "audio.wav");
      track("Speech input");
    }

    for (const message of prevMessages) {
      formData.append("message", JSON.stringify(message));
    }

    // Use current streaming setting
    formData.append("settings", JSON.stringify(settings));

    const submittedAt = Date.now();
    const accessToken = auth.getToken();
    const currentLocale = getCurrentLocale();
    const headers: HeadersInit = {};

    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    // Override browser's accept-language with user's selected locale
    if (currentLocale) {
      headers["Accept-Language"] = currentLocale;
    }

    try {
      updateChatState({
        isStreaming: true,
        message: ""
      });

      const response = await fetch("/api", {
        method: "POST",
        headers,
        body: formData,
        signal: abortController.signal
      });

      if (!response.ok) {
        updateChatState({ isStreaming: false });
        if (response.status === 401) {
          await auth.logout();
          toast.error(t("errors.sessionExpired"));
        } else if (response.status === 429) {
          toast.error(t("errors.tooManyRequests"));
        } else {
          const apiErrorMessage = await response.text();
          toast.error(getTranslatedError(apiErrorMessage));
        }
        return prevMessages;
      }

      const transcript = decodeURIComponent(
        response.headers.get("X-Transcript") || ""
      );

      if (!transcript) {
        updateChatState({ isStreaming: false });
        toast.error(t("errors.noTranscript"));
        return prevMessages;
      }

      updateChatState({ input: transcript });

      // Add user message immediately
      const userMessage: Message = {
        role: "user",
        content: transcript
      };

      const updatedMessages = [...prevMessages, userMessage];

      // Check response type to handle streaming vs single mode
      const responseType = response.headers.get("X-Response-Type");

      if (responseType === "single") {
        // Handle single response mode
        const responseText = decodeURIComponent(
          response.headers.get("X-Response-Text") || ""
        );

        if (!responseText) {
          updateChatState({ isStreaming: false });
          toast.error(t("errors.noResponse"));
          return prevMessages;
        }

        // Display the response text immediately
        updateChatState({ message: responseText });

        // Play the audio
        const audioArrayBuffer = await response.arrayBuffer();
        const audioStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(audioArrayBuffer));
            controller.close();
          }
        });

        player.play(audioStream, () => {
          const isFirefox = navigator.userAgent.includes("Firefox");
          if (isFirefox) {
            vad.start();
          }
        });

        // Create assistant message
        const assistantMessage: Message = {
          role: "assistant",
          content: responseText,
          latency: Date.now() - submittedAt
        };

        // Reset streaming state
        updateChatState({
          isStreaming: false,
          message: ""
        });

        return [...updatedMessages, assistantMessage];
      }

      // Handle SSE streaming mode
      return new Promise<Message[]>((resolve, reject) => {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";
        let displayedText = "";
        let textQueue = "";
        let typingIntervalId: NodeJS.Timeout | null = null;
        let finalLatency = 0;
        let firstPacketLatency = 0;
        let firstPacketReceived = false;
        let audioStreamStarted = false;
        let audioStreamClosed = false;

        // Typing animation function
        const startTypingAnimation = () => {
          if (typingIntervalId) return; // Already typing

          typingIntervalId = setInterval(() => {
            if (textQueue.length > 0) {
              const nextChar = textQueue.charAt(0);
              textQueue = textQueue.substring(1);
              displayedText += nextChar;
              updateChatState({ message: displayedText });
            } else if (typingIntervalId) {
              clearInterval(typingIntervalId);
              typingIntervalId = null;
            }
          }, 20); // 20ms between characters for smooth typing
        };

        const stopTypingAnimation = () => {
          if (typingIntervalId) {
            clearInterval(typingIntervalId);
            typingIntervalId = null;
          }
        };

        // Create a ReadableStream for audio playback
        let audioStreamController: ReadableStreamDefaultController<Uint8Array> | null =
          null;
        const audioStream = new ReadableStream<Uint8Array>({
          start(controller) {
            audioStreamController = controller;
          }
        });

        // Track audio chunks for ordering
        const audioChunkMap = new Map<number, Uint8Array>();
        let nextExpectedIndex = 0;

        const closeAudioStream = () => {
          if (audioStreamController && !audioStreamClosed) {
            try {
              audioStreamController.close();
              audioStreamClosed = true;
            } catch (error) {
              console.warn("Audio stream close error:", error);
            }
          }
        };

        const processAudioChunk = (index: number, bytes: Uint8Array) => {
          // Store chunk
          audioChunkMap.set(index, bytes);

          // Process any consecutive chunks we have
          while (audioChunkMap.has(nextExpectedIndex)) {
            const chunk = audioChunkMap.get(nextExpectedIndex)!;

            // Start audio playback on first chunk
            if (!audioStreamStarted && audioStreamController) {
              audioStreamStarted = true;
              player.play(audioStream, () => {
                const isFirefox = navigator.userAgent.includes("Firefox");
                if (isFirefox) {
                  vad.start();
                }
              });
            }

            // Feed chunk to audio stream
            if (audioStreamController && !audioStreamClosed) {
              audioStreamController.enqueue(chunk);
            }

            // Clean up and move to next
            audioChunkMap.delete(nextExpectedIndex);
            nextExpectedIndex++;
          }
        };

        const processSSE = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // Process complete events from buffer
              let eventType = "";
              let eventData = "";

              while (buffer.includes("\n\n")) {
                const eventEnd = buffer.indexOf("\n\n");
                const eventText = buffer.substring(0, eventEnd);
                buffer = buffer.substring(eventEnd + 2);

                const eventLines = eventText.split("\n");

                for (const line of eventLines) {
                  if (line.startsWith("event:")) {
                    eventType = line.substring(6).trim();
                  } else if (line.startsWith("data:")) {
                    eventData = line.substring(5).trim();
                  }
                }

                // Process the complete event
                if (eventType && eventData) {
                  try {
                    const data = JSON.parse(eventData);

                    // Capture first packet latency on first meaningful data
                    if (
                      !firstPacketReceived &&
                      (eventType === "text" || eventType === "audio")
                    ) {
                      firstPacketLatency = Date.now() - submittedAt;
                      firstPacketReceived = true;
                    }

                    switch (eventType) {
                      case "text":
                        accumulatedText += data.content;
                        textQueue += data.content;
                        startTypingAnimation();
                        break;

                      case "audio":
                        // Decode base64 audio chunk
                        const binaryString = atob(data.chunk);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let j = 0; j < binaryString.length; j++) {
                          bytes[j] = binaryString.charCodeAt(j);
                        }
                        processAudioChunk(data.index || 0, bytes);
                        break;

                      case "complete":
                        finalLatency = Date.now() - submittedAt;
                        accumulatedText = data.fullText;

                        // Ensure all text is typed out before completing
                        textQueue += data.fullText.substring(
                          displayedText.length
                        );

                        // Wait for typing to complete, then reset streaming state
                        const waitForTyping = () => {
                          if (textQueue.length === 0 && !typingIntervalId) {
                            updateChatState({
                              isStreaming: false,
                              message: ""
                            });
                          } else {
                            setTimeout(waitForTyping, 50);
                          }
                        };
                        waitForTyping();

                        // Close audio stream after a small delay
                        setTimeout(() => {
                          closeAudioStream();
                        }, 100);
                        break;

                      case "error":
                        stopTypingAnimation();
                        closeAudioStream();
                        throw new Error(data.message);
                    }
                  } catch (error) {
                    console.error(
                      "Error parsing SSE data:",
                      error,
                      "eventType:",
                      eventType,
                      "raw data:",
                      eventData
                    );
                  }
                }

                // Reset for next event
                eventType = "";
                eventData = "";
              }
            }

            // After processing all SSE events, resolve with final messages
            const assistantMessage: Message = {
              role: "assistant",
              content: accumulatedText,
              latency: firstPacketReceived ? firstPacketLatency : finalLatency
            };

            resolve([...updatedMessages, assistantMessage]);
          } catch (error) {
            currentRequestRef.current = null;
            if (error instanceof Error && error.name === "AbortError") {
              console.log("SSE stream was cancelled");
              resolve(prevMessages);
            } else {
              console.error("SSE stream error:", error);
              reject(error);
            }
          } finally {
            // Clean up typing animation
            stopTypingAnimation();

            // Clean up
            updateChatState({
              isStreaming: false,
              message: ""
            });
            currentRequestRef.current = null;

            // Close audio stream if not already closed
            closeAudioStream();

            // Resume VAD after streaming completes (for Firefox)
            const isFirefox = navigator.userAgent.includes("Firefox");
            if (isFirefox) {
              setTimeout(() => {
                vad.start();
              }, 100);
            }
          }
        };

        processSSE();
      });
    } catch (error) {
      currentRequestRef.current = null;

      // Handle AbortError specifically
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Request was cancelled");
        return prevMessages;
      }

      console.error("Request failed:", error);
      toast.error(t("errors.requestFailed"));
      return prevMessages;
    }
  }, []);

  // Create refs for stable access to current values
  const chatStateRef = useRef(chatState);
  const authRef = useRef(auth);
  const playerRef = useRef(player);
  const updateChatStateRef = useRef(updateChatState);
  const submitRef = useRef(submit);

  // Update refs when values change
  useEffect(() => {
    chatStateRef.current = chatState;
    authRef.current = auth;
    playerRef.current = player;
    updateChatStateRef.current = updateChatState;
    submitRef.current = submit;
  });

  // VAD setup with stable callbacks using refs
  const onSpeechStart = useCallback(() => {
    if (!authRef.current.isAuthenticated) return;

    // Interrupt immediately when user starts speaking
    if (chatStateRef.current.message || chatStateRef.current.isStreaming) {
      console.log("Interrupting current stream - user started speaking");

      // Cancel current request immediately
      if (currentRequestRef.current) {
        console.log("Cancelling current request due to speech start");
        currentRequestRef.current.abort();
        currentRequestRef.current = null;
      }

      // Stop audio playback immediately
      playerRef.current.stop();

      // Reset streaming state immediately
      updateChatStateRef.current({
        isStreaming: false,
        message: ""
      });
    }
  }, []);

  const onSpeechEnd = useCallback((audio: Float32Array) => {
    if (!authRef.current.isAuthenticated) return;

    // Stop any remaining audio playback before processing new input
    playerRef.current.stop();

    // Process the completed speech input
    const wav = utils.encodeWAV(audio);
    const blob = new Blob([wav], { type: "audio/wav" });

    // Submit the audio
    startTransition(() => submitRef.current(blob));

    track("Speech input");

    const isFirefox = navigator.userAgent.includes("Firefox");
    if (isFirefox) {
      vad.pause();
    }
  }, []);

  const vadRef = useRef<any>(null);

  const vad = useVADWithOrbControl({
    onSpeechStart,
    onSpeechEnd,
    isStreaming: chatState.isStreaming,
    isAuthenticated: auth.isAuthenticated,
    positiveSpeechThreshold: 0.7,
    minSpeechFrames: 6,
    rmsEnergyThreshold: -35,
    minSpeechDuration: 400,
    spectralCentroidThreshold: 1000
  });

  // VAD state is now managed by the custom hook
  const vadState = {
    loading: vad.loading,
    errored: vad.errored,
    userSpeaking: vad.userSpeaking
  };

  // Store VAD instance in ref
  useEffect(() => {
    vadRef.current = vad.vad;
  }, [vad.vad]);

  // VAD management with timeout to avoid circular dependency
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (auth.isAuthenticated && !vadState.loading && !vadState.errored) {
        console.log("VAD: Starting VAD after successful authentication");
        vad.start();
      } else if (!auth.isAuthenticated) {
        console.log("VAD: Pausing VAD due to authentication loss");
        vad.pause();
      }
    }, 100); // Small delay to ensure VAD is ready

    return () => clearTimeout(timeoutId);
  }, [auth.isAuthenticated, vadState.loading, vadState.errored, vad]);

  // Keyboard shortcuts
  useEffect(() => {
    function keyDown(e: KeyboardEvent) {
      if (!auth.isAuthenticated) return;
      if (e.key === "Enter") return inputRef.current?.focus();
      if (e.key === "Escape") return updateChatState({ input: "" });
    }

    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [auth.isAuthenticated]);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.isAuthenticated) {
      toast.error(t("auth.loginToContinue"));
      return;
    }
    startTransition(() => submit(chatState.input));
  }

  const handleLogout = async () => {
    try {
      stopCurrentRequest();
      startTransition(() => submit("__reset__"));
      await auth.logout();
      toast.success(t("success.signedOut"));
    } catch (error) {
      console.error("Failed to logout:", error);
      toast.error(t("errors.signOutFailed"));
    }
  };

  const handleSettingsChange = (newSettings: SettingsState) => {
    setSettings(newSettings);
    console.log("Settings updated:", newSettings);
  };

  return (
    <>
      <div className="pb-4 min-h-28" />

      {!auth.isAuthenticated && <GoogleLoginButton disabled={auth.loading} />}

      <ChatForm
        isAuthenticated={auth.isAuthenticated}
        isSettingsOpen={isSettingsOpen}
        input={chatState.input}
        isPending={isPending}
        isStreaming={chatState.isStreaming}
        onInputChange={value => updateChatState({ input: value })}
        onSubmit={handleFormSubmit}
        inputRef={inputRef}
      />

      <MessageDisplay
        isSettingsOpen={isSettingsOpen}
        authLoading={auth.loading}
        isAuthenticated={auth.isAuthenticated}
        currentMessage={chatState.message}
        messages={messages}
        vadState={vadState}
      />

      <VoiceOrb
        isAuthenticated={auth.isAuthenticated}
        isLoading={vadState.loading}
        isErrored={vadState.errored}
        isUserSpeaking={vadState.userSpeaking}
        hasMessage={!!chatState.message}
      />

      <SettingsButton onClick={() => setIsSettingsOpen(true)} />

      {/* Settings Component */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={handleLogout}
        isAuthenticated={auth.isAuthenticated}
        onSettingsChange={handleSettingsChange}
      />

      {/* Privacy Policy Link and Company Disclaimer */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex flex-col items-center space-y-2">
          <a
            href="/privacy"
            className="text-xs text-gray-400 hover:text-gray-300 transition-colors underline"
          >
            {t("privacy.title")}
          </a>
          <p className="text-xs text-gray-500 text-center">
            © 2025 Friday Intelligence Inc. All rights reserved.
          </p>
        </div>
      </div>
    </>
  );
}
