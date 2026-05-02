import { useCallback, useEffect, useRef, useState } from "react";
import {
  getRoomSongs,
  removeSongsFromRoom,
  clearRoomSongs,
  shuffleRoomSongs,
  type RoomSong,
} from "../api/room_songs";

interface UseRoomSongsManagementOptions {
  roomid: string;
}

export function useRoomSongsManagement({ roomid }: UseRoomSongsManagementOptions) {
  const [roomSongs, setRoomSongs] = useState<RoomSong[]>([]);
  const [roomSongsPage, setRoomSongsPage] = useState(1);
  const [roomSongsTotal, setRoomSongsTotal] = useState(0);
  const [isLoadingRoomSongs, setIsLoadingRoomSongs] = useState(false);
  const [roomSongsError, setRoomSongsError] = useState<string | null>(null);
  const [roomSongsSuccess, setRoomSongsSuccess] = useState<string | null>(null);
  const [selectedRoomSongIds, setSelectedRoomSongIds] = useState<number[]>([]);
  const [isShufflingRoomSongs, setIsShufflingRoomSongs] = useState(false);
  const [roomSongSearchKw, setRoomSongSearchKw] = useState("");

  const roomSongsPageSize = 10;

  const clearRoomSongsConfirmDialogRef = useRef<HTMLDialogElement | null>(null);

  const loadRoomSongs = useCallback(
    async (page: number, kw?: string) => {
      if (!roomid) return;
      setIsLoadingRoomSongs(true);
      setRoomSongsError(null);
      try {
        const data = await getRoomSongs(roomid, {
          offset: (page - 1) * roomSongsPageSize,
          limit: roomSongsPageSize,
          kw: kw || undefined,
        });
        setRoomSongs(data.list);
        setRoomSongsTotal(data.total);
        setSelectedRoomSongIds((prev) =>
          prev.filter((id) => data.list.some((song) => song.song_id === id)),
        );
        return data;
      } catch (err) {
        setRoomSongsError((err as Error).message || "加载房间歌曲失败");
      } finally {
        setIsLoadingRoomSongs(false);
      }
    },
    [roomid],
  );

  const roomSongsHasPrev = roomSongsPage > 1;
  const roomSongsTotalPages = Math.max(
    1,
    Math.ceil(roomSongsTotal / roomSongsPageSize),
  );
  const roomSongsHasNext = roomSongsPage < roomSongsTotalPages;

  const handleRoomSongsPageChange = async (nextPage: number) => {
    if (nextPage < 1 || nextPage === roomSongsPage) return;
    setRoomSongsPage(nextPage);
    await loadRoomSongs(nextPage, roomSongSearchKw);
  };

  const handleRemoveSongsFromRoom = async (songIds: number[]) => {
    if (!roomid || songIds.length === 0) return;
    setRoomSongsError(null);
    setRoomSongsSuccess(null);
    try {
      await removeSongsFromRoom(roomid, {
        song_ids: songIds,
      });
      setRoomSongsSuccess(`${songIds.length}首歌曲已从房间移除`);
      setSelectedRoomSongIds([]);
      const currentPage = roomSongsPage;
      const data = await loadRoomSongs(currentPage, roomSongSearchKw);
      if (data && data.list.length === 0 && currentPage > 1) {
        const prevPage = currentPage - 1;
        setRoomSongsPage(prevPage);
        await loadRoomSongs(prevPage, roomSongSearchKw);
      }
    } catch (err) {
      setRoomSongsError((err as Error).message || "从房间移除歌曲失败");
    }
  };

  const handleOpenClearRoomSongsConfirm = () => {
    clearRoomSongsConfirmDialogRef.current?.showModal();
  };

  const handleClearRoomSongs = async () => {
    if (!roomid) return;
    setRoomSongsError(null);
    setRoomSongsSuccess(null);
    try {
      await clearRoomSongs(roomid);
      setRoomSongsSuccess("房间歌曲已清空");
      setSelectedRoomSongIds([]);
      setRoomSongsPage(1);
      await loadRoomSongs(1, roomSongSearchKw);
    } catch (err) {
      setRoomSongsError((err as Error).message || "清空房间歌曲失败");
    } finally {
      clearRoomSongsConfirmDialogRef.current?.close();
    }
  };

  const handleShuffleRoomSongs = async () => {
    if (!roomid) return;
    setIsShufflingRoomSongs(true);
    setRoomSongsError(null);
    setRoomSongsSuccess(null);
    try {
      await shuffleRoomSongs(roomid);
      setRoomSongsSuccess("房间歌曲已随机打乱");
      setSelectedRoomSongIds([]);
      setRoomSongsPage(1);
      await loadRoomSongs(1, roomSongSearchKw);
    } catch (err) {
      setRoomSongsError((err as Error).message || "打乱房间歌曲失败");
    } finally {
      setIsShufflingRoomSongs(false);
    }
  };

  const toggleRoomSongSelection = (songId: number) => {
    setSelectedRoomSongIds((prev) =>
      prev.includes(songId)
        ? prev.filter((id) => id !== songId)
        : [...prev, songId],
    );
  };

  const handleSelectAllRoomSongs = () => {
    if (!roomSongs || !Array.isArray(roomSongs)) return;
    if (selectedRoomSongIds.length === roomSongs.length) {
      setSelectedRoomSongIds([]);
    } else {
      setSelectedRoomSongIds(roomSongs.map((song) => song.song_id));
    }
  };

  useEffect(() => {
    if (!roomSongsError && !roomSongsSuccess) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRoomSongsError(null);
      setRoomSongsSuccess(null);
    }, 5_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [roomSongsError, roomSongsSuccess]);

  return {
    roomSongs,
    setRoomSongs,
    roomSongsPage,
    setRoomSongsPage,
    roomSongsTotal,
    setRoomSongsTotal,
    isLoadingRoomSongs,
    roomSongsError,
    setRoomSongsError,
    roomSongsSuccess,
    setRoomSongsSuccess,
    selectedRoomSongIds,
    setSelectedRoomSongIds,
    isShufflingRoomSongs,
    roomSongsPageSize,
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
  };
}
