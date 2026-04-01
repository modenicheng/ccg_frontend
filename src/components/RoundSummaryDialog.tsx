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
  correctTags = [],
  correctDescriptionIds = [],
  playerDescriptions = [],
  onClose,
}: RoundSummaryDialogProps) {
  if (!isOpen) {
    return null;
  }

  const rankChangeDisplay = renderRankChange(rankChange);

  const selectedPlayerDescs = playerDescriptions.filter(
    (pd) => correctDescriptionIds.includes(pd.id),
  );

  return (
    <dialog className="modal" open={isOpen}>
      <div className="modal-box max-w-md motion-safe:animate-[buzz-pop_220ms_ease-out]">
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
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>关闭</button>
      </form>
    </dialog>
  );
}