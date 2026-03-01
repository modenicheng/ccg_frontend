import { HeartbeatFrame } from "./dataFrames";
import { HeartbeatType } from "../types/eventTypes";
import { WS } from ".";
import useWebSocketStore from "../stores/webSocketStore";

// 客户端PING发送记录，存储UID和HeartbeatFrame
const pendingPings = new Map<
  string,
  { frame: HeartbeatFrame; sentTime: number }
>();

export const heartbeatHandler = async (data: ArrayBuffer, ws: WS) => {
  const frame = HeartbeatFrame.load(data);
  console.debug(`Received heartbeat frame: \n`, frame);

  if (frame.heartbeat_type === HeartbeatType.PING) {
    // 情况1：收到服务器PING，回复PONG
    const pongFrame = new HeartbeatFrame(HeartbeatType.PONG, frame.uid);
    const pongData = pongFrame.dump();
    await ws.send(pongData);
    console.debug(`Sent heartbeat pong frame: \n`, pongFrame);
  } else if (frame.heartbeat_type === HeartbeatType.PONG) {
    // 情况2：收到服务器PONG，计算RTT、时钟偏移和精确延迟
    const pendingInfo = pendingPings.get(frame.uid);
    if (pendingInfo) {
      const t4 = Date.now(); // 客户端接收时间

      // 健壮性检查：如果服务器没有返回有效的t1，使用本地记录的sentTime
      const effectiveT1 = frame.t1 > 0 ? frame.t1 : pendingInfo.sentTime;
      const rtt = t4 - effectiveT1;
      pendingPings.delete(frame.uid);

      console.debug(
        `Calculated RTT: ${rtt}ms (effectiveT1=${effectiveT1}, t4=${t4}, frame.t1=${frame.t1})`,
      );

      // 设置t4并计算时间偏移和精确延迟
      frame.t4 = t4;
      // 如果服务器提供了t2和t3，计算精确时钟偏移和延迟
      let clockOffset = 0;
      let latency = rtt; // 默认使用RTT作为延迟估计

      if (frame.t2 > 0 && frame.t3 > 0) {
        // 服务器提供了t2和t3，可以计算精确值
        clockOffset = frame.getClockOffset();
        const calculatedLatency = frame.getLatency();
        if (calculatedLatency > 0) {
          latency = calculatedLatency;
        }
        console.debug(
          `Precise: clock offset=${clockOffset}ms, latency=${latency}ms, t2=${frame.t2}, t3=${frame.t3}`,
        );
      } else {
        // 服务器没有提供t2/t3，使用简单RTT的一半作为单向延迟估计
        latency = rtt / 2;
        console.debug(
          `Estimated: using RTT/2 as latency=${latency}ms (no t2/t3 from server)`,
        );
      }

      // 更新全局状态
      const store = useWebSocketStore.getState();
      store.updateLatency(latency);
      // 只有在服务器提供了t2和t3时才更新时钟偏移（可以计算精确值）
      if (frame.t2 > 0 && frame.t3 > 0) {
        store.updateClockOffset(clockOffset);
      }
    } else {
      console.debug(`Received PONG with unknown UID: ${frame.uid}`);
    }
  }
};

// 清理超时的PING记录（例如10秒未收到响应）
const cleanupExpiredPings = () => {
  const now = Date.now();
  const timeoutMs = 10000; // 10秒超时

  for (const [uid, info] of pendingPings.entries()) {
    if (now - info.sentTime > timeoutMs) {
      pendingPings.delete(uid);
      console.debug(`Cleaned up expired PING with UID: ${uid}`);
    }
  }
};

// 客户端定期发送PING的函数
export const startHeartbeat = (
  ws: WS,
  interval: number = 5000,
  warmupDelay: number = 1000,
) => {
  const sendPing = () => {
    // 检查WebSocket连接状态
    if (ws.isConnected()) {
      const sentTime = Date.now();
      // 创建PING帧，并设置t1为实际的发送时间
      const pingFrame = new HeartbeatFrame(
        HeartbeatType.PING,
        undefined,
        0,
        sentTime,
      );
      const pingData = pingFrame.dump();

      // 记录发送时间和frame信息（t1已经设置为sentTime）
      pendingPings.set(pingFrame.uid, { frame: pingFrame, sentTime });

      ws.send(pingData).catch((error) => {
        console.error(
          `Failed to send heartbeat ping: ${(error as Error).message}`,
        );
        pendingPings.delete(pingFrame.uid);
      });
      console.debug(`Sent client heartbeat ping frame: \n`, pingFrame);
      return true;
    }
    return false;
  };

  // 发送第一个PING，如果未连接则重试
  const sendFirstPingWithRetry = (retryCount = 0) => {
    const maxRetries = 10;
    const retryDelay = 100; // 100ms

    if (retryCount >= maxRetries) {
      console.warn(
        `Failed to send initial PING after ${maxRetries} retries. WebSocket may not be connected.`,
      );
      return;
    }

    if (sendPing()) {
      console.debug("Initial PING sent successfully");
    } else {
      // 未连接，等待后重试
      setTimeout(() => {
        sendFirstPingWithRetry(retryCount + 1);
      }, retryDelay);
    }
  };

  // 等待连接稳定后再发送第一个PING
  const sendInitialPing = () => {
    setTimeout(() => {
      sendFirstPingWithRetry();
    }, warmupDelay);
  };

  // 如果已经连接，立即开始发送第一个PING
  if (ws.isConnected()) {
    sendInitialPing();
  } else {
    // 等待连接建立
    const checkConnection = () => {
      if (ws.isConnected()) {
        sendInitialPing();
      } else {
        setTimeout(checkConnection, 100);
      }
    };
    checkConnection();
  }

  // 设置PING发送定时器
  const pingTimer = setInterval(sendPing, interval);

  // 设置清理定时器（每分钟清理一次）
  const cleanupTimer = setInterval(cleanupExpiredPings, 60 * 1000);

  // 返回清理函数
  return () => {
    clearInterval(pingTimer);
    clearInterval(cleanupTimer);
    // 清理所有pending pings
    pendingPings.clear();
  };
};


