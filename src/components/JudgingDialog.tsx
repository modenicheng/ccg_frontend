import type { RefObject } from "react";
import { SongInfoCard, type SongInfo } from "./SongInfoCard";
import { TagGroupSelector } from "./TagGroupSelector";
import type { WsTagGroup } from "../types/wsMessages";

interface PlayerDescription {
  id: number;
  username: string;
  description: string;
}

interface JudgingDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  confirmAnswerDialogRef: RefObject<HTMLDialogElement | null>;
  currentSong: SongInfo | null;
  tagGroups: WsTagGroup[];
  selectedTags: Record<number, number | null>;
  selectedDescriptions: number[];
  historyTagIds: number[];
  referenceDescriptions: string[];
  playerDescriptions: PlayerDescription[];
  onSelectTag: (groupId: number, tagId: number) => void;
  onToggleDescription: (descriptionId: number) => void;
}

export function JudgingDialog({
  dialogRef,
  confirmAnswerDialogRef,
  currentSong,
  tagGroups,
  selectedTags,
  selectedDescriptions,
  historyTagIds,
  referenceDescriptions,
  playerDescriptions,
  onSelectTag,
  onToggleDescription,
}: JudgingDialogProps) {
  return (
    <dialog ref={dialogRef} className="modal">
      <div className="modal-box w-11/12 max-w-4xl">
        <h2 className="font-bold text-2xl">确认正确答案</h2>

        {currentSong && (
          <SongInfoCard
            songInfo={currentSong}
            isJudging={true}
            compact={false}
            clickable={true}
            onClick={() => {
              if (currentSong.platformUrl) {
                window.open(currentSong.platformUrl, "_blank");
              }
            }}
            className="my-4"
            showAlbum={true}
            showPlatformHint={true}
          />
        )}

        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-3">选择正确标签</h3>
          <TagGroupSelector
            tagGroups={tagGroups}
            selectedTags={selectedTags}
            onSelectTag={onSelectTag}
            highlightTagIds={historyTagIds}
            readOnly={false}
            showHeader={false}
            showEmptyState={true}
            emptyStateText="暂无可选标签分组"
          />
        </div>

        {referenceDescriptions.length > 0 && (
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3">参考精确描述</h3>
            <div className="card bg-base-200 p-4">
              <ul className="list-disc list-inside space-y-2">
                {referenceDescriptions.map((desc, index) => (
                  <li key={index} className="text-sm">
                    {desc}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {playerDescriptions.length > 0 && (
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3">抢答者精确描述</h3>
            <div className="space-y-3">
              {playerDescriptions.map((playerDesc) => (
                <div key={playerDesc.id} className="card bg-base-200 p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary mt-1"
                      checked={selectedDescriptions.includes(playerDesc.id)}
                      onChange={() => onToggleDescription(playerDesc.id)}
                    />
                    <div>
                      <div className="font-semibold">{playerDesc.username}</div>
                      <div className="text-sm opacity-80 mt-1">
                        {playerDesc.description}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => dialogRef.current?.close()}
          >
            暂时隐藏
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => confirmAnswerDialogRef.current?.showModal()}
          >
            确认答案
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>关闭</button>
      </form>
    </dialog>
  );
}
