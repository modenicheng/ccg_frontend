import clsx from "clsx";
import { Icon } from "@iconify-icon/react";

type UserBarProps = {
  username: string;
  order?: number;
  activate?: boolean;
  answering?: boolean;
  hasBuzzed?: boolean;
  isSelf?: boolean;
  online?: boolean;
  showKickAction?: boolean;
  kickDisabled?: boolean;
  onKick?: () => void;
};

export const UserBar: React.FC<UserBarProps> = ({
  username,
  order,
  activate = false,
  answering = false,
  hasBuzzed = false,
  isSelf = false,
  online = true,
  showKickAction = false,
  kickDisabled = false,
  onKick,
}) => {
  const orderedLayout = activate || hasBuzzed;

  return (
    <>
      <div
        className={clsx("card w-full transition-all duration-300 select-none", {
          "bg-primary": answering,
          "shadow-sm": activate,
          "bg-primary/10": activate && !answering,
          "bg-base-200 saturate-50": hasBuzzed && !activate && !answering,
          "buzz-ordered-item": typeof order === "number",
          "opacity-60": !online,
          "buzz-activate-pop": activate,
          "opacity-50": !online,
        })}
      >
        <div className="card-body p-2 w-full overflow-hidden">
          <div className="flex gap-2 items-center">
            <div
              className={clsx(
                "badge badge-primary transition-all w-16",
                "justify-end -ml-8",
                "font-mono",
                " ease-out",
                {
                  "badge-soft": answering,
                  "badge-neutral badge-soft": hasBuzzed && !activate && !answering,
                  "userbar-active": orderedLayout,
                  userbar: !orderedLayout,
                },
              )}
            >
              {order ?? "-"}
            </div>
            <div
              className={clsx("font-semibold text-base transition-all ease-out", {
                "text-primary-content": answering,
                "text-primary translate-x-0": activate,
                "text-base-content translate-x-0": hasBuzzed && !activate,
                "-translate-x-10": !activate && !hasBuzzed,
                "text-base-content/70": hasBuzzed && !activate && !answering,
                "text-gray-400": !online,
              })}
            >
              {username}
            </div>
            {isSelf || !online || (showKickAction && onKick) || (isSelf && hasBuzzed) ? (
              <div className="ml-auto flex items-center gap-1">
                {isSelf ? <div className="badge badge-soft badge-info">我</div> : null}
                {isSelf && hasBuzzed ? <div className="badge badge-soft badge-warning">已抢答</div> : null}
                {!online ? <div className="badge badge-soft badge-neutral text-xs">离线</div> : null}
                {showKickAction && onKick ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error"
                    disabled={kickDisabled}
                    onClick={onKick}
                    aria-label={`踢出玩家 ${username}`}
                    title={`踢出 ${username}`}
                  >
                    <Icon icon="heroicons:trash-2" width={14} height={14} />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};
