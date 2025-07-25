import {
  useState,
  useCallback,
  useActionState,
  startTransition,
  useMemo,
  useRef
} from "react";
import { toast } from "sonner";
import { track } from "@vercel/analytics";
import { useTranslations } from "next-intl";
import type {
  Message,
  ChatState,
  ChatSubmissionData,
  VoiceChatHookReturn
} from "@/types/voiceChat";
import { VoiceChatService } from "@/services/voiceChatService";
import { useRequestManager } from "@/hooks/useRequestManager";
import { useStreamingProcessor } from "@/hooks/useStreamingProcessor";
import { useAudioPlayer } from "@/lib/hooks/useAudioPlayer";

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
  >(
    async (prevMessages, data) => {
      // Handle reset case for logout
      if (typeof data === "string" && data === "__reset__") {
        return [];
      }

      if (!authRef.current.isAuthenticated) {
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
            return await handleSingleResponse(
              response,
              userMessage,
              submittedAt
            );

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
        setChatState(prev => ({ ...prev, isStreaming: false }));

        if (error instanceof Error) {
          if (error.name === "AbortError") {
            console.log("Request was cancelled");
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
    },
    []
  );

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

  const handleStreamError = useCallback(
    (error: Error) => {
      setChatState(prev => ({ ...prev, isStreaming: false }));
    },
    []
  );

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

        streamingProcessor.processSSEStream(
          response,
          handleTextUpdate,
          handleAudioChunk,
          // onStreamComplete
          (finalText: string, latency: number) => {
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
            handleStreamError(error);
            reject(error);
          },
          submittedAt
        );
      });
    },
    [
      streamingProcessor,
      handleTextUpdate,
      handleAudioChunk,
      handleStreamError
    ]
  );

  // Stop current request - remove dependencies to prevent infinite loops
  const stopCurrentRequest = useCallback(() => {
    requestManager.cancelCurrentRequest();
    player.stop();
    streamingProcessor.stopTypingAnimation();
    setChatState(prev => ({ ...prev, isStreaming: false }));
  }, []); // Empty deps - using closure values

  // Reset messages - use closure to avoid submit dependency
  const resetMessages = useCallback(() => {
    startTransition(() => submit("__reset__"));
  }, []); // Empty deps - submit should be stable from useActionState

  // Memoize return object to prevent unnecessary re-renders
  // Only include stable properties of player in dependencies
  return useMemo(() => ({
    messages,
    submit,
    isPending,
    chatState,
    updateChatState,
    stopCurrentRequest,
    resetMessages,
    player
  }), [
    messages,
    submit,
    isPending,
    chatState,
    updateChatState,
    stopCurrentRequest,
    resetMessages,
    player.isPlayerInitialized // Only include stable property instead of entire player object
  ]);
}
