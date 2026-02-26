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
  roomId: string;
  username: string;
  token: string;
  isOwner: boolean;
}

export interface RoomState {
  roomId: string;
  hostPlayerId: string;
  status: "waiting" | "playing" | "ended";
  title: string | null;
  description: string | null;
  players: string[];
  songQueue: string[];
  tagGroups: Record<string, string[]>;
  playProgress: number;
  startPositionPercent: number;
}

export interface GameState {
  audio: AudioState;
  audioMeta?: AudioMeta;
  nextAudioMeta?: AudioMeta;
  ws?: import("../wsClient").WS;
  user: UserState;
  roomState?: RoomState;
  isHost: boolean;
  audioManager?: unknown;

  setWS: (ws: import("../wsClient").WS) => void;
  setRoomState: (roomState: RoomState) => void;
  setIsHost: (isHost: boolean) => void;
  refreshRoomState: () => Promise<void>;
}

export interface PersistState {
  theme: string;
  volume: number;
  users: UserState[];
  setTheme: (theme: string) => void;
  setVolume: (volume: number) => void;
  addUser: (user: UserState) => void;
  removeUser: (userId: number) => void;
  getRoomUser: (roomId: string) => UserState | undefined;
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
  wsClient: import("../wsClient").WS | undefined;

  setConnected: (connected: boolean) => void;
  setConnState: (state: "connecting" | "connected" | "disconnected") => void;
  updateLatency: (latency: number) => void;
  updateClockOffset: (offset: number) => void;
  setUrl: (url: string) => void;
  setRoomId: (roomId: string | null) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
  setWsClient: (wsClient: import("../wsClient").WS | undefined) => void;
  getAverageLatency: () => number | null;
  getLatencyTrend: () => "improving" | "stable" | "deteriorating";
  getAverageClockOffset: () => number | null;
  getCalibratedNow: () => number;
  calibrateTimestamp: (timestamp: number) => number;
}
