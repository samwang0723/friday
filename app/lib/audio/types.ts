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
