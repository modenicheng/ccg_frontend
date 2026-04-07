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
  /** 紧凑模式下使用更大排印（用于RoomPage顶部与同排卡片对齐） */
  compactLarge?: boolean;
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
  compactLarge = false,
  clickable = false,
  onClick,
  className = "",
  showAlbum = true,
  showPlatformHint = true,
  defaultCoverUrl = "/icon_01.svg",
}: SongInfoCardProps) {
  // 如果没有曲目信息，显示占位符
  void _isJudging;
  if (!songInfo) {
    return (
      <div
        className={clsx(
          "card shadow-sm w-full sm:w-auto sm:flex-1 min-w-xs h-full",
          className,
        )}
      >
        <div className="card-body min-w-0">
          <div className="flex flex-row gap-4 min-w-0">
            <figure className="shrink-0">
              <img
                className={clsx("rounded-md shrink-0 object-cover", {
                  "h-24 w-24 sm:h-32 sm:w-32":
                    !compact || (compact && compactLarge),
                  "h-24 w-24 sm:h-28 sm:w-28": compact && !compactLarge,
                })}
                src={defaultCoverUrl}
                alt="未知曲目"
              />
            </figure>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <h2
                className={clsx("font-semibold truncate", {
                  "text-lg sm:text-2xl": !compact || (compact && compactLarge),
                  "text-lg sm:text-xl": compact && !compactLarge,
                })}
              >
                {compact ? "????????????????" : "未知曲目"}
              </h2>
              {showAlbum && (
                <h2
                  className={clsx("truncate", {
                    "text-base sm:text-lg":
                      !compact || (compact && compactLarge),
                    "text-sm sm:text-base": compact && !compactLarge,
                  })}
                >
                  {compact ? "????????????????" : "未知专辑"}
                </h2>
              )}
              <div
                className={clsx("opacity-70 truncate", {
                  "text-sm sm:text-md mt-2 sm:mt-4":
                    !compact || (compact && compactLarge),
                  "text-sm sm:text-base mt-2 sm:mt-3": compact && !compactLarge,
                })}
              >
                {compact ? "????????" : "未知艺术家"}
              </div>
              {!compact && showAlbum && (
                <div className="text-sm sm:text-md opacity-70 truncate">
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
    <div className={clsx("flex flex-row gap-4 min-w-0", { "items-top": compact })}>
      <figure className="shrink-0">
        <img
          className={clsx("rounded-md shrink-0 object-cover", {
            "h-24 w-24 sm:h-32 sm:w-32":
              !compact || (compact && compactLarge),
            "h-24 w-24 sm:h-28 sm:w-28": compact && !compactLarge,
          })}
          src={songInfo.coverUrl || defaultCoverUrl}
          alt={`${songInfo.title} - ${songInfo.artist}`}
        />
      </figure>
      <div className="flex flex-col gap-1 h-full justify-top flex-1 min-w-0">
        <div>
          <h2
            className={clsx("font-semibold truncate", {
              "text-lg sm:text-2xl": !compact || (compact && compactLarge),
              "text-lg sm:text-xl": compact && !compactLarge,
            })}
          >
            {songInfo.title}
          </h2>
          {showAlbum && (
            <div
              className={clsx("truncate", {
                "text-base sm:text-md": !compact || (compact && compactLarge),
                "text-sm sm:text-base": compact && !compactLarge,
              })}
            >
              {songInfo.album}
            </div>
          )}
        </div>
        <div
          className={clsx("opacity-70 truncate", {
            "text-sm sm:text-md": !compact || (compact && compactLarge),
            "text-sm sm:text-base": compact && !compactLarge,
          })}
        >
          {songInfo.artist}
        </div>
        {!compact && showAlbum && (
          <div className="text-sm sm:text-md opacity-70 truncate">
            {songInfo.album}
          </div>
        )}
        {!compact && songInfo.platformUrl && showPlatformHint && (
          <div className="text-xs sm:text-sm text-blue-500 truncate">
            点击查看曲目详情
          </div>
        )}
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className={clsx("card shadow-sm flex-1 min-w-0 h-full", className)}>
        <div className="card-body p-4 sm:p-5 min-w-0">{cardContent}</div>
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
