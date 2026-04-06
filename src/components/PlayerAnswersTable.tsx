import { Icon } from "@iconify-icon/react";
import type { WsTagGroup } from "../types/wsMessages";
import clsx from "clsx";

interface AnswerEntry {
  playerId: number;
  order: number;
  username: string;
  answers: Record<number, number | null>;
  description: string | null;
}

interface PlayerAnswersTableProps {
  playerAnswers: AnswerEntry[];
  tagGroups: WsTagGroup[];
  userId: number | null;
}

export function PlayerAnswersTable({
  playerAnswers,
  tagGroups,
  userId,
}: PlayerAnswersTableProps) {
  return (
    <div className="card shadow-sm w-full">
      <div className="card-body p-0">
        <h3 className="font-semibold text-base sm:text-lg p-3 sm:p-4 border-b">
          <Icon
            icon="heroicons:clipboard-list"
            width={18}
            height={18}
            className="inline mr-2"
          />
          玩家作答情况
        </h3>
        <div className="overflow-x-auto">
          <table className="table table-pin-cols table-pin-rows">
            <thead>
              <tr>
                <th className="w-4 text-end text-xs sm:text-sm">顺序</th>
                <th className="text-xs sm:text-sm">玩家</th>
                {tagGroups.map((group) => (
                  <th key={group.id} className="text-center min-w-16 sm:min-w-20 text-xs sm:text-sm">
                    {group.name}
                  </th>
                ))}
                <th className="min-w-32 sm:min-w-40 text-xs sm:text-sm">精确描述</th>
              </tr>
            </thead>
            <tbody>
              {playerAnswers.length > 0 ? (
                playerAnswers
                  .sort((a, b) => a.order - b.order)
                  .map((answer) => (
                    <tr
                      key={answer.playerId}
                      className={clsx({
                        "bg-primary/10 font-bold":
                          userId !== null && answer.playerId === userId,
                      })}
                    >
                      <th className="text-end text-xs sm:text-sm">{answer.order}</th>
                      <th className="text-nowrap text-xs sm:text-sm">{answer.username}</th>
                      {tagGroups.map((group) => {
                        const selectedTagId = answer.answers?.[group.id];
                        const selectedTag = group.tags.find(
                          (tag) => tag.id === selectedTagId,
                        );
                        return (
                          <td key={group.id} className="text-center text-xs sm:text-sm">
                            {selectedTag ? selectedTag.name : "-"}
                          </td>
                        );
                      })}
                      <td className="max-w-32 sm:max-w-40 truncate text-xs sm:text-sm">
                        {answer.description || "-"}
                      </td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={tagGroups.length + 3} className="text-center text-xs sm:text-sm">
                    暂无作答记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
