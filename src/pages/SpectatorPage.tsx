import clsx from "clsx";
import { Icon } from "@iconify-icon/react";
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
import { UserBar, SongInfoCard } from "../components";
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
  ClearAnswerQueueMessage,
  PreloadAudioMessage,
  TagGroupMessage,
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
const CANVAS_INIT_DELAY_MS = 0;

const buildWsUrl = (roomId: string) => {
  const encodedRoomId = encodeURIComponent(roomId);
  const baseOrigin = development
    ? ((import.meta.env.VITE_BACKEND_ORIGIN as string | undefined) ??
      "http://localhost:8000")
    : window.location.origin;

  const url = new URL(baseOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/ws/${encodedRoomId}/watch`;
  return url.toString();
};

function SpectatorPage() {
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
    volume: persistVolume,
  } = usePersistStore();
  const initialVolumeRef = useRef<number>(persistVolume);
  const roomState = useGameStore((state) => state.roomState);
  const scores = useGameStore((state) => state.scores);
  const [roomOwner, setRoomOwner] = useState<string>("-");
  const [tagGroups, setTagGroups] = useState<WsTagGroup[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<WsPlayer[]>([]);
  const [answerOrderByUserId, setAnswerOrderByUserId] = useState<
    Record<number, number>
  >({});
  const [currentSong, setCurrentSong] = useState<{
    title: string;
    artist: string;
    album: string;
    coverUrl: string;
    platformUrl?: string;
  } | null>(null);
  const [isJudging, setIsJudging] = useState<boolean>(false);
  const [currentAnsweringPlayer, setCurrentAnsweringPlayer] = useState<
    number | null
  >(null);

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

  useEffect(() => {
    if (roomId) {
      const roomTitle = roomState?.title;
      document.title = roomTitle
        ? `CCG - 观战${roomTitle}|${roomId}`
        : `CCG - 观战${roomId}`;
    }
  }, [roomId, roomState?.title]);

  const audioRef = useRef<audioPlayer | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasParentRef = useRef<HTMLDivElement | null>(null);
  const canvasInitializedRef = useRef(false);
  const canvasInitTimerRef = useRef<number | null>(null);

  const progressBarRef = useRef<HTMLSpanElement | null>(null);
  const isProgressDraggingRef = useRef(false);

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

  const resetRoundTransientState = useCallback(() => {
    setAnswerOrderByUserId({});
    setCurrentAnsweringPlayer(null);
    setPlayerAnswers([]);
    setIsJudging(false);
    setCurrentSong(null);
  }, []);

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

  useEffect(() => {
    currentAudioUrlRef.current = currentAudioUrl;
  }, [currentAudioUrl]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const wsUrl = buildWsUrl(roomId);

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

          // 回合状态
          roundState: typeof payload.round_state === "string" ? payload.round_state : "PENDING",
          roundStateCode: typeof payload.round_state === "number" ? payload.round_state : 0,

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
              // 切换音频源
              await audioPlayer.preload(newAudioUrl);
              await audioPlayer.playUrlAsStream(newAudioUrl, false);
              setCurrentAudioUrl(newAudioUrl);
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
        // 房间任意状态都保留全部玩家，仅通过 online 字段展示在线状态
        setOnlinePlayers(payload.players);
        syncAnswerQueueState(payload.answer_queue);

        setTagGroups(payload.tag_groups);
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

    wsRef.current.onJsonEvent<{
      event: typeof GameEventId.SKIP_ROUND;
      ts: number;
      data: Record<string, never>;
    }>(GameEventId.SKIP_ROUND, () => {
      resetRoundTransientState();
      syncAnswerQueueState([]);
    });

    wsRef.current.onJsonEvent<AttemptAnswerMessage>(
      GameEventId.ATTEMPT_ANSWER,
      (message) => {
        const attemptedUserId = message?.data?.user_id;
        if (typeof attemptedUserId !== "number") {
          return;
        }
        setAnswerOrderByUserId((prev) => {
          if (prev[attemptedUserId]) {
            return prev;
          }
          const nextOrder = Math.max(0, ...Object.values(prev)) + 1;
          return {
            ...prev,
            [attemptedUserId]: nextOrder,
          };
        });
      },
    );

    wsRef.current.onJsonEvent<YourTurnMessage>(GameEventId.YOUR_TURN, (message) => {
      const turnUserId = message?.data?.user_id;
      if (typeof turnUserId === "number") {
        setCurrentAnsweringPlayer(turnUserId);
      }
    });

    wsRef.current.onJsonEvent<ClearAnswerQueueMessage>(
      GameEventId.CLEAR_ANSWER_QUEUE,
      () => {
        syncAnswerQueueState([]);
      },
    );

    wsRef.current.onJsonEvent<AnswerQueueMessage>(GameEventId.ANSWER_QUEUE, (message) => {
      syncAnswerQueueState(message.data?.queue ?? []);
    });

    wsRef.current.onJsonEvent<TagGroupMessage>(GameEventId.TAG_GROUP, (message) => {
      const payload = message.data;
      if (payload.room_id !== roomId) {
        return;
      }

      setTagGroups(payload.tag_groups);

      const currentRoomState = gameStore.getState().roomState;
      if (currentRoomState) {
        gameStore.getState().setRoomState({
          ...currentRoomState,
          tag_groups: payload.tag_groups,
          tagGroupsSimple: getTagGroupsSimple(payload.tag_groups),
        });
      }
    });

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

      // 存储玩家作答情况
      if (message.data?.player_answers) {
        setPlayerAnswers(message.data.player_answers.map(answer => ({
          playerId: answer.player_id,
          username: answer.username,
          answers: answer.answers,
          description: answer.description,
          order: answer.order
        })));
      } else {
        // 如果没有player_answers，尝试从player_descriptions构建
        const playerAnswersFromDescriptions = message.data?.player_descriptions?.map((desc, index) => ({
          playerId: desc.id,
          username: desc.username,
          answers: {},
          description: desc.description,
          order: index + 1
        })) || [];
        setPlayerAnswers(playerAnswersFromDescriptions);
      }
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
          const playerExists = prev.some((p) => p.id === newPlayer.id);
          if (playerExists) {
            // 更新现有玩家信息
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

    // 处理玩家离开事件
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
    });

    // 处理回合开始事件
    wsRef.current.onJsonEvent<RoundStartMessage>(
      GameEventId.ROUND_START,
      async (message) => {
        const roundData = message.data;

        // 1. 切换到新音频URL（如果提供）
        if (roundData.audio_url && roundData.audio_url !== currentAudioUrlRef.current) {
          try {
            await audioRef.current?.preload(roundData.audio_url);
            await audioRef.current?.playUrlAsStream(roundData.audio_url, false);
            setCurrentAudioUrl(roundData.audio_url);
          } catch (error) {
            console.error("Failed to load audio for round start:", error);
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

        resetRoundTransientState();

        console.log(`Round ${roundData.round_index} started`, roundData);
      },
    );

    // 处理音频预加载事件
    wsRef.current.onJsonEvent<PreloadAudioMessage>(
      GameEventId.PRELOAD_AUDIO,
      async (message) => {
        const { audio_url } = message.data;
        if (audio_url && audioRef.current) {
          try {
            await audioRef.current.preload(audio_url);
            console.log(`Audio preloaded: ${audio_url}`);
          } catch (error) {
            console.error("Failed to preload audio:", error);
          }
        }
      },
    );

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
    applyRemoteProgress,
    roomId,
    resetRoundTransientState,
    setConnected,
    setRoomId,
    setUrl,
    setWsClient,
    syncAnswerQueueState,
  ]);

  useEffect(() => {
    audioRef.current = new audioPlayer();
    audioRef.current.volume = initialVolumeRef.current;
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
      audioRef.current.volume = persistVolume;
    }
  }, [persistVolume]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
      </div>
      <div className="flex gap-2 w-full">
        <SongInfoCard
          songInfo={isJudging ? currentSong : null}
          isJudging={isJudging}
          compact={true}
          className="flex-1"
          showAlbum={true}
        />
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
            <div className="text-sm ">房间ID： {roomId}</div>
            <div className="mt-4">
              <span className="badge badge-outline">观战模式</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-2 w-full">
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
                      <tr key={player.player_id}>
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
                          isSelf={false}
                          online={player.online}
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
                      <tr key={answer.playerId}>
                        <th className="text-end">{answer.order}</th>
                        <th className="text-nowrap">{answer.username}</th>
                        {tagGroups.map((group) => {
                          const selectedTagId = answer.answers[group.id];
                          const selectedTag = group.tags.find(tag => tag.id === selectedTagId);
                          return (
                            <td key={group.id} className="text-center">
                              {selectedTag ? selectedTag.name : '-'}
                            </td>
                          );
                        })}
                        <td className="max-w-40 truncate">
                          {answer.description || '-'}
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
    </div>
  );
}

export default SpectatorPage;