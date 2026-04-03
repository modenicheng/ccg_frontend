import { useCallback, useEffect, useRef, useState } from "react";

interface CorrectTag {
  groupId: number;
  groupName: string;
  tagId: number;
  tagName: string;
}

interface PlayerDescription {
  id: number;
  username: string;
  description: string;
}

interface RoundSummaryDialogProps {
  isOpen: boolean;
  roundScore: number;
  rankChange: number | null;
  currentRank: number | null;
  correctTags?: CorrectTag[];
  correctDescriptionIds?: number[];
  playerDescriptions?: PlayerDescription[];
  autoCloseMs?: number;
  onClose: () => void;
}

const DEFAULT_AUTO_CLOSE_MS = 5000;
const CLOSE_ANIMATION_MS = 220;

const formatRoundScore = (score: number) => {
  if (score > 0) {
    return `+${score}`;
  }
  return `${score}`;
};

const renderRankChange = (rankChange: number | null) => {
  if (rankChange === null) {
    return { text: "-", className: "text-base-content/70" };
  }

  if (rankChange > 0) {
    return {
      text: `↑ ${rankChange}`,
      className: "text-success",
    };
  }

  if (rankChange < 0) {
    return {
      text: `↓ ${Math.abs(rankChange)}`,
      className: "text-error",
    };
  }

  return { text: "→ 0", className: "text-base-content/80" };
};

interface CountdownState {
  deadline: number | null;
  remainingMs: number;
  isPaused: boolean;
  isVisible: boolean;
}

function useCountdown(onExpire: () => void) {
  const [state, setState] = useState<CountdownState>({
    deadline: null,
    remainingMs: 0,
    isPaused: false,
    isVisible: false,
  });

  const deadlineRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const stopCountdown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    deadlineRef.current = null;
  }, []);

  const start = useCallback((durationMs: number) => {
    const tick = () => {
      if (deadlineRef.current === null) return;
      const remaining = deadlineRef.current - performance.now();
      if (remaining <= 0) {
        setState((s) => ({ ...s, remainingMs: 0 }));
        deadlineRef.current = null;
        return;
      }
      setState((s) => ({ ...s, remainingMs: remaining }));
      rafRef.current = requestAnimationFrame(tick);
    };

    deadlineRef.current = performance.now() + durationMs;
    setState({
      deadline: deadlineRef.current,
      remainingMs: durationMs,
      isPaused: false,
      isVisible: true,
    });
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const pause = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    deadlineRef.current = null;
    setState((s) => ({ ...s, isPaused: true }));
  }, []);

  const resume = useCallback((remainingMs: number) => {
    const tick = () => {
      if (deadlineRef.current === null) return;
      const remaining = deadlineRef.current - performance.now();
      if (remaining <= 0) {
        setState((s) => ({ ...s, remainingMs: 0 }));
        deadlineRef.current = null;
        return;
      }
      setState((s) => ({ ...s, remainingMs: remaining }));
      rafRef.current = requestAnimationFrame(tick);
    };

    deadlineRef.current = performance.now() + remainingMs;
    setState((s) => ({ ...s, isPaused: false, deadline: deadlineRef.current }));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const close = useCallback(() => {
    stopCountdown();
    setState((s) => ({ ...s, isVisible: false }));
  }, [stopCountdown]);

  useEffect(() => {
    if (state.remainingMs <= 0 && state.isVisible) {
      stopCountdown();
      onExpireRef.current();
    }
  }, [state.remainingMs, state.isVisible, stopCountdown]);

  useEffect(() => {
    return stopCountdown;
  }, [stopCountdown]);

  return { state, start, pause, resume, close };
}

export function RoundSummaryDialog({
  isOpen,
  roundScore,
  rankChange,
  currentRank,
  correctTags = [],
  correctDescriptionIds = [],
  playerDescriptions = [],
  autoCloseMs = DEFAULT_AUTO_CLOSE_MS,
  onClose,
}: RoundSummaryDialogProps) {
  const hasUserInteracted = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wasOpenRef = useRef(isOpen);
  const autoCloseMsRef = useRef(autoCloseMs);
  const closeTimerRef = useRef<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const { state: countdownState, start, pause, resume, close } = useCountdown(onClose);

  useEffect(() => {
    autoCloseMsRef.current = autoCloseMs;
  }, [autoCloseMs]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
      hasUserInteracted.current = false;
      start(autoCloseMsRef.current);
    } else if (!isOpen && wasOpenRef.current) {
      pause();
      setIsClosing(true);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = window.setTimeout(() => {
        setIsClosing(false);
        close();
        closeTimerRef.current = null;
      }, CLOSE_ANIMATION_MS);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, start, close, pause]);

  const handleMouseEnter = useCallback(() => {
    if (hasUserInteracted.current) {
      pause();
    }
  }, [pause]);

  const handleMouseLeave = useCallback(() => {
    if (!isOpen || isClosing || countdownState.remainingMs <= 0) {
      return;
    }
    resume(countdownState.remainingMs);
  }, [isOpen, isClosing, resume, countdownState.remainingMs]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!hasUserInteracted.current) {
      hasUserInteracted.current = true;
      if (dialogRef.current?.contains(e.target as Node)) {
        pause();
      }
    }
  }, [pause]);

  const rankChangeDisplay = renderRankChange(rankChange);

  const selectedPlayerDescs = playerDescriptions.filter(
    (pd) => correctDescriptionIds.includes(pd.id),
  );

  const progressPercent = autoCloseMs > 0
    ? Math.max(0, Math.min(100, (countdownState.remainingMs / autoCloseMs) * 100))
    : 0;

  if (!countdownState.isVisible) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      className={`modal ${isOpen || isClosing ? "modal-open" : ""}`}
      open={isOpen || isClosing}
      onMouseMove={handleMouseMove}
    >
      <div
        className={`modal-box max-w-md relative overflow-hidden p-0 ${isClosing ? "motion-safe:animate-[buzz-fade-out_220ms_ease-in]" : "motion-safe:animate-[buzz-pop_220ms_ease-out]"}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="h-1 bg-base-300 w-full overflow-hidden">
          <div
            className="h-full bg-primary"
            style={{
              width: `${progressPercent}%`,
              transition: "width 1ms linear",
            }}
          />
        </div>

        <style>{`
          @keyframes buzz-fade-out {
            0% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(0.95); }
          }
        `}</style>

        <div className="p-6 pt-4">
          <h3 className="text-xl font-bold">本轮合计</h3>
          <p className="text-sm text-base-content/70 mt-1">你的结算结果</p>

          <div className="grid grid-cols-1 gap-3 mt-5">
            <div className="stats shadow border border-base-300">
              <div className="stat py-3">
                <div className="stat-title">本轮得分</div>
                <div className="stat-value text-primary text-4xl">
                  {formatRoundScore(roundScore)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card bg-base-200">
                <div className="card-body p-4">
                  <div className="text-sm text-base-content/70">排名变化</div>
                  <div className={`text-2xl font-bold ${rankChangeDisplay.className}`}>
                    {rankChangeDisplay.text}
                  </div>
                </div>
              </div>

              <div className="card bg-base-200">
                <div className="card-body p-4">
                  <div className="text-sm text-base-content/70">当前排名</div>
                  <div className="text-2xl font-bold text-secondary">
                    {currentRank === null ? "-" : `#${currentRank}`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {(correctTags.length > 0 || selectedPlayerDescs.length > 0) && (
            <div className="mt-4">
              <h4 className="font-semibold text-sm text-base-content/70 mb-2">
                本轮正确答案
              </h4>
              <div className="card bg-base-200 p-3">
                {correctTags.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs text-base-content/60 mb-1">标签</div>
                    <div className="flex flex-wrap gap-1">
                      {correctTags.map((tag) => (
                        <span
                          key={tag.tagId}
                          className="badge badge-primary badge-sm"
                        >
                          {tag.groupName}: {tag.tagName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedPlayerDescs.length > 0 && (
                  <div>
                    <div className="text-xs text-base-content/60 mb-1">
                      精确描述
                    </div>
                    <ul className="text-sm space-y-1">
                      {selectedPlayerDescs.map((desc) => (
                        <li key={desc.id} className="flex gap-2">
                          <span className="font-medium">{desc.username}:</span>
                          <span className="opacity-80">{desc.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="modal-action">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              确定
            </button>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>关闭</button>
      </form>
    </dialog>
  );
}
