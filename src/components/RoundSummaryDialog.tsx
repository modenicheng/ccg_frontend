import { useCallback, useEffect, useReducer, useRef } from "react";

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

interface DialogState {
  remainingMs: number;
  isPaused: boolean;
  animationKey: number;
  isVisible: boolean;
}

type DialogAction =
  | { type: "OPEN"; autoCloseMs: number }
  | { type: "CLOSE" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "TICK" }
  | { type: "RESET"; autoCloseMs: number };

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case "OPEN":
      return {
        ...state,
        remainingMs: action.autoCloseMs,
        isPaused: false,
        animationKey: state.animationKey + 1,
        isVisible: true,
      };
    case "CLOSE":
      return {
        ...state,
        isVisible: false,
      };
    case "PAUSE":
      return {
        ...state,
        isPaused: true,
      };
    case "RESUME":
      return {
        ...state,
        isPaused: false,
        animationKey: state.animationKey + 1,
      };
    case "TICK": {
      const nextRemaining = state.remainingMs - 50;
      if (nextRemaining <= 0) {
        return {
          ...state,
          remainingMs: 0,
        };
      }
      return {
        ...state,
        remainingMs: nextRemaining,
      };
    }
    case "RESET":
      return {
        ...state,
        remainingMs: action.autoCloseMs,
        isPaused: false,
        animationKey: state.animationKey + 1,
      };
    default:
      return state;
  }
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
  const [{ remainingMs, isPaused, animationKey, isVisible }, dispatch] = useReducer(dialogReducer, {
    remainingMs: autoCloseMs,
    isPaused: false,
    animationKey: 0,
    isVisible: false,
  });

  const hasUserInteracted = useRef(false);
  const countdownTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpenRef = useRef(isOpen);
  const onCloseRef = useRef(onClose);
  const autoCloseMsRef = useRef(autoCloseMs);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    autoCloseMsRef.current = autoCloseMs;
  }, [autoCloseMs]);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    clearCountdown();
    countdownTimerRef.current = window.setInterval(() => {
      dispatch({ type: "TICK" });
    }, 50);
  }, [clearCountdown]);

  const handleMouseEnter = useCallback(() => {
    if (hasUserInteracted.current) {
      dispatch({ type: "PAUSE" });
      clearCountdown();
    }
  }, [clearCountdown]);

  const handleMouseLeave = useCallback(() => {
    dispatch({ type: "RESUME" });
    startCountdown();
  }, [startCountdown]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!hasUserInteracted.current) {
      hasUserInteracted.current = true;
      if (dialogRef.current?.contains(e.target as Node)) {
        dispatch({ type: "PAUSE" });
        clearCountdown();
      }
    }
  }, [clearCountdown]);

  useEffect(() => {
    const wasOpen = isOpenRef.current;
    isOpenRef.current = isOpen;

    if (isOpen && !wasOpen) {
      hasUserInteracted.current = false;
      dispatch({ type: "OPEN", autoCloseMs: autoCloseMsRef.current });
      startCountdown();
    } else if (!isOpen && wasOpen) {
      clearCountdown();
    }
  }, [isOpen, startCountdown, clearCountdown]);

  useEffect(() => {
    if (remainingMs <= 0 && countdownTimerRef.current !== null) {
      clearCountdown();
      onCloseRef.current();
    }
  }, [remainingMs, clearCountdown]);

  useEffect(() => {
    return clearCountdown;
  }, [clearCountdown]);

  const rankChangeDisplay = renderRankChange(rankChange);

  const selectedPlayerDescs = playerDescriptions.filter(
    (pd) => correctDescriptionIds.includes(pd.id),
  );

  const progressPercent = (remainingMs / autoCloseMs) * 100;

  if (!isVisible) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      open={isOpen}
      onMouseMove={handleMouseMove}
    >
      <div
        className={`modal-box max-w-md relative overflow-hidden p-0 motion-safe:animate-[buzz-pop_220ms_ease-out] ${!isOpen ? "motion-safe:animate-[buzz-fade-out_220ms_ease-in]" : ""}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="h-1 bg-base-300 w-full">
          <div
            key={animationKey}
            className="h-full bg-primary"
            style={{
              width: `${progressPercent}%`,
              animation: isPaused ? "none" : `countdown-bar ${remainingMs}ms linear forwards`,
            }}
          />
        </div>

        <style>{`
          @keyframes countdown-bar {
            from { width: 100%; }
            to { width: 0%; }
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
