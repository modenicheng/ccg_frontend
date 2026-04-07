import clsx from "clsx";

interface ScoreEntry {
  player_id: number;
  username: string;
  score: number;
}

interface ScoreboardProps {
  scores: ScoreEntry[];
  userId: number | null;
}

export function Scoreboard({ scores, userId }: ScoreboardProps) {
  return (
    <div className="card shadow-sm w-full sm:flex-1 min-h-56 sm:max-h-112">
      <div className="card-body overflow-y-auto p-0 max-h-72 sm:max-h-96">
        <table className="table table-pin-cols table-pin-rows">
          <thead>
            <tr>
              <th className="w-4 text-end">排名</th>
              <th className="">玩家</th>
              <td className="w-6 text-end">总分</td>
            </tr>
          </thead>
          <tbody>
            {scores.length > 0 ? (
              [...scores]
                .sort((a, b) => b.score - a.score)
                .map((player, index) => (
                  <tr
                    key={player.player_id}
                    className={clsx({
                      "bg-primary/10 font-bold":
                        userId !== null && player.player_id === userId,
                    })}
                  >
                    <th className="text-end text-xs sm:text-base">{index + 1}</th>
                    <th className="text-nowrap text-xs sm:text-base">{player.username}</th>
                    <td className="text-end text-xs sm:text-base">{player.score}</td>
                  </tr>
                ))
            ) : (
              <tr>
                <td colSpan={3} className="text-center text-xs sm:text-base">
                  暂无得分记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
