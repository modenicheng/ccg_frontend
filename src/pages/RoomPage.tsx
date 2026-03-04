import clsx from "clsx";
import { Icon } from "@iconify-icon/react";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { WS } from "../wsClient";
import { EventType, GameEventId } from "../types/eventTypes";
import { heartbeatHandler, startHeartbeat } from "../wsClient/handlers";
import useWebSocketStore from "../stores/webSocketStore";
import usePersistStore from "../stores/persistStore";
import { gameStore, useGameStore } from "../stores/gameStore";
import { audioPlayer } from "../audioPlayer";
import type { RoomState } from "../types/store";
import { UserBar, TagGroupSelector, SongInfoCard } from "../components";
import type {
  WsTagGroup,
  WsPlayer,
  RoomStateMessage,
  PlayControlMessage,
  AttemptAnswerMessage,
} from "../types/wsMessages";
import {
  isPlayControlData,
  mapStatusCodeToStatus,
  getPlayersSimple,
  getTagGroupsSimple,
} from "../types/wsMessages";

const development = import.meta.env.DEV;
const WS_RETRY = { max: 10 };
const AUDIO_SYNC_THRESHOLD_MS = 40;
const SYNC_AUDIO_URL = `https://cdn.modenc.top/files/Orig.mp3`;
const CANVAS_INIT_DELAY_MS = 800;

let domProgressPercent = 0;
const themes = ["light", "dark", "night", "cyberpunk", "emerald", "nord"];

const buildWsUrl = (roomId: string, token: string | null) => {
  const encodedRoomId = encodeURIComponent(roomId);
  const baseOrigin = development
    ? ((import.meta.env.VITE_BACKEND_ORIGIN as string | undefined) ??
      "http://localhost:8000")
    : window.location.origin;

  const url = new URL(baseOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/ws/${encodedRoomId}`;
  url.search = token ? `token=${encodeURIComponent(token)}` : "";
  return url.toString();
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
  } = usePersistStore();
  const user = getRoomUser(roomId);
  const fallbackUserIdFromSession = Number.parseInt(
    sessionStorage.getItem(`ccg-room-user-id:${roomId}`) ?? "",
    10,
  );
  const fallbackUserIdFromCookie = Number.parseInt(
    readCookie(`ccg-room-user-id:${roomId}`) ?? "",
    10,
  );
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

  // 准备和倒计时状态
  const [isReady, setIsReady] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const selectGroupTag = (groupId: number, tagId: number) => {
    setSelectedTagByGroup((prev) => ({
      ...prev,
      [groupId]: tagId,
    }));
  };

  const navigate = useNavigate();

  const audioRef = useRef<audioPlayer | null>(null);
  const [audioState, setAudioState] = useState<string>("suspended");
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasParentRef = useRef<HTMLDivElement | null>(null);
  const canvasInitializedRef = useRef(false);
  const canvasInitTimerRef = useRef<number | null>(null);

  const settingDialogRef = useRef<HTMLDialogElement | null>(null);
  const judgingDialogRef = useRef<HTMLDialogElement | null>(null);
  const skipConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const confirmAnswerDialogRef = useRef<HTMLDialogElement | null>(null);

  const progressBarRef = useRef<HTMLSpanElement | null>(null);
  const isProgressDraggingRef = useRef(false);
  const [isBuzzHotkeyActive, setIsBuzzHotkeyActive] = useState(false);
  const isPlaybackStateMissing = roomState?.playback_status === null;

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
      return a.id - b.id;
    });
  }, [answerOrderByUserId, onlinePlayers]);

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

    const calibratedNow = Math.round(getCalibratedNow());
    const payload: AttemptAnswerMessage = {
      event: GameEventId.ATTEMPT_ANSWER,
      ts: calibratedNow,
      data: {
        offset_ts: calibratedNow,
        user_id: userId,
      },
    };

    void wsRef.current.sendJson(payload);
  }, [addAttemptOrder, getCalibratedNow, isConnected, userId]);

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

  const handleLeaveRoom = useCallback(async () => {
    if (!roomId || userId === null) {
      return;
    }

    try {
      // 发送退出房间事件
      if (wsRef.current?.isConnected()) {
        await wsRef.current.sendJson({
          event: 16, // PLAYER_LEAVE
          data: { user_id: userId },
        });
      }

      // 关闭WebSocket连接
      wsRef.current?.close();

      // 清除本地存储的房间相关信息
      sessionStorage.removeItem(`ccg-room-token:${roomId}`);
      sessionStorage.removeItem(`ccg-room-user-id:${roomId}`);
      document.cookie = `ccg-room-user-id:${roomId}=; Max-Age=0`;

      // 导航回首页
      navigate("/");
    } catch (error) {
      console.error("退出房间失败:", error);
    }
  }, [roomId, userId, navigate]);

  const sendPlaybackControl = useCallback(
    async (event: (typeof GameEventId)["PLAY" | "PAUSE" | "SEEK"]) => {
      if (
        !user?.isOwner ||
        !wsRef.current?.isConnected() ||
        !audioRef.current
      ) {
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
          audio_url: SYNC_AUDIO_URL,
        },
      };

      await wsRef.current.sendJson(payload);
    },
    [getCalibratedNow, user?.isOwner],
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
    if (!wsRef.current?.isConnected() || !user?.isOwner) {
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
  }, [selectedTags, selectedDescriptions, getCalibratedNow, user?.isOwner]);

  const handleJudgeSkip = useCallback(() => {
    if (!wsRef.current?.isConnected() || !user?.isOwner) {
      return;
    }

    const payload = {
      event: GameEventId.JUDGE_SUBMIT,
      ts: Math.round(getCalibratedNow()),
      data: {
        correct_tags: [],
        correct_description_ids: [],
        new_correct_descriptions: [],
        skip_scoring: true,
      },
    };

    void wsRef.current.sendJson(payload);
    judgingDialogRef.current?.close();
    skipConfirmDialogRef.current?.close();
  }, [getCalibratedNow, user?.isOwner]);

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


      const now = getCalibratedNow();
      // offset_ts可能为null，如果为null则使用消息的时间戳
      const offsetTs = controlData.offset_ts ?? message.ts;
      const elapsed = Math.max(0, now - offsetTs);
      const expectedMs = Math.max(0, controlData.progress_ms + elapsed);
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
    if (!roomId) {
      return;
    }

    const token = sessionStorage.getItem(`ccg-room-token:${roomId}`);
    const wsUrl = buildWsUrl(roomId, token);

    wsRef.current = new WS(wsUrl, WS_RETRY);
    setWsClient(wsRef.current);

    wsRef.current.on(EventType.HEARTBEAT, heartbeatHandler);
    wsRef.current.onJsonEvent<RoomStateMessage>(
      GameEventId.ROOM_STATE,
      async (message) => {
        const payload = message.data;

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
            if (newAudioUrl && newAudioUrl !== currentAudioUrl) {
              // 切换音频源
              await audioPlayer.preload(newAudioUrl);
              await audioPlayer.playUrlAsStream(newAudioUrl, false);
              setCurrentAudioUrl(newAudioUrl);
            }

            // 创建伪PlayControlMessage用于applyRemoteProgress
            const pseudoMessage = {
              event: GameEventId.PLAY, // 事件类型不影响applyRemoteProgress逻辑
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
            if (playbackStatus.play_state === 'playing') {
              void audioPlayer.resume();
            } else if (playbackStatus.play_state === 'paused') {
              void audioPlayer.pause();
            }
          } catch (error) {
            console.error('Failed to sync audio playback:', error);
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
        setOnlinePlayers(payload.players.filter((player) => player.online));
        setAnswerOrderByUserId(
          payload.answer_queue.reduce<Record<number, number>>((acc, item) => {
            const order =
              item.order ?? acc[item.player_id] ?? Object.keys(acc).length + 1;
            acc[item.player_id] = order;
            return acc;
          }, {}),
        );

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
        setOnlinePlayers((prev) => {
          // 检查玩家是否已存在
          const playerExists = prev.some(p => p.id === newPlayer.id);
          if (playerExists) {
            // 更新现有玩家信息
            return prev.map(p => 
              p.id === newPlayer.id ? newPlayer : p
            );
          } else {
            // 添加新玩家
            return [...prev, newPlayer];
          }
        });

        // 如果新玩家是房主，更新房主信息
        if (newPlayer.is_owner) {
          setRoomOwner(newPlayer.username);
        }
      }
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
      if (user_id === userId) {
        setIsReady(ready);
      }
    });

    // 处理倒计时事件
    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.COUNTDOWN;
      ts: number;
      data: {
        seconds: number;
        all_ready: boolean;
      };
    }>(GameEventId.COUNTDOWN, (message) => {
      const { seconds } = message.data;
      setCountdown(seconds);
    });
    wsRef.current.onConnectionStateChange(setConnected);

    setUrl(wsUrl);
    setRoomId(roomId);

    const stopHeartbeat = startHeartbeat(wsRef.current, 1000, 1000);

    return () => {
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
    setConnected,
    setRoomId,
    setUrl,
    setWsClient,
  ]);

  useEffect(() => {
    audioRef.current = new audioPlayer();
    audioRef.current.volume = initialVolumeRef.current;
    audioRef.current.onStateChange = (nextState) => {
      setAudioState(nextState);
    };
    setAudioState(audioRef.current.state);
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

    if (!user?.isOwner) {
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
  }, [sendPlaybackControl, user]);

  const setVolume = (value: number) => {
    const safeValue = Math.max(0, Math.min(200, value));
    setLocalVolume(safeValue);
    setPersistVolume(safeValue);

    if (audioRef.current) {
      audioRef.current.volume = safeValue;
    }
  };

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
        {user?.isOwner ? (
          <div className="card shadow-sm min-w-xs">
            <div className="card-body">
              <button
                type="button"
                className={clsx("btn btn-sm btn-soft", {
                  "btn-success": audioState !== "running",
                  "btn-warning": audioState === "running",
                })}
                disabled={isPlaybackStateMissing}
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
                <div
                  className="btn btn-primary btn-sm btn-soft join-item flex-1"
                  onClick={() => {}}
                >
                  开始游戏
                  {/* 切换房间状态，向后端发送 GAME_START 事件，禁止新玩家加入 */}
                </div>
                <div
                  className="btn btn-info btn-sm btn-soft join-item flex-1"
                  onClick={() => judgingDialogRef.current?.showModal()}
                >
                  <Icon icon="heroicons:scale" width={16} height={16} />
                  判分
                </div>
                <div
                  className="btn btn-warning btn-sm btn-soft join-item flex-1"
                  onClick={() => skipConfirmDialogRef.current?.showModal()}
                >
                  <Icon
                    icon="heroicons:chevron-double-right-20-solid"
                    width={16}
                    height={16}
                  />
                  下一轮
                </div>
              </div>
              <div
                className="btn btn-sm  btn-soft"
                onClick={() => navigate(`/room/${roomId}/manage`)}
              >
                管理页面
              </div>
            </div>
          </div>
        ) : null}
        <div className="card shadow-sm max-w-sm">
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
            <p>房主： {roomOwner}</p>
            <div className="divider m-0"></div>
            <div className="join">
              <button
                type="button"
                className={`btn btn-sm join-item ${isReady ? 'btn-success' : 'btn-primary'}`}
                onClick={handleReady}
                disabled={!isConnected}
              >
                {isReady ? '取消准备' : '准备'}
              </button>
              {countdown !== null && (
                <div className="text-center py-2 bg-base-200 rounded-lg">
                  <div className="text-sm opacity-70">游戏即将开始</div>
                  <div className="text-2xl font-bold">{countdown}</div>
                </div>
              )}
              <button
                type="button"
                className="btn btn-sm btn-error join-item"
                onClick={handleLeaveRoom}
              >
                退出
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-2 w-full">
        <div className="card shadow-sm">
          <button
            type="button"
            className={clsx("btn btn-primary w-2xs h-full p-4 flex-col gap-4", {
              "btn-disabled": !isConnected,
              "btn-active": isBuzzHotkeyActive,
            })}
            disabled={!isConnected}
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
        <TagGroupSelector
          tagGroups={tagGroups}
          selectedTags={selectedTagByGroup}
          onSelectTag={selectGroupTag}
          showHeader={true}
          headerText="选择 Tags"
          className="flex-1 min-h-56"
        />
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
                  在线玩家
                </h2>
              </li>
              {sortedOnlinePlayers.length > 0 ? (
                sortedOnlinePlayers.map((player) => {
                  const order = answerOrderByUserId[player.id];
                  return (
                    <li
                      key={player.id}
                      className={clsx("px-2 transition-all duration-300", {
                        "buzz-ordered-item": typeof order === "number",
                      })}
                    >
                      <UserBar
                        username={player.username}
                        order={order}
                        activate={typeof order === "number"}
                        isSelf={userId !== null && player.id === userId}
                      />
                    </li>
                  );
                })
              ) : (
                <li className="list-row px-2 text-sm opacity-60">
                  暂无在线玩家
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <div className="card shadow-sm max-h-120">
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
                    <tr key={player.player_id} className="">
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
          <h3 className="font-bold text-lg">确认跳过本题</h3>
          <p className="py-4">
            确定要跳过本题吗？跳过之后将不会对本题进行评分。
          </p>
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
              onClick={handleJudgeSkip}
            >
              确认跳过
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
    </div>
  );
}

export default RoomPage;
