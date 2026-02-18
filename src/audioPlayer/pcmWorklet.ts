class LoopBuffer {
  /**
   * We use a Float32Array to store PCM data directly, bucause the input PCM data may not have a excepted fixed length
   * (such as 128 samples), so it is more convenient to manupulate the binary data directly but not a single audio frame.
   * (Which means, you need to slice the frame into 128-sample chunks before loading them into buffer.)
   */
  private buffer: Float32Array;
  private readonly maxSamples: number;
  private headPtr: number = 0;
  private readPtr: number = 0;
  private availableData: number = 0; // Track available data in buffer
  private readonly channelCount: number = 2;
  // private readonly chunkSize: number = 128 * this.channelCount; // 128 samples per channel
  private underrunCount: number = 0;

  constructor(maxSamples: number = 8192) {
    this.maxSamples = maxSamples;
    this.buffer = new Float32Array(this.maxSamples * this.channelCount).fill(0);
  }

  push(data: Float32Array) {
    const dataLength = data.length;
    if (dataLength > this.buffer.length) {
      console.warn(
        `Input data length ${dataLength} exceeds buffer capacity ${this.buffer.length}, truncating data.`,
      );
      data = data.subarray(0, this.buffer.length);
    }

    // Write data to buffer
    if (this.headPtr + dataLength > this.buffer.length) {
      const firstPartLength = this.buffer.length - this.headPtr;
      this.buffer.set(data.subarray(0, firstPartLength), this.headPtr);
      this.buffer.set(data.subarray(firstPartLength), 0);
      this.headPtr = dataLength - firstPartLength;
    } else {
      this.buffer.set(data, this.headPtr);
      this.headPtr += dataLength;
    }

    // Update available data count
    // If we're about to overflow, we cap at buffer length
    this.availableData = Math.min(
      this.availableData + dataLength,
      this.buffer.length,
    );

    // Wrap headPtr if needed
    if (this.headPtr >= this.buffer.length) {
      this.headPtr = 0;
    }
  }

  pop(size: number): Float32Array {
    const result = new Float32Array(size);

    // Check if we have enough data
    if (this.availableData < size) {
      this.underrunCount++;
      if (this.underrunCount % 100 === 1) {
        console.warn(
          `Buffer underrun #${this.underrunCount}: requested ${size} samples, only ${this.availableData} available. Returning silence.`,
        );
      }
      // Return silence to avoid crackling
      return result;
    }

    // Reset underrun count on successful read
    this.underrunCount = 0;

    // Read data from buffer
    if (this.readPtr + size > this.buffer.length) {
      const firstPartLength = this.buffer.length - this.readPtr;
      result.set(
        this.buffer.subarray(this.readPtr, this.readPtr + firstPartLength),
        0,
      );
      result.set(
        this.buffer.subarray(0, size - firstPartLength),
        firstPartLength,
      );
      this.readPtr = size - firstPartLength;
    } else {
      result.set(this.buffer.subarray(this.readPtr, this.readPtr + size));
      this.readPtr += size;
    }

    // Update available data count
    this.availableData -= size;

    // Wrap readPtr if needed
    if (this.readPtr >= this.buffer.length) {
      this.readPtr = 0;
    }

    return result;
  }

  getAvailableData(): number {
    return this.availableData;
  }
}
class pcmProcessor extends AudioWorkletProcessor {
  loopBuffer: LoopBuffer;
  private isPreBuffering: boolean = true;
  private readonly preBufferThreshold: number = 128 * 2 * 20; // ~10 chunks worth of data

  constructor() {
    super();
    this.port.onmessage = this.handleMessage.bind(this);
    console.debug("pcmProcessor initialized");
    this.loopBuffer = new LoopBuffer(2 << 16);
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    // parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0];
    const chunkLength = output[0].length; // Use actual output buffer size
    const channelCount = 2; // Fixed channel count

    // Pre-buffering: wait until we have enough data before starting playback
    if (this.isPreBuffering) {
      if (this.loopBuffer.getAvailableData() >= this.preBufferThreshold) {
        this.isPreBuffering = false;
        console.debug(
          `Pre-buffering complete, starting playback. Buffer has ${this.loopBuffer.getAvailableData()} samples.`,
        );
      } else {
        // Output silence during pre-buffering
        return true;
      }
    }

    const chunk = this.loopBuffer.pop(chunkLength * channelCount);
    const left = output[0];
    const right = output[1];

    // Deinterleave the chunk into left and right channels
    for (let i = 0; i < chunkLength; i++) {
      left[i] = chunk[i * 2];
      right[i] = chunk[i * 2 + 1];
    }

    // If buffer runs dry, re-enter pre-buffering state
    if (this.loopBuffer.getAvailableData() === 0) {
      console.warn(
        "Buffer completely drained, re-entering pre-buffering state",
      );
      this.isPreBuffering = true;
    }

    return true;
  }

  handleMessage(event: MessageEvent) {
    const pcmData = event.data as Float32Array;
    // console.debug(pcmData);
    this.loopBuffer.push(pcmData);
  }
}

registerProcessor("pcm-processor", pcmProcessor);
