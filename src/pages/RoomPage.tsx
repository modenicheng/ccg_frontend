import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { WS } from "../wsClient";
import { EventType, GameEventId } from "../types/eventTypes";
import { heartbeatHandler, startHeartbeat } from "../wsClient/handlers";
import useWebSocketStore from "../stores/webSocketStore";
import useErrorToastStore from "../stores/errorToastStore";
import usePersistStore from "../stores/persistStore";
import { gameStore, useGameStore } from "../stores/gameStore";
import { audioPlayer } from "../audioPlayer";
import { useIsOwner, useAudioContextInterceptor } from "../hooks";
import type { RoomState, PlayerScore } from "../types/store";
import {
  SongInfoCard,
  SettingDialog,
  JudgingDialog,
  ConfirmAnswerDialog,
  RemovePlayerDialog,
  AnswerModal,
  AnswerModalFloatingButton,
  VolumeToast,
  ConnectionStatusBar,
  OwnerControls,
  RoomInfo,
  BuzzButton,
  Scoreboard,
  PlayerList,
  PlayerAnswersTable,
  RoundSummaryDialog,
} from "../components";
import type {
  WsTagGroup,
  WsPlayer,
  AnswerQueueItem,
  RoomStateMessage,
  PlayControlMessage,
  AttemptAnswerMessage,
  AnswerQueueMessage,
  YourTurnMessage,
  AnswerBroadcastMessage,
  RoundStartMessage,
  StartPosUpdateMessage,
  GameOverMessage,
  ClearAnswerQueueMessage,
  KickUserMessage,
  PreloadAudioMessage,
  TagsUpdateMessage,
  TagGroupsUpdateMessage,
  TagGroupMessage,
  RoundAnswerItem,
  ShowSongMessage,
  PlaybackState,
} from "../types/wsMessages";
import {
  isPlayControlData,
  mapStatusCodeToStatus,
  getPlayersSimple,
  getTagGroupsSimple,
} from "../types/wsMessages";
import { syncRoomAuthCookie, syncRoomAuthToSession } from "../utils/roomAuth";
import { readCookie, clearCookie, copyTextToClipboard, parseErrorMessage } from "../utils/common";

const development = import.meta.env.DEV;
const WS_RETRY = { max: 10 };
const AUDIO_SYNC_THRESHOLD_MS = 20;
const CANVAS_INIT_DELAY_MS = 0;
const PRELOAD_DEDUP_WINDOW_MS = 3000;
const VOLUME_HOTKEY_STEP = 5;
const VOLUME_TOAST_HIDE_DELAY_MS = 3000;
const VOLUME_TOAST_EXIT_ANIMATION_MS = 220;
const ROOM_ID_COPY_FEEDBACK_MS = 1800;
const ROUND_SUMMARY_AUTO_CLOSE_MS = 8000;

let domProgressPercent = 0;

const logAudioTrigger = (
  source: "PRELOAD" | "ROOM_STATE" | "ROUND_START",
  url: string,
) => {
  if (!development) {
    return;
  }
  const ts = Date.now();
  console.debug(`[AUDIO_TRIGGER] source=${source} url=${url} ts=${ts}`);
};

const getActiveAnswerQueue = (
  queue: AnswerQueueItem[],
  answerQueueTailPlayerId: number | null,
) => {
  if (answerQueueTailPlayerId === null) {
    return queue;
  }

  const tailIndex = queue.findIndex(
    (item) => item.player_id === answerQueueTailPlayerId,
  );
  if (tailIndex < 0 || tailIndex + 1 >= queue.length) {
    return [];
  }
  return queue.slice(tailIndex + 1);
};

const buildWsUrl = (roomId: string, token: string | null) => {
  const encodedRoomId = encodeURIComponent(roomId);
  // const baseOrigin = development
  //   ? ((import.meta.env.VITE_BACKEND_ORIGIN as string | undefined) ??
  //     "http://localhost:8000")
  //   : window.location.origin;

  // const url = new URL(baseOrigin);
  // url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const pathname = `/ws/${encodedRoomId}`;
  // url.search = token ? `token=${encodeURIComponent(token)}` : "";
  // return url.toString();
  return pathname + (token ? `?token=${encodeURIComponent(token)}` : "");
};

const clearRoomIdentityStorage = (roomId: string) => {
  const tokenKey = `ccg-room-token:${roomId}`;
  const userIdKey = `ccg-room-user-id:${roomId}`;
  const usernameKey = `ccg-room-username:${roomId}`;

  sessionStorage.removeItem(tokenKey);
  sessionStorage.removeItem(userIdKey);
  sessionStorage.removeItem(usernameKey);

  clearCookie(tokenKey);
  clearCookie(userIdKey);
  clearCookie(usernameKey);
};

const buildRankMap = (scores: PlayerScore[]) => {
  const sortedScores = [...scores].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.player_id - b.player_id;
  });

  const rankMap: Record<number, number> = {};
  sortedScores.forEach((entry, index) => {
    rankMap[entry.player_id] = index + 1;
  });

  return rankMap;
};

const applyScoreDeltaUpdate = (
  previousScores: PlayerScore[],
  deltaScores: Array<{ player_id: number; username: string; score: number }>,
) => {
  const previousByPlayerId = new Map<number, PlayerScore>(
    previousScores.map((item) => [item.player_id, item]),
  );

  const nextByPlayerId = new Map<number, PlayerScore>(
    previousScores.map((item) => [item.player_id, { ...item }]),
  );

  deltaScores.forEach((item) => {
    const previous = previousByPlayerId.get(item.player_id);
    const nextTotal = (previous?.score ?? 0) + item.score;
    nextByPlayerId.set(item.player_id, {
      player_id: item.player_id,
      username: item.username || previous?.username || `玩家${item.player_id}`,
      score: nextTotal,
    });
  });

  return Array.from(nextByPlayerId.values());
};

const isAnsweringOrJudgingRoundState = (roundState: number | string) => {
  return (
    roundState === 2 ||
    roundState === 3 ||
    roundState === 4 ||
    roundState === "ANSWERING" ||
    roundState === "JUDGING" ||
    roundState === "COMPLETED"
  );
};

const mergeRoundAnswersFromRoomState = (
  incomingRoundAnswers: RoundAnswerItem[],
  previousRoundAnswers: RoundAnswerItem[],
  roundState: number | string,
) => {
  if (!isAnsweringOrJudgingRoundState(roundState)) {
    return incomingRoundAnswers;
  }

  if (incomingRoundAnswers.length === 0) {
    return previousRoundAnswers;
  }

  const mergedByPlayerId = new Map<number, RoundAnswerItem>(
    previousRoundAnswers.map((answer) => [answer.player_id, answer]),
  );

  incomingRoundAnswers.forEach((answer) => {
    mergedByPlayerId.set(answer.player_id, answer);
  });

  return Array.from(mergedByPlayerId.values()).sort(
    (a, b) => a.order - b.order,
  );
};

function RoomPage() {
  const { roomid } = useParams();
  const roomId = roomid?.trim() ?? "";

  const wsRef = useRef<WS | undefined>(undefined);
  const {
    isConnected,
    latencyAvg,
    setConnected,
    setUrl,
    setRoomId,
    setWsClient,
    getCalibratedNow,
  } = useWebSocketStore();
  const {
    theme,
    setTheme,
    volume: persistVolume,
    setVolume: setPersistVolume,
    getRoomUser,
    addUser,
    removeUser,
  } = usePersistStore();
  const user = getRoomUser(roomId);
  const pushToast = useErrorToastStore((state) => state.pushToast);
  const fallbackUserIdFromSession = Number.parseInt(
    sessionStorage.getItem(`ccg-room-user-id:${roomId}`) ?? "",
    10,
  );
  const fallbackUserIdFromCookie = Number.parseInt(
    readCookie(`ccg-room-user-id:${roomId}`) ?? "",
    10,
  );
  const tokenFromSession =
    sessionStorage.getItem(`ccg-room-token:${roomId}`)?.trim() || null;
  const tokenFromCookie = readCookie(`ccg-room-token:${roomId}`)?.trim() || null;
  const tokenFromPersist = user?.token?.trim() || null;
  const usernameFromSession =
    sessionStorage.getItem(`ccg-room-username:${roomId}`)?.trim() || null;
  const usernameFromCookie =
    readCookie(`ccg-room-username:${roomId}`)?.trim() || null;
  const usernameFromPersist = user?.username?.trim() || null;
  const wsAuthToken = tokenFromSession ?? tokenFromCookie ?? tokenFromPersist;
  const wsAuthUsername =
    usernameFromSession ?? usernameFromCookie ?? usernameFromPersist;
  const userId =
    user?.id ??
    (Number.isFinite(fallbackUserIdFromSession)
      ? fallbackUserIdFromSession
      : null) ??
    (Number.isFinite(fallbackUserIdFromCookie)
      ? fallbackUserIdFromCookie
      : null);

  const [localVolume, setLocalVolume] = useState<number>(persistVolume);
  const initialVolumeRef = useRef<number>(persistVolume);
  const roomState = useGameStore((state) => state.roomState);
  const scores = useGameStore((state) => state.scores);
  const [roomOwner, setRoomOwner] = useState<string>("-");
  const [tagGroups, setTagGroups] = useState<WsTagGroup[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<WsPlayer[]>([]);
  const [answerOrderByUserId, setAnswerOrderByUserId] = useState<
    Record<number, number>
  >({});
  const [selectedTagByGroup, setSelectedTagByGroup] = useState<
    Record<number, number | null>
  >({});
  const [isJudging, setIsJudging] = useState<boolean>(false);
  const [hasJudgingSubmitted, setHasJudgingSubmitted] = useState<boolean>(false);
  const [description, setDescription] = useState<string>("");
  const [currentSong, setCurrentSong] = useState<{
    title: string;
    artist: string;
    album: string;
    coverUrl: string;
    platformUrl?: string;
  } | null>(null);
  const [selectedTags, setSelectedTags] = useState<
    Record<number, number | null>
  >({});
  const [selectedDescriptions, setSelectedDescriptions] = useState<number[]>(
    [],
  );
  const [historyTagIds, setHistoryTagIds] = useState<number[]>([]);
  const [referenceDescriptions, setReferenceDescriptions] = useState<string[]>(
    [],
  );
  const [playerDescriptions, setPlayerDescriptions] = useState<
    Array<{ id: number; username: string; description: string }>
  >([]);

  // 窗口 focus 状态 - 用于控制音频音量（每个客户端独立处理）
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(true);

  // 玩家作答情况状态
  const [playerAnswers, setPlayerAnswers] = useState<
    Array<{
      playerId: number;
      username: string;
      answers: Record<number, number | null>; // tagGroupId -> tagId
      description: string;
      order: number;
    }>
  >([]);

  // 答题弹窗状态
  const [isAnswerModalOpen, setIsAnswerModalOpen] = useState<boolean>(false);
  const [isAnswerModalMinimized, setIsAnswerModalMinimized] =
    useState<boolean>(false);
  const [currentAnsweringPlayer, setCurrentAnsweringPlayer] = useState<
    number | null
  >(null);
  const answerModalRef = useRef<HTMLDialogElement | null>(null);

  // 准备和倒计时状态
  // const [isReady, setIsReady] = useState<boolean>(false);
  // const [setCountdown] = useState<number | null>(null);

  const isOwner = useIsOwner(user, userId, roomState);
  const {
    showAudioPrompt,
    handleAudioPromptClick,
    closeAudioPrompt,
    setupAudioPlayerInterceptor,
  } = useAudioContextInterceptor();

  const selectGroupTag = (groupId: number, tagId: number) => {
    setSelectedTagByGroup((prev) => ({
      ...prev,
      [groupId]: tagId,
    }));
  };

  const navigate = useNavigate();

  useEffect(() => {
    if (roomId) {
      const roomTitle = roomState?.title;
      document.title = roomTitle
        ? `CCG - 房间${roomTitle}|${roomId}`
        : `CCG - 房间${roomId}`;
    }
  }, [roomId, roomState?.title]);

  const audioRef = useRef<audioPlayer | null>(null);
  const isOwnerRef = useRef<boolean>(false);
  const userIdRef = useRef<number | null>(userId);
  const switchingAudioUrlRef = useRef<string | null>(null);
  const recentPreloadByUrlRef = useRef<Record<string, number>>({});
  const sendPlaybackControlRef = useRef<
    (event: (typeof GameEventId)["PLAY" | "PAUSE" | "SEEK"]) => Promise<void>
  >(async () => {});
  const [audioState, setAudioState] = useState<string>("suspended");
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const shouldForcePlaybackResyncRef = useRef<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasParentRef = useRef<HTMLDivElement | null>(null);
  const canvasInitializedRef = useRef(false);
  const canvasInitTimerRef = useRef<number | null>(null);

  const settingDialogRef = useRef<HTMLDialogElement | null>(null);
  const judgingDialogRef = useRef<HTMLDialogElement | null>(null);
  const confirmAnswerDialogRef = useRef<HTMLDialogElement | null>(null);
  const removePlayerDialogRef = useRef<HTMLDialogElement | null>(null);
  const [playerToRemove, setPlayerToRemove] = useState<number | null>(null);

  const progressBarRef = useRef<HTMLSpanElement | null>(null);
  const isProgressDraggingRef = useRef(false);
  const [isBuzzHotkeyActive, setIsBuzzHotkeyActive] = useState(false);
  const [isVolumeToastVisible, setIsVolumeToastVisible] =
    useState<boolean>(false);
  const [isVolumeToastClosing, setIsVolumeToastClosing] =
    useState<boolean>(false);
  const [roomIdCopyState, setRoomIdCopyState] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [isRoundSummaryOpen, setIsRoundSummaryOpen] = useState<boolean>(false);
  const [roundSummary, setRoundSummary] = useState<{
    roundScore: number;
    rankChange: number | null;
    currentRank: number | null;
  } | null>(null);
  const [lastJudgedAnswers, setLastJudgedAnswers] = useState<{
    correctTags: Array<{
      groupId: number;
      groupName: string;
      tagId: number;
      tagName: string;
    }>;
    correctDescriptionIds: number[];
  } | null>(null);
  const volumeToastHideTimerRef = useRef<number | null>(null);
  const volumeToastExitTimerRef = useRef<number | null>(null);
  const roomIdCopyTimerRef = useRef<number | null>(null);
  const isPlaybackStateMissing = roomState?.playback_status === null;
  const isWsDisconnected = !isConnected;

  const closeRoundSummaryDialog = useCallback(() => {
    setIsRoundSummaryOpen(false);
  }, []);

  // 窗口 focus 检测 - 用于控制音频音量（每个客户端独立处理）
  useEffect(() => {
    const handleFocus = () => {
      setIsWindowFocused(true);
    };
    const handleBlur = () => {
      setIsWindowFocused(false);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // 也监听 visibilitychange（处理标签页切换）
    const handleVisibilityChange = () => {
      const focused = !document.hidden;
      setIsWindowFocused(focused);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const notifyAudioLoadError = useCallback((message: string) => {
    pushToast({ message, variant: "error" });
  }, [pushToast]);

  /**
   * 向后端报告音频错误（如加载失败）
   * 后端收到此消息后，应暂停游戏并通知所有客户端
   */
  const reportAudioError = useCallback(
    async (errorType: "load_failed" | "sync_failed", reason: string) => {
      if (!wsRef.current?.isConnected()) {
        console.error("[AUDIO_ERROR_REPORT] WebSocket not connected, cannot report error");
        return;
      }

      try {
        const payload = {
          event: 255, // Custom error event ID for audio issues
          ts: Math.round(getCalibratedNow()),
          data: {
            error_type: errorType,
            reason,
            audio_url: currentAudioUrlRef.current || "unknown",
          },
        };

        console.warn("[AUDIO_ERROR_REPORT] Reporting error to backend:", payload);
        await wsRef.current.sendJson(payload);
      } catch (err) {
        console.error("[AUDIO_ERROR_REPORT] Failed to send error report:", err);
      }
    },
    [getCalibratedNow],
  );

  const syncAnswerQueueState = useCallback((
    queue: AnswerQueueItem[],
    answerQueueTailPlayerId: number | null,
  ) => {
    const activeQueue = getActiveAnswerQueue(queue, answerQueueTailPlayerId);

    setAnswerOrderByUserId(
      activeQueue.reduce<Record<number, number>>((acc, item, index) => {
        const order = item.order ?? index + 1;
        acc[item.player_id] = order;
        return acc;
      }, {}),
    );

    const answeringPlayer = activeQueue.find((item) => item.is_answering)
      ?.player_id ?? null;
    setCurrentAnsweringPlayer(answeringPlayer);

    const currentUserId = userIdRef.current;
    if (answeringPlayer === currentUserId) {
      setIsAnswerModalOpen(true);
      setIsAnswerModalMinimized(false);
    } else {
      setIsAnswerModalOpen(false);
    }

    const latestRoomState = gameStore.getState().roomState;
    if (latestRoomState) {
      gameStore.getState().setRoomState({
        ...latestRoomState,
        answer_queue: queue,
        answer_queue_tail_player_id: answerQueueTailPlayerId,
      });
    }
  }, [userIdRef]);

  const syncPlaybackStatusToRoomState = useCallback(
    (nextPlaybackStatus: PlaybackState) => {
      const latestRoomState = gameStore.getState().roomState;
      if (!latestRoomState) {
        return;
      }

      gameStore.getState().setRoomState({
        ...latestRoomState,
        playback_status: nextPlaybackStatus,
        playProgress: nextPlaybackStatus.progress_ms,
      });
    },
    [],
  );

  const buildPlaybackStatusFromPlayControl = useCallback(
    (message: PlayControlMessage): PlaybackState | null => {
      if (!isPlayControlData(message?.data)) {
        return null;
      }

      const latestRoomState = gameStore.getState().roomState;
      const previousPlaybackStatus = latestRoomState?.playback_status;

      let playState: PlaybackState["play_state"];
      if (message.event === GameEventId.PLAY) {
        playState = "playing";
      } else if (message.event === GameEventId.PAUSE) {
        playState = "paused";
      } else {
        playState = previousPlaybackStatus?.play_state ?? "paused";
      }

      const audioUrl =
        message.data.audio_url ??
        previousPlaybackStatus?.audio_url ??
        currentAudioUrlRef.current ??
        null;

      return {
        progress_ms: Math.max(0, message.data.progress_ms),
        updated_at: message.ts,
        offset_ts:
          typeof message.data.offset_ts === "number"
            ? Math.max(0, message.data.offset_ts)
            : message.ts,
        play_state: playState,
        current_order:
          typeof message.data.current_order === "number"
            ? message.data.current_order
            : previousPlaybackStatus?.current_order ?? 0,
        audio_url: audioUrl,
      };
    },
    [],
  );

  const addAttemptOrder = useCallback((userId: number) => {
    setAnswerOrderByUserId((prev) => {
      if (prev[userId]) {
        return prev;
      }
      const nextOrder = Math.max(0, ...Object.values(prev)) + 1;
      return {
        ...prev,
        [userId]: nextOrder,
      };
    });
  }, []);

  /**
   * 尝试使用重试机制加载音频流
   * 失败 2 次后自动向后端报告错误
   */
  const tryPlayUrlWithRetry = useCallback(
    async (url: string, maxRetries: number = 2): Promise<boolean> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          await audioRef.current?.playUrlAsStream(url, false);
          console.log(`[TRY_PLAY_URL] Successfully loaded audio on attempt ${attempt + 1}, waiting for canplaythrough...`);
          // 等待音频加载完成（最多等待 5 秒）
          const loaded = await audioRef.current?.waitForCanPlayThrough(5000);
          console.log(`[TRY_PLAY_URL] waitForCanPlayThrough result:`, loaded);
          if (loaded) {
            return true;
          }
          console.warn(`[TRY_PLAY_URL] Audio not ready after canplaythrough check, attempt ${attempt + 1}/${maxRetries}`);
        } catch (err) {
          console.error(
            `[TRY_PLAY_URL] Attempt ${attempt + 1}/${maxRetries} failed:`,
            (err as Error).message,
          );
        }
        // 若不是最后一次尝试，等待 500ms 后重试
        if (attempt < maxRetries - 1) {
          console.log(`[TRY_PLAY_URL] Retrying in 500ms...`);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // 所有重试都失败了，报告错误给后端
      await reportAudioError(
        "load_failed",
        `Failed to load audio URL after ${maxRetries} attempts: ${url}`,
      );
      return false;
    },
    [reportAudioError],
  );

  const sortedOnlinePlayers = useMemo(() => {
    return [...onlinePlayers].sort((a, b) => {
      const aOrder = answerOrderByUserId[a.id];
      const bOrder = answerOrderByUserId[b.id];
      const aHasOrder = typeof aOrder === "number";
      const bHasOrder = typeof bOrder === "number";

      if (aHasOrder && bHasOrder) {
        return aOrder - bOrder;
      }
      if (aHasOrder) {
        return -1;
      }
      if (bHasOrder) {
        return 1;
      }
      // 没有答题顺序时在线优先
      if (a.online !== b.online) {
        return a.online ? -1 : 1;
      }
      return a.id - b.id;
    });
  }, [answerOrderByUserId, onlinePlayers]);

  const buzzedPlayerIds = useMemo(() => {
    const queue = roomState?.answer_queue ?? [];
    const tailPlayerId = roomState?.answer_queue_tail_player_id ?? null;
    if (tailPlayerId === null) {
      return [];
    }

    const tailIndex = queue.findIndex((item) => item.player_id === tailPlayerId);
    if (tailIndex < 0) {
      return [];
    }

    return queue.slice(0, tailIndex + 1).map((item) => item.player_id);
  }, [roomState?.answer_queue, roomState?.answer_queue_tail_player_id]);

  const buzzedOrderByUserId = useMemo(() => {
    const queue = roomState?.answer_queue ?? [];
    const tailPlayerId = roomState?.answer_queue_tail_player_id ?? null;
    if (tailPlayerId === null) {
      return {};
    }

    const tailIndex = queue.findIndex((item) => item.player_id === tailPlayerId);
    if (tailIndex < 0) {
      return {};
    }

    return queue.slice(0, tailIndex + 1).reduce<Record<number, number>>((acc, item, index) => {
      acc[item.player_id] = item.order ?? index + 1;
      return acc;
    }, {});
  }, [roomState?.answer_queue, roomState?.answer_queue_tail_player_id]);

  const isCurrentPlayerInAnswerQueue = useMemo(() => {
    if (userId === null) {
      return false;
    }

    const inRoomStateQueue =
      roomState?.answer_queue?.some((item) => item.player_id === userId) ??
      false;
    const inLocalOrder = typeof answerOrderByUserId[userId] === "number";

    return inRoomStateQueue || inLocalOrder;
  }, [answerOrderByUserId, roomState?.answer_queue, userId]);

  const handleBuzz = useCallback(() => {
    if (!isConnected) {
      console.debug("[buzz] skip: not connected");
      return;
    }

    if (!wsRef.current?.isConnected()) {
      console.debug("[buzz] skip: wsRef not connected");
      return;
    }

    if (roomState?.status !== "playing") {
      console.debug("[buzz] skip: room not in playing state");
      return;
    }

    if (userId === null) {
      console.debug("[buzz] skip: missing userId from persist/session/cookie");
      return;
    }

    addAttemptOrder(userId);

    // 乐观控制：本地先暂停，后续再以服务端 PAUSE 事件为准进行校准
    if (audioRef.current?.state === "running") {
      void audioRef.current.pause();
    }

    const calibratedNow = Math.round(getCalibratedNow());
    const currentProgressMs = Math.max(
      0,
      Math.round(audioRef.current?.currentTimeMs ?? 0),
    );
    const payload: AttemptAnswerMessage = {
      event: GameEventId.ATTEMPT_ANSWER,
      ts: calibratedNow,
      data: {
        offset_ts: calibratedNow,
        progress_ms: currentProgressMs,
        user_id: userId,
      },
    };

    void wsRef.current.sendJson(payload);
  }, [addAttemptOrder, getCalibratedNow, isConnected, userId, roomState?.status]);

  const handleSubmitAnswer = useCallback(() => {
    if (!isConnected || !wsRef.current?.isConnected() || userId === null) {
      return;
    }

    // 收集选中的标签ID
    const selectedTagIds = Object.values(selectedTagByGroup).filter(
      (tagId): tagId is number => tagId !== null,
    );

    const payload = {
      event: GameEventId.SUBMIT_ANSWER,
      ts: Math.round(getCalibratedNow()),
      data: {
        selected_tag_ids: selectedTagIds,
        description_text: description,
      },
    };

    void wsRef.current.sendJson(payload);
    setIsAnswerModalOpen(false);
    setIsAnswerModalMinimized(false);
  }, [isConnected, getCalibratedNow, userId, selectedTagByGroup, description]);

  const toggleAnswerModal = useCallback(() => {
    setIsAnswerModalMinimized(!isAnswerModalMinimized);
  }, [isAnswerModalMinimized]);

  // const handleReady = useCallback(() => {
  //   if (!isConnected || !wsRef.current?.isConnected() || userId === null) {
  //     return;
  //   }

  //   const payload = {
  //     event: GameEventId.PLAYER_READY,
  //     ts: Math.round(getCalibratedNow()),
  //     data: {
  //       user_id: userId,
  //       ready: !isReady,
  //     },
  //   };

  //   void wsRef.current.sendJson(payload);
  // }, [isConnected, getCalibratedNow, userId, isReady]);

  const handleRemovePlayer = useCallback(
    (playerId: number) => {
      if (
        !isConnected ||
        !wsRef.current?.isConnected() ||
        !isOwner ||
        playerId === userId
      ) {
        return;
      }

      setPlayerToRemove(playerId);
      removePlayerDialogRef.current?.showModal();
    },
    [isConnected, isOwner, userId],
  );

  const confirmRemovePlayer = useCallback(() => {
    if (
      !isConnected ||
      !wsRef.current?.isConnected() ||
      !isOwner ||
      playerToRemove === null
    ) {
      return;
    }

    const payload = {
      event: GameEventId.KICK_USER,
      ts: Math.round(getCalibratedNow()),
      data: {
        user_id: playerToRemove,
      },
    };

    void wsRef.current.sendJson(payload);
    removePlayerDialogRef.current?.close();
    setPlayerToRemove(null);
  }, [isConnected, getCalibratedNow, isOwner, playerToRemove]);

  const handleGameStart = useCallback(() => {
    if (
      !isOwner ||
      !wsRef.current?.isConnected() ||
      roomState?.statusCode !== 0
    ) {
      return;
    }

    const payload = {
      event: GameEventId.GAME_START,
      ts: Math.round(getCalibratedNow()),
      data: {},
    };

    void wsRef.current.sendJson(payload);
  }, [getCalibratedNow, roomState?.statusCode, isOwner]);

  const sendPlaybackControl = useCallback(
    async (event: (typeof GameEventId)["PLAY" | "PAUSE" | "SEEK"]) => {
      if (!isOwner || !wsRef.current?.isConnected() || !audioRef.current) {
        return;
      }

      if (event === GameEventId.PLAY) {
        await audioRef.current.resume();
      } else if (event === GameEventId.PAUSE) {
        await audioRef.current.pause();
      }

      const latestRoomState = gameStore.getState().roomState;
      const resolvedAudioUrl =
        currentAudioUrl ||
        currentAudioUrlRef.current ||
        audioRef.current.getCurrentUrl?.() ||
        latestRoomState?.playback_status?.audio_url ||
        null;

      // 若没有有效的音频URL，不发送播放控制消息
      if (!resolvedAudioUrl) {
        console.error("[PLAY_CONTROL] Cannot send playback control: no valid audio_url available");
        return;
      }

      if (resolvedAudioUrl !== currentAudioUrlRef.current) {
        currentAudioUrlRef.current = resolvedAudioUrl;
      }
      if (resolvedAudioUrl !== currentAudioUrl) {
        setCurrentAudioUrl(resolvedAudioUrl);
      }

      const progressMs = audioRef.current.currentTimeMs;
      const calibratedNow = Math.round(getCalibratedNow());
      const latestPlaybackStatus = latestRoomState?.playback_status;
      const payload: PlayControlMessage = {
        event,
        ts: calibratedNow,
        data: {
          progress_ms: progressMs,
          offset_ts: calibratedNow,
          audio_url: resolvedAudioUrl,
          current_order:
            typeof latestPlaybackStatus?.current_order === "number"
              ? latestPlaybackStatus.current_order
              : 0,
        },
      };

      await wsRef.current.sendJson(payload);
    },
    [getCalibratedNow, isOwner, currentAudioUrl],
  );

  const handleTogglePlayPause = useCallback(() => {
    if (isPlaybackStateMissing) {
      return;
    }
    const nextEvent =
      audioState === "running" ? GameEventId.PAUSE : GameEventId.PLAY;
    void sendPlaybackControl(nextEvent);
  }, [audioState, isPlaybackStateMissing, sendPlaybackControl]);

  const handleJudgeSubmit = useCallback(() => {
    if (!wsRef.current?.isConnected() || !isOwner) {
      return;
    }

    // 收集选中的标签ID
    const correctTagIds = Object.values(selectedTags).filter(
      (tagId): tagId is number => tagId !== null,
    );

    // 收集选中的描述ID
    const correctDescriptionIds = selectedDescriptions;

    // 解析标签名称用于后续显示
    const resolvedCorrectTags: Array<{
      groupId: number;
      groupName: string;
      tagId: number;
      tagName: string;
    }> = [];
    for (const [groupId, tagId] of Object.entries(selectedTags)) {
      if (tagId !== null) {
        const group = tagGroups.find((g) => g.id === Number(groupId));
        const tag = group?.tags.find((t) => t.id === tagId);
        resolvedCorrectTags.push({
          groupId: Number(groupId),
          groupName: group?.name ?? "",
          tagId,
          tagName: tag?.name ?? "",
        });
      }
    }

    setLastJudgedAnswers({
      correctTags: resolvedCorrectTags,
      correctDescriptionIds,
    });

    const payload = {
      event: GameEventId.JUDGE_SUBMIT,
      ts: Math.round(getCalibratedNow()),
      data: {
        correct_tags: correctTagIds,
        correct_description_ids: correctDescriptionIds,
        new_correct_descriptions: [],
        skip_scoring: false,
      },
    };

    void wsRef.current.sendJson(payload);
    setHasJudgingSubmitted(true);
    judgingDialogRef.current?.close();
    confirmAnswerDialogRef.current?.close();
  }, [selectedTags, selectedDescriptions, tagGroups, getCalibratedNow, isOwner]);

  const handleSkipRound = useCallback(() => {
    if (!wsRef.current?.isConnected() || !isOwner) {
      return;
    }

    const payload = {
      event: GameEventId.SKIP_ROUND,
      ts: Math.round(getCalibratedNow()),
      data: {},
    };

    void wsRef.current.sendJson(payload);
  }, [getCalibratedNow, isOwner]);

  const handleEndRound = useCallback(() => {
    if (!wsRef.current?.isConnected() || !isOwner) {
      return;
    }

    // 发送 JUDGING 事件，触发判分流程
    const payload = {
      event: GameEventId.JUDGING,
      ts: Math.round(getCalibratedNow()),
      data: {},
    };

    void wsRef.current.sendJson(payload);
  }, [getCalibratedNow, isOwner]);

  const handleShowSong = useCallback(() => {
    if (!wsRef.current?.isConnected() || !isOwner) {
      return;
    }

    const payload = {
      event: GameEventId.SHOW_SONG,
      ts: Math.round(getCalibratedNow()),
      data: {},
    };

    void wsRef.current.sendJson(payload);
  }, [getCalibratedNow, isOwner]);

  const resetRoundTransientState = useCallback(() => {
    setAnswerOrderByUserId({});
    setPlayerAnswers([]);
    setCurrentAnsweringPlayer(null);
    setIsAnswerModalOpen(false);
    setIsAnswerModalMinimized(false);
    setDescription("");
    setSelectedDescriptions([]);
    setHistoryTagIds([]);
    setReferenceDescriptions([]);
    setPlayerDescriptions([]);
    setCurrentSong(null);
    setIsJudging(false);
    setHasJudgingSubmitted(false);

    const latestRoomState = gameStore.getState().roomState;
    if (latestRoomState) {
      gameStore.getState().setRoomState({
        ...latestRoomState,
        show_answer: false,
      });
    }

    setSelectedTags({});
    setSelectedTagByGroup((prev) => {
      const next: Record<number, number | null> = {};
      Object.keys(prev).forEach((key) => {
        next[Number(key)] = null;
      });
      return next;
    });

    judgingDialogRef.current?.close();
    confirmAnswerDialogRef.current?.close();
    answerModalRef.current?.close();
  }, []);

  const handleSelectJudgingTag = (groupId: number, tagId: number) => {
    setSelectedTags((prev) => ({
      ...prev,
      [groupId]: tagId,
    }));
  };

  const handleToggleDescription = (descriptionId: number) => {
    setSelectedDescriptions((prev) => {
      if (prev.includes(descriptionId)) {
        return prev.filter((id) => id !== descriptionId);
      } else {
        return [...prev, descriptionId];
      }
    });
  };

  const applyRemoteProgress = useCallback(
    (message: PlayControlMessage, force = false) => {
      if (!audioRef.current) {
        return;
      }

      if (!isPlayControlData(message?.data)) {
        return;
      }

      const controlData = message.data;

      if (isProgressDraggingRef.current) {
        return;
      }

      const isPauseEvent = message.event === GameEventId.PAUSE;
      let expectedMs = Math.max(0, controlData.progress_ms);

      // PLAY/SEEK 才按 offset_ts 外推；PAUSE 表示"冻结时刻"，不应继续累加 elapsed
      if (!isPauseEvent) {
        const now = getCalibratedNow();
        const offsetTs =
          typeof controlData.offset_ts === "number" && controlData.offset_ts > 0
            ? controlData.offset_ts
            : message.ts;
        const elapsed = Math.max(0, now - offsetTs);
        expectedMs = Math.max(0, controlData.progress_ms + elapsed);
      }

      const localMs = audioRef.current.currentTimeMs;
      const shouldSeek =
        force || Math.abs(localMs - expectedMs) > AUDIO_SYNC_THRESHOLD_MS;

      const latestRoomState = gameStore.getState().roomState;
      const shouldSeekOnPause =
        latestRoomState?.status === "waiting" ||
        latestRoomState?.playback_status?.current_order === -1;

      // 对局中 PAUSE 继续保持“默认不 seek”，避免抢答时回拉；
      // 但预热 BGM / test audio（waiting 或 current_order=-1）必须 seek 才能实现房主与玩家暂停位点同步。
      if (shouldSeek && (!isPauseEvent || shouldSeekOnPause)) {
        const durationMs = audioRef.current.durationMs;
        const clamped =
          durationMs > 0 ? Math.min(expectedMs, durationMs) : expectedMs;
        audioRef.current.progressMs = clamped;
      }
    },
    [getCalibratedNow],
  );

  useEffect(() => {
    currentAudioUrlRef.current = currentAudioUrl;
  }, [currentAudioUrl]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const switchAudioSourceIfNeeded = useCallback(
    async (nextAudioUrl: string) => {
      const player = audioRef.current;
      if (!player) {
        return;
      }

      if (nextAudioUrl === currentAudioUrlRef.current) {
        return;
      }

      if (switchingAudioUrlRef.current === nextAudioUrl) {
        return;
      }

      const previousAudioUrl = currentAudioUrlRef.current;
      switchingAudioUrlRef.current = nextAudioUrl;
      currentAudioUrlRef.current = nextAudioUrl;

      try {
        await player.playUrlAsStream(nextAudioUrl, false);
        setCurrentAudioUrl(nextAudioUrl);
      } catch (error) {
        currentAudioUrlRef.current = previousAudioUrl;
        throw error;
      } finally {
        if (switchingAudioUrlRef.current === nextAudioUrl) {
          switchingAudioUrlRef.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    isOwnerRef.current = isOwner;
  }, [isOwner]);

  useEffect(() => {
    if (!isConnected) {
      shouldForcePlaybackResyncRef.current = true;
    }
  }, [isConnected]);

  useEffect(() => {
    sendPlaybackControlRef.current = sendPlaybackControl;
  }, [sendPlaybackControl]);

  useEffect(() => {
    if (!roomId || !wsAuthToken) {
      return;
    }

    let isDisposed = false;

    if (userId !== null && wsAuthUsername) {
      const wsIdentity = {
        id: userId,
        token: wsAuthToken,
        username: wsAuthUsername,
      };
      syncRoomAuthToSession(roomId, wsIdentity);
      syncRoomAuthCookie(roomId, wsIdentity);
    }

    const wsUrl = buildWsUrl(roomId, wsAuthToken);

    wsRef.current = new WS(wsUrl, WS_RETRY);
    setWsClient(wsRef.current);

    // 确保AudioContext处于运行状态（满足浏览器自动播放政策）
    audioRef.current?.ensureRunning().catch((err) => {
      console.error("[WS_INIT] Failed to ensure AudioContext running:", err);
    });

    wsRef.current.on(EventType.HEARTBEAT, heartbeatHandler);
    wsRef.current.onJsonEvent<RoomStateMessage>(
      GameEventId.ROOM_STATE,
      async (message) => {
        if (isDisposed) {
          return;
        }
        const payload = message.data;
        const previousRoundAnswers =
          gameStore.getState().roomState?.round_answers ?? [];
        const mergedRoundAnswers = mergeRoundAnswersFromRoomState(
          payload.round_answers ?? [],
          previousRoundAnswers,
          payload.round_state,
        );

        // 使用 ROOM_STATE 作为权威来源，自动纠正本地持久化身份（尤其是 isOwner）
        const currentUserId = userIdRef.current;
        if (typeof currentUserId === "number" && wsAuthToken) {
          const selfPlayer = payload.players.find((player) => player.id === currentUserId);
          if (selfPlayer) {
            const persistedUser = usePersistStore.getState().getRoomUser(payload.room_id);
            const shouldUpdatePersistUser =
              !persistedUser ||
              persistedUser.id !== selfPlayer.id ||
              persistedUser.username !== selfPlayer.username ||
              persistedUser.token !== wsAuthToken ||
              persistedUser.isOwner !== selfPlayer.is_owner;

            if (shouldUpdatePersistUser) {
              addUser({
                id: selfPlayer.id,
                roomId: payload.room_id,
                username: selfPlayer.username,
                token: wsAuthToken,
                isOwner: selfPlayer.is_owner,
              });
            }
          }
        }

        // 从玩家列表中获取房主
        const ownerPlayer = payload.players.find((p) => p.is_owner);
        const hostPlayerId = ownerPlayer ? ownerPlayer.id.toString() : "";

        // 创建兼容性字段
        const playersSimple = getPlayersSimple(payload.players);
        const tagGroupsSimple = getTagGroupsSimple(payload.tag_groups);
        const playProgress = payload.playback_status?.progress_ms || 0;
        const startPositionPercent = payload.song_start_range_percent || 0;

        const nextRoomState: RoomState = {
          // 基础字段
          roomId: payload.room_id,
          title: payload.title,
          status: mapStatusCodeToStatus(payload.status),
          statusCode: payload.status,

          // 回合状态
          roundState:
            typeof payload.round_state === "string"
              ? payload.round_state
              : "PENDING",
          roundStateCode:
            typeof payload.round_state === "number" ? payload.round_state : 0,
          show_answer: payload.show_answer ?? false,

          // 播放相关
          song_start_range_percent: payload.song_start_range_percent,

          // 玩家和队列
          players: payload.players,
          answer_queue: payload.answer_queue,
          answer_queue_tail_player_id: payload.answer_queue_tail_player_id,
          round_scored: payload.round_scored ?? false,
          round_answers: mergedRoundAnswers,

          // 标签系统
          tag_groups: payload.tag_groups,

          // 播放状态
          playback_status: payload.playback_status,

          // 兼容性字段（为现有UI保留）
          description: null,
          hostPlayerId,
          playersSimple,
          tagGroupsSimple,
          playProgress,
          startPositionPercent,
          songQueue: [], // 暂时为空，可能需要从其他数据推导
        };

        gameStore.getState().setRoomState(nextRoomState);

        // 初始化积分表（后端ROOM_STATE中的scores为累计明细，前端展示总分）
        // 注意：这些更新必须在音频同步之前执行，确保即使音频同步失败也能更新关键状态
        const scoreByPlayerId = payload.scores.reduce<Record<number, number>>(
          (acc, item) => {
            const prev = acc[item.player_id] ?? 0;
            acc[item.player_id] = Math.max(prev, item.total_score);
            return acc;
          },
          {},
        );
        gameStore.getState().setScores(
          payload.players.map((player) => ({
            player_id: player.id,
            username: player.username,
            score: scoreByPlayerId[player.id] ?? 0,
          })),
        );

        // 更新本地状态
        const ownerName = ownerPlayer?.username || "-";
        setRoomOwner(ownerName);
        setOnlinePlayers(payload.players);
        setAnswerOrderByUserId(
          payload.answer_queue.reduce<Record<number, number>>((acc, item) => {
            const order =
              item.order ?? acc[item.player_id] ?? Object.keys(acc).length + 1;
            acc[item.player_id] = order;
            return acc;
          }, {}),
        );
        syncAnswerQueueState(
          payload.answer_queue,
          payload.answer_queue_tail_player_id,
        );

        setTagGroups(payload.tag_groups);
        setPlayerAnswers(
          mergedRoundAnswers.map((answer) => ({
            playerId: answer.player_id,
            username: answer.username,
            answers: answer.answers,
            description: answer.description ?? "",
            order: answer.order,
          })),
        );
        setSelectedTagByGroup(
          payload.tag_groups.reduce<Record<number, number | null>>(
            (acc, group) => {
              acc[group.id] = null;
              return acc;
            },
            {},
          ),
        );

        // 同步音频播放器状态（此操作失败不应阻止关键状态更新）
        const playbackStatus = payload.playback_status;
        const audioPlayer = audioRef.current;
        const shouldForcePlaybackResync = shouldForcePlaybackResyncRef.current;
        let didLoadOrRebindAudio = false;

        if (playbackStatus && audioPlayer && !isProgressDraggingRef.current) {
          try {
            const newAudioUrl = playbackStatus.audio_url;

            if (!newAudioUrl) {
              console.warn("[ROOM_STATE_SYNC] Received empty audio_url from backend");
              await reportAudioError(
                "sync_failed",
                "Received empty audio_url from ROOM_STATE",
              );
            } else if (
              shouldForcePlaybackResync ||
              newAudioUrl !== currentAudioUrlRef.current
            ) {
              logAudioTrigger("ROOM_STATE", newAudioUrl);
              const switchSuccess = await tryPlayUrlWithRetry(newAudioUrl, 3);

              if (switchSuccess) {
                currentAudioUrlRef.current = newAudioUrl;
                setCurrentAudioUrl(newAudioUrl);
                didLoadOrRebindAudio = true;
              }
            }

            if (didLoadOrRebindAudio || currentAudioUrlRef.current === playbackStatus.audio_url) {
              const pseudoMessage = {
                event:
                  playbackStatus.play_state === "paused"
                    ? GameEventId.PAUSE
                    : GameEventId.PLAY,
                ts: playbackStatus.updated_at,
                data: {
                  progress_ms: playbackStatus.progress_ms,
                  offset_ts: playbackStatus.offset_ts,
                  audio_url: playbackStatus.audio_url,
                },
              } as PlayControlMessage;

              applyRemoteProgress(pseudoMessage, true);

              if (didLoadOrRebindAudio) {
                await audioPlayer.waitForCanPlayThrough();
                applyRemoteProgress(pseudoMessage, true);
              }

              if (playbackStatus.play_state === "playing") {
                await audioPlayer.resume();
              } else if (playbackStatus.play_state === "paused") {
                await audioPlayer.pause();
              }

              shouldForcePlaybackResyncRef.current = false;
            }
          } catch (error) {
            console.error(
              "[ROOM_STATE_SYNC] Failed to sync audio playback:",
              error,
            );
            await reportAudioError(
              "sync_failed",
              parseErrorMessage(error, "音频同步失败"),
            );
            notifyAudioLoadError(
              parseErrorMessage(error, "音频加载失败，请稍后重试"),
            );
          }
        }
      },
    );
    wsRef.current.onJsonEvent<PlayControlMessage>(
      GameEventId.SEEK,
      (message) => {
        applyRemoteProgress(message, false);
        const nextPlaybackStatus = buildPlaybackStatusFromPlayControl(message);
        if (nextPlaybackStatus) {
          syncPlaybackStatusToRoomState(nextPlaybackStatus);
        }
      },
    );
    wsRef.current.onJsonEvent<PlayControlMessage>(
      GameEventId.PLAY,
      async (message) => {
        console.log("[PLAY_EVENT] Received PLAY event:", message);
        try {
          const nextPlaybackStatus = buildPlaybackStatusFromPlayControl(message);
          console.log("[PLAY_EVENT] Built playback status:", nextPlaybackStatus);
          if (nextPlaybackStatus) {
            syncPlaybackStatusToRoomState(nextPlaybackStatus);
            console.log("[PLAY_EVENT] Synced playback status to room state");
          }

          const audioUrl = message.data.audio_url;
          console.log("[PLAY_EVENT] Target audio URL:", audioUrl);

          // 1. 检查 audioElement 是否已初始化并加载正确的 URL
          if (audioRef.current && audioUrl) {
            const hasAudioElement = audioRef.current.hasAudioElement?.();
            const currentUrl = audioRef.current.getCurrentUrl?.();
            const isPreloaded = audioRef.current.isPreloaded?.(audioUrl);
            
            console.log("[PLAY_EVENT] Audio state check:", {
              hasAudioElement,
              currentUrl,
              targetUrl: audioUrl,
              isPreloaded,
              urlMatches: currentUrl === audioUrl,
            });
            
            // 只有在以下情况才需要加载音频：
            // 1. 还没有 audio element
            // 2. 当前 URL 与目标 URL 不同且未预加载
            if (!hasAudioElement) {
              // 还没有加载音频
              console.log("[PLAY_EVENT] Audio element not initialized, calling playUrlAsStream...");
              await audioRef.current.playUrlAsStream(audioUrl, false);
              console.log("[PLAY_EVENT] playUrlAsStream completed, waiting for canplaythrough...");
              // 等待音频加载完成（最多等待 5 秒）
              const loaded = await audioRef.current.waitForCanPlayThrough(5000);
              console.log("[PLAY_EVENT] waitForCanPlayThrough result:", loaded);
              if (!loaded) {
                console.warn("[PLAY_EVENT] Audio loading timeout, but will try to resume anyway");
              }
            } else if (currentUrl !== audioUrl) {
              if (isPreloaded) {
                // URL 不同但已预加载，使用预加载的音频
                console.log("[PLAY_EVENT] URL changed but audio is preloaded, switching to preloaded audio...");
                await audioRef.current.usePreloadedAudio(audioUrl);
              } else {
                // URL 不同且未预加载，重新加载
                console.log("[PLAY_EVENT] URL changed and not preloaded, reloading audio...");
                await audioRef.current.playUrlAsStream(audioUrl, false);
                console.log("[PLAY_EVENT] playUrlAsStream completed (URL changed), waiting for canplaythrough...");
                // 等待音频加载完成（最多等待 5 秒）
                const loaded = await audioRef.current.waitForCanPlayThrough(5000);
                console.log("[PLAY_EVENT] waitForCanPlayThrough result after URL change:", loaded);
                if (!loaded) {
                  console.warn("[PLAY_EVENT] Audio loading timeout after URL change, but will try to resume anyway");
                }
              }
            } else {
              console.log("[PLAY_EVENT] URL matches, no need to reload");
            }
          }

          // 2. 先同步进度（失败则不改变播放状态）
          console.log("[PLAY_EVENT] Applying remote progress...");
          applyRemoteProgress(message, true);

          // 3. 同步播放状态（仅在进度同步成功后）
          console.log("[PLAY_EVENT] Resuming audio...");
          await audioRef.current?.resume();
          console.log("[PLAY_EVENT] Audio resumed successfully");
          
          // 4. 清理 UI 状态
          setAnswerOrderByUserId({});
          setCurrentAnsweringPlayer(null);
          setIsJudging(false);
          setHasJudgingSubmitted(false);
          setCurrentSong(null);
          console.log("[PLAY_EVENT] PLAY event processed successfully");
        } catch (err) {
          console.error("[PLAY_EVENT] Failed to apply PLAY event:", err);
          await reportAudioError(
            "sync_failed",
            parseErrorMessage(err, "播放同步失败"),
          );
        }
      },
    );

    wsRef.current.onJsonEvent<AttemptAnswerMessage>(
      GameEventId.ATTEMPT_ANSWER,
      (message) => {
        const attemptedUserId = message?.data?.user_id;
        if (typeof attemptedUserId !== "number") {
          return;
        }
        addAttemptOrder(attemptedUserId);
      },
    );

    // 处理用户答题轮次事件（全房间广播）
    wsRef.current.onJsonEvent<YourTurnMessage>(GameEventId.YOUR_TURN, (message) => {
      const turnUserId = message?.data?.user_id;
      if (typeof turnUserId === "number") {
        setCurrentAnsweringPlayer(turnUserId);
        if (turnUserId === userIdRef.current) {
          setIsAnswerModalOpen(true);
          setIsAnswerModalMinimized(false);
        }
      }
    });

    // 处理玩家答案广播，实时展示在“玩家作答情况”表中
    wsRef.current.onJsonEvent<AnswerBroadcastMessage>(
      GameEventId.ANSWER_BROADCAST,
      (message) => {
        const rawPlayerId = message?.data?.player_id;
        const selectedTagIds = message?.data?.selected_tag_ids ?? [];
        const descriptionText = message?.data?.description_text ?? "";
        const playerIdNum = Number.parseInt(rawPlayerId, 10);

        if (!Number.isFinite(playerIdNum)) {
          return;
        }

        const latestRoomState = gameStore.getState().roomState;
        const latestTagGroups = latestRoomState?.tag_groups ?? [];
        const latestPlayers = latestRoomState?.players ?? [];
        const selectedAnswerMap: Record<number, number | null> = {};

        selectedTagIds.forEach((tagId) => {
          const matchedGroup = latestTagGroups.find((group) =>
            group.tags.some((tag) => tag.id === tagId),
          );
          if (matchedGroup) {
            selectedAnswerMap[matchedGroup.id] = tagId;
          }
        });

        const orderFromQueue =
          latestRoomState?.answer_queue?.find((item) => item.player_id === playerIdNum)
            ?.order ?? null;

        const playerName =
          latestPlayers.find((player) => player.id === playerIdNum)?.username ??
          `玩家${playerIdNum}`;

        const existingRoundAnswer = latestRoomState?.round_answers?.find(
          (a) => a.player_id === playerIdNum,
        );
        const fallbackOrder = existingRoundAnswer?.order ?? (latestRoomState?.round_answers?.length ?? 0) + 1;
        const nextOrder = orderFromQueue ?? fallbackOrder;

        const newPlayerAnswer = {
          playerId: playerIdNum,
          username: playerName,
          answers: selectedAnswerMap,
          description: descriptionText,
          order: nextOrder,
        };

        setPlayerAnswers((prev) => {
          const existing = prev.find((item) => item.playerId === playerIdNum);
          if (existing) {
            return prev.map((item) =>
              item.playerId === playerIdNum ? newPlayerAnswer : item,
            );
          }
          return [...prev, newPlayerAnswer];
        });

        const currentRoomState = gameStore.getState().roomState;
        if (currentRoomState) {
          const updatedRoundAnswers = [...(currentRoomState.round_answers ?? [])];
          const existingIndex = updatedRoundAnswers.findIndex(
            (a) => a.player_id === playerIdNum,
          );
          const roundAnswerItem = {
            player_id: playerIdNum,
            username: playerName,
            answers: selectedAnswerMap as Record<number, number>,
            description: descriptionText,
            order: nextOrder,
          };

          if (existingIndex >= 0) {
            updatedRoundAnswers[existingIndex] = roundAnswerItem;
          } else {
            updatedRoundAnswers.push(roundAnswerItem);
          }

          gameStore.getState().setRoomState({
            ...currentRoomState,
            round_answers: updatedRoundAnswers,
          });
        }
      },
    );

    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.SKIP_ROUND;
      ts: number;
      data: Record<string, never>;
    }>(GameEventId.SKIP_ROUND, () => {
      resetRoundTransientState();
      syncAnswerQueueState([], null);
    });

    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.JUDGING;
      ts: number;
      data: {
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
        player_answers?: Array<{
          player_id: number;
          username: string;
          answers: Record<number, number>; // tagGroupId -> tagId
          description: string;
          order: number;
        }>;
        answers?: Array<{
          player_id: number;
          username: string;
          selected_tags: number[];
          description: string | null;
        }>;
      };
    }>(GameEventId.JUDGING, (message) => {
      setIsJudging(true);
      const latestTagGroups = gameStore.getState().roomState?.tag_groups ?? [];
      const latestAnswerQueue = gameStore.getState().roomState?.answer_queue ?? [];
      // 判分时显示完整曲目信息
      if (message.data?.song) {
        setCurrentSong({
          title: message.data.song.title || "",
          artist: message.data.song.artist || "",
          album: message.data.song.album || "",
          coverUrl: message.data.song.cover_url || "",
          platformUrl: message.data.song.platform_url || undefined,
        });
      }

      // 存储历史标签ID
      setHistoryTagIds(message.data?.history_tag_ids || []);

      // 存储参考精确描述
      setReferenceDescriptions(message.data?.reference_descriptions || []);

      // 存储玩家精确描述
      setPlayerDescriptions(message.data?.player_descriptions || []);

      // 存储玩家作答情况
      // 兼容两种协议：
      // 1) 新协议: player_answers[].answers (tagGroupId -> tagId)
      // 2) 旧/后端当前协议: answers[].selected_tags (tagId[])
      if (message.data?.player_answers) {
        setPlayerAnswers(
          message.data.player_answers.map((answer) => ({
            playerId: answer.player_id,
            username: answer.username,
            answers: answer.answers,
            description: answer.description,
            order: answer.order,
          })),
        );
      } else if (message.data?.answers) {
        const queueOrderByUserId = latestAnswerQueue.reduce<Record<number, number>>(
          (acc, item, index) => {
            acc[item.player_id] = item.order ?? index + 1;
            return acc;
          },
          {},
        );

        const normalizedAnswers = message.data.answers.map((answer, index) => {
          const selectedAnswerMap: Record<number, number | null> = {};

          answer.selected_tags.forEach((tagId) => {
            const matchedGroup = latestTagGroups.find((group) =>
              group.tags.some((tag) => tag.id === tagId),
            );
            if (matchedGroup) {
              selectedAnswerMap[matchedGroup.id] = tagId;
            }
          });

          return {
            playerId: answer.player_id,
            username: answer.username,
            answers: selectedAnswerMap,
            description: answer.description ?? "",
            order: queueOrderByUserId[answer.player_id] ?? index + 1,
          };
        });

        setPlayerAnswers(normalizedAnswers);
      } else {
        // 如果没有player_answers，尝试从player_descriptions构建
        const playerAnswersFromDescriptions =
          message.data?.player_descriptions?.map((desc, index) => ({
            playerId: desc.id,
            username: desc.username,
            answers: {},
            description: desc.description,
            order: index + 1,
          })) || [];
        setPlayerAnswers(playerAnswersFromDescriptions);
      }

      // 初始化选中的标签（仅基于历史标签，不预选任何玩家的答案）
      const initialSelectedTags: Record<number, number | null> = {};
      latestTagGroups.forEach((group) => {
        // 检查是否有且仅有一个标签在历史标签中
        const groupTagsInHistory = group.tags.filter((tag) =>
          message.data?.history_tag_ids?.includes(tag.id),
        );
        if (groupTagsInHistory.length === 1) {
          initialSelectedTags[group.id] = groupTagsInHistory[0].id;
        } else {
          initialSelectedTags[group.id] = null;
        }
      });
      setSelectedTags(initialSelectedTags);

      // 重置选中的描述
      setSelectedDescriptions([]);

      // 判分时不自动显示确认答案弹窗
    });

    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.SCORE_UPDATE;
      ts: number;
      data: {
        scores: Array<{ player_id: number; username: string; score: number }>;
      };
    }>(GameEventId.SCORE_UPDATE, (message) => {
      // 处理得分更新（SCORE_UPDATE 为本轮增量，需在前端累加为总分）
      if (message.data?.scores) {
        const previousScores = gameStore.getState().scores;
        const deltaScores = message.data.scores;
        const nextScores = applyScoreDeltaUpdate(previousScores, deltaScores);

        const activeUserId = userIdRef.current;
        if (activeUserId !== null) {
          const deltaByUserId = deltaScores.reduce<Record<number, number>>(
            (acc, item) => {
              acc[item.player_id] = item.score;
              return acc;
            },
            {},
          );

          const previousRankMap = buildRankMap(previousScores);
          const currentRankMap = buildRankMap(nextScores);
          const currentScoreEntry = nextScores.find(
            (item) => item.player_id === activeUserId,
          );

          if (currentScoreEntry) {
            const roundScore = deltaByUserId[activeUserId] ?? 0;
            const previousRank = previousRankMap[activeUserId] ?? null;
            const currentRank = currentRankMap[activeUserId] ?? null;
            const rankChange =
              previousRank !== null && currentRank !== null
                ? previousRank - currentRank
                : null;

            setRoundSummary({
              roundScore,
              rankChange,
              currentRank,
            });
            setIsRoundSummaryOpen(true);
          }
        }

        // 更新游戏状态中的得分信息
        console.log("Score updated:", nextScores);
        gameStore.getState().setScores(nextScores);
      }
    });
    wsRef.current.onJsonEvent<ShowSongMessage>(
      GameEventId.SHOW_SONG,
      (message) => {
        setCurrentSong({
          title: message.data?.title ?? "",
          artist: message.data?.author ?? "",
          album: message.data?.album ?? "",
          coverUrl: message.data?.cover ?? "",
        });

        const latestRoomState = gameStore.getState().roomState;
        if (latestRoomState) {
          gameStore.getState().setRoomState({
            ...latestRoomState,
            show_answer: true,
          });
        }
      },
    );

    wsRef.current.onJsonEvent<PlayControlMessage>(
      GameEventId.PAUSE,
      async (message) => {
        try {
          const nextPlaybackStatus = buildPlaybackStatusFromPlayControl(message);
          if (nextPlaybackStatus) {
            syncPlaybackStatusToRoomState(nextPlaybackStatus);
          }

          // 1. 先同步进度（失败则不改变播放状态）
          applyRemoteProgress(message, true);

          // 2. 同步播放状态（仅在进度同步成功后）
          await audioRef.current?.pause();
        } catch (err) {
          console.error("[PAUSE_EVENT] Failed to apply PAUSE event:", err);
          await reportAudioError(
            "sync_failed",
            parseErrorMessage(err, "暂停同步失败"),
          );
        }
      },
    );

    // 处理玩家加入事件
    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.ROOM_JOIN;
      ts: number;
      data: {
        id: number;
        username: string;
        is_owner: boolean;
        online: boolean;
      };
    }>(GameEventId.ROOM_JOIN, (message) => {
      const newPlayer = message.data;
      if (newPlayer) {
        // 使用函数式更新确保原子性，避免多个事件快速到达时的竞态条件
        setOnlinePlayers((prev) => {
          // 检查玩家是否已存在
          const playerExists = prev.some((p) => p.id === newPlayer.id);
          if (playerExists) {
            // 更新现有玩家信息（可能是断线重连）
            return prev.map((p) => (p.id === newPlayer.id ? newPlayer : p));
          } else {
            // 添加新玩家
            return [...prev, newPlayer];
          }
        });

        const currentRoomState = gameStore.getState().roomState;
        if (currentRoomState) {
          const existingIndex = currentRoomState.players.findIndex(
            (player) => player.id === newPlayer.id,
          );

          let nextPlayers: WsPlayer[];
          if (existingIndex >= 0) {
            nextPlayers = currentRoomState.players.map((player) =>
              player.id === newPlayer.id
                ? { ...player, ...newPlayer, online: true }
                : player,
            );
          } else {
            nextPlayers = [
              ...currentRoomState.players,
              { ...newPlayer, online: true },
            ];
          }

          gameStore.getState().setRoomState({
            ...currentRoomState,
            players: nextPlayers,
            playersSimple: getPlayersSimple(nextPlayers),
          });
        }

        // 如果新玩家是房主，更新房主信息
        if (newPlayer.is_owner) {
          setRoomOwner(newPlayer.username);
        }
      }
    });

    // 处理玩家离开事件（对局开始后仅标记为离线，对局未开始才移除）
    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.PLAYER_LEAVE;
      ts: number;
      data: {
        id: number;
        username: string;
        is_owner: boolean;
        online: boolean;
      };
    }>(GameEventId.PLAYER_LEAVE, (message) => {
      const leftPlayer = message.data;
      if (!leftPlayer) {
        return;
      }

      // 防御性处理：忽略“自己离线”广播，避免重连/多连接时序导致本地把自己标成离线
      if (leftPlayer.id === userIdRef.current) {
        return;
      }

      const currentRoomState = gameStore.getState().roomState;

      // 房间任意状态都保留玩家，仅更新在线状态
      setOnlinePlayers((prev) =>
        prev.map((p) => (p.id === leftPlayer.id ? { ...p, online: false } : p)),
      );

      if (currentRoomState) {
        const nextPlayers = currentRoomState.players.map((player) =>
          player.id === leftPlayer.id ? { ...player, online: false } : player,
        );

        gameStore.getState().setRoomState({
          ...currentRoomState,
          players: nextPlayers,
          playersSimple: getPlayersSimple(nextPlayers),
        });
      }

      setAnswerOrderByUserId((prev) => {
        if (!(leftPlayer.id in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[leftPlayer.id];
        return next;
      });
    });

    wsRef.current.onJsonEvent<KickUserMessage>(GameEventId.KICK_USER, (message) => {
      const kickedUserId = message?.data?.user_id;
      if (typeof kickedUserId !== "number") {
        return;
      }

      setOnlinePlayers((prev) => prev.filter((player) => player.id !== kickedUserId));

      const currentRoomState = gameStore.getState().roomState;
      if (currentRoomState) {
        const nextPlayers = currentRoomState.players.filter(
          (player) => player.id !== kickedUserId,
        );
        const nextAnswerQueue = (currentRoomState.answer_queue ?? []).filter(
          (item) => item.player_id !== kickedUserId,
        );

        gameStore.getState().setRoomState({
          ...currentRoomState,
          players: nextPlayers,
          playersSimple: getPlayersSimple(nextPlayers),
          answer_queue: nextAnswerQueue,
        });
      }

      setAnswerOrderByUserId((prev) => {
        if (!(kickedUserId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[kickedUserId];
        return next;
      });

      setCurrentAnsweringPlayer((prev) => (prev === kickedUserId ? null : prev));

      if (userIdRef.current === kickedUserId) {
        clearRoomIdentityStorage(roomId);
        removeUser(kickedUserId);
        pushToast({ message: "你已被房主移出房间", variant: "error" });
        wsRef.current?.close();
        navigate("/", { replace: true });
      }
    });

    // 处理玩家准备事件
    // wsRef.current.onJsonEvent<{
    //   event: typeof GameEventId.PLAYER_READY;
    //   ts: number;
    //   data: {
    //     user_id: number;
    //     ready: boolean;
    //   };
    // }>(GameEventId.PLAYER_READY, (message) => {
    //   const { user_id, ready } = message.data;
    //   if (user_id === userId) {
    //     // setIsReady(ready);
    //   }
    // });

    // // 处理倒计时事件
    // wsRef.current.onJsonEvent<{
    //   event: typeof GameEventId.COUNTDOWN;
    //   ts: number;
    //   data: {
    //     seconds: number;
    //     all_ready: boolean;
    //   };
    // }>(GameEventId.COUNTDOWN, (message) => {
    //   // const { seconds } = message.data;
    //   // setCountdown(seconds);
    // });

    // 处理游戏开始事件
    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.GAME_START;
      ts: number;
      data: Record<string, never>;
    }>(GameEventId.GAME_START, () => {
      const currentRoomState = gameStore.getState().roomState;
      if (currentRoomState) {
        gameStore.getState().setRoomState({
          ...currentRoomState,
          status: "playing",
          statusCode: 1,
        });
      }
      // setCountdown(null);
      // setIsReady(false);
    });

    // 处理玩家准备事件
    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.PLAYER_READY;
      ts: number;
      data: {
        user_id: number;
        ready: boolean;
      };
    }>(GameEventId.PLAYER_READY, (message) => {
      const { user_id } = message.data;
      if (user_id === userIdRef.current) {
        // setIsReady(ready);
      }
    });

    // 处理回合开始事件
    wsRef.current.onJsonEvent<RoundStartMessage>(
      GameEventId.ROUND_START,
      async (message) => {
        if (isDisposed) {
          return;
        }
        closeRoundSummaryDialog();
        const roundData = message.data;
        let startProgressMs = 0;

        // 1. 切换到新音频URL（如果提供）
        if (
          roundData.audio_url &&
          roundData.audio_url !== currentAudioUrlRef.current
        ) {
          try {
            logAudioTrigger("ROUND_START", roundData.audio_url);
            await switchAudioSourceIfNeeded(roundData.audio_url);
          } catch (error) {
            console.error("Failed to load audio for round start:", error);
            notifyAudioLoadError(
              parseErrorMessage(error, "回合音频加载失败，请稍后重试"),
            );
          }
        }

        // 2. 设置起始播放位置
        if (roundData.start_percent > 0 && audioRef.current) {
          const duration = audioRef.current.durationMs;
          if (duration > 0) {
            const startMs = duration * roundData.start_percent;
            startProgressMs = Math.max(0, Math.round(startMs));
          }
        } else if (audioRef.current) {
          audioRef.current.progressMs = 0;
          startProgressMs = 0;
        }

        if (audioRef.current) {
          audioRef.current.progressMs = startProgressMs;
        }

        const previousPlaybackStatus = gameStore.getState().roomState?.playback_status;
        const nextPlaybackStatus: PlaybackState = {
          progress_ms: startProgressMs,
          updated_at: message.ts,
          offset_ts: message.ts,
          play_state: "playing",
          current_order: previousPlaybackStatus?.current_order ?? 0,
          audio_url: roundData.audio_url ?? previousPlaybackStatus?.audio_url ?? currentAudioUrlRef.current,
        };
        syncPlaybackStatusToRoomState(nextPlaybackStatus);

        // 3. 回合开始后自动恢复播放
        if (audioRef.current) {
          try {
            await audioRef.current.resume();
          } catch (error) {
            console.error("Failed to auto resume audio on round start:", error);
          }
        }

        // 4. 清除抢答队列状态
        setAnswerOrderByUserId({});
        syncAnswerQueueState([], null);

        // 5. 清空玩家作答情况
        setPlayerAnswers([]);

        // 6. 重置答题弹窗状态
        setIsAnswerModalOpen(false);
        setIsAnswerModalMinimized(false);
        setDescription("");

        // 7. 重置正在回答的玩家状态
        setCurrentAnsweringPlayer(null);

        // 8. 隐藏判分界面和曲目信息
        setIsJudging(false);
        setHasJudgingSubmitted(false);
        setCurrentSong(null);

        // 5. 可选：更新回合索引到状态存储（如果需要显示）
        // gameStore.getState().setRoundIndex(roundData.round_index);

        console.log(`Round ${roundData.round_index} started`, roundData);
      },
    );

    // 处理回合状态更新事件
    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.ROUND_STATE_UPDATE;
      ts: number;
      data: {
        round_state: 0 | 1 | 2 | 3 | 4;
        round_state_name:
          | "PENDING"
          | "PLAYING_AUDIO"
          | "ANSWERING"
          | "JUDGING"
          | "COMPLETED";
      };
    }>(GameEventId.ROUND_STATE_UPDATE, (message) => {
      const { round_state, round_state_name } = message.data;
      gameStore.getState().setRoundState(round_state_name, round_state);
      console.log(
        `Round state updated: ${round_state_name} (code: ${round_state})`,
      );
    });

    // 处理起始位置更新事件
    wsRef.current.onJsonEvent<StartPosUpdateMessage>(
      GameEventId.START_POS_UPDATE,
      (message) => {
        const { start_position_percent } = message.data;
        const currentRoomState = gameStore.getState().roomState;
        if (currentRoomState) {
          gameStore.getState().setRoomState({
            ...currentRoomState,
            song_start_range_percent: start_position_percent,
            startPositionPercent: start_position_percent,
          });
        }
        console.log(`Start position updated: ${start_position_percent}%`);
      },
    );

    // 处理游戏结束事件
    wsRef.current.onJsonEvent<GameOverMessage>(
      GameEventId.GAME_OVER,
      (message) => {
        const { final_scores } = message.data;
        // 更新游戏状态为结束
        const currentRoomState = gameStore.getState().roomState;
        if (currentRoomState) {
          gameStore.getState().setRoomState({
            ...currentRoomState,
            status: "ended",
            statusCode: 2,
          });
        }
        // 更新分数
        gameStore.getState().setScores(final_scores);
        console.log(`Game over with final scores:`, final_scores);
        // 这里可以添加游戏结束的UI处理，比如显示游戏结束弹窗
      },
    );

    // 处理清空抢答队列事件
    wsRef.current.onJsonEvent<ClearAnswerQueueMessage>(
      GameEventId.CLEAR_ANSWER_QUEUE,
      () => {
        syncAnswerQueueState([], null);
        console.log("Answer queue cleared");
      },
    );

    // 处理抢答队列更新事件
    wsRef.current.onJsonEvent<AnswerQueueMessage>(GameEventId.ANSWER_QUEUE, (message) => {
      const queue = message.data?.queue ?? [];
      syncAnswerQueueState(queue, message.data?.answer_queue_tail_player_id ?? null);
      console.log("Answer queue updated:", queue);
    });

    // 处理音频预加载事件
    wsRef.current.onJsonEvent<PreloadAudioMessage>(
      GameEventId.PRELOAD_AUDIO,
      async (message) => {
        console.log("[PRELOAD_AUDIO] Received PRELOAD_AUDIO event:", message);
        if (isDisposed) {
          console.log("[PRELOAD_AUDIO] Skip: isDisposed");
          return;
        }
        const { audio_url } = message.data;
        if (!audio_url) {
          console.log("[PRELOAD_AUDIO] Skip: no audio_url");
          return;
        }

        const now = Date.now();
        const lastPreloadTs = recentPreloadByUrlRef.current[audio_url] ?? 0;
        if (now - lastPreloadTs < PRELOAD_DEDUP_WINDOW_MS) {
          console.log("[PRELOAD_AUDIO] Dedup skip, last preload:", lastPreloadTs);
          return;
        }

        // 检查是否已预加载
        const isPreloaded = audioRef.current?.isPreloaded?.(audio_url) ?? false;
        if (isPreloaded) {
          console.log("[PRELOAD_AUDIO] Skip: already preloaded for URL:", audio_url);
          return;
        }

        console.log("[PRELOAD_AUDIO] Checking conditions:", {
          audioRefReady: !!audioRef.current,
          currentUrl: currentAudioUrlRef.current,
          switchingUrl: switchingAudioUrlRef.current,
          targetUrl: audio_url,
          isPreloaded,
        });

        if (
          audioRef.current &&
          audio_url !== currentAudioUrlRef.current &&
          audio_url !== switchingAudioUrlRef.current
        ) {
          try {
            logAudioTrigger("PRELOAD", audio_url);
            recentPreloadByUrlRef.current[audio_url] = now;
            console.log("[PRELOAD_AUDIO] Starting preload for URL:", audio_url);
            await audioRef.current.preload(audio_url);
            console.log("[PRELOAD_AUDIO] Successfully preloaded:", audio_url);
          } catch (error) {
            console.error("[PRELOAD_AUDIO] Failed to preload:", error);
            notifyAudioLoadError(
              parseErrorMessage(error, "音频预加载失败，请稍后重试"),
            );
          }
        } else {
          console.log("[PRELOAD_AUDIO] Skip preload, audioRef:", !!audioRef.current, "currentUrl:", currentAudioUrlRef.current);
        }
      },
    );

    // 处理标签增量更新事件
    wsRef.current.onJsonEvent<TagsUpdateMessage>(
      GameEventId.TAGS_UPDATE,
      (message) => {
        if (isDisposed) {
          return;
        }
        const { added_tags, updated_tags, deleted_tag_ids } = message.data;
        const gameState = gameStore.getState();
        
        if (added_tags?.length) {
          gameState.addTags(added_tags);
        }
        if (updated_tags?.length) {
          gameState.updateTags(updated_tags);
        }
        if (deleted_tag_ids?.length) {
          gameState.removeTags(deleted_tag_ids);
        }
        
        console.debug("Tags updated via WebSocket:", {
          added: added_tags?.length ?? 0,
          updated: updated_tags?.length ?? 0,
          deleted: deleted_tag_ids?.length ?? 0
        });
      },
    );

    // 处理标签组增量更新事件
    wsRef.current.onJsonEvent<TagGroupsUpdateMessage>(
      GameEventId.TAG_GROUPS_UPDATE,
      (message) => {
        if (isDisposed) {
          return;
        }
        const { added_tag_groups, updated_tag_groups, deleted_tag_group_ids } = message.data;
        const gameState = gameStore.getState();
        
        if (added_tag_groups?.length) {
          gameState.addTagGroups(added_tag_groups);
        }
        if (updated_tag_groups?.length) {
          gameState.updateTagGroups(updated_tag_groups);
        }
        if (deleted_tag_group_ids?.length) {
          gameState.removeTagGroups(deleted_tag_group_ids);
        }
        
        console.debug("Tag groups updated via WebSocket:", {
          added: added_tag_groups?.length ?? 0,
          updated: updated_tag_groups?.length ?? 0,
          deleted: deleted_tag_group_ids?.length ?? 0
        });
      },
    );

    // 处理当前房间已选标签组同步事件（避免依赖全量 ROOM_STATE）
    wsRef.current.onJsonEvent<TagGroupMessage>(
      GameEventId.TAG_GROUP,
      (message) => {
        if (isDisposed) {
          return;
        }

        const payload = message.data;
        if (payload.room_id !== roomId) {
          return;
        }

        setTagGroups(payload.tag_groups);
        setSelectedTagByGroup((prev) => {
          const next: Record<number, number | null> = {};
          payload.tag_groups.forEach((group) => {
            const prevTagId = prev[group.id] ?? null;
            const stillValid =
              prevTagId !== null && group.tags.some((tag) => tag.id === prevTagId);
            next[group.id] = stillValid ? prevTagId : null;
          });
          return next;
        });

        const currentRoomState = gameStore.getState().roomState;
        if (currentRoomState) {
          gameStore.getState().setRoomState({
            ...currentRoomState,
            tag_groups: payload.tag_groups,
            tagGroupsSimple: getTagGroupsSimple(payload.tag_groups),
          });
        }
      },
    );

    wsRef.current.onConnectionStateChange(setConnected);

    setUrl(wsUrl);
    setRoomId(roomId);

    const stopHeartbeat = startHeartbeat(wsRef.current, 1000, 1000);

    return () => {
      isDisposed = true;
      stopHeartbeat();
      wsRef.current?.close();
      wsRef.current = undefined;
      setWsClient(undefined);
      setRoomId(null);
    };
  }, [
    addAttemptOrder,
    applyRemoteProgress,
    buildPlaybackStatusFromPlayControl,
    getCalibratedNow,
    reportAudioError,
    tryPlayUrlWithRetry,
    roomId,
    resetRoundTransientState,
    setConnected,
    setRoomId,
    setUrl,
    setWsClient,
    syncAnswerQueueState,
    syncPlaybackStatusToRoomState,
    switchAudioSourceIfNeeded,
    notifyAudioLoadError,
    navigate,
    pushToast,
    addUser,
    removeUser,
    userId,
    wsAuthToken,
    wsAuthUsername,
    closeRoundSummaryDialog,
  ]);

  useEffect(() => {
    audioRef.current = new audioPlayer();
    audioRef.current.volume = initialVolumeRef.current;
    audioRef.current.onStateChange = (nextState) => {
      setAudioState(nextState);
    };
    setAudioState(audioRef.current.state);
    
    // 设置 AudioContext 拦截检测回调
    setupAudioPlayerInterceptor(audioRef.current);
    
    audioRef.current.onEnded = () => {
      if (!isOwnerRef.current || !wsRef.current?.isConnected()) {
        return;
      }
      // 曲目播放完毕，仅暂停播放
      void sendPlaybackControlRef.current(GameEventId.PAUSE);
    };
    audioRef.current.onTimeUpdate = (ev) => {
      if (progressBarRef.current && !isProgressDraggingRef.current) {
        const audioElement = ev.target as HTMLAudioElement;
        const progressPercent =
          audioElement.duration > 0
            ? (audioElement.currentTime / audioElement.duration) * 100
            : 0;
        progressBarRef.current.style.width = `${progressPercent}%`;
      }
    };
    return () => {
      if (canvasInitTimerRef.current !== null) {
        window.clearTimeout(canvasInitTimerRef.current);
        canvasInitTimerRef.current = null;
      }
      canvasInitializedRef.current = false;
      audioRef.current?.cleanup();
      audioRef.current = null;
    };
  }, [setupAudioPlayerInterceptor]);

  useEffect(() => {
    if (!roomId || !isConnected || latencyAvg === null) {
      return;
    }

    if (canvasInitializedRef.current || canvasInitTimerRef.current !== null) {
      return;
    }

    canvasInitTimerRef.current = window.setTimeout(() => {
      canvasInitTimerRef.current = null;
      if (
        canvasInitializedRef.current ||
        !audioRef.current ||
        !canvasRef.current ||
        !canvasParentRef.current
      ) {
        return;
      }

      audioRef.current.initCanvas(canvasRef.current, canvasParentRef.current);
      canvasInitializedRef.current = true;
    }, CANVAS_INIT_DELAY_MS);

    return () => {
      if (canvasInitTimerRef.current !== null) {
        window.clearTimeout(canvasInitTimerRef.current);
        canvasInitTimerRef.current = null;
      }
    };
  }, [isConnected, latencyAvg, roomId]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = localVolume;
    }
  }, [localVolume]);

  // WAITING 阶段默认循环播放（预热保活），PLAYING 阶段默认播完即停
  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.setLoop(roomState?.status === "waiting");
  }, [roomState?.status]);

  // 根据窗口 focus 状态与房间状态动态调整音量（每个客户端独立处理）
  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    // PLAYING：禁用失焦静音，始终使用用户设定音量
    // WAITING：失焦时降到极低音量 0.0001，保持后台音频链路活跃
    // 其他状态：沿用原有失焦静音策略
    const roomStatus = roomState?.status;
    const targetVolume =
      roomStatus === "playing"
        ? localVolume
        : !isWindowFocused
          ? roomStatus === "waiting"
            ? 0.0001
            : 0
          : localVolume;

    audioRef.current.volume = targetVolume;
  }, [isWindowFocused, localVolume, roomState?.status]);

  useEffect(() => {
    const parent = canvasParentRef.current;
    if (!parent) {
      return;
    }

    if (!isOwner) {
      return;
    }

    const onMouseDown = (ev: MouseEvent) => {
      isProgressDraggingRef.current = true;
      progressBarRef.current?.classList.add("no-transition");
      domProgressPercent = Math.max(
        0,
        Math.min(100, (ev.offsetX / (parent.clientWidth || 1)) * 100),
      );
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercent}%`;
      }
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!isProgressDraggingRef.current) return;
      domProgressPercent = Math.max(
        0,
        Math.min(100, (ev.offsetX / (parent.clientWidth || 1)) * 100),
      );
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercent}%`;
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (!isProgressDraggingRef.current) return;
      isProgressDraggingRef.current = false;
      progressBarRef.current?.classList.remove("no-transition");
      domProgressPercent = Math.max(
        0,
        Math.min(100, (ev.offsetX / (parent.clientWidth || 1)) * 100),
      );
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercent}%`;
      }
      if (audioRef.current) {
        audioRef.current.progress = domProgressPercent;
      }
      void sendPlaybackControl(GameEventId.SEEK);
    };

    const onMouseLeave = (ev: MouseEvent) => {
      if (!isProgressDraggingRef.current) return;
      if (ev.offsetX <= 0 || ev.offsetX >= parent.clientWidth) {
        domProgressPercent = Math.max(
          0,
          Math.min(100, (ev.offsetX / (parent.clientWidth || 1)) * 100),
        );
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${domProgressPercent}%`;
        }
        if (audioRef.current) {
          audioRef.current.progress = domProgressPercent;
        }
        void sendPlaybackControl(GameEventId.SEEK);
      }
      isProgressDraggingRef.current = false;
      progressBarRef.current?.classList.remove("no-transition");
    };

    parent.addEventListener("mousedown", onMouseDown);
    parent.addEventListener("mousemove", onMouseMove);
    parent.addEventListener("mouseup", onMouseUp);
    parent.addEventListener("mouseleave", onMouseLeave);

    return () => {
      parent.removeEventListener("mousedown", onMouseDown);
      parent.removeEventListener("mousemove", onMouseMove);
      parent.removeEventListener("mouseup", onMouseUp);
      parent.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [sendPlaybackControl, isOwner]);

  const showVolumeToast = useCallback(() => {
    setIsVolumeToastClosing(false);
    setIsVolumeToastVisible(true);
    if (volumeToastHideTimerRef.current !== null) {
      window.clearTimeout(volumeToastHideTimerRef.current);
    }
    if (volumeToastExitTimerRef.current !== null) {
      window.clearTimeout(volumeToastExitTimerRef.current);
      volumeToastExitTimerRef.current = null;
    }

    volumeToastHideTimerRef.current = window.setTimeout(() => {
      setIsVolumeToastClosing(true);
      volumeToastHideTimerRef.current = null;

      volumeToastExitTimerRef.current = window.setTimeout(() => {
        setIsVolumeToastVisible(false);
        setIsVolumeToastClosing(false);
        volumeToastExitTimerRef.current = null;
      }, VOLUME_TOAST_EXIT_ANIMATION_MS);
    }, VOLUME_TOAST_HIDE_DELAY_MS);
  }, []);

  const setVolume = useCallback(
    (value: number) => {
      const safeValue = Math.max(0, Math.min(200, value));
      setLocalVolume(safeValue);
      setPersistVolume(safeValue);

      if (audioRef.current) {
        audioRef.current.volume = safeValue;
      }
    },
    [setPersistVolume],
  );

  const adjustVolume = useCallback(
    (delta: number) => {
      setLocalVolume((previousVolume) => {
        const nextVolume = Math.max(0, Math.min(200, previousVolume + delta));
        setPersistVolume(nextVolume);

        if (audioRef.current) {
          audioRef.current.volume = nextVolume;
        }

        return nextVolume;
      });
    },
    [setPersistVolume],
  );

  const handleCopyRoomId = useCallback(async () => {
    if (!roomId) {
      return;
    }

    if (roomIdCopyTimerRef.current !== null) {
      window.clearTimeout(roomIdCopyTimerRef.current);
      roomIdCopyTimerRef.current = null;
    }

    try {
      await copyTextToClipboard(roomId);
      setRoomIdCopyState("success");
    } catch (error) {
      console.error("Failed to copy room id:", error);
      setRoomIdCopyState("error");
    }

    roomIdCopyTimerRef.current = window.setTimeout(() => {
      setRoomIdCopyState("idle");
      roomIdCopyTimerRef.current = null;
    }, ROOM_ID_COPY_FEEDBACK_MS);
  }, [roomId]);

  const handleCopyJoinLink = useCallback(async () => {
    if (!roomId) {
      return;
    }

    const joinLink = `http://ccg.modenc.top/join/${roomId}`;
    try {
      await copyTextToClipboard(joinLink);
      pushToast({ message: "已复制快速加入链接", variant: "success" });
    } catch (error) {
      console.error("Failed to copy join link:", error);
      pushToast({ message: "复制链接失败", variant: "error" });
    }
  }, [roomId, pushToast]);

  useEffect(() => {
    return () => {
      if (volumeToastHideTimerRef.current !== null) {
        window.clearTimeout(volumeToastHideTimerRef.current);
        volumeToastHideTimerRef.current = null;
      }
      if (volumeToastExitTimerRef.current !== null) {
        window.clearTimeout(volumeToastExitTimerRef.current);
        volumeToastExitTimerRef.current = null;
      }
      if (roomIdCopyTimerRef.current !== null) {
        window.clearTimeout(roomIdCopyTimerRef.current);
        roomIdCopyTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName;
      return (
        target.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
      );
    };

    const isBuzzHotkey = (ev: KeyboardEvent) => {
      const isSpace =
        ev.code === "Space" || ev.key === " " || ev.key === "Spacebar";
      const isEnter = ev.key === "Enter";
      return isSpace || isEnter;
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (!isBuzzHotkey(ev) || isEditableTarget(ev.target)) {
        return;
      }

      ev.preventDefault();

      if (ev.repeat) {
        return;
      }

      if (!isConnected) {
        return;
      }

      setIsBuzzHotkeyActive(true);
      handleBuzz();
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      if (!isBuzzHotkey(ev)) {
        return;
      }
      setIsBuzzHotkeyActive(false);
    };

    const onWindowBlur = () => {
      setIsBuzzHotkeyActive(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [handleBuzz, isConnected]);

  useEffect(() => {
    const isVolumeDownHotkey = (ev: KeyboardEvent) => {
      return (
        ev.key === "-" ||
        ev.key === "_" ||
        ev.code === "Minus" ||
        ev.code === "NumpadSubtract"
      );
    };

    const isVolumeUpHotkey = (ev: KeyboardEvent) => {
      return (
        ev.key === "=" ||
        ev.key === "+" ||
        ev.code === "Equal" ||
        ev.code === "NumpadAdd"
      );
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) {
        return;
      }

      if (isVolumeDownHotkey(ev)) {
        ev.preventDefault();
        adjustVolume(-VOLUME_HOTKEY_STEP);
        showVolumeToast();
        return;
      }

      if (isVolumeUpHotkey(ev)) {
        ev.preventDefault();
        adjustVolume(VOLUME_HOTKEY_STEP);
        showVolumeToast();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [adjustVolume, showVolumeToast]);

  if (!roomId) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col gap-2 sm:gap-4 p-2 sm:p-4 max-w-400 mx-auto w-full">
      <ConnectionStatusBar
        isConnected={isConnected}
        latencyAvg={latencyAvg}
        settingDialogRef={settingDialogRef}
        canvasRef={canvasRef}
        canvasParentRef={canvasParentRef}
        progressBarRef={progressBarRef}
      />

      {/* 顶部区域：曲目信息 + 控制按钮 + 房间信息（手机端改为纵向） */}
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        <SongInfoCard
          songInfo={currentSong}
          isJudging={isJudging}
          compact={true}
          className="flex-1"
          showAlbum={true}
        />
        <OwnerControls
          isOwner={isOwner}
          audioState={audioState}
          isPlaybackStateMissing={isPlaybackStateMissing}
          isWsDisconnected={isWsDisconnected}
          isJudging={isJudging}
          roomState={roomState}
          judgingDialogRef={judgingDialogRef}
          onTogglePlayPause={handleTogglePlayPause}
          onGameStart={handleGameStart}
          onSkipRound={handleSkipRound}
          onEndRound={handleEndRound}
          onShowSong={handleShowSong}
          roomId={roomId}
        />
        <RoomInfo
          roomId={roomId}
          roomTitle={roomState?.title}
          roomOwner={roomOwner}
          roomIdCopyState={roomIdCopyState}
          onCopyRoomId={handleCopyRoomId}
          onCopyJoinLink={handleCopyJoinLink}
        />
      </div>

      {/* 中部区域：抢答键 + 排行榜 + 玩家列表（手机端改为纵向） */}
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        <BuzzButton
          isConnected={isConnected}
          isCurrentPlayerInAnswerQueue={isCurrentPlayerInAnswerQueue}
          isBuzzHotkeyActive={isBuzzHotkeyActive}
          user={user}
          roomStatus={roomState?.status}
          onBuzz={handleBuzz}
        />
        <Scoreboard scores={scores} userId={userId} />
        <PlayerList
          sortedOnlinePlayers={sortedOnlinePlayers}
          answerOrderByUserId={answerOrderByUserId}
          buzzedPlayerIds={buzzedPlayerIds}
          buzzedOrderByUserId={buzzedOrderByUserId}
          currentAnsweringPlayer={currentAnsweringPlayer}
          userId={userId}
          isOwner={isOwner}
          isWsDisconnected={isWsDisconnected}
          onRemovePlayer={handleRemovePlayer}
        />
      </div>

      <PlayerAnswersTable
        playerAnswers={playerAnswers}
        tagGroups={tagGroups}
        userId={userId}
      />

      <VolumeToast
        isVisible={isVolumeToastVisible}
        isClosing={isVolumeToastClosing}
        localVolume={localVolume}
      />

      <SettingDialog
        dialogRef={settingDialogRef}
        theme={theme}
        setTheme={setTheme}
        localVolume={localVolume}
        setVolume={setVolume}
      />

      <JudgingDialog
        dialogRef={judgingDialogRef}
        confirmAnswerDialogRef={confirmAnswerDialogRef}
        currentSong={currentSong}
        tagGroups={tagGroups}
        selectedTags={selectedTags}
        selectedDescriptions={selectedDescriptions}
        historyTagIds={historyTagIds}
        referenceDescriptions={referenceDescriptions}
        playerDescriptions={playerDescriptions}
        onSelectTag={handleSelectJudgingTag}
        onToggleDescription={handleToggleDescription}
        isJudgingSubmitted={hasJudgingSubmitted}
      />

      <ConfirmAnswerDialog
        dialogRef={confirmAnswerDialogRef}
        isWsDisconnected={isWsDisconnected}
        onSubmit={handleJudgeSubmit}
      />

      <RemovePlayerDialog
        dialogRef={removePlayerDialogRef}
        isWsDisconnected={isWsDisconnected}
        onConfirm={confirmRemovePlayer}
      />

      <AnswerModal
        dialogRef={answerModalRef}
        isOpen={isAnswerModalOpen && !isAnswerModalMinimized}
        tagGroups={tagGroups}
        selectedTags={selectedTagByGroup}
        description={description}
        isWsDisconnected={isWsDisconnected}
        onSelectTag={selectGroupTag}
        onDescriptionChange={setDescription}
        onToggleMinimize={toggleAnswerModal}
        onSubmit={handleSubmitAnswer}
      />

      <AnswerModalFloatingButton
        isVisible={isAnswerModalOpen && isAnswerModalMinimized}
        onClick={toggleAnswerModal}
      />

      <RoundSummaryDialog
        isOpen={isRoundSummaryOpen && roundSummary !== null}
        roundScore={roundSummary?.roundScore ?? 0}
        rankChange={roundSummary?.rankChange ?? null}
        currentRank={roundSummary?.currentRank ?? null}
        correctTags={lastJudgedAnswers?.correctTags ?? []}
        correctDescriptionIds={lastJudgedAnswers?.correctDescriptionIds ?? []}
        playerDescriptions={playerDescriptions}
        autoCloseMs={ROUND_SUMMARY_AUTO_CLOSE_MS}
        onClose={closeRoundSummaryDialog}
      />

      {/* AudioContext 被浏览器拦截时的提示弹窗 */}
      {showAudioPrompt && (
        <dialog className="modal modal-open" open>
          <div className="modal-box">
            <h3 className="font-bold text-lg">需要您的操作</h3>
            <p className="py-4">
              浏览器已暂停音频播放，请点击下方按钮恢复音频。
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  handleAudioPromptClick(audioRef.current);
                }}
              >
                恢复音频播放
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeAudioPrompt}
              >
                稍后处理
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}

export default RoomPage;
