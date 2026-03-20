import clsx from "clsx";
import { Icon } from "@iconify-icon/react";
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
import type { RoomState } from "../types/store";
import { UserBar, TagGroupSelector, SongInfoCard } from "../components";
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
} from "../types/wsMessages";
import {
  isPlayControlData,
  mapStatusCodeToStatus,
  getPlayersSimple,
  getTagGroupsSimple,
} from "../types/wsMessages";

const development = import.meta.env.DEV;
const WS_RETRY = { max: 10 };
const AUDIO_SYNC_THRESHOLD_MS = 20;
const SYNC_AUDIO_URL = `https://cdn.modenc.top/files/Orig.mp3`;
const CANVAS_INIT_DELAY_MS = 0;
const PRELOAD_DEDUP_WINDOW_MS = 3000;
const VOLUME_HOTKEY_STEP = 5;
const VOLUME_TOAST_HIDE_DELAY_MS = 3000;
const VOLUME_TOAST_EXIT_ANIMATION_MS = 220;
const ROOM_ID_COPY_FEEDBACK_MS = 1800;

let domProgressPercent = 0;
const themes = ["light", "dark", "night", "cyberpunk", "emerald", "nord"];

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

const readCookie = (name: string): string | null => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matched = document.cookie.match(
    new RegExp(`(?:^|; )${escaped}=([^;]*)`),
  );
  if (!matched) {
    return null;
  }
  try {
    return decodeURIComponent(matched[1]);
  } catch {
    return matched[1];
  }
};

const clearCookie = (name: string) => {
  document.cookie = `${name}=; path=/; Max-Age=0; SameSite=Lax`;
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

const parseErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return `${fallback}：${error.message}`;
  }
  return fallback;
};

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("execCommand copy failed");
    }
  } finally {
    document.body.removeChild(textArea);
  }
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
  const wsAuthToken = tokenFromSession ?? tokenFromCookie ?? tokenFromPersist;
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
  const [isReady, setIsReady] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // 房主判定：优先使用持久化身份，回退到房间实时玩家列表判定（避免本地状态缺失导致误判）
  const isOwner = useMemo(() => {
    if (user?.isOwner) {
      return true;
    }
    if (userId === null || !roomState?.players?.length) {
      return false;
    }
    return roomState.players.some((player) => player.id === userId && player.is_owner);
  }, [roomState?.players, user?.isOwner, userId]);

  const selectGroupTag = (groupId: number, tagId: number) => {
    setSelectedTagByGroup((prev) => ({
      ...prev,
      [groupId]: tagId,
    }));
  };

  const navigate = useNavigate();

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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasParentRef = useRef<HTMLDivElement | null>(null);
  const canvasInitializedRef = useRef(false);
  const canvasInitTimerRef = useRef<number | null>(null);

  const settingDialogRef = useRef<HTMLDialogElement | null>(null);
  const judgingDialogRef = useRef<HTMLDialogElement | null>(null);
  const skipConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
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
  const volumeToastHideTimerRef = useRef<number | null>(null);
  const volumeToastExitTimerRef = useRef<number | null>(null);
  const roomIdCopyTimerRef = useRef<number | null>(null);
  const isPlaybackStateMissing = roomState?.playback_status === null;
  const isWsDisconnected = !isConnected;

  const notifyAudioLoadError = useCallback((message: string) => {
    pushToast({ message, variant: "error" });
  }, [pushToast]);

  const syncAnswerQueueState = useCallback((queue: AnswerQueueItem[]) => {
    setAnswerOrderByUserId(
      queue.reduce<Record<number, number>>((acc, item, index) => {
        const order = item.order ?? index + 1;
        acc[item.player_id] = order;
        return acc;
      }, {}),
    );

    const answeringPlayer = queue.find((item) => item.is_answering)?.player_id ?? null;
    setCurrentAnsweringPlayer(answeringPlayer);

    const latestRoomState = gameStore.getState().roomState;
    if (latestRoomState) {
      gameStore.getState().setRoomState({
        ...latestRoomState,
        answer_queue: queue,
      });
    }
  }, []);

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
  }, [addAttemptOrder, getCalibratedNow, isConnected, userId]);

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

  const handleReady = useCallback(() => {
    if (!isConnected || !wsRef.current?.isConnected() || userId === null) {
      return;
    }

    const payload = {
      event: GameEventId.PLAYER_READY,
      ts: Math.round(getCalibratedNow()),
      data: {
        user_id: userId,
        ready: !isReady,
      },
    };

    void wsRef.current.sendJson(payload);
  }, [isConnected, getCalibratedNow, userId, isReady]);

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

      const progressMs = audioRef.current.currentTimeMs;
      const calibratedNow = Math.round(getCalibratedNow());
      const payload: PlayControlMessage = {
        event,
        ts: calibratedNow,
        data: {
          progress_ms: progressMs,
          offset_ts: calibratedNow,
          audio_url: currentAudioUrl || SYNC_AUDIO_URL,
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
    const correctTags = Object.values(selectedTags).filter(
      (tagId): tagId is number => tagId !== null,
    );

    // 收集选中的描述ID
    const correctDescriptionIds = selectedDescriptions;

    const payload = {
      event: GameEventId.JUDGE_SUBMIT,
      ts: Math.round(getCalibratedNow()),
      data: {
        correct_tags: correctTags,
        correct_description_ids: correctDescriptionIds,
        new_correct_descriptions: [],
        skip_scoring: false,
      },
    };

    void wsRef.current.sendJson(payload);
    judgingDialogRef.current?.close();
    confirmAnswerDialogRef.current?.close();
  }, [selectedTags, selectedDescriptions, getCalibratedNow, isOwner]);

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
    skipConfirmDialogRef.current?.close();
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

      // PLAY/SEEK 才按 offset_ts 外推；PAUSE 表示“冻结时刻”，不应继续累加 elapsed
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

      if (shouldSeek) {
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
    sendPlaybackControlRef.current = sendPlaybackControl;
  }, [sendPlaybackControl]);

  useEffect(() => {
    if (!roomId || !wsAuthToken) {
      return;
    }

    let isDisposed = false;

    if (tokenFromSession !== wsAuthToken) {
      sessionStorage.setItem(`ccg-room-token:${roomId}`, wsAuthToken);
    }

    const wsUrl = buildWsUrl(roomId, wsAuthToken);

    wsRef.current = new WS(wsUrl, WS_RETRY);
    setWsClient(wsRef.current);

    wsRef.current.on(EventType.HEARTBEAT, heartbeatHandler);
    wsRef.current.onJsonEvent<RoomStateMessage>(
      GameEventId.ROOM_STATE,
      async (message) => {
        if (isDisposed) {
          return;
        }
        const payload = message.data;

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

          // 播放相关
          song_start_range_percent: payload.song_start_range_percent,

          // 玩家和队列
          players: payload.players,
          answer_queue: payload.answer_queue,

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

        // 同步音频播放器状态
        const playbackStatus = payload.playback_status;
        const audioPlayer = audioRef.current;

        if (playbackStatus && audioPlayer && !isProgressDraggingRef.current) {
          try {
            // 检查是否需要切换音频URL
            const newAudioUrl = playbackStatus.audio_url;
            if (newAudioUrl && newAudioUrl !== currentAudioUrlRef.current) {
              logAudioTrigger("ROOM_STATE", newAudioUrl);
              // 切换音频源
              await switchAudioSourceIfNeeded(newAudioUrl);
            }

            // 创建伪PlayControlMessage用于applyRemoteProgress
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

            // 强制同步进度
            applyRemoteProgress(pseudoMessage, true);

            // 同步播放状态
            if (playbackStatus.play_state === "playing") {
              void audioPlayer.resume();
            } else if (playbackStatus.play_state === "paused") {
              void audioPlayer.pause();
            }
          } catch (error) {
            console.error("Failed to sync audio playback:", error);
            notifyAudioLoadError(
              parseErrorMessage(error, "音频加载失败，请稍后重试"),
            );
            // 音频同步失败，但继续其他初始化
          }
        }

        // 初始化积分表（后端ROOM_STATE中的scores为累计明细，前端展示总分）
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
        // 显示所有玩家（包括离线的），后端会在对局开始后保留玩家但标记为离线
        setOnlinePlayers(payload.players);
        setAnswerOrderByUserId(
          payload.answer_queue.reduce<Record<number, number>>((acc, item) => {
            const order =
              item.order ?? acc[item.player_id] ?? Object.keys(acc).length + 1;
            acc[item.player_id] = order;
            return acc;
          }, {}),
        );
        // 房间任意状态都保留全部玩家，仅通过 online 字段展示在线状态
        setOnlinePlayers(payload.players);
        syncAnswerQueueState(payload.answer_queue);

        setTagGroups(payload.tag_groups);
        setSelectedTagByGroup(
          payload.tag_groups.reduce<Record<number, number | null>>(
            (acc, group) => {
              acc[group.id] = null;
              return acc;
            },
            {},
          ),
        );
      },
    );
    wsRef.current.onJsonEvent<PlayControlMessage>(
      GameEventId.SEEK,
      (message) => {
        applyRemoteProgress(message, false);
      },
    );
    wsRef.current.onJsonEvent<PlayControlMessage>(
      GameEventId.PLAY,
      async (message) => {
        setAnswerOrderByUserId({});
        setCurrentAnsweringPlayer(null);
        applyRemoteProgress(message, true);
        await audioRef.current?.resume();
        setIsJudging(false);
        // 播放时隐藏曲目信息
        setCurrentSong(null);
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

        setPlayerAnswers((prev) => {
          const existing = prev.find((item) => item.playerId === playerIdNum);
          const fallbackOrder = existing?.order ?? prev.length + 1;
          const nextOrder = orderFromQueue ?? fallbackOrder;

          if (existing) {
            return prev.map((item) =>
              item.playerId === playerIdNum
                ? {
                    ...item,
                    username: playerName,
                    answers: selectedAnswerMap,
                    description: descriptionText,
                    order: nextOrder,
                  }
                : item,
            );
          }

          return [
            ...prev,
            {
              playerId: playerIdNum,
              username: playerName,
              answers: selectedAnswerMap,
              description: descriptionText,
              order: nextOrder,
            },
          ];
        });
      },
    );

    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.SKIP_ROUND;
      ts: number;
      data: Record<string, never>;
    }>(GameEventId.SKIP_ROUND, () => {
      resetRoundTransientState();
      syncAnswerQueueState([]);
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
      };
    }>(GameEventId.JUDGING, (message) => {
      setIsJudging(true);
      const latestTagGroups = gameStore.getState().roomState?.tag_groups ?? [];
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

      // 初始化选中的标签
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
      // 处理得分更新
      if (message.data?.scores) {
        // 更新游戏状态中的得分信息
        console.log("Score updated:", message.data.scores);
        gameStore.getState().setScores(message.data.scores);
      }
    });
    wsRef.current.onJsonEvent<PlayControlMessage>(
      GameEventId.PAUSE,
      async (message) => {
        applyRemoteProgress(message, true);
        await audioRef.current?.pause();
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
      setCountdown(null);
      setIsReady(false);
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
      const { user_id, ready } = message.data;
      if (user_id === userIdRef.current) {
        setIsReady(ready);
      }
    });

    // 处理回合开始事件
    wsRef.current.onJsonEvent<RoundStartMessage>(
      GameEventId.ROUND_START,
      async (message) => {
        if (isDisposed) {
          return;
        }
        const roundData = message.data;

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
            audioRef.current.progressMs = startMs;
          }
        } else if (audioRef.current) {
          audioRef.current.progressMs = 0;
        }

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
        syncAnswerQueueState([]);
        console.log("Answer queue cleared");
      },
    );

    // 处理抢答队列更新事件
    wsRef.current.onJsonEvent<AnswerQueueMessage>(GameEventId.ANSWER_QUEUE, (message) => {
      const queue = message.data?.queue ?? [];
      syncAnswerQueueState(queue);
      console.log("Answer queue updated:", queue);
    });

    // 处理音频预加载事件
    wsRef.current.onJsonEvent<PreloadAudioMessage>(
      GameEventId.PRELOAD_AUDIO,
      async (message) => {
        if (isDisposed) {
          return;
        }
        const { audio_url } = message.data;
        if (!audio_url) {
          return;
        }

        const now = Date.now();
        const lastPreloadTs = recentPreloadByUrlRef.current[audio_url] ?? 0;
        if (now - lastPreloadTs < PRELOAD_DEDUP_WINDOW_MS) {
          return;
        }

        if (
          audioRef.current &&
          audio_url !== currentAudioUrlRef.current &&
          audio_url !== switchingAudioUrlRef.current
        ) {
          try {
            logAudioTrigger("PRELOAD", audio_url);
            recentPreloadByUrlRef.current[audio_url] = now;
            await audioRef.current.preload(audio_url);
            console.log(`Audio preloaded: ${audio_url}`);
          } catch (error) {
            console.error("Failed to preload audio:", error);
            notifyAudioLoadError(
              parseErrorMessage(error, "音频预加载失败，请稍后重试"),
            );
          }
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
    roomId,
    resetRoundTransientState,
    setConnected,
    setRoomId,
    setUrl,
    setWsClient,
    syncAnswerQueueState,
    switchAudioSourceIfNeeded,
    notifyAudioLoadError,
    navigate,
    pushToast,
    addUser,
    removeUser,
    tokenFromSession,
    wsAuthToken,
  ]);

  useEffect(() => {
    audioRef.current = new audioPlayer();
    audioRef.current.volume = initialVolumeRef.current;
    audioRef.current.onStateChange = (nextState) => {
      setAudioState(nextState);
    };
    setAudioState(audioRef.current.state);
    audioRef.current.onEnded = () => {
      if (!isOwnerRef.current || !wsRef.current?.isConnected()) {
        return;
      }
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
  }, []);

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
    <div className="flex flex-col gap-4 p-4 max-w-400 mx-auto">
      <div className="w-full flex gap-2">
        <div className="card shadow-sm">
          <div className="card-body p-4 flex-row items-center gap-2">
            <span
              className={clsx("status", {
                "status-success animate-pulse": isConnected,
                "status-error": !isConnected,
              })}
            ></span>
            <span
              className={clsx("font-mono text-sm", {
                "text-success": isConnected && latencyAvg && latencyAvg < 40,
                "text-warning":
                  isConnected &&
                  latencyAvg &&
                  latencyAvg >= 40 &&
                  latencyAvg < 100,
                "text-error":
                  !isConnected || (latencyAvg !== null && latencyAvg >= 100),
              })}
            >
              {isConnected
                ? latencyAvg !== null
                  ? `${latencyAvg.toFixed(1)} ms`
                  : "N/A"
                : "Connecting..."}
            </span>
          </div>
        </div>
        <div className="card shadow-sm flex-1 overflow-hidden progress-parent">
          <div className="card-body p-0 h-12" ref={canvasParentRef}>
            <canvas ref={canvasRef}></canvas>
            <span ref={progressBarRef} className="progress-bar" />
          </div>
        </div>
        <div
          className="btn btn-ghost h-full p-3 shadow-sm"
          onClick={() => settingDialogRef.current?.showModal()}
        >
          <Icon
            icon="heroicons:cog-6-tooth"
            width={28}
            height={28}
            cellPadding={0}
          />
        </div>
      </div>
      <div className="flex gap-2 w-full">
        <SongInfoCard
          songInfo={isJudging ? currentSong : null}
          isJudging={isJudging}
          compact={true}
          className="flex-1"
          showAlbum={true}
        />
        {isOwner ? (
          <div className="card shadow-sm min-w-xs">
            <div className="card-body user-drag-none">
              <button
                type="button"
                className={clsx("btn btn-sm btn-soft", {
                  "btn-success": audioState !== "running",
                  "btn-warning": audioState === "running",
                })}
                disabled={isPlaybackStateMissing || isWsDisconnected}
                onClick={handleTogglePlayPause}
              >
                {isPlaybackStateMissing ? (
                  "暂无播放状态"
                ) : (
                  <>
                    <Icon
                      icon={
                        audioState === "running"
                          ? "heroicons:pause"
                          : "heroicons:play"
                      }
                      width={16}
                      height={16}
                    />
                    {audioState === "running" ? "暂停" : "播放"}
                  </>
                )}
              </button>
              <div className="join w-full">
                <button
                  type="button"
                  className={clsx("btn btn-sm btn-soft join-item flex-1", {
                    "btn-primary": roomState?.statusCode === 0,
                    "btn-warning": roomState?.statusCode !== 0,
                  })}
                  disabled={isWsDisconnected}
                  onClick={() => {
                    if (roomState?.statusCode === 0) {
                      handleGameStart();
                      return;
                    }
                    skipConfirmDialogRef.current?.showModal();
                  }}
                >
                  {roomState?.statusCode === 0 ? (
                    "开始游戏"
                  ) : (
                    <>
                      <Icon
                        icon="heroicons:chevron-double-right-20-solid"
                        width={16}
                        height={16}
                      />
                      下一轮
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-info btn-sm btn-soft join-item flex-1"
                  disabled={isWsDisconnected}
                  onClick={() => judgingDialogRef.current?.showModal()}
                >
                  <Icon icon="heroicons:scale" width={16} height={16} />
                  判分
                </button>
              </div>
              <a
                className="btn btn-sm  btn-soft"
                href={`/room/${roomId}/manage`}
                target="_blank"
                rel="noopener noreferrer"
              >
                管理页面
              </a>
            </div>
          </div>
        ) : null}
        <div className="card shadow-sm max-w-sm min-w-3xs">
          <div className="card-body">
            <h2 className="text-lg font-semibold flex items-center">
              <Icon
                icon="heroicons:home"
                className="mr-2"
                width="24"
                height="24"
              />
              {roomState?.roomId ? `${roomState.title}` : "房间信息"}
            </h2>
            <div className="divider m-0"></div>
            <div>房主： {roomOwner}</div>
            <div className="flex items-center gap-1.5 text-sm">
              <span>
                房间ID： <span className="font-mono">{roomId}</span>
              </span>
              <button
                type="button"
                className={clsx("btn btn-ghost btn-xs btn-square", {
                  "text-success": roomIdCopyState === "success",
                  "text-error": roomIdCopyState === "error",
                })}
                onClick={handleCopyRoomId}
                title={
                  roomIdCopyState === "success"
                    ? "已复制"
                    : roomIdCopyState === "error"
                      ? "复制失败"
                      : "复制房间ID"
                }
                aria-label={`复制房间ID ${roomId}`}
              >
                <Icon
                  icon={
                    roomIdCopyState === "success"
                      ? "heroicons:clipboard-document-check"
                      : roomIdCopyState === "error"
                        ? "heroicons:exclamation-circle"
                        : "heroicons:clipboard-document"
                  }
                  width={16}
                  height={16}
                />
              </button>
            </div>
            <div className="text-sm mt-2">
              回合状态：
              <span
                className={clsx("px-2 py-0.5 rounded text-xs font-medium", {
                  "bg-blue-100 text-blue-800":
                    gameStore.getState().roundState === "PENDING",
                  "bg-green-100 text-green-800":
                    gameStore.getState().roundState === "PLAYING_AUDIO",
                  "bg-yellow-100 text-yellow-800":
                    gameStore.getState().roundState === "ANSWERING",
                  "bg-purple-100 text-purple-800":
                    gameStore.getState().roundState === "JUDGING",
                  "bg-gray-100 text-gray-800":
                    gameStore.getState().roundState === "COMPLETED",
                })}
              >
                {gameStore.getState().roundState}
              </span>
            </div>
            <div className="join w-full mt-4">
              <button
                type="button"
                className={clsx("btn btn-soft btn-sm join-item flex-1", {
                  "btn-success": isReady,
                  "btn-primary": !isReady,
                })}
                onClick={handleReady}
                disabled={!isConnected}
              >
                {isReady ? "取消准备" : "准备"}
              </button>
              {countdown !== null && (
                <div className="text-center py-2 bg-base-200 rounded-lg">
                  <div className="text-sm opacity-70">游戏即将开始</div>
                  <div className="text-2xl font-bold">{countdown}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-2 w-full">
        <div className="card shadow-sm">
          <button
            type="button"
            className={clsx("btn btn-primary w-2xs h-full p-4 flex-col gap-4", {
              "btn-disabled":
                !isConnected || isCurrentPlayerInAnswerQueue || !user,
              "btn-active": isBuzzHotkeyActive,
            })}
            disabled={!isConnected || isCurrentPlayerInAnswerQueue || !user}
            onClick={handleBuzz}
          >
            <h2 className="text-3xl">抢答！</h2>
            <div className="flex">
              <div className="kbd kbd-sm font-mono text-base-content">
                Space ␣
              </div>
              <div className="divider divider-horizontal m-0"></div>
              <div className="kbd kbd-sm font-mono text-base-content">
                Enter ⏎
              </div>
            </div>
          </button>
        </div>
        <div className="card shadow-sm flex-1 min-h-56">
          <div className="card-body overflow-auto p-0">
            <table className="table table-pin-cols table-pin-rows">
              <thead>
                <tr>
                  <th className="w-4 text-end">排名</th>
                  <th className="">玩家</th>
                  <td className="w-6 text-end">总分</td>
                </tr>
              </thead>
              <tbody>
                {scores.length > 0 ? (
                  [...scores]
                    .sort((a, b) => b.score - a.score)
                    .map((player, index) => (
                      <tr
                        key={player.player_id}
                        className={clsx({
                          "bg-primary/10 font-bold":
                            userId !== null && player.player_id === userId,
                        })}
                      >
                        <th className="text-end">{index + 1}</th>
                        <th className="text-nowrap">{player.username}</th>
                        <td className="text-end">{player.score}</td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan={3} className="text-center">
                      暂无得分记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card shadow-sm w-1/4 max-w-sm min-w-3xs">
          <div className="card-body p-2">
            <ul className="list gap-2">
              <li className="list-row">
                <h2 className="font-semibold flex items-center text-lg">
                  <Icon
                    icon="heroicons:users"
                    width={24}
                    height={24}
                    className="inline mr-1"
                  />
                  玩家列表
                </h2>
              </li>
              {sortedOnlinePlayers.length > 0 ? (
                sortedOnlinePlayers.map((player) => {
                  const order = answerOrderByUserId[player.id];
                  const isCurrentUser = userId !== null && player.id === userId;
                  return (
                    <li
                      key={player.id}
                      className={clsx("px-2 transition-all duration-300", {
                        "buzz-ordered-item": typeof order === "number",
                      })}
                    >
                      <div className="flex items-center justify-between">
                        <UserBar
                          username={player.username}
                          order={order}
                          activate={typeof order === "number"}
                          answering={currentAnsweringPlayer === player.id}
                          isSelf={isCurrentUser}
                          online={player.online}
                          showKickAction={isOwner && !isCurrentUser}
                          kickDisabled={isWsDisconnected}
                          onKick={() => handleRemovePlayer(player.id)}
                        />
                      </div>
                    </li>
                  );
                })
              ) : (
                <li className="list-row px-2 text-sm opacity-60">
                  暂无玩家
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* 玩家作答情况展示表格 */}
      <div className="card shadow-sm">
        <div className="card-body p-0">
          <h3 className="font-semibold text-lg p-4 border-b">
            <Icon
              icon="heroicons:clipboard-list"
              width={20}
              height={20}
              className="inline mr-2"
            />
            玩家作答情况
          </h3>
          <div className="overflow-x-auto">
            <table className="table table-pin-cols table-pin-rows">
              <thead>
                <tr>
                  <th className="w-4 text-end">顺序</th>
                  <th className="">玩家</th>
                  {tagGroups.map((group) => (
                    <th key={group.id} className="text-center min-w-20">
                      {group.name}
                    </th>
                  ))}
                  <th className="min-w-40">精确描述</th>
                </tr>
              </thead>
              <tbody>
                {playerAnswers.length > 0 ? (
                  playerAnswers
                    .sort((a, b) => a.order - b.order)
                    .map((answer) => (
                      <tr
                        key={answer.playerId}
                        className={clsx({
                          "bg-primary/10 font-bold":
                            userId !== null && answer.playerId === userId,
                        })}
                      >
                        <th className="text-end">{answer.order}</th>
                        <th className="text-nowrap">{answer.username}</th>
                        {tagGroups.map((group) => {
                          const selectedTagId = answer.answers[group.id];
                          const selectedTag = group.tags.find(
                            (tag) => tag.id === selectedTagId,
                          );
                          return (
                            <td key={group.id} className="text-center">
                              {selectedTag ? selectedTag.name : "-"}
                            </td>
                          );
                        })}
                        <td className="max-w-40 truncate">
                          {answer.description || "-"}
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan={tagGroups.length + 3} className="text-center">
                      暂无作答记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isVolumeToastVisible ? (
        <div className="toast toast-top toast-start z-50">
          <div
            className={clsx(
              "card bg-base-100 shadow-lg w-64 transition-all duration-200 ease-out",
              {
                "opacity-100 translate-y-0 scale-100": !isVolumeToastClosing,
                "opacity-0 -translate-y-1 scale-95": isVolumeToastClosing,
              },
            )}
          >
            <div className="card-body gap-2 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">音量</span>
                <span className="font-mono">{localVolume}%</span>
              </div>
              <progress
                className={clsx("progress w-full volume-progress-eased", {
                  "progress-primary": localVolume <= 100,
                  "progress-warning": localVolume > 100 && localVolume <= 150,
                  "progress-error": localVolume > 150,
                })}
                value={localVolume}
                max="200"
              ></progress>
            </div>
          </div>
        </div>
      ) : null}

      <dialog ref={settingDialogRef} className="modal">
        <div className="modal-box w-full max-w-200">
          <h2 className="font-bold text-2xl">设置</h2>
          <div className="divider mt-0.5 mb-0.5"></div>
          <div className="flex flex-col gap-1.5">
            <h3 className="font-semibold text-xl">主题</h3>
            <div className="flex">
              <div className="join join-horizontal">
                {themes.map((themeName) => (
                  <input
                    key={themeName}
                    type="radio"
                    name="theme-buttons"
                    className="btn theme-controller join-item"
                    aria-label={themeName[0].toUpperCase() + themeName.slice(1)}
                    value={themeName}
                    checked={theme === themeName}
                    onChange={() => setTheme(themeName)}
                  />
                ))}
              </div>
            </div>
            <div className="text-xs text-gray-400">
              你可以挑一个自己喜欢的主题~
            </div>
          </div>
          <div className="flex flex-col gap-1.5 mt-4">
            <h3 className="font-semibold text-xl">音量</h3>
            <div className="text-xs opacity-70 flex items-center gap-1">
              快捷键：
              <kbd className="kbd kbd-xs">-</kbd>
              <span>/</span>
              <kbd className="kbd kbd-xs">=</kbd>
              <span>（</span>
              <kbd className="kbd kbd-xs">+</kbd>
              <span>）</span>
            </div>
            <div className="flex">
              <input
                type="range"
                min={0}
                max={200}
                value={localVolume}
                className={clsx("range flex-1", {
                  "range-primary": localVolume <= 100,
                  "range-warning": localVolume > 100 && localVolume <= 150,
                  "range-error": localVolume > 150,
                })}
                onChange={(e) => setVolume(parseInt(e.target.value, 10))}
              />
              <span
                className={clsx("text-sm ml-2", {
                  "text-warning": localVolume > 100 && localVolume <= 150,
                  "text-error": localVolume > 150,
                })}
              >
                {localVolume} %
              </span>
            </div>
            <div className="text-xs text-gray-400">
              {localVolume > 100 && localVolume <= 150
                ? "我说你耳朵聋，你听不见吗？"
                : localVolume > 150
                  ? "这么小声还想开军舰？"
                  : localVolume === 0
                    ? "一个猜歌比赛你不开声音，你是不是*开了*？"
                    : "这样的声音大小合适吗？听得见吗？"}
            </div>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* 房主确认正确答案弹窗 */}
      <dialog ref={judgingDialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-4xl">
          <h2 className="font-bold text-2xl">确认正确答案</h2>

          {/* 曲目信息 */}
          {currentSong && (
            <SongInfoCard
              songInfo={currentSong}
              isJudging={true}
              compact={false}
              clickable={true}
              onClick={() => {
                if (currentSong.platformUrl) {
                  window.open(currentSong.platformUrl, "_blank");
                }
              }}
              className="mb-4"
              showAlbum={true}
              showPlatformHint={true}
            />
          )}

          {/* TagGroup选择 */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3">选择正确标签</h3>
            <TagGroupSelector
              tagGroups={tagGroups}
              selectedTags={selectedTags}
              onSelectTag={handleSelectJudgingTag}
              highlightTagIds={historyTagIds}
              readOnly={false}
              showHeader={false}
              showEmptyState={true}
              emptyStateText="暂无可选标签分组"
            />
          </div>

          {/* 参考精确描述 */}
          {referenceDescriptions.length > 0 && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-3">参考精确描述</h3>
              <div className="card bg-base-200 p-4">
                <ul className="list-disc list-inside space-y-2">
                  {referenceDescriptions.map((desc, index) => (
                    <li key={index} className="text-sm">
                      {desc}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 玩家精确描述 */}
          {playerDescriptions.length > 0 && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-3">抢答者精确描述</h3>
              <div className="space-y-3">
                {playerDescriptions.map((playerDesc) => (
                  <div key={playerDesc.id} className="card bg-base-200 p-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-primary mt-1"
                        checked={selectedDescriptions.includes(playerDesc.id)}
                        onChange={() => handleToggleDescription(playerDesc.id)}
                      />
                      <div>
                        <div className="font-semibold">
                          {playerDesc.username}
                        </div>
                        <div className="text-sm opacity-80 mt-1">
                          {playerDesc.description}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => judgingDialogRef.current?.close()}
            >
              暂时隐藏
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => confirmAnswerDialogRef.current?.showModal()}
            >
              确认答案
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>关闭</button>
        </form>
      </dialog>

      {/* 跳过本题确认弹窗 */}
      <dialog ref={skipConfirmDialogRef} className="modal">
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg">确认进入下一轮</h3>
          <p className="py-4">确定立即进入下一轮吗？当前抢答队列会被清空。</p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => skipConfirmDialogRef.current?.close()}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-warning"
              disabled={isWsDisconnected}
              onClick={handleSkipRound}
            >
              确认下一轮
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>关闭</button>
        </form>
      </dialog>

      {/* 确认答案弹窗 */}
      <dialog ref={confirmAnswerDialogRef} className="modal">
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg">确认提交答案</h3>
          <p className="py-4">确定要提交当前选择的答案吗？提交后将进行评分。</p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => confirmAnswerDialogRef.current?.close()}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isWsDisconnected}
              onClick={handleJudgeSubmit}
            >
              确认提交
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>关闭</button>
        </form>
      </dialog>

      {/* 移除玩家确认弹窗 */}
      <dialog ref={removePlayerDialogRef} className="modal">
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg">确认移除玩家</h3>
          <p className="py-4">确定要将该玩家移出房间吗？</p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => removePlayerDialogRef.current?.close()}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-warning"
              disabled={isWsDisconnected}
              onClick={confirmRemovePlayer}
            >
              确认移除
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>关闭</button>
        </form>
      </dialog>

      {/* 答题弹窗 */}
      <dialog
        ref={answerModalRef}
        className="modal"
        open={isAnswerModalOpen && !isAnswerModalMinimized}
      >
        <div className="modal-box w-11/12 max-w-4xl">
          <h2 className="font-bold text-2xl">答题</h2>
          <div className="divider mt-0.5 mb-4"></div>

          <TagGroupSelector
            tagGroups={tagGroups}
            selectedTags={selectedTagByGroup}
            onSelectTag={selectGroupTag}
            showHeader={true}
            headerText="选择 Tags"
            className="mb-6"
          />

          {/* 精确描述输入框 */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">精确描述</h3>
            <textarea
              className="textarea textarea-bordered w-full"
              placeholder="请输入精确描述..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            ></textarea>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={toggleAnswerModal}
            >
              暂时隐藏
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isWsDisconnected}
              onClick={handleSubmitAnswer}
            >
              提交答案
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>关闭</button>
        </form>
      </dialog>

      {/* 悬浮按钮（当弹窗被最小化时显示） */}
      {isAnswerModalOpen && isAnswerModalMinimized && (
        <button
          type="button"
          className="fixed bottom-6 right-6 btn btn-primary btn-circle h-16 w-16 shadow-lg"
          onClick={toggleAnswerModal}
        >
          <Icon
            icon="heroicons:clipboard-question-mark"
            width={24}
            height={24}
          />
        </button>
      )}
    </div>
  );
}

export default RoomPage;
