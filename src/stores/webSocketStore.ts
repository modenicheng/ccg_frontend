import { create } from "zustand";
import type { WebSocketState } from "../types/store";
import type { WS } from "../wsClient";

const useWebSocketStore = create<WebSocketState>((set, get) => ({
  isConnected: false,
  connState: "disconnected",
  latency: null,
  latencyAvg: null,
  latencyHistory: [],
  maxHistorySize: 16,
  connectionQuality: "unknown",
  url: null,
  roomId: null,
  error: null,
  clockOffset: null,
  clockOffsetHistory: [],
  clockOffsetAvg: null,
  wsClient: undefined,

  setConnected: (connected) => set({ isConnected: connected }),
  setConnState: (state) => set({ connState: state }),

  updateClockOffset: (offset) => {
    const { clockOffsetHistory, maxHistorySize } = get();
    const newHistory = [...clockOffsetHistory, offset].slice(-maxHistorySize);
    set({
      clockOffset: offset,
      clockOffsetHistory: newHistory,
      clockOffsetAvg: newHistory.reduce((a, b) => a + b, 0) / newHistory.length,
    });
  },

  updateLatency: (latency) => {
    const { latencyHistory, maxHistorySize } = get();
    const newHistory = [...latencyHistory, latency].slice(-maxHistorySize);

    // 计算连接质量
    let quality: "good" | "fair" | "poor" | "unknown" = "unknown";
    if (latency < 40) quality = "good";
    else if (latency < 100) quality = "fair";
    else quality = "poor";

    set({
      latency,
      latencyAvg: newHistory.reduce((a, b) => a + b, 0) / newHistory.length,
      latencyHistory: newHistory,
      connectionQuality: quality,
    });
  },

  setUrl: (url) => set({ url }),
  setRoomId: (roomId) => set({ roomId }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
  reset: () =>
    set({
      isConnected: false,
      latency: null,
      latencyHistory: [],
      connectionQuality: "unknown",
      url: null,
      roomId: null,
      error: null,
      clockOffset: null,
      clockOffsetHistory: [],
      wsClient: undefined,
    }),

  setWsClient: (wsClient: WS | undefined) => set({ wsClient }),

  getAverageLatency: () => {
    const { latencyHistory } = get();
    if (latencyHistory.length === 0) return null;
    const sum = latencyHistory.reduce((a, b) => a + b, 0);
    return sum / latencyHistory.length;
  },

  getLatencyTrend: () => {
    const { latencyHistory } = get();
    if (latencyHistory.length < 3) return "stable";

    const recent = latencyHistory.slice(-3);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / 3;
    const previous = latencyHistory.slice(-6, -3);

    if (previous.length < 3) return "stable";
    const avgPrevious = previous.reduce((a, b) => a + b, 0) / 3;

    if (avgRecent < avgPrevious * 0.9) return "improving";
    if (avgRecent > avgPrevious * 1.1) return "deteriorating";
    return "stable";
  },

  getAverageClockOffset: () => {
    const { clockOffsetHistory } = get();
    if (clockOffsetHistory.length === 0) return null;
    const sum = clockOffsetHistory.reduce((a, b) => a + b, 0);
    return sum / clockOffsetHistory.length;
  },

  /**
   * 获取校准后的当前时间戳（毫秒）
   * calibrated_now = Date.now() + average_clockOffset
   */
  getCalibratedNow: () => {
    const { clockOffsetHistory } = get();
    if (clockOffsetHistory.length === 0) return Date.now();
    const avgOffset = Math.round(
      clockOffsetHistory.reduce((a, b) => a + b, 0) / clockOffsetHistory.length,
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
      clockOffsetHistory.reduce((a, b) => a + b, 0) / clockOffsetHistory.length,
    );
    return timestamp + avgOffset;
  },
}));

export default useWebSocketStore;
