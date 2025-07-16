"use client";

import clsx from "clsx";
import React, {
  useActionState,
  useEffect,
  useRef,
  useState,
  startTransition,
  useCallback,
  useMemo
} from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { EnterIcon, LoadingIcon } from "@/lib/icons";
import { track } from "@vercel/analytics";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import Settings, { SettingsState } from "@/components/Settings";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePlayer } from "@/lib/usePlayer";
import { AgentCoreService } from "@/lib/agentCore";

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

export default function Home() {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const player = usePlayer();
  const agentCoreRef = useRef<AgentCoreService | null>(null);
  const currentRequestRef = useRef<AbortController | null>(null);
  
  // UI state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({
    sttEngine: "groq",
    ttsEngine: "elevenlabs",
    streaming: true // Always use streaming
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
      if (auth.isAuthenticated && !chatState.agentCoreInitialized && agentCoreRef.current) {
        try {
          const accessToken = auth.getToken();
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
  }, [auth.isAuthenticated, chatState.agentCoreInitialized]);

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
  const [messages, submit, isPending] = useActionState<Array<Message>, string | Blob>(
    async (prevMessages, data) => {
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

      // Always use streaming
      formData.append("settings", JSON.stringify({ ...settings, streaming: true }));

      const submittedAt = Date.now();
      const accessToken = auth.getToken();
      const headers: HeadersInit = {};

      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      try {
        // Handle streaming mode with SSE
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
            toast.error("Session expired. Please sign in again.");
          } else if (response.status === 429) {
            toast.error(t("errors.tooManyRequests"));
          } else {
            toast.error((await response.text()) || t("common.error"));
          }
          return prevMessages;
        }

        const transcript = decodeURIComponent(
          response.headers.get("X-Transcript") || ""
        );

        if (!transcript) {
          updateChatState({ isStreaming: false });
          toast.error("No transcript received");
          return prevMessages;
        }

        updateChatState({ input: transcript });

        // Add user message immediately
        const userMessage: Message = {
          role: "user",
          content: transcript
        };

        const updatedMessages = [...prevMessages, userMessage];

        // Handle SSE streaming
        return new Promise<Message[]>((resolve, reject) => {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let accumulatedText = "";
          let finalLatency = 0;
          let firstPacketLatency = 0;
          let firstPacketReceived = false;
          let audioStreamStarted = false;
          let audioStreamClosed = false;

          // Create a ReadableStream for audio playback
          let audioStreamController: ReadableStreamDefaultController<Uint8Array> | null = null;
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
                    const currentVad = vadRef.current;
                    if (currentVad) currentVad.start();
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
                          updateChatState({ message: accumulatedText });
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
                          // Reset streaming state when text is complete
                          updateChatState({
                            isStreaming: false,
                            message: ""
                          });

                          // Close audio stream after a small delay
                          setTimeout(() => {
                            closeAudioStream();
                          }, 100);
                          break;

                        case "error":
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
                  const currentVad = vadRef.current;
                  if (currentVad) currentVad.start();
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
        toast.error("Request failed. Please try again.");
        return prevMessages;
      }
    },
    []
  );

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
      const currentVad = vadRef.current;
      if (currentVad) currentVad.pause();
    }
  }, []);

  const vadRef = useRef<any>(null);
  
  const vad = useMicVAD({
    startOnLoad: false, // Don't auto-start, we'll manage it manually
    onSpeechStart,
    onSpeechEnd,
    positiveSpeechThreshold: 0.6,
    minSpeechFrames: 4
  });

  // Create stable VAD state object
  const [vadState, setVadState] = useState({
    loading: true,
    errored: false,
    userSpeaking: false
  });

  // Store VAD instance in ref and update state
  useEffect(() => {
    vadRef.current = vad;
    setVadState({
      loading: vad?.loading || false,
      errored: Boolean(vad?.errored),
      userSpeaking: vad?.userSpeaking || false
    });
  }, [vad?.loading, vad?.errored, vad?.userSpeaking]);

  // VAD management with timeout to avoid circular dependency
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const currentVad = vadRef.current;
      if (auth.isAuthenticated && currentVad && !vadState.loading && !vadState.errored) {
        currentVad.start();
      } else if (!auth.isAuthenticated && currentVad) {
        currentVad.pause();
      }
    }, 100); // Small delay to ensure VAD is ready

    return () => clearTimeout(timeoutId);
  }, [auth.isAuthenticated, vadState.loading, vadState.errored]);

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
      toast.success("Signed out successfully");
    } catch (error) {
      console.error("Failed to logout:", error);
      toast.error("Failed to sign out. Please try again.");
    }
  };

  const handleSettingsChange = (newSettings: SettingsState) => {
    setSettings({ ...newSettings, streaming: true }); // Always enable streaming
    console.log("Settings updated:", newSettings);
  };

  return (
    <>
      <div className="pb-4 min-h-28" />

      {!auth.isAuthenticated && <GoogleLoginButton disabled={auth.loading} />}

      <form
        className={clsx(
          "rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 flex items-center w-full max-w-3xl border border-transparent transition-all duration-500",
          {
            "hover:drop-shadow-lg hover:drop-shadow-[0_0_15px_rgba(34,211,238,0.3)] focus-within:drop-shadow-xl focus-within:drop-shadow-[0_0_25px_rgba(34,211,238,0.4)] focus-within:ring-2 focus-within:ring-cyan-500/30 dark:hover:drop-shadow-[0_0_15px_rgba(34,211,238,0.4)] dark:focus-within:drop-shadow-[0_0_25px_rgba(34,211,238,0.5)] dark:focus-within:ring-cyan-400/30":
              auth.isAuthenticated,
            "opacity-50 cursor-not-allowed": !auth.isAuthenticated,
            "opacity-40 blur-sm pointer-events-none": isSettingsOpen
          }
        )}
        onSubmit={handleFormSubmit}
      >
        <input
          type="text"
          className="bg-transparent focus:outline-hidden pl-6 pr-4 py-4 w-full placeholder:text-neutral-600 dark:placeholder:text-neutral-400 disabled:cursor-not-allowed"
          required
          placeholder={
            auth.isAuthenticated
              ? t("assistant.placeholder")
              : t("auth.loginToContinue")
          }
          value={chatState.input}
          onChange={(e) => updateChatState({ input: e.target.value })}
          ref={inputRef}
          disabled={!auth.isAuthenticated}
        />

        <button
          type="submit"
          className="p-4 mr-1 text-neutral-700 hover:text-black dark:text-neutral-300 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isPending || !auth.isAuthenticated || chatState.isStreaming}
          aria-label="Submit"
        >
          {isPending || chatState.isStreaming ? <LoadingIcon /> : <EnterIcon />}
        </button>
      </form>

      <div
        className={clsx(
          "text-neutral-400 dark:text-neutral-600 pt-4 text-center max-w-xl text-balance min-h-28 space-y-4 transition-all duration-500",
          {
            "scale-95 -translate-y-2 opacity-40 blur-sm": isSettingsOpen
          }
        )}
      >
        {auth.loading && <p>{t("auth.checkingAuth")}</p>}

        {!auth.loading && !auth.isAuthenticated && <p>{t("auth.pleaseSignIn")}</p>}

        {!auth.loading && auth.isAuthenticated && chatState.message && (
          <p>{chatState.message}</p>
        )}

        {!auth.loading &&
          auth.isAuthenticated &&
          messages.length > 0 &&
          !chatState.message && (
            <p>
              {messages.at(-1)?.content}
              <span className="text-xs font-mono text-neutral-300 dark:text-neutral-700">
                {" "}
                ({messages.at(-1)?.latency}ms)
              </span>
            </p>
          )}

        {!auth.loading &&
          auth.isAuthenticated &&
          messages.length === 0 &&
          !chatState.message && (
            <>
              <p>
                A fast, open-source voice assistant powered by{" "}
                <A href="https://groq.com">Groq</A>,{" "}
                <A href="https://cartesia.ai">Cartesia</A>,{" "}
                <A href="https://www.vad.ricky0123.com/">VAD</A>, and{" "}
                <A href="https://vercel.com">Vercel</A>.{" "}
                <A href="https://github.com/samwang0723/friday" target="_blank">
                  Learn more
                </A>
                .
              </p>

              {vadState.loading ? (
                <p>{t("assistant.loadingSpeech")}</p>
              ) : vadState.errored ? (
                <p>{t("assistant.speechDetectionFailed")}</p>
              ) : (
                <p>{t("assistant.startTalking")}</p>
              )}
            </>
          )}
      </div>

      <div
        className={clsx(
          "absolute size-48 blur-3xl rounded-full bg-linear-to-b from-cyan-200 to-cyan-400 dark:from-cyan-600 dark:to-cyan-800 -z-50 transition ease-in-out",
          {
            "opacity-0": !auth.isAuthenticated || vadState.loading || vadState.errored,
            "opacity-30":
              auth.isAuthenticated &&
              !vadState.loading &&
              !vadState.errored &&
              !vadState.userSpeaking &&
              !chatState.message,
            "opacity-100 scale-110":
              auth.isAuthenticated && (vadState.userSpeaking || chatState.message)
          }
        )}
      />

      {/* Settings Button */}
      <button
        onClick={() => setIsSettingsOpen(true)}
        className="fixed bottom-6 right-6 p-3 rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 backdrop-blur-md hover:bg-neutral-300/80 dark:hover:bg-neutral-700/80 transition-colors shadow-lg z-50"
        aria-label="Settings"
      >
        <svg
          className="h-6 w-6 text-neutral-700 dark:text-neutral-300"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Settings Component */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={handleLogout}
        isAuthenticated={auth.isAuthenticated}
        onSettingsChange={handleSettingsChange}
      />
    </>
  );
}

function A(props: any) {
  return (
    <a
      {...props}
      className="text-neutral-500 dark:text-neutral-500 hover:underline font-medium"
    />
  );
}