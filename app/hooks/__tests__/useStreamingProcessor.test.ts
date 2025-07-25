import { renderHook, act } from "@testing-library/react";
import { useStreamingProcessor } from "../useStreamingProcessor";
import { SSEProcessor } from "@/utils/sseProcessor";

// Mock SSEProcessor
jest.mock("@/utils/sseProcessor");

const MockedSSEProcessor = SSEProcessor as jest.MockedClass<
  typeof SSEProcessor
>;

describe("useStreamingProcessor", () => {
  let mockProcessor: jest.Mocked<SSEProcessor>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockProcessor = {
      processStream: jest.fn(),
      stop: jest.fn()
    } as any;

    MockedSSEProcessor.mockImplementation(() => mockProcessor);
  });

  describe("initialization", () => {
    it("should initialize without active processor", () => {
      const { result } = renderHook(() => useStreamingProcessor());

      expect(result.current.processSSEStream).toBeDefined();
      expect(result.current.stopTypingAnimation).toBeDefined();
      expect(typeof result.current.processSSEStream).toBe("function");
      expect(typeof result.current.stopTypingAnimation).toBe("function");
    });
  });

  describe("processSSEStream", () => {
    it("should create and process SSE stream successfully", async () => {
      const mockResponse = new Response();
      const onTextUpdate = jest.fn();
      const onAudioChunk = jest.fn();
      const onStreamComplete = jest.fn();
      const onError = jest.fn();

      mockProcessor.processStream.mockResolvedValue(undefined);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current.processSSEStream(
          mockResponse,
          onTextUpdate,
          onAudioChunk,
          onStreamComplete,
          onError
        );
      });

      expect(MockedSSEProcessor).toHaveBeenCalledWith(
        onTextUpdate,
        onAudioChunk,
        onStreamComplete,
        onError,
        expect.any(Number) // submittedAt timestamp
      );

      expect(mockProcessor.processStream).toHaveBeenCalledWith(mockResponse);
    });

    it("should cleanup existing processor before creating new one", async () => {
      const mockResponse1 = new Response();
      const mockResponse2 = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };

      mockProcessor.processStream.mockResolvedValue(undefined);

      const { result } = renderHook(() => useStreamingProcessor());

      // Start first stream
      await act(async () => {
        await result.current.processSSEStream(
          mockResponse1,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError
        );
      });

      const firstProcessor = mockProcessor;

      // Create a new mock processor for the second call
      const secondMockProcessor = {
        processStream: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn()
      } as any;

      MockedSSEProcessor.mockImplementation(() => secondMockProcessor);

      // Start second stream - should cleanup first
      await act(async () => {
        await result.current.processSSEStream(
          mockResponse2,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError
        );
      });

      expect(firstProcessor.stop).toHaveBeenCalled();
      expect(MockedSSEProcessor).toHaveBeenCalledTimes(2);
    });

    it("should handle processing errors", async () => {
      const mockResponse = new Response();
      const onTextUpdate = jest.fn();
      const onAudioChunk = jest.fn();
      const onStreamComplete = jest.fn();
      const onError = jest.fn();
      const processingError = new Error("Processing failed");

      mockProcessor.processStream.mockRejectedValue(processingError);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current.processSSEStream(
          mockResponse,
          onTextUpdate,
          onAudioChunk,
          onStreamComplete,
          onError
        );
      });

      expect(onError).toHaveBeenCalledWith(processingError);
    });

    it("should cleanup processor reference after completion", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };

      mockProcessor.processStream.mockResolvedValue(undefined);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError
        );
      });

      // After completion, calling stopTypingAnimation should not affect anything
      act(() => {
        result.current.stopTypingAnimation();
      });

      // Should not cause any errors
      expect(() => result.current.stopTypingAnimation()).not.toThrow();
    });

    it("should cleanup processor reference after error", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };
      const processingError = new Error("Processing failed");

      mockProcessor.processStream.mockRejectedValue(processingError);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError
        );
      });

      // After error, calling stopTypingAnimation should not affect anything
      act(() => {
        result.current.stopTypingAnimation();
      });

      expect(() => result.current.stopTypingAnimation()).not.toThrow();
    });

    it("should pass correct timestamp to SSEProcessor", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };

      const beforeCall = Date.now();
      mockProcessor.processStream.mockResolvedValue(undefined);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError
        );
      });

      const afterCall = Date.now();

      expect(MockedSSEProcessor).toHaveBeenCalledWith(
        callbacks.onTextUpdate,
        callbacks.onAudioChunk,
        callbacks.onStreamComplete,
        callbacks.onError,
        expect.any(Number)
      );

      const submittedAt = (MockedSSEProcessor as jest.Mock).mock.calls[0][4];
      expect(submittedAt).toBeGreaterThanOrEqual(beforeCall);
      expect(submittedAt).toBeLessThanOrEqual(afterCall);
    });
  });

  describe("stopTypingAnimation", () => {
    it("should stop active processor", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };

      // Mock a long-running process
      mockProcessor.processStream.mockImplementation(
        () => new Promise(() => {})
      );

      const { result } = renderHook(() => useStreamingProcessor());

      // Start processing (don't await - let it run)
      act(() => {
        result.current.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError
        );
      });

      // Stop the animation
      act(() => {
        result.current.stopTypingAnimation();
      });

      expect(mockProcessor.stop).toHaveBeenCalled();
    });

    it("should handle stop when no processor is active", () => {
      const { result } = renderHook(() => useStreamingProcessor());

      act(() => {
        result.current.stopTypingAnimation();
      });

      // Should not throw or cause errors
      expect(() => result.current.stopTypingAnimation()).not.toThrow();
    });

    it("should handle multiple stop calls gracefully", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };

      mockProcessor.processStream.mockImplementation(
        () => new Promise(() => {})
      );

      const { result } = renderHook(() => useStreamingProcessor());

      // Start processing
      act(() => {
        result.current.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError
        );
      });

      // Stop multiple times
      act(() => {
        result.current.stopTypingAnimation();
        result.current.stopTypingAnimation();
        result.current.stopTypingAnimation();
      });

      expect(mockProcessor.stop).toHaveBeenCalled();
      expect(() => result.current.stopTypingAnimation()).not.toThrow();
    });
  });

  describe("error handling and edge cases", () => {
    it("should handle console errors during processing", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };
      const processingError = new Error("Processing failed");

      // Mock console.error to capture the call
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      mockProcessor.processStream.mockRejectedValue(processingError);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError
        );
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Error processing SSE stream:",
        processingError
      );
      expect(callbacks.onError).toHaveBeenCalledWith(processingError);

      consoleSpy.mockRestore();
    });

    it("should handle SSEProcessor constructor errors", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };
      const constructorError = new Error("Constructor failed");

      MockedSSEProcessor.mockImplementation(() => {
        throw constructorError;
      });

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError
        );
      });

      expect(callbacks.onError).toHaveBeenCalledWith(constructorError);
    });

    it("should handle concurrent processing requests", async () => {
      const mockResponse1 = new Response();
      const mockResponse2 = new Response();
      const callbacks1 = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };
      const callbacks2 = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };

      let resolveFirst!: () => void;
      let resolveSecond!: () => void;

      const firstPromise = new Promise<void>(resolve => {
        resolveFirst = resolve;
      });

      const secondPromise = new Promise<void>(resolve => {
        resolveSecond = resolve;
      });

      let callCount = 0;
      MockedSSEProcessor.mockImplementation(
        () =>
          ({
            processStream: jest.fn(() => {
              callCount++;
              return callCount === 1 ? firstPromise : secondPromise;
            }),
            stop: jest.fn()
          }) as any
      );

      const { result } = renderHook(() => useStreamingProcessor());

      // Start first processing
      const firstPromiseCall = act(async () => {
        await result.current.processSSEStream(
          mockResponse1,
          callbacks1.onTextUpdate,
          callbacks1.onAudioChunk,
          callbacks1.onStreamComplete,
          callbacks1.onError
        );
      });

      // Start second processing before first completes
      const secondPromiseCall = act(async () => {
        await result.current.processSSEStream(
          mockResponse2,
          callbacks2.onTextUpdate,
          callbacks2.onAudioChunk,
          callbacks2.onStreamComplete,
          callbacks2.onError
        );
      });

      // Complete both
      resolveFirst();
      resolveSecond();

      await firstPromiseCall;
      await secondPromiseCall;

      expect(MockedSSEProcessor).toHaveBeenCalledTimes(2);
    });
  });

  describe("memory management", () => {
    it("should cleanup processor reference properly", async () => {
      const { result, unmount } = renderHook(() => useStreamingProcessor());

      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };

      // Mock long-running process
      mockProcessor.processStream.mockImplementation(
        () => new Promise(() => {})
      );

      // Start processing
      act(() => {
        result.current.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError
        );
      });

      // Unmount component
      unmount();

      // Should not cause memory leaks or errors
      expect(() => unmount()).not.toThrow();
    });

    it("should not leak processors between test runs", () => {
      const { result, unmount } = renderHook(() => useStreamingProcessor());

      // Use the hook
      act(() => {
        result.current.stopTypingAnimation();
      });

      unmount();

      // Create new instance
      const { result: result2 } = renderHook(() => useStreamingProcessor());

      // Should work independently
      act(() => {
        result2.current.stopTypingAnimation();
      });

      expect(() => result2.current.stopTypingAnimation()).not.toThrow();
    });
  });
});
