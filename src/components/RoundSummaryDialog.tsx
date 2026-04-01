interface RoundSummaryDialogProps {
  isOpen: boolean;
  roundScore: number;
  rankChange: number | null;
  currentRank: number | null;
  onClose: () => void;
}

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

export function RoundSummaryDialog({
  isOpen,
  roundScore,
  rankChange,
  currentRank,
  onClose,
}: RoundSummaryDialogProps) {
  if (!isOpen) {
    return null;
  }

  const rankChangeDisplay = renderRankChange(rankChange);

  return (
    <dialog className="modal" open={isOpen}>
      <div className="modal-box max-w-md">
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

        <div className="modal-action">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            确定
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>关闭</button>
      </form>
    </dialog>
  );
}