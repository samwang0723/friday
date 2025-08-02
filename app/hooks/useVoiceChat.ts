import { useRequestManager } from "@/hooks/useRequestManager";
import { useAudioPlayer } from "@/lib/hooks/useAudioPlayer";
import { VoiceChatService } from "@/services/voiceChatService";
import type {
  ChatState,
  ChatSubmissionData,
  Message,
  VoiceChatHookReturn
} from "@/types/voiceChat";
import { track } from "@vercel/analytics";
import { useTranslations } from "next-intl";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { toast } from "sonner";

interface UseVoiceChatProps {
  settings: any;
  auth: {
    isAuthenticated: boolean;
    getToken: () => string | null;
    logout: () => Promise<void>;
  };
}

export function useVoiceChat({
  settings,
  auth
}: UseVoiceChatProps): VoiceChatHookReturn {
  const t = useTranslations();
  const player = useAudioPlayer();
  const requestManager = useRequestManager();

  // Store current values in refs to avoid stale closures
  const settingsRef = useRef(settings);
  const authRef = useRef(auth);

  // Update refs on every render
  settingsRef.current = settings;
  authRef.current = auth;

  // Memoize service instance to prevent recreation on every render
  const voiceChatService = useMemo(() => new VoiceChatService(), []);

  // Chat state
  const [chatState, setChatState] = useState<ChatState>({
    isStreaming: false,
    message: "",
    input: "",
    agentCoreInitialized: false,
    streamPhase: undefined,
    audioPlayerReady: false
  });

  // Helper function to update chat state
  const updateChatState = useCallback((updates: Partial<ChatState>) => {
    setChatState(prev => ({ ...prev, ...updates }));
  }, []);

  // Define the action state for handling chat submissions
  const [messages, submit, isPending] = useActionState<
    Array<Message>,
    ChatSubmissionData
  >(async (prevMessages, data) => {
    console.log("🎯 useActionState called with data:", data);
    console.log("Previous messages count:", prevMessages.length);

    // Handle reset case for logout
    if (typeof data === "string" && data === "__reset__") {
      console.log("Reset case detected");
      setChatState(prev => ({ ...prev, isStreaming: false }));
      return [];
    }

    if (!authRef.current.isAuthenticated) {
      setChatState(prev => ({ ...prev, isStreaming: false }));
      toast.error(t("auth.loginToContinue"));
      return prevMessages;
    }

    try {
      // Create new request controller (cancels any existing request)
      const abortController = requestManager.createNewRequest();

      // Stop any ongoing audio playback
      player.stop();

      // Track analytics
      if (typeof data === "string") {
        track("Text input");
      } else if (data instanceof Blob) {
        track("Speech input");
      } else if (data && typeof data === "object" && "transcript" in data) {
        track("Transcript input");
      }

      // Update chat state to show streaming
      setChatState(prev => ({
        ...prev,
        isStreaming: true,
        message: ""
      }));

      const submittedAt = Date.now();
      const accessToken = authRef.current.getToken();

      // Submit chat request
      const response = await voiceChatService.submitChat(
        data,
        prevMessages,
        settingsRef.current,
        accessToken,
        abortController.signal
      );

      // All responses are now realtime SSE streams - bypass legacy logic
      console.log(
        "About to call handleStreamingResponse with response:",
        response
      );
      console.log(
        "Response headers:",
        Object.fromEntries(response.headers.entries())
      );

      return await handleStreamingResponse(response, prevMessages, submittedAt);
    } catch (error) {
      console.error("VoiceChat: Error in chat submission:", error);
      setChatState(prev => ({ ...prev, isStreaming: false }));

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          console.error(
            "VoiceChat: Request was cancelled - returning previous messages"
          );
          return prevMessages;
        }

        // Handle specific error types
        switch (error.message) {
          case "UNAUTHORIZED":
            await authRef.current.logout();
            toast.error(t("errors.sessionExpired"));
            break;
          case "TOO_MANY_REQUESTS":
            toast.error(t("errors.tooManyRequests"));
            break;
          case "STREAM_INTERRUPTED":
          case "STREAM_ABORTED":
            console.error("VoiceChat: Stream interrupted");
            break;
          case "NETWORK_ERROR":
            toast.error("Network connection lost. Please try again.");
            break;
          case "STREAM_TIMEOUT":
            toast.error("Request timed out. Please try again.");
            break;
          default:
            const translatedError = voiceChatService.translateError(
              error.message,
              t
            );
            toast.error(translatedError);
        }
      }

      return prevMessages;
    }
  }, []);

  // Memoize audio chunk handler to prevent recreation
  const handleAudioChunk = useCallback(
    (chunk: ArrayBuffer) => {
      // Update stream phase to audio when first chunk arrives
      setChatState(prev => ({
        ...prev,
        streamPhase:
          prev.streamPhase === "transcript" || prev.streamPhase === "text"
            ? "audio"
            : prev.streamPhase
      }));
      player.playAudioChunk(chunk);
    },
    [player]
  );

  // Handle single response (with audio)
  const handleSingleResponse = useCallback(
    async (
      response: Response,
      userMessage: Message,
      submittedAt: number
    ): Promise<Message[]> => {
      try {
        const messages = await voiceChatService.handleSingleResponse(
          response,
          userMessage,
          submittedAt,
          handleAudioChunk
        );

        // Display response text immediately
        setChatState(prev => ({ ...prev, message: messages[1].content }));

        // Reset streaming state after a delay
        setTimeout(() => {
          setChatState(prev => ({
            ...prev,
            isStreaming: false,
            message: ""
          }));
        }, 100);

        return messages;
      } catch (error) {
        setChatState(prev => ({ ...prev, isStreaming: false }));
        toast.error(t("errors.noResponse"));
        throw error;
      }
    },
    [voiceChatService, handleAudioChunk, t]
  );

  // Handle text-only response
  const handleTextOnlyResponse = useCallback(
    async (
      response: Response,
      userMessage: Message,
      submittedAt: number
    ): Promise<Message[]> => {
      try {
        const messages = await voiceChatService.handleTextOnlyResponse(
          response,
          userMessage,
          submittedAt
        );

        // Display response text immediately
        setChatState(prev => ({ ...prev, message: messages[1].content }));

        // Reset streaming state
        setChatState(prev => ({
          ...prev,
          isStreaming: false,
          message: ""
        }));

        return messages;
      } catch (error) {
        setChatState(prev => ({ ...prev, isStreaming: false }));
        toast.error(t("errors.noResponse"));
        throw error;
      }
    },
    [voiceChatService, t]
  );

  // Simplified stream error handler
  const handleStreamError = useCallback((error: Error) => {
    setChatState(prev => ({ ...prev, isStreaming: false }));
    // Don't show toast for intentional interruptions
    if (error.message !== "Stream was interrupted") {
      console.error("Stream error:", error);
    }
  }, []);

  // Handle streaming response - simplified direct implementation
  const handleStreamingResponse = useCallback(
    async (
      response: Response,
      prevMessages: Message[],
      submittedAt: number
    ): Promise<Message[]> => {
      // Initialize audio player immediately
      player.initAudioPlayer().catch(error => {
        console.warn("Failed to initialize audio player:", error);
      });

      // Set up streaming state (use startTransition to prevent render storm)
      startTransition(() => {
        setChatState(prev => ({
          ...prev,
          isStreaming: true,
          message: "",
          streamPhase: "transcript"
        }));
      });

      let userTranscript = "";
      let accumulatedText = "";

      try {
        if (!response.body) {
          throw new Error("Response body is null");
        }

        const reader = response.body.getReader();

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events
          while (buffer.includes("\n\n")) {
            const eventEnd = buffer.indexOf("\n\n");
            const eventText = buffer.substring(0, eventEnd);
            buffer = buffer.substring(eventEnd + 2);

            // Parse SSE event - handle both formats
            const lines = eventText.split("\n");
            let eventType = "";
            let eventData = "";

            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.substring(6).trim();
              } else if (line.startsWith("data:")) {
                eventData = line.substring(5).trim();
              }
            }

            // If no explicit event type, try to extract from JSON data
            if (!eventType && eventData) {
              try {
                const data = JSON.parse(eventData);
                eventType = data.type;
              } catch (parseError) {
                console.log(
                  "Could not parse event data to extract type:",
                  parseError
                );
              }
            }

            // Skip keep-alive and empty events
            if (eventData === "keep-alive" || !eventData) {
              continue;
            }

            if (!eventType) {
              continue;
            }

            try {
              const data = JSON.parse(eventData);

              switch (eventType) {
                case "transcript":
                  userTranscript = data.data;
                  startTransition(() => {
                    setChatState(prev => ({
                      ...prev,
                      input: userTranscript,
                      streamPhase: "transcript"
                    }));
                  });
                  break;

                case "text":
                  accumulatedText += data.data;
                  startTransition(() => {
                    setChatState(prev => ({
                      ...prev,
                      message: accumulatedText,
                      streamPhase: "text"
                    }));
                  });
                  break;

                case "audio":
                  if (data.data) {
                    // Decode base64 audio chunk
                    const binaryString = atob(data.data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let j = 0; j < binaryString.length; j++) {
                      bytes[j] = binaryString.charCodeAt(j);
                    }

                    // Send to audio player
                    player.playAudioChunk(bytes.buffer);

                    startTransition(() => {
                      setChatState(prev => ({
                        ...prev,
                        streamPhase: "audio"
                      }));
                    });
                  }
                  break;

                case "status":
                  // Handle status updates (optional UI feedback)
                  break;

                case "complete":
                  const finalMessage = data.fullText || accumulatedText;
                  const finalLatency = Date.now() - submittedAt;

                  // Create messages
                  const userMessage: Message = {
                    role: "user",
                    content: userTranscript || "Audio input"
                  };

                  const assistantMessage: Message = {
                    role: "assistant",
                    content: finalMessage,
                    latency: finalLatency
                  };

                  // Reset state
                  startTransition(() => {
                    setChatState(prev => ({
                      ...prev,
                      isStreaming: false,
                      message: "",
                      streamPhase: "completed"
                    }));
                  });

                  return [...prevMessages, userMessage, assistantMessage];

                case "error":
                  throw new Error(data.message || "Stream error");
              }
            } catch (parseError) {
              console.error("Error parsing SSE event:", parseError);
            }
          }
        }

        // If we get here without a complete event, handle as completion
        const userMessage: Message = {
          role: "user",
          content: userTranscript || "Audio input"
        };

        const assistantMessage: Message = {
          role: "assistant",
          content: accumulatedText,
          latency: Date.now() - submittedAt
        };

        setChatState(prev => ({
          ...prev,
          isStreaming: false,
          message: "",
          streamPhase: "completed"
        }));

        return [...prevMessages, userMessage, assistantMessage];
      } catch (error) {
        console.error(
          "Error type:",
          error instanceof Error ? error.constructor.name : typeof error
        );
        console.error(
          "Error message:",
          error instanceof Error ? error.message : error
        );
        console.error(
          "Error stack:",
          error instanceof Error ? error.stack : "No stack trace"
        );

        startTransition(() => {
          setChatState(prev => ({ ...prev, isStreaming: false }));
        });
        throw error;
      }
    },
    [player]
  );

  // Stop current request - remove dependencies to prevent infinite loops
  const stopCurrentRequest = useCallback(() => {
    console.debug("VoiceChat: Stopping current request");
    requestManager.cancelCurrentRequest();
    player.stop();
    setChatState(prev => ({ ...prev, isStreaming: false }));
  }, []); // Empty deps - using closure values

  // Reset messages - use closure to avoid submit dependency
  const resetMessages = useCallback(() => {
    startTransition(() => submit("__reset__"));
  }, []); // Empty deps - submit should be stable from useActionState

  // State consistency validation
  const validateComponentState = useCallback(() => {
    const issues = [];

    // Check if streaming state is consistent with request manager
    if (chatState.isStreaming && !requestManager.isProcessing) {
      issues.push(
        "Chat state shows streaming but request manager is not processing"
      );
    }

    if (!chatState.isStreaming && requestManager.isProcessing) {
      issues.push("Request manager is processing but chat state not streaming");
    }

    // Check if isPending from useActionState is consistent
    // Only flag this as an issue if there's an actual processing mismatch
    if (isPending && !chatState.isStreaming && !requestManager.isProcessing) {
      issues.push("useActionState isPending but no active processing");
    }

    if (issues.length > 0) {
      console.warn("VoiceChat: State consistency issues detected:", issues);

      // Auto-correct common inconsistencies
      if (chatState.isStreaming && !requestManager.isProcessing) {
        console.debug("VoiceChat: Auto-correcting streaming state");
        setChatState(prev => ({ ...prev, isStreaming: false }));
      }
    }

    return issues.length === 0;
  }, [chatState.isStreaming, requestManager.isProcessing, isPending]);

  // Periodic state validation and stuck loading detection
  useEffect(() => {
    let stuckLoadingTimeout: NodeJS.Timeout;

    if (chatState.isStreaming && !requestManager.isProcessing) {
      // If we're showing streaming but not actually processing, we might be stuck
      stuckLoadingTimeout = setTimeout(() => {
        console.warn(
          "VoiceChat: Detected stuck loading state, auto-recovering"
        );
        setChatState(prev => ({ ...prev, isStreaming: false }));
        toast.error("Request timed out. Please try again.");
      }, 10000); // 10 second detection for stuck states
    }

    // Development-only validation
    if (process.env.NODE_ENV === "development") {
      const validationInterval = setInterval(validateComponentState, 3000);
      return () => {
        clearInterval(validationInterval);
        clearTimeout(stuckLoadingTimeout);
      };
    }

    return () => clearTimeout(stuckLoadingTimeout);
  }, [
    chatState.isStreaming,
    requestManager.isProcessing,
    validateComponentState
  ]);

  // Reset loading state when auth changes or component unmounts
  useEffect(() => {
    if (!auth.isAuthenticated && chatState.isStreaming) {
      console.debug("VoiceChat: Resetting loading state due to auth change");
      setChatState(prev => ({ ...prev, isStreaming: false }));
    }
  }, [auth.isAuthenticated, chatState.isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chatState.isStreaming) {
        console.debug("VoiceChat: Cleaning up loading state on unmount");
        setChatState(prev => ({ ...prev, isStreaming: false }));
      }
    };
  }, []);

  // Memoize return object to prevent unnecessary re-renders
  // Only include stable properties of player in dependencies
  return useMemo(
    () => ({
      messages,
      submit,
      isPending,
      chatState,
      updateChatState,
      stopCurrentRequest,
      resetMessages,
      player
    }),
    [
      messages,
      submit,
      isPending,
      chatState,
      updateChatState,
      stopCurrentRequest,
      resetMessages,
      player.isPlayerInitialized // Only include stable property instead of entire player object
    ]
  );
}
