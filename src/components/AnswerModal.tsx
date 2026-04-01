import { Icon } from "@iconify-icon/react";
import type { RefObject } from "react";
import { TagGroupSelector } from "./TagGroupSelector";
import type { WsTagGroup } from "../types/wsMessages";

interface AnswerModalProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  isOpen: boolean;
  tagGroups: WsTagGroup[];
  selectedTags: Record<number, number | null>;
  description: string;
  isWsDisconnected: boolean;
  onSelectTag: (groupId: number, tagId: number) => void;
  onDescriptionChange: (desc: string) => void;
  onToggleMinimize: () => void;
  onSubmit: () => void;
}

export function AnswerModal({
  dialogRef,
  isOpen,
  tagGroups,
  selectedTags,
  description,
  isWsDisconnected,
  onSelectTag,
  onDescriptionChange,
  onToggleMinimize,
  onSubmit,
}: AnswerModalProps) {
  return (
    <dialog
      ref={dialogRef}
      className="modal"
      open={isOpen}
    >
      <div className="modal-box w-11/12 max-w-4xl">
        <h2 className="font-bold text-2xl">答题</h2>
        <div className="divider mt-0.5 mb-4"></div>

        <TagGroupSelector
          tagGroups={tagGroups}
          selectedTags={selectedTags}
          onSelectTag={onSelectTag}
          radioNamePrefix="answer-tag-group"
          showHeader={true}
          headerText="选择 Tags"
          className="mb-6"
        />

        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">精确描述</h3>
          <textarea
            className="textarea textarea-bordered w-full"
            placeholder="请输入精确描述..."
            rows={3}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
          ></textarea>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onToggleMinimize}
          >
            暂时隐藏
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isWsDisconnected}
            onClick={onSubmit}
          >
            提交答案
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>关闭</button>
      </form>
    </dialog>
  );
}

interface AnswerModalFloatingButtonProps {
  isVisible: boolean;
  onClick: () => void;
}

export function AnswerModalFloatingButton({
  isVisible,
  onClick,
}: AnswerModalFloatingButtonProps) {
  if (!isVisible) return null;

  return (
    <button
      type="button"
      className="fixed bottom-6 right-6 btn btn-primary btn-circle h-16 w-16 shadow-lg"
      onClick={onClick}
    >
      <Icon
        icon="heroicons:clipboard-question-mark"
        width={24}
        height={24}
      />
    </button>
  );
}
