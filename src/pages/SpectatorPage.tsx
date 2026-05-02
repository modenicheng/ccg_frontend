import clsx from "clsx";
import { Icon } from "@iconify-icon/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { WS } from "../wsClient";
import { GameEventId } from "../types/eventTypes";
import { startHeartbeat } from "../wsClient/handlers";
import useWebSocketStore from "../stores/webSocketStore";
import useErrorToastStore from "../stores/errorToastStore";
import usePersistStore from "../stores/persistStore";
import { gameStore, useGameStore } from "../stores/gameStore";
import { useAudioContextInterceptor } from "../hooks";
import { useRoomAudio } from "../hooks/useRoomAudio";
import { UserBar, SongInfoCard } from "../components";
import type {
  WsTagGroup,
  WsPlayer,
  AnswerQueueItem,
  PlayControlMessage,
  PlaybackState,
} from "../types/wsMessages";
import { isPlayControlData } from "../types/wsMessages";
import { buildSpectatorWsUrl } from "../utils/wsEndpoint";
import {
  getActiveAnswerQueue,
} from "../utils/gameHelpers";
import {
  registerRoomEventHandlers,
} from "./roomWsHandlers";

const WS_RETRY = { max: 10 };

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
  } = useWebSocketStore();
  const {
    theme,
    volume: persistVolume,
    setVolume: setPersistVolume,
    addUser,
    removeUser,
  } = usePersistStore();
  const pushToast = useErrorToastStore((state) => state.pushToast);
  const navigate = useNavigate();

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
  const {
    showAudioPrompt,
    handleAudioPromptClick,
    setupAudioPlayerInterceptor,
  } = useAudioContextInterceptor();

  const hasUserInteractedRef = useRef<boolean>(false);
  const hasCheckedInitialPlaybackPromptRef = useRef<boolean>(false);

  // 窗口 focus 状态 - 用于控制音频音量（与 RoomPage 一致）
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

  useEffect(() => {
    if (roomId) {
      const roomTitle = roomState?.title;
      document.title = roomTitle
        ? `GUESongS - 观战${roomTitle}|${roomId}`
        : `GUESongS - 观战${roomId}`;
    }
  }, [roomId, roomState?.title]);

  // 窗口 focus 检测 - 用于控制音频音量（与 RoomPage 一致）
  useEffect(() => {
    const handleFocus = () => {
      setIsWindowFocused(true);
    };
    const handleBlur = () => {
      setIsWindowFocused(false);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

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

  // --- useRoomAudio hook (isOwner = false，不发送任何控制消息) ---
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
    setCurrentAudioUrl,
    needsGesturePromptOnInit,
    setNeedsGesturePromptOnInit,
    applyRemoteProgress,
    withPlaybackSyncSuppressed,
    switchAudioSourceIfNeeded,
    tryPlayUrlWithRetry,
    reportAudioError,
    notifyAudioLoadError,
  } = useRoomAudio({
    wsRef,
    isOwner: false,
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

  const resetRoundTransientState = useCallback(() => {
    setAnswerOrderByUserId({});
    setCurrentAnsweringPlayer(null);
    setPlayerAnswers([]);
    setIsJudging(false);
    setCurrentSong(null);

    const latestRoomState = gameStore.getState().roomState;
    if (latestRoomState) {
      gameStore.getState().setRoomState({
        ...latestRoomState,
        show_answer: false,
      });
    }
  }, []);

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

    const latestRoomState = gameStore.getState().roomState;
    if (latestRoomState) {
      gameStore.getState().setRoomState({
        ...latestRoomState,
        answer_queue: queue,
        answer_queue_tail_player_id: answerQueueTailPlayerId,
      });
    }
  }, []);

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

  // 标记用户交互（用于 AudioContext 手势恢复检测）
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
    if (!roomId) {
      return;
    }

    const wsUrl = buildSpectatorWsUrl(roomId);

    wsRef.current = new WS(wsUrl, WS_RETRY);
    setWsClient(wsRef.current);

    const disposeHandlers = registerRoomEventHandlers(wsRef.current, {
      roomId,
      userIdRef: { current: null },
      wsAuthToken: "",
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
      setCurrentAnsweringPlayer,
      setIsJudging,
      setCurrentSong,
      setRoomOwner,
      setCurrentAudioUrl,
      setNeedsGesturePromptOnInit,
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
      closeRoundSummaryDialog: () => {},
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
          compact={true}
          className="flex-1 basis-0 min-w-0"
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
                  const activeOrder = answerOrderByUserId[player.id];
                  const order = activeOrder ?? buzzedOrderByUserId[player.id];
                  const hasBuzzed = buzzedPlayerIds.includes(player.id);
                  return (
                    <li
                      key={player.id}
                      className={clsx("px-2 transition-all duration-300", {
                        "buzz-ordered-item": typeof activeOrder === "number",
                      })}
                    >
                      <div className="flex items-center justify-between">
                        <UserBar
                          username={player.username}
                          order={order}
                          activate={typeof activeOrder === "number"}
                          answering={currentAnsweringPlayer === player.id}
                          hasBuzzed={hasBuzzed}
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

      {/* AudioContext 被浏览器拦截时的提示弹窗（与 RoomPage 一致） */}
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
                onClick={() => {
                  handleAudioPromptClick(audioRef.current);
                  setNeedsGesturePromptOnInit(false);
                }}
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

export default SpectatorPage;
