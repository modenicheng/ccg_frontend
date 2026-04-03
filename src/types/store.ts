// 从wsMessages导入类型以保持一致性
import type {
  WsTagGroup as RoomStateTagGroupItem,
  WsPlayer as RoomStatePlayerItem,
  WsTag,
  WsTagGroup,
  AnswerQueueItem,
  PlaybackState,
  RoundAnswerItem,
} from "./wsMessages";

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
  // 基础字段
  roomId: string;
  title: string | null;
  status: "waiting" | "playing" | "ended"; // 转换后的状态，对应后端的0,1,2
  statusCode: 0 | 1 | 2; // 原始状态码

  // 回合状态
  roundState: "PENDING" | "PLAYING_AUDIO" | "ANSWERING" | "JUDGING" | "COMPLETED";
  roundStateCode: 0 | 1 | 2 | 3 | 4; // 原始回合状态码
  show_answer: boolean;

  // 播放相关
  song_start_range_percent: number | null;

  // 玩家和队列
  players: RoomStatePlayerItem[]; // 完整的玩家对象
  answer_queue: AnswerQueueItem[];
  answer_queue_tail_player_id: number | null;
  round_scored: boolean;
  round_answers: RoundAnswerItem[];

  // 标签系统
  tag_groups: RoomStateTagGroupItem[];

  // 播放状态
  playback_status: PlaybackState | null;

  // 兼容性字段（为现有UI保留）
  description: string | null; // 向后兼容
  hostPlayerId: string; // 向后兼容，从players中推导
  playersSimple: string[]; // 简化版本，仅用户名数组
  tagGroupsSimple: Record<string, string[]>; // 简化版本，组名->标签名数组
  playProgress: number; // 向后兼容，从playback_status.progress_ms推导
  startPositionPercent: number; // 向后兼容，从song_start_range_percent推导
  songQueue: string[]; // 向后兼容，可能需要从其他数据推导
}

export interface PlayerScore {
  player_id: number;
  username: string;
  score: number;
}

export interface GameState {
  audio: AudioState;
  audioMeta?: AudioMeta;
  nextAudioMeta?: AudioMeta;
  ws?: import("../wsClient").WS;
  user: UserState;
  roomState?: RoomState;
  isHost: boolean;
  scores: PlayerScore[];
  audioManager?: unknown;
  roundState: "PENDING" | "PLAYING_AUDIO" | "ANSWERING" | "JUDGING" | "COMPLETED";
  roundStateCode: 0 | 1 | 2 | 3 | 4;

  // Tags state
  allTags: WsTag[];
  allTagGroups: WsTagGroup[];

  setWS: (ws: import("../wsClient").WS) => void;
  setRoomState: (roomState: RoomState) => void;
  setIsHost: (isHost: boolean) => void;
  setScores: (scores: PlayerScore[]) => void;
  setRoundState: (roundState: "PENDING" | "PLAYING_AUDIO" | "ANSWERING" | "JUDGING" | "COMPLETED", roundStateCode: 0 | 1 | 2 | 3 | 4) => void;
  refreshRoomState: () => Promise<void>;
  
  // Tags actions
  addTags: (tags: WsTag[]) => void;
  updateTags: (tags: WsTag[]) => void;
  removeTags: (tagIds: number[]) => void;
  addTagGroups: (groups: WsTagGroup[]) => void;
  updateTagGroups: (groups: WsTagGroup[]) => void;
  removeTagGroups: (groupIds: number[]) => void;
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
