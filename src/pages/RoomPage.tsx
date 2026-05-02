import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { WS } from "../wsClient";
import { GameEventId } from "../types/eventTypes";
import { startHeartbeat } from "../wsClient/handlers";
import useWebSocketStore from "../stores/webSocketStore";
import useErrorToastStore from "../stores/errorToastStore";
import usePersistStore from "../stores/persistStore";
import { gameStore, useGameStore } from "../stores/gameStore";
import { audioPlayer } from "../audioPlayer";
import { useIsOwner, useAudioContextInterceptor } from "../hooks";
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
  PlayControlMessage,
  AttemptAnswerMessage,
  PlaybackState,
} from "../types/wsMessages";
import {
  isPlayControlData,
} from "../types/wsMessages";
import { syncRoomAuthToSession } from "../utils/roomAuth";
import { copyTextToClipboard } from "../utils/common";
import { buildRoomWsUrl } from "../utils/wsEndpoint";
import {
  getActiveAnswerQueue,
} from "../utils/gameHelpers";
import { registerRoomEventHandlers } from "./roomWsHandlers";

const WS_RETRY = { max: 10 };
const AUDIO_SYNC_THRESHOLD_MS = 20;
const CANVAS_INIT_DELAY_MS = 0;
const VOLUME_HOTKEY_STEP = 5;
const VOLUME_TOAST_HIDE_DELAY_MS = 3000;
const VOLUME_TOAST_EXIT_ANIMATION_MS = 220;
const ROOM_ID_COPY_FEEDBACK_MS = 1800;
const ROUND_SUMMARY_AUTO_CLOSE_MS = 8000;

let domProgressPercent = 0;

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
  const tokenFromSession =
    sessionStorage.getItem(`ccg-room-token:${roomId}`)?.trim() || null;
  const tokenFromPersist = user?.token?.trim() || null;
  const usernameFromSession =
    sessionStorage.getItem(`ccg-room-username:${roomId}`)?.trim() || null;
  const usernameFromPersist = user?.username?.trim() || null;
  const wsAuthToken = tokenFromSession ?? tokenFromPersist;
  const wsAuthUsername = usernameFromSession ?? usernameFromPersist;
  const userId =
    user?.id ??
    (Number.isFinite(fallbackUserIdFromSession)
      ? fallbackUserIdFromSession
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
  const [currentSongId, setCurrentSongId] = useState<number | null>(null);
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
    setupAudioPlayerInterceptor,
  } = useAudioContextInterceptor();
  const [needsGesturePromptOnInit, setNeedsGesturePromptOnInit] =
    useState<boolean>(false);
  const hasUserInteractedRef = useRef<boolean>(false);
  const hasCheckedInitialPlaybackPromptRef = useRef<boolean>(false);

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
        ? `GUESongS - 房间${roomTitle}|${roomId}`
        : `GUESongS - 房间${roomId}`;
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
  const playbackSyncSuppressionDepthRef = useRef<number>(0);
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

      const shouldSuppressOutboundSync =
        playbackSyncSuppressionDepthRef.current > 0 &&
        (event === GameEventId.PLAY || event === GameEventId.PAUSE);

      if (event === GameEventId.PLAY) {
        await audioRef.current.resume();
      } else if (event === GameEventId.PAUSE) {
        await audioRef.current.pause();
      }

      if (shouldSuppressOutboundSync) {
        return;
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
    setCurrentSongId(null);
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
      const isWaitingLoopingWarmup = latestRoomState?.status === "waiting";
      const shouldSeekOnPause =
        latestRoomState?.status === "waiting" ||
        latestRoomState?.playback_status?.current_order === -1;

      const durationMs = audioRef.current.durationMs;
      if (isWaitingLoopingWarmup && durationMs > 0) {
        expectedMs = ((expectedMs % durationMs) + durationMs) % durationMs;
      }

      // 对局中 PAUSE 继续保持“默认不 seek”，避免抢答时回拉；
      // 但预热 BGM / test audio（waiting 或 current_order=-1）必须 seek 才能实现房主与玩家暂停位点同步。
      if (shouldSeek && (!isPauseEvent || shouldSeekOnPause)) {
        const clamped =
          durationMs > 0 ? Math.min(expectedMs, durationMs) : expectedMs;
        audioRef.current.progressMs = clamped;
      }
    },
    [getCalibratedNow],
  );

  const withPlaybackSyncSuppressed = useCallback(
    async (task: () => Promise<void>) => {
      playbackSyncSuppressionDepthRef.current += 1;
      try {
        await task();
      } finally {
        playbackSyncSuppressionDepthRef.current = Math.max(
          0,
          playbackSyncSuppressionDepthRef.current - 1,
        );
      }
    },
    [],
  );

  const handleRecoverPlaybackWithGesture = useCallback(async () => {
    await handleAudioPromptClick(audioRef.current);

    const latestPlaybackStatus = gameStore.getState().roomState?.playback_status;
    if (!latestPlaybackStatus || latestPlaybackStatus.play_state !== "playing") {
      return;
    }

    const pseudoMessage: PlayControlMessage = {
      event: GameEventId.PLAY,
      ts: latestPlaybackStatus.updated_at,
      data: {
        progress_ms: latestPlaybackStatus.progress_ms,
        offset_ts: latestPlaybackStatus.offset_ts,
        audio_url: latestPlaybackStatus.audio_url,
        current_order: latestPlaybackStatus.current_order,
      },
    };

    await withPlaybackSyncSuppressed(async () => {
      applyRemoteProgress(pseudoMessage, true);
      await audioRef.current?.resume();
    });
    setNeedsGesturePromptOnInit(false);
  }, [
    applyRemoteProgress,
    handleAudioPromptClick,
    withPlaybackSyncSuppressed,
  ]);

  useEffect(() => {
    const markUserInteraction = () => {
      hasUserInteractedRef.current = true;
    };

    window.addEventListener("pointerdown", markUserInteraction, {
      passive: true,
      once: true,
    });
    window.addEventListener("keydown", markUserInteraction, { once: true });

    return () => {
      window.removeEventListener("pointerdown", markUserInteraction);
      window.removeEventListener("keydown", markUserInteraction);
    };
  }, []);

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
    if (!roomId || !wsAuthToken || userId === null) {
      return;
    }

    if (userId !== null && wsAuthUsername) {
      const wsIdentity = {
        id: userId,
        token: wsAuthToken,
        username: wsAuthUsername,
      };
      syncRoomAuthToSession(roomId, wsIdentity);
    }

    const wsUrl = buildRoomWsUrl(roomId, wsAuthToken, userId);

    wsRef.current = new WS(wsUrl, WS_RETRY);
    setWsClient(wsRef.current);

    // 确保AudioContext处于运行状态（满足浏览器自动播放政策）
    audioRef.current?.ensureRunning().catch((err) => {
      console.error("[WS_INIT] Failed to ensure AudioContext running:", err);
    });

    const disposeHandlers = registerRoomEventHandlers(wsRef.current, {
      roomId,
      userIdRef,
      wsAuthToken,
      audioRef,
      currentAudioUrlRef,
      switchingAudioUrlRef,
      isProgressDraggingRef,
      shouldForcePlaybackResyncRef,
      hasCheckedInitialPlaybackPromptRef,
      hasUserInteractedRef,
      recentPreloadByUrlRef,
      playbackSyncSuppressionDepthRef,
      setOnlinePlayers,
      setAnswerOrderByUserId,
      setPlayerAnswers,
      setTagGroups,
      setSelectedTagByGroup,
      setCurrentAnsweringPlayer,
      setIsAnswerModalOpen,
      setIsAnswerModalMinimized,
      setIsJudging,
      setHasJudgingSubmitted,
      setCurrentSong,
      setCurrentSongId,
      setHistoryTagIds,
      setReferenceDescriptions,
      setPlayerDescriptions,
      setSelectedTags,
      setSelectedDescriptions,
      setRoundSummary,
      setIsRoundSummaryOpen,
      setRoomOwner,
      setCurrentAudioUrl,
      setNeedsGesturePromptOnInit,
      setDescription,
      syncAnswerQueueState,
      addAttemptOrder,
      applyRemoteProgress,
      tryPlayUrlWithRetry,
      withPlaybackSyncSuppressed,
      switchAudioSourceIfNeeded,
      buildPlaybackStatusFromPlayControl,
      syncPlaybackStatusToRoomState,
      reportAudioError,
      notifyAudioLoadError,
      closeRoundSummaryDialog,
      resetRoundTransientState,
      navigate,
      pushToast,
      addUser,
      removeUser,
    });

    wsRef.current.onConnectionStateChange(setConnected);

    setUrl(wsUrl);
    setRoomId(roomId);

    const stopHeartbeat = startHeartbeat(wsRef.current, 1000, 1000);

    return () => {
      disposeHandlers();
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
    withPlaybackSyncSuppressed,
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

    const joinLink = `${window.location.origin}/join/${roomId}`;
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

  useEffect(() => {
    if (!showAudioPrompt && !needsGesturePromptOnInit) {
      return;
    }

    const handleUserGesture = () => {
      hasUserInteractedRef.current = true;
      void handleRecoverPlaybackWithGesture();
    };

    window.addEventListener("pointerdown", handleUserGesture, {
      passive: true,
      once: true,
    });
    window.addEventListener("keydown", handleUserGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
    };
  }, [handleRecoverPlaybackWithGesture, showAudioPrompt, needsGesturePromptOnInit]);

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
      <div className="flex flex-col sm:flex-row sm:items-stretch gap-2 w-full h-full">
        <SongInfoCard
          songInfo={currentSong}
          compact={true}
          compactLarge={true}
          className="flex-1 basis-0 min-w-0"
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
        />
        <RoomInfo
          roomId={roomId}
          roomTitle={roomState?.title}
          roomOwner={roomOwner}
          managePageHref={isOwner ? `/room/${roomId}/manage` : undefined}
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
        currentSongId={currentSongId}
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
      {(showAudioPrompt || needsGesturePromptOnInit) && (
        <dialog className="modal modal-open" open>
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg">浏览器已阻止自动播放</h3>
            <p className="py-4">
              请先点击页面任意位置（或按任意键），系统会自动尝试恢复播放。
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRecoverPlaybackWithGesture}
              >
                立即恢复播放
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
