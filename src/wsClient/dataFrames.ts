import { HeartbeatType, EventType } from "../types/eventTypes";

const UID_LEN = 8;
const FRAME_LEN = 1 + 1 + 8 + UID_LEN;
const UID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const randomUid = (): string => {
  const bytes = new Uint8Array(UID_LEN);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < UID_LEN; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let uid = "";
  for (let i = 0; i < UID_LEN; i += 1) {
    uid += UID_CHARS[bytes[i] % UID_CHARS.length];
  }
  return uid;
};

class HeartbeatFrame {
  /**
   * A class to abstract the heartbeat frame data.
   *
   * The binary format of the heartbeat frame is as follows:
   * - 1 byte: event type, refer to `EventType` enum
   * - 1 byte: heartbeat type, refer to `HeartbeatType` enum
   * - 8 bytes: timestamp, uint64 (milliseconds)
   * - 8 bytes: uid, string, random generated. Used for identifying the source of the heartbeat frame.
   */
  event_type: EventType = EventType.HEARTBEAT;
  heartbeat_type: HeartbeatType;
  timestamp: number;
  uid: string;

  constructor(heartbeat_type: HeartbeatType = HeartbeatType.PING, uid?: string) {
    this.timestamp = Date.now();
    this.heartbeat_type = heartbeat_type;
    this.uid = uid ?? randomUid();
  }

  dump(): ArrayBuffer {
    const buffer = new ArrayBuffer(FRAME_LEN);
    const view = new DataView(buffer);
    view.setUint8(0, this.event_type);
    view.setUint8(1, this.heartbeat_type);
    view.setBigUint64(2, BigInt(this.timestamp), false);

    const encoder = new TextEncoder();
    const uidBytes = encoder.encode(this.uid);
    for (let i = 0; i < UID_LEN; i += 1) {
      view.setUint8(10 + i, uidBytes[i] ?? 0);
    }

    return buffer;
  }

  static load(data: ArrayBuffer): HeartbeatFrame {
    if (data.byteLength < FRAME_LEN) {
      throw new Error("Invalid data for HeartbeatFrame");
    }

    const view = new DataView(data);
    const eventType = view.getUint8(0) as EventType;
    const heartbeatType = view.getUint8(1) as HeartbeatType;
    const timestamp = view.getBigUint64(2, false);

    const uidBytes = new Uint8Array(data, 10, UID_LEN);
    const decoder = new TextDecoder();
    const uid = decoder.decode(uidBytes).replace(/\0/g, "");

    const frame = new HeartbeatFrame(heartbeatType, uid);
    frame.event_type = eventType;
    frame.timestamp = Number(timestamp);
    return frame;
  }
}

export { HeartbeatFrame };
