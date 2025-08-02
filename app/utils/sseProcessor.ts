import type {
  AudioEventData,
  CompleteEventData,
  ErrorEventData,
  SSEventData,
  StatusEventData,
  StreamingState,
  TextEventData,
  TranscriptEventData
} from "@/types/voiceChat";

export class SSEProcessor {
  private state: StreamingState;
  private audioChunkMap = new Map<number, Uint8Array>();
  private nextExpectedIndex = 0;
  private onTextUpdate: (text: string) => void;
  private onAudioChunk: (chunk: ArrayBuffer) => void;
  private onStreamComplete: (finalText: string, latency: number) => void;
  private onError: (error: Error) => void;
  private onTranscript?: (transcript: string) => void;
  private onStatus?: (status: string) => void;
  private submittedAt: number;

  constructor(
    onTextUpdate: (text: string) => void,
    onAudioChunk: (chunk: ArrayBuffer) => void,
    onStreamComplete: (finalText: string, latency: number) => void,
    onError: (error: Error) => void,
    submittedAt: number,
    onTranscript?: (transcript: string) => void,
    onStatus?: (status: string) => void
  ) {
    this.state = {
      buffer: "",
      accumulatedText: "",
      displayedText: "",
      textQueue: "",
      typingIntervalId: null,
      finalLatency: 0,
      firstPacketLatency: 0,
      firstPacketReceived: false,
      audioStreamStarted: false,
      audioStreamClosed: false
    };
    this.onTextUpdate = onTextUpdate;
    this.onAudioChunk = onAudioChunk;
    this.onStreamComplete = onStreamComplete;
    this.onError = onError;
    this.onTranscript = onTranscript;
    this.onStatus = onStatus;
    this.submittedAt = submittedAt;
  }

  public async processStream(response: Response): Promise<void> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        console.log("Processing stream", value);
        if (done) break;

        this.state.buffer += decoder.decode(value, { stream: true });
        await this.processEvents();
      }

      // Stream completed - completion will be signaled by handleCompleteEvent
      // when typing animation finishes
    } catch (error) {
      this.cleanup();
      if (error instanceof Error && error.name === "AbortError") {
        console.log("SSE stream was cancelled");
        return;
      }
      this.onError(error as Error);
    } finally {
      this.cleanup();
    }
  }

  private async processEvents(): Promise<void> {
    while (this.state.buffer.includes("\n\n")) {
      const eventEnd = this.state.buffer.indexOf("\n\n");
      const eventText = this.state.buffer.substring(0, eventEnd);
      this.state.buffer = this.state.buffer.substring(eventEnd + 2);

      const event = this.parseEvent(eventText);
      if (event.eventType && event.eventData) {
        await this.handleEvent(event);
      }
    }
  }

  private parseEvent(eventText: string): SSEventData {
    const eventLines = eventText.split("\n");
    let eventType = "";
    let eventData = "";

    for (const line of eventLines) {
      if (line.startsWith("event:")) {
        eventType = line.substring(6).trim();
      } else if (line.startsWith("data:")) {
        eventData = line.substring(5).trim();
      }
    }

    return { eventType, eventData };
  }

  private async handleEvent(event: SSEventData): Promise<void> {
    try {
      const data = JSON.parse(event.eventData);

      // Capture first packet latency
      if (
        !this.state.firstPacketReceived &&
        (event.eventType === "text" ||
          event.eventType === "audio" ||
          event.eventType === "transcript")
      ) {
        this.state.firstPacketLatency = Date.now() - this.submittedAt;
        this.state.firstPacketReceived = true;
      }

      switch (event.eventType) {
        case "transcript":
          this.handleTranscriptEvent(data as TranscriptEventData);
          break;
        case "text":
          this.handleTextEvent(data as TextEventData);
          break;
        case "audio":
          this.handleAudioEvent(data as AudioEventData);
          break;
        case "complete":
          this.handleCompleteEvent(data as CompleteEventData);
          break;
        case "status":
          this.handleStatusEvent(data as StatusEventData);
          break;
        case "error":
          this.handleErrorEvent(data as ErrorEventData);
          break;
        default:
          console.warn("Unknown event type:", event.eventType);
      }
    } catch (error) {
      console.error(
        "Error parsing SSE data:",
        error,
        "eventType:",
        event.eventType,
        "raw data:",
        event.eventData
      );
    }
  }

  private handleTextEvent(data: TextEventData): void {
    this.state.accumulatedText += data.content;
    this.state.textQueue += data.content;
    this.startTypingAnimation();
  }

  private handleAudioEvent(data: AudioEventData): void {
    // Decode base64 audio chunk
    const binaryString = atob(data.chunk);
    const bytes = new Uint8Array(binaryString.length);
    for (let j = 0; j < binaryString.length; j++) {
      bytes[j] = binaryString.charCodeAt(j);
    }
    this.processAudioChunk(data.index || 0, bytes);
  }

  private handleCompleteEvent(data: CompleteEventData): void {
    this.state.finalLatency = Date.now() - this.submittedAt;
    this.state.accumulatedText = data.fullText;

    // Ensure all text is typed out before completing
    this.state.textQueue += data.fullText.substring(
      this.state.displayedText.length
    );

    // Wait for typing to complete, then signal stream completion
    this.waitForTypingComplete().then(() => {
      const finalMessage = this.state.accumulatedText;
      const latency = this.state.firstPacketReceived
        ? this.state.firstPacketLatency
        : this.state.finalLatency;

      this.onStreamComplete(finalMessage, latency);
    });
  }

  private handleErrorEvent(data: ErrorEventData): void {
    this.stopTypingAnimation();
    this.onError(new Error(data.message));
  }

  private handleTranscriptEvent(data: TranscriptEventData): void {
    if (this.onTranscript) {
      this.onTranscript(data.content);
    }
  }

  private handleStatusEvent(data: StatusEventData): void {
    if (this.onStatus) {
      this.onStatus(data.message);
    }
  }

  private processAudioChunk(index: number, bytes: Uint8Array): void {
    // Store chunk
    this.audioChunkMap.set(index, bytes);

    // Process any consecutive chunks we have
    while (this.audioChunkMap.has(this.nextExpectedIndex)) {
      const chunk = this.audioChunkMap.get(this.nextExpectedIndex)!;

      // Start audio playback on first chunk
      if (!this.state.audioStreamStarted) {
        this.state.audioStreamStarted = true;
      }

      // Feed chunk to audio stream
      this.onAudioChunk(chunk.slice().buffer);

      // Clean up and move to next
      this.audioChunkMap.delete(this.nextExpectedIndex);
      this.nextExpectedIndex++;
    }
  }

  private startTypingAnimation(): void {
    if (this.state.typingIntervalId) return; // Already typing

    // Use requestAnimationFrame for better performance than setInterval
    const typeNextChunk = () => {
      if (this.state.textQueue.length > 0) {
        // Process multiple characters per frame for better performance
        const charsPerFrame = Math.min(3, this.state.textQueue.length);
        const nextChars = this.state.textQueue.substring(0, charsPerFrame);
        this.state.textQueue = this.state.textQueue.substring(charsPerFrame);
        this.state.displayedText += nextChars;
        this.onTextUpdate(this.state.displayedText);

        this.state.typingIntervalId = requestAnimationFrame(typeNextChunk);
      } else {
        this.state.typingIntervalId = null;
      }
    };

    this.state.typingIntervalId = requestAnimationFrame(typeNextChunk);
  }

  private stopTypingAnimation(): void {
    if (this.state.typingIntervalId) {
      cancelAnimationFrame(this.state.typingIntervalId);
      this.state.typingIntervalId = null;
    }
  }

  private waitForTypingComplete(): Promise<void> {
    return new Promise(resolve => {
      const checkTyping = () => {
        if (this.state.textQueue.length === 0 && !this.state.typingIntervalId) {
          // Typing is complete
          resolve();
        } else {
          setTimeout(checkTyping, 50);
        }
      };
      checkTyping();
    });
  }

  private cleanup(): void {
    this.stopTypingAnimation();
    this.audioChunkMap.clear();
    this.nextExpectedIndex = 0;
  }

  public stop(): void {
    console.debug("SSEProcessor: Stopping stream processing");
    this.cleanup();
    // Trigger error callback to resolve hanging promises
    if (this.onError) {
      this.onError(new Error("STREAM_INTERRUPTED"));
    }
  }

  public isProcessing(): boolean {
    return (
      this.state.typingIntervalId !== null ||
      this.state.textQueue.length > 0 ||
      this.audioChunkMap.size > 0
    );
  }

  public getState(): StreamingState {
    return { ...this.state };
  }
}
