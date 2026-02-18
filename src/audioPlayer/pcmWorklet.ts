class LoopBuffer<T> {
  private buffer: T | null = null;
  private size: number
  private writeIndex: number = 0;
  private readIndex: number = 0;
  private isFilled: boolean = false;
  constructor(size: number, initialBuffer?: T) {
    this.size = size;
    this.buffer = initialBuffer || null;
  }
}

class pcmProcessor extends AudioWorkletProcessor {
  loopBuffer: LoopBuffer<Float32Array> | null = null;
  constructor() {
    super();
    this.port.onmessage = this.handleMessage.bind(this);
    console.debug("pcmProcessor initialized");
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {

    return true;
  }

  handleMessage(event: MessageEvent) {
    console.debug(`[pcmWorklet]`, event);
  }
}

registerProcessor("pcm-processor", pcmProcessor);
