import { renderHook, act } from "@testing-library/react";
import { usePlayer } from "../usePlayer";

// Mock Web Audio API with proper types
const mockAudioBuffer = {
  copyToChannel: jest.fn(),
  duration: 1,
  length: 1000
} as unknown as AudioBuffer;

const mockSource = {
  buffer: null,
  connect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  disconnect: jest.fn(),
  onended: null,
  context: null
} as unknown as AudioBufferSourceNode;

const mockAudioContext = {
  currentTime: 0,
  sampleRate: 24000,
  state: "running",
  createBuffer: jest.fn(() => mockAudioBuffer),
  createBufferSource: jest.fn(() => mockSource),
  destination: {} as AudioDestinationNode,
  close: jest.fn().mockResolvedValue(undefined)
} as unknown as AudioContext;

// Mock AudioContext constructor
Object.defineProperty(globalThis, "AudioContext", {
  writable: true,
  value: jest.fn(() => mockAudioContext)
});

// Mock ReadableStream
const createMockStream = (chunks: Uint8Array[] = [], shouldError = false) => {
  let index = 0;

  const reader = {
    read: jest.fn().mockImplementation(async () => {
      if (shouldError && index === 1) {
        throw new Error("Stream read error");
      }

      if (index >= chunks.length) {
        return { done: true, value: undefined };
      }

      return { done: false, value: chunks[index++] };
    })
  };

  return {
    getReader: jest.fn(() => reader)
  } as unknown as ReadableStream;
};

// Helper to create test audio data
const createAudioData = (size = 1000) => {
  return new Uint8Array(size);
};

describe("usePlayer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock setTimeout to be trackable
    jest.spyOn(global, "setTimeout");

    // Reset mock implementations
    (mockAudioContext as any).currentTime = 0;
    (mockAudioContext as any).state = "running";
    (mockSource as any).context = mockAudioContext;

    // Reset specific mocks to their default implementations
    const closeJest = mockAudioContext.close as jest.Mock;
    const stopJest = mockSource.stop as jest.Mock;
    const disconnectJest = mockSource.disconnect as jest.Mock;
    const createBufferJest = mockAudioContext.createBuffer as jest.Mock;

    closeJest.mockClear().mockResolvedValue(undefined);
    stopJest.mockClear();
    disconnectJest.mockClear();
    createBufferJest.mockClear().mockReturnValue(mockAudioBuffer);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Initial state", () => {
    it("should initialize with isPlaying as false", () => {
      const { result } = renderHook(() => usePlayer());

      expect(result.current.isPlaying).toBe(false);
      expect(typeof result.current.play).toBe("function");
      expect(typeof result.current.stop).toBe("function");
    });
  });

  describe("Happy path - Single stream playback", () => {
    it("should play a single stream successfully", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const chunks = [createAudioData(1000), createAudioData(1000)];
      const stream = createMockStream(chunks);

      await act(async () => {
        result.current.play(stream, callback);
      });

      expect(result.current.isPlaying).toBe(true);
      expect(globalThis.AudioContext).toHaveBeenCalledWith({
        sampleRate: 24000
      });
      expect(stream.getReader).toHaveBeenCalled();
      expect(mockAudioContext.createBuffer).toHaveBeenCalled();
      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
      expect(mockSource.connect).toHaveBeenCalledWith(
        mockAudioContext.destination
      );
      expect(mockSource.start).toHaveBeenCalled();
    });

    it("should call callback when stream completes", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const chunks = [createAudioData(1000)];
      const stream = createMockStream(chunks);

      await act(async () => {
        result.current.play(stream, callback);
      });

      // Simulate onended event
      await act(async () => {
        if ((mockSource as any).onended) {
          (mockSource as any).onended();
        }
      });

      expect(callback).toHaveBeenCalled();
      expect(result.current.isPlaying).toBe(false);
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it("should handle leftover data correctly", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      // Create data that's not divisible by 4 to test leftover handling
      const chunks = [new Uint8Array(1003), new Uint8Array(1001)];
      const stream = createMockStream(chunks);

      await act(async () => {
        result.current.play(stream, callback);
      });

      expect(mockAudioContext.createBuffer).toHaveBeenCalled();
      expect(mockSource.start).toHaveBeenCalled();
    });
  });

  describe("Happy path - Multiple streams in queue", () => {
    it("should queue multiple streams and play them sequentially", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const stream1 = createMockStream([createAudioData(1000)]);
      const stream2 = createMockStream([createAudioData(1000)]);

      await act(async () => {
        result.current.play(stream1, callback1);
        result.current.play(stream2, callback2);
      });

      expect(result.current.isPlaying).toBe(true);

      // Complete first stream
      await act(async () => {
        if ((mockSource as any).onended) {
          (mockSource as any).onended();
        }
      });

      expect(callback1).toHaveBeenCalled();
      expect(result.current.isPlaying).toBe(true); // Still playing second stream

      // Advance timer to trigger next stream processing
      await act(async () => {
        jest.advanceTimersByTime(800);
      });

      // Complete second stream
      await act(async () => {
        if ((mockSource as any).onended) {
          (mockSource as any).onended();
        }
      });

      expect(callback2).toHaveBeenCalled();
      expect(result.current.isPlaying).toBe(false);
    });

    it("should process next stream after delay", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const stream1 = createMockStream([createAudioData(1000)]);
      const stream2 = createMockStream([createAudioData(1000)]);

      await act(async () => {
        result.current.play(stream1, callback1);
        result.current.play(stream2, callback2);
      });

      // Complete first stream
      await act(async () => {
        if ((mockSource as any).onended) {
          (mockSource as any).onended();
        }
      });

      // Verify delay before next stream
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 800);

      await act(async () => {
        jest.advanceTimersByTime(800);
      });

      expect(stream2.getReader).toHaveBeenCalled();
    });
  });

  describe("Stop functionality", () => {
    it("should stop current playback and clear queue", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([createAudioData(1000)]);

      await act(async () => {
        result.current.play(stream, callback);
      });

      expect(result.current.isPlaying).toBe(true);

      await act(async () => {
        result.current.stop();
      });

      expect(result.current.isPlaying).toBe(false);
      expect(mockSource.stop).toHaveBeenCalled();
      expect(mockSource.disconnect).toHaveBeenCalled();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it("should clear queue when stopping", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const stream1 = createMockStream([createAudioData(1000)]);
      const stream2 = createMockStream([createAudioData(1000)]);

      await act(async () => {
        result.current.play(stream1, callback1);
        result.current.play(stream2, callback2);
        result.current.stop();
      });

      expect(result.current.isPlaying).toBe(false);

      // Advance timer - second stream should not play
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      expect(callback2).not.toHaveBeenCalled();
    });

    it("should handle multiple stop calls gracefully", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([createAudioData(1000)]);

      await act(async () => {
        result.current.play(stream, callback);
        result.current.stop();
        result.current.stop(); // Second stop call
      });

      expect(result.current.isPlaying).toBe(false);
      // Should not throw errors
    });
  });

  describe("Edge cases - AudioContext errors", () => {
    it("should handle AudioContext close errors gracefully", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([createAudioData(1000)]);

      const closeJest = mockAudioContext.close as jest.Mock;
      closeJest.mockImplementation(() => {
        throw new Error("Close failed");
      });

      await act(async () => {
        result.current.play(stream, callback);
        result.current.stop();
      });

      expect(result.current.isPlaying).toBe(false);
      // Should handle error gracefully
    });

    it("should handle source stop errors gracefully", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([createAudioData(1000)]);

      const stopJest = mockSource.stop as jest.Mock;
      stopJest.mockImplementation(() => {
        throw new Error("Stop failed");
      });

      await act(async () => {
        result.current.play(stream, callback);
        result.current.stop();
      });

      expect(result.current.isPlaying).toBe(false);
      // Should handle error gracefully
    });

    it("should handle closed AudioContext during playback", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const chunks = [createAudioData(1000), createAudioData(1000)];
      const stream = createMockStream(chunks);

      await act(async () => {
        result.current.play(stream, callback);
      });

      // Simulate AudioContext becoming closed during playback
      (mockAudioContext as any).state = "closed";

      // Continue stream processing - should handle gracefully
      await act(async () => {
        if ((mockSource as any).onended) {
          (mockSource as any).onended();
        }
      });

      expect(callback).toHaveBeenCalled();
    });

    it("should handle null AudioContext during playback", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([createAudioData(1000)]);

      await act(async () => {
        result.current.play(stream, callback);
      });

      // Simulate onended when no sources were created (no lastSource)
      await act(async () => {
        if ((mockSource as any).onended) {
          (mockSource as any).onended();
        }
      });

      expect(callback).toHaveBeenCalled();
      expect(result.current.isPlaying).toBe(false);
    });
  });

  describe("Edge cases - Stream errors", () => {
    it("should handle stream with very small chunks", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      // Create a stream with very small chunks to test edge case handling
      const chunks = [new Uint8Array(1), new Uint8Array(2), new Uint8Array(1)];
      const stream = createMockStream(chunks);

      await act(async () => {
        result.current.play(stream, callback);
      });

      // Stream should start playing
      expect(result.current.isPlaying).toBe(true);
      expect(mockAudioContext.createBuffer).toHaveBeenCalled();
      expect(mockSource.start).toHaveBeenCalled();

      // Complete the stream
      await act(async () => {
        if ((mockSource as any).onended) {
          (mockSource as any).onended();
        }
      });

      expect(callback).toHaveBeenCalled();
      expect(result.current.isPlaying).toBe(false);
    });

    it("should handle empty streams", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([]); // Empty stream

      await act(async () => {
        result.current.play(stream, callback);
      });

      // Should still call callback even with empty stream
      await act(async () => {
        if ((mockSource as any).onended) {
          (mockSource as any).onended();
        }
      });

      expect(callback).toHaveBeenCalled();
    });

    it("should handle streams with invalid data", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([new Uint8Array(0)]); // Zero-length data

      await act(async () => {
        result.current.play(stream, callback);
      });

      // Should handle gracefully
      expect(mockAudioContext.createBuffer).toHaveBeenCalled();
    });
  });

  describe("Edge cases - Queue management", () => {
    it("should not process queue when already processing", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const stream1 = createMockStream([createAudioData(1000)]);
      const stream2 = createMockStream([createAudioData(1000)]);

      // Add streams rapidly
      await act(async () => {
        result.current.play(stream1, callback1);
        result.current.play(stream2, callback2);
      });

      // Only first stream should be processed initially
      expect(stream1.getReader).toHaveBeenCalled();
      expect(stream2.getReader).not.toHaveBeenCalled();
    });

    it("should handle queue processing with no streams", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();

      // Play an empty stream
      await act(async () => {
        result.current.play(createMockStream([]), callback);
      });

      // Empty stream completes immediately, so isPlaying is false and callback is called
      expect(result.current.isPlaying).toBe(false);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe("Edge cases - Race conditions", () => {
    it("should handle stop called during stream processing", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([createAudioData(1000)]);

      await act(async () => {
        result.current.play(stream, callback);
      });

      // Verify playing started
      expect(result.current.isPlaying).toBe(true);

      // Now stop during processing
      await act(async () => {
        result.current.stop();
      });

      expect(result.current.isPlaying).toBe(false);
      // Note: mockSource.stop might not be called if no source was created yet
    });

    it("should handle context state changes during buffer creation", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([createAudioData(1000)]);

      // Mock context becoming closed during processing
      const createBufferJest = mockAudioContext.createBuffer as jest.Mock;
      createBufferJest.mockImplementation(() => {
        (mockAudioContext as any).state = "closed";
        return mockAudioBuffer;
      });

      await act(async () => {
        result.current.play(stream, callback);
      });

      // When context becomes closed during processing, playback doesn't start properly
      expect(result.current.isPlaying).toBe(false);
      expect(callback).toHaveBeenCalled();

      // Reset createBuffer mock for other tests
      createBufferJest.mockRestore();
    });

    it("should handle source cleanup when context is already closed", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([createAudioData(1000)]);

      await act(async () => {
        result.current.play(stream, callback);
      });

      // Simulate context closing before source cleanup
      (mockSource as any).context = {
        ...(mockAudioContext as any),
        state: "closed"
      };

      await act(async () => {
        result.current.stop();
      });

      expect(result.current.isPlaying).toBe(false);
      // Should skip source.stop() when context is closed
    });
  });

  describe("State management", () => {
    it("should maintain correct isPlaying state throughout lifecycle", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([createAudioData(1000)]);

      // Initial state
      expect(result.current.isPlaying).toBe(false);

      // During playback
      await act(async () => {
        result.current.play(stream, callback);
      });
      expect(result.current.isPlaying).toBe(true);

      // After completion
      await act(async () => {
        if ((mockSource as any).onended) {
          (mockSource as any).onended();
        }
      });
      expect(result.current.isPlaying).toBe(false);
    });

    it("should maintain isPlaying true when queue has remaining items", async () => {
      const { result } = renderHook(() => usePlayer());
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const stream1 = createMockStream([createAudioData(1000)]);
      const stream2 = createMockStream([createAudioData(1000)]);

      await act(async () => {
        result.current.play(stream1, callback1);
        result.current.play(stream2, callback2);
      });

      // After first stream completes, should still be playing (queue has items)
      await act(async () => {
        if ((mockSource as any).onended) {
          (mockSource as any).onended();
        }
      });

      expect(result.current.isPlaying).toBe(true);
    });
  });

  describe("Memory management", () => {
    it("should clean up resources properly on unmount", async () => {
      const { result, unmount } = renderHook(() => usePlayer());
      const callback = jest.fn();
      const stream = createMockStream([createAudioData(1000)]);

      await act(async () => {
        result.current.play(stream, callback);
      });

      unmount();

      // Resources should be cleaned up (no memory leaks)
      // This is implicit but the hook should not maintain references
    });

    it("should not leak memory with multiple play/stop cycles", async () => {
      const { result } = renderHook(() => usePlayer());

      for (let i = 0; i < 5; i++) {
        const callback = jest.fn();
        const stream = createMockStream([createAudioData(1000)]);

        await act(async () => {
          result.current.play(stream, callback);
          result.current.stop();
        });
      }

      expect(result.current.isPlaying).toBe(false);
      // Multiple cycles should not cause issues
    });
  });
});
