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

export type RoomPhase =
  | "waiting"
  | "countdown"
  | "playing"
  | "answering"
  | "judging"
  | "game_over";

export interface SessionIdentity {
  room_id: string;
  player_id: string;
  token: string | null;
}

export interface AnswerDraft {
  selected_tag_ids: Array<number | string>;
  description_text: string;
}

export interface JudgeDraft {
  correct_tag_ids: Array<number | string>;
  correct_description_ids: Array<number | string>;
  new_correct_descriptions: string[];
  skip_scoring: boolean;
}

export interface RoomActionPermissions {
  can_attempt_answer: boolean;
  can_submit_answer: boolean;
  can_submit_judge: boolean;
  can_player_ready: boolean;
  can_start_game: boolean;
}

export interface WsActionGuardResult {
  allowed: boolean;
  reason?: string;
  code?: string;
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

export interface RoomPlayerState {
  player_id: string;
  username: string;
  is_host: boolean;
  is_ready: boolean;
  score: number;
}

export interface RoomSonglistState {
  songlist_id: string | null;
  name: string | null;
  cover_url: string | null;
  total_songs: number;
}

export interface RoomCurrentSongState {
  song_id: string | null;
  name: string | null;
  artist: string | null;
  album: string | null;
  cover_url: string | null;
  duration_ms: number | null;
}

export interface PlaybackContextState {
  current_song_index: number;
  current_round_index: number;
  total_rounds: number;
}

export interface TagState {
  tag_id: number | string;
  name: string;
}

export interface TagGroupState {
  group_id: number | string;
  name: string;
  tags: TagState[];
}

export interface RoomStateSnapshot {
  room_id: string;
  status: string;
  players: RoomPlayerState[];
  current_round_index: number;
  current_song_index: number;
  current_song_id: number | string | null;
  play_state: "playing" | "paused" | "judging" | string;
  play_progress_ms: number;
  queue_player_ids: string[];
  current_answerer_player_id: string | null;
  tag_groups: TagGroupState[];
  songlist: RoomSonglistState;
  current_song: RoomCurrentSongState;
  playback_context: PlaybackContextState;
  server_time_ms: number;
}

export interface ScoreDeltaItem {
  player_id: string;
  username: string;
  score_delta?: number;
  total_score?: number;
  score?: number;
}

export interface RoomStateStore {
  snapshot: RoomStateSnapshot | null;
  scores: ScoreDeltaItem[];
  identity: SessionIdentity | null;
  answerDraft: AnswerDraft;
  judgeDraft: JudgeDraft;
  setSnapshot: (snapshot: RoomStateSnapshot) => void;
  setQueue: (queue_player_ids: string[]) => void;
  setPlayback: (play_state: "playing" | "paused", play_progress_ms: number) => void;
  setScores: (scores: ScoreDeltaItem[]) => void;
  setIdentity: (identity: SessionIdentity | null) => void;
  syncIdentityFromSession: (room_id: string) => void;
  getCurrentPhase: () => RoomPhase;
  getCurrentPlayer: () => RoomPlayerState | null;
  getPermissions: (isConnected: boolean) => RoomActionPermissions;
  guardAction: (
    action: keyof RoomActionPermissions,
    isConnected: boolean,
  ) => WsActionGuardResult;
  setAnswerDraft: (partial: Partial<AnswerDraft>) => void;
  resetAnswerDraft: () => void;
  setJudgeDraft: (partial: Partial<JudgeDraft>) => void;
  resetJudgeDraft: () => void;
  applyYourTurn: (answerer_player_id: string | null) => void;
  applyJudging: () => void;
  applyRoundEnd: (next_round_index?: number) => void;
  reset: () => void;
}
