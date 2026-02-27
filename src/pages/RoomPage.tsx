import clsx from "clsx";
import { Icon } from "@iconify-icon/react";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { WS } from "../wsClient";
import { EventType, GameEventId } from "../types/eventTypes";
import { heartbeatHandler, startHeartbeat } from "../wsClient/handlers";
import useWebSocketStore from "../stores/webSocketStore";
import usePersistStore from "../stores/persistStore";
import { gameStore, useGameStore } from "../stores/gameStore";
import { audioPlayer } from "../audioPlayer";
import type { RoomState } from "../types/store";

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

type WsTag = {
  id: number;
  name: string;
};

type WsTagGroup = {
  id: number;
  name: string;
  description?: string | null;
  tags: WsTag[];
};

type WsPlayer = {
  id: number;
  username: string;
  is_owner: boolean;
};

type RoomStateInitMessage = {
  event: 12;
  ts: number;
  data: {
    room_id: string;
    title: string | null;
    status: number;
    host: string | null;
    owner: string | null;
    host_player_id: string;
    players: WsPlayer[];
    tag_groups: WsTagGroup[];
    tags: WsTag[];
  };
};

type PlayControlData = {
  progress_ms: number;
  offset_ts: number;
  audio_url?: string | null;
};

type PlayControlMessage = {
  event: 20 | 21 | 22;
  ts: number;
  data: PlayControlData;
};

const isPlayControlData = (value: unknown): value is PlayControlData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlayControlData>;
  return (
    typeof candidate.progress_ms === "number" &&
    typeof candidate.offset_ts === "number"
  );
};

const mapStatus = (status: number): RoomState["status"] => {
  if (status === 1) return "playing";
  if (status === 2) return "ended";
  return "waiting";
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
  const [localVolume, setLocalVolume] = useState<number>(persistVolume);
  const initialVolumeRef = useRef<number>(persistVolume);
  const roomState = useGameStore((state) => state.roomState);
  const [roomOwner, setRoomOwner] = useState<string>("-");
  const [tagGroups, setTagGroups] = useState<WsTagGroup[]>([]);
  const [selectedTagByGroup, setSelectedTagByGroup] = useState<
    Record<number, number | null>
  >({});
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isJudging, setIsJudging] = useState<boolean>(false);
  const [currentSong, setCurrentSong] = useState<{
    title: string;
    artist: string;
    album: string;
    coverUrl: string;
  } | null>(null);

  const selectGroupTag = (groupId: number, tagId: number) => {
    setSelectedTagByGroup((prev) => ({
      ...prev,
      [groupId]: tagId,
    }));
  };

  const navigate = useNavigate();

  const audioRef = useRef<audioPlayer | null>(null);
  const [audioState, setAudioState] = useState<string>("suspended");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasParentRef = useRef<HTMLDivElement | null>(null);
  const canvasInitializedRef = useRef(false);
  const canvasInitTimerRef = useRef<number | null>(null);

  const settingDialogRef = useRef<HTMLDialogElement | null>(null);

  const progressBarRef = useRef<HTMLSpanElement | null>(null);
  const isProgressDraggingRef = useRef(false);
  const [isBuzzHotkeyActive, setIsBuzzHotkeyActive] = useState(false);

  const handleBuzz = useCallback(() => {
    if (!isConnected) {
      return;
    }

    // TODO: 这里后续可接入真正的抢答消息发送逻辑
  }, [isConnected]);

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
    const nextEvent =
      audioState === "running" ? GameEventId.PAUSE : GameEventId.PLAY;
    void sendPlaybackControl(nextEvent);
  }, [audioState, sendPlaybackControl]);

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

      if (controlData.audio_url && controlData.audio_url !== SYNC_AUDIO_URL) {
        return;
      }

      const now = getCalibratedNow();
      const elapsed = Math.max(0, now - controlData.offset_ts);
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
    wsRef.current.onJsonEvent<RoomStateInitMessage>(
      GameEventId.ROOM_STATE,
      (message) => {
        const payload = message.data;

        const nextRoomState: RoomState = {
          roomId: payload.room_id,
          hostPlayerId: payload.host_player_id,
          status: mapStatus(payload.status),
          title: payload.title,
          description: null,
          players: payload.players.map((player) => player.username),
          songQueue: [],
          tagGroups: payload.tag_groups.reduce<Record<string, string[]>>(
            (acc, group) => {
              acc[group.name] = group.tags.map((tag) => tag.name);
              return acc;
            },
            {},
          ),
          playProgress: 0,
          startPositionPercent: 0,
        };

        gameStore.getState().setRoomState(nextRoomState);
        setRoomOwner(payload.owner ?? payload.host ?? "-");

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
        applyRemoteProgress(message, true);
        await audioRef.current?.resume();
        setIsPlaying(true);
        setIsJudging(false);
        // 播放时隐藏曲目信息
        setCurrentSong(null);
      },
    );
    
    wsRef.current.onJsonEvent(
      GameEventId.JUDGING,
      (message) => {
        setIsPlaying(false);
        setIsJudging(true);
        // 判分时显示完整曲目信息
        if (message.data?.song) {
          setCurrentSong({
            title: message.data.song.title || "",
            artist: message.data.song.artist || "",
            album: message.data.song.album || "",
            coverUrl: message.data.song.cover_url || ""
          });
        }
      },
    );
    
    wsRef.current.onJsonEvent(
      GameEventId.SCORE_UPDATE,
      (message) => {
        // 处理得分更新
        if (message.data?.scores) {
          // 更新游戏状态中的得分信息
          console.log('Score updated:', message.data.scores);
          gameStore.getState().setScores(message.data.scores);
        }
      },
    );
    wsRef.current.onJsonEvent<PlayControlMessage>(
      GameEventId.PAUSE,
      async (message) => {
        applyRemoteProgress(message, true);
        await audioRef.current?.pause();
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
    audioRef.current.preload(SYNC_AUDIO_URL);
    audioRef.current.playUrlAsStream(SYNC_AUDIO_URL, false);
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
        <div className="card shadow-sm flex-1">
          <div className="card-body">
            <div className="flex flex-row gap-4">
              <figure>
                <img
                  className="h-32 rounded-md"
                  src={isJudging && currentSong ? currentSong.coverUrl : "https://via.placeholder.com/128x128/cccccc/666666?text=?"}
                  alt=""
                />
              </figure>
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold">
                  {isJudging && currentSong ? currentSong.title : "????????????????"}
                </h2>
                <h2 className="text-lg">
                  {isJudging && currentSong ? currentSong.album : "????????????????"}
                </h2>
                <div className="text-md mt-4 opacity-70">{isJudging && currentSong ? currentSong.artist : "????????"}</div>
                <div className="text-md opacity-70">
                  {isJudging && currentSong ? currentSong.album : "????????????????????????"}
                </div>
              </div>
            </div>
          </div>
        </div>
        {user?.isOwner ? (
          <div className="card shadow-sm min-w-xs">
            <div className="card-body">
              <div
                className="btn btn-sm  btn-soft"
                onClick={() => navigate(`/room/${roomId}/manage`)}
              >
                管理页面
              </div>
              <div
                className={clsx("btn btn-sm btn-soft", {
                  "btn-success": audioState !== "running",
                  "btn-warning": audioState === "running",
                })}
                onClick={handleTogglePlayPause}
              >
                <Icon
                  icon={
                    audioState === "running" ? "heroicons:pause" : "heroicons:play"
                  }
                  width={16}
                  height={16}
                />
                {audioState === "running" ? "暂停" : "播放"}
              </div>
              <div className="btn btn-info btn-sm btn-soft">
                <Icon
                  icon="heroicons:chevron-double-right-20-solid"
                  width={16}
                  height={16}
                />
                下一轮
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
              房间信息
            </h2>
            <div className="divider m-0"></div>
            <p className="truncate">标题： {roomState?.title ?? "-"}</p>
            <p>房主： {roomOwner}</p>
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
        <div className="card shadow-sm flex-1 min-h-56">
          <div className="card-body">
            <h2 className="text-lg font-semibold flex items-center">
              <Icon
                icon="heroicons:tag"
                width={24}
                height={24}
                className="inline mr-1"
              />
              选择 Tags
            </h2>
            <div className="divider m-0"></div>
            <div className="space-y-4">
              {tagGroups.length > 0 ? (
                tagGroups.map((group) => {
                  const selectedTagId = selectedTagByGroup[group.id];
                  const selectedCount = selectedTagId ? 1 : 0;

                  return (
                    <fieldset
                      key={group.id}
                      className="fieldset border border-base-300 rounded-box p-3"
                    >
                      <legend className="fieldset-legend w-full">
                        <div className="w-full flex items-center justify-between gap-2">
                          <span className="ml-2 font-semibold text-base">
                            {group.name}
                          </span>
                          <span
                            className={clsx("badge badge-sm", {
                              "badge-success badge-soft": selectedCount > 0,
                              "badge-ghost": selectedCount === 0,
                            })}
                          >
                            {selectedCount ? "已选择" : "未选择"}
                          </span>
                        </div>
                      </legend>

                      {group.description ? (
                        <p className="mb-1">{group.description}</p>
                      ) : null}

                      <div className="flex flex-wrap gap-4">
                        {group.tags.map((tag) => (
                          <label
                            key={tag.id}
                            className="label cursor-pointer gap-2"
                          >
                            <input
                              type="radio"
                              name={`tag-group-${group.id}`}
                              className="radio radio-primary radio-sm"
                              checked={selectedTagByGroup[group.id] === tag.id}
                              onChange={() => selectGroupTag(group.id, tag.id)}
                            />
                            <span className="text-sm">{tag.name}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })
              ) : (
                <div className="alert alert-soft alert-warning">
                  暂无可选标签分组
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="card shadow-sm w-1/4 max-w-sm min-w-3xs">
          <div className="card-body p-2">
            <ul className="list">
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
              {gameStore.getState().scores.length > 0 ? (
                gameStore.getState().scores
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
              你可以挑一个自己喜欢的主题~ （浅色调可读性略好）
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
    </div>
  );
}

export default RoomPage;
