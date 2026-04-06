import clsx from "clsx";
import { Icon } from "@iconify-icon/react";

interface RoomInfoProps {
  roomId: string;
  roomTitle: string | null | undefined;
  roomOwner: string;
  roomIdCopyState: "idle" | "success" | "error";
  onCopyRoomId: () => void;
  onCopyJoinLink?: () => void; // 新增：复制快速加入链接
}

export function RoomInfo({
  roomId,
  roomTitle,
  roomOwner,
  roomIdCopyState,
  onCopyRoomId,
  onCopyJoinLink,
}: RoomInfoProps) {
  return (
    <div className="card shadow-sm w-full sm:max-w-sm sm:min-w-3xs">
      <div className="card-body">
        <h2 className="text-lg font-semibold flex items-center">
          <Icon
            icon="heroicons:home"
            className="mr-2"
            width="24"
            height="24"
          />
          {roomTitle ? roomTitle : "房间信息"}
        </h2>
        <div className="divider m-0"></div>
        <div className="text-sm sm:text-base">房主： {roomOwner}</div>
        <div className="flex items-center gap-1.5 text-xs sm:text-sm">
          <span>
            房间 ID： <span className="font-mono">{roomId}</span>
          </span>
          <button
            type="button"
            className={clsx("btn btn-ghost btn-xs btn-square", {
              "text-success": roomIdCopyState === "success",
              "text-error": roomIdCopyState === "error",
            })}
            onClick={onCopyRoomId}
            title={
              roomIdCopyState === "success"
                ? "已复制"
                : roomIdCopyState === "error"
                  ? "复制失败"
                  : "复制房间 ID"
            }
            aria-label={`复制房间 ID ${roomId}`}
          >
            <Icon
              icon={
                roomIdCopyState === "success"
                  ? "heroicons:clipboard-document-check"
                  : roomIdCopyState === "error"
                    ? "heroicons:exclamation-circle"
                    : "heroicons:clipboard-document"
              }
              width={16}
              height={16}
            />
          </button>
        </div>
        {/* 快速加入链接复制按钮 */}
        <div className="flex items-center gap-1.5 text-xs sm:text-sm">
          <span className="truncate">
            快速加入： <span className="font-mono text-[10px] sm:text-xs">http://ccg.modenc.top/join/{roomId}</span>
          </span>
          <button
            type="button"
            className={clsx("btn btn-ghost btn-xs btn-square flex-shrink-0")}
            onClick={onCopyJoinLink}
            title="复制快速加入链接"
            aria-label="复制快速加入链接"
          >
            <Icon
              icon="heroicons:link"
              width={16}
              height={16}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
