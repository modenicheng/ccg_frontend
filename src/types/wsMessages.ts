import { GameEventId } from "./eventTypes";

// 基础数据类型，与后端schema保持一致
export interface WsTag {
  id: number;
  name: string;
}

export interface WsTagGroup {
  id: number;
  name: string;
  description?: string | null;
  tags: WsTag[];
}

export interface WsPlayer {
  id: number;
  username: string;
  is_owner: boolean;
  online: boolean;
}

export interface AnswerQueueItem {
  player_id: number;
  order: number | null;
  offset_ts: number;
  server_ts: number;
  is_answering: boolean;
}

export interface PlaybackState {
  progress_ms: number;
  updated_at: number;
  offset_ts: number;
  play_state: "playing" | "paused";
  current_order: number;
  audio_url: string | null;
}

// PlayControlData与后端playback_schemas.py一致
export interface PlayControlData {
  progress_ms: number;
  offset_ts?: number | null; // 前端可选，后端处理时会填充
  audio_url?: string | null;
}

// RoomState消息的数据部分，与后端room_schemas.py中的ClientRoomState一致
export interface RoomStateData {
  room_id: string;
  title: string | null;
  status: 0 | 1 | 2; // 0=waiting, 1=playing, 2=ended
  song_start_range_percent: number | null;
  players: WsPlayer[];
  tag_groups: WsTagGroup[];
  answer_queue: AnswerQueueItem[];
  playback_status: PlaybackState | null;
  scores: Array<{
    player_id: number;
    round_index: number;
    score_delta: number;
    total_score: number;
  }>;
  // 注意：后端消息中可能还包含其他字段如host_player_id，但不在ClientRoomState中
}

// 完整的消息类型
export interface RoomStateMessage {
  event: typeof GameEventId.ROOM_STATE;
  ts: number;
  data: RoomStateData;
}

export interface PlayMessage {
  event: typeof GameEventId.PLAY;
  ts: number;
  data: PlayControlData;
}

export interface PauseMessage {
  event: typeof GameEventId.PAUSE;
  ts: number;
  data: PlayControlData;
}

export interface SeekMessage {
  event: typeof GameEventId.SEEK;
  ts: number;
  data: PlayControlData;
}

// 播放控制消息联合类型
export type PlayControlMessage = PlayMessage | PauseMessage | SeekMessage;

export interface RoundStartData {
  round_index: number;
  audio_url: string | null;
  start_pertent: number;  // 注意：后端字段名可能为拼写错误，暂时保持一致
}

export interface RoundStartMessage {
  event: typeof GameEventId.ROUND_START;
  ts: number;
  data: RoundStartData;
}

export interface AttemptAnswerMessageData {
  offset_ts: number;
  user_id: number;
}

export interface AttemptAnswerMessage {
  event: typeof GameEventId.ATTEMPT_ANSWER;
  ts: number;
  data: AttemptAnswerMessageData;
}

export interface JudgingMessageData {
  song?: {
    title?: string;
    artist?: string;
    album?: string;
    cover_url?: string;
    platform_url?: string;
  };
  history_tag_ids?: number[];
  reference_descriptions?: string[];
  player_descriptions?: Array<{
    id: number;
    username: string;
    description: string;
  }>;
}

export interface JudgingMessage {
  event: typeof GameEventId.JUDGING;
  ts: number;
  data: JudgingMessageData;
}

export interface ScoreUpdateMessageData {
  scores: Array<{ player_id: number; username: string; score: number }>;
}

export interface ScoreUpdateMessage {
  event: typeof GameEventId.SCORE_UPDATE;
  ts: number;
  data: ScoreUpdateMessageData;
}

// 类型守卫函数
export function isPlayControlData(value: unknown): value is PlayControlData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlayControlData>;
  return (
    typeof candidate.progress_ms === "number" &&
    (candidate.offset_ts === undefined ||
      candidate.offset_ts === null ||
      typeof candidate.offset_ts === "number")
  );
}

// 状态映射函数
export function mapStatusCodeToStatus(statusCode: 0 | 1 | 2): "waiting" | "playing" | "ended" {
  if (statusCode === 1) return "playing";
  if (statusCode === 2) return "ended";
  return "waiting";
}

// 工具函数：将完整玩家列表转换为简单用户名数组
export function getPlayersSimple(players: WsPlayer[]): string[] {
  return players.map(p => p.username);
}

// 工具函数：将tag_groups转换为简化的Record<string, string[]>
export function getTagGroupsSimple(tagGroups: WsTagGroup[]): Record<string, string[]> {
  return tagGroups.reduce<Record<string, string[]>>((acc, group) => {
    acc[group.name] = group.tags.map(tag => tag.name);
    return acc;
  }, {});
}

// 工具函数：从玩家列表中获取房主ID
export function getHostPlayerId(players: WsPlayer[]): string {
  const owner = players.find(p => p.is_owner);
  return owner ? owner.id.toString() : "";
}