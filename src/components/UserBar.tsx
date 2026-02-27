import clsx from "clsx";
type UserBarProps = {
  username: string;
  order?: number;
  activate?: boolean;
  answering?: boolean;
};

export const UserBar: React.FC<UserBarProps> = ({
  username,
  order,
  activate = false,
  answering = false,
}) => {
  return (
    <>
      <div
        className={clsx("card w-full transition-all duration-300 select-none", {
          "bg-primary": answering,
          "shadow-sm": activate,
          "bg-primary/10": activate && !answering,
          "buzz-activate-pop": activate,
        })}
      >
        <div className="card-body p-2 w-full overflow-hidden">
          <div className="flex gap-2">
            <div
              className={clsx(
                "badge badge-primary transition-all w-16",
                "justify-end -ml-8",
                "font-mono",
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
              className={clsx("font-semibold text-base transition-all", {
                "text-primary-content": answering,
                "text-primary translate-x-0": activate,
                "-translate-x-10": !activate,
              })}
            >
              {username}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
