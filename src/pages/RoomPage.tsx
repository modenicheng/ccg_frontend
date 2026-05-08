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
import { useIsOwner, useAudioContextInterceptor, useKeyboardShortcuts } from "../hooks";
import { useRoomAudio } from "../hooks/useRoomAudio";
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
  canBuzz,
} from "../utils/gameHelpers";
import { registerRoomEventHandlers } from "./roomWsHandlers";

const WS_RETRY = { max: 10 };
const ROOM_ID_COPY_FEEDBACK_MS = 1800;
const ROUND_SUMMARY_AUTO_CLOSE_MS = 8000;

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

  const roomState = useGameStore((state) => state.roomState);
  const roundState = useGameStore((state) => state.roundState);
  const roundStateCode = useGameStore((state) => state.roundStateCode);
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
  const [answerDeadline, setAnswerDeadline] = useState<number | null>(null);
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
  const hasUserInteractedRef = useRef<boolean>(false);
  const hasCheckedInitialPlaybackPromptRef = useRef<boolean>(false);

  // --- useRoomAudio hook ---
  const {
    audioRef,
    canvasRef,
    canvasParentRef,
    progressBarRef,
    isProgressDraggingRef,
    currentAudioUrlRef,
    shouldForcePlaybackResyncRef,
    recentPreloadByUrlRef,
    switchingAudioUrlRef,
    playbackSyncSuppressionDepthRef,
    audioState,
    localVolume,
    setCurrentAudioUrl,
    isVolumeToastVisible,
    isVolumeToastClosing,
    needsGesturePromptOnInit,
    setNeedsGesturePromptOnInit,
    sendPlaybackControl,
    setVolume,
    adjustVolume,
    showVolumeToast,
    applyRemoteProgress,
    withPlaybackSyncSuppressed,
    switchAudioSourceIfNeeded,
    tryPlayUrlWithRetry,
    handleRecoverPlaybackWithGesture,
    reportAudioError,
    notifyAudioLoadError,
  } = useRoomAudio({
    wsRef,
    isOwner,
    isWindowFocused,
    roomStatus: roomState?.status,
    roomId,
    isConnected,
    latencyAvg,
    initialVolume: persistVolume,
    setupAudioPlayerInterceptor,
    handleAudioPromptClick,
    setPersistVolume,
    pushToast,
  });

  const selectGroupTag = (groupId: number, tagId: number) => {
    setSelectedTagByGroup((prev) => ({
      ...prev,
      [groupId]: tagId,
    }));
  };

  const clearSelectedTags = () => {
    setSelectedTagByGroup({});
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

  const userIdRef = useRef<number | null>(userId);

  const settingDialogRef = useRef<HTMLDialogElement | null>(null);
  const judgingDialogRef = useRef<HTMLDialogElement | null>(null);
  const confirmAnswerDialogRef = useRef<HTMLDialogElement | null>(null);
  const removePlayerDialogRef = useRef<HTMLDialogElement | null>(null);
  const [playerToRemove, setPlayerToRemove] = useState<number | null>(null);

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

  const syncAnswerQueueState = useCallback((
    queue: AnswerQueueItem[],
    answerQueueTailPlayerId: number | null,
  ) => {
    const activeQueue = getActiveAnswerQueue(queue, answerQueueTailPlayerId);

    setAnswerOrderByUserId(
      queue.reduce<Record<number, number>>((acc, item, index) => {
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
    [currentAudioUrlRef],
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

    if (!canBuzz(roundStateCode)) {
      console.debug("[buzz] skip: round state does not allow buzzing");
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
  }, [addAttemptOrder, getCalibratedNow, isConnected, userId, roomState?.status, roundStateCode, audioRef]);

  const { isBuzzHotkeyActive } = useKeyboardShortcuts({
    isConnected,
    handleBuzz,
    adjustVolume,
    showVolumeToast,
    showAudioPrompt,
    needsGesturePromptOnInit,
    handleRecoverPlaybackWithGesture,
    hasUserInteractedRef,
  });

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
    userIdRef.current = userId;
  }, [userId]);

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
      setAnswerDeadline,
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
    audioRef,
    currentAudioUrlRef,
    isProgressDraggingRef,
    playbackSyncSuppressionDepthRef,
    recentPreloadByUrlRef,
    setCurrentAudioUrl,
    setNeedsGesturePromptOnInit,
    shouldForcePlaybackResyncRef,
    switchingAudioUrlRef,
  ]);

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
      if (roomIdCopyTimerRef.current !== null) {
        window.clearTimeout(roomIdCopyTimerRef.current);
        roomIdCopyTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
          roundState={roundState}
          roundStateCode={roundStateCode}
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
          canBuzzInCurrentRound={canBuzz(roundStateCode)}
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
        answerDeadline={answerDeadline}
        onSelectTag={selectGroupTag}
        onDescriptionChange={setDescription}
        onToggleMinimize={toggleAnswerModal}
        onSubmit={handleSubmitAnswer}
        onClearSelection={clearSelectedTags}
      />

      <AnswerModalFloatingButton
        isVisible={isAnswerModalOpen && isAnswerModalMinimized}
        answerDeadline={answerDeadline}
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
