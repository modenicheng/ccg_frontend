import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icon } from "@iconify-icon/react";
import { TagList } from "../components";
import { ConfirmActionDialogs } from "../components/ConfirmActionDialogs";
import { SongManageDialog } from "../components/SongManageDialog";
import { TagManageDialog } from "../components/TagManageDialog";
import { TestAudioModal } from "../components/TestAudioModal";
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
    groupTagIds,
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
    editingTagIds,
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

      <TagManageDialog
        manageDialogRef={manageDialogRef}
        editTagDialogRef={editTagDialogRef}
        deleteTagConfirmDialogRef={deleteTagConfirmDialogRef}
        newTagInputRef={newTagInputRef}
        manageTags={manageTags}
        manageTagGroups={manageTagGroups}
        newTagName={newTagName}
        setNewTagName={setNewTagName}
        newGroupName={newGroupName}
        setNewGroupName={setNewGroupName}
        newGroupDescription={newGroupDescription}
        setNewGroupDescription={setNewGroupDescription}
        groupTagIds={groupTagIds}
        setGroupTagIds={setGroupTagIds}
        isManageLoading={isManageLoading}
        isCreatingTag={isCreatingTag}
        isUpdatingTag={isUpdatingTag}
        deletingTagId={deletingTagId}
        isCreatingGroup={isCreatingGroup}
        isEditingGroup={isEditingGroup}
        deletingGroupId={deletingGroupId}
        editingTagName={editingTagName}
        setEditingTagName={setEditingTagName}
        pendingDeleteTag={pendingDeleteTag}
        setPendingDeleteTag={setPendingDeleteTag}
        pendingDeleteGroup={pendingDeleteGroup}
        editingGroupName={editingGroupName}
        editingGroupDescription={editingGroupDescription}
        editingTagIds={editingTagIds}
        handleNewTagKeyDown={handleNewTagKeyDown}
        handleCreateTag={handleCreateTag}
        handleStartEditTag={handleStartEditTag}
        handleCancelEditTag={handleCancelEditTag}
        handleSaveEditTag={handleSaveEditTag}
        handleDeleteTag={handleDeleteTag}
        handleConfirmDeleteTag={handleConfirmDeleteTag}
        handleDeleteTagDialogKeyDown={handleDeleteTagDialogKeyDown}
        handleCreateTagGroup={handleCreateTagGroup}
        handleStartEditGroup={handleStartEditGroup}
        handleDeleteGroup={handleDeleteGroup}
        selectableTagItems={selectableTagItems}
      />

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

      <SongManageDialog
        songManageDialogRef={songManageDialogRef}
        deleteSongConfirmDialogRef={deleteSongConfirmDialogRef}
        deleteSonglistConfirmDialogRef={deleteSonglistConfirmDialogRef}
        songManageTab={songManageTab}
        setSongManageTab={setSongManageTab}
        isSongManageLoading={isSongManageLoading}
        songs={songs}
        songPage={songPage}
        setSongPage={setSongPage}
        songTotalPages={songTotalPages}
        songSearchKw={songSearchKw}
        setSongSearchKw={setSongSearchKw}
        songHasPrev={songHasPrev}
        songHasNext={songHasNext}
        songlists={songlists}
        songlistPage={songlistPage}
        setSonglistPage={setSonglistPage}
        songlistTotalPages={songlistTotalPages}
        songlistSearchKw={songlistSearchKw}
        setSonglistSearchKw={setSonglistSearchKw}
        songlistHasPrev={songlistHasPrev}
        songlistHasNext={songlistHasNext}
        newSong={newSong}
        setNewSong={setNewSong}
        editingSongId={editingSongId}
        editingSongData={editingSongData}
        setEditingSongData={setEditingSongData}
        isCreatingSong={isCreatingSong}
        isUpdatingSong={isUpdatingSong}
        pendingDeleteSongId={pendingDeleteSongId}
        confirmDeleteSongId={confirmDeleteSongId}
        setConfirmDeleteSongId={setConfirmDeleteSongId}
        newSonglistPlatform={newSonglistPlatform}
        setNewSonglistPlatform={setNewSonglistPlatform}
        newSonglistPlatformId={newSonglistPlatformId}
        setNewSonglistPlatformId={setNewSonglistPlatformId}
        newSonglistCookie={newSonglistCookie}
        setNewSonglistCookie={setNewSonglistCookie}
        isCreatingSonglist={isCreatingSonglist}
        isPollingTask={isPollingTask}
        pendingDeleteSonglistId={pendingDeleteSonglistId}
        confirmDeleteSonglistId={confirmDeleteSonglistId}
        setConfirmDeleteSonglistId={setConfirmDeleteSonglistId}
        bindSonglistId={bindSonglistId}
        setBindSonglistId={setBindSonglistId}
        isBindingSonglist={isBindingSonglist}
        addSingleSongId={addSingleSongId}
        setAddSingleSongId={setAddSingleSongId}
        isAddingSingleSong={isAddingSingleSong}
        loadSongs={loadSongs}
        loadSonglists={loadSonglists}
        handleSongPageChange={handleSongPageChange}
        handleSonglistPageChange={handleSonglistPageChange}
        handleCreateSong={handleCreateSong}
        handleStartEditSong={handleStartEditSong}
        handleCancelEditSong={handleCancelEditSong}
        handleSaveEditSong={handleSaveEditSong}
        handleDeleteSong={handleDeleteSong}
        handleConfirmDeleteSong={handleConfirmDeleteSong}
        handleCreateSonglist={handleCreateSonglist}
        handleDeleteSonglist={handleDeleteSonglist}
        handleConfirmDeleteSonglist={handleConfirmDeleteSonglist}
        handleAddSingleSongToRoom={handleAddSingleSongToRoom}
        handleBindSonglistToRoom={handleBindSonglistToRoom}
      />

      <ConfirmActionDialogs
        endGameConfirmDialogRef={endGameConfirmDialogRef}
        dissolveRoomConfirmDialogRef={dissolveRoomConfirmDialogRef}
        clearRoomSongsConfirmDialogRef={clearRoomSongsConfirmDialogRef}
        handleConfirmEndGame={handleConfirmEndGame}
        handleConfirmDissolveRoom={handleConfirmDissolveRoom}
        handleClearRoomSongs={handleClearRoomSongs}
      />

      <TestAudioModal
        isSettingTestAudio={isSettingTestAudio}
        setIsSettingTestAudio={setIsSettingTestAudio}
        testAudioSearchKw={testAudioSearchKw}
        setTestAudioSearchKw={setTestAudioSearchKw}
        testAudioSongs={testAudioSongs}
        testAudioSongsTotal={testAudioSongsTotal}
        testAudioSongsPage={testAudioSongsPage}
        setTestAudioSongsPage={setTestAudioSongsPage}
        isLoadingTestAudioSongs={isLoadingTestAudioSongs}
        isSwitchingTestAudio={isSwitchingTestAudio}
        testAudioTaskId={testAudioTaskId}
        testAudioTaskStatus={testAudioTaskStatus}
        testAudioTargetSongId={testAudioTargetSongId}
        loadTestAudioSongs={loadTestAudioSongs}
        handleTestAudioSongsPageChange={handleTestAudioSongsPageChange}
        handleSetTestAudio={handleSetTestAudio}
        roomSongsPageSize={roomSongsPageSize}
      />
    </div>
  );
};

export default RoomManagePage;
