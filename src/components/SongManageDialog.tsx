import type { Song, CreateSongRequest } from "../api/song";
import type { Songlist } from "../api/songlist";
import { Icon } from "@iconify-icon/react";

export interface SongManageDialogProps {
  // Refs
  songManageDialogRef: React.RefObject<HTMLDialogElement | null>;
  deleteSongConfirmDialogRef: React.RefObject<HTMLDialogElement | null>;
  deleteSonglistConfirmDialogRef: React.RefObject<HTMLDialogElement | null>;
  // Song manage state
  songManageTab: "songs" | "songlists";
  setSongManageTab: React.Dispatch<React.SetStateAction<"songs" | "songlists">>;
  isSongManageLoading: boolean;
  // Songs list state
  songs: Song[];
  songPage: number;
  setSongPage: (page: number) => void;
  songTotalPages: number;
  songSearchKw: string;
  setSongSearchKw: React.Dispatch<React.SetStateAction<string>>;
  songHasPrev: boolean;
  songHasNext: boolean;
  // Songlists state
  songlists: Songlist[];
  songlistPage: number;
  setSonglistPage: (page: number) => void;
  songlistTotalPages: number;
  songlistSearchKw: string;
  setSonglistSearchKw: React.Dispatch<React.SetStateAction<string>>;
  songlistHasPrev: boolean;
  songlistHasNext: boolean;
  // Song form state
  newSong: CreateSongRequest;
  setNewSong: React.Dispatch<React.SetStateAction<CreateSongRequest>>;
  editingSongId: number | null;
  editingSongData: CreateSongRequest;
  setEditingSongData: React.Dispatch<React.SetStateAction<CreateSongRequest>>;
  isCreatingSong: boolean;
  isUpdatingSong: boolean;
  pendingDeleteSongId: number | null;
  confirmDeleteSongId: number | null;
  setConfirmDeleteSongId: React.Dispatch<React.SetStateAction<number | null>>;
  // Songlist form state
  newSonglistPlatform: string;
  setNewSonglistPlatform: React.Dispatch<React.SetStateAction<string>>;
  newSonglistPlatformId: string;
  setNewSonglistPlatformId: React.Dispatch<React.SetStateAction<string>>;
  newSonglistCookie: string;
  setNewSonglistCookie: React.Dispatch<React.SetStateAction<string>>;
  isCreatingSonglist: boolean;
  isPollingTask: boolean;
  pendingDeleteSonglistId: number | null;
  confirmDeleteSonglistId: number | null;
  setConfirmDeleteSonglistId: React.Dispatch<React.SetStateAction<number | null>>;
  // Bind/add state
  bindSonglistId: number | null;
  setBindSonglistId: React.Dispatch<React.SetStateAction<number | null>>;
  isBindingSonglist: boolean;
  addSingleSongId: number | null;
  setAddSingleSongId: React.Dispatch<React.SetStateAction<number | null>>;
  isAddingSingleSong: boolean;
  // Loaders
  loadSongs: (page?: number, kw?: string) => Promise<void>;
  loadSonglists: (page?: number, kw?: string) => Promise<void>;
  // Pagination handlers
  handleSongPageChange: (nextPage: number) => Promise<void>;
  handleSonglistPageChange: (nextPage: number) => Promise<void>;
  // Action handlers
  handleCreateSong: () => Promise<void>;
  handleStartEditSong: (song: Song) => void;
  handleCancelEditSong: () => void;
  handleSaveEditSong: () => Promise<void>;
  handleDeleteSong: (songId: number) => void;
  handleConfirmDeleteSong: () => Promise<void>;
  handleCreateSonglist: () => Promise<void>;
  handleDeleteSonglist: (songlistId: number) => void;
  handleConfirmDeleteSonglist: () => Promise<void>;
  handleAddSingleSongToRoom: () => Promise<void>;
  handleBindSonglistToRoom: () => Promise<void>;
}

export function SongManageDialog({
  songManageDialogRef,
  deleteSongConfirmDialogRef,
  deleteSonglistConfirmDialogRef,
  songManageTab,
  setSongManageTab,
  isSongManageLoading,
  songs,
  songPage,
  setSongPage,
  songTotalPages,
  songSearchKw,
  setSongSearchKw,
  songHasPrev,
  songHasNext,
  songlists,
  songlistPage,
  setSonglistPage,
  songlistTotalPages,
  songlistSearchKw,
  setSonglistSearchKw,
  songlistHasPrev,
  songlistHasNext,
  newSong,
  setNewSong,
  editingSongId,
  editingSongData,
  setEditingSongData,
  isCreatingSong,
  isUpdatingSong,
  pendingDeleteSongId,
  confirmDeleteSongId,
  setConfirmDeleteSongId,
  newSonglistPlatform,
  setNewSonglistPlatform,
  newSonglistPlatformId,
  setNewSonglistPlatformId,
  newSonglistCookie,
  setNewSonglistCookie,
  isCreatingSonglist,
  isPollingTask,
  pendingDeleteSonglistId,
  confirmDeleteSonglistId,
  setConfirmDeleteSonglistId,
  bindSonglistId,
  setBindSonglistId,
  isBindingSonglist,
  addSingleSongId,
  setAddSingleSongId,
  isAddingSingleSong,
  loadSongs,
  loadSonglists,
  handleSongPageChange,
  handleSonglistPageChange,
  handleCreateSong,
  handleStartEditSong,
  handleCancelEditSong,
  handleSaveEditSong,
  handleDeleteSong,
  handleConfirmDeleteSong,
  handleCreateSonglist,
  handleDeleteSonglist,
  handleConfirmDeleteSonglist,
  handleAddSingleSongToRoom,
  handleBindSonglistToRoom,
}: SongManageDialogProps) {
  return (
    <>
      {/* 歌曲管理对话框 */}
      <dialog ref={songManageDialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-6xl">
          <h3 className="text-xl font-bold">歌曲与歌单管理</h3>
          <p className="text-sm opacity-70 mt-1">
            管理全局歌曲和歌单；可将歌单或单曲绑定到当前房间的播放队列。
          </p>

          {isSongManageLoading ? (
            <div className="relative flex items-center justify-center min-h-50">
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : (
            <>
              <div className="tabs tabs-boxed mt-4">
                <button
                  className={`tab ${songManageTab === "songs" ? "tab-active" : ""}`}
                  onClick={() => {
                    if (songManageTab !== "songs") {
                      setSongManageTab("songs");
                      setSongPage(1);
                      void loadSongs(1, songSearchKw);
                    }
                  }}
                >
                  歌曲管理
                </button>
                <button
                  className={`tab ${songManageTab === "songlists" ? "tab-active" : ""}`}
                  onClick={() => {
                    if (songManageTab !== "songlists") {
                      setSongManageTab("songlists");
                      setSonglistPage(1);
                      void loadSonglists(1, songlistSearchKw);
                    }
                  }}
                >
                  歌单管理
                </button>
              </div>

              {songManageTab === "songs" ? (
                <div className="mt-4">
                  <section className="card bg-base-200 mb-4">
                    <div className="card-body gap-3">
                      <h4 className="card-title text-lg">创建歌曲</h4>
                      <label className="floating-label">
                        <input
                          className="input input-bordered w-full"
                          value={newSong.title || ""}
                          onChange={(e) =>
                            setNewSong({ ...newSong, title: e.target.value })
                          }
                          placeholder="歌曲标题"
                        />
                        <span>歌曲标题 *</span>
                      </label>
                      <label className="floating-label">
                        <input
                          className="input input-bordered w-full"
                          value={newSong.artist || ""}
                          onChange={(e) =>
                            setNewSong({ ...newSong, artist: e.target.value })
                          }
                          placeholder="歌手"
                        />
                        <span>歌手</span>
                      </label>
                      <label className="floating-label">
                        <input
                          className="input input-bordered w-full"
                          value={newSong.platform_song_id || ""}
                          onChange={(e) =>
                            setNewSong({
                              ...newSong,
                              platform_song_id: e.target.value,
                            })
                          }
                          placeholder="平台歌曲ID"
                        />
                        <span>平台歌曲ID</span>
                      </label>
                      <button
                        className="btn btn-primary"
                        onClick={handleCreateSong}
                        disabled={isCreatingSong}
                      >
                        {isCreatingSong ? "创建中..." : "创建歌曲"}
                      </button>
                    </div>
                  </section>

                  <section className="card bg-base-200">
                    <div className="card-body">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="card-title text-lg">已有歌曲</h4>
                        <span className="text-xs opacity-70">
                          第 {songPage} / {songTotalPages} 页
                        </span>
                      </div>
                      <div className="flex gap-2 mb-2">
                        <input
                          className="input input-bordered input-sm flex-1"
                          value={songSearchKw}
                          onChange={(e) => setSongSearchKw(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                              setSongPage(1);
                              void loadSongs(1, songSearchKw);
                            }
                          }}
                          placeholder="搜索歌曲标题..."
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            setSongPage(1);
                            void loadSongs(1, songSearchKw);
                          }}
                        >
                          搜索
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="table table-zebra table-sm">
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>标题</th>
                              <th>歌手</th>
                              <th>平台</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {songs.map((song, index) => (
                              <tr key={`${song.id}-${song.title ?? "untitled"}-${index}`}>
                                <td>{song.id}</td>
                                <td>{song.title || "-"}</td>
                                <td>{song.artist || "-"}</td>
                                <td>{song.platform || "-"}</td>
                                <td>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-outline"
                                      onClick={() => handleStartEditSong(song)}
                                    >
                                      编辑
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-error btn-outline"
                                      onClick={() => handleDeleteSong(song.id)}
                                      disabled={pendingDeleteSongId === song.id}
                                    >
                                      {pendingDeleteSongId === song.id
                                        ? "删除中..."
                                        : "删除"}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-success btn-outline"
                                      onClick={() =>
                                        setAddSingleSongId(song.id)
                                      }
                                    >
                                      添加到房间
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {songs.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-8 text-base-content/50">
                            <Icon icon="heroicons:inbox" width="24" height="24" />
                            <p className="mt-2 text-sm">没有找到匹配的歌曲</p>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-xs"
                          onClick={() =>
                            void handleSongPageChange(songPage - 1)
                          }
                          disabled={!songHasPrev}
                        >
                          上一页
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs"
                          onClick={() =>
                            void handleSongPageChange(songPage + 1)
                          }
                          disabled={!songHasNext}
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                  </section>

                  {editingSongId && (
                    <div className="modal modal-open">
                      <div className="modal-box">
                        <h3 className="font-bold text-lg">编辑歌曲</h3>
                        <label className="floating-label mt-4">
                          <input
                            className="input input-bordered w-full"
                            value={editingSongData.title || ""}
                            onChange={(e) =>
                              setEditingSongData({
                                ...editingSongData,
                                title: e.target.value,
                              })
                            }
                            placeholder="歌曲标题"
                          />
                          <span>歌曲标题 *</span>
                        </label>
                        <label className="floating-label mt-2">
                          <input
                            className="input input-bordered w-full"
                            value={editingSongData.artist || ""}
                            onChange={(e) =>
                              setEditingSongData({
                                ...editingSongData,
                                artist: e.target.value,
                              })
                            }
                            placeholder="歌手"
                          />
                          <span>歌手</span>
                        </label>
                        <div className="modal-action">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={handleCancelEditSong}
                            disabled={isUpdatingSong}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSaveEditSong}
                            disabled={isUpdatingSong}
                          >
                            {isUpdatingSong ? "保存中..." : "保存"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 添加单曲到房间 */}
                  {addSingleSongId && (
                    <div className="modal modal-open">
                      <div className="modal-box">
                        <h3 className="font-bold text-lg">
                          添加单曲到房间队列
                        </h3>
                        <p className="py-3">
                          确认将这首歌曲添加到当前房间的播放队列吗？
                        </p>
                        <div className="modal-action">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setAddSingleSongId(null)}
                            disabled={isAddingSingleSong}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleAddSingleSongToRoom}
                            disabled={isAddingSingleSong}
                          >
                            {isAddingSingleSong ? "添加中..." : "确认添加"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <section className="card bg-base-200 mb-4">
                    <div className="card-body gap-3">
                      <h4 className="card-title text-lg">从平台导入歌单</h4>
                      <label className="floating-label">
                        <select
                          className="select select-bordered w-full"
                          value={newSonglistPlatform}
                          onChange={(e) =>
                            setNewSonglistPlatform(e.target.value)
                          }
                        >
                          <option value="qq">QQ音乐</option>
                          <option value="netease">网易云音乐</option>
                        </select>
                        <span>平台</span>
                      </label>
                      <label className="floating-label">
                        <input
                          className="input input-bordered w-full"
                          value={newSonglistPlatformId}
                          onChange={(e) =>
                            setNewSonglistPlatformId(e.target.value)
                          }
                          placeholder="歌单ID（例如：9561074811）"
                        />
                        <span>歌单ID *</span>
                      </label>
                      <label className="floating-label">
                        <input
                          className="input input-bordered w-full"
                          value={newSonglistCookie}
                          onChange={(e) => setNewSonglistCookie(e.target.value)}
                          placeholder="Cookie（可选，用于需要登录的歌单）"
                        />
                        <span>Cookie（可选）</span>
                      </label>
                      <button
                        className="btn btn-secondary"
                        onClick={handleCreateSonglist}
                        disabled={isCreatingSonglist || isPollingTask}
                      >
                        {isCreatingSonglist ? "导入中..." : "导入歌单"}
                      </button>
                    </div>
                  </section>

                  <section className="card bg-base-200">
                    <div className="card-body relative">
                      {isPollingTask && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-base-200/70 rounded-box">
                          <span className="loading loading-spinner loading-md" />
                          <p className="mt-2 text-sm opacity-70">
                            歌单爬取任务进行中，请稍候...
                          </p>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="card-title text-lg">已有歌单</h4>
                        <span className="text-xs opacity-70">
                          第 {songlistPage} / {songlistTotalPages} 页
                        </span>
                      </div>
                      <div className="flex gap-2 mb-2">
                        <input
                          className="input input-bordered input-sm flex-1"
                          value={songlistSearchKw}
                          onChange={(e) => setSonglistSearchKw(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                              setSonglistPage(1);
                              void loadSonglists(1, songlistSearchKw);
                            }
                          }}
                          placeholder="搜索歌单标题..."
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            setSonglistPage(1);
                            void loadSonglists(1, songlistSearchKw);
                          }}
                        >
                          搜索
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="table table-zebra table-sm">
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>标题</th>
                              <th>平台</th>
                              <th>歌曲数</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {songlists.map((songlist, index) => (
                              <tr
                                key={`${songlist.id}-${songlist.title ?? "untitled"}-${index}`}
                              >
                                <td>{songlist.id}</td>
                                <td>{songlist.title || "-"}</td>
                                <td>{songlist.platform || "-"}</td>
                                <td>{songlist.count}</td>
                                <td>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-outline"
                                      onClick={() =>
                                        setBindSonglistId(songlist.id)
                                      }
                                      disabled={isPollingTask}
                                    >
                                      绑定到房间
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-error btn-outline"
                                      onClick={() =>
                                        handleDeleteSonglist(songlist.id)
                                      }
                                      disabled={
                                        pendingDeleteSonglistId === songlist.id ||
                                        isPollingTask
                                      }
                                    >
                                      {pendingDeleteSonglistId === songlist.id
                                        ? "删除中..."
                                        : "删除"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {songlists.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-8 text-base-content/50">
                            <Icon icon="heroicons:inbox" width="24" height="24" />
                            <p className="mt-2 text-sm">没有找到匹配的歌单</p>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-xs"
                          onClick={() =>
                            void handleSonglistPageChange(songlistPage - 1)
                          }
                          disabled={!songlistHasPrev || isPollingTask}
                        >
                          上一页
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs"
                          onClick={() =>
                            void handleSonglistPageChange(songlistPage + 1)
                          }
                          disabled={!songlistHasNext || isPollingTask}
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* 绑定歌单到房间 */}
                  {bindSonglistId && (
                    <div className="modal modal-open">
                      <div className="modal-box">
                        <h3 className="font-bold text-lg">
                          绑定歌单到房间队列
                        </h3>
                        <p className="py-3">
                          确认将这个歌单的所有歌曲添加到当前房间的播放队列吗？
                        </p>
                        <div className="modal-action">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setBindSonglistId(null)}
                            disabled={isBindingSonglist}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleBindSonglistToRoom}
                            disabled={isBindingSonglist}
                          >
                            {isBindingSonglist ? "绑定中..." : "确认绑定"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => {}}>close</button>
        </form>
      </dialog>

      {/* 删除歌曲确认对话框 */}
      <dialog ref={deleteSongConfirmDialogRef} className="modal">
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg">确认删除歌曲</h3>
          <p className="py-3 text-sm">
            确认删除这首歌曲吗？
            {confirmDeleteSongId && (
              <span className="font-semibold ml-1">
                「
                {songs.find((s) => s.id === confirmDeleteSongId)?.title ||
                  `ID: ${confirmDeleteSongId}`}
                」
              </span>
            )}
            <br />
            此操作不可撤销。
          </p>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                deleteSongConfirmDialogRef.current?.close();
                setConfirmDeleteSongId(null);
              }}
              disabled={pendingDeleteSongId !== null}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={handleConfirmDeleteSong}
              disabled={pendingDeleteSongId !== null}
            >
              {pendingDeleteSongId !== null ? "删除中..." : "确认删除"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setConfirmDeleteSongId(null)}>close</button>
        </form>
      </dialog>

      {/* 删除歌单确认对话框 */}
      <dialog ref={deleteSonglistConfirmDialogRef} className="modal">
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg">确认删除歌单</h3>
          <p className="py-3 text-sm">
            确认删除这个歌单吗？
            {confirmDeleteSonglistId && (
              <span className="font-semibold ml-1">
                「
                {songlists.find((s) => s.id === confirmDeleteSonglistId)
                  ?.title || `ID: ${confirmDeleteSonglistId}`}
                」
              </span>
            )}
            <br />
            此操作不可撤销。
          </p>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                deleteSonglistConfirmDialogRef.current?.close();
                setConfirmDeleteSonglistId(null);
              }}
              disabled={pendingDeleteSonglistId !== null}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={handleConfirmDeleteSonglist}
              disabled={pendingDeleteSonglistId !== null}
            >
              {pendingDeleteSonglistId !== null ? "删除中..." : "确认删除"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setConfirmDeleteSonglistId(null)}>
            close
          </button>
        </form>
      </dialog>
    </>
  );
}
