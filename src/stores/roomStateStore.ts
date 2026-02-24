import { create } from "zustand";
import type {
  AnswerDraft,
  JudgeDraft,
  RoomActionPermissions,
  RoomPhase,
  RoomStateSnapshot,
  RoomStateStore,
  ScoreDeltaItem,
  SessionIdentity,
} from "../types/store";

const initialSnapshot: RoomStateSnapshot = {
  room_id: "",
  status: "waiting",
  players: [],
  current_round_index: 0,
  current_song_index: 0,
  current_song_id: null,
  play_state: "paused",
  play_progress_ms: 0,
  queue_player_ids: [],
  current_answerer_player_id: null,
  tag_groups: [],
  songlist: {
    songlist_id: null,
    name: null,
    cover_url: null,
    total_songs: 0,
  },
  current_song: {
    song_id: null,
    name: null,
    artist: null,
    album: null,
    cover_url: null,
    duration_ms: null,
  },
  playback_context: {
    current_song_index: 0,
    current_round_index: 0,
    total_rounds: 0,
  },
  server_time_ms: 0,
};

const initialAnswerDraft: AnswerDraft = {
  selected_tag_ids: [],
  description_text: "",
};

const initialJudgeDraft: JudgeDraft = {
  correct_tag_ids: [],
  correct_description_ids: [],
  new_correct_descriptions: [],
  skip_scoring: false,
};

const defaultPermissions: RoomActionPermissions = {
  can_attempt_answer: false,
  can_submit_answer: false,
  can_submit_judge: false,
  can_player_ready: false,
  can_start_game: false,
};

const toPlayerId = (value: unknown): string => {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "";
};

const useRoomStateStore = create<RoomStateStore>((set, get) => ({
  snapshot: null,
  scores: [],
  identity: null,
  answerDraft: initialAnswerDraft,
  judgeDraft: initialJudgeDraft,
  setSnapshot: (snapshot: RoomStateSnapshot) =>
    set({
      snapshot: {
        ...initialSnapshot,
        ...snapshot,
      },
    }),
  setQueue: (queue_player_ids: string[]) =>
    set((state) => ({
      snapshot: state.snapshot
        ? { ...state.snapshot, queue_player_ids }
        : {
            ...initialSnapshot,
            queue_player_ids,
          },
    })),
  setPlayback: (play_state, play_progress_ms) =>
    set((state) => ({
      snapshot: state.snapshot
        ? { ...state.snapshot, play_state, play_progress_ms }
        : {
            ...initialSnapshot,
            play_state,
            play_progress_ms,
          },
    })),
  setScores: (scores: ScoreDeltaItem[]) => set({ scores }),
  setIdentity: (identity: SessionIdentity | null) => set({ identity }),
  syncIdentityFromSession: (room_id: string) => {
    const token = sessionStorage.getItem(`ccg-room-token:${room_id}`);
    const player_id = sessionStorage.getItem(`ccg-room-player-id:${room_id}`);
    if (!player_id) {
      set({
        identity: {
          room_id,
          player_id: "",
          token,
        },
      });
      return;
    }
    set({
      identity: {
        room_id,
        player_id,
        token,
      },
    });
  },
  getCurrentPhase: () => {
    const state = get();
    const snapshot = state.snapshot;
    if (!snapshot) return "waiting";

    if (snapshot.status === "ended" || snapshot.status === "game_over") {
      return "game_over";
    }

    if (snapshot.play_state === "judging" || snapshot.status === "judging") {
      return "judging";
    }

    if (snapshot.current_answerer_player_id) {
      return "answering";
    }

    if (snapshot.status === "countdown") {
      return "countdown";
    }

    if (snapshot.play_state === "playing") {
      return "playing";
    }

    return "waiting";
  },
  getCurrentPlayer: () => {
    const state = get();
    if (!state.snapshot || !state.identity?.player_id) return null;
    const myId = toPlayerId(state.identity.player_id);
    return (
      state.snapshot.players.find((player) => toPlayerId(player.player_id) === myId) ??
      null
    );
  },
  getPermissions: (isConnected: boolean) => {
    const state = get();
    const snapshot = state.snapshot;
    const phase: RoomPhase = state.getCurrentPhase();
    if (!snapshot || !isConnected) {
      return defaultPermissions;
    }

    const me = state.getCurrentPlayer();
    const isHost = me?.is_host ?? false;
    const myId = toPlayerId(state.identity?.player_id);
    const currentAnswererId = toPlayerId(snapshot.current_answerer_player_id);

    return {
      can_attempt_answer:
        phase === "playing" &&
        !!myId &&
        myId !== currentAnswererId &&
        !snapshot.queue_player_ids.some((id) => toPlayerId(id) === myId),
      can_submit_answer:
        phase === "answering" && !!myId && myId === currentAnswererId,
      can_submit_judge: phase === "judging" && isHost,
      can_player_ready: phase === "waiting",
      can_start_game: phase === "waiting" && isHost,
    };
  },
  guardAction: (action, isConnected) => {
    const state = get();
    const permissions = state.getPermissions(isConnected);
    if (permissions[action]) {
      return { allowed: true };
    }

    if (!isConnected) {
      return {
        allowed: false,
        code: "WS_DISCONNECTED",
        reason: "连接已断开，暂时无法执行该操作",
      };
    }

    return {
      allowed: false,
      code: "PERMISSION_DENIED",
      reason: "当前状态下你没有此操作权限",
    };
  },
  setAnswerDraft: (partial) =>
    set((state) => ({
      answerDraft: {
        ...state.answerDraft,
        ...partial,
      },
    })),
  resetAnswerDraft: () => set({ answerDraft: initialAnswerDraft }),
  setJudgeDraft: (partial) =>
    set((state) => ({
      judgeDraft: {
        ...state.judgeDraft,
        ...partial,
      },
    })),
  resetJudgeDraft: () => set({ judgeDraft: initialJudgeDraft }),
  applyYourTurn: (answerer_player_id) =>
    set((state) => ({
      snapshot: state.snapshot
        ? {
            ...state.snapshot,
            current_answerer_player_id: answerer_player_id,
          }
        : state.snapshot,
    })),
  applyJudging: () =>
    set((state) => ({
      snapshot: state.snapshot
        ? {
            ...state.snapshot,
            play_state: "judging",
            status: "judging",
            current_answerer_player_id: null,
            queue_player_ids: [],
          }
        : state.snapshot,
    })),
  applyRoundEnd: (next_round_index) =>
    set((state) => ({
      snapshot: state.snapshot
        ? {
            ...state.snapshot,
            current_round_index:
              typeof next_round_index === "number"
                ? next_round_index
                : state.snapshot.current_round_index + 1,
            current_answerer_player_id: null,
            queue_player_ids: [],
            play_state: "paused",
            status: "waiting",
          }
        : state.snapshot,
      answerDraft: initialAnswerDraft,
      judgeDraft: initialJudgeDraft,
    })),
  reset: () =>
    set({
      snapshot: null,
      scores: [],
      identity: null,
      answerDraft: initialAnswerDraft,
      judgeDraft: initialJudgeDraft,
    }),
}));

export default useRoomStateStore;
