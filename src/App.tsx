import "./App.css";
import clsx from "clsx";
import { Icon } from "@iconify-icon/react";

import { useEffect, useRef, useState } from "react";
import { WS } from "./wsClient";
import { EventType } from "./types/eventTypes";
import { heartbeatHandler, startHeartbeat } from "./wsClient/handlers";
import useWebSocketStore from "./stores/webSocketStore";
import usePersistStore from "./stores/persistStore";
import { audioPlayer } from "./audioPlayer";
import { TagList } from "./components";
import type { TagItem } from "./types/tag";
const development = import.meta.env.DEV;

// const WS_URL = 'ws://localhost:8000/ws/';
const WS_URL = development ? "ws://localhost:8000/ws/" : "/ws/";
const WS_RETRY = { max: 10 };
const TAG_MAX = 0;

let domProgressPercent = 0;
let domIsDragging = false;
const themes = ["light", "dark", "night", "cyberpunk", "emerald", "nord"];

const makeTagId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `tag-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function App() {
  const wsRef = useRef<WS | undefined>(undefined);
  const { isConnected, latencyAvg, setConnected, setUrl } = useWebSocketStore();
  const {
    theme,
    setTheme,
    volume: persistVolume,
    setVolume: setPersistVolume,
  } = usePersistStore();
  const [localVolume, setLocalVolume] = useState<number>(persistVolume);

  const [tags, setTags] = useState<TagItem[]>([
    { id: "tag1", name: "Tag 1", selected: false, canClose: false },
    { id: "tag2", name: "Tag 2", selected: false, canClose: false },
    { id: "tag3", name: "Tag 3", selected: false, canClose: false },
    { id: "tag4", name: "Tag 4", selected: false, canClose: false },
    { id: "tag5", name: "Tag 5", selected: false, canClose: false },
  ]);

  const toggleTag = (id: string) => {
    setTags((prevTags) =>
      prevTags.map((tag) =>
        tag.id === id ? { ...tag, selected: !tag.selected } : tag,
      ),
    );
  };

  const addTag = (name: string) => {
    setTags((prevTags) => {
      if (TAG_MAX > 0 && prevTags.length >= TAG_MAX) {
        return prevTags;
      }
      return [
        ...prevTags,
        {
          id: makeTagId(),
          name,
          selected: false,
          canClose: true,
        },
      ];
    });
  };

  const removeTag = (id: string) => {
    setTags((prevTags) => prevTags.filter((tag) => tag.id !== id));
  };

  const audioRef = useRef<audioPlayer | null>(null);
  const [audioState, setAudioState] = useState<string | undefined>(undefined);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasParentRef = useRef<HTMLDivElement | null>(null);

  const settingDialogRef = useRef<HTMLDialogElement | null>(null);

  const progressBarRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    wsRef.current = new WS(WS_URL, WS_RETRY);

    // Register handlers
    wsRef.current.on(EventType.HEARTBEAT, heartbeatHandler);

    // Register connection state change callback
    wsRef.current.onConnectionStateChange(setConnected);

    // Set URL in store
    setUrl(WS_URL);

    // Start client heartbeat (send PINGs) with 2-second warmup delay
    const stopHeartbeat = startHeartbeat(wsRef.current, 1000, 1000);

    return () => {
      stopHeartbeat();
      wsRef.current?.close();
      wsRef.current = undefined;
    };
  }, [setConnected, setUrl]);

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
    canvasParentRef.current?.addEventListener("mousedown", (ev) => {
      domIsDragging = true;
      progressBarRef.current?.classList.add("no-transition");
      domProgressPercent =
        (ev.offsetX / (canvasParentRef.current?.clientWidth || 1)) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercent}%`;
      }
    });
    canvasParentRef.current?.addEventListener("mousemove", (ev) => {
      if (!domIsDragging) return;
      domProgressPercent =
        (ev.offsetX / (canvasParentRef.current?.clientWidth || 1)) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercent}%`;
      }
    });
    canvasParentRef.current?.addEventListener("mouseup", (ev) => {
      if (!domIsDragging) return;
      domIsDragging = false;
      progressBarRef.current?.classList.remove("no-transition");
      domProgressPercent =
        (ev.offsetX / (canvasParentRef.current?.clientWidth || 1)) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercent}%`;
      }
      if (audioRef.current) {
        audioRef.current.progress = domProgressPercent;
      }
    });
    canvasParentRef.current?.addEventListener("mouseleave", (ev) => {
      // Only when the mouse leaves from the left or right edge, we consider it as ending dragging.
      // This allows users to the the progress to the very start or end.
      if (!domIsDragging) return;
      if (
        ev.offsetX <= 0 ||
        ev.offsetX >= (canvasParentRef.current?.clientWidth || 0)
      ) {
        domProgressPercent =
          (ev.offsetX / (canvasParentRef.current?.clientWidth || 1)) * 100;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${domProgressPercent}%`;
        }
        if (audioRef.current) {
          audioRef.current.progress = domProgressPercent;
        }
      }
      domIsDragging = false;
      progressBarRef.current?.classList.remove("no-transition");
    });
  });

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

  return (
    <div className="flex flex-col gap-4 p-4 max-w-400 mx-auto">
      {/* Header, the connection info bar */}
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
        <div className="card shadow-sm">
          <div
            className={clsx("btn btn-primary w-2xs h-full p-4 flex-col gap-4", {
              "btn-disabled": !isConnected,
            })}
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
          </div>
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
            <TagList
              tags={tags}
              onToggleTag={toggleTag}
              onAddTag={addTag}
              onRemoveTag={removeTag}
              maxTags={TAG_MAX}
              allowDuplicate={false}
            />
          </div>
        </div>
        <div className="card shadow-sm w-1/5 max-w-md min-w-3xs">
          <div className="card-body p-0">
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

      {/* SCORE TABLE */}
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
                  <th className="text-nowrap">玩家{i + 1}</th>
                  <td className="text-end">{100 - i * 10}</td>
                  {new Array(125).fill(0).map((_, i) => (
                    <td key={i} className="w-16">
                      1
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SETTING DIALOG */}
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
            {/* <Themes></Themes> */}
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
                onChange={(e) => setVolume(parseInt(e.target.value))}
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
      {/* TEST BELOW */}
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

export default App;
