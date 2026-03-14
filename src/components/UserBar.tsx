import clsx from "clsx";
type UserBarProps = {
  username: string;
  order?: number;
  activate?: boolean;
  answering?: boolean;
  isSelf?: boolean;
  online?: boolean;
};

export const UserBar: React.FC<UserBarProps> = ({
  username,
  order,
  activate = false,
  answering = false,
  isSelf = false,
  online = true,
}) => {
  return (
    <>
      <div
        className={clsx("card w-full transition-all duration-300 select-none", {
          "bg-primary": answering,
          "shadow-sm": activate,
          "bg-primary/10": activate && !answering,
          "buzz-ordered-item": typeof order === "number",
          "opacity-60": !online,
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
                  "userbar-active": activate,
                  userbar: !activate,
                },
              )}
            >
              {order ?? "-"}
            </div>
            <div
              className={clsx("font-semibold text-base transition-all ease-out", {
                "text-primary-content": answering,
                "text-primary translate-x-0": activate,
                "-translate-x-10": !activate,
                "text-gray-400": !online,
              })}
            >
              {username}
            </div>
            {isSelf ? <div className="badge badge-soft badge-info ml-auto">我</div> : null}
            {!online && (
              <div
                className="badge badge-error badge-xs ml-auto"
                title="玩家已断线"
              >
                ●
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
