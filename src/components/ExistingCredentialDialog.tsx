import { useState, useEffect, type RefObject } from "react";

interface ExistingCredentialDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  username: string;
  roomId: string;
  onGoToRoom: () => void;
  onClearAndContinue: () => void;
}

export function ExistingCredentialDialog({
  dialogRef,
  username,
  roomId,
  onGoToRoom,
  onClearAndContinue,
}: ExistingCredentialDialogProps) {
  const [step, setStep] = useState<"initial" | "confirm-clear">("initial");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => setStep("initial");
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [dialogRef]);

  return (
    <dialog ref={dialogRef} className="modal">
      <div className="modal-box max-w-md">
        {step === "initial" ? (
          <>
            <h3 className="font-bold text-lg">检测到已有凭证</h3>
            <p className="py-4">
              当前浏览器用户{" "}
              <span className="font-semibold text-primary">{username}</span>{" "}
              已经在房间{" "}
              <span className="font-semibold text-secondary">{roomId}</span>，
              是否直接进入？
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStep("confirm-clear")}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onGoToRoom}
              >
                确定进入
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="font-bold text-lg">清除凭证</h3>
            <div className="alert alert-warning my-4">
              <span>
                ⚠️ 清除凭证警告：账户{" "}
                <span className="font-semibold">{username}</span> 将无法再次登录该房间。此操作不可撤销。
              </span>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStep("initial")}
              >
                返回
              </button>
              <button
                type="button"
                className="btn btn-error"
                onClick={onClearAndContinue}
              >
                确认清除
              </button>
            </div>
          </>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>关闭</button>
      </form>
    </dialog>
  );
}
