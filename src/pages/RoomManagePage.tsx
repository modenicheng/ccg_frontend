import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icon } from "@iconify-icon/react";
import { TagList } from "../components";
import { gameStore, useGameStore } from "../stores/gameStore";
import type { RoomState } from "../types/store";
import useWebSocketStore from "../stores/webSocketStore";
import {
  getRoomInfo,
  patchRoomInfo,
  type RoomInfoResponse,
} from "../api/room";
import {
  getTagGroups,
  type TagGroup,
} from "../api/tags";
import { GameEventId } from "../types/eventTypes";

import useErrorToastStore from "../stores/errorToastStore";
import usePersistStore from "../stores/persistStore";
import { getRoomAuthQueryParams } from "../utils/roomAuth";
import { readCookie } from "../utils/common";
import { useAutoToast } from "../hooks/useAutoToast";
import { usePlayerManagement } from "../hooks/usePlayerManagement";
import { useSongManagement } from "../hooks/useSongManagement";
import { useTagManagement } from "../hooks/useTagManagement";
import { useTestAudioManagement } from "../hooks/useTestAudioManagement";
import { useRoomSongsManagement } from "../hooks/useRoomSongsManagement";

function mapRoomInfoToRoomState(data: RoomInfoResponse): RoomState {
  const statusCode = data.status === "playing" ? 1 : data.status === "ended" ? 2 : 0;
  return {
    roomId: data.roomId,
    title: data.title ?? null,
    status: data.status,
    statusCode,
    roundState: data.roundState ?? "PENDING",
    roundStateCode: data.roundStateCode ?? 0,
    show_answer: false,
    song_start_range_percent: null,
    players: [], // full player objects not available
    answer_queue: [],
    answer_queue_tail_player_id: null,
    round_scored: false,
    round_answers: [],
    tag_groups: [],
    playback_status: null,
    description: data.description ?? null,
    hostPlayerId: data.hostPlayerId,
    playersSimple: data.players,
    tagGroupsSimple: data.tagGroups,
    playProgress: data.playProgress,
    startPositionPercent: data.startPositionPercent ?? 0,
    songQueue: data.songQueue,
  };
}

const RoomManagePage = () => {
  const { roomid } = useParams<{ roomid: string }>();
  const navigate = useNavigate();
  const { roomState } = useGameStore();
  const { wsClient } = useWebSocketStore();
  const pushToast = useErrorToastStore((state) => state.pushToast);
  const persistedRoomUser = usePersistStore((state) =>
    roomid ? state.getRoomUser(roomid) : undefined,
  );

  const roomId = roomid?.trim() ?? "";
  const buildRoomAuthQueryString = useCallback(() => {
    if (!roomId) {
      return "";
    }
    const authQuery = getRoomAuthQueryParams(roomId);
    if (!authQuery) {
      return "";
    }
    return `?${new URLSearchParams(authQuery).toString()}`;
  }, [roomId]);
  const sessionUserId = Number.parseInt(
    roomId ? sessionStorage.getItem(`ccg-room-user-id:${roomId}`) ?? "" : "",
    10,
  );
  const cookieUserId = Number.parseInt(
    roomId ? readCookie(`ccg-room-user-id:${roomId}`) ?? "" : "",
    10,
  );
  const currentUserId =
    persistedRoomUser?.id ??
    (Number.isFinite(sessionUserId) ? sessionUserId : null) ??
    (Number.isFinite(cookieUserId) ? cookieUserId : null);

  const [title, setTitle] = useState<string>("");
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [selectedTagGroupIds, setSelectedTagGroupIds] = useState<number[]>([]);
  const [initialTitle, setInitialTitle] = useState<string>("");
  const [initialSelectedIds, setInitialSelectedIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const endGameConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const dissolveRoomConfirmDialogRef = useRef<HTMLDialogElement | null>(null);

  const {
    setPlayers,
    isKicking,
    kickError,
    kickSuccess,
    uniquePlayers,
    handleKickUser,
  } = usePlayerManagement({ roomid: roomId, wsClient });

  useEffect(() => {
    if (roomid) {
      const roomTitle = title || roomState?.title;
      document.title = roomTitle
        ? `GUESongS - 管理${roomTitle}|${roomid}`
        : `GUESongS - 管理${roomid}`;
    }
  }, [roomid, title, roomState?.title]);

  const loadTagGroups = useCallback(async () => {
    const allGroups = await getTagGroups();
    setTagGroups(allGroups);

    const validIds = new Set(allGroups.map((group) => group.id));
    setSelectedTagGroupIds((prev) => prev.filter((id) => validIds.has(id)));
    setInitialSelectedIds((prev) => prev.filter((id) => validIds.has(id)));

    return allGroups;
  }, []);

  const {
    manageTags,
    manageTagGroups,
    setGroupTagIds,
    newTagName,
    setNewTagName,
    newGroupName,
    setNewGroupName,
    newGroupDescription,
    setNewGroupDescription,
    isManageLoading,
    isCreatingTag,
    isUpdatingTag,
    deletingTagId,
    isCreatingGroup,
    isEditingGroup,
    deletingGroupId,
    pendingDeleteGroup,
    setPendingDeleteGroup,
    manageError,
    manageSuccess,
    editingTagName,
    setEditingTagName,
    pendingDeleteTag,
    setPendingDeleteTag,
    editingGroupName,
    setEditingGroupName,
    editingGroupDescription,
    setEditingGroupDescription,
    setEditingTagIds,
    manageDialogRef,
    editGroupDialogRef,
    editTagDialogRef,
    newTagInputRef,
    deleteTagConfirmDialogRef,
    deleteConfirmDialogRef,
    handleOpenManageDialog,
    handleCreateTag,
    handleStartEditTag,
    handleCancelEditTag,
    handleSaveEditTag,
    handleDeleteTag,
    handleConfirmDeleteTag,
    handleDeleteTagDialogKeyDown,
    handleNewTagKeyDown,
    handleCreateTagGroup,
    handleStartEditGroup,
    handleCancelEditGroup,
    handleSaveEditGroup,
    handleDeleteGroup,
    handleConfirmDeleteGroup,
    handleDeleteDialogKeyDown,
    selectableTagItems,
    selectableEditTagItems,
  } = useTagManagement({
    loadTagGroups,
    onTagGroupsLoaded: setTagGroups,
  });

  const {
    roomSongs,
    roomSongsPage,
    setRoomSongsPage,
    roomSongsTotal,
    isLoadingRoomSongs,
    roomSongsError,
    roomSongsSuccess,
    selectedRoomSongIds,
    isShufflingRoomSongs,
    roomSongSearchKw,
    setRoomSongSearchKw,
    clearRoomSongsConfirmDialogRef,
    loadRoomSongs,
    roomSongsHasPrev,
    roomSongsTotalPages,
    roomSongsHasNext,
    handleRoomSongsPageChange,
    handleRemoveSongsFromRoom,
    handleOpenClearRoomSongsConfirm,
    handleClearRoomSongs,
    handleShuffleRoomSongs,
    toggleRoomSongSelection,
    handleSelectAllRoomSongs,
  } = useRoomSongsManagement({ roomid: roomId });

  const {
    songManageDialogRef,
    deleteSongConfirmDialogRef,
    deleteSonglistConfirmDialogRef,
    pollingRef,
    songManageTab,
    setSongManageTab,
    isSongManageLoading,
    songManageError,
    setSongManageError,
    songManageSuccess,
    setSongManageSuccess,
    songs,
    songPage,
    setSongPage,
    songSearchKw,
    setSongSearchKw,
    songHasPrev,
    songTotalPages,
    songHasNext,
    songlists,
    songlistPage,
    setSonglistPage,
    songlistSearchKw,
    setSonglistSearchKw,
    songlistHasPrev,
    songlistTotalPages,
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
    handleOpenSongManageDialog,
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
  } = useSongManagement({
    roomid: roomId,
    loadRoomSongs,
    roomSongSearchKw,
    setRoomSongsPage,
  });

  const {
    testAudioSongId,
    initialTestAudioSongId,
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
    testAudioRequestVersionRef,
    isUiBlockedByTestAudioTask,
    loadTestAudioSongs,
    applyTestAudioWithPolling,
    handleOpenTestAudioDialog,
    handleTestAudioSongsPageChange,
    handleSetTestAudio,
    roomSongsPageSize,
  } = useTestAudioManagement({
    roomid: roomId,
    setError: setSongManageError,
    setSuccess: setSongManageSuccess,
  });

  useEffect(() => {
    let isMounted = true;

    const initPage = async () => {
      if (!roomid) {
        navigate("/");
        return;
      }

      if (currentUserId === null) {
        navigate("/", { replace: true });
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const roomInfo = (await getRoomInfo(roomid)) as RoomInfoResponse & {
          playersDetailed?: Array<{
            id: number;
            username: string;
            is_owner: boolean;
          }>;
        };

        const currentPlayer = roomInfo.playersDetailed?.find(
          (player) => player.id === currentUserId,
        );
        const hostPlayerId = Number.parseInt(roomInfo.hostPlayerId, 10);
        const isCurrentUserOwner =
          currentPlayer?.is_owner ??
          (Number.isFinite(hostPlayerId) && currentUserId !== null
            ? hostPlayerId === currentUserId
            : false);

        if (!isCurrentUserOwner) {
          navigate(`/room/${roomid}`, { replace: true });
          return;
        }

        const allGroups = await loadTagGroups();
        setRoomSongsPage(1);
        await loadRoomSongs(1, roomSongSearchKw);

        if (!isMounted) {
          return;
        }

        gameStore.getState().setRoomState(mapRoomInfoToRoomState(roomInfo));

        // 存储玩家详细信息
        if ('playersDetailed' in roomInfo) {
          setPlayers(roomInfo.playersDetailed as Array<{ id: number; username: string; is_owner: boolean }>);
        }

        const selectedIds = allGroups
          .filter((group) => roomInfo.tagGroups[group.name])
          .map((group) => group.id);

        setTitle(roomInfo.title ?? "");
        setInitialTitle(roomInfo.title ?? "");
        setSelectedTagGroupIds(selectedIds);
        setInitialSelectedIds(selectedIds);
      } catch (err) {
        setError((err as Error).message || "加载房间信息失败");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initPage();

    return () => {
      isMounted = false;
    };
  }, [currentUserId, loadRoomSongs, loadTagGroups, navigate, roomSongSearchKw, roomid]);

  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      testAudioRequestVersionRef.current += 1;
    };
  }, []);

  useAutoToast(
    [
      { message: manageError, variant: "error" },
      { message: manageSuccess, variant: "success" },
      { message: error, variant: "error" },
      { message: success, variant: "success" },
      { message: roomSongsError, variant: "error" },
      { message: roomSongsSuccess, variant: "success" },
      { message: kickError, variant: "error" },
      { message: kickSuccess, variant: "success" },
      { message: songManageError, variant: "error" },
      { message: songManageSuccess, variant: "success" },
    ],
    pushToast,
  );

  const hasChanges = useMemo(() => {
    const titleChanged = title.trim() !== initialTitle.trim();
    const selectedChanged =
      [...selectedTagGroupIds].sort((a, b) => a - b).join(",") !==
      [...initialSelectedIds].sort((a, b) => a - b).join(",");
    const testAudioChanged = testAudioSongId !== initialTestAudioSongId;
    return titleChanged || selectedChanged || testAudioChanged;
  }, [initialSelectedIds, initialTestAudioSongId, initialTitle, selectedTagGroupIds, testAudioSongId, title]);

  const toggleTagGroup = (id: number) => {
    setSelectedTagGroupIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSaveSettings = async () => {
    if (!roomid) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const room = await patchRoomInfo(roomid, {
        title: title.trim(),
        tagGroupIds: selectedTagGroupIds,
      });

      gameStore.getState().setRoomState(mapRoomInfoToRoomState(room));

      setInitialTitle(room.title ?? "");
      setInitialSelectedIds(selectedTagGroupIds);

      // 如果 test_audio 已更改，调用同一接口并轮询直到完成
      if (testAudioSongId !== initialTestAudioSongId && testAudioSongId !== null) {
        const switched = await applyTestAudioWithPolling(testAudioSongId, {
          closeDialogOnSuccess: false,
        });
        if (!switched) {
          throw new Error("预热 BGM 设置未完成，请稍后重试");
        }
      }

      setSuccess("房间设置已保存");
    } catch (error) {
      setError((error as Error).message || "保存设置失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartGame = async () => {
    if (!wsClient) return;

    try {
      // 发送游戏开始事件
      await wsClient.sendJson({
        event: GameEventId.GAME_START,
        data: {},
      });

      navigate(`/room/${roomid}`);
    } catch (error) {
      console.error("开始游戏失败:", error);
    }
  };

  const handleEndGame = async () => {
    if (!wsClient) return;

    endGameConfirmDialogRef.current?.showModal();
  };

  const handleConfirmEndGame = async () => {
    if (!wsClient) return;

    try {
      // 发送游戏结束事件
      await wsClient.sendJson({
        event: GameEventId.GAME_OVER,
        data: {
          manual: true,
        },
      });

      setSuccess("游戏已结束");
      endGameConfirmDialogRef.current?.close();
    } catch (error) {
      setError((error as Error).message || "结束游戏失败");
      console.error("结束游戏失败:", error);
    }
  };

  const handleDissolveRoom = async () => {
    dissolveRoomConfirmDialogRef.current?.showModal();
  };

  const handleConfirmDissolveRoom = async () => {
    try {
      // 调用解散房间 API
      await fetch(
        `/api/room/${encodeURIComponent(roomid!)}/dissolve${buildRoomAuthQueryString()}`,
        {
        method: 'DELETE',
        },
      );

      setSuccess("房间已解散");
      dissolveRoomConfirmDialogRef.current?.close();
      
      // 延迟跳转到首页
      setTimeout(() => {
        navigate('/');
      }, 1000);
    } catch (error) {
      setError((error as Error).message || "解散房间失败");
      console.error("解散房间失败:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="text-center">
          <div className="loading loading-spinner loading-lg"></div>
          <p className="mt-4 text-base-content/70">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <nav className="navbar bg-base-100 shadow-sm px-4 md:px-6">
        <div className="navbar-start">
          <div className="flex items-center gap-3">
            <img src="/icon_01.svg" alt="GUESongS 图标" className="w-8 h-8" />
            <h1 className="text-xl font-bold">猜猜歌 · 房间管理</h1>
          </div>
        </div>
        <div className="navbar-end gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => void handleOpenSongManageDialog()}
            disabled={isUiBlockedByTestAudioTask}
          >
            管理歌曲 / 歌单
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleOpenManageDialog}
            disabled={isUiBlockedByTestAudioTask}
          >
            管理 Tag / TagGroup
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/room/${roomid}`)}
            disabled={isUiBlockedByTestAudioTask}
          >
            返回房间
          </button>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          <section className="lg:col-span-2 card bg-base-100 shadow-sm">
            <div className="card-body gap-5">
              <h2 className="card-title">房间基础设置</h2>

              <label className="floating-label">
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入房间标题"
                  maxLength={100}
                  disabled={isUiBlockedByTestAudioTask}
                />
                <span>房间标题</span>
              </label>

              <div>
                <h3 className="text-sm font-semibold mb-2">TagGroup 选择</h3>
                <div className="flex flex-wrap gap-2">
                  {tagGroups.map((group, index) => {
                    const selected = selectedTagGroupIds.includes(group.id);
                    return (
                      <button
                        key={`${group.id}-${group.name}-${index}`}
                        type="button"
                        className={`btn btn-sm ${selected ? "btn-primary" : "btn-soft"}`}
                        onClick={() => toggleTagGroup(group.id)}
                        title={group.description || undefined}
                        disabled={isUiBlockedByTestAudioTask}
                      >
                        {group.name}
                        <span className="badge badge-ghost badge-sm ml-1">
                          {group.tags.length}
                        </span>
                      </button>
                    );
                  })}
                  {tagGroups.length === 0 ? (
                    <div className="badge badge-warning badge-soft py-3">
                      还没有可选 TagGroup，请先在弹窗里创建。
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 房间歌曲管理 */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">房间歌曲管理</h3>
                <p className="text-sm opacity-70 mb-3">
                  管理当前房间的歌曲队列。可以从歌单绑定歌曲，或添加/删除单曲。
                </p>

                <div className="card bg-base-200">
                  <div className="card-body p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="card-title text-lg">
                        当前房间歌曲
                        <span className="badge badge-ghost badge-sm ml-2">
                          {roomSongsTotal} 首
                        </span>
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs opacity-70">
                          第 {roomSongsPage} / {roomSongsTotalPages} 页
                        </span>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={handleSelectAllRoomSongs}
                          disabled={roomSongs.length === 0 || isUiBlockedByTestAudioTask}
                        >
                          {selectedRoomSongIds.length === roomSongs.length &&
                          roomSongs.length > 0
                            ? "取消全选"
                            : "全选"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-error btn-outline"
                          onClick={() =>
                            handleRemoveSongsFromRoom(selectedRoomSongIds)
                          }
                          disabled={
                            selectedRoomSongIds.length === 0 || isUiBlockedByTestAudioTask
                          }
                        >
                          删除选中 ({selectedRoomSongIds.length})
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-warning btn-outline"
                          onClick={handleOpenClearRoomSongsConfirm}
                          disabled={roomSongs.length === 0 || isUiBlockedByTestAudioTask}
                        >
                          清空全部
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-info btn-outline"
                          onClick={() => void handleShuffleRoomSongs()}
                          disabled={
                            roomSongs.length === 0 ||
                            isShufflingRoomSongs ||
                            isUiBlockedByTestAudioTask
                          }
                        >
                          {isShufflingRoomSongs ? "打乱中..." : "手动打乱"}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 mb-2">
                      <input
                        className="input input-bordered input-sm flex-1"
                        value={roomSongSearchKw}
                        onChange={(e) => setRoomSongSearchKw(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            setRoomSongsPage(1);
                            void loadRoomSongs(1, roomSongSearchKw);
                          }
                        }}
                        placeholder="搜索房间歌曲标题..."
                        disabled={isUiBlockedByTestAudioTask}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => {
                          setRoomSongsPage(1);
                          void loadRoomSongs(1, roomSongSearchKw);
                        }}
                        disabled={isUiBlockedByTestAudioTask}
                      >
                        搜索
                      </button>
                    </div>

                    {isLoadingRoomSongs ? (
                      <div className="py-8 text-center">
                        <span className="loading loading-spinner loading-md" />
                        <p className="mt-2 text-sm opacity-70">
                          加载房间歌曲中...
                        </p>
                      </div>
                    ) : roomSongs.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-base-content/70">房间中暂无歌曲</p>
                        <p className="text-sm opacity-70 mt-1">
                          可以点击下方按钮从歌单绑定歌曲，或在下方歌曲管理对话框中添加单曲
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="table table-zebra table-sm">
                            <thead>
                              <tr>
                                <th className="w-10">
                                  <input
                                    type="checkbox"
                                    className="checkbox checkbox-xs"
                                    checked={
                                      selectedRoomSongIds.length ===
                                        roomSongs.length && roomSongs.length > 0
                                    }
                                    onChange={handleSelectAllRoomSongs}
                                    disabled={roomSongs.length === 0}
                                  />
                                </th>
                                <th>歌曲</th>
                                <th>歌手</th>
                              </tr>
                            </thead>
                            <tbody>
                              {roomSongs?.map((roomSong, index) => (
                                <tr
                                  key={`${roomSong.room_id}-${roomSong.song_id}-${roomSong.song_order ?? "na"}-${index}`}
                                >
                                  <td>
                                    <input
                                      type="checkbox"
                                      className="checkbox checkbox-xs"
                                      checked={selectedRoomSongIds.includes(
                                        roomSong.song_id,
                                      )}
                                      onChange={() =>
                                        toggleRoomSongSelection(
                                          roomSong.song_id,
                                        )
                                      }
                                    />
                                  </td>
                                  <td>
                                    <div className="font-medium">
                                      {roomSong.song?.title || "-"}
                                    </div>
                                    {roomSong.song?.subtitle && (
                                      <div className="text-xs opacity-70">
                                        {roomSong.song?.subtitle}
                                      </div>
                                    )}
                                  </td>
                                  <td>{roomSong.song?.artist || "-"}</td>
                                  <td className="flex justify-end-safe">
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-error btn-outline"
                                      onClick={() =>
                                        handleRemoveSongsFromRoom([
                                          roomSong.song_id,
                                        ])
                                      }
                                    >
                                      移除
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {roomSongs.length === 0 && (
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
                              void handleRoomSongsPageChange(roomSongsPage - 1)
                            }
                            disabled={!roomSongsHasPrev}
                          >
                            上一页
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs"
                            onClick={() =>
                              void handleRoomSongsPageChange(roomSongsPage + 1)
                            }
                            disabled={!roomSongsHasNext}
                          >
                            下一页
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      void handleOpenSongManageDialog("songlists");
                    }}
                    disabled={isUiBlockedByTestAudioTask}
                  >
                    <Icon icon="mdi:playlist-music" className="text-lg" />
                    从歌单绑定歌曲
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      void handleOpenSongManageDialog("songs");
                    }}
                    disabled={isUiBlockedByTestAudioTask}
                  >
                    <Icon icon="mdi:music" className="text-lg" />
                    添加单曲到房间
                  </button>
                  <button
                    type="button"
                    className="btn btn-accent btn-sm"
                    onClick={() => {
                      void handleOpenTestAudioDialog();
                    }}
                    disabled={isUiBlockedByTestAudioTask}
                  >
                    <Icon icon="mdi:volume-high" className="text-lg" />
                    设置预热 BGM
                    {testAudioSongId && (
                      <span className="ml-1 text-xs opacity-70">
                        (当前：ID {testAudioSongId})
                      </span>
                    )}
                  </button>
                </div>

                {isSwitchingTestAudio ? (
                  <div role="alert" className="alert alert-info alert-soft mt-3">
                    <span className="loading loading-spinner loading-sm" />
                    <span>
                      服务器正在拉取音频文件，暂时禁止操作。
                      {testAudioTaskId ? ` 任务ID：${testAudioTaskId}` : ""}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  className="btn btn-primary"
                  onClick={handleSaveSettings}
                  disabled={isSaving || !hasChanges || isUiBlockedByTestAudioTask}
                >
                  {isSaving ? "保存中..." : "保存设置"}
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleStartGame}
                  disabled={isUiBlockedByTestAudioTask}
                >
                  开始游戏
                </button>
                <button
                  className="btn btn-warning"
                  onClick={handleEndGame}
                  disabled={isUiBlockedByTestAudioTask}
                >
                  结束游戏
                </button>
                <button
                  className="btn btn-error"
                  onClick={handleDissolveRoom}
                  disabled={isUiBlockedByTestAudioTask}
                >
                  解散房间
                </button>
              </div>
            </div>
          </section>

          <aside className="lg:col-span-1 card bg-base-100 shadow-sm h-fit">
            <div className="card-body">
              <h3 className="card-title text-lg">房间概览</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="opacity-70">房间 ID</span>
                  <span className="font-mono">{roomid}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="opacity-70">玩家数量</span>
                  <span>{roomState?.playersSimple?.length || 0}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="opacity-70">已选 TagGroup</span>
                  <span>{selectedTagGroupIds.length}</span>
                </div>
              </div>

              <div className="divider my-1" />

              <div className="text-sm">
                <p className="opacity-70 mb-1">已选分组</p>
                <div className="flex flex-wrap gap-1.5">
                  {tagGroups
                    .filter((group) => selectedTagGroupIds.includes(group.id))
                    .map((group, index) => (
                      <span
                        key={`${group.id}-${group.name}-${index}`}
                        className="badge badge-primary badge-soft"
                      >
                        {group.name}
                      </span>
                    ))}
                  {selectedTagGroupIds.length === 0 ? (
                    <span className="text-base-content/60">暂无</span>
                  ) : null}
                </div>
              </div>

              <div className="divider my-1" />

              <div className="text-sm">
                <p className="opacity-70 mb-1">玩家列表</p>
                <div className="space-y-2">
                  {uniquePlayers.map((player, index) => (
                    <div
                      key={`${player.id}-${player.username}-${index}`}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span>{player.username}</span>
                        {player.is_owner && (
                          <span className="badge badge-primary badge-xs">房主</span>
                        )}
                      </div>
                      {!player.is_owner && (
                        <button
                          type="button"
                          className="btn btn-xs btn-error btn-outline"
                          onClick={() => handleKickUser(player.id)}
                          disabled={isKicking === player.id || isUiBlockedByTestAudioTask}
                        >
                          {isKicking === player.id ? "踢人中..." : "踢人"}
                        </button>
                      )}
                    </div>
                  ))}
                  {uniquePlayers.length === 0 ? (
                    <span className="text-base-content/60">暂无玩家</span>
                  ) : null}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <dialog ref={manageDialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-6xl">
          <h3 className="text-xl font-bold">Tag / TagGroup 管理</h3>
          <p className="text-sm opacity-70 mt-1">
            这里用于维护全局标签与标签组；创建后可回到上方直接选择应用到房间。
          </p>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="card bg-base-200">
              <div className="card-body gap-3">
                <h4 className="card-title text-lg">创建 Tag</h4>
                <label className="floating-label">
                  <input
                    ref={newTagInputRef}
                    className="input input-bordered w-full"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={handleNewTagKeyDown}
                    placeholder="例如：二次元 / 抒情 / 国风"
                  />
                  <span>Tag 名称</span>
                </label>
                <button
                  className="btn btn-primary"
                  onClick={handleCreateTag}
                  disabled={isCreatingTag}
                >
                  {isCreatingTag ? "创建中..." : "创建 Tag"}
                </button>

                <div className="divider my-1">现有 Tags</div>
                <div className="relative min-h-12">
                  {isManageLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-base-100/40 rounded z-10">
                      <span className="loading loading-spinner loading-sm" />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {manageTags.map((tag, index) => (
                      <div
                        key={`${tag.id}-${tag.name}-${index}`}
                        className="badge badge-lg gap-0 pr-0"
                      >
                        <span className="mr-1">{tag.name}</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-circle btn-xs"
                          onClick={() => handleStartEditTag(tag)}
                          aria-label={`编辑 Tag：${tag.name}`}
                          title={`编辑 ${tag.name}`}
                        >
                          <Icon
                            icon="heroicons:pencil-square"
                            width="14"
                            height="14"
                          />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-circle btn-xs"
                          onClick={() => handleDeleteTag(tag)}
                          disabled={deletingTagId === tag.id}
                        >
                          {/* {deletingTagId === tag.id ? "删除中..." : "删除"} */}
                          <Icon
                            icon="heroicons:x-mark"
                            width="14"
                            height="14"
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </section>

              <section className="card bg-base-200">
                <div className="card-body gap-3">
                  <h4 className="card-title text-lg">创建 TagGroup</h4>
                  <label className="floating-label">
                    <input
                      className="input input-bordered w-full"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="例如：曲风"
                    />
                    <span>TagGroup 名称</span>
                  </label>
                  <label className="floating-label">
                    <input
                      className="input input-bordered w-full"
                      value={newGroupDescription}
                      onChange={(e) => setNewGroupDescription(e.target.value)}
                      placeholder="可选：分组说明"
                    />
                    <span>描述（可选）</span>
                  </label>

                  <div>
                    <h5 className="text-sm font-semibold mb-2">
                      选择分组包含的 Tags
                    </h5>
                    <TagList
                      tags={selectableTagItems}
                      onToggleTag={(id) => {
                        const tagId = Number(id);
                        setGroupTagIds((prev) =>
                          prev.includes(tagId)
                            ? prev.filter((item) => item !== tagId)
                            : [...prev, tagId],
                        );
                      }}
                      onAddTag={() => {
                        // 弹窗中创建 Tag 走独立输入区
                      }}
                      onRemoveTag={() => {
                        // 仅做选择，不在此删除
                      }}
                      showAddControls={false}
                      showRemoveButton={false}
                    />
                  </div>

                  <button
                    className="btn btn-secondary"
                    onClick={handleCreateTagGroup}
                    disabled={isCreatingGroup}
                  >
                    {isCreatingGroup ? "创建中..." : "创建 TagGroup"}
                  </button>
                </div>
              </section>
            </div>

          <section className="card bg-base-200 mt-4">
            <div className="card-body">
              <h4 className="card-title text-lg">已有 TagGroups</h4>
              <div className="overflow-x-auto">
                <table className="table table-zebra table-sm">
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>描述</th>
                      <th>Tags</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manageTagGroups.map((group, index) => (
                      <tr key={`${group.id}-${group.name}-${index}`}>
                        <td>{group.name}</td>
                        <td>{group.description || "-"}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {group.tags.map((tag, tagIndex) => (
                              <span
                                key={`${group.id}-${tag.id}-${tag.name}-${tagIndex}`}
                                className="badge badge-outline badge-sm"
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="btn btn-xs btn-outline"
                              onClick={() => handleStartEditGroup(group)}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-error btn-outline"
                              onClick={() => handleDeleteGroup(group)}
                              disabled={deletingGroupId === group.id}
                            >
                              {deletingGroupId === group.id
                                ? "删除中..."
                                : "删除"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      <dialog ref={editTagDialogRef} className="modal">
        <div className="modal-box max-w-lg">
          <h3 className="font-bold text-lg">编辑 Tag</h3>
          <div className="mt-4">
            <label className="floating-label">
              <input
                className="input input-bordered w-full"
                value={editingTagName}
                onChange={(e) => setEditingTagName(e.target.value)}
                placeholder="Tag 名称"
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) {
                    return;
                  }
                  event.preventDefault();
                  if (!isUpdatingTag) {
                    void handleSaveEditTag();
                  }
                }}
              />
              <span>Tag 名称</span>
            </label>
          </div>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleCancelEditTag}
              disabled={isUpdatingTag}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveEditTag}
              disabled={isUpdatingTag}
            >
              {isUpdatingTag ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={handleCancelEditTag}>close</button>
        </form>
      </dialog>

      <dialog
        ref={deleteTagConfirmDialogRef}
        className="modal"
        onKeyDown={handleDeleteTagDialogKeyDown}
      >
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg">确认删除 Tag</h3>
          <p className="py-3 text-sm">
            确认删除
            <span className="font-semibold">
              「{pendingDeleteTag?.name ?? ""}」
            </span>
            吗？
            <br />
            删除后会从关联的 TagGroup 中移除该标签。
          </p>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                deleteTagConfirmDialogRef.current?.close();
                setPendingDeleteTag(null);
              }}
              disabled={deletingTagId !== null}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={handleConfirmDeleteTag}
              disabled={deletingTagId !== null}
            >
              {deletingTagId !== null ? "删除中..." : "确认删除"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button
            onClick={() => {
              setPendingDeleteTag(null);
            }}
          >
            close
          </button>
        </form>
      </dialog>

      <dialog ref={editGroupDialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-3xl">
          <h4 className="card-title text-lg">编辑 TagGroup</h4>

          <div className="mt-4 grid gap-3">
            <label className="floating-label">
              <input
                className="input input-bordered w-full"
                value={editingGroupName}
                onChange={(e) => setEditingGroupName(e.target.value)}
                placeholder="TagGroup 名称"
              />
              <span>名称</span>
            </label>

            <label className="floating-label">
              <input
                className="input input-bordered w-full"
                value={editingGroupDescription}
                onChange={(e) => setEditingGroupDescription(e.target.value)}
                placeholder="分组描述（可留空）"
              />
              <span>描述</span>
            </label>

            <div>
              <h5 className="text-sm font-semibold mb-2">增删分组内 Tags</h5>
              <TagList
                tags={selectableEditTagItems}
                onToggleTag={(id) => {
                  const tagId = Number(id);
                  setEditingTagIds((prev) =>
                    prev.includes(tagId)
                      ? prev.filter((item) => item !== tagId)
                      : [...prev, tagId],
                  );
                }}
                onAddTag={() => {
                  // 编辑区仅做关联选择
                }}
                onRemoveTag={() => {
                  // 编辑区仅做关联选择
                }}
                showAddControls={false}
                showRemoveButton={false}
              />
            </div>

            <div className="modal-action mt-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleCancelEditGroup}
                disabled={isEditingGroup}
              >
                取消编辑
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveEditGroup}
                disabled={isEditingGroup}
              >
                {isEditingGroup ? "保存中..." : "保存 TagGroup 修改"}
              </button>
            </div>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={handleCancelEditGroup}>close</button>
        </form>
      </dialog>

      <dialog
        ref={deleteConfirmDialogRef}
        className="modal"
        onKeyDown={handleDeleteDialogKeyDown}
      >
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg">确认删除 TagGroup</h3>
          <p className="py-3 text-sm">
            确认删除
            <span className="font-semibold">
              「{pendingDeleteGroup?.name ?? ""}」
            </span>
            吗？
            <br />
            删除后会解除该分组与房间的关联。
          </p>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                deleteConfirmDialogRef.current?.close();
                setPendingDeleteGroup(null);
              }}
              disabled={deletingGroupId !== null}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={handleConfirmDeleteGroup}
              disabled={deletingGroupId !== null}
            >
              {deletingGroupId !== null ? "删除中..." : "确认删除"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button
            onClick={() => {
              setPendingDeleteGroup(null);
            }}
          >
            close
          </button>
        </form>
      </dialog>

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

      {/* 设置预热 BGM - 歌曲选择对话框 */}
      {isSettingTestAudio && (
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
      )}
    </div>
  );
};

export default RoomManagePage;
