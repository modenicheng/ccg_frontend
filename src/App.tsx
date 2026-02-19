import "./App.css";
import clsx from "clsx";
import { Icon } from "@iconify-icon/react";

import { useEffect, useRef, useState } from "react";
import { WS } from "./wsClient";
import { EventType } from "./types/eventTypes";
import { heartbeatHandler, startHeartbeat } from "./wsClient/handlers";
import useWebSocketStore from "./stores/webSocketStore";
import { audioPlayer } from "./audioPlayer";
const development = import.meta.env.DEV;

// const WS_URL = 'ws://localhost:8000/ws/';
const WS_URL = development ? "ws://localhost:8000/ws/" : "/ws/";
const WS_RETRY = { max: 10 };

setInterval(() => {
  console.clear();
}, 20000);

let domProgressPercent = 0;
let domIsDragging = false;

function App() {
  const wsRef = useRef<WS | undefined>(undefined);
  const { isConnected, latencyAvg, setConnected, setUrl } = useWebSocketStore();
  const [volume, setLocalVolume] = useState<number>(100);

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
    setLocalVolume(audioRef.current.volume);
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
    return () => {
      audioRef.current?.cleanup();
      audioRef.current = null;
      setAudioState(undefined);
    };
  }, []);

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
    canvasParentRef.current?.addEventListener("mouseleave", () => {
      domIsDragging = false;
      progressBarRef.current?.classList.remove("no-transition");
    });
  });

  const setVolume = (value: number) => {
    if (audioRef.current) {
      audioRef.current.volume = value;
      setLocalVolume(value);
    }
  };

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
          className="btn h-full p-3 shadow-sm"
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
      <div className="grid grid-cols-7 gap-2">
        <div className="card shadow-sm md:col-span-4 lg:col-span-5 sm:col-span-full">
          <div className="card-body">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-12 text-center table-pin-cols">排名</th>
                  <th className="table-pin-cols">玩家</th>
                  <th className="w-16">总分</th>
                </tr>
              </thead>
              <tbody>
                {new Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td className="text-end">{i + 1}</td>
                    <td>玩家{i + 1}</td>
                    <td className="text-end">{100 - i * 10}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card shadow-sm md:col-span-3 lg:col-span-2 sm:col-span-full">
          <div className="card-body">111</div>
        </div>
      </div>
      <dialog ref={settingDialogRef} className="modal">
        <div className="modal-box">
          <h2 className="font-bold text-xl">设置</h2>
          <div className="divider"></div>
          <input
            type="range"
            min={0}
            max={300}
            value={volume}
            className={clsx("range", {
              "range-primary": volume <= 100,
              "range-warning": volume > 100 && volume <= 200,
              "range-error": volume > 200,
            })}
            onChange={(e) => setVolume(parseInt(e.target.value))}
          />
          <span
            className={clsx("text-sm ml-2", {
              "text-warning": volume > 100 && volume <= 200,
              "text-error": volume > 200,
            })}
          >
            {volume} %
          </span>
          <div className="text-xs text-gray-400 mt-1">
            {volume > 100 && volume <= 200
              ? "我说你耳朵聋，你听不见吗？"
              : volume > 200
                ? "这么小声还想开军舰？"
                : volume === 0
                  ? "一个猜歌比赛你不开声音，你是不是*开了*？"
                  : "这样的声音大小合适吗？听得见吗？"}
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
              audioRef.current.playUrlAsStream(
                `https://cdn.modenc.top/files/Orig.mp3`,
              );
            }
          }}
        >
          Play Test Audio
        </button>
        <div>{audioState}</div>
        <button
          className="btn"
          onClick={() => {
            audioRef.current?.togglePlay();
          }}
        >
          {audioState === "running" ? "Pause Audio" : "Resume Audio"}
        </button>
      </div>
    </div>
  );
}

export default App;
