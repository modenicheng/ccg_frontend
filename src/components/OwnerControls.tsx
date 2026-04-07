import clsx from "clsx";
import { Icon } from "@iconify-icon/react";
import { useRef } from "react";
import type { RoomState } from "../types/store";

interface OwnerControlsProps {
  isOwner: boolean;
  audioState: string;
  isPlaybackStateMissing: boolean;
  isWsDisconnected: boolean;
  isJudging: boolean;
  roomState: RoomState | undefined;
  judgingDialogRef: React.RefObject<HTMLDialogElement | null>;
  onTogglePlayPause: () => void;
  onGameStart: () => void;
  onSkipRound: () => void;
  onEndRound: () => void;
  onShowSong: () => void;
}

export function OwnerControls({
  isOwner,
  audioState,
  isPlaybackStateMissing,
  isWsDisconnected,
  isJudging,
  roomState,
  judgingDialogRef,
  onTogglePlayPause,
  onGameStart,
  onSkipRound,
  onEndRound,
  onShowSong,
}: OwnerControlsProps) {
  const nextRoundConfirmDialogRef = useRef<HTMLDialogElement | null>(null);

  if (!isOwner) return null;

  const isRoundCompleted =
    roomState?.roundState === "COMPLETED" || roomState?.roundStateCode === 4;
  const canEnterNextRoundDirectly = isRoundCompleted && !isJudging;

  const handleNextRoundClick = () => {
    if (roomState?.statusCode === 0) {
      onGameStart();
      return;
    }

    if (!canEnterNextRoundDirectly) {
      nextRoundConfirmDialogRef.current?.showModal();
      return;
    }

    onSkipRound();
  };

  return (
    <div className="card shadow-sm min-w-4xs md:max-w-md md:w-1/4 sm:w-1/6">
      <div className="card-body p-3 gap-1.5 user-drag-none">
        <button
          type="button"
          className={clsx("btn btn-sm btn-soft", {
            "btn-success": audioState !== "running",
            "btn-warning": audioState === "running",
          })}
          disabled={isPlaybackStateMissing || isWsDisconnected}
          onClick={onTogglePlayPause}
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
            onClick={handleNextRoundClick}
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
            className={clsx("btn btn-sm btn-soft join-item flex-1", {
              "btn-info": !isJudging,
              "btn-success": isJudging,
            })}
            disabled={isWsDisconnected}
            onClick={() => {
              if (isJudging) {
                judgingDialogRef.current?.showModal();
              } else {
                onEndRound();
              }
            }}
          >
            <Icon icon="heroicons:scale" width={16} height={16} />
            {isJudging ? "判分" : "结束回合"}
          </button>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-secondary btn-soft"
          disabled={isWsDisconnected}
          onClick={onShowSong}
        >
          <Icon icon="heroicons:eye" width={16} height={16} />
          展示答案
        </button>

        <dialog ref={nextRoundConfirmDialogRef} className="modal">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg">确认进入下一轮</h3>
            <p className="py-4">
              {isJudging
                ? "当前回合已结束但尚未判分，确定要跳过判分并进入下一轮吗？"
                : "当前回合尚未结束，确定要直接跳过并进入下一轮吗？"}
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => nextRoundConfirmDialogRef.current?.close()}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-warning"
                disabled={isWsDisconnected}
                onClick={() => {
                  nextRoundConfirmDialogRef.current?.close();
                  onSkipRound();
                }}
              >
                直接跳过
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="submit">关闭</button>
          </form>
        </dialog>
      </div>
    </div>
  );
}
