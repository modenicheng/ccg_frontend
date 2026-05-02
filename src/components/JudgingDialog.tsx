import { Icon } from "@iconify-icon/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  getSongTagHistoryDetail,
  getSongTagHistorySummary,
  type SongTagGroupHistoryItem,
  type SongTagHistoryDetail,
} from "../api/song";
import type { WsTagGroup } from "../types/wsMessages";
import { SongInfoCard, type SongInfo } from "./SongInfoCard";
import { TagGroupSelector } from "./TagGroupSelector";

interface PlayerDescription {
  id: number;
  username: string;
  description: string;
}

interface JudgingDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  confirmAnswerDialogRef: RefObject<HTMLDialogElement | null>;
  currentSong: SongInfo | null;
  currentSongId: number | null;
  tagGroups: WsTagGroup[];
  selectedTags: Record<number, number | null>;
  selectedDescriptions: number[];
  historyTagIds: number[];
  referenceDescriptions: string[];
  playerDescriptions: PlayerDescription[];
  onSelectTag: (groupId: number, tagId: number) => void;
  onToggleDescription: (descriptionId: number) => void;
  isJudgingSubmitted?: boolean;
}

export function JudgingDialog({
  dialogRef,
  confirmAnswerDialogRef,
  currentSong,
  currentSongId,
  tagGroups,
  selectedTags,
  selectedDescriptions,
  historyTagIds,
  referenceDescriptions,
  playerDescriptions,
  onSelectTag,
  onToggleDescription,
  isJudgingSubmitted = false,
}: JudgingDialogProps) {
  const [historyGroups, setHistoryGroups] = useState<SongTagGroupHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const detailDialogRef = useRef<HTMLDialogElement | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState<boolean>(false);
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<SongTagHistoryDetail | null>(
    null,
  );

  useEffect(() => {
    if (currentSongId === null) {
      setHistoryGroups([]);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);

    void getSongTagHistorySummary(currentSongId)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setHistoryGroups(payload.groups ?? []);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "历史数据加载失败";
        setHistoryError(message);
        setHistoryGroups([]);
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentSongId]);

  const hasHistoryOptions = historyGroups.some((group) => group.tags.length > 0);

  const handleApplyHistory = () => {
    historyGroups.forEach((group) => {
      const mostSelectedTag = group.tags[0];
      if (!mostSelectedTag) {
        return;
      }
      onSelectTag(group.groupId, mostSelectedTag.tagId);
    });
  };

  const handleOpenHistoryDetail = async (groupId: number, tagId: number) => {
    if (currentSongId === null) {
      return;
    }

    detailDialogRef.current?.showModal();
    setHistoryDetailLoading(true);
    setHistoryDetailError(null);
    setHistoryDetail(null);

    try {
      const payload = await getSongTagHistoryDetail(currentSongId, tagId, groupId);
      setHistoryDetail(payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "历史详情查询失败，请稍后重试";
      setHistoryDetailError(message);
    } finally {
      setHistoryDetailLoading(false);
    }
  };

  const formatTimestamp = (value: string) => {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return value;
    }
    return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
  };

  return (
    <>
      <dialog ref={dialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-6xl">
          <h2 className="font-bold text-2xl">确认正确答案</h2>

          {currentSong && (
            <SongInfoCard
              songInfo={currentSong}
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

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex-1 min-w-0">
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-3">选择正确标签</h3>
                <TagGroupSelector
                  tagGroups={tagGroups}
                  selectedTags={selectedTags}
                  onSelectTag={onSelectTag}
                  radioNamePrefix="judging-tag-group"
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
            </div>

            <div className="divider lg:divider-horizontal m-0"></div>

            <aside className="w-full shrink-0 lg:w-96">
              <div className="card bg-base-200 shadow-sm">
                <div className="card-body p-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Icon icon="heroicons:clock-20-solid" width={20} height={20} />
                    历史答案提示
                  </h3>

                  {historyLoading && (
                    <div className="space-y-2">
                      <div className="skeleton h-5 w-2/3"></div>
                      <div className="skeleton h-10 w-full"></div>
                      <div className="skeleton h-10 w-full"></div>
                    </div>
                  )}

                  {!historyLoading && historyError && (
                    <div role="alert" className="alert alert-error alert-soft">
                      <span className="text-sm">{historyError}</span>
                    </div>
                  )}

                  {!historyLoading && !historyError && historyGroups.length === 0 && (
                    <div role="alert" className="alert alert-info alert-soft">
                      <span className="text-sm">暂无该歌曲的历史判分记录</span>
                    </div>
                  )}

                  {!historyLoading && !historyError && historyGroups.length > 0 && (
                    <div className="space-y-3">
                      {historyGroups.map((group) => (
                        <div key={group.groupId} className="space-y-2">
                          <div className="text-sm font-medium opacity-80">
                            {group.groupName}
                          </div>
                          {group.tags.length === 0 ? (
                            <div className="text-xs opacity-60">暂无历史标签</div>
                          ) : (
                            <ul className="menu bg-base-100 rounded-box p-1">
                              {group.tags.map((tag) => (
                                <li key={`${group.groupId}-${tag.tagId}`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm">{tag.tagName}</span>
                                    <button
                                      type="button"
                                      className="link link-primary text-sm"
                                      onClick={() =>
                                        void handleOpenHistoryDetail(
                                          group.groupId,
                                          tag.tagId,
                                        )
                                      }
                                    >
                                      {tag.selectedCount}
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary btn-sm btn-block mt-3"
                    disabled={isJudgingSubmitted || !hasHistoryOptions}
                    onClick={handleApplyHistory}
                  >
                    一键应用到判分
                  </button>
                </div>
              </div>
            </aside>
          </div>

          <div className="flex justify-end gap-3 mt-4">
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
              disabled={
                isJudgingSubmitted ||
                Object.values(selectedTags).some((v) => v === null)
              }
              onClick={() => {
                const hasAllTagsSelected = tagGroups.every(
                  (group) => selectedTags[group.id] !== null,
                );

                if (hasAllTagsSelected) {
                  confirmAnswerDialogRef.current?.showModal();
                }
              }}
            >
              {isJudgingSubmitted ? "已判分" : "确认答案"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>关闭</button>
        </form>
      </dialog>

      <dialog ref={detailDialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-4xl">
          <h3 className="font-bold text-xl">历史对局详情</h3>

          {historyDetailLoading && (
            <div className="py-4 space-y-2">
              <div className="skeleton h-5 w-1/3"></div>
              <div className="skeleton h-12 w-full"></div>
              <div className="skeleton h-12 w-full"></div>
            </div>
          )}

          {!historyDetailLoading && historyDetailError && (
            <div role="alert" className="alert alert-error alert-soft mt-4">
              <span className="text-sm">{historyDetailError}</span>
            </div>
          )}

          {!historyDetailLoading && !historyDetailError && historyDetail && (
            <div className="mt-4 space-y-3">
              <div className="text-sm opacity-80">
                标签组：{historyDetail.groupName ?? "未分组"} ｜ 标签：
                <span className="font-semibold">{historyDetail.tagName}</span> ｜ 总次数：
                <span className="font-semibold">{historyDetail.total}</span>
              </div>

              <div className="overflow-x-auto rounded-box border border-base-300">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>房间</th>
                      <th>判分人</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyDetail.records.map((record) => (
                      <tr key={record.historyId}>
                        <td>{record.historyId}</td>
                        <td>{record.roomId ?? "-"}</td>
                        <td>{record.judgedByUsername ?? "-"}</td>
                        <td>{formatTimestamp(record.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>关闭</button>
        </form>
      </dialog>
    </>
  );
}
