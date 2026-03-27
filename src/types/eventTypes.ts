// Use const assertion to avoid ts error ts(1294) 启用 “erasableSyntaxOnly” 时，不允许使用此语法。
export const EventType = {
  OMIT: 0,
  AUDIO_FRAME: 1,
  META_DATA: 2,
  HEARTBEAT: 3,
  TIME_SYNC: 4,
  MESSAGE: 255, // for error handling
} as const;

export type EventType = typeof EventType[keyof typeof EventType];

export const GameEventId = {
  ROOM_CREATE: 10,
  ROOM_JOIN: 11,
  ROOM_STATE: 12,
  GAME_OVER: 13,
  START_POS_UPDATE: 14,
  KICK_USER: 15,
  PLAYER_LEAVE: 16,

  PLAY: 20,
  PAUSE: 21,
  SEEK: 22,
  PRELOAD_AUDIO: 23,

  PLAYER_READY: 30,
  GAME_START: 31,
  ROUND_START: 32,
  ATTEMPT_ANSWER: 33,
  YOUR_TURN: 34,
  SUBMIT_ANSWER: 35,
  ANSWER_BROADCAST: 36,
  ANSWER_QUEUE: 37,
  ROUND_END: 38,

  CLEAR_ANSWER_QUEUE: 53,

  JUDGING: 40,
  JUDGE_SUBMIT: 41,
  SCORE_UPDATE: 42,
  SKIP_ROUND: 43,
  SHOW_ANSWER: 44,
  ROUND_STATE_UPDATE: 45,
  SHOW_SONG: 46,

  TAGS_UPDATE: 60,
  TAG_GROUPS_UPDATE: 61,
  TAG_GROUP: 62,
} as const;

export type GameEventId = typeof GameEventId[keyof typeof GameEventId];

export const AudioEncoding = {
  UNKNOWN: 0,
  OPUS: 1,
  PCM: 2,
} as const;

export type AudioEncoding = typeof AudioEncoding[keyof typeof AudioEncoding];

export const HeartbeatType = {
  PING: 0,
  PONG: 1,
} as const;

export type HeartbeatType = typeof HeartbeatType[keyof typeof HeartbeatType];
