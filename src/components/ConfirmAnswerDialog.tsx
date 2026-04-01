import type { RefObject } from "react";

interface ConfirmAnswerDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  isWsDisconnected: boolean;
  onSubmit: () => void;
}

export function ConfirmAnswerDialog({
  dialogRef,
  isWsDisconnected,
  onSubmit,
}: ConfirmAnswerDialogProps) {
  return (
    <dialog ref={dialogRef} className="modal">
      <div className="modal-box max-w-md">
        <h3 className="font-bold text-lg">确认提交答案</h3>
        <p className="py-4">确定要提交当前选择的答案吗？提交后将进行评分。</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => dialogRef.current?.close()}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isWsDisconnected}
            onClick={onSubmit}
          >
            确认提交
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>关闭</button>
      </form>
    </dialog>
  );
}
