import { AudioEncoding, HeartbeatType, EventType } from "../types/eventTypes";

const AUDIO_FRAME_FORMAT = {
  headerSize: 1 + 8 + 2 + 4 + 1 + 4 + 1,
  eventTypeOffset: 0,
  timestampOffset: 1,
  sampleRateOffset: 9,
  sampleNumOffset: 11,
  channelsOffset: 15,
  lengthOffset: 16,
  encodingOffset: 20,
} as const;

class InvalidFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFrameError";
  }
}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const currentTimestampMs = (): number => Date.now();

const get_event_type = (data: ArrayBuffer | Uint8Array): EventType => {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (view.length === 0) {
    throw new Error("Data is empty.");
  }
  return view[0] as EventType;
};

abstract class BaseFrame {
  /**
   * All data frames must include:
   * - 1 byte: event type, refer to `EventType` enum
   * - 8 bytes: timestamp, uint64 (milliseconds)
   */
  event_type: EventType = EventType.OMIT;
  timestamp: number = currentTimestampMs();

  constructor() {}

  protected static randomUid(length: number, chars: string): string {
    const bytes = new Uint8Array(length);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    let uid = "";
    for (let i = 0; i < length; i += 1) {
      uid += chars[bytes[i] % chars.length];
    }
    return uid;
  }

  abstract dump(): ArrayBuffer;

  get bin(): ArrayBuffer {
    return this.dump();
  }
}

class AudioFrame extends BaseFrame {
  /**
   * A class to abstract the audio frame data.
   *
   * The binary format of the audio frame is as follows:
   * - 1 byte: event type, refer to `EventType` enum
   * - 8 bytes: timestamp, uint64 (milliseconds)
   * - 2 byte: sample rate, uint16
   * - 4 bytes: sample num, uint32
   * - 1 bytes: channels num, uint8
   * - 4 bytes: length of audio data, uint32
   * - 1 byte: encoding type, uint8, refer to AudioEncoding enum
   * - N bytes: audio data
   */
  event_type: EventType = EventType.AUDIO_FRAME;
  timestamp: number = currentTimestampMs();
  sample_rate: number = 48000;
  sample_num: number = 0;
  channels: number = 2;
  length: number = 0;
  encoding: AudioEncoding = AudioEncoding.OPUS;
  data: Uint8Array = new Uint8Array();

  constructor(
    sample_rate: number,
    sample_num: number,
    channels: number,
    encoding: AudioEncoding,
    data: Uint8Array,
  ) {
    super();
    this.timestamp = currentTimestampMs();
    this.sample_rate = sample_rate;
    this.sample_num = sample_num;
    this.channels = channels;
    this.length = data.length;
    this.encoding = encoding;
    this.data = data;
  }

  dump(): ArrayBuffer {
    if (this.data.length === 0) {
      console.warn("AudioFrame dump called with empty data");
    }

    const totalLength = AUDIO_FRAME_FORMAT.headerSize + this.data.length;
    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);

    view.setUint8(AUDIO_FRAME_FORMAT.eventTypeOffset, this.event_type);
    view.setBigUint64(
      AUDIO_FRAME_FORMAT.timestampOffset,
      BigInt(this.timestamp),
      false,
    );
    view.setUint16(AUDIO_FRAME_FORMAT.sampleRateOffset, this.sample_rate, false);
    view.setUint32(AUDIO_FRAME_FORMAT.sampleNumOffset, this.sample_num, false);
    view.setUint8(AUDIO_FRAME_FORMAT.channelsOffset, this.channels);
    view.setUint32(AUDIO_FRAME_FORMAT.lengthOffset, this.length, false);
    view.setUint8(AUDIO_FRAME_FORMAT.encodingOffset, this.encoding);

    new Uint8Array(buffer, AUDIO_FRAME_FORMAT.headerSize).set(this.data);
    return buffer;
  }

  static load(data: ArrayBuffer): AudioFrame {
    if (data.byteLength < AUDIO_FRAME_FORMAT.headerSize) {
      throw new InvalidFrameError("Invalid data for AudioFrame");
    }

    const view = new DataView(data);
    const eventType = view.getUint8(
      AUDIO_FRAME_FORMAT.eventTypeOffset,
    ) as EventType;
    const timestamp = view.getBigUint64(
      AUDIO_FRAME_FORMAT.timestampOffset,
      false,
    );
    const sampleRate = view.getUint16(
      AUDIO_FRAME_FORMAT.sampleRateOffset,
      false,
    );
    const sampleNum = view.getUint32(AUDIO_FRAME_FORMAT.sampleNumOffset, false);
    const channels = view.getUint8(AUDIO_FRAME_FORMAT.channelsOffset);
    const length = view.getUint32(AUDIO_FRAME_FORMAT.lengthOffset, false);
    const encoding = view.getUint8(
      AUDIO_FRAME_FORMAT.encodingOffset,
    ) as AudioEncoding;

    const payload = new Uint8Array(
      data,
      AUDIO_FRAME_FORMAT.headerSize,
      Math.min(length, data.byteLength - AUDIO_FRAME_FORMAT.headerSize),
    );

    const frame = new AudioFrame(
      sampleRate,
      sampleNum,
      channels,
      encoding,
      payload,
    );
    frame.event_type = eventType;
    frame.timestamp = Number(timestamp);
    frame.length = length;
    return frame;
  }

  to_dict(): {
    event_type: string;
    timestamp: number;
    sample_rate: number;
    sample_num: number;
    length: number;
    encoding: string;
    data: string;
  } {
    const encodingName =
      Object.entries(AudioEncoding).find(([, value]) => value === this.encoding)
        ?.[0] ?? "UNKNOWN";
    return {
      event_type:
        Object.entries(EventType).find(([, value]) => value === this.event_type)
          ?.[0] ?? "OMIT",
      timestamp: this.timestamp,
      sample_rate: this.sample_rate,
      sample_num: this.sample_num,
      length: this.length,
      encoding: encodingName,
      data: bytesToHex(this.data),
    };
  }
}

class HeartbeatFrame extends BaseFrame {
  /**
   * A class to abstract the heartbeat frame data.
   *
   * The binary format of the heartbeat frame is as follows:
   * - 1 byte: event type, refer to `EventType` enum
   * - 1 byte: heartbeat type, refer to `HeartbeatType` enum
   * - 8 bytes: timestamp, uint64 (milliseconds)
   * - 8 bytes: uid, string, random generated. Used for identifying the source of the heartbeat frame.
   * - 8 bytes: t1, uint64 (milliseconds), the timestamp when the client sends the heartbeat frame.
   * - 8 bytes: t2, uint64 (milliseconds), the timestamp when the server receives the heartbeat frame.
   * - 8 bytes: t3, uint64 (milliseconds), the timestamp when the server sends the heartbeat response frame.
   * - 8 bytes: t4, uint64 (milliseconds), the timestamp when the client receives the heartbeat response frame.
   *
   * The heartbeat can be used to keep the connection, and measure the latency and time offset between the client and the server.
   */
  static readonly UID_LEN = 8;
  static readonly UID_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  static readonly FRAME_LEN = 1 + 1 + 8 + HeartbeatFrame.UID_LEN + 8 + 8 + 8 + 8;
  event_type: EventType = EventType.HEARTBEAT;
  heartbeat_type: HeartbeatType;
  timestamp: number = currentTimestampMs();
  uid: string = BaseFrame.randomUid(
    HeartbeatFrame.UID_LEN,
    HeartbeatFrame.UID_CHARS,
  );
  t1: number = 0;
  t2: number = 0;
  t3: number = 0;
  t4: number = 0;

  constructor(
    heartbeat_type: HeartbeatType = HeartbeatType.PING,
    uid?: string,
    t1: number = 0,
    t2: number = 0,
    t3: number = 0,
    t4: number = 0,
  ) {
    super();
    this.timestamp = currentTimestampMs();
    this.heartbeat_type = heartbeat_type;
    this.uid =
      uid ??
      BaseFrame.randomUid(HeartbeatFrame.UID_LEN, HeartbeatFrame.UID_CHARS);
    this.t1 = t1 === 0 && heartbeat_type === HeartbeatType.PING ? this.timestamp : t1;
    this.t2 = t2;
    this.t3 = t3;
    this.t4 = t4;
  }

  /**
   * Calculate the client's clock offset relative to the server.
   * Uses the formula: offset = ((t2 - t1) + (t3 - t4)) / 2
   * Returns the offset in milliseconds (positive means client clock is ahead).
   */
  getClockOffset(): number {
    if (this.t1 === 0 || this.t2 === 0 || this.t3 === 0 || this.t4 === 0) {
      return 0;
    }
    return ((this.t2 - this.t1) + (this.t3 - this.t4)) / 2;
  }

  /**
   * Calculate the round-trip latency between the client and the server.
   * Uses the formula: latency = ((t4 - t1) - (t3 - t2)) / 2
   * Returns the latency in milliseconds.
   */
  getLatency(): number {
    if (this.t1 === 0 || this.t4 === 0 || this.t2 === 0 || this.t3 === 0) {
      return 0;
    }
    return ((this.t4 - this.t1) - (this.t3 - this.t2)) / 2;
  }

  dump(): ArrayBuffer {
    const buffer = new ArrayBuffer(HeartbeatFrame.FRAME_LEN);
    const view = new DataView(buffer);
    view.setUint8(0, this.event_type);
    view.setUint8(1, this.heartbeat_type);
    view.setBigUint64(2, BigInt(this.timestamp), false);

    const encoder = new TextEncoder();
    const uidBytes = encoder.encode(this.uid);
    for (let i = 0; i < HeartbeatFrame.UID_LEN; i += 1) {
      view.setUint8(10 + i, uidBytes[i] ?? 0);
    }

    view.setBigUint64(18, BigInt(this.t1), false);
    view.setBigUint64(26, BigInt(this.t2), false);
    view.setBigUint64(34, BigInt(this.t3), false);
    view.setBigUint64(42, BigInt(this.t4), false);

    return buffer;
  }

  static load(data: ArrayBuffer): HeartbeatFrame {
    if (data.byteLength < HeartbeatFrame.FRAME_LEN) {
      throw new InvalidFrameError("Invalid data for HeartbeatFrame");
    }

    try {
      const view = new DataView(data);
      const eventType = view.getUint8(0) as EventType;
      const heartbeatType = view.getUint8(1) as HeartbeatType;
      const timestamp = view.getBigUint64(2, false);

      const uidBytes = new Uint8Array(data, 10, HeartbeatFrame.UID_LEN);
      const decoder = new TextDecoder();
      const uid = decoder.decode(uidBytes).replace(/\0/g, "");

      const t1 = view.getBigUint64(18, false);
      const t2 = view.getBigUint64(26, false);
      const t3 = view.getBigUint64(34, false);
      const t4 = view.getBigUint64(42, false);

      const frame = new HeartbeatFrame(
        heartbeatType,
        uid,
        Number(t1),
        Number(t2),
        Number(t3),
        Number(t4),
      );
      frame.event_type = eventType;
      frame.timestamp = Number(timestamp);
      return frame;
    } catch (error) {
      throw new InvalidFrameError(`Invalid data for HeartbeatFrame. ${(error as Error).message}`);
    }
  }
}

class TimeSyncFrame extends BaseFrame {
  static readonly UID_LEN = 4;
  static readonly UID_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  static readonly FRAME_LEN = 1 + 8 + 1 + TimeSyncFrame.UID_LEN + 8 + 8 + 8 + 8;
  /**
   * A class to abstract the time sync frame data.
   *
   * The binary format of the time sync frame is as follows:
   * - 1 byte: event type, refer to `EventType` enum
   * - 8 bytes: timestamp, uint64 (milliseconds)
   * - 1 byte: round number, uint8
   * - 4 bytes: uid, string, random generated.
   */
  event_type: EventType = EventType.TIME_SYNC;
  timestamp: number = currentTimestampMs();
  round_num: number = 0;
  t1: number = 0;
  t2: number = 0;
  t3: number = 0;
  t4: number = 0;
  uid: string = BaseFrame.randomUid(
    TimeSyncFrame.UID_LEN,
    TimeSyncFrame.UID_CHARS,
  );

  constructor(
    round_num: number = 0,
    uid?: string,
    t1: number = 0,
    t2: number = 0,
    t3: number = 0,
    t4: number = 0,
  ) {
    super();
    this.timestamp = currentTimestampMs();
    this.round_num = round_num;
    this.t1 = t1;
    this.t2 = t2;
    this.t3 = t3;
    this.t4 = t4;
    this.uid =
      uid ?? BaseFrame.randomUid(TimeSyncFrame.UID_LEN, TimeSyncFrame.UID_CHARS);
  }

  dump(): ArrayBuffer {
    const buffer = new ArrayBuffer(TimeSyncFrame.FRAME_LEN);
    const view = new DataView(buffer);
    view.setUint8(0, this.event_type);
    view.setBigUint64(1, BigInt(this.timestamp), false);
    view.setUint8(9, this.round_num);

    const encoder = new TextEncoder();
    const uidBytes = encoder.encode(this.uid);
    for (let i = 0; i < TimeSyncFrame.UID_LEN; i += 1) {
      view.setUint8(10 + i, uidBytes[i] ?? 0);
    }

    view.setBigUint64(14, BigInt(this.t1), false);
    view.setBigUint64(22, BigInt(this.t2), false);
    view.setBigUint64(30, BigInt(this.t3), false);
    view.setBigUint64(38, BigInt(this.t4), false);

    return buffer;
  }

  static load(data: ArrayBuffer): TimeSyncFrame {
    if (data.byteLength < TimeSyncFrame.FRAME_LEN) {
      throw new InvalidFrameError("Invalid data for TimeSyncFrame");
    }

    try {
      const view = new DataView(data);
      const eventType = view.getUint8(0) as EventType;
      const timestamp = view.getBigUint64(1, false);
      const roundNum = view.getUint8(9);

      const uidBytes = new Uint8Array(data, 10, TimeSyncFrame.UID_LEN);
      const decoder = new TextDecoder();
      const uid = decoder.decode(uidBytes).replace(/\0/g, "");

      const t1 = view.getBigUint64(14, false);
      const t2 = view.getBigUint64(22, false);
      const t3 = view.getBigUint64(30, false);
      const t4 = view.getBigUint64(38, false);

      const frame = new TimeSyncFrame(
        roundNum,
        uid,
        Number(t1),
        Number(t2),
        Number(t3),
        Number(t4),
      );
      frame.event_type = eventType;
      frame.timestamp = Number(timestamp);
      return frame;
    } catch (error) {
      throw new InvalidFrameError(
        `Invalid data for TimeSyncFrame. ${(error as Error).message}`,
      );
    }
  }
}

export {
  BaseFrame,
  AudioFrame,
  HeartbeatFrame,
  TimeSyncFrame,
  InvalidFrameError,
  get_event_type,
  currentTimestampMs,
};
