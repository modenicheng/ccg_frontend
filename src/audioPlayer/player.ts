import { getCssVariable } from "../utils/color";

interface FrequencyBandRange {
  startBin: number;
  endBin: number;
  centerFrequency: number;
  lowerFrequency: number;
  upperFrequency: number;
}

interface FrequencyCurvePoint {
  x: number;
  y: number;
  sampleCount?: number;
}

const MAX_PRELOAD_ENTRIES = 3;

class audioPlayer {
  private audioCtx: AudioContext;
  private canvas?: HTMLCanvasElement;
  private canvasCtx?: CanvasRenderingContext2D;
  private sourceNode?: MediaElementAudioSourceNode;
  private audioElement?: HTMLAudioElement;
  private gainNode: GainNode;
  private analyserNode: AnalyserNode;
  private audioState: "suspended" | "running" | "closed" = "suspended";
  private fftSize: number = 8192; // 修正命名
  private frequencyBandCount: number = 4096;
  private minFrequencyHz: number = 20;
  private lowFrequencyStretchExponent: number = 1;
  private maxCurveSampleWindowSize: number = 16;
  private minCurveSampleWindowSize: number = 1;
  private highFrequencyMinPixelGap: number = 0.35;
  private smmothedData?: Float32Array;
  private smmothingFactor: number = 0.6; // 平滑因子，范围 [0, 1]，值越小越平滑
  private preloadTable: Record<string, { audio: HTMLAudioElement; loaded: boolean; error?: Error; retryCount: number }> = {};
  private loopEnabled: boolean = false;
  private frequencyBands: FrequencyBandRange[] = [];
  private frequencyBandsCacheKey = "";

  private stateChangeCallback?: (state: string) => void;
  private endedCallback?: () => void;
  private playbackErrorCallback?: (error: Error) => void; // 新增：播放错误回调
  private timeUpdateCallback = (ev: Event) => {
    const audio = ev.target as HTMLAudioElement;
    console.log(
      `[TIME UPDATE] currentTime: ${audio.currentTime.toFixed(2)}s, duration: ${audio.duration.toFixed(2)}s`,
    );
  };

  // 调度停止相关
  private pendingStopMs: number | null = null;
  private pendingStopListener: (() => void) | null = null;

  // 动画相关
  private animationFrameId: number | null = null;
  private isDrawing = false; // 防止多次启动动画

  private notifyAutoplayBlocked(error: unknown, context: string): void {
    const maybeError = error as { name?: unknown; message?: unknown } | null;
    const errorName = typeof maybeError?.name === "string" ? maybeError.name : "";
    if (errorName !== "NotAllowedError") {
      return;
    }

    const message =
      typeof maybeError?.message === "string" && maybeError.message.trim().length > 0
        ? maybeError.message
        : "The AudioContext was not allowed to start. It must be resumed after a user gesture.";

    const normalizedError = new Error(message);
    normalizedError.name = "NotAllowedError";

    console.warn(`[AUDIO_CONTEXT] ${context} blocked by browser, requires user gesture`);
    this.playbackErrorCallback?.(normalizedError);
  }

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

  /**
   * 确保 AudioContext 处于运行状态（在用户交互后调用）
   */
  async ensureRunning(): Promise<void> {
    if (this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
        this.audioState = "running";
        console.log("[AUDIO_CONTEXT] AudioContext resumed successfully");
      } catch (err) {
        this.notifyAutoplayBlocked(err, "ensureRunning");
        console.error("[AUDIO_CONTEXT] Failed to resume AudioContext:", err);
        throw err;
      }
    }
  }

  /**
   * 设置播放错误回调（用于检测浏览器拦截）
   */
  setPlaybackErrorCallback(callback: (error: Error) => void): void {
    this.playbackErrorCallback = callback;
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

  private getBinFrequency(binIndex: number): number {
    return (binIndex * this.audioCtx.sampleRate) / this.analyserNode.fftSize;
  }

  private getFrequencyBands(bufferLength: number): FrequencyBandRange[] {
    const bandCount = Math.max(
      1,
      Math.min(this.frequencyBandCount, bufferLength),
    );
    const cacheKey = [
      this.audioCtx.sampleRate,
      this.analyserNode.fftSize,
      bufferLength,
      bandCount,
      this.minFrequencyHz,
    ].join(":");

    if (this.frequencyBandsCacheKey === cacheKey) {
      return this.frequencyBands;
    }

    const firstUsableFrequency = Math.max(
      this.minFrequencyHz,
      this.getBinFrequency(1),
    );
    const maxFrequency = this.audioCtx.sampleRate / 2;
    const minLog = Math.log10(firstUsableFrequency);
    const maxLog = Math.log10(maxFrequency);

    this.frequencyBands = Array.from({ length: bandCount }, (_, index) => {
      const startRatio = index / bandCount;
      const endRatio = (index + 1) / bandCount;
      const lowerFrequency = Math.pow(
        10,
        minLog + (maxLog - minLog) * startRatio,
      );
      const upperFrequency = Math.pow(
        10,
        minLog + (maxLog - minLog) * endRatio,
      );
      const centerFrequency = Math.sqrt(lowerFrequency * upperFrequency);

      let startBin = Math.max(
        1,
        Math.ceil(
          (lowerFrequency * this.analyserNode.fftSize) / this.audioCtx.sampleRate,
        ),
      );
      let endBin = Math.min(
        bufferLength - 1,
        Math.floor(
          (upperFrequency * this.analyserNode.fftSize) / this.audioCtx.sampleRate,
        ),
      );

      if (endBin < startBin) {
        const nearestBin = Math.min(
          bufferLength - 1,
          Math.max(
            1,
            Math.round(
              (centerFrequency * this.analyserNode.fftSize) /
                this.audioCtx.sampleRate,
            ),
          ),
        );
        startBin = nearestBin;
        endBin = nearestBin;
      }

      return {
        startBin,
        endBin,
        centerFrequency,
        lowerFrequency,
        upperFrequency,
      };
    });
    this.frequencyBandsCacheKey = cacheKey;

    return this.frequencyBands;
  }

  private aggregateFrequencyBands(frequencyData: Float32Array): Float32Array {
    const bands = this.getFrequencyBands(frequencyData.length);
    const aggregatedData = new Float32Array(bands.length);

    for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
      const band = bands[bandIndex];
      let totalPower = 0;

      for (let binIndex = band.startBin; binIndex <= band.endBin; binIndex++) {
        const dbValue = frequencyData[binIndex];
        if (!isFinite(dbValue)) {
          continue;
        }
        totalPower += Math.pow(10, dbValue / 10);
      }

      const bandDb = 10 * Math.log10(Math.max(totalPower, Number.EPSILON));
      aggregatedData[bandIndex] = this.normalize(bandDb, -120, 20);
    }

    return aggregatedData;
  }

  private getDynamicCurveSampleWindowSize(
    frequency: number,
    minFrequency: number,
    maxFrequency: number,
  ): number {
    const safeFrequency = Math.max(minFrequency, frequency);
    const safeMaxFrequency = Math.max(minFrequency + Number.EPSILON, maxFrequency);
    const minLog = Math.log10(minFrequency);
    const maxLog = Math.log10(safeMaxFrequency);
    const normalizedFrequency =
      maxLog === minLog
        ? 0
        : (Math.log10(safeFrequency) - minLog) / (maxLog - minLog);
    const clampedRatio = Math.min(1, Math.max(0, normalizedFrequency));
    const dynamicWindowSize =
      this.maxCurveSampleWindowSize *
      Math.pow(
        this.minCurveSampleWindowSize / this.maxCurveSampleWindowSize,
        clampedRatio,
      );

    return Math.max(
      this.minCurveSampleWindowSize,
      Math.min(this.maxCurveSampleWindowSize, Math.round(dynamicWindowSize)),
    );
  }

  private getFrequencyCurvePoints(
    width: number,
    height: number,
    bands: FrequencyBandRange[],
    values: Float32Array,
  ): FrequencyCurvePoint[] {
    if (bands.length === 0 || values.length === 0) {
      return [];
    }

    const minCenterFrequency = Math.max(this.minFrequencyHz, bands[0].centerFrequency);
    const maxCenterFrequency = Math.max(
      minCenterFrequency + Number.EPSILON,
      bands[bands.length - 1].centerFrequency,
    );
    const minLog = Math.log10(minCenterFrequency);
    const maxLog = Math.log10(maxCenterFrequency);
    const topPadding = height * 0.08;
    const bottomPadding = height * 0.04;
    const drawableHeight = Math.max(1, height - topPadding - bottomPadding);

    const mapFrequencyToCanvasX = (frequency: number) => {
      const normalizedLogX =
        maxLog === minLog
          ? 0
          : (Math.log10(Math.max(frequency, minCenterFrequency)) - minLog) /
            (maxLog - minLog);
      const stretchedX = Math.pow(
        Math.min(1, Math.max(0, normalizedLogX)),
        this.lowFrequencyStretchExponent,
      );
      return stretchedX * width;
    };

    const groupedPoints: FrequencyCurvePoint[] = [];
    let bandIndex = 0;

    while (bandIndex < bands.length) {
      const sampleWindowSize = this.getDynamicCurveSampleWindowSize(
        bands[bandIndex].centerFrequency,
        minCenterFrequency,
        maxCenterFrequency,
      );
      let totalSamples = 0;
      let totalX = 0;
      let totalY = 0;
      let sampledBands = 0;

      while (
        bandIndex < bands.length &&
        sampledBands < sampleWindowSize
      ) {
        const normalizedValue = Math.min(1, Math.max(0, values[bandIndex] ?? 0));
        const pointX = mapFrequencyToCanvasX(bands[bandIndex].centerFrequency);
        const pointY =
          height - bottomPadding - normalizedValue * drawableHeight;

        totalX += pointX;
        totalY += pointY;
        totalSamples += 1;
        sampledBands += 1;
        bandIndex += 1;
      }

      groupedPoints.push({
        x: totalX / Math.max(1, totalSamples),
        y: totalY / Math.max(1, totalSamples),
        sampleCount: totalSamples,
      });
    }

    const mergedPoints: FrequencyCurvePoint[] = [];
    for (const point of groupedPoints) {
      const lastPoint = mergedPoints[mergedPoints.length - 1];
      if (
        lastPoint &&
        Math.abs(point.x - lastPoint.x) < this.highFrequencyMinPixelGap
      ) {
        const totalSamples =
          (lastPoint.sampleCount ?? 1) + (point.sampleCount ?? 1);
        lastPoint.x =
          (lastPoint.x * (lastPoint.sampleCount ?? 1) +
            point.x * (point.sampleCount ?? 1)) /
          totalSamples;
        lastPoint.y =
          (lastPoint.y * (lastPoint.sampleCount ?? 1) +
            point.y * (point.sampleCount ?? 1)) /
          totalSamples;
        lastPoint.sampleCount = totalSamples;
      } else {
        mergedPoints.push({ ...point });
      }
    }

    const smoothedPoints = mergedPoints.map((point, index, points) => {
      const previousPoint = points[Math.max(0, index - 2)];
      const previousNearPoint = points[Math.max(0, index - 1)];
      const nextNearPoint = points[Math.min(points.length - 1, index + 1)];
      const nextPoint = points[Math.min(points.length - 1, index + 2)];

      const smoothedY =
        (previousPoint.y +
          previousNearPoint.y * 2 +
          point.y * 3 +
          nextNearPoint.y * 2 +
          nextPoint.y) /
        9;

      return {
        x: point.x,
        y: smoothedY,
      };
    });

    if (smoothedPoints.length === 0) {
      return smoothedPoints;
    }

    const anchoredPoints = [...smoothedPoints];
    if (anchoredPoints[0].x > 0) {
      anchoredPoints.unshift({
        x: 0,
        y: anchoredPoints[0].y,
      });
    } else {
      anchoredPoints[0] = {
        x: 0,
        y: anchoredPoints[0].y,
      };
    }

    return anchoredPoints;
  }

  private traceBezierCurve(
    ctx: CanvasRenderingContext2D,
    points: FrequencyCurvePoint[],
  ) {
    if (points.length === 0) {
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 1) {
      return;
    }

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      return;
    }

    for (let i = 1; i < points.length - 1; i++) {
      const currentPoint = points[i];
      const nextPoint = points[i + 1];
      const midpointX = (currentPoint.x + nextPoint.x) / 2;
      const midpointY = (currentPoint.y + nextPoint.y) / 2;

      ctx.quadraticCurveTo(
        currentPoint.x,
        currentPoint.y,
        midpointX,
        midpointY,
      );
    }

    const penultimatePoint = points[points.length - 2];
    const lastPoint = points[points.length - 1];
    ctx.quadraticCurveTo(
      penultimatePoint.x,
      penultimatePoint.y,
      lastPoint.x,
      lastPoint.y,
    );
  }

  private drawFrequencyCurve(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    bands: FrequencyBandRange[],
    values: Float32Array,
  ) {
    const points = this.getFrequencyCurvePoints(width, height, bands, values);
    if (points.length === 0) {
      return;
    }

    const primaryColor = getCssVariable("--color-primary");
    // const baseColor = getCssVariable("--color-base-100");
    const baselineY = height;

    this.traceBezierCurve(ctx, points);
    ctx.lineWidth = Math.max(2, width * 0.001);
    ctx.strokeStyle = `color-mix(in lch, ${primaryColor} 45%, transparent)`;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(
      0.3,
      `color-mix(in oklch, ${primaryColor} 40%, transparent)`,
    );
    gradient.addColorStop(1, "transparent");

    this.traceBezierCurve(ctx, points);
    ctx.lineTo(points[points.length - 1].x, baselineY);
    ctx.lineTo(points[0].x, baselineY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
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

    const aggregatedData = this.aggregateFrequencyBands(data);
    const bands = this.getFrequencyBands(bufferLength);

    for (let i = 0; i < aggregatedData.length; i++) {
      if (!isFinite(aggregatedData[i])) {
        console.warn(`Non-finite value at index ${i}: ${aggregatedData[i]}.`);
      } else if (aggregatedData[i] < 0) {
        console.warn(`Negative value at index ${i}: ${aggregatedData[i]}.`);
      }
    }

    if (
      !this.smmothedData ||
      this.smmothedData.length !== aggregatedData.length
    ) {
      this.smmothedData = new Float32Array(aggregatedData);
    } else {
      for (let i = 0; i < aggregatedData.length; i++) {
        this.smmothedData[i] =
          this.smmothingFactor * aggregatedData[i] +
          (1 - this.smmothingFactor) * this.smmothedData[i];
      }
    }
    // console.debug("Smoothed dB values:", this.smmothedData);

    // 清空画布（使用半透明背景可产生拖尾效果，这里用白色）
    ctx.fillStyle = getCssVariable("--color-base-100");
    ctx.fillRect(0, 0, width, height);

    this.drawFrequencyCurve(ctx, width, height, bands, this.smmothedData);
  }

  /**
   * 确保音频上下文处于运行状态（需用户手势触发）
   */
  async initAudioContext() {
    if (this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
        this.audioState = "running";
        this.stateChangeCallback?.(this.audioState);
      } catch (err) {
        this.notifyAutoplayBlocked(err, "initAudioContext");
        throw err;
      }
    }
  }

  private evictStalePreloadEntries(): void {
    const keys = Object.keys(this.preloadTable);
    if (keys.length < MAX_PRELOAD_ENTRIES) {
      return;
    }

    const taintedAudio = this.audioElement;
    const removable: string[] = [];

    for (const key of keys) {
      const entry = this.preloadTable[key];
      if (entry.audio === taintedAudio) {
        continue;
      }
      removable.push(key);
    }

    const excessCount = keys.length - (MAX_PRELOAD_ENTRIES - 1);
    const toRemove = removable.slice(0, Math.max(0, excessCount));

    for (const key of toRemove) {
      const entry = this.preloadTable[key];
      entry.audio.pause();
      entry.audio.src = "";
      entry.audio.load();
      delete this.preloadTable[key];
      console.log(`[PRELOAD] Evicted stale preload entry: ${key}`);
    }
  }

  async preload(url: string): Promise<void> {
    if (this.preloadTable[url]) {
      const entry = this.preloadTable[url];
      if (entry.loaded) {
        if (entry.audio === this.audioElement) {
          // The loaded element is the currently connected (tainted) one.
          // Invalidate it so a fresh element is created below.
          console.log(`[PRELOAD] Loaded entry is tainted (currently connected), recreating for URL: ${url}`);
          delete this.preloadTable[url];
        } else {
          console.log(`[PRELOAD] Already loaded for URL: ${url}`);
          return; // 已加载成功
        }
      } else if (entry.error) {
        console.log(`[PRELOAD] Previous error found for URL: ${url}, clearing and retrying...`);
        // 清除错误，重试
        delete this.preloadTable[url];
      }
    }

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.src = url;
    audio.loop = this.loopEnabled;

    console.log(`[PRELOAD] Starting preload for URL: ${url}`);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        audio.pause();
        const err = new Error(`Preload timeout (15s) for URL: ${url}`);
        this.preloadTable[url] = { audio, loaded: false, error: err, retryCount: 0 };
        console.error(`[PRELOAD] Timeout for URL: ${url}`);
        reject(err);
      }, 15000); // 15 秒超时

      audio.oncanplaythrough = () => {
        clearTimeout(timeout);
        console.log(`[PRELOAD] Successfully preloaded audio: ${url}`);
        this.preloadTable[url] = { audio, loaded: true, error: undefined, retryCount: 0 };
        resolve();
      };

      audio.onerror = (e) => {
        clearTimeout(timeout);
        const err = new Error(`Failed to preload audio: ${url}`);
        this.preloadTable[url] = { audio, loaded: false, error: err, retryCount: 0 };
        console.error(`[PRELOAD] Error for URL: ${url}`, e);
        
        // 直接 reject，不重试
        // 让调用者决定是否重试（例如 tryPlayUrlWithRetry）
        reject(err);
      };

      // 存储预加载引用
      this.evictStalePreloadEntries();
      this.preloadTable[url] = { audio, loaded: false, error: undefined, retryCount: 0 };

      // 开始加载
      audio.load();
    });
  }

  /**
   * 检查指定 URL 的音频是否已预加载
   */
  isPreloaded(url: string): boolean {
    const entry = this.preloadTable[url];
    const isLoaded = entry?.loaded === true;
    console.log(`[PRELOAD] Check isPreloaded for URL: ${url}, result:`, isLoaded);
    return isLoaded;
  }

  /**
   * 检查是否已初始化 audioElement
   */
  hasAudioElement(): boolean {
    const hasElement = !!this.audioElement;
    console.log(`[PLAYER] Check hasAudioElement:`, hasElement);
    return hasElement;
  }

  /**
   * 获取当前音频 URL
   */
  getCurrentUrl(): string | null {
    const url = this.audioElement?.src || null;
    console.log(`[PLAYER] Check getCurrentUrl:`, url);
    return url;
  }

  /**
   * 播放网络音频流（通过 <audio> 元素）
   */
  async playUrlAsStream(
    url: string,
    playByDefault: boolean = false,
  ): Promise<void> {
    // 检查是否已预加载
    const preloadedEntry = this.preloadTable[url];
    if (preloadedEntry?.loaded) {
      console.log(`[PLAY_URL] Using preloaded audio for URL: ${url}`);
      return this.usePreloadedAudio(url, playByDefault);
    }
    
    console.log(
      `[PLAY_URL] No successfully preloaded audio found for URL: ${url}, creating new audio element.`,
    );

    // 1. 完全停止并丢弃旧的音频元素和源节点
    this.cleanupCurrentSource();

    // 2. 创建全新的 audio 元素
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.src = url;
    audio.loop = this.loopEnabled;
    // 存储预加载引用供下次使用
    this.preloadTable[url] = { audio, loaded: false, error: undefined, retryCount: 0 };

    await this.setupAudioElement(audio, url, playByDefault);
  }

  /**
   * 使用已预加载的音频
   */
  async usePreloadedAudio(
    url: string,
    playByDefault: boolean = false,
  ): Promise<void> {
    const preloadedEntry = this.preloadTable[url];
    if (!preloadedEntry?.loaded) {
      throw new Error(`Audio not preloaded for URL: ${url}`);
    }

    console.log(`[USE_PRELOADED] Switching to preloaded audio for URL: ${url}`);
    
    // 1. 完全停止并丢弃旧的音频元素和源节点
    this.cleanupCurrentSource();

    // 2. 使用预加载的 audio 元素
    const audio = preloadedEntry.audio;
    // 确保音频元素属性正确
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.loop = this.loopEnabled;
    audio.currentTime = 0;

    await this.setupAudioElement(audio, url, playByDefault);
  }

  /**
   * 设置音频元素（公共逻辑）
   */
  private async setupAudioElement(
    audio: HTMLAudioElement,
    _url: string,
    playByDefault: boolean,
  ): Promise<void> {
    audio.ontimeupdate = this.timeUpdateCallback;
    
    // 3. 创建新的源节点
    try {
      this.sourceNode = this.audioCtx.createMediaElementSource(audio);
    } catch (e) {
      console.error("[SETUP_AUDIO] Failed to create media element source:", e);
      throw e;
    }

    // 4. 连接节点
    this.sourceNode.connect(this.analyserNode);

    // 5. 保存 audio 元素引用，便于之后暂停/清理
    this.audioElement = audio;

    // 6. 确保 AudioContext 已启动
    try {
      await this.audioCtx.resume();
    } catch (err) {
      this.notifyAutoplayBlocked(err, "setupAudioElement.resume");
      throw err;
    }

    if (playByDefault) {
      // 7. 播放
      try {
        await audio.play();
        this.audioState = "running";
        this.stateChangeCallback?.(this.audioState);
      } catch (err) {
        console.error("播放失败", err);
        // 检测是否为用户手势限制导致的错误
        if (err instanceof Error && err.name === "NotAllowedError") {
          console.warn("[AUDIO_CONTEXT] Playback blocked by browser, requires user gesture");
          this.playbackErrorCallback?.(err as Error);
        }
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
    this.clearScheduledStop();
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.onended = null;
      this.audioElement.src = "";
      this.audioElement.load();
      // Remove the tainted element from the preload table so it won't be
      // reused later (it can never be passed to createMediaElementSource again).
      for (const key of Object.keys(this.preloadTable)) {
        if (this.preloadTable[key].audio === this.audioElement) {
          delete this.preloadTable[key];
          break;
        }
      }
      this.audioElement = undefined;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = undefined;
    }
  }

  async pause() {
    this.clearScheduledStop();
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioState = "suspended";
      this.stateChangeCallback?.(this.audioState);
    }
  }

  /**
   * 调度音频在到达指定进度（毫秒）时自动暂停。
   * 音频会继续播放，直到 currentTimeMs >= targetMs，然后自然暂停。
   */
  scheduleStopAt(targetMs: number): void {
    this.clearScheduledStop();
    this.pendingStopMs = targetMs;

    if (!this.audioElement) return;

    const listener = () => {
      if (this.pendingStopMs === null) return;
      if (this.currentTimeMs >= this.pendingStopMs) {
        this.pause();
      }
    };
    this.pendingStopListener = listener;
    this.audioElement.addEventListener("timeupdate", listener);
  }

  clearScheduledStop(): void {
    this.pendingStopMs = null;
    if (this.pendingStopListener && this.audioElement) {
      this.audioElement.removeEventListener("timeupdate", this.pendingStopListener);
    }
    this.pendingStopListener = null;
  }

  async resume() {
    this.clearScheduledStop();
    if (this.audioElement) {
      // 确保 AudioContext 处于运行状态
      if (this.audioCtx.state === "suspended") {
        try {
          await this.audioCtx.resume();
        } catch (err) {
          this.notifyAutoplayBlocked(err, "resume.context");
          throw err;
        }
      }
      try {
        await this.audioElement.play();
        this.audioState = "running";
        this.stateChangeCallback?.(this.audioState);
      } catch (err) {
        console.error("播放失败", err);
        this.notifyAutoplayBlocked(err, "resume.play");
        // 尝试恢复 AudioContext 后重试一次
        if (this.audioCtx.state !== "running") {
          try {
            await this.audioCtx.resume();
          } catch (resumeErr) {
            this.notifyAutoplayBlocked(resumeErr, "resume.retryContext");
            throw resumeErr;
          }
          try {
            await this.audioElement.play();
            this.audioState = "running";
            this.stateChangeCallback?.(this.audioState);
          } catch (retryErr) {
            console.error("重试播放失败", retryErr);
            this.notifyAutoplayBlocked(retryErr, "resume.retryPlay");
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

  async waitForCanPlayThrough(timeoutMs: number = 5000): Promise<boolean> {
    if (!this.audioElement) {
      return false;
    }

    const audio = this.audioElement;
    if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;

      const cleanup = () => {
        audio.removeEventListener("canplaythrough", onCanPlayThrough);
        audio.removeEventListener("error", onError);
        audio.removeEventListener("abort", onAbort);
      };

      const finalize = (result: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      };

      const onCanPlayThrough = () => {
        finalize(true);
      };

      const onError = () => {
        finalize(false);
      };

      const onAbort = () => {
        finalize(false);
      };

      audio.addEventListener("canplaythrough", onCanPlayThrough, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.addEventListener("abort", onAbort, { once: true });

      window.setTimeout(() => {
        finalize(audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA);
      }, timeoutMs);
    });
  }

  setLoop(enabled: boolean) {
    this.loopEnabled = enabled;
    if (this.audioElement) {
      this.audioElement.loop = enabled;
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
    this.frequencyBandsCacheKey = "";
    this.frequencyBands = [];
    this.smmothedData = undefined;
  }

  set setFrequencyBandCount(count: number) {
    const nextCount = Math.max(1, Math.floor(count));
    this.frequencyBandCount = nextCount;
    this.frequencyBandsCacheKey = "";
    this.frequencyBands = [];
    this.smmothedData = undefined;
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
      this.audioElement.src = "";
      this.audioElement.load();
      this.audioElement.onended = null;
      this.audioElement = undefined;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = undefined;
    }
    for (const key of Object.keys(this.preloadTable)) {
      const entry = this.preloadTable[key];
      entry.audio.pause();
      entry.audio.src = "";
      entry.audio.load();
      delete this.preloadTable[key];
    }
  }
}

export { audioPlayer };
