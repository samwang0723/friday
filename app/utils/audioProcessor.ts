export class AudioProcessor {
  private audioChunks: ArrayBuffer[] = [];
  private isProcessing = false;

  constructor(
    private onAudioChunk: (chunk: ArrayBuffer) => void,
    private onError: (error: Error) => void
  ) {}

  public processAudioChunk(chunk: ArrayBuffer): void {
    try {
      this.audioChunks.push(chunk);
      this.onAudioChunk(chunk);
    } catch (error) {
      this.onError(error as Error);
    }
  }

  public processSingleResponse(response: ArrayBuffer): void {
    try {
      this.onAudioChunk(response);
    } catch (error) {
      this.onError(error as Error);
    }
  }

  public clear(): void {
    this.audioChunks = [];
    this.isProcessing = false;
  }

  public getCombinedAudio(): ArrayBuffer | null {
    if (this.audioChunks.length === 0) return null;

    const totalLength = this.audioChunks.reduce(
      (sum, chunk) => sum + chunk.byteLength,
      0
    );
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of this.audioChunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    return combined.buffer;
  }
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}

export function validateAudioFormat(arrayBuffer: ArrayBuffer): boolean {
  const view = new DataView(arrayBuffer);

  // Check for WAV format (RIFF header)
  if (arrayBuffer.byteLength >= 12) {
    const riffHeader = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );

    if (riffHeader === "RIFF") {
      const waveHeader = String.fromCharCode(
        view.getUint8(8),
        view.getUint8(9),
        view.getUint8(10),
        view.getUint8(11)
      );
      return waveHeader === "WAVE";
    }
  }

  // Check for WebM format (EBML header)
  if (arrayBuffer.byteLength >= 4) {
    const ebmlHeader = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );

    // WebM files typically start with 0x1A45DFA3 (EBML header)
    return view.getUint32(0) === 0x1a45dfa3;
  }

  return false;
}

export function getAudioDuration(arrayBuffer: ArrayBuffer): number | null {
  try {
    const view = new DataView(arrayBuffer);

    // For WAV files, duration can be calculated from header info
    if (arrayBuffer.byteLength >= 44) {
      const riffHeader = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      );

      if (riffHeader === "RIFF") {
        const sampleRate = view.getUint32(24, true);
        const byteRate = view.getUint32(28, true);
        const dataSize = view.getUint32(40, true);

        if (sampleRate > 0 && byteRate > 0) {
          return dataSize / byteRate; // Duration in seconds
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error calculating audio duration:", error);
    return null;
  }
}

export function createAudioBuffer(
  arrayBuffer: ArrayBuffer,
  sampleRate: number = 44100
): Float32Array {
  const view = new DataView(arrayBuffer);
  const samples = new Float32Array(arrayBuffer.byteLength / 2);

  for (let i = 0; i < samples.length; i++) {
    // Convert 16-bit PCM to float
    const sample = view.getInt16(i * 2, true);
    samples[i] = sample / 32768; // Normalize to [-1, 1]
  }

  return samples;
}
