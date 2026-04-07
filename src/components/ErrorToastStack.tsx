import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import useErrorToastStore from "../stores/errorToastStore";

const AUTO_HIDE_MS = 5000;
const EXIT_ANIMATION_MS = 220;

interface ToastTimerHandle {
  hideTimer: number;
  removeTimer: number;
  enterFrame: number;
}

export function ErrorToastStack() {
  const toasts = useErrorToastStore((state) => state.toasts);
  const removeToast = useErrorToastStore((state) => state.removeToast);

  const timersRef = useRef<Map<number, ToastTimerHandle>>(new Map());
  const [enteringIds, setEnteringIds] = useState<Set<number>>(new Set());
  const [closingIds, setClosingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const toastIdSet = new Set(toasts.map((toast) => toast.id));

    toasts.forEach((toast) => {
      if (timersRef.current.has(toast.id)) {
        return;
      }

      setEnteringIds((prev) => {
        const next = new Set(prev);
        next.add(toast.id);
        return next;
      });

      const enterFrame = window.requestAnimationFrame(() => {
        setEnteringIds((prev) => {
          if (!prev.has(toast.id)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(toast.id);
          return next;
        });
      });

      const hideTimer = window.setTimeout(() => {
        setClosingIds((prev) => {
          const next = new Set(prev);
          next.add(toast.id);
          return next;
        });
      }, AUTO_HIDE_MS);

      const removeTimer = window.setTimeout(() => {
        removeToast(toast.id);
        setClosingIds((prev) => {
          if (!prev.has(toast.id)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(toast.id);
          return next;
        });
      }, AUTO_HIDE_MS + EXIT_ANIMATION_MS);

      timersRef.current.set(toast.id, {
        hideTimer,
        removeTimer,
        enterFrame,
      });
    });

    Array.from(timersRef.current.keys()).forEach((id) => {
      if (toastIdSet.has(id)) {
        return;
      }

      const timer = timersRef.current.get(id);
      if (!timer) {
        return;
      }
      window.clearTimeout(timer.hideTimer);
      window.clearTimeout(timer.removeTimer);
      window.cancelAnimationFrame(timer.enterFrame);
      timersRef.current.delete(id);
    });
  }, [toasts, removeToast]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Array.from(timers.values()).forEach((timer) => {
        window.clearTimeout(timer.hideTimer);
        window.clearTimeout(timer.removeTimer);
        window.cancelAnimationFrame(timer.enterFrame);
      });
      timers.clear();
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast toast-top toast-center z-120">
      <div className="stack w-[min(92vw,32rem)]">
        {toasts
          .slice()
          .reverse()
          .map((toast) => {
            const isEntering = enteringIds.has(toast.id);
            const isClosing = closingIds.has(toast.id);
            return (
              <div
                key={toast.id}
                role="alert"
                className={clsx(
                  "alert alert-soft shadow-lg transition-all duration-200 ease-out",
                  {
                    "alert-error": toast.variant === "error",
                    "alert-success": toast.variant === "success",
                    "alert-info": toast.variant === "info",
                  },
                  {
                    "opacity-0 translate-y-2 scale-95": isEntering,
                    "opacity-0 -translate-y-1 scale-95": isClosing,
                    "opacity-100 translate-y-0 scale-100": !isEntering && !isClosing,
                  },
                )}
              >
                <span>{toast.message}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
