import { create } from 'zustand';

interface WebSocketState {
  // 连接状态
  isConnected: boolean;
  // 当前延迟（毫秒）
  latency: number | null;
  // 延迟历史记录
  latencyHistory: number[];
  // 最大历史记录数
  maxHistorySize: number;
  // 连接质量
  connectionQuality: 'good' | 'fair' | 'poor' | 'unknown';
  // 连接URL
  url: string | null;
  // 错误信息
  error: string | null;
  // 客户端时间偏移（毫秒）
  clockOffset: number | null;
  // 时间偏移历史记录
  clockOffsetHistory: number[];

  // Actions
  setConnected: (connected: boolean) => void;
  updateLatency: (latency: number) => void;
  updateClockOffset: (offset: number) => void;
  setUrl: (url: string) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
  getAverageLatency: () => number | null;
  getLatencyTrend: () => 'improving' | 'stable' | 'deteriorating';
  getAverageClockOffset: () => number | null;
  getCalibratedNow: () => number;
  calibrateTimestamp: (timestamp: number) => number;
}

const useWebSocketStore = create<WebSocketState>((set, get) => ({
  isConnected: false,
  latency: null,
  latencyHistory: [],
  maxHistorySize: 100,
  connectionQuality: 'unknown',
  url: null,
  error: null,
  clockOffset: null,
  clockOffsetHistory: [],

  setConnected: (connected) => set({ isConnected: connected }),

  updateClockOffset: (offset) => {
    const { clockOffsetHistory, maxHistorySize } = get();
    const newHistory = [...clockOffsetHistory, offset].slice(-maxHistorySize);
    set({
      clockOffset: offset,
      clockOffsetHistory: newHistory
    });
  },

  updateLatency: (latency) => {
    const { latencyHistory, maxHistorySize } = get();
    const newHistory = [...latencyHistory, latency].slice(-maxHistorySize);

    // 计算连接质量
    let quality: 'good' | 'fair' | 'poor' | 'unknown' = 'unknown';
    if (latency < 100) quality = 'good';
    else if (latency < 300) quality = 'fair';
    else quality = 'poor';

    set({
      latency,
      latencyHistory: newHistory,
      connectionQuality: quality
    });
  },

  setUrl: (url) => set({ url }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
  reset: () => set({
    isConnected: false,
    latency: null,
    latencyHistory: [],
    connectionQuality: 'unknown',
    error: null,
    clockOffset: null,
    clockOffsetHistory: []
  }),

  getAverageLatency: () => {
    const { latencyHistory } = get();
    if (latencyHistory.length === 0) return null;
    const sum = latencyHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / latencyHistory.length);
  },

  getLatencyTrend: () => {
    const { latencyHistory } = get();
    if (latencyHistory.length < 3) return 'stable';

    const recent = latencyHistory.slice(-3);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / 3;
    const previous = latencyHistory.slice(-6, -3);

    if (previous.length < 3) return 'stable';
    const avgPrevious = previous.reduce((a, b) => a + b, 0) / 3;

    if (avgRecent < avgPrevious * 0.9) return 'improving';
    if (avgRecent > avgPrevious * 1.1) return 'deteriorating';
    return 'stable';
  },

  getAverageClockOffset: () => {
    const { clockOffsetHistory } = get();
    if (clockOffsetHistory.length === 0) return null;
    const sum = clockOffsetHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / clockOffsetHistory.length);
  },

  /**
   * 获取校准后的当前时间戳（毫秒）
   * calibrated_now = Date.now() + average_clockOffset
   */
  getCalibratedNow: () => {
    const { clockOffsetHistory } = get();
    if (clockOffsetHistory.length === 0) return Date.now();
    const avgOffset = Math.round(
      clockOffsetHistory.reduce((a, b) => a + b, 0) / clockOffsetHistory.length
    );
    return Date.now() + avgOffset;
  },

  /**
   * 校准任意时间戳
   * calibrated_timestamp = timestamp + average_clockOffset
   */
  calibrateTimestamp: (timestamp: number) => {
    const { clockOffsetHistory } = get();
    if (clockOffsetHistory.length === 0) return timestamp;
    const avgOffset = Math.round(
      clockOffsetHistory.reduce((a, b) => a + b, 0) / clockOffsetHistory.length
    );
    return timestamp + avgOffset;
  }
}));

export default useWebSocketStore;