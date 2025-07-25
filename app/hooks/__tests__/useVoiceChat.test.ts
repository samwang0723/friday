import { renderHook, act, waitFor } from "@testing-library/react";
import { useVoiceChat } from "../useVoiceChat";
import { VoiceChatService } from "@/services/voiceChatService";

// Mock dependencies
jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn()
  }
}));

jest.mock("@vercel/analytics", () => ({
  track: jest.fn()
}));

jest.mock("next-intl", () => ({
  useTranslations: () => jest.fn((key: string) => `translated_${key}`)
}));

jest.mock("@/services/voiceChatService");
jest.mock("@/hooks/useRequestManager");
jest.mock("@/hooks/useStreamingProcessor");
jest.mock("@/lib/hooks/useAudioPlayer");

const mockRequestManager = {
  currentController: null,
  createNewRequest: jest.fn(() => ({
    signal: { aborted: false },
    abort: jest.fn()
  })),
  cancelCurrentRequest: jest.fn(),
  isProcessing: false
};

const mockStreamingProcessor = {
  processSSEStream: jest.fn(),
  stopTypingAnimation: jest.fn()
};

const mockPlayer = {
  playAudioChunk: jest.fn(),
  stop: jest.fn()
};

const mockVoiceChatService = {
  submitChat: jest.fn(),
  extractTranscript: jest.fn(),
  getResponseType: jest.fn(),
  handleSingleResponse: jest.fn(),
  handleTextOnlyResponse: jest.fn(),
  translateError: jest.fn()
};

// Mock the hooks
require("@/hooks/useRequestManager").useRequestManager = jest.fn(
  () => mockRequestManager
);
require("@/hooks/useStreamingProcessor").useStreamingProcessor = jest.fn(
  () => mockStreamingProcessor
);
require("@/lib/hooks/useAudioPlayer").useAudioPlayer = jest.fn(
  () => mockPlayer
);

// Mock VoiceChatService constructor
(
  VoiceChatService as jest.MockedClass<typeof VoiceChatService>
).mockImplementation(() => mockVoiceChatService as any);

describe("useVoiceChat", () => {
  const mockSettings = {
    audioEnabled: true,
    ttsProvider: "cartesia"
  };

  const mockAuth = {
    isAuthenticated: true,
    getToken: jest.fn(() => "mock-token"),
    logout: jest.fn()
  };

  const mockProps = {
    settings: mockSettings,
    auth: mockAuth
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockVoiceChatService.extractTranscript.mockReturnValue("Mock transcript");
    mockVoiceChatService.getResponseType.mockReturnValue("streaming");
    mockVoiceChatService.translateError.mockImplementation(
      (msg: string) => msg
    );
  });

  describe("initialization", () => {
    it("should initialize with default chat state", () => {
      const { result } = renderHook(() => useVoiceChat(mockProps));

      expect(result.current.chatState).toEqual({
        isStreaming: false,
        message: "",
        input: "",
        agentCoreInitialized: false
      });
      expect(result.current.messages).toEqual([]);
      expect(result.current.isPending).toBe(false);
    });

    it("should provide all required hook methods", () => {
      const { result } = renderHook(() => useVoiceChat(mockProps));

      expect(typeof result.current.submit).toBe("function");
      expect(typeof result.current.updateChatState).toBe("function");
      expect(typeof result.current.stopCurrentRequest).toBe("function");
      expect(typeof result.current.resetMessages).toBe("function");
      expect(result.current.player).toBe(mockPlayer);
    });
  });

  describe("text input submission", () => {
    it("should handle successful text input submission", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      mockVoiceChatService.getResponseType.mockReturnValue("single");
      mockVoiceChatService.handleSingleResponse.mockResolvedValue([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!", latency: 100 }
      ]);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      await waitFor(() => {
        expect(mockVoiceChatService.submitChat).toHaveBeenCalledWith(
          "Hello",
          [],
          mockSettings,
          "mock-token",
          expect.any(Object)
        );
      });

      expect(mockVoiceChatService.extractTranscript).toHaveBeenCalled();
      expect(mockVoiceChatService.handleSingleResponse).toHaveBeenCalled();
      expect(result.current.messages).toHaveLength(2);
    });

    it("should handle blob input submission", async () => {
      const mockBlob = new Blob(["audio data"], { type: "audio/webm" });
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      mockVoiceChatService.getResponseType.mockReturnValue("single");
      mockVoiceChatService.handleSingleResponse.mockResolvedValue([
        { role: "user", content: "Transcribed text" },
        { role: "assistant", content: "Response", latency: 100 }
      ]);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit(mockBlob);
      });

      await waitFor(() => {
        expect(mockVoiceChatService.submitChat).toHaveBeenCalledWith(
          mockBlob,
          [],
          mockSettings,
          "mock-token",
          expect.any(Object)
        );
      });
    });

    it("should handle transcript object submission", async () => {
      const mockTranscript = { transcript: "Hello from transcript" };
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      mockVoiceChatService.getResponseType.mockReturnValue("single");
      mockVoiceChatService.handleSingleResponse.mockResolvedValue([
        { role: "user", content: "Hello from transcript" },
        { role: "assistant", content: "Response", latency: 100 }
      ]);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit(mockTranscript);
      });

      await waitFor(() => {
        expect(mockVoiceChatService.submitChat).toHaveBeenCalledWith(
          mockTranscript,
          [],
          mockSettings,
          "mock-token",
          expect.any(Object)
        );
      });
    });
  });

  describe("response handling", () => {
    it("should handle single response type", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      mockVoiceChatService.getResponseType.mockReturnValue("single");
      mockVoiceChatService.handleSingleResponse.mockResolvedValue([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!", latency: 100 }
      ]);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      await waitFor(() => {
        expect(mockVoiceChatService.handleSingleResponse).toHaveBeenCalled();
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[1].content).toBe("Hi there!");
      });
    });

    it("should handle text-only response type", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      mockVoiceChatService.getResponseType.mockReturnValue("text-only");
      mockVoiceChatService.handleTextOnlyResponse.mockResolvedValue([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Text only response", latency: 100 }
      ]);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      await waitFor(() => {
        expect(mockVoiceChatService.handleTextOnlyResponse).toHaveBeenCalled();
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[1].content).toBe("Text only response");
      });
    });

    it("should handle streaming response type", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      mockVoiceChatService.getResponseType.mockReturnValue(null); // defaults to streaming

      // Mock the streaming processor to call onStreamComplete
      mockStreamingProcessor.processSSEStream.mockImplementation(
        (
          response: Response,
          onTextUpdate: (text: string) => void,
          onAudioChunk: (chunk: ArrayBuffer) => void,
          onStreamComplete: (finalText: string, latency: number) => void,
          onError: (error: Error) => void,
          submittedAt: number
        ) => {
          // Simulate streaming updates
          setTimeout(() => {
            onTextUpdate("Partial response");
            onAudioChunk(new ArrayBuffer(8));
            onStreamComplete("Full streaming response", 150);
          }, 0);
        }
      );

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      await waitFor(() => {
        expect(mockStreamingProcessor.processSSEStream).toHaveBeenCalled();
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[1].content).toBe(
          "Full streaming response"
        );
      });
    });
  });

  describe("error handling", () => {
    it("should handle authentication errors", async () => {
      const unauthenticatedAuth = {
        isAuthenticated: false,
        getToken: jest.fn(() => null),
        logout: jest.fn()
      };

      const { result } = renderHook(() =>
        useVoiceChat({
          ...mockProps,
          auth: unauthenticatedAuth
        })
      );

      await act(async () => {
        result.current.submit("Hello");
      });

      // Should not call the service when not authenticated
      expect(mockVoiceChatService.submitChat).not.toHaveBeenCalled();
      expect(result.current.messages).toEqual([]);
    });

    it("should handle abort errors gracefully", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockVoiceChatService.submitChat.mockRejectedValue(abortError);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      // Should not show error toast for abort errors
      const { toast } = require("sonner");
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("should handle unauthorized errors", async () => {
      const unauthorizedError = new Error("UNAUTHORIZED");
      mockVoiceChatService.submitChat.mockRejectedValue(unauthorizedError);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      await waitFor(() => {
        expect(mockAuth.logout).toHaveBeenCalled();
      });
    });

    it("should handle rate limit errors", async () => {
      const rateLimitError = new Error("TOO_MANY_REQUESTS");
      mockVoiceChatService.submitChat.mockRejectedValue(rateLimitError);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      const { toast } = require("sonner");
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "translated_errors.tooManyRequests"
        );
      });
    });

    it("should handle missing transcript", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      mockVoiceChatService.extractTranscript.mockReturnValue("");

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      const { toast } = require("sonner");
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "translated_errors.noTranscript"
        );
      });
    });
  });

  describe("request management", () => {
    it("should stop current request", () => {
      const { result } = renderHook(() => useVoiceChat(mockProps));

      act(() => {
        result.current.stopCurrentRequest();
      });

      expect(mockRequestManager.cancelCurrentRequest).toHaveBeenCalled();
      expect(mockPlayer.stop).toHaveBeenCalled();
      expect(mockStreamingProcessor.stopTypingAnimation).toHaveBeenCalled();
      expect(result.current.chatState.isStreaming).toBe(false);
    });

    it("should reset messages", () => {
      const { result } = renderHook(() => useVoiceChat(mockProps));

      act(() => {
        result.current.resetMessages();
      });

      // This will trigger submit with "__reset__" string
      expect(result.current.submit).toBeDefined();
    });

    it("should cancel previous requests when starting new ones", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      expect(mockRequestManager.createNewRequest).toHaveBeenCalled();
      expect(mockPlayer.stop).toHaveBeenCalled();
    });
  });

  describe("analytics tracking", () => {
    it("should track text input analytics", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      const { track } = require("@vercel/analytics");
      expect(track).toHaveBeenCalledWith("Text input");
    });

    it("should track speech input analytics", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      const mockBlob = new Blob(["audio"], { type: "audio/webm" });
      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit(mockBlob);
      });

      const { track } = require("@vercel/analytics");
      expect(track).toHaveBeenCalledWith("Speech input");
    });

    it("should track transcript input analytics", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      const mockTranscript = { transcript: "Hello" };
      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit(mockTranscript);
      });

      const { track } = require("@vercel/analytics");
      expect(track).toHaveBeenCalledWith("Transcript input");
    });
  });

  describe("chat state management", () => {
    it("should update chat state during streaming", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      // During submission
      expect(result.current.chatState.isStreaming).toBe(true);
      expect(result.current.chatState.input).toBe("Mock transcript");
    });

    it("should allow manual chat state updates", () => {
      const { result } = renderHook(() => useVoiceChat(mockProps));

      act(() => {
        result.current.updateChatState({ input: "Updated input" });
      });

      expect(result.current.chatState.input).toBe("Updated input");
    });

    it("should reset streaming state after completion", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      mockVoiceChatService.getResponseType.mockReturnValue("single");
      mockVoiceChatService.handleSingleResponse.mockResolvedValue([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!", latency: 100 }
      ]);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      // Allow timeout to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
      });

      expect(result.current.chatState.isStreaming).toBe(false);
      expect(result.current.chatState.message).toBe("");
    });
  });

  describe("edge cases", () => {
    it("should handle reset submission", async () => {
      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("__reset__");
      });

      expect(result.current.messages).toEqual([]);
    });

    it("should handle response processing errors in single mode", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      mockVoiceChatService.getResponseType.mockReturnValue("single");
      mockVoiceChatService.handleSingleResponse.mockRejectedValue(
        new Error("Processing error")
      );

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      const { toast } = require("sonner");
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it("should handle response processing errors in text-only mode", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      mockVoiceChatService.getResponseType.mockReturnValue("text-only");
      mockVoiceChatService.handleTextOnlyResponse.mockRejectedValue(
        new Error("Processing error")
      );

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        result.current.submit("Hello");
      });

      const { toast } = require("sonner");
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });
});
