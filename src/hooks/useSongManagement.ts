import { useCallback, useRef, useState } from "react";
import {
  getSongs,
  createSong,
  updateSong,
  deleteSong,
  type Song,
  type CreateSongRequest,
} from "../api/song";
import {
  getSonglists,
  getSonglistDetail,
  createSonglistFromPlatform,
  deleteSonglist,
  getSonglistTaskResult,
  type Songlist,
  type CreateSonglistFromPlatformRequest,
} from "../api/songlist";
import { addSongsToRoom } from "../api/room_songs";

const songPageSize = 10;
const songlistPageSize = 10;

interface UseSongManagementParams {
  roomid: string;
  loadRoomSongs: (page: number, kw?: string) => Promise<unknown>;
  roomSongSearchKw: string;
  setRoomSongsPage: (page: number) => void;
}

export function useSongManagement({
  roomid,
  loadRoomSongs,
  roomSongSearchKw,
  setRoomSongsPage,
}: UseSongManagementParams) {
  const songManageDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteSongConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteSonglistConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const pollingRef = useRef<number | null>(null);

  const [songManageTab, setSongManageTab] = useState<"songs" | "songlists">(
    "songs",
  );
  const [songs, setSongs] = useState<Song[]>([]);
  const [songlists, setSonglists] = useState<Songlist[]>([]);
  const [songPage, setSongPage] = useState(1);
  const [songTotal, setSongTotal] = useState(0);
  const [songlistPage, setSonglistPage] = useState(1);
  const [songlistTotal, setSonglistTotal] = useState(0);
  const [songSearchKw, setSongSearchKw] = useState("");
  const [songlistSearchKw, setSonglistSearchKw] = useState("");
  const [isSongManageLoading, setIsSongManageLoading] = useState(false);
  const [songManageError, setSongManageError] = useState<string | null>(null);
  const [songManageSuccess, setSongManageSuccess] = useState<string | null>(
    null,
  );

  const [newSong, setNewSong] = useState<CreateSongRequest>({});
  const [editingSongId, setEditingSongId] = useState<number | null>(null);
  const [editingSongData, setEditingSongData] = useState<CreateSongRequest>({});
  const [isCreatingSong, setIsCreatingSong] = useState(false);
  const [isUpdatingSong, setIsUpdatingSong] = useState(false);
  const [pendingDeleteSongId, setPendingDeleteSongId] = useState<number | null>(
    null,
  );
  const [confirmDeleteSongId, setConfirmDeleteSongId] = useState<number | null>(
    null,
  );

  const [newSonglistPlatform, setNewSonglistPlatform] = useState("qq");
  const [newSonglistPlatformId, setNewSonglistPlatformId] = useState("");
  const [newSonglistCookie, setNewSonglistCookie] = useState("");
  const [isCreatingSonglist, setIsCreatingSonglist] = useState(false);
  const [isPollingTask, setIsPollingTask] = useState(false);
  const [pendingDeleteSonglistId, setPendingDeleteSonglistId] = useState<
    number | null
  >(null);
  const [confirmDeleteSonglistId, setConfirmDeleteSonglistId] = useState<
    number | null
  >(null);

  const [bindSonglistId, setBindSonglistId] = useState<number | null>(null);
  const [isBindingSonglist, setIsBindingSonglist] = useState(false);

  const [addSingleSongId, setAddSingleSongId] = useState<number | null>(null);
  const [isAddingSingleSong, setIsAddingSingleSong] = useState(false);

  const loadSongs = useCallback(
    async (page = songPage, kw?: string) => {
      try {
        const { list, total } = await getSongs({
          offset: (page - 1) * songPageSize,
          limit: songPageSize,
          kw: kw || undefined,
        });
        setSongs(list);
        setSongTotal(total);
      } catch (err) {
        setSongManageError((err as Error).message || "加载歌曲列表失败");
      }
    },
    [songPage],
  );

  const loadSonglists = useCallback(
    async (page = songlistPage, kw?: string) => {
      try {
        const offset = (page - 1) * songlistPageSize;
        const { list, total } = await getSonglists({
          offset,
          limit: songlistPageSize,
          kw: kw || undefined,
        });
        setSonglists(list);
        setSonglistTotal(total);
      } catch (err) {
        setSongManageError((err as Error).message || "加载歌单列表失败");
      }
    },
    [songlistPage],
  );

  const songHasPrev = songPage > 1;
  const songTotalPages = Math.max(1, Math.ceil(songTotal / songPageSize));
  const songHasNext = songPage < songTotalPages;
  const songlistHasPrev = songlistPage > 1;
  const songlistTotalPages = Math.max(
    1,
    Math.ceil(songlistTotal / songlistPageSize),
  );
  const songlistHasNext = songlistPage < songlistTotalPages;

  const handleSongPageChange = async (nextPage: number) => {
    if (nextPage < 1 || nextPage === songPage) return;
    setSongPage(nextPage);
    await loadSongs(nextPage, songSearchKw);
  };

  const handleSonglistPageChange = async (nextPage: number) => {
    if (nextPage < 1 || nextPage === songlistPage) return;
    setSonglistPage(nextPage);
    await loadSonglists(nextPage, songlistSearchKw);
  };

  const handleOpenSongManageDialog = async (tab?: "songs" | "songlists") => {
    const activeTab = tab ?? songManageTab;
    if (tab) {
      setSongManageTab(tab);
    }
    songManageDialogRef.current?.showModal();
    setSongManageSuccess(null);
    setSongManageError(null);
    setIsSongManageLoading(true);
    try {
      if (activeTab === "songlists") {
        setSonglistPage(1);
        setSonglistTotal(0);
        await loadSonglists(1, songlistSearchKw);
      } else {
        setSongPage(1);
        setSongTotal(0);
        await loadSongs(1, songSearchKw);
      }
    } catch (err) {
      setSongManageError((err as Error).message || "加载歌曲管理数据失败");
    } finally {
      setIsSongManageLoading(false);
    }
  };

  const handleCreateSong = async () => {
    if (!newSong.title?.trim()) {
      setSongManageError("歌曲标题不能为空");
      return;
    }
    setIsCreatingSong(true);
    setSongManageError(null);
    setSongManageSuccess(null);
    try {
      await createSong(roomid, newSong);
      setNewSong({});
      setSongManageSuccess("歌曲创建成功");
      if (songPage !== 1) {
        setSongPage(1);
      }
      await loadSongs(1, songSearchKw);
    } catch (err) {
      setSongManageError((err as Error).message || "创建歌曲失败");
    } finally {
      setIsCreatingSong(false);
    }
  };

  const handleStartEditSong = (song: Song) => {
    setEditingSongId(song.id);
    setEditingSongData({
      platform: song.platform ?? undefined,
      platform_song_id: song.platform_song_id ?? undefined,
      title: song.title ?? undefined,
      subtitle: song.subtitle ?? undefined,
      artist: song.artist ?? undefined,
      album_name: song.album_name ?? undefined,
      album_id: song.album_id ?? undefined,
      cover_url: song.cover_url ?? undefined,
      audio_url: song.audio_url ?? undefined,
      cached_path: song.cached_path ?? undefined,
      metadata_json: song.metadata_json ?? undefined,
    });
    setSongManageError(null);
    setSongManageSuccess(null);
  };

  const handleCancelEditSong = () => {
    setEditingSongId(null);
    setEditingSongData({});
  };

  const handleSaveEditSong = async () => {
    if (!editingSongId) return;
    if (!editingSongData.title?.trim()) {
      setSongManageError("歌曲标题不能为空");
      return;
    }
    setIsUpdatingSong(true);
    setSongManageError(null);
    setSongManageSuccess(null);
    try {
      await updateSong(roomid, editingSongId, editingSongData);
      setSongManageSuccess("歌曲更新成功");
      handleCancelEditSong();
      await loadSongs(songPage, songSearchKw);
    } catch (err) {
      setSongManageError((err as Error).message || "更新歌曲失败");
    } finally {
      setIsUpdatingSong(false);
    }
  };

  const handleDeleteSong = (songId: number) => {
    setConfirmDeleteSongId(songId);
    deleteSongConfirmDialogRef.current?.showModal();
  };

  const handleConfirmDeleteSong = async () => {
    if (!confirmDeleteSongId) return;

    setPendingDeleteSongId(confirmDeleteSongId);
    setSongManageError(null);
    setSongManageSuccess(null);
    try {
      await deleteSong(roomid, confirmDeleteSongId);
      setSongManageSuccess("歌曲删除成功");
      await loadSongs(songPage, songSearchKw);
    } catch (err) {
      setSongManageError((err as Error).message || "删除歌曲失败");
    } finally {
      setPendingDeleteSongId(null);
      deleteSongConfirmDialogRef.current?.close();
      setConfirmDeleteSongId(null);
    }
  };

  const handleCreateSonglist = async () => {
    if (!newSonglistPlatformId.trim()) {
      setSongManageError("歌单平台ID不能为空");
      return;
    }
    setIsCreatingSonglist(true);
    setSongManageError(null);
    setSongManageSuccess(null);
    try {
      const payload: CreateSonglistFromPlatformRequest = {
        platform: newSonglistPlatform,
        platform_songlist_id: newSonglistPlatformId,
        cookie_str: newSonglistCookie || undefined,
      };
      const { task_id } = await createSonglistFromPlatform(roomid, payload);
      setSongManageSuccess(`歌单创建任务已提交，正在爬取...`);
      setNewSonglistPlatformId("");
      setNewSonglistCookie("");
      setIsCreatingSonglist(false);
      setIsPollingTask(true);

      const pollTask = async () => {
        try {
          const result = await getSonglistTaskResult(task_id);
          if (result.status === "finished" || result.status === "success") {
            setSongManageSuccess("歌单导入完成");
            setIsPollingTask(false);
            if (pollingRef.current !== null) {
              window.clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            if (songlistPage !== 1) {
              setSonglistPage(1);
            }
            await loadSonglists(1, songlistSearchKw);
          } else if (result.status === "failed") {
            setSongManageError("歌单导入任务失败");
            setIsPollingTask(false);
            if (pollingRef.current !== null) {
              window.clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
        } catch (err) {
          setSongManageError(
            (err as Error).message || "查询任务状态失败",
          );
          setIsPollingTask(false);
          if (pollingRef.current !== null) {
            window.clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      };

      await pollTask();
      pollingRef.current = window.setInterval(() => {
        void pollTask();
      }, 2000);
    } catch (err) {
      setSongManageError((err as Error).message || "创建歌单失败");
    } finally {
      setIsCreatingSonglist(false);
    }
  };

  const handleDeleteSonglist = (songlistId: number) => {
    setConfirmDeleteSonglistId(songlistId);
    deleteSonglistConfirmDialogRef.current?.showModal();
  };

  const handleConfirmDeleteSonglist = async () => {
    if (!confirmDeleteSonglistId) return;

    setPendingDeleteSonglistId(confirmDeleteSonglistId);
    setSongManageError(null);
    setSongManageSuccess(null);
    try {
      await deleteSonglist(roomid, confirmDeleteSonglistId);
      setSongManageSuccess("歌单删除成功");
      await loadSonglists(songlistPage, songlistSearchKw);
    } catch (err) {
      setSongManageError((err as Error).message || "删除歌单失败");
    } finally {
      setPendingDeleteSonglistId(null);
      deleteSonglistConfirmDialogRef.current?.close();
      setConfirmDeleteSonglistId(null);
    }
  };

  const handleAddSingleSongToRoom = async () => {
    if (!addSingleSongId || !roomid) return;
    setIsAddingSingleSong(true);
    setSongManageError(null);
    setSongManageSuccess(null);
    try {
      await addSongsToRoom(roomid, {
        song_ids: [addSingleSongId],
        append_to_end: true,
      });
      setSongManageSuccess("单曲已添加到房间队列");
      setAddSingleSongId(null);
      setRoomSongsPage(1);
      await loadRoomSongs(1, roomSongSearchKw);
    } catch (err) {
      setSongManageError((err as Error).message || "添加单曲到房间失败");
    } finally {
      setIsAddingSingleSong(false);
    }
  };

  const handleBindSonglistToRoom = async () => {
    if (!bindSonglistId || !roomid) return;
    setIsBindingSonglist(true);
    setSongManageError(null);
    setSongManageSuccess(null);
    try {
      const songlistDetail = await getSonglistDetail(bindSonglistId);
      if (!songlistDetail.songs || songlistDetail.songs.length === 0) {
        setSongManageError("该歌单中没有歌曲");
        return;
      }
      const songIds = songlistDetail.songs.map((song) => song.id);
      await addSongsToRoom(roomid, {
        song_ids: songIds,
        append_to_end: true,
      });
      setSongManageSuccess(
        `歌单 "${songlistDetail.title || "未命名歌单"}" 已绑定到房间，添加了 ${songIds.length} 首歌曲`,
      );
      setBindSonglistId(null);
      setRoomSongsPage(1);
      await loadRoomSongs(1, roomSongSearchKw);
    } catch (err) {
      setSongManageError((err as Error).message || "绑定歌单到房间失败");
    } finally {
      setIsBindingSonglist(false);
    }
  };

  return {
    // Refs
    songManageDialogRef,
    deleteSongConfirmDialogRef,
    deleteSonglistConfirmDialogRef,
    pollingRef,
    // Song manage state
    songManageTab,
    setSongManageTab,
    isSongManageLoading,
    songManageError,
    setSongManageError,
    songManageSuccess,
    setSongManageSuccess,
    // Songs list state
    songs,
    setSongs,
    songPage,
    setSongPage,
    songTotal,
    songSearchKw,
    setSongSearchKw,
    songHasPrev,
    songTotalPages,
    songHasNext,
    // Songlists state
    songlists,
    setSonglists,
    songlistPage,
    setSonglistPage,
    songlistTotal,
    songlistSearchKw,
    setSonglistSearchKw,
    songlistHasPrev,
    songlistTotalPages,
    songlistHasNext,
    // Song form state
    newSong,
    setNewSong,
    editingSongId,
    setEditingSongId,
    editingSongData,
    setEditingSongData,
    isCreatingSong,
    isUpdatingSong,
    pendingDeleteSongId,
    confirmDeleteSongId,
    setConfirmDeleteSongId,
    // Songlist form state
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
    // Bind/add state
    bindSonglistId,
    setBindSonglistId,
    isBindingSonglist,
    addSingleSongId,
    setAddSingleSongId,
    isAddingSingleSong,
    // Loaders
    loadSongs,
    loadSonglists,
    // Pagination handlers
    handleSongPageChange,
    handleSonglistPageChange,
    // Action handlers
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
  };
}
