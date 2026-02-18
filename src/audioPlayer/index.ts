/**
 * You must place the decoder in the main thread (in this file), because AudioDecoder is not available in
 * AudioWorkletGlobalScope (the file which contains the audioWorklet logic).
 */

interface AudioDecoderConfig {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
}

const workletUrl = new URL("./pcmWorklet.ts", import.meta.url).href;

class loopBuffer<T extends ArrayBuffer> {
  private buffer: T | null = null;
  private size: number;
  private writeIndex: number = 0;
  private readIndex: number = 0;
  private isFilled: boolean = false;
  constructor(size: number, initialBuffer?: T) {
    this.size = size;
    this.buffer = initialBuffer || null;
  }
}

class AudioManager {
  private audioctx: AudioContext;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;
  private loopBuffer: loopBuffer<ArrayBuffer> | null = null;
  private worklet: AudioWorklet | null = null;
  private decoder: AudioDecoder | null = null;
  private gainNode: GainNode;

  constructor(audioDecoderConfig: AudioDecoderConfig) {
    this.audioctx = new AudioContext();
    this.decoder = new AudioDecoder({
      output: (data) => {
        console.debug(`Decoded audio data: `, data);
      },
      error: (e) => console.error("AudioDecoder error:", e),
    });
    this.decoder.configure(audioDecoderConfig);
    this.gainNode = this.audioctx.createGain();
    this.gainNode.connect(this.audioctx.destination);

    this.worklet = new AudioWorklet();
    this.worklet
      .addModule(workletUrl)
      .then(() => {
        console.debug("AudioWorklet module loaded");
      })
      .catch((e) => {
        console.error("Failed to load AudioWorklet module:", e);
      });
  }

  initAudioContext() {
    if (this.audioctx.state === "suspended") {
      this.audioctx
        .resume()
        .then(() => {
          console.debug("AudioContext resumed");
        })
        .catch((e) => {
          console.error("Failed to resume AudioContext:", e);
        });
    }
  }

  set volume(value: number) {
    // 1.0 is the default volume, 0.0 is silence, and 2.0 is double the normal volume
    if (value < 0 || value > 2) {
      console.warn(
        "Volume value should be between 0.0 and 2.0, ignored:",
        value,
      );
      return;
    }
    this.gainNode.gain.value = value;
  }

  get volume(): number {
    return this.gainNode.gain.value;
  }

  set volumeLogarithmic(value: number) {
    const linearValue = Math.pow(10, (value - 1) * 2); // Simple logarithmic scaling
    this.volume = linearValue;
  }

  get volumeLogarithmic(): number {
    // Convert linear gain back to logarithmic volume
    const linearValue = this.volume;
    return 1 + Math.log10(linearValue) / 2; // Inverse of the above scaling
  }
}

export { AudioManager };
