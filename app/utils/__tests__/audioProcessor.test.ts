import {
  AudioProcessor,
  base64ToArrayBuffer,
  validateAudioFormat,
  getAudioDuration,
  createAudioBuffer
} from "../audioProcessor";

describe("AudioProcessor", () => {
  let mockOnAudioChunk: jest.Mock;
  let mockOnError: jest.Mock;
  let processor: AudioProcessor;

  beforeEach(() => {
    mockOnAudioChunk = jest.fn();
    mockOnError = jest.fn();
    processor = new AudioProcessor(mockOnAudioChunk, mockOnError);
  });

  describe("constructor", () => {
    it("should initialize with callbacks", () => {
      expect(processor).toBeInstanceOf(AudioProcessor);
      expect(mockOnAudioChunk).not.toHaveBeenCalled();
      expect(mockOnError).not.toHaveBeenCalled();
    });
  });

  describe("processAudioChunk", () => {
    it("should process audio chunk successfully", () => {
      const testChunk = new ArrayBuffer(8);

      processor.processAudioChunk(testChunk);

      expect(mockOnAudioChunk).toHaveBeenCalledWith(testChunk);
      expect(mockOnError).not.toHaveBeenCalled();
    });

    it("should handle multiple audio chunks", () => {
      const chunks = [
        new ArrayBuffer(4),
        new ArrayBuffer(8),
        new ArrayBuffer(12)
      ];

      chunks.forEach(chunk => {
        processor.processAudioChunk(chunk);
      });

      expect(mockOnAudioChunk).toHaveBeenCalledTimes(3);
      chunks.forEach((chunk, index) => {
        expect(mockOnAudioChunk).toHaveBeenNthCalledWith(index + 1, chunk);
      });
    });

    it("should call onError when processing fails", () => {
      const errorChunk = new ArrayBuffer(4);
      mockOnAudioChunk.mockImplementation(() => {
        throw new Error("Processing failed");
      });

      processor.processAudioChunk(errorChunk);

      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
      expect(mockOnError.mock.calls[0][0].message).toBe("Processing failed");
    });

    it("should store chunks internally", () => {
      const chunk1 = new ArrayBuffer(4);
      const chunk2 = new ArrayBuffer(8);

      processor.processAudioChunk(chunk1);
      processor.processAudioChunk(chunk2);

      // Test that chunks are stored by checking combined audio
      const combined = processor.getCombinedAudio();
      expect(combined).not.toBeNull();
      expect(combined!.byteLength).toBe(12); // 4 + 8
    });
  });

  describe("processSingleResponse", () => {
    it("should process single response successfully", () => {
      const responseBuffer = new ArrayBuffer(16);

      processor.processSingleResponse(responseBuffer);

      expect(mockOnAudioChunk).toHaveBeenCalledWith(responseBuffer);
      expect(mockOnError).not.toHaveBeenCalled();
    });

    it("should handle processing error in single response", () => {
      const responseBuffer = new ArrayBuffer(16);
      mockOnAudioChunk.mockImplementation(() => {
        throw new Error("Single response processing failed");
      });

      processor.processSingleResponse(responseBuffer);

      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
      expect(mockOnError.mock.calls[0][0].message).toBe(
        "Single response processing failed"
      );
    });

    it("should handle empty buffer", () => {
      const emptyBuffer = new ArrayBuffer(0);

      processor.processSingleResponse(emptyBuffer);

      expect(mockOnAudioChunk).toHaveBeenCalledWith(emptyBuffer);
      expect(mockOnError).not.toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("should clear audio chunks and reset processing state", () => {
      // Add some chunks first
      processor.processAudioChunk(new ArrayBuffer(4));
      processor.processAudioChunk(new ArrayBuffer(8));

      // Verify chunks exist
      let combined = processor.getCombinedAudio();
      expect(combined).not.toBeNull();
      expect(combined!.byteLength).toBe(12);

      // Clear
      processor.clear();

      // Verify chunks are cleared
      combined = processor.getCombinedAudio();
      expect(combined).toBeNull();
    });

    it("should clear multiple times without error", () => {
      processor.processAudioChunk(new ArrayBuffer(4));

      processor.clear();
      processor.clear();
      processor.clear();

      expect(processor.getCombinedAudio()).toBeNull();
    });
  });

  describe("getCombinedAudio", () => {
    it("should return null when no chunks", () => {
      const combined = processor.getCombinedAudio();
      expect(combined).toBeNull();
    });

    it("should combine single chunk", () => {
      const chunk = new ArrayBuffer(8);
      const view = new Uint8Array(chunk);
      view.fill(42); // Fill with test data

      processor.processAudioChunk(chunk);

      const combined = processor.getCombinedAudio();
      expect(combined).not.toBeNull();
      expect(combined!.byteLength).toBe(8);

      // Verify data integrity
      const combinedView = new Uint8Array(combined!);
      expect(combinedView[0]).toBe(42);
      expect(combinedView[7]).toBe(42);
    });

    it("should combine multiple chunks in correct order", () => {
      // Create test chunks with identifiable data
      const chunk1 = new ArrayBuffer(4);
      const chunk2 = new ArrayBuffer(4);
      const chunk3 = new ArrayBuffer(4);

      const view1 = new Uint8Array(chunk1);
      const view2 = new Uint8Array(chunk2);
      const view3 = new Uint8Array(chunk3);

      view1.fill(1);
      view2.fill(2);
      view3.fill(3);

      processor.processAudioChunk(chunk1);
      processor.processAudioChunk(chunk2);
      processor.processAudioChunk(chunk3);

      const combined = processor.getCombinedAudio();
      expect(combined).not.toBeNull();
      expect(combined!.byteLength).toBe(12);

      // Verify order and data integrity
      const combinedView = new Uint8Array(combined!);
      expect(combinedView[0]).toBe(1); // First chunk
      expect(combinedView[3]).toBe(1);
      expect(combinedView[4]).toBe(2); // Second chunk
      expect(combinedView[7]).toBe(2);
      expect(combinedView[8]).toBe(3); // Third chunk
      expect(combinedView[11]).toBe(3);
    });

    it("should handle chunks of different sizes", () => {
      const chunks = [
        new ArrayBuffer(1),
        new ArrayBuffer(10),
        new ArrayBuffer(3),
        new ArrayBuffer(7)
      ];

      chunks.forEach((chunk, index) => {
        const view = new Uint8Array(chunk);
        view.fill(index + 1);
        processor.processAudioChunk(chunk);
      });

      const combined = processor.getCombinedAudio();
      expect(combined).not.toBeNull();
      expect(combined!.byteLength).toBe(21); // 1 + 10 + 3 + 7

      const combinedView = new Uint8Array(combined!);
      expect(combinedView[0]).toBe(1); // First chunk
      expect(combinedView[1]).toBe(2); // Second chunk starts
      expect(combinedView[11]).toBe(3); // Third chunk starts
      expect(combinedView[14]).toBe(4); // Fourth chunk starts
    });
  });
});

describe("base64ToArrayBuffer", () => {
  it("should convert simple base64 string to ArrayBuffer", () => {
    const base64 = btoa("hello"); // Create base64 from known string
    const result = base64ToArrayBuffer(base64);

    expect(result).toBeInstanceOf(ArrayBuffer);

    // Convert back to verify
    const view = new Uint8Array(result);
    const decoded = String.fromCharCode(...view);
    expect(decoded).toBe("hello");
  });

  it("should handle empty base64 string", () => {
    const result = base64ToArrayBuffer("");

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBe(0);
  });

  it("should handle binary data in base64", () => {
    // Create binary data
    const binaryData = new Uint8Array([0, 1, 255, 128, 64]);
    const binaryString = String.fromCharCode(...binaryData);
    const base64 = btoa(binaryString);

    const result = base64ToArrayBuffer(base64);
    const resultView = new Uint8Array(result);

    expect(resultView).toEqual(binaryData);
  });

  it("should handle padding in base64", () => {
    const testCases = [
      "YQ==", // Single character with padding
      "YWI=", // Two characters with padding
      "YWJj" // Three characters without padding
    ];

    testCases.forEach(base64 => {
      const result = base64ToArrayBuffer(base64);
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBeGreaterThan(0);
    });
  });
});

describe("validateAudioFormat", () => {
  it("should validate WAV format correctly", () => {
    // Create a mock WAV header
    const wavBuffer = new ArrayBuffer(44);
    const view = new DataView(wavBuffer);

    // RIFF header
    view.setUint8(0, "R".charCodeAt(0));
    view.setUint8(1, "I".charCodeAt(0));
    view.setUint8(2, "F".charCodeAt(0));
    view.setUint8(3, "F".charCodeAt(0));

    // WAVE format
    view.setUint8(8, "W".charCodeAt(0));
    view.setUint8(9, "A".charCodeAt(0));
    view.setUint8(10, "V".charCodeAt(0));
    view.setUint8(11, "E".charCodeAt(0));

    const result = validateAudioFormat(wavBuffer);
    expect(result).toBe(true);
  });

  it("should validate WebM format correctly", () => {
    // Create a mock WebM header (EBML)
    const webmBuffer = new ArrayBuffer(4);
    const view = new DataView(webmBuffer);

    // WebM EBML header signature
    view.setUint32(0, 0x1a45dfa3);

    const result = validateAudioFormat(webmBuffer);
    expect(result).toBe(true);
  });

  it("should reject invalid format", () => {
    const invalidBuffer = new ArrayBuffer(44);
    const view = new DataView(invalidBuffer);

    // Fill with invalid header
    view.setUint8(0, "X".charCodeAt(0));
    view.setUint8(1, "X".charCodeAt(0));
    view.setUint8(2, "X".charCodeAt(0));
    view.setUint8(3, "X".charCodeAt(0));

    const result = validateAudioFormat(invalidBuffer);
    expect(result).toBe(false);
  });

  it("should reject buffers that are too small", () => {
    const tinyBuffer = new ArrayBuffer(2);
    const result = validateAudioFormat(tinyBuffer);
    expect(result).toBe(false);
  });

  it("should handle RIFF without WAVE", () => {
    const riffBuffer = new ArrayBuffer(12);
    const view = new DataView(riffBuffer);

    // RIFF header but not WAVE
    view.setUint8(0, "R".charCodeAt(0));
    view.setUint8(1, "I".charCodeAt(0));
    view.setUint8(2, "F".charCodeAt(0));
    view.setUint8(3, "F".charCodeAt(0));
    view.setUint8(8, "X".charCodeAt(0));
    view.setUint8(9, "X".charCodeAt(0));
    view.setUint8(10, "X".charCodeAt(0));
    view.setUint8(11, "X".charCodeAt(0));

    const result = validateAudioFormat(riffBuffer);
    expect(result).toBe(false);
  });

  it("should handle edge case buffer sizes", () => {
    // Test exact minimum sizes
    const bufferSize4 = new ArrayBuffer(4);
    const bufferSize12 = new ArrayBuffer(12);

    expect(validateAudioFormat(bufferSize4)).toBe(false);
    expect(validateAudioFormat(bufferSize12)).toBe(false);
  });
});

describe("getAudioDuration", () => {
  it("should calculate WAV duration correctly", () => {
    const wavBuffer = new ArrayBuffer(44);
    const view = new DataView(wavBuffer);

    // Create valid WAV header
    view.setUint8(0, "R".charCodeAt(0));
    view.setUint8(1, "I".charCodeAt(0));
    view.setUint8(2, "F".charCodeAt(0));
    view.setUint8(3, "F".charCodeAt(0));

    // Sample rate (44100 Hz)
    view.setUint32(24, 44100, true);
    // Byte rate (176400 bytes/sec for 16-bit stereo at 44.1kHz)
    view.setUint32(28, 176400, true);
    // Data size (1 second worth of data)
    view.setUint32(40, 176400, true);

    const duration = getAudioDuration(wavBuffer);
    expect(duration).toBeCloseTo(1.0, 2); // 1 second
  });

  it("should return null for invalid WAV header", () => {
    const invalidBuffer = new ArrayBuffer(44);
    const view = new DataView(invalidBuffer);

    // Invalid header
    view.setUint8(0, "X".charCodeAt(0));
    view.setUint8(1, "X".charCodeAt(0));
    view.setUint8(2, "X".charCodeAt(0));
    view.setUint8(3, "X".charCodeAt(0));

    const duration = getAudioDuration(invalidBuffer);
    expect(duration).toBeNull();
  });

  it("should return null for buffer too small", () => {
    const tinyBuffer = new ArrayBuffer(20);
    const duration = getAudioDuration(tinyBuffer);
    expect(duration).toBeNull();
  });

  it("should handle zero sample rate", () => {
    const wavBuffer = new ArrayBuffer(44);
    const view = new DataView(wavBuffer);

    // Valid RIFF header
    view.setUint8(0, "R".charCodeAt(0));
    view.setUint8(1, "I".charCodeAt(0));
    view.setUint8(2, "F".charCodeAt(0));
    view.setUint8(3, "F".charCodeAt(0));

    // Zero sample rate
    view.setUint32(24, 0, true);
    view.setUint32(28, 0, true);

    const duration = getAudioDuration(wavBuffer);
    expect(duration).toBeNull();
  });

  it("should handle errors gracefully", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    // Create a buffer that will cause an error when accessed
    const errorBuffer = new ArrayBuffer(44);

    // Mock DataView to throw an error
    const originalDataView = global.DataView;
    global.DataView = jest.fn().mockImplementation(() => {
      throw new Error("DataView error");
    });

    const duration = getAudioDuration(errorBuffer);
    expect(duration).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error calculating audio duration:",
      expect.any(Error)
    );

    // Restore
    global.DataView = originalDataView;
    consoleSpy.mockRestore();
  });
});

describe("createAudioBuffer", () => {
  it("should create Float32Array from PCM data", () => {
    // Create mock 16-bit PCM data
    const pcmBuffer = new ArrayBuffer(8); // 4 samples * 2 bytes each
    const view = new DataView(pcmBuffer);

    // Set 16-bit PCM values
    view.setInt16(0, 32767, true); // Max positive
    view.setInt16(2, -32768, true); // Max negative
    view.setInt16(4, 0, true); // Zero
    view.setInt16(6, 16384, true); // Half positive

    const result = createAudioBuffer(pcmBuffer);

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(4);

    // Check normalization to [-1, 1]
    expect(result[0]).toBeCloseTo(1.0, 3); // 32767/32768 ≈ 1
    expect(result[1]).toBeCloseTo(-1.0, 3); // -32768/32768 = -1
    expect(result[2]).toBeCloseTo(0.0, 3); // 0/32768 = 0
    expect(result[3]).toBeCloseTo(0.5, 3); // 16384/32768 = 0.5
  });

  it("should handle empty buffer", () => {
    const emptyBuffer = new ArrayBuffer(0);
    const result = createAudioBuffer(emptyBuffer);

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(0);
  });

  it("should handle odd-sized buffers", () => {
    // Buffer with odd number of bytes (should ignore last byte)
    const oddBuffer = new ArrayBuffer(5);
    const result = createAudioBuffer(oddBuffer);

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(2); // 4 bytes = 2 samples
  });

  it("should use custom sample rate", () => {
    const pcmBuffer = new ArrayBuffer(4);
    const view = new DataView(pcmBuffer);
    view.setInt16(0, 16384, true);
    view.setInt16(2, -16384, true);

    // Sample rate doesn't affect the conversion but we test it doesn't break
    const result1 = createAudioBuffer(pcmBuffer, 22050);
    const result2 = createAudioBuffer(pcmBuffer, 48000);

    expect(result1.length).toBe(result2.length);
    expect(result1[0]).toBeCloseTo(result2[0]);
  });

  it("should handle maximum and minimum PCM values correctly", () => {
    const pcmBuffer = new ArrayBuffer(4);
    const view = new DataView(pcmBuffer);

    // Test boundary values
    view.setInt16(0, 32767, true); // Max positive 16-bit
    view.setInt16(2, -32768, true); // Min negative 16-bit

    const result = createAudioBuffer(pcmBuffer);

    expect(result[0]).toBeCloseTo(0.999969482, 6); // 32767/32768
    expect(result[1]).toBe(-1.0); // -32768/32768
  });

  it("should handle large buffers efficiently", () => {
    const largeSize = 10000; // 5000 samples
    const largeBuffer = new ArrayBuffer(largeSize);
    const view = new DataView(largeBuffer);

    // Fill with test pattern
    for (let i = 0; i < largeSize; i += 2) {
      view.setInt16(i, ((i / 2) % 65536) - 32768, true);
    }

    const result = createAudioBuffer(largeBuffer);

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(largeSize / 2);

    // Spot check a few values
    expect(result[0]).toBeCloseTo(-1.0, 3);
    expect(result[100]).toBeDefined();
    expect(result[result.length - 1]).toBeDefined();
  });
});
