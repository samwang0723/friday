class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Init buffer
    this.bufferSize = 24000 * 180; // 24kHz x 180 seconds
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;

    // Handle incoming messages from main thread
    this.port.onmessage = event => {
      // Reset the buffer when 'endOfAudio' message received
      if (event.data.command === "endOfAudio") {
        this.readIndex = this.writeIndex; // Clear the buffer
        console.log("endOfAudio received, clearing the buffer.");
        return;
      }

      // Handle ArrayBuffer data (coming from audio chunks)
      let int16Samples;
      if (event.data instanceof ArrayBuffer) {
        // Convert ArrayBuffer to Int16Array
        int16Samples = new Int16Array(event.data);
      } else if (event.data instanceof Int16Array) {
        // Already the correct format
        int16Samples = event.data;
      } else {
        // Invalid data type
        console.error("PCMPlayerProcessor: Invalid audio data type:", typeof event.data);
        return;
      }

      // Add the audio data to the buffer
      this._enqueue(int16Samples);
    };
  }

  // Push incoming Int16 data into our ring buffer.
  _enqueue(int16Samples) {
    for (let i = 0; i < int16Samples.length; i++) {
      // Convert 16-bit integer to float in [-1, 1]
      const floatVal = int16Samples[i] / 32768;

      // Store in ring buffer for left channel only (mono)
      this.buffer[this.writeIndex] = floatVal;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

      // Overflow handling (overwrite oldest samples)
      if (this.writeIndex === this.readIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
  }

  // The system calls `process()` ~128 samples at a time (depending on the browser).
  // We fill the output buffers from our ring buffer.
  process(inputs, outputs, parameters) {
    // Write a frame to the output
    const output = outputs[0];
    const framesPerBlock = output[0].length;
    for (let frame = 0; frame < framesPerBlock; frame++) {
      // Write the sample(s) into the output buffer
      output[0][frame] = this.buffer[this.readIndex]; // left channel
      if (output.length > 1) {
        output[1][frame] = this.buffer[this.readIndex]; // right channel
      }

      // Move the read index forward unless underflowing
      if (this.readIndex != this.writeIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }

    // Returning true tells the system to keep the processor alive
    return true;
  }
}

registerProcessor("pcm-player-processor", PCMPlayerProcessor);
