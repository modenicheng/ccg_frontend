export interface AudioState {
  volume: number;
  isPlaying: boolean;
}

export interface AudioMeta {
  albumId: number;
  albumName: string;
  artistId: number;
  artistName: string;
  duration: number;
  title: string;
  tags?: string[];
  coverUrl?: string;
  audioUrl?: string;
}

export interface UserState {
  id: number;
  username: string;
  suffix: string;
  token: string;
  isOwner: boolean;
}

export interface GameState {
  audio: AudioState;
  audioMeta?: AudioMeta;
  nextAudioMeta?: AudioMeta;
  ws?: import("../wsClient").WS;
  user: UserState;
  audioManager?: unknown;

  setWS: (ws: import("../wsClient").WS) => void;
}

export interface PersistState {
  theme: string;
  volume: number;
  setTheme: (theme: string) => void;
  setVolume: (volume: number) => void;
}

export interface WebSocketState {
  isConnected: boolean;
  connState: "connecting" | "connected" | "disconnected";
  latency: number | null;
  latencyAvg: number | null;
  latencyHistory: number[];
  maxHistorySize: number;
  connectionQuality: "good" | "fair" | "poor" | "unknown";
  url: string | null;
  roomId: string | null;
  error: string | null;
  clockOffset: number | null;
  clockOffsetHistory: number[];
  clockOffsetAvg: number | null;

  setConnected: (connected: boolean) => void;
  setConnState: (state: "connecting" | "connected" | "disconnected") => void;
  updateLatency: (latency: number) => void;
  updateClockOffset: (offset: number) => void;
  setUrl: (url: string) => void;
  setRoomId: (roomId: string | null) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
  getAverageLatency: () => number | null;
  getLatencyTrend: () => "improving" | "stable" | "deteriorating";
  getAverageClockOffset: () => number | null;
  getCalibratedNow: () => number;
  calibrateTimestamp: (timestamp: number) => number;
}
