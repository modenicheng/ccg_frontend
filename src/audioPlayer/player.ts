import { getCssVariable } from "../utils/color";

class audioPlayer {
  private audioCtx: AudioContext;
  private canvas?: HTMLCanvasElement;
  private canvasCtx?: CanvasRenderingContext2D;
  private sourceNode?: MediaElementAudioSourceNode;
  private audioElement?: HTMLAudioElement;
  private gainNode: GainNode;
  private analyserNode: AnalyserNode;
  private audioState: "suspended" | "running" | "closed" = "suspended";
  private fftSize: number = 1024; // 修正命名
  private smmothedData?: Float32Array;
  private smmothingFactor: number = 0.6; // 平滑因子，范围 [0, 1]，值越小越平滑
  private preloadTable: Record<string, HTMLAudioElement> = {}; // URL -> HTMLAudioElement

  private stateChangeCallback?: (state: string) => void;
  private endedCallback?: () => void;
  private timeUpdateCallback = (ev: Event) => {
    const audio = ev.target as HTMLAudioElement;
    console.log(
      `[TIME UPDATE] currentTime: ${audio.currentTime.toFixed(2)}s, duration: ${audio.duration.toFixed(2)}s`,
    );
  };

  // 动画相关
  private animationFrameId: number | null = null;
  private isDrawing = false; // 防止多次启动动画

  constructor() {
    // AudioContext 可以在构造函数中创建，但要注意浏览器自动播放策略
    this.audioCtx = new AudioContext();
    // 初始状态可能为 suspended，除非用户手势已发生
    this.audioState = this.audioCtx.state as "suspended" | "running" | "closed";
    // 更合适的是从上下文获取状态
    this.audioState =
      this.audioCtx.state === "running" ? "running" : "suspended";

    this.gainNode = this.audioCtx.createGain();
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = this.fftSize; // 应用初始值

    this.analyserNode.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);
  }

  initCanvas(canvas: HTMLCanvasElement, parent: HTMLElement) {
    if (this.canvas === canvas) return; // 已初始化同一 canvas，无需重复设置
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }
    this.canvasCtx = ctx;

    // 设置 CSS 尺寸填满父容器
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    // 初始化画布实际像素尺寸
    this.resizeCanvasToDisplaySize();

    const resizeObserver = new ResizeObserver(() => {
      this.resizeCanvasToDisplaySize();
    });
    resizeObserver.observe(parent);

    // 开始动画循环
    this.startDrawing();
  }

  /**
   * 调整 canvas 的缓冲区尺寸以匹配 CSS 显示尺寸，考虑设备像素比
   */
  private resizeCanvasToDisplaySize() {
    if (!this.canvas) return;
    const canvas = this.canvas;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    const needResize =
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr);
    if (needResize) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
  }

  /**
   * 启动动画循环（如果尚未启动）
   */
  private startDrawing() {
    if (this.isDrawing || !this.canvas || !this.canvasCtx) return;
    this.isDrawing = true;
    const drawLoop = () => {
      if (!this.isDrawing) return; // 停止绘制
      this.drawCanvas();
      this.animationFrameId = requestAnimationFrame(drawLoop);
    };
    drawLoop();
  }

  /**
   * 停止动画循环
   */
  private stopDrawing() {
    this.isDrawing = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private normalize(
    value: number,
    min: number = -150,
    max: number = 0,
  ): number {
    if (max === min) return 0; // 避免除以零
    return (Math.min(max, Math.max(min, value)) - min) / (max - min);
  }

  drawCanvas() {
    if (!this.analyserNode || !this.canvasCtx || !this.canvas) return;
    const ctx = this.canvasCtx;
    const canvas = this.canvas;
    const width = canvas.width;
    const height = canvas.height;

    const bufferLength = this.analyserNode.frequencyBinCount;

    const data = new Float32Array(bufferLength);
    this.analyserNode.getFloatFrequencyData(data);

    for (let i = 0; i < bufferLength; i++) {
      // data[i] = Math.pow(10, data[i] / 20);
      data[i] = this.normalize(data[i]);
    }
    // console.debug("Logged dB values:", data.subarray(0, 10)); // 仅打印前10个值
    for (let i = 0; i < bufferLength; i++) {
      if (!isFinite(data[i])) {
        console.warn(`Non-finite value at index ${i}: ${data[i]}.`);
      } else if (data[i] < 0) {
        console.warn(`Negative value at index ${i}: ${data[i]}.`);
      }
    }

    if (!this.smmothedData || this.smmothedData.length !== bufferLength) {
      this.smmothedData = new Float32Array(data.buffer, 0, bufferLength);
    } else {
      for (let i = 0; i < bufferLength; i++) {
        this.smmothedData[i] =
          this.smmothingFactor * data[i] +
          (1 - this.smmothingFactor) * this.smmothedData[i];
      }
    }
    // console.debug("Smoothed dB values:", this.smmothedData);

    // 清空画布（使用半透明背景可产生拖尾效果，这里用白色）
    ctx.fillStyle = getCssVariable("--color-base-100");
    ctx.fillRect(0, 0, width, height);

    // 计算柱子宽度，留出间距
    const barCount = bufferLength;
    const gap = 0; // 柱子间隙（像素）
    const barWidth = (width - gap * (barCount - 1)) / barCount; // 动态计算每个柱子宽度
    if (barWidth <= 0) return;

    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      // 将 0-255 映射到 0-1 并乘以高度
      const barHeight = this.smmothedData[i] * height;

      ctx.fillStyle = `color-mix(in lch, ${getCssVariable("--color-primary")} 20%, ${getCssVariable("--color-base-100")})`;
      // console.log(`Drawing bar ${i}: height=${barHeight.toFixed(2)}, color=${ctx.fillStyle}`);
      // ctx.fillStyle = `hsl(${(i / bufferLength) * 360}, 100%, 50%)`; // 彩虹色
      // 绘制柱子（x 为当前起始位置）
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + gap;
    }
  }

  /**
   * 确保音频上下文处于运行状态（需用户手势触发）
   */
  async initAudioContext() {
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
      this.audioState = "running";
      this.stateChangeCallback?.(this.audioState);
    }
  }

  async preload(url: string): Promise<void> {
    if (this.preloadTable[url]) {
      return;
    }
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.src = url;
    audio.loop = false;
    this.preloadTable[url] = audio;
    // 只要开始预加载就直接用这个开始加载的，无论是不是可以用
    // 避免重复创建元素和请求
    audio.oncanplaythrough = () => {
      console.log(`Preloaded audio for URL: ${url}`);
    };
  }

  /**
   * 播放网络音频流（通过 <audio> 元素）
   */
  async playUrlAsStream(
    url: string,
    playByDefault: boolean = false,
  ): Promise<void> {
    // 1. 完全停止并丢弃旧的音频元素和源节点
    this.cleanupCurrentSource();

    let audio;

    if (this.preloadTable[url]) {
      console.log(`Using preloaded audio for URL: ${url}`);
      audio = this.preloadTable[url];
      // 确保音频元素属性正确
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      audio.loop = false;
      audio.currentTime = 0;
    } else {
      console.log(
        `No preloaded audio found for URL: ${url}, creating new audio element.`,
      );

      // 2. 创建全新的 audio 元素
      audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      audio.src = url;
      audio.loop = false;
      // 存储预加载引用供下次使用
      this.preloadTable[url] = audio;
    }

    audio.ontimeupdate = this.timeUpdateCallback;
    // 3. 创建新的源节点
    try {
      this.sourceNode = this.audioCtx.createMediaElementSource(audio);
    } catch (e) {
      console.error("创建源节点失败，这不应该发生，因为 audio 是全新的", e);
      throw e;
    }

    // 4. 连接节点
    this.sourceNode.connect(this.analyserNode);

    // 5. 保存 audio 元素引用，便于之后暂停/清理
    this.audioElement = audio;

    // 6. 确保 AudioContext 已启动
    await this.audioCtx.resume();

    if (playByDefault) {
      // 7. 播放
      try {
        await audio.play();
        this.audioState = "running";
        this.stateChangeCallback?.(this.audioState);
      } catch (err) {
        console.error("播放失败", err);
        this.audioState = "closed";
        this.stateChangeCallback?.(this.audioState);
        throw err;
      }
    } else {
      this.audioState = "suspended";
      this.stateChangeCallback?.(this.audioState);
    }

    // 8. 监听结束事件
    audio.onended = () => {
      this.audioState = "closed";
      this.stateChangeCallback?.(this.audioState);
      this.endedCallback?.();
    };
  }

  set progress(value: number) {
    if (this.audioElement) {
      this.audioElement.currentTime =
        (value * this.audioElement.duration) / 100;
    }
  }

  set progressMs(value: number) {
    if (this.audioElement) {
      this.audioElement.currentTime = Math.max(0, value) / 1000;
    }
  }

  get currentTimeMs() {
    if (!this.audioElement) {
      return 0;
    }
    return Math.max(0, Math.floor(this.audioElement.currentTime * 1000));
  }

  get durationMs() {
    if (!this.audioElement || !isFinite(this.audioElement.duration)) {
      return 0;
    }
    return Math.max(0, Math.floor(this.audioElement.duration * 1000));
  }

  /**
   * 停止当前音频源并清理相关资源
   */
  private cleanupCurrentSource() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.onended = null;
      this.audioElement.src = ""; // 可选，有助于释放资源
      this.audioElement.load(); // 重置元素
      // 注意：不要将 this.audioElement 设为 null，因为之后我们要重新赋值
      // 但我们要断开源节点
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = undefined;
    }
  }

  async pause() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioState = "suspended";
      this.stateChangeCallback?.(this.audioState);
    }
  }

  async resume() {
    if (this.audioElement) {
      // 确保AudioContext处于运行状态
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }
      try {
        await this.audioElement.play();
        this.audioState = "running";
        this.stateChangeCallback?.(this.audioState);
      } catch (err) {
        console.error("播放失败", err);
        // 尝试恢复AudioContext后重试一次
        if (this.audioCtx.state !== "running") {
          await this.audioCtx.resume();
          try {
            await this.audioElement.play();
            this.audioState = "running";
            this.stateChangeCallback?.(this.audioState);
          } catch (retryErr) {
            console.error("重试播放失败", retryErr);
            this.audioState = "closed";
            this.stateChangeCallback?.(this.audioState);
            throw retryErr;
          }
        } else {
          this.audioState = "closed";
          this.stateChangeCallback?.(this.audioState);
          throw err;
        }
      }
    }
  }

  async togglePlay() {
    if (this.audioElement) {
      if (this.audioState === "running") {
        await this.pause();
      } else {
        await this.resume();
      }
    } else {
      console.warn("No audio element to toggle");
    }
  }

  get state() {
    return this.audioState;
  }

  get volume() {
    return Math.log2(this.gainNode.gain.value + 1) * 100;
  }
  set volume(value: number) {
    this.gainNode.gain.value = Math.pow(2, value / 100) - 1;
  }

  /**
   * 设置 FFT 大小（必须是 2 的幂，范围 32-32768）
   */
  set setFftSize(size: number) {
    // 验证输入
    const validSizes = [
      32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768,
    ];
    if (!validSizes.includes(size)) {
      console.warn(
        `FFT size ${size} is not a power of two between 32 and 32768. Keeping previous size ${this.fftSize}.`,
      );
      return;
    }
    this.fftSize = size;
    this.analyserNode.fftSize = size;
  }

  set onStateChange(callback: (state: string) => void) {
    this.stateChangeCallback = callback;
  }

  set onTimeUpdate(callback: (ev: Event) => void) {
    this.timeUpdateCallback = callback;
  }

  set onEnded(callback: () => void) {
    this.endedCallback = callback;
  }

  /**
   * 清理所有资源（组件销毁时调用）
   */
  cleanup() {
    this.stopDrawing();
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = ""; // 释放资源
      this.audioElement.load(); // 重置
      this.audioElement.onended = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = undefined;
    }
    // 关闭音频上下文（可选，但可能影响后续使用）
    // this.audioCtx.close();
  }
}

export { audioPlayer };
