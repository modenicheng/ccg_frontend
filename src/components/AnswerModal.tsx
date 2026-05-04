import { useEffect, useState, useRef } from "react";
import type { RefObject } from "react";
import { TagGroupSelector } from "./TagGroupSelector";
import type { WsTagGroup } from "../types/wsMessages";

const ANSWER_TIME_LIMIT_MS = 30_000;

interface AnswerModalProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  isOpen: boolean;
  tagGroups: WsTagGroup[];
  selectedTags: Record<number, number | null>;
  description: string;
  isWsDisconnected: boolean;
  answerDeadline: number | null;
  onSelectTag: (groupId: number, tagId: number) => void;
  onDescriptionChange: (desc: string) => void;
  onToggleMinimize: () => void;
  onSubmit: () => void;
  onClearSelection: () => void;
}

export function AnswerModal({
  dialogRef,
  isOpen,
  tagGroups,
  selectedTags,
  description,
  isWsDisconnected,
  answerDeadline,
  onSelectTag,
  onDescriptionChange,
  onToggleMinimize,
  onSubmit,
  onClearSelection,
}: AnswerModalProps) {
  const [remainingMs, setRemainingMs] = useState(ANSWER_TIME_LIMIT_MS);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !answerDeadline) {
      setRemainingMs(ANSWER_TIME_LIMIT_MS);
      submittedRef.current = false;
      return;
    }

    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, answerDeadline - now);
      setRemainingMs(remaining);
      if (remaining <= 0 && !submittedRef.current) {
        submittedRef.current = true;
        onSubmit();
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [isOpen, answerDeadline, onSubmit]);

  const progressPercent = answerDeadline
    ? Math.max(0, Math.min(100, (remainingMs / ANSWER_TIME_LIMIT_MS) * 100))
    : 100;

  const barColor =
    remainingMs > 10_000
      ? "bg-success"
      : remainingMs > 5_000
        ? "bg-warning"
        : "bg-error";

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      open={isOpen}
    >
      <div className="modal-box w-11/12 max-w-4xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-2xl">答题</h2>
          <span className="countdown font-mono text-xl">
            {Math.ceil(remainingMs / 1000)}s
          </span>
        </div>

        <div className="w-full h-2 bg-base-300 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full rounded-full transition-[width] duration-100 ${barColor}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="divider mt-0.5 mb-4"></div>

        <TagGroupSelector
          tagGroups={tagGroups}
          selectedTags={selectedTags}
          onSelectTag={onSelectTag}
          onClearSelection={onClearSelection}
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
            onClick={() => {
              submittedRef.current = true;
              onSubmit();
            }}
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
  answerDeadline: number | null;
  onClick: () => void;
}

export function AnswerModalFloatingButton({
  isVisible,
  answerDeadline,
  onClick,
}: AnswerModalFloatingButtonProps) {
  const [remainingMs, setRemainingMs] = useState(ANSWER_TIME_LIMIT_MS);

  useEffect(() => {
    if (!isVisible || !answerDeadline) {
      setRemainingMs(ANSWER_TIME_LIMIT_MS);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, answerDeadline - Date.now());
      setRemainingMs(remaining);
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [isVisible, answerDeadline]);

  if (!isVisible) return null;

  const progressPercent = answerDeadline
    ? Math.max(0, Math.min(100, (remainingMs / ANSWER_TIME_LIMIT_MS) * 100))
    : 100;

  const circleColor =
    remainingMs > 10_000
      ? "text-success"
      : remainingMs > 5_000
        ? "text-warning"
        : "text-error";

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progressPercent / 100);

  return (
    <button
      type="button"
      className="fixed bottom-6 right-6 btn btn-primary btn-circle h-16 w-16 shadow-lg relative"
      onClick={onClick}
    >
      <svg
        className={`absolute inset-0 pointer-events-none ${circleColor}`}
        width="64"
        height="64"
        viewBox="0 0 64 64"
      >
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          opacity="0.2"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dashoffset 0.2s linear" }}
        />
      </svg>
      <span className="font-mono text-xs font-bold">
        {Math.ceil(remainingMs / 1000)}
      </span>
    </button>
  );
}
