import type { RefObject } from "react";

export interface ConfirmActionDialogsProps {
  endGameConfirmDialogRef: RefObject<HTMLDialogElement | null>;
  dissolveRoomConfirmDialogRef: RefObject<HTMLDialogElement | null>;
  clearRoomSongsConfirmDialogRef: RefObject<HTMLDialogElement | null>;
  handleConfirmEndGame: () => Promise<void>;
  handleConfirmDissolveRoom: () => Promise<void>;
  handleClearRoomSongs: () => Promise<void>;
}

export function ConfirmActionDialogs({
  endGameConfirmDialogRef,
  dissolveRoomConfirmDialogRef,
  clearRoomSongsConfirmDialogRef,
  handleConfirmEndGame,
  handleConfirmDissolveRoom,
  handleClearRoomSongs,
}: ConfirmActionDialogsProps) {
  return (
    <>
      {/* 结束游戏确认对话框 */}
      <dialog ref={endGameConfirmDialogRef} className="modal">
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg">确认结束游戏</h3>
          <p className="py-3 text-sm">
            确认结束当前游戏吗？
            <br />
            这将显示最终得分并结束游戏。
          </p>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                endGameConfirmDialogRef.current?.close();
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={handleConfirmEndGame}
            >
              确认结束
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* 解散房间确认对话框 */}
      <dialog ref={dissolveRoomConfirmDialogRef} className="modal">
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg text-error">确认解散房间</h3>
          <p className="py-3 text-sm text-error">
            警告：此操作将永久删除房间！
            <br />
            房间数据将从数据库中移除，此操作不可撤销。
          </p>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                dissolveRoomConfirmDialogRef.current?.close();
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={handleConfirmDissolveRoom}
            >
              确认解散
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* 清空房间歌曲确认对话框 */}
      <dialog ref={clearRoomSongsConfirmDialogRef} className="modal">
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg">确认清空房间歌曲</h3>
          <p className="py-3 text-sm">
            确认清空房间所有歌曲吗？
            <br />
            此操作不可撤销，将移除房间中的所有歌曲。
          </p>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                clearRoomSongsConfirmDialogRef.current?.close();
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={handleClearRoomSongs}
            >
              确认清空
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  );
}
