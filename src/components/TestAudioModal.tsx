import { Icon } from "@iconify-icon/react";
import type { Song } from "../api/song";

export interface TestAudioModalProps {
  isSettingTestAudio: boolean;
  setIsSettingTestAudio: (value: boolean) => void;
  testAudioSearchKw: string;
  setTestAudioSearchKw: (value: string) => void;
  testAudioSongs: Song[];
  testAudioSongsTotal: number;
  testAudioSongsPage: number;
  setTestAudioSongsPage: (page: number) => void;
  isLoadingTestAudioSongs: boolean;
  isSwitchingTestAudio: boolean;
  testAudioTaskId: string | null;
  testAudioTaskStatus: string | null;
  testAudioTargetSongId: number | null;
  loadTestAudioSongs: (page: number, kw?: string) => Promise<void>;
  handleTestAudioSongsPageChange: (nextPage: number) => Promise<void>;
  handleSetTestAudio: (songDbId: number) => Promise<void>;
  roomSongsPageSize: number;
}

export function TestAudioModal({
  isSettingTestAudio,
  setIsSettingTestAudio,
  testAudioSearchKw,
  setTestAudioSearchKw,
  testAudioSongs,
  testAudioSongsTotal,
  testAudioSongsPage,
  setTestAudioSongsPage,
  isLoadingTestAudioSongs,
  isSwitchingTestAudio,
  testAudioTaskId,
  testAudioTaskStatus,
  testAudioTargetSongId,
  loadTestAudioSongs,
  handleTestAudioSongsPageChange,
  handleSetTestAudio,
  roomSongsPageSize,
}: TestAudioModalProps) {
  if (!isSettingTestAudio) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-3xl">
        <h3 className="font-bold text-lg">设置预热背景音乐</h3>
        <p className="py-2">
          从数据库已导入的单曲中选择一首作为房间等待时的预热 BGM
        </p>
        
        {/* 搜索框 */}
        <div className="py-4">
          <input
            type="text"
            placeholder="搜索歌曲..."
            className="input input-bordered w-full mb-4"
            value={testAudioSearchKw}
            onChange={(e) => setTestAudioSearchKw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSwitchingTestAudio) {
                setTestAudioSongsPage(1);
                void loadTestAudioSongs(1, testAudioSearchKw);
              }
            }}
            disabled={isSwitchingTestAudio}
          />
          
          {/* 歌曲列表 */}
          <div className="overflow-y-auto max-h-96">
            {isLoadingTestAudioSongs ? (
              <div className="py-8 text-center">
                <span className="loading loading-spinner loading-md" />
                <p className="mt-2 text-sm opacity-70">
                  加载歌曲中...
                </p>
              </div>
            ) : (
              <table className="table table-zebra w-full">
                <thead>
                  <tr>
                    <th>歌曲</th>
                    <th>歌手</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {testAudioSongs
                    .filter((song) => {
                      if (!testAudioSearchKw) return true;
                      const kw = testAudioSearchKw.toLowerCase();
                      return (
                        song.title?.toLowerCase().includes(kw) ||
                        song.artist?.toLowerCase().includes(kw)
                      );
                    })
                    .map((song) => (
                      <tr key={song.id}>
                        <td>{song.title || '未知歌曲'}</td>
                        <td>{song.artist || '未知歌手'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-xs btn-accent"
                            onClick={() => {
                              void handleSetTestAudio(song.id);
                            }}
                            disabled={isSwitchingTestAudio}
                          >
                            {isSwitchingTestAudio &&
                            testAudioTargetSongId === song.id ? (
                              <>
                                <span className="loading loading-spinner loading-xs" />
                                处理中...
                              </>
                            ) : (
                              "设为 BGM"
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
            {testAudioSongs.length === 0 && !isLoadingTestAudioSongs && (
              <div className="flex flex-col items-center justify-center py-8 text-base-content/50">
                <Icon icon="heroicons:music-note" width="24" height="24" />
                <p className="mt-2 text-sm">数据库中没有歌曲</p>
                <p className="text-xs mt-1">请先在歌曲管理中添加歌曲</p>
              </div>
            )}
          </div>
          
          {/* 分页控件 */}
          {!isLoadingTestAudioSongs && testAudioSongsTotal > 0 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <span className="text-xs opacity-70">
                第 {testAudioSongsPage} / {Math.max(1, Math.ceil(testAudioSongsTotal / roomSongsPageSize))} 页
              </span>
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => {
                  void handleTestAudioSongsPageChange(testAudioSongsPage - 1);
                }}
                disabled={testAudioSongsPage <= 1 || isSwitchingTestAudio}
              >
                上一页
              </button>
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => {
                  void handleTestAudioSongsPageChange(testAudioSongsPage + 1);
                }}
                disabled={
                  testAudioSongsPage >=
                    Math.ceil(testAudioSongsTotal / roomSongsPageSize) ||
                  isSwitchingTestAudio
                }
              >
                下一页
              </button>
            </div>
          )}

          {isSwitchingTestAudio && (
            <div role="alert" className="alert alert-info alert-soft mt-4">
              <span className="loading loading-spinner loading-sm" />
              <span>
                服务器正在拉取音频文件，请稍候...
                {testAudioTaskStatus ? ` 当前状态：${testAudioTaskStatus}` : ""}
                {testAudioTaskId ? `（任务ID：${testAudioTaskId}）` : ""}
              </span>
            </div>
          )}
          
          <p className="text-xs opacity-70 mt-4">
            默认 BGM：001gQVVQ0WD3Al
            <br />
            房间创建后会自动循环播放这首歌曲（仅当窗口激活时）
          </p>
        </div>
        
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIsSettingTestAudio(false)}
            disabled={isSwitchingTestAudio}
          >
            {isSwitchingTestAudio ? "处理中..." : "关闭"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button
          type="button"
          onClick={() => {
            if (!isSwitchingTestAudio) {
              setIsSettingTestAudio(false);
            }
          }}
          disabled={isSwitchingTestAudio}
        >
          close
        </button>
      </form>
    </div>
  );
}
