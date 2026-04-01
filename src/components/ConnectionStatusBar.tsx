import { Icon } from "@iconify-icon/react";
import clsx from "clsx";
import type { RefObject } from "react";

interface ConnectionStatusBarProps {
  isConnected: boolean;
  latencyAvg: number | null;
  settingDialogRef: RefObject<HTMLDialogElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasParentRef: RefObject<HTMLDivElement | null>;
  progressBarRef: RefObject<HTMLSpanElement | null>;
}

export function ConnectionStatusBar({
  isConnected,
  latencyAvg,
  settingDialogRef,
  canvasRef,
  canvasParentRef,
  progressBarRef,
}: ConnectionStatusBarProps) {
  return (
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
  );
}
