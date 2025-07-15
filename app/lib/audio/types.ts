export interface ITranscriptionService {
  transcribe(audio: Buffer): Promise<string>;
}

export interface ITextToSpeechService {
  synthesize(text: string, abortSignal?: AbortSignal): Promise<Response>;
  synthesizeStream(
    text: string,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>>;
}

export interface IStreamingTextToSpeechService {
  synthesizeStream(
    textChunks: AsyncIterable<string>,
    abortSignal?: AbortSignal
  ): AsyncIterable<Buffer>;
}

// Enhanced interface for real-time chunk processing
export interface IEnhancedTextToSpeechService extends ITextToSpeechService {
  /**
   * Process text chunks in real-time as they arrive
   * Each chunk is processed immediately and audio is streamed back
   */
  synthesizeChunkedStream(
    textChunks: AsyncIterable<string>,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>>;

  /**
   * Check if the service supports real-time chunked streaming
   */
  supportsChunkedStreaming(): boolean;
}
