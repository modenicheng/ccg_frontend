import clsx from "clsx";
import type { UserState } from "../types/store";

interface BuzzButtonProps {
  isConnected: boolean;
  isCurrentPlayerInAnswerQueue: boolean;
  isBuzzHotkeyActive: boolean;
  user: UserState | undefined;
  roomStatus: string | undefined;
  onBuzz: () => void;
}

export function BuzzButton({
  isConnected,
  isCurrentPlayerInAnswerQueue,
  isBuzzHotkeyActive,
  user,
  roomStatus,
  onBuzz,
}: BuzzButtonProps) {
  const isDisabled =
    !isConnected || isCurrentPlayerInAnswerQueue || !user || roomStatus !== "playing";

  return (
    <div className="card shadow-sm w-full sm:w-auto">
      <button
        type="button"
        className={clsx("btn btn-primary w-full sm:w-2xs h-full p-3 sm:p-4 flex-col gap-2 sm:gap-4 min-h-22 sm:min-h-auto", {
          "btn-disabled": isDisabled,
          "btn-active": isBuzzHotkeyActive,
        })}
        disabled={isDisabled}
        onClick={onBuzz}
      >
        <h2 className="text-xl sm:text-3xl">抢答！</h2>
        {/* 快捷键提示：仅在桌面端显示 */}
        <div className="hidden sm:flex gap-1 sm:gap-2">
          <div className="kbd kbd-sm font-mono text-xs text-base-content">
            Space ␣
          </div>
          <div className="divider divider-horizontal m-0"></div>
          <div className="kbd kbd-sm font-mono text-xs text-base-content">
            Enter ⏎
          </div>
        </div>
      </button>
    </div>
  );
}
