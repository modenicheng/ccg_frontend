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
