export interface ITranscriptionService {
  transcribe(audio: Buffer): Promise<string>;
}

export interface ITextToSpeechService {
  synthesize(text: string, abortSignal?: AbortSignal): Promise<Response>;
  synthesizeStream(
    textChunks: AsyncIterable<string>,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>>;
}
