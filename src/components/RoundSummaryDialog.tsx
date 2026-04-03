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
type DialogPhase = "hidden" | "open" | "closing";

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
  remainingMs: number;
  isPaused: boolean;
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
  const onCloseRef = useRef(onClose);
  const phaseRef = useRef<DialogPhase>(isOpen ? "open" : "hidden");
  const remainingRef = useRef(autoCloseMs);
  const deadlineRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<DialogPhase>(isOpen ? "open" : "hidden");
  const [countdownState, setCountdownState] = useState<CountdownState>({
    remainingMs: autoCloseMs,
    isPaused: false,
  });

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    deadlineRef.current = null;
  }, []);

  const stopCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const beginClosingAnimation = useCallback(() => {
    if (phaseRef.current === "hidden" || phaseRef.current === "closing") {
      return;
    }
    stopRaf();
    setCountdownState((s) => ({ ...s, isPaused: true }));
    phaseRef.current = "closing";
    setPhase("closing");
    stopCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      phaseRef.current = "hidden";
      setPhase("hidden");
      remainingRef.current = 0;
      setCountdownState({ remainingMs: 0, isPaused: false });
      closeTimerRef.current = null;
    }, CLOSE_ANIMATION_MS);
  }, [stopCloseTimer, stopRaf]);

  const requestClose = useCallback(() => {
    beginClosingAnimation();
    onCloseRef.current();
  }, [beginClosingAnimation]);

  const startCountdown = useCallback((durationMs: number) => {
    stopRaf();

    if (durationMs <= 0) {
      remainingRef.current = 0;
      setCountdownState({ remainingMs: 0, isPaused: false });
      return;
    }

    const tick = () => {
      if (deadlineRef.current === null) {
        return;
      }

      const remaining = Math.max(0, deadlineRef.current - performance.now());
      remainingRef.current = remaining;
      setCountdownState((s) => ({ ...s, remainingMs: remaining }));

      if (remaining <= 0) {
        stopRaf();
        requestClose();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    remainingRef.current = durationMs;
    deadlineRef.current = performance.now() + durationMs;
    setCountdownState({ remainingMs: durationMs, isPaused: false });
    rafRef.current = requestAnimationFrame(tick);
  }, [requestClose, stopRaf]);

  const pauseCountdown = useCallback(() => {
    if (phaseRef.current !== "open") {
      return;
    }

    const nextRemaining = deadlineRef.current === null
      ? countdownState.remainingMs
      : Math.max(0, deadlineRef.current - performance.now());

    remainingRef.current = nextRemaining;
    stopRaf();
    setCountdownState((s) => ({ ...s, remainingMs: nextRemaining, isPaused: true }));
  }, [countdownState.remainingMs, stopRaf]);

  const resumeCountdown = useCallback(() => {
    if (phaseRef.current !== "open") {
      return;
    }

    const remaining = remainingRef.current;
    if (remaining <= 0) {
      return;
    }

    const tick = () => {
      if (deadlineRef.current === null) {
        return;
      }

      const nextRemaining = Math.max(0, deadlineRef.current - performance.now());
      remainingRef.current = nextRemaining;
      setCountdownState((s) => ({ ...s, remainingMs: nextRemaining }));

      if (nextRemaining <= 0) {
        stopRaf();
        requestClose();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    stopRaf();
    deadlineRef.current = performance.now() + remaining;
    setCountdownState((s) => ({ ...s, isPaused: false }));
    rafRef.current = requestAnimationFrame(tick);
  }, [requestClose, stopRaf]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    return () => {
      stopRaf();
      stopCloseTimer();
    };
  }, [stopRaf, stopCloseTimer]);

  useEffect(() => {
    if (isOpen) {
      stopCloseTimer();
      phaseRef.current = "open";
      setPhase("open");
      hasUserInteracted.current = false;
      startCountdown(autoCloseMs);
      return;
    }

    beginClosingAnimation();
  }, [isOpen, autoCloseMs, beginClosingAnimation, startCountdown, stopCloseTimer]);

  const handleMouseEnter = useCallback(() => {
    if (hasUserInteracted.current) {
      pauseCountdown();
    }
  }, [pauseCountdown]);

  const handleMouseLeave = useCallback(() => {
    if (!isOpen || phase !== "open" || !hasUserInteracted.current || countdownState.remainingMs <= 0) {
      return;
    }
    resumeCountdown();
  }, [countdownState.remainingMs, isOpen, phase, resumeCountdown]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!hasUserInteracted.current) {
      hasUserInteracted.current = true;
      if (dialogRef.current?.contains(e.target as Node)) {
        pauseCountdown();
      }
    }
  }, [pauseCountdown]);

  const rankChangeDisplay = renderRankChange(rankChange);

  const selectedPlayerDescs = playerDescriptions.filter(
    (pd) => correctDescriptionIds.includes(pd.id),
  );

  const progressPercent = autoCloseMs > 0
    ? Math.max(0, Math.min(100, (countdownState.remainingMs / autoCloseMs) * 100))
    : 0;

  if (phase === "hidden") {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-open"
      open
      onMouseMove={handleMouseMove}
    >
      <div
        className={`modal-box max-w-md relative overflow-hidden p-0 ${phase === "closing" ? "motion-safe:animate-[buzz-fade-out_220ms_ease-in_forwards]" : "motion-safe:animate-[buzz-pop_220ms_ease-out]"}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="h-1 bg-base-300 w-full overflow-hidden">
          <div
            className="h-full bg-primary"
            style={{
              width: `${progressPercent}%`,
              transition: "none",
            }}
          />
        </div>

        <style>{`
          @keyframes buzz-pop {
            0% { opacity: 0; transform: scale(0.97); }
            100% { opacity: 1; transform: scale(1); }
          }

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
            <button type="button" className="btn btn-primary" onClick={requestClose}>
              确定
            </button>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={requestClose}>关闭</button>
      </form>
    </dialog>
  );
}
