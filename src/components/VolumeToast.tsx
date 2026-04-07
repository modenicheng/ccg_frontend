import clsx from "clsx";

interface VolumeToastProps {
  isVisible: boolean;
  isClosing: boolean;
  localVolume: number;
}

export function VolumeToast({
  isVisible,
  isClosing,
  localVolume,
}: VolumeToastProps) {
  if (!isVisible) return null;

  return (
    <div className="toast toast-top toast-start z-120">
      <div
        className={clsx(
          "card bg-base-100 shadow-lg w-64 transition-all duration-200 ease-out",
          {
            "opacity-100 translate-y-0 scale-100": !isClosing,
            "opacity-0 -translate-y-1 scale-95": isClosing,
          },
        )}
      >
        <div className="card-body gap-2 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">音量</span>
            <span className="font-mono">{localVolume}%</span>
          </div>
          <progress
            className={clsx("progress w-full volume-progress-eased", {
              "progress-primary": localVolume <= 100,
              "progress-warning": localVolume > 100 && localVolume <= 150,
              "progress-error": localVolume > 150,
            })}
            value={localVolume}
            max="200"
          ></progress>
        </div>
      </div>
    </div>
  );
}
