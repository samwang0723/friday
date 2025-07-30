import { useRequestManager } from "@/hooks/useRequestManager";
import { useStreamingProcessor } from "@/hooks/useStreamingProcessor";
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
  const streamingProcessor = useStreamingProcessor();

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
    agentCoreInitialized: false
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
    // Handle reset case for logout
    if (typeof data === "string" && data === "__reset__") {
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

      // Extract transcript from response
      const transcript = voiceChatService.extractTranscript(response);
      if (!transcript) {
        setChatState(prev => ({ ...prev, isStreaming: false }));
        toast.error(t("errors.noTranscript"));
        return prevMessages;
      }

      setChatState(prev => ({ ...prev, input: transcript }));

      // Create user message
      const userMessage: Message = {
        role: "user",
        content: transcript
      };

      const updatedMessages = [...prevMessages, userMessage];

      // Handle different response types
      const responseType = voiceChatService.getResponseType(response);

      switch (responseType) {
        case "single":
          return await handleSingleResponse(response, userMessage, submittedAt);

        case "text-only":
          return await handleTextOnlyResponse(
            response,
            userMessage,
            submittedAt
          );

        default:
          return await handleStreamingResponse(
            response,
            updatedMessages,
            submittedAt
          );
      }
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
            console.error("VoiceChat: Stream interrupted");
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
    (chunk: ArrayBuffer) => player.playAudioChunk(chunk),
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

  // Memoize streaming callbacks to prevent recreation
  const handleTextUpdate = useCallback(
    (text: string) => setChatState(prev => ({ ...prev, message: text })),
    []
  );

  const handleStreamError = useCallback((error: Error) => {
    setChatState(prev => ({ ...prev, isStreaming: false }));
    // Don't show toast for intentional interruptions
    if (error.message !== "Stream was interrupted") {
      console.error("Stream error:", error);
    }
  }, []);

  // Handle streaming response
  const handleStreamingResponse = useCallback(
    async (
      response: Response,
      updatedMessages: Message[],
      submittedAt: number
    ): Promise<Message[]> => {
      return new Promise<Message[]>((resolve, reject) => {
        let finalMessage = "";
        let finalLatency = 0;
        let completed = false;

        // Set up timeout to prevent endless loading
        const timeout = setTimeout(() => {
          if (!completed) {
            console.warn("VoiceChat: Stream timeout after 60 seconds");
            completed = true;
            setChatState(prev => ({ ...prev, isStreaming: false }));
            reject(new Error("Stream timeout"));
          }
        }, 60000); // 60 second timeout

        const cleanup = () => {
          clearTimeout(timeout);
          completed = true;
        };

        streamingProcessor.processSSEStream(
          response,
          handleTextUpdate,
          handleAudioChunk,
          // onStreamComplete
          (finalText: string, latency: number) => {
            if (completed) return;
            cleanup();

            finalMessage = finalText;
            finalLatency = latency;

            // Create assistant message
            const assistantMessage: Message = {
              role: "assistant",
              content: finalMessage,
              latency: finalLatency
            };

            // Reset streaming state
            setChatState(prev => ({
              ...prev,
              isStreaming: false,
              message: ""
            }));

            resolve([...updatedMessages, assistantMessage]);
          },
          // onError
          (error: Error) => {
            if (completed) return;
            cleanup();

            setChatState(prev => ({ ...prev, isStreaming: false }));
            handleStreamError(error);
            reject(error);
          },
          submittedAt
        );
      });
    },
    [streamingProcessor, handleTextUpdate, handleAudioChunk, handleStreamError]
  );

  // Stop current request - remove dependencies to prevent infinite loops
  const stopCurrentRequest = useCallback(() => {
    console.debug("VoiceChat: Stopping current request");
    requestManager.cancelCurrentRequest();
    player.stop();
    streamingProcessor.stopTypingAnimation();
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
    if (isPending && !chatState.isStreaming) {
      issues.push("useActionState isPending but chat state not streaming");
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
