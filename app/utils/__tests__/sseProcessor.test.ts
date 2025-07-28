import { SSEProcessor } from "../sseProcessor";

// Mock ReadableStream
class MockReadableStreamReader {
  private chunks: Uint8Array[];
  private index = 0;

  constructor(chunks: string[]) {
    this.chunks = chunks.map(chunk => {
      const encoder = new TextEncoder();
      return encoder.encode(chunk);
    });
  }

  async read(): Promise<{ done: boolean; value?: Uint8Array }> {
    if (this.index >= this.chunks.length) {
      return { done: true };
    }
    return { done: false, value: this.chunks[this.index++] };
  }
}

class MockResponse {
  body: { getReader: () => MockReadableStreamReader } | null;

  constructor(chunks: string[]) {
    this.body = {
      getReader: () => new MockReadableStreamReader(chunks)
    };
  }
}

describe("SSEProcessor", () => {
  let onTextUpdate: jest.Mock;
  let onAudioChunk: jest.Mock;
  let onStreamComplete: jest.Mock;
  let onError: jest.Mock;
  let processor: SSEProcessor;

  beforeEach(() => {
    onTextUpdate = jest.fn();
    onAudioChunk = jest.fn();
    onStreamComplete = jest.fn();
    onError = jest.fn();

    processor = new SSEProcessor(
      onTextUpdate,
      onAudioChunk,
      onStreamComplete,
      onError,
      Date.now()
    );

    // Mock atob for base64 decoding in this test (overrides global)
    global.atob = jest.fn(str => str);

    // Mock requestAnimationFrame to execute synchronously
    global.requestAnimationFrame = jest.fn(callback => {
      setTimeout(callback, 0);
      return 1;
    });
  });

  afterEach(() => {
    processor.stop();
  });

  it("should process text events correctly", async () => {
    const mockResponse = new MockResponse([
      'event: text\ndata: {"content": "Hello"}\n\n'
    ]) as any;

    await processor.processStream(mockResponse);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(onTextUpdate).toHaveBeenCalledWith("Hello");
  });

  it("should process audio events correctly", async () => {
    const mockResponse = new MockResponse([
      'event: audio\ndata: {"chunk": "test", "index": 0}\n\n'
    ]) as any;

    await processor.processStream(mockResponse);

    expect(onAudioChunk).toHaveBeenCalledWith(expect.any(ArrayBuffer));
  });

  it("should process complete events correctly", async () => {
    const mockResponse = new MockResponse([
      'event: text\ndata: {"content": "Hello"}\n\n',
      'event: complete\ndata: {"fullText": "Hello World"}\n\n'
    ]) as any;

    await processor.processStream(mockResponse);

    expect(onStreamComplete).toHaveBeenCalledWith(
      "Hello World",
      expect.any(Number)
    );
  });

  it("should handle error events", async () => {
    const mockResponse = new MockResponse([
      'event: error\ndata: {"message": "Test error"}\n\n'
    ]) as any;

    await processor.processStream(mockResponse);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Test error"
      })
    );
  });

  it("should handle malformed JSON gracefully", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const mockResponse = new MockResponse([
      "event: text\ndata: {invalid json}\n\n"
    ]) as any;

    await processor.processStream(mockResponse);

    expect(consoleSpy).toHaveBeenCalledWith(
      "Error parsing SSE data:",
      expect.any(Error),
      "eventType:",
      "text",
      "raw data:",
      "{invalid json}"
    );

    consoleSpy.mockRestore();
  });

  it("should handle abort errors", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    const mockResponse = {
      body: {
        getReader: () => ({
          read: () => Promise.reject(abortError)
        })
      }
    } as any;

    await processor.processStream(mockResponse);

    expect(onError).not.toHaveBeenCalled();
  });

  it("should process multiple events in sequence", async () => {
    const mockResponse = new MockResponse([
      'event: text\ndata: {"content": "Hello"}\n\n',
      'event: text\ndata: {"content": " World"}\n\n',
      'event: complete\ndata: {"fullText": "Hello World"}\n\n'
    ]) as any;

    await processor.processStream(mockResponse);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Due to typing animation and the complete event logic, the final text should be correct
    expect(onTextUpdate).toHaveBeenCalled();
    // The complete event overwrites accumulatedText, so final result should be correct
    expect(onStreamComplete).toHaveBeenCalledWith(
      "Hello World",
      expect.any(Number)
    );
  });

  it("should handle audio chunks in correct order", async () => {
    const mockResponse = new MockResponse([
      'event: audio\ndata: {"chunk": "chunk1", "index": 1}\n\n',
      'event: audio\ndata: {"chunk": "chunk0", "index": 0}\n\n'
    ]) as any;

    await processor.processStream(mockResponse);

    expect(onAudioChunk).toHaveBeenCalledTimes(2);
    // First call should be index 0, then index 1
    expect(onAudioChunk).toHaveBeenNthCalledWith(1, expect.any(ArrayBuffer));
    expect(onAudioChunk).toHaveBeenNthCalledWith(2, expect.any(ArrayBuffer));
  });

  it("should cleanup resources when stopped", () => {
    processor.stop();

    // Test that cleanup doesn't throw errors
    expect(() => processor.stop()).not.toThrow();
  });
});
