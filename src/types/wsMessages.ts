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

export interface RoundAnswerItem {
  player_id: number;
  username: string;
  answers: Record<number, number>;
  description: string | null;
  order: number;
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
  round_state: 0 | 1 | 2 | 3 | 4; // 0=PENDING, 1=PLAYING_AUDIO, 2=ANSWERING, 3=JUDGING, 4=COMPLETED
  show_answer: boolean;
  song_start_range_percent: number | null;
  players: WsPlayer[];
  tag_groups: WsTagGroup[];
  answer_queue: AnswerQueueItem[];
  answer_queue_tail_player_id: number | null;
  round_scored: boolean;
  round_answers: RoundAnswerItem[];
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
  start_percent: number;
}

export interface RoundStartMessage {
  event: typeof GameEventId.ROUND_START;
  ts: number;
  data: RoundStartData;
}

export interface AttemptAnswerMessageData {
  offset_ts: number;
  progress_ms: number;
  user_id: number;
}

export interface AttemptAnswerMessage {
  event: typeof GameEventId.ATTEMPT_ANSWER;
  ts: number;
  data: AttemptAnswerMessageData;
}

export interface YourTurnMessageData {
  user_id: number;
}

export interface YourTurnMessage {
  event: typeof GameEventId.YOUR_TURN;
  ts: number;
  data: YourTurnMessageData;
}

export interface AnswerQueueMessageData {
  queue: AnswerQueueItem[];
  answer_queue_tail_player_id: number | null;
}

export interface AnswerQueueMessage {
  event: typeof GameEventId.ANSWER_QUEUE;
  ts: number;
  data: AnswerQueueMessageData;
}

export interface AnswerBroadcastMessageData {
  player_id: string;
  selected_tag_ids: number[];
  description_text: string | null;
}

export interface AnswerBroadcastMessage {
  event: typeof GameEventId.ANSWER_BROADCAST;
  ts: number;
  data: AnswerBroadcastMessageData;
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

export interface RoundStateUpdateData {
  round_state: 0 | 1 | 2 | 3 | 4; // 0=PENDING, 1=PLAYING_AUDIO, 2=ANSWERING, 3=JUDGING, 4=COMPLETED
  round_state_name: "PENDING" | "PLAYING_AUDIO" | "ANSWERING" | "JUDGING" | "COMPLETED";
}

export interface RoundStateUpdateMessage {
  event: typeof GameEventId.ROUND_STATE_UPDATE;
  ts: number;
  data: RoundStateUpdateData;
}

export interface ShowSongData {
  title: string | null;
  album: string | null;
  author: string | null;
  cover: string | null;
}

export interface ShowSongMessage {
  event: typeof GameEventId.SHOW_SONG;
  ts: number;
  data: ShowSongData;
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

// 起始位置更新数据
export interface StartPosUpdateData {
  start_position_percent: number;
}

// 起始位置更新消息
export interface StartPosUpdateMessage {
  event: typeof GameEventId.START_POS_UPDATE;
  ts: number;
  data: StartPosUpdateData;
}

// 游戏结束得分项
export interface GameOverScore {
  player_id: number;
  username: string;
  score: number;
}

// 游戏结束数据
export interface GameOverData {
  manual: boolean;
  final_scores: GameOverScore[];
}

// 游戏结束消息
export interface GameOverMessage {
  event: typeof GameEventId.GAME_OVER;
  ts: number;
  data: GameOverData;
}

// 清空抢答队列数据
export interface ClearAnswerQueueData {
  [key: string]: never;
}

// 清空抢答队列消息
export interface ClearAnswerQueueMessage {
  event: typeof GameEventId.CLEAR_ANSWER_QUEUE;
  ts: number;
  data: ClearAnswerQueueData;
}

export interface KickUserData {
  user_id: number;
}

export interface KickUserMessage {
  event: typeof GameEventId.KICK_USER;
  ts: number;
  data: KickUserData;
}

// 预加载音频数据
export interface PreloadAudioData {
  audio_url: string;
  progress_ms?: number;
  offset_ts?: number | null;
}

// 预加载音频消息
export interface PreloadAudioMessage {
  event: typeof GameEventId.PRELOAD_AUDIO;
  ts: number;
  data: PreloadAudioData;
}

// 标签增量更新数据
export interface TagsUpdateData {
  added_tags: WsTag[];
  updated_tags: WsTag[];
  deleted_tag_ids: number[];
}

// 标签增量更新消息
export interface TagsUpdateMessage {
  event: typeof GameEventId.TAGS_UPDATE;
  ts: number;
  data: TagsUpdateData;
}

// 标签组增量更新数据
export interface TagGroupsUpdateData {
  added_tag_groups: WsTagGroup[];
  updated_tag_groups: WsTagGroup[];
  deleted_tag_group_ids: number[];
}

// 标签组增量更新消息
export interface TagGroupsUpdateMessage {
  event: typeof GameEventId.TAG_GROUPS_UPDATE;
  ts: number;
  data: TagGroupsUpdateData;
}

// 房间维度 tag_groups 同步数据
export interface TagGroupData {
  room_id: string;
  tag_groups: WsTagGroup[];
}

// 房间维度 tag_groups 同步消息
export interface TagGroupMessage {
  event: typeof GameEventId.TAG_GROUP;
  ts: number;
  data: TagGroupData;
}

// 所有消息类型的联合类型
export type WsMessage =
  | RoomStateMessage
  | PlayControlMessage
  | RoundStartMessage
  | AttemptAnswerMessage
  | AnswerQueueMessage
  | YourTurnMessage
  | AnswerBroadcastMessage
  | JudgingMessage
  | ScoreUpdateMessage
  | RoundStateUpdateMessage
  | ShowSongMessage
  | StartPosUpdateMessage
  | GameOverMessage
  | ClearAnswerQueueMessage
  | KickUserMessage
  | PreloadAudioMessage
  | TagsUpdateMessage
  | TagGroupsUpdateMessage
  | TagGroupMessage;