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
    <div className="card shadow-sm">
      <button
        type="button"
        className={clsx("btn btn-primary w-2xs h-full p-4 flex-col gap-4", {
          "btn-disabled": isDisabled,
          "btn-active": isBuzzHotkeyActive,
        })}
        disabled={isDisabled}
        onClick={onBuzz}
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
  );
}
