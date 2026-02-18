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

class AudioManager {
  private audioctx: AudioContext;
  private isPlaying: boolean = false;
  private decoder: AudioDecoder;
  private gainNode: GainNode;
  private workletNode: AudioWorkletNode | null = null;

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

    this.audioctx.audioWorklet
      .addModule(workletUrl)
      .then(() => {
        console.debug("AudioWorklet module loaded");
        this.workletNode = new AudioWorkletNode(this.audioctx, "pcm-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [audioDecoderConfig.numberOfChannels],
        });
        this.workletNode.connect(this.gainNode);
        console.debug("AudioWorkletNode created and connected");
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
          this.isPlaying = true;
          console.debug("AudioContext resumed");
        })
        .catch((e) => {
          console.error("Failed to resume AudioContext:", e);
        });
    }
  }

  sendPCMToWorklet(pcmData: Float32Array) {
    if (!this.workletNode) {
      console.warn("AudioWorkletNode not initialized yet, cannot send PCM data");
      return;
    }
    this.workletNode.port.postMessage(pcmData);
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

  togglePlay() {
    this.isPlaying = this.audioctx.state === "running";
    if (this.isPlaying) {
      this.audioctx.suspend().then(() => {
        this.isPlaying = false;
        console.debug("AudioContext suspended");
      });
    } else {
      this.audioctx.resume().then(() => {
        this.isPlaying = true;
        console.debug("AudioContext resumed");
      });
    }
  }
  set playing(value: boolean) {
    if (value) {
      this.initAudioContext();
    }
  }
}

const audio = new AudioManager({
  codec: "opus",
  sampleRate: 48000,
  numberOfChannels: 2,
});

export { AudioManager, audio };
