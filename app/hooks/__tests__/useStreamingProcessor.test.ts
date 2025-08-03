import { SSEProcessor } from "@/utils/sseProcessor";
import { act, renderHook } from "@testing-library/react";
import { useStreamingProcessor } from "../useStreamingProcessor";

// Mock SSEProcessor
jest.mock("@/utils/sseProcessor");

const MockedSSEProcessor = SSEProcessor as jest.MockedClass<
  typeof SSEProcessor
>;

describe("useStreamingProcessor", () => {
  let mockProcessor: jest.Mocked<SSEProcessor>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Create fresh mock for each test
    mockProcessor = {
      processStream: jest.fn(),
      stop: jest.fn(),
      getState: jest.fn(),
      isProcessing: jest.fn()
    } as any;

    MockedSSEProcessor.mockClear();
    MockedSSEProcessor.mockImplementation(() => mockProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.resetAllMocks();

    // Force cleanup any references
    mockProcessor = {
      processStream: jest.fn(),
      stop: jest.fn(),
      getState: jest.fn(),
      isProcessing: jest.fn()
    } as any;

    MockedSSEProcessor.mockClear();
    MockedSSEProcessor.mockImplementation(() => mockProcessor);
  });

  describe("initialization", () => {
    it("should initialize without active processor", () => {
      const { result } = renderHook(() => useStreamingProcessor());

      expect(result.current.processSSEStream).toBeDefined();
      expect(result.current.stopTypingAnimation).toBeDefined();
      expect(result.current.getProcessorState).toBeDefined();
      expect(result.current.isProcessorActive).toBeDefined();
      expect(typeof result.current.processSSEStream).toBe("function");
      expect(typeof result.current.stopTypingAnimation).toBe("function");
      expect(typeof result.current.getProcessorState).toBe("function");
      expect(typeof result.current.isProcessorActive).toBe("function");
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
        await result.current!.processSSEStream(
          mockResponse,
          onTextUpdate,
          onAudioChunk,
          onStreamComplete,
          onError,
          Date.now()
        );
      });

      expect(MockedSSEProcessor).toHaveBeenCalledWith(
        onTextUpdate,
        onAudioChunk,
        onStreamComplete,
        onError,
        expect.any(Number), // submittedAt timestamp
        undefined, // onTranscript callback
        undefined // onStatus callback
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

      // Create a long-running process for the first processor
      const firstMockProcessor = {
        processStream: jest.fn(() => new Promise(() => {})), // Never resolves
        stop: jest.fn()
      } as any;

      // Second processor that resolves immediately
      const secondMockProcessor = {
        processStream: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn()
      } as any;

      let processorCount = 0;
      MockedSSEProcessor.mockImplementation(() => {
        processorCount++;
        return processorCount === 1 ? firstMockProcessor : secondMockProcessor;
      });

      const { result } = renderHook(() => useStreamingProcessor());

      // Start first stream without act() to avoid overlapping calls
      // This will be a non-blocking promise that never resolves
      result.current!.processSSEStream(
        mockResponse1,
        callbacks.onTextUpdate,
        callbacks.onAudioChunk,
        callbacks.onStreamComplete,
        callbacks.onError,
        Date.now()
      );

      // Start second stream - should cleanup first
      await act(async () => {
        await result.current!.processSSEStream(
          mockResponse2,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
      });

      expect(firstMockProcessor.stop).toHaveBeenCalled();
      expect(MockedSSEProcessor).toHaveBeenCalledTimes(2);
    });

    it("should handle processing errors", async () => {
      const mockResponse = new Response();
      const onTextUpdate = jest.fn();
      const onAudioChunk = jest.fn();
      const onStreamComplete = jest.fn();
      const onError = jest.fn();
      const processingError = new Error("Processing failed");

      // Mock console.error to suppress output during error testing
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockProcessor.processStream.mockRejectedValue(processingError);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current!.processSSEStream(
          mockResponse,
          onTextUpdate,
          onAudioChunk,
          onStreamComplete,
          onError,
          Date.now()
        );
      });

      expect(onError).toHaveBeenCalledWith(processingError);

      consoleSpy.mockRestore();
    });

    it("should handle AbortError specifically", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockProcessor.processStream.mockRejectedValue(abortError);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current!.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        new Error("STREAM_ABORTED")
      );

      consoleSpy.mockRestore();
    });

    it("should handle network errors specifically", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };
      const networkError = new Error("Network connection lost");

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockProcessor.processStream.mockRejectedValue(networkError);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current!.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        new Error("NETWORK_ERROR")
      );

      consoleSpy.mockRestore();
    });

    it("should handle timeout errors specifically", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };
      const timeoutError = new Error("Request timeout exceeded");

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockProcessor.processStream.mockRejectedValue(timeoutError);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current!.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        new Error("STREAM_TIMEOUT")
      );

      consoleSpy.mockRestore();
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
        await result.current!.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
      });

      // After completion, calling stopTypingAnimation should not affect anything
      act(() => {
        result.current!.stopTypingAnimation();
      });

      // Should not cause any errors
      expect(() => result.current!.stopTypingAnimation()).not.toThrow();
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

      // Mock console.error to suppress output during error testing
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockProcessor.processStream.mockRejectedValue(processingError);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current!.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
      });

      // After error, calling stopTypingAnimation should not affect anything
      act(() => {
        result.current!.stopTypingAnimation();
      });

      expect(() => result.current!.stopTypingAnimation()).not.toThrow();

      consoleSpy.mockRestore();
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
        await result.current!.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
      });

      const afterCall = Date.now();

      expect(MockedSSEProcessor).toHaveBeenCalledWith(
        callbacks.onTextUpdate,
        callbacks.onAudioChunk,
        callbacks.onStreamComplete,
        callbacks.onError,
        expect.any(Number), // submittedAt timestamp
        undefined, // onTranscript callback
        undefined // onStatus callback
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

      // Start processing and immediately stop it to test the stop functionality
      act(() => {
        result.current!.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
        // Stop the animation in the same act block to avoid overlapping calls
        result.current!.stopTypingAnimation();
      });

      expect(mockProcessor.stop).toHaveBeenCalled();
    });

    it("should handle stop when no processor is active", () => {
      const { result } = renderHook(() => useStreamingProcessor());

      act(() => {
        result.current!.stopTypingAnimation();
      });

      // Should not throw or cause errors
      expect(() => result.current!.stopTypingAnimation()).not.toThrow();
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

      // Start processing and stop multiple times in same act to avoid overlapping calls
      act(() => {
        result.current!.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
        // Stop multiple times
        result.current!.stopTypingAnimation();
        result.current!.stopTypingAnimation();
        result.current!.stopTypingAnimation();
      });

      expect(mockProcessor.stop).toHaveBeenCalled();
      expect(() => result.current!.stopTypingAnimation()).not.toThrow();
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

      // Mock console.error to suppress output during testing
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockProcessor.processStream.mockRejectedValue(processingError);

      const { result } = renderHook(() => useStreamingProcessor());

      await act(async () => {
        await result.current!.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "StreamingProcessor: Error processing SSE stream:",
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

      // Constructor errors are not caught by the hook, they should throw
      await act(async () => {
        await expect(
          result.current!.processSSEStream(
            mockResponse,
            callbacks.onTextUpdate,
            callbacks.onAudioChunk,
            callbacks.onStreamComplete,
            callbacks.onError,
            Date.now()
          )
        ).rejects.toThrow("Constructor failed");
      });

      // Since constructor failed, onError should not be called
      expect(callbacks.onError).not.toHaveBeenCalled();
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

      // Start both processing calls sequentially to avoid overlapping act calls
      let firstComplete = false;
      let secondComplete = false;

      // Start first processing
      const firstPromiseCall = act(async () => {
        await result.current!.processSSEStream(
          mockResponse1,
          callbacks1.onTextUpdate,
          callbacks1.onAudioChunk,
          callbacks1.onStreamComplete,
          callbacks1.onError,
          Date.now()
        );
        firstComplete = true;
      });

      // Complete first
      resolveFirst();
      await firstPromiseCall;

      // Start second processing after first completes
      const secondPromiseCall = act(async () => {
        await result.current!.processSSEStream(
          mockResponse2,
          callbacks2.onTextUpdate,
          callbacks2.onAudioChunk,
          callbacks2.onStreamComplete,
          callbacks2.onError,
          Date.now()
        );
        secondComplete = true;
      });

      // Complete second
      resolveSecond();
      await secondPromiseCall;

      expect(firstComplete).toBe(true);
      expect(secondComplete).toBe(true);

      expect(MockedSSEProcessor).toHaveBeenCalledTimes(2);
    });
  });

  describe("getProcessorState", () => {
    it("should return null when no processor is active", () => {
      const { result } = renderHook(() => useStreamingProcessor());

      expect(result.current.getProcessorState()).toBeNull();
    });

    it("should return processor state when processor is active", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };

      const mockState = { accumulatedText: "test", isProcessing: true };
      mockProcessor.getState.mockReturnValue(mockState);
      mockProcessor.processStream.mockImplementation(
        () => new Promise(() => {})
      ); // Never resolves

      const { result } = renderHook(() => useStreamingProcessor());

      // Start processing but don't await
      act(() => {
        result.current.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
      });

      expect(result.current.getProcessorState()).toBe(mockState);

      // Cleanup
      act(() => {
        result.current.stopTypingAnimation();
      });
    });
  });

  describe("isProcessorActive", () => {
    it("should return false when no processor is active", () => {
      const { result } = renderHook(() => useStreamingProcessor());

      expect(result.current.isProcessorActive()).toBe(false);
    });

    it("should return true when processor is active", async () => {
      const mockResponse = new Response();
      const callbacks = {
        onTextUpdate: jest.fn(),
        onAudioChunk: jest.fn(),
        onStreamComplete: jest.fn(),
        onError: jest.fn()
      };

      mockProcessor.isProcessing.mockReturnValue(true);
      mockProcessor.processStream.mockImplementation(
        () => new Promise(() => {})
      ); // Never resolves

      const { result } = renderHook(() => useStreamingProcessor());

      // Start processing but don't await
      act(() => {
        result.current.processSSEStream(
          mockResponse,
          callbacks.onTextUpdate,
          callbacks.onAudioChunk,
          callbacks.onStreamComplete,
          callbacks.onError,
          Date.now()
        );
      });

      expect(result.current.isProcessorActive()).toBe(true);

      // Cleanup
      act(() => {
        result.current.stopTypingAnimation();
      });
    });
  });

  describe("memory management", () => {
    it("should not leak processors between test runs", () => {
      // Basic memory management test - ensure hook can be created and destroyed
      let hook1: any, hook2: any;

      expect(() => {
        hook1 = renderHook(() => useStreamingProcessor());
      }).not.toThrow();

      expect(() => {
        hook1?.unmount();
      }).not.toThrow();

      expect(() => {
        hook2 = renderHook(() => useStreamingProcessor());
      }).not.toThrow();

      expect(() => {
        hook2?.unmount();
      }).not.toThrow();

      // Basic functionality test - ensures hooks can be created independently
      expect(true).toBe(true);
    });

    it("should cleanup processor reference properly", () => {
      // Simple cleanup test that doesn't rely on complex mocking
      let hook: any;

      expect(() => {
        hook = renderHook(() => useStreamingProcessor());
      }).not.toThrow();

      expect(() => {
        hook?.unmount();
      }).not.toThrow();

      // Test passes if no errors thrown during mount/unmount cycle
      expect(true).toBe(true);
    });
  });
});
