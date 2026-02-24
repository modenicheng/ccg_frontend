import { EventType } from "../types/eventTypes";
import useRoomStateStore from "../stores/roomStateStore";
import type { WS } from ".";
import type { WsActionGuardResult } from "../types/store";

interface WsEnvelope<T extends object> {
  v: number;
  event: number;
  ts: number;
  data: T;
}

interface SubmitAnswerPayload {
  room_id: string;
  song_id: number | string | null;
  selected_tag_ids: Array<number | string>;
  description_text: string;
}

interface JudgeSubmitPayload {
  room_id: string;
  song_id: number | string | null;
  correct_tag_ids: Array<number | string>;
  correct_description_ids: Array<number | string>;
  new_correct_descriptions: string[];
  skip_scoring: boolean;
}

const buildEnvelope = <T extends object>(
  event: number,
  data: T,
): WsEnvelope<T> => ({
  v: 1,
  event,
  ts: Date.now(),
  data,
});

const failGuard = (reason: string, code = "STATE_INVALID"): WsActionGuardResult => ({
  allowed: false,
  reason,
  code,
});

const canSend = (
  action: "can_attempt_answer" | "can_submit_answer" | "can_submit_judge" | "can_player_ready",
  ws: WS,
): WsActionGuardResult => {
  const store = useRoomStateStore.getState();
  return store.guardAction(action, ws.isConnected());
};

export const sendAttemptAnswer = async (ws: WS): Promise<WsActionGuardResult> => {
  const guard = canSend("can_attempt_answer", ws);
  if (!guard.allowed) return guard;

  const { snapshot } = useRoomStateStore.getState();
  if (!snapshot?.room_id) {
    return failGuard("房间状态缺失，无法发送抢答", "ROOM_STATE_MISSING");
  }

  await ws.sendJson(
    buildEnvelope(EventType.ATTEMPT_ANSWER, {
      room_id: snapshot.room_id,
      progress_ms: snapshot.play_progress_ms ?? 0,
    }),
  );
  return { allowed: true };
};

export const sendSubmitAnswer = async (ws: WS): Promise<WsActionGuardResult> => {
  const guard = canSend("can_submit_answer", ws);
  if (!guard.allowed) return guard;

  const { snapshot, answerDraft } = useRoomStateStore.getState();
  if (!snapshot?.room_id) {
    return failGuard("房间状态缺失，无法提交作答", "ROOM_STATE_MISSING");
  }

  const payload: SubmitAnswerPayload = {
    room_id: snapshot.room_id,
    song_id: snapshot.current_song_id,
    selected_tag_ids: answerDraft.selected_tag_ids,
    description_text: answerDraft.description_text,
  };

  await ws.sendJson(buildEnvelope(EventType.SUBMIT_ANSWER, payload));
  return { allowed: true };
};

export const sendJudgeSubmit = async (ws: WS): Promise<WsActionGuardResult> => {
  const guard = canSend("can_submit_judge", ws);
  if (!guard.allowed) return guard;

  const { snapshot, judgeDraft } = useRoomStateStore.getState();
  if (!snapshot?.room_id) {
    return failGuard("房间状态缺失，无法提交判分", "ROOM_STATE_MISSING");
  }

  const payload: JudgeSubmitPayload = {
    room_id: snapshot.room_id,
    song_id: snapshot.current_song_id,
    correct_tag_ids: judgeDraft.correct_tag_ids,
    correct_description_ids: judgeDraft.correct_description_ids,
    new_correct_descriptions: judgeDraft.new_correct_descriptions,
    skip_scoring: judgeDraft.skip_scoring,
  };

  await ws.sendJson(buildEnvelope(EventType.JUDGE_SUBMIT, payload));
  return { allowed: true };
};

export const sendPlayerReady = async (
  ws: WS,
  isReady: boolean,
): Promise<WsActionGuardResult> => {
  const guard = canSend("can_player_ready", ws);
  if (!guard.allowed) return guard;

  const { snapshot, identity } = useRoomStateStore.getState();
  if (!snapshot?.room_id) {
    return failGuard("房间状态缺失，无法设置准备状态", "ROOM_STATE_MISSING");
  }

  await ws.sendJson(
    buildEnvelope(EventType.PLAYER_READY, {
      room_id: snapshot.room_id,
      player_id: identity?.player_id ?? "",
      is_ready: isReady,
    }),
  );
  return { allowed: true };
};
