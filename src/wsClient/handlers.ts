import { HeartbeatFrame } from "./dataFrames";
import { HeartbeatType } from "../types/eventTypes";
import { WS } from ".";

export const heartbeatHandler = async (data: ArrayBuffer, ws: WS) => {
  const frame = HeartbeatFrame.load(data);
  console.debug(`Received heartbeat frame: \n`, frame);
  if (frame.heartbeat_type === HeartbeatType.PING) {
    const pongFrame = new HeartbeatFrame(HeartbeatType.PONG, frame.uid);
    const pongData = pongFrame.dump();
    ws.send(pongData);
    console.debug(`Sent heartbeat pong frame: \n`, pongFrame);
  }
};
