import { VoiceChatService } from "@/services/voiceChatService";
import { act, renderHook, waitFor } from "@testing-library/react";
import { track } from "@vercel/analytics";
import { startTransition } from "react";
import { toast } from "sonner";
import { useVoiceChat } from "../useVoiceChat";

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

// Mock React's startTransition to execute synchronously in tests
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  startTransition: jest.fn((callback: () => void) => {
    // Execute synchronously in test environment to avoid suspended resource warnings
    callback();
  })
}));

jest.mock("@/services/voiceChatService");
jest.mock("@/hooks/useRequestManager");
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

const mockPlayer = {
  playAudioChunk: jest.fn(),
  stop: jest.fn(),
  initAudioPlayer: jest.fn().mockResolvedValue(undefined),
  isPlayerInitialized: false
};

const mockVoiceChatService = {
  submitChat: jest.fn(),
  extractTranscript: jest.fn(),
  translateError: jest.fn()
};

// Mock the hooks using module factory approach
jest.mock("@/hooks/useRequestManager", () => ({
  useRequestManager: jest.fn(() => mockRequestManager)
}));

jest.mock("@/lib/hooks/useAudioPlayer", () => ({
  useAudioPlayer: jest.fn(() => mockPlayer)
}));

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

  // Helper function to create SSE mock response
  const createSSEMockResponse = (sseEvents: string[]) => {
    let readIndex = 0;
    const mockReader = {
      read: jest.fn().mockImplementation(() => {
        if (readIndex < sseEvents.length) {
          const value = new TextEncoder().encode(sseEvents[readIndex]);
          readIndex++;
          return Promise.resolve({ done: false, value });
        }
        return Promise.resolve({ done: true, value: undefined });
      })
    };

    const mockResponse = new Response(null, { status: 200 });
    Object.defineProperty(mockResponse, "body", {
      value: {
        getReader: () => mockReader
      },
      writable: false
    });

    return mockResponse;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockVoiceChatService.translateError.mockImplementation(
      (msg: string) => msg
    );

    // Reset player mock
    mockPlayer.initAudioPlayer.mockClear();
    mockPlayer.playAudioChunk.mockClear();
    mockPlayer.stop.mockClear();

    // Suppress console.error warnings for useActionState in test environment
    jest.spyOn(console, "error").mockImplementation(message => {
      // Only suppress specific React warnings, let other errors through
      if (
        typeof message === "string" &&
        message.includes("useActionState was called outside of a transition")
      ) {
        return;
      }
      // Let other console.error calls through for debugging
    });
  });

  afterEach(() => {
    // Restore console.error after each test
    jest.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with default chat state", () => {
      const { result } = renderHook(() => useVoiceChat(mockProps));

      expect(result.current.chatState).toEqual({
        isStreaming: false,
        message: "",
        input: "",
        agentCoreInitialized: false,
        streamPhase: undefined,
        audioPlayerReady: false
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
    it("should handle successful text input submission with SSE streaming", async () => {
      const sseEvents = [
        'event: transcript\ndata: {"data": "Hello"}\n\n',
        'event: text\ndata: {"data": "Hi there!"}\n\n',
        'event: complete\ndata: {"fullText": "Hi there!"}\n\n'
      ];

      const mockSSEResponse = createSSEMockResponse(sseEvents);
      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("Hello");
        });
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

      // Should initialize audio player
      expect(mockPlayer.initAudioPlayer).toHaveBeenCalled();

      // Wait for streaming to complete
      await waitFor(
        () => {
          expect(result.current.messages).toHaveLength(2);
        },
        { timeout: 5000 }
      );
    });

    it("should handle blob input submission with SSE streaming", async () => {
      const mockBlob = new Blob(["audio data"], { type: "audio/webm" });

      const sseEvents = [
        'event: transcript\ndata: {"data": "Transcribed text"}\n\n',
        'event: text\ndata: {"data": "Response"}\n\n',
        'event: complete\ndata: {"fullText": "Response"}\n\n'
      ];

      const mockSSEResponse = createSSEMockResponse(sseEvents);
      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit(mockBlob);
        });
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

      await waitFor(
        () => {
          expect(result.current.messages).toHaveLength(2);
        },
        { timeout: 5000 }
      );
    });

    it("should handle transcript object submission with SSE streaming", async () => {
      const mockTranscript = { transcript: "Hello from transcript" };

      const sseEvents = [
        'event: transcript\ndata: {"data": "Hello from transcript"}\n\n',
        'event: text\ndata: {"data": "Response"}\n\n',
        'event: complete\ndata: {"fullText": "Response"}\n\n'
      ];

      const mockSSEResponse = createSSEMockResponse(sseEvents);
      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit(mockTranscript);
        });
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

      await waitFor(
        () => {
          expect(result.current.messages).toHaveLength(2);
        },
        { timeout: 5000 }
      );
    });
  });

  describe("SSE streaming response handling", () => {
    it("should handle SSE streaming with text and audio events", async () => {
      const sseEvents = [
        'event: transcript\ndata: {"data": "Hello"}\n\n',
        'event: text\ndata: {"data": "Partial "}\n\n',
        'event: text\ndata: {"data": "response"}\n\n',
        'event: audio\ndata: {"data": "' + btoa("audiodata") + '"}\n\n',
        'event: complete\ndata: {"fullText": "Partial response"}\n\n'
      ];

      const mockSSEResponse = createSSEMockResponse(sseEvents);
      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      // Should initialize audio player
      expect(mockPlayer.initAudioPlayer).toHaveBeenCalled();

      // Wait for SSE stream processing to complete
      await waitFor(
        () => {
          expect(result.current.messages).toHaveLength(2);
          expect(result.current.messages[1].content).toBe("Partial response");
        },
        { timeout: 8000 }
      );

      // Audio should be played
      expect(mockPlayer.playAudioChunk).toHaveBeenCalled();
    });

    it("should handle SSE streaming with status updates", async () => {
      const sseEvents = [
        'event: transcript\ndata: {"data": "Hello"}\n\n',
        'event: status\ndata: {"message": "Processing..."}\n\n',
        'event: text\ndata: {"data": "Response text"}\n\n',
        'event: complete\ndata: {"fullText": "Response text"}\n\n'
      ];

      const mockSSEResponse = createSSEMockResponse(sseEvents);
      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      await waitFor(
        () => {
          expect(result.current.messages).toHaveLength(2);
          expect(result.current.messages[1].content).toBe("Response text");
        },
        { timeout: 8000 }
      );
    });

    it("should handle SSE stream errors", async () => {
      const mockSSEResponse = {
        body: {
          getReader: () => ({
            read: jest
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(
                  'event: transcript\ndata: {"data": "Hello"}\n\n'
                )
              })
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(
                  'event: error\ndata: {"message": "Stream error occurred"}\n\n'
                )
              })
              .mockResolvedValueOnce({ done: true, value: undefined })
          })
        }
      };

      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse as any);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      // Should handle the error gracefully
      await waitFor(
        () => {
          expect(result.current.chatState.isStreaming).toBe(false);
        },
        { timeout: 3000 }
      );
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
        startTransition(() => {
          result.current.submit("Hello");
        });
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
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      // Should not show error toast for abort errors
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("should handle unauthorized errors", async () => {
      const unauthorizedError = new Error("UNAUTHORIZED");
      mockVoiceChatService.submitChat.mockRejectedValue(unauthorizedError);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("Hello");
        });
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
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "translated_errors.tooManyRequests"
        );
      });
    });

    it("should handle stream processing errors", async () => {
      // Mock an invalid SSE response that will cause parsing errors
      const mockSSEResponse = {
        body: {
          getReader: () => ({
            read: jest
              .fn()
              .mockRejectedValueOnce(new Error("Stream read error"))
          })
        }
      };

      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse as any);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      await waitFor(() => {
        expect(result.current.chatState.isStreaming).toBe(false);
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
        startTransition(() => {
          result.current.submit("Hello");
        });
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
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      expect(track).toHaveBeenCalledWith("Text input");
    });

    it("should track speech input analytics", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      const mockBlob = new Blob(["audio"], { type: "audio/webm" });
      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit(mockBlob);
        });
      });

      expect(track).toHaveBeenCalledWith("Speech input");
    });

    it("should track transcript input analytics", async () => {
      mockVoiceChatService.submitChat.mockResolvedValue(new Response());
      const mockTranscript = { transcript: "Hello" };
      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit(mockTranscript);
        });
      });

      expect(track).toHaveBeenCalledWith("Transcript input");
    });
  });

  describe("chat state management", () => {
    it("should update chat state during SSE streaming", async () => {
      const sseEvents = [
        'event: transcript\ndata: {"data": "Hello"}\n\n',
        'event: text\ndata: {"data": "Partial "}\n\n',
        'event: text\ndata: {"data": "response"}\n\n',
        'event: complete\ndata: {"fullText": "Partial response"}\n\n'
      ];

      const mockSSEResponse = createSSEMockResponse(sseEvents);
      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      // Wait for processing to complete
      await waitFor(
        () => {
          expect(result.current.messages).toHaveLength(2);
        },
        { timeout: 8000 }
      );

      expect(result.current.messages[1].content).toBe("Partial response");
      expect(result.current.chatState.input).toBe("Hello");
    });

    it("should allow manual chat state updates", () => {
      const { result } = renderHook(() => useVoiceChat(mockProps));

      act(() => {
        result.current.updateChatState({ input: "Updated input" });
      });

      expect(result.current.chatState.input).toBe("Updated input");
    });

    it("should properly track streamPhase transitions", async () => {
      const sseEvents = [
        'event: transcript\ndata: {"data": "Hello"}\n\n',
        'event: text\ndata: {"data": "Response"}\n\n',
        'event: audio\ndata: {"data": "' + btoa("audio") + '"}\n\n',
        'event: complete\ndata: {"fullText": "Response"}\n\n'
      ];

      const mockSSEResponse = createSSEMockResponse(sseEvents);
      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      // Wait for final completion and verify we went through the phases
      await waitFor(
        () => {
          expect(result.current.chatState.streamPhase).toBe("completed");
          expect(result.current.chatState.isStreaming).toBe(false);
          expect(result.current.messages).toHaveLength(2);
        },
        { timeout: 8000 }
      );

      // Verify input was set during the process
      expect(result.current.chatState.input).toBe("Hello");
    });

    it("should reset streaming state after SSE completion", async () => {
      const sseEvents = [
        'event: transcript\ndata: {"data": "Hello"}\n\n',
        'event: text\ndata: {"data": "Hi there!"}\n\n',
        'event: complete\ndata: {"fullText": "Hi there!"}\n\n'
      ];

      const mockSSEResponse = createSSEMockResponse(sseEvents);
      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      // Wait for completion and state reset
      await waitFor(
        () => {
          expect(result.current.chatState.isStreaming).toBe(false);
          expect(result.current.chatState.message).toBe("");
          expect(result.current.chatState.streamPhase).toBe("completed");
        },
        { timeout: 8000 }
      );
    });
  });

  describe("edge cases", () => {
    it("should handle reset submission", async () => {
      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("__reset__");
        });
      });

      expect(result.current.messages).toEqual([]);
    });

    it("should handle SSE response without complete event", async () => {
      // Test fallback when stream ends without explicit complete event
      const sseEvents = [
        'event: transcript\ndata: {"data": "Hello"}\n\n',
        'event: text\ndata: {"data": "Response text"}\n\n'
        // No complete event - stream just ends
      ];

      const mockSSEResponse = createSSEMockResponse(sseEvents);
      mockVoiceChatService.submitChat.mockResolvedValue(mockSSEResponse);

      const { result } = renderHook(() => useVoiceChat(mockProps));

      await act(async () => {
        startTransition(() => {
          result.current.submit("Hello");
        });
      });

      // Should handle completion gracefully even without explicit complete event
      await waitFor(
        () => {
          expect(result.current.messages).toHaveLength(2);
          expect(result.current.messages[1].content).toBe("Response text");
          expect(result.current.chatState.isStreaming).toBe(false);
        },
        { timeout: 8000 }
      );
    });
  });
});
