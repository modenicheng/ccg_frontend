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
    <div className="card shadow-sm">
      <div className="card-body p-0">
        <h3 className="font-semibold text-lg p-4 border-b">
          <Icon
            icon="heroicons:clipboard-list"
            width={20}
            height={20}
            className="inline mr-2"
          />
          玩家作答情况
        </h3>
        <div className="overflow-x-auto">
          <table className="table table-pin-cols table-pin-rows">
            <thead>
              <tr>
                <th className="w-4 text-end">顺序</th>
                <th className="">玩家</th>
                {tagGroups.map((group) => (
                  <th key={group.id} className="text-center min-w-20">
                    {group.name}
                  </th>
                ))}
                <th className="min-w-40">精确描述</th>
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
                      <th className="text-end">{answer.order}</th>
                      <th className="text-nowrap">{answer.username}</th>
                      {tagGroups.map((group) => {
                        const selectedTagId = answer.answers?.[group.id];
                        const selectedTag = group.tags.find(
                          (tag) => tag.id === selectedTagId,
                        );
                        return (
                          <td key={group.id} className="text-center">
                            {selectedTag ? selectedTag.name : "-"}
                          </td>
                        );
                      })}
                      <td className="max-w-40 truncate">
                        {answer.description || "-"}
                      </td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={tagGroups.length + 3} className="text-center">
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
