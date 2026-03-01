import clsx from "clsx";

export interface SongInfo {
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  platformUrl?: string;
}

interface SongInfoCardProps {
  /** 曲目信息，为null时显示占位符 */
  songInfo: SongInfo | null;
  /** 是否正在判分状态（影响显示样式） */
  isJudging?: boolean;
  /** 是否紧凑模式（用于页面顶部显示） */
  compact?: boolean;
  /** 是否可点击（用于弹窗中的详细显示） */
  clickable?: boolean;
  /** 点击回调函数 */
  onClick?: () => void;
  /** 自定义类名 */
  className?: string;
  /** 是否显示专辑信息（在紧凑模式中可能不需要重复显示） */
  showAlbum?: boolean;
  /** 是否显示平台链接提示 */
  showPlatformHint?: boolean;
  /** 默认封面图片URL */
  defaultCoverUrl?: string;
}

/**
 * 曲目信息卡片组件
 * 支持两种模式：紧凑模式（页面顶部）和详细模式（弹窗）
 */
export function SongInfoCard({
  songInfo,
  isJudging: _isJudging = false,
  compact = false,
  clickable = false,
  onClick,
  className = "",
  showAlbum = true,
  showPlatformHint = true,
  defaultCoverUrl = "https://via.placeholder.com/128x128/cccccc/666666?text=?",
}: SongInfoCardProps) {
  // 如果没有曲目信息，显示占位符
  void _isJudging;
  if (!songInfo) {
    return (
      <div className={clsx("card shadow-sm flex-1", className)}>
        <div className="card-body">
          <div className="flex flex-row gap-4">
            <figure>
              <img
                className="h-32 rounded-md"
                src={defaultCoverUrl}
                alt="未知曲目"
              />
            </figure>
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-semibold">
                {compact ? "????????????????" : "未知曲目"}
              </h2>
              {showAlbum && (
                <h2 className="text-lg">
                  {compact ? "????????????????" : "未知专辑"}
                </h2>
              )}
              <div className="text-md mt-4 opacity-70">
                {compact ? "????????" : "未知艺术家"}
              </div>
              {!compact && showAlbum && (
                <div className="text-md opacity-70">
                  {compact ? "????????????????????????" : "未知专辑信息"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleClick = () => {
    if (clickable && onClick) {
      onClick();
    }
  };

  const cardContent = (
    <div className={clsx("flex flex-row gap-4", { "items-center": compact })}>
      <figure>
        <img
          className={clsx("rounded-md", {
            "h-32": !compact,
            "h-24": compact,
          })}
          src={songInfo.coverUrl || defaultCoverUrl}
          alt={`${songInfo.title} - ${songInfo.artist}`}
        />
      </figure>
      <div className="flex flex-col gap-1">
        <h2
          className={clsx("font-semibold", {
            "text-2xl": !compact,
            "text-xl": compact,
          })}
        >
          {songInfo.title}
        </h2>
        {showAlbum && (
          <h3 className={clsx({ "text-lg": !compact, "text-md": compact })}>
            {songInfo.album}
          </h3>
        )}
        <div
          className={clsx("opacity-70", {
            "text-md mt-4": !compact,
            "text-sm mt-2": compact,
          })}
        >
          {songInfo.artist}
        </div>
        {!compact && showAlbum && (
          <div className="text-md opacity-70">{songInfo.album}</div>
        )}
        {!compact && songInfo.platformUrl && showPlatformHint && (
          <div className="text-sm text-blue-500 mt-2">点击查看曲目详情</div>
        )}
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className={clsx("card shadow-sm flex-1", className)}>
        <div className="card-body">{cardContent}</div>
      </div>
    );
  }

  return (
    <div
      className={clsx("card bg-base-200 mb-4", className, {
        "cursor-pointer": clickable,
      })}
      onClick={handleClick}
    >
      <div className="card-body">{cardContent}</div>
    </div>
  );
}