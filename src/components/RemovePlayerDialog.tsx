import type { RefObject } from "react";

interface RemovePlayerDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  isWsDisconnected: boolean;
  onConfirm: () => void;
}

export function RemovePlayerDialog({
  dialogRef,
  isWsDisconnected,
  onConfirm,
}: RemovePlayerDialogProps) {
  return (
    <dialog ref={dialogRef} className="modal">
      <div className="modal-box max-w-md">
        <h3 className="font-bold text-lg">确认移除玩家</h3>
        <p className="py-4">确定要将该玩家移出房间吗？</p>
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
            className="btn btn-warning"
            disabled={isWsDisconnected}
            onClick={onConfirm}
          >
            确认移除
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>关闭</button>
      </form>
    </dialog>
  );
}
