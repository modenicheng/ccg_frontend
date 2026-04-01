import clsx from "clsx";
import type { RefObject } from "react";

interface SettingDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  theme: string;
  setTheme: (theme: string) => void;
  localVolume: number;
  setVolume: (volume: number) => void;
}

const themes = ["light", "dark", "night", "cyberpunk", "emerald", "nord"];

export function SettingDialog({
  dialogRef,
  theme,
  setTheme,
  localVolume,
  setVolume,
}: SettingDialogProps) {
  return (
    <dialog ref={dialogRef} className="modal">
      <div className="modal-box w-full max-w-200">
        <h2 className="font-bold text-2xl">设置</h2>
        <div className="divider mt-0.5 mb-0.5"></div>
        <div className="flex flex-col gap-1.5">
          <h3 className="font-semibold text-xl">主题</h3>
          <div className="flex">
            <div className="join join-horizontal">
              {themes.map((themeName) => (
                <input
                  key={themeName}
                  type="radio"
                  name="theme-buttons"
                  className="btn theme-controller join-item"
                  aria-label={themeName[0].toUpperCase() + themeName.slice(1)}
                  value={themeName}
                  checked={theme === themeName}
                  onChange={() => setTheme(themeName)}
                />
              ))}
            </div>
          </div>
          <div className="text-xs text-gray-400">你可以挑一个自己喜欢的主题~</div>
        </div>
        <div className="flex flex-col gap-1.5 mt-4">
          <h3 className="font-semibold text-xl">音量</h3>
          <div className="text-xs opacity-70 flex items-center gap-1">
            快捷键：
            <kbd className="kbd kbd-xs">-</kbd>
            <span>/</span>
            <kbd className="kbd kbd-xs">=</kbd>
            <span>（</span>
            <kbd className="kbd kbd-xs">+</kbd>
            <span>）</span>
          </div>
          <div className="flex">
            <input
              type="range"
              min={0}
              max={200}
              value={localVolume}
              className={clsx("range flex-1", {
                "range-primary": localVolume <= 100,
                "range-warning": localVolume > 100 && localVolume <= 150,
                "range-error": localVolume > 150,
              })}
              onChange={(e) => setVolume(parseInt(e.target.value, 10))}
            />
            <span
              className={clsx("text-sm ml-2", {
                "text-warning": localVolume > 100 && localVolume <= 150,
                "text-error": localVolume > 150,
              })}
            >
              {localVolume} %
            </span>
          </div>
          <div className="text-xs text-gray-400">
            {localVolume > 100 && localVolume <= 150
              ? "我说你耳朵聋，你听不见吗？"
              : localVolume > 150
                ? "这么小声还想开军舰？"
                : localVolume === 0
                  ? "一个猜歌比赛你不开声音，你是不是*开了*？"
                  : "这样的声音大小合适吗？听得见吗？"}
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}
