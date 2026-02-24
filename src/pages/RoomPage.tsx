import clsx from "clsx";
import { Icon } from "@iconify-icon/react";

import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { WS } from "../wsClient";
import { EventType } from "../types/eventTypes";
import {
  answerQueueHandler,
  heartbeatHandler,
  pauseHandler,
  playHandler,
  judgingHandler,
  roundEndHandler,
  roomStateHandler,
  scoreUpdateHandler,
  seekHandler,
  startHeartbeat,
  yourTurnHandler,
} from "../wsClient/handlers";
import {
  sendAttemptAnswer,
  sendJudgeSubmit,
  sendPlayerReady,
  sendSubmitAnswer,
} from "../wsClient/actions";
import useWebSocketStore from "../stores/webSocketStore";
import usePersistStore from "../stores/persistStore";
import useRoomStateStore from "../stores/roomStateStore";
import { audioPlayer } from "../audioPlayer";
import { TagList } from "../components";
import type { TagItem } from "../types/tag";

const development = import.meta.env.DEV;
const WS_RETRY = { max: 10 };
const TAG_MAX = 0;

let domProgressPercent = 0;
let domIsDragging = false;
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

function RoomPage() {
  const { roomid } = useParams();
  const roomId = roomid?.trim() ?? "";

  const wsRef = useRef<WS | undefined>(undefined);
  const { isConnected, latencyAvg, setConnected, setUrl, setRoomId } =
    useWebSocketStore();
  const {
    theme,
    setTheme,
    volume: persistVolume,
    setVolume: setPersistVolume,
  } = usePersistStore();
  const {
    snapshot,
    scores,
    identity,
    answerDraft,
    judgeDraft,
    syncIdentityFromSession,
    getCurrentPhase,
    getPermissions,
    setAnswerDraft,
    resetAnswerDraft,
    setJudgeDraft,
  } = useRoomStateStore();
  const [localVolume, setLocalVolume] = useState<number>(persistVolume);
  const [descriptionText, setDescriptionText] = useState("");
  const [judgeDescriptionsText, setJudgeDescriptionsText] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const myPlayerId = identity?.player_id ?? "";
  const me = snapshot?.players?.find((player) => player.player_id === myPlayerId) ?? null;
  const isHost = me?.is_host ?? false;
  const phase = getCurrentPhase();
  const permissions = getPermissions(isConnected);
  const isMyTurn =
    !!myPlayerId &&
    snapshot?.current_answerer_player_id === myPlayerId &&
    phase === "answering";

  const songlistName = snapshot?.songlist?.name ?? "暂无歌单信息";
  const songlistCover =
    snapshot?.songlist?.cover_url ?? "https://picsum.photos/seed/ccg-songlist/192/192";
  const songlistTotal = snapshot?.songlist?.total_songs ?? 0;

  const currentSongName = snapshot?.current_song?.name ?? "当前无播放歌曲";
  const currentSongArtist = snapshot?.current_song?.artist ?? "未知歌手";
  const currentSongAlbum = snapshot?.current_song?.album ?? "未知专辑";
  const currentSongCover =
    snapshot?.current_song?.cover_url ?? "https://picsum.photos/seed/ccg-song/192/192";

  const selectedAnswerTagIds = new Set(
    answerDraft.selected_tag_ids.map((tagId) => String(tagId)),
  );
  const selectedJudgeTagIds = new Set(
    judgeDraft.correct_tag_ids.map((tagId) => String(tagId)),
  );

  const answerTagItems: TagItem[] = (snapshot?.tag_groups ?? []).flatMap((group) =>
    group.tags.map((tag) => ({
      id: `${group.group_id}:${tag.tag_id}`,
      name: `${group.name} · ${tag.name}`,
      selected: selectedAnswerTagIds.has(String(tag.tag_id)),
      canClose: false,
    })),
  );

  const judgeTagItems: TagItem[] = (snapshot?.tag_groups ?? []).flatMap((group) =>
    group.tags.map((tag) => ({
      id: `${group.group_id}:${tag.tag_id}`,
      name: `${group.name} · ${tag.name}`,
      selected: selectedJudgeTagIds.has(String(tag.tag_id)),
      canClose: false,
    })),
  );

  const toggleAnswerTag = (compositeId: string) => {
    const [groupId, tagId] = compositeId.split(":");
    const groups = snapshot?.tag_groups ?? [];
    const targetGroup = groups.find((group) => String(group.group_id) === groupId);
    if (!targetGroup) return;

    const targetTagId = String(tagId);
    const groupTagSet = new Set(targetGroup.tags.map((tag) => String(tag.tag_id)));

    const next = answerDraft.selected_tag_ids
      .map((id) => String(id))
      .filter((id) => !groupTagSet.has(id));

    if (!selectedAnswerTagIds.has(targetTagId)) {
      next.push(targetTagId);
    }

    setAnswerDraft({ selected_tag_ids: next });
  };

  const toggleJudgeTag = (compositeId: string) => {
    const [groupId, tagId] = compositeId.split(":");
    const groups = snapshot?.tag_groups ?? [];
    const targetGroup = groups.find((group) => String(group.group_id) === groupId);
    if (!targetGroup) return;

    const targetTagId = String(tagId);
    const groupTagSet = new Set(targetGroup.tags.map((tag) => String(tag.tag_id)));

    const next = judgeDraft.correct_tag_ids
      .map((id) => String(id))
      .filter((id) => !groupTagSet.has(id));

    if (!selectedJudgeTagIds.has(targetTagId)) {
      next.push(targetTagId);
    }

    setJudgeDraft({ correct_tag_ids: next });
  };

  const noopTagMutator = () => {
    // 当前由后端标签组驱动，不支持在此页动态增删标签
  };

  const audioRef = useRef<audioPlayer | null>(null);
  const [audioState, setAudioState] = useState<string | undefined>(undefined);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasParentRef = useRef<HTMLDivElement | null>(null);

  const settingDialogRef = useRef<HTMLDialogElement | null>(null);

  const progressBarRef = useRef<HTMLSpanElement | null>(null);

  const currentAnswererName =
    snapshot?.players?.find(
      (player) => player.player_id === snapshot.current_answerer_player_id,
    )?.username ?? "暂无";

  const queueDisplay = (snapshot?.queue_player_ids ?? [])
    .map((playerId) => {
      const player = snapshot?.players?.find((item) => item.player_id === playerId);
      return player?.username ?? playerId;
    })
    .join(" → ");

  const runAction = async (
    action: () => Promise<{ allowed: boolean; reason?: string }>,
    successMessage: string,
  ) => {
    const result = await action();
    if (!result.allowed) {
      setActionMessage(result.reason ?? "操作未被允许");
      return;
    }
    setActionMessage(successMessage);
  };

  const onAttemptAnswer = async () => {
    if (!wsRef.current) return;
    await runAction(() => sendAttemptAnswer(wsRef.current as WS), "已发送抢答请求");
  };

  const onToggleReady = async () => {
    if (!wsRef.current || !me) return;
    await runAction(
      () => sendPlayerReady(wsRef.current as WS, !me.is_ready),
      !me.is_ready ? "已设置为准备" : "已取消准备",
    );
  };

  const onSubmitAnswer = async () => {
    if (!wsRef.current) return;
    setAnswerDraft({ description_text: descriptionText.trim() });
    await runAction(() => sendSubmitAnswer(wsRef.current as WS), "作答提交成功");
    resetAnswerDraft();
    setDescriptionText("");
  };

  const onSubmitJudge = async () => {
    if (!wsRef.current) return;
    const parsedNewDescriptions = judgeDescriptionsText
      .split("\n")
      .map((text) => text.trim())
      .filter(Boolean);

    setJudgeDraft({ new_correct_descriptions: parsedNewDescriptions });
    await runAction(() => sendJudgeSubmit(wsRef.current as WS), "判分结果已提交");
  };

  useEffect(() => {
    if (!roomId) return;
    syncIdentityFromSession(roomId);
  }, [roomId, syncIdentityFromSession]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const token = sessionStorage.getItem(`ccg-room-token:${roomId}`);
    const wsUrl = buildWsUrl(roomId, token);

    wsRef.current = new WS(wsUrl, WS_RETRY);

    wsRef.current.on(EventType.HEARTBEAT, heartbeatHandler);
    wsRef.current.on(EventType.ROOM_STATE, roomStateHandler);
    wsRef.current.on(EventType.ANSWER_QUEUE, answerQueueHandler);
    wsRef.current.on(EventType.PLAY, playHandler);
    wsRef.current.on(EventType.PAUSE, pauseHandler);
    wsRef.current.on(EventType.SEEK, seekHandler);
    wsRef.current.on(EventType.YOUR_TURN, yourTurnHandler);
    wsRef.current.on(EventType.JUDGING, judgingHandler);
    wsRef.current.on(EventType.ROUND_END, roundEndHandler);
    wsRef.current.on(EventType.SCORE_UPDATE, scoreUpdateHandler);
    wsRef.current.onConnectionStateChange(setConnected);

    setUrl(wsUrl);
    setRoomId(roomId);

    const stopHeartbeat = startHeartbeat(wsRef.current, 1000, 1000);

    return () => {
      stopHeartbeat();
      wsRef.current?.close();
      wsRef.current = undefined;
      setRoomId(null);
    };
  }, [roomId, setConnected, setRoomId, setUrl]);

  useEffect(() => {
    if (!snapshot) return;

    if (progressBarRef.current && !domIsDragging) {
      const currentTimeSec = snapshot.play_progress_ms / 1000;
      const durationSec = audioRef.current?.duration ?? 0;
      if (durationSec > 0) {
        const progressPercent = (currentTimeSec / durationSec) * 100;
        progressBarRef.current.style.width = `${Math.max(0, Math.min(100, progressPercent))}%`;
      }
    }

    const run = async () => {
      if (!audioRef.current) return;
      const durationSec = audioRef.current.duration;
      if (durationSec > 0) {
        audioRef.current.progressMs = snapshot.play_progress_ms;
      }

      if (snapshot.play_state === "playing") {
        await audioRef.current.resume();
      } else if (snapshot.play_state === "paused") {
        await audioRef.current.pause();
      }
    };

    void run();
  }, [snapshot]);

  useEffect(() => {
    audioRef.current = new audioPlayer();
    audioRef.current.onStateChange = (state) => {
      setAudioState(state);
    };
    audioRef.current.volume = localVolume;
    setAudioState(audioRef.current.state);
    audioRef.current.onTimeUpdate = (ev) => {
      if (progressBarRef.current && !domIsDragging) {
        const audioElement = ev.target as HTMLAudioElement;
        const progressPercent =
          audioElement.duration > 0
            ? (audioElement.currentTime / audioElement.duration) * 100
            : 0;
        progressBarRef.current.style.width = `${progressPercent}%`;
      }
    };
    audioRef.current.preload(`https://cdn.modenc.top/files/Orig.mp3`);
    audioRef.current.playUrlAsStream(
      `https://cdn.modenc.top/files/Orig.mp3`,
      false,
    );
    return () => {
      audioRef.current?.cleanup();
      audioRef.current = null;
      setAudioState(undefined);
    };
  }, [localVolume]);

  useEffect(() => {
    const parent = canvasParentRef.current;
    if (!parent) {
      return;
    }

    const onMouseDown = (ev: MouseEvent) => {
      domIsDragging = true;
      progressBarRef.current?.classList.add("no-transition");
      domProgressPercent = (ev.offsetX / (parent.clientWidth || 1)) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercent}%`;
      }
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!domIsDragging) return;
      domProgressPercent = (ev.offsetX / (parent.clientWidth || 1)) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercent}%`;
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (!domIsDragging) return;
      domIsDragging = false;
      progressBarRef.current?.classList.remove("no-transition");
      domProgressPercent = (ev.offsetX / (parent.clientWidth || 1)) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercent}%`;
      }
      if (audioRef.current) {
        audioRef.current.progress = domProgressPercent;
      }
    };

    const onMouseLeave = (ev: MouseEvent) => {
      if (!domIsDragging) return;
      if (ev.offsetX <= 0 || ev.offsetX >= parent.clientWidth) {
        domProgressPercent = (ev.offsetX / (parent.clientWidth || 1)) * 100;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${domProgressPercent}%`;
        }
        if (audioRef.current) {
          audioRef.current.progress = domProgressPercent;
        }
      }
      domIsDragging = false;
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
  }, []);

  const setVolume = (value: number) => {
    if (audioRef.current) {
      audioRef.current.volume = value;
      setLocalVolume(value);
      setPersistVolume(value);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  if (!roomId) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-400 mx-auto">
      {actionMessage ? (
        <div role="alert" className="alert alert-info">
          <span>{actionMessage}</span>
        </div>
      ) : null}
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
                "text-green-600": latencyAvg && latencyAvg < 40,
                "text-yellow-600":
                  latencyAvg && latencyAvg >= 40 && latencyAvg < 100,
                "text-red-500":
                  !isConnected || (latencyAvg && latencyAvg >= 100),
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
        <div className="card shadow-sm w-1/3 min-w-sm max-w-md">
          <div className="card-body">
            <h2 className="text-lg font-semibold">当前歌单</h2>
            <div className="divider m-0"></div>
            <div className="flex flex-row gap-4">
              <figure className="w-24 h-24 rounded-md overflow-hidden">
                <img src={songlistCover} alt="Songlist Cover" />
              </figure>
              <div className="">
                <h2 className="text-lg font-semibold">{songlistName}</h2>
                <div className="text-neutral">共{songlistTotal}首</div>
              </div>
            </div>
          </div>
        </div>
        <div className="card shadow-sm flex-1">
          <div className="card-body">
            <h2 className="text-lg font-semibold">当前歌曲</h2>
            <div className="divider m-0"></div>
            <div className="flex flex-row gap-4">
              <figure className="w-24 h-24 rounded-md overflow-hidden">
                <img src={currentSongCover} alt="Current Song Cover" />
              </figure>
              <div className="flex-1 flex flex-col">
                <div className="text-neutral">{currentSongArtist}</div>
                <h2 className="text-lg font-semibold">{currentSongName}</h2>
                <div className="text-neutral">{currentSongAlbum}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="card shadow-sm">
        <div className="card-body p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="badge badge-soft badge-primary">阶段：{phase}</span>
            <span className="badge badge-soft">当前作答：{currentAnswererName}</span>
            <span className="badge badge-soft">队列：{queueDisplay || "空"}</span>
            <button
              type="button"
              className={clsx("btn btn-sm", {
                "btn-success": !me?.is_ready,
                "btn-warning": !!me?.is_ready,
              })}
              disabled={!permissions.can_player_ready}
              onClick={onToggleReady}
            >
              {me?.is_ready ? "取消准备" : "准备"}
            </button>
          </div>
        </div>
      </div>
      <div className="flex gap-2 w-full">
        <div className="card shadow-sm">
          <button
            type="button"
            className={clsx("btn btn-primary w-2xs h-full p-4 flex-col gap-4", {
              "btn-disabled": !permissions.can_attempt_answer,
            })}
            disabled={!permissions.can_attempt_answer}
            onClick={onAttemptAnswer}
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
          <div className="card-body p-4">
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
            <TagList
              tags={answerTagItems}
              onToggleTag={toggleAnswerTag}
              onAddTag={noopTagMutator}
              onRemoveTag={noopTagMutator}
              showAddControls={false}
              showRemoveButton={false}
              maxTags={TAG_MAX}
              allowDuplicate={false}
            />
            <label className="floating-label mt-2">
              <textarea
                className="textarea w-full"
                placeholder="填写精准描述"
                value={descriptionText}
                onChange={(event) => setDescriptionText(event.target.value)}
                disabled={!isMyTurn}
              />
              <span>精准描述</span>
            </label>
            <button
              type="button"
              className="btn btn-secondary mt-2"
              disabled={!permissions.can_submit_answer}
              onClick={onSubmitAnswer}
            >
              提交作答
            </button>
          </div>
        </div>
        <div className="card shadow-sm w-1/5 max-w-md min-w-3xs">
          <div className="card-body p-4">
            <h2 className="font-semibold flex items-center text-lg">
              <Icon
                icon="heroicons:users"
                width={24}
                height={24}
                className="inline mr-1"
              />
              在线玩家
            </h2>
            <div className="divider m-0"></div>
            <ul className="list gap-4">
              {(snapshot?.players?.length ? snapshot.players : []).map((player) => (
                <li key={player.player_id} className="flex items-center gap-2">
                  <span>{player.username}</span>
                  {player.is_host && <span className="badge badge-primary badge-sm">房主</span>}
                  {snapshot?.current_answerer_player_id === player.player_id && (
                    <span className="badge badge-info badge-sm">作答中</span>
                  )}
                  {!player.is_ready && <span className="badge badge-ghost badge-sm">未准备</span>}
                  {player.is_ready && <span className="badge badge-success badge-sm">已准备</span>}
                </li>
              ))}
              {!snapshot?.players?.length && <li className="text-neutral">暂无玩家状态</li>}
            </ul>
          </div>
        </div>
      </div>

      {isHost ? (
        <div className="card shadow-sm">
          <div className="card-body p-4">
            <h2 className="text-lg font-semibold">房主判分区</h2>
            <div className="divider m-0"></div>
            <TagList
              tags={judgeTagItems}
              onToggleTag={toggleJudgeTag}
              onAddTag={noopTagMutator}
              onRemoveTag={noopTagMutator}
              showAddControls={false}
              showRemoveButton={false}
              allowDuplicate={false}
            />
            <label className="floating-label mt-2">
              <textarea
                className="textarea w-full"
                placeholder="每行一个新增正确描述"
                value={judgeDescriptionsText}
                onChange={(event) => setJudgeDescriptionsText(event.target.value)}
                disabled={!permissions.can_submit_judge}
              />
              <span>新增正确描述（可选）</span>
            </label>
            <label className="label cursor-pointer justify-start gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={judgeDraft.skip_scoring}
                disabled={!permissions.can_submit_judge}
                onChange={(event) => setJudgeDraft({ skip_scoring: event.target.checked })}
              />
              <span className="label-text">本轮不计分</span>
            </label>
            <button
              type="button"
              className="btn btn-primary mt-2"
              disabled={!permissions.can_submit_judge}
              onClick={onSubmitJudge}
            >
              提交判分
            </button>
          </div>
        </div>
      ) : null}

      <div className="card shadow-sm max-h-120">
        <div className="card-body overflow-auto p-0">
          <table className="table table-pin-cols table-pin-rows">
            <thead>
              <tr>
                <th className="w-4 text-end">排名</th>
                <th className="">玩家</th>
                <td className="w-6 text-end">总分</td>
                {new Array(125).fill(0).map((_, i) => (
                  <td key={i} className="">
                    第{i + 1}轮
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {new Array(20).fill(0).map((_, i) => (
                <tr key={i} className="">
                  <th className="text-end">{i + 1}</th>
                  <th className="text-nowrap">{scores[i]?.username ?? snapshot?.players?.[i]?.username ?? `玩家${i + 1}`}</th>
                  <td className="text-end">{scores[i]?.total_score ?? snapshot?.players?.[i]?.score ?? 0}</td>
                  {new Array(125).fill(0).map((_, roundIndex) => (
                    <td key={roundIndex} className="w-16">
                      {roundIndex === 0 ? (scores[i]?.score_delta ?? 0) : "-"}
                    </td>
                  ))}
                </tr>
              ))}
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
                ? "这么小声还想开军舰？"
                : localVolume > 150
                  ? "我说你耳朵聋，你听不见吗？"
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
      <div>
        <button
          className="btn"
          onClick={() => {
            if (
              audioRef.current &&
              canvasRef.current &&
              canvasParentRef.current
            ) {
              audioRef.current.initCanvas(
                canvasRef.current,
                canvasParentRef.current,
              );
              audioRef.current?.togglePlay();
            }
          }}
        >
          {audioState === "running" ? "Pause Audio" : "Resume Audio"}
        </button>
      </div>
    </div>
  );
}

export default RoomPage;
