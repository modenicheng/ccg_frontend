import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icon } from "@iconify-icon/react";
import { TagList } from "../components";
import { gameStore, useGameStore } from "../stores/gameStore";
import type { RoomState } from "../types/store";
import useWebSocketStore from "../stores/webSocketStore";
import { getRoomInfo, patchRoomInfo, type RoomInfoResponse } from "../api/room";
import {
  createTagGroup,
  createTags,
  deleteTag,
  deleteTagGroup,
  getTagGroups,
  getTags,
  patchTagGroup,
  updateTag,
  type Tag,
  type TagGroup,
} from "../api/tags";
import { GameEventId } from "../types/eventTypes";
import type { TagItem } from "../types/tag";
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
import {
  getRoomSongs,
  addSongsToRoom,
  removeSongsFromRoom,
  clearRoomSongs,
  shuffleRoomSongs,
  type RoomSong,
} from "../api/room_songs";
import useErrorToastStore from "../stores/errorToastStore";
import usePersistStore from "../stores/persistStore";

const readCookie = (name: string): string | null => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matched = document.cookie.match(
    new RegExp(`(?:^|; )${escaped}=([^;]*)`),
  );
  if (!matched) {
    return null;
  }
  try {
    return decodeURIComponent(matched[1]);
  } catch {
    return matched[1];
  }
};

function mapRoomInfoToRoomState(data: RoomInfoResponse): RoomState {
  const statusCode = data.status === "playing" ? 1 : data.status === "ended" ? 2 : 0;
  return {
    roomId: data.roomId,
    title: data.title ?? null,
    status: data.status,
    statusCode,
    roundState: data.roundState ?? "PENDING",
    roundStateCode: data.roundStateCode ?? 0,
    song_start_range_percent: null,
    players: [], // full player objects not available
    answer_queue: [],
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

  const manageDialogRef = useRef<HTMLDialogElement | null>(null);
  const editGroupDialogRef = useRef<HTMLDialogElement | null>(null);
  const editTagDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteTagConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteSongConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteSonglistConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const clearRoomSongsConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const [manageTags, setManageTags] = useState<Tag[]>([]);
  const [manageTagGroups, setManageTagGroups] = useState<TagGroup[]>([]);
  const [groupTagIds, setGroupTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [isManageLoading, setIsManageLoading] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isUpdatingTag, setIsUpdatingTag] = useState(false);
  const [deletingTagId, setDeletingTagId] = useState<number | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<TagGroup | null>(
    null,
  );
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageSuccess, setManageSuccess] = useState<string | null>(null);

  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [pendingDeleteTag, setPendingDeleteTag] = useState<Tag | null>(null);

  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingGroupDescription, setEditingGroupDescription] = useState("");
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);
  const [initialEditingTagIds, setInitialEditingTagIds] = useState<number[]>(
    [],
  );
  const [initialEditingGroupName, setInitialEditingGroupName] = useState("");
  const [initialEditingGroupDescription, setInitialEditingGroupDescription] =
    useState("");

  // 歌曲管理状态
  const songManageDialogRef = useRef<HTMLDialogElement | null>(null);
  const [songManageTab, setSongManageTab] = useState<"songs" | "songlists">(
    "songs",
  );
  const [songs, setSongs] = useState<Song[]>([]);
  const [songlists, setSonglists] = useState<Songlist[]>([]);
  const [songPage, setSongPage] = useState(1);
  const [songTotal, setSongTotal] = useState(0);
  const [songlistPage, setSonglistPage] = useState(1);
  const [songlistTotal, setSonglistTotal] = useState(0);
  const songPageSize = 10;
  const songlistPageSize = 10;
  const [songSearchKw, setSongSearchKw] = useState("");
  const [songlistSearchKw, setSonglistSearchKw] = useState("");
  const [roomSongSearchKw, setRoomSongSearchKw] = useState("");
  const [isSongManageLoading, setIsSongManageLoading] = useState(false);
  const [songManageError, setSongManageError] = useState<string | null>(null);
  const [songManageSuccess, setSongManageSuccess] = useState<string | null>(
    null,
  );
  // 歌曲表单
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
  // 歌单表单
  const [newSonglistPlatform, setNewSonglistPlatform] = useState("qq");
  const [newSonglistPlatformId, setNewSonglistPlatformId] = useState("");
  const [newSonglistCookie, setNewSonglistCookie] = useState("");
  const [isCreatingSonglist, setIsCreatingSonglist] = useState(false);
  const [isPollingTask, setIsPollingTask] = useState(false);
  const pollingRef = useRef<number | null>(null);
  const [pendingDeleteSonglistId, setPendingDeleteSonglistId] = useState<
    number | null
  >(null);
  const [confirmDeleteSonglistId, setConfirmDeleteSonglistId] = useState<
    number | null
  >(null);
  // 绑定歌单到房间
  const [bindSonglistId, setBindSonglistId] = useState<number | null>(null);
  const [isBindingSonglist, setIsBindingSonglist] = useState(false);
  // 添加单曲到房间
  const [addSingleSongId, setAddSingleSongId] = useState<number | null>(null);
  const [isAddingSingleSong, setIsAddingSingleSong] = useState(false);

  // 房间歌曲状态
  const [roomSongs, setRoomSongs] = useState<RoomSong[]>([]);
  const [roomSongsPage, setRoomSongsPage] = useState(1);
  const [roomSongsTotal, setRoomSongsTotal] = useState(0);
  const [isLoadingRoomSongs, setIsLoadingRoomSongs] = useState(false);
  const [roomSongsError, setRoomSongsError] = useState<string | null>(null);
  const [roomSongsSuccess, setRoomSongsSuccess] = useState<string | null>(null);
  const [selectedRoomSongIds, setSelectedRoomSongIds] = useState<number[]>([]);
  const [isShufflingRoomSongs, setIsShufflingRoomSongs] = useState(false);
  const roomSongsPageSize = 10;

  // 玩家管理状态
  const [players, setPlayers] = useState<Array<{ id: number; username: string; is_owner: boolean }>>([]);
  const [isKicking, setIsKicking] = useState<number | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);
  const [kickSuccess, setKickSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (roomid) {
      const roomTitle = title || roomState?.title;
      document.title = roomTitle
        ? `CCG - 管理${roomTitle}|${roomid}`
        : `CCG - 管理${roomid}`;
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
  const roomSongsHasPrev = roomSongsPage > 1;
  const roomSongsTotalPages = Math.max(
    1,
    Math.ceil(roomSongsTotal / roomSongsPageSize),
  );
  const roomSongsHasNext = roomSongsPage < roomSongsTotalPages;

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

  const handleRoomSongsPageChange = async (nextPage: number) => {
    if (nextPage < 1 || nextPage === roomSongsPage) return;
    setRoomSongsPage(nextPage);
    await loadRoomSongs(nextPage, roomSongSearchKw);
  };

  const loadManageData = useCallback(async () => {
    setIsManageLoading(true);
    setManageError(null);
    try {
      const [allTags, allGroups] = await Promise.all([
        getTags(),
        getTagGroups(),
      ]);
      setManageTags(allTags);
      setManageTagGroups(allGroups);
      setTagGroups(allGroups);

      const validTagIds = new Set(allTags.map((tag) => tag.id));
      setGroupTagIds((prev) => prev.filter((id) => validTagIds.has(id)));
      setEditingTagIds((prev) => prev.filter((id) => validTagIds.has(id)));
      setInitialEditingTagIds((prev) =>
        prev.filter((id) => validTagIds.has(id)),
      );
    } catch (err) {
      setManageError((err as Error).message || "加载 Tag 管理数据失败");
    } finally {
      setIsManageLoading(false);
    }
  }, []);

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
    };
  }, []);

  useEffect(() => {
    if (!manageError && !manageSuccess) {
      return;
    }

    const timer = window.setTimeout(() => {
      setManageError(null);
      setManageSuccess(null);
    }, 5_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [manageError, manageSuccess]);

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

  useEffect(() => {
    if (!manageError) {
      return;
    }
    pushToast({ message: manageError, variant: "error" });
  }, [manageError, pushToast]);

  useEffect(() => {
    if (!manageSuccess) {
      return;
    }
    pushToast({ message: manageSuccess, variant: "success" });
  }, [manageSuccess, pushToast]);

  useEffect(() => {
    if (!error) {
      return;
    }
    pushToast({ message: error, variant: "error" });
  }, [error, pushToast]);

  useEffect(() => {
    if (!success) {
      return;
    }
    pushToast({ message: success, variant: "success" });
  }, [success, pushToast]);

  useEffect(() => {
    if (!roomSongsError) {
      return;
    }
    pushToast({ message: roomSongsError, variant: "error" });
  }, [roomSongsError, pushToast]);

  useEffect(() => {
    if (!roomSongsSuccess) {
      return;
    }
    pushToast({ message: roomSongsSuccess, variant: "success" });
  }, [roomSongsSuccess, pushToast]);

  useEffect(() => {
    if (!kickError) {
      return;
    }
    pushToast({ message: kickError, variant: "error" });
  }, [kickError, pushToast]);

  useEffect(() => {
    if (!kickSuccess) {
      return;
    }
    pushToast({ message: kickSuccess, variant: "success" });
  }, [kickSuccess, pushToast]);

  useEffect(() => {
    if (!songManageError) {
      return;
    }
    pushToast({ message: songManageError, variant: "error" });
  }, [songManageError, pushToast]);

  useEffect(() => {
    if (!songManageSuccess) {
      return;
    }
    pushToast({ message: songManageSuccess, variant: "success" });
  }, [songManageSuccess, pushToast]);

  const hasChanges = useMemo(() => {
    const titleChanged = title.trim() !== initialTitle.trim();
    const selectedChanged =
      [...selectedTagGroupIds].sort((a, b) => a - b).join(",") !==
      [...initialSelectedIds].sort((a, b) => a - b).join(",");
    return titleChanged || selectedChanged;
  }, [initialSelectedIds, initialTitle, selectedTagGroupIds, title]);

  const toggleTagGroup = (id: number) => {
    setSelectedTagGroupIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectableTagItems = useMemo<TagItem[]>(
    () =>
      manageTags.map((tag) => ({
        id: String(tag.id),
        name: tag.name,
        selected: groupTagIds.includes(tag.id),
        canClose: false,
      })),
    [groupTagIds, manageTags],
  );

  const selectableEditTagItems = useMemo<TagItem[]>(
    () =>
      manageTags.map((tag) => ({
        id: String(tag.id),
        name: tag.name,
        selected: editingTagIds.includes(tag.id),
        canClose: false,
      })),
    [editingTagIds, manageTags],
  );

  const uniquePlayers = useMemo(() => {
    const seen = new Set<number>();
    return players.filter((player) => {
      if (seen.has(player.id)) {
        return false;
      }
      seen.add(player.id);
      return true;
    });
  }, [players]);

  const handleOpenManageDialog = async () => {
    manageDialogRef.current?.showModal();
    setManageSuccess(null);
    await loadManageData();
  };

  const handleCreateTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setManageError("Tag 名称不能为空");
      return;
    }

    setIsCreatingTag(true);
    setManageError(null);
    setManageSuccess(null);
    try {
      await createTags([trimmed]);
      setNewTagName("");
      setManageSuccess("Tag 创建成功");
      await loadManageData();
    } catch (err) {
      setManageError((err as Error).message || "创建 Tag 失败");
    } finally {
      setIsCreatingTag(false);
    }
  };

  const handleStartEditTag = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
    setManageError(null);
    setManageSuccess(null);
    editTagDialogRef.current?.showModal();
  };

  const handleCancelEditTag = () => {
    editTagDialogRef.current?.close();
    setEditingTagId(null);
    setEditingTagName("");
  };

  const handleSaveEditTag = async () => {
    if (!editingTagId) {
      return;
    }

    const trimmedName = editingTagName.trim();
    if (!trimmedName) {
      setManageError("Tag 名称不能为空");
      return;
    }

    setIsUpdatingTag(true);
    setManageError(null);
    setManageSuccess(null);
    try {
      const updatedTag = await updateTag(editingTagId, trimmedName);
      await loadManageData();
      setManageSuccess(`Tag「${updatedTag.name}」已更新`);
      handleCancelEditTag();
    } catch (err) {
      setManageError((err as Error).message || "更新 Tag 失败");
    } finally {
      setIsUpdatingTag(false);
    }
  };

  const handleDeleteTag = (tag: Tag) => {
    setPendingDeleteTag(tag);
    deleteTagConfirmDialogRef.current?.showModal();
  };

  const handleConfirmDeleteTag = async () => {
    if (!pendingDeleteTag) {
      return;
    }

    const tag = pendingDeleteTag;
    setDeletingTagId(tag.id);
    setManageError(null);
    setManageSuccess(null);
    try {
      await deleteTag(tag.id);
      await loadManageData();

      if (editingTagId === tag.id) {
        handleCancelEditTag();
      }

      setManageSuccess(`Tag「${tag.name}」已删除`);
      deleteTagConfirmDialogRef.current?.close();
      setPendingDeleteTag(null);
    } catch (err) {
      setManageError((err as Error).message || "删除 Tag 失败");
    } finally {
      setDeletingTagId(null);
    }
  };

  const handleDeleteTagDialogKeyDown = (
    event: React.KeyboardEvent<HTMLDialogElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    if (event.nativeEvent.isComposing) {
      return;
    }

    if (!pendingDeleteTag || deletingTagId !== null) {
      return;
    }

    event.preventDefault();
    void handleConfirmDeleteTag();
  };

  const handleNewTagKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    if (event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (!isCreatingTag) {
      void handleCreateTag();
    }
  };

  const handleCreateTagGroup = async () => {
    const trimmedGroupName = newGroupName.trim();
    if (!trimmedGroupName) {
      setManageError("TagGroup 名称不能为空");
      return;
    }

    setIsCreatingGroup(true);
    setManageError(null);
    setManageSuccess(null);
    try {
      await createTagGroup({
        name: trimmedGroupName,
        description: newGroupDescription,
        existingTagIds: groupTagIds,
      });
      setNewGroupName("");
      setNewGroupDescription("");
      setGroupTagIds([]);
      setManageSuccess("TagGroup 创建成功");
      const refreshedGroups = await loadTagGroups();
      setManageTagGroups(refreshedGroups);
    } catch (err) {
      setManageError((err as Error).message || "创建 TagGroup 失败");
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleStartEditGroup = (group: TagGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
    setEditingGroupDescription(group.description ?? "");
    const ids = group.tags.map((tag) => tag.id);
    setEditingTagIds(ids);
    setInitialEditingTagIds(ids);
    setInitialEditingGroupName(group.name);
    setInitialEditingGroupDescription(group.description ?? "");
    setManageError(null);
    setManageSuccess(null);
    editGroupDialogRef.current?.showModal();
  };

  const handleCancelEditGroup = () => {
    editGroupDialogRef.current?.close();
    setEditingGroupId(null);
    setEditingGroupName("");
    setEditingGroupDescription("");
    setEditingTagIds([]);
    setInitialEditingTagIds([]);
    setInitialEditingGroupName("");
    setInitialEditingGroupDescription("");
  };

  const handleSaveEditGroup = async () => {
    if (!editingGroupId) {
      return;
    }

    const trimmedName = editingGroupName.trim();
    if (!trimmedName) {
      setManageError("TagGroup 名称不能为空");
      return;
    }

    const currentTagSet = new Set(editingTagIds);
    const initialTagSet = new Set(initialEditingTagIds);

    const addExistingTagIds = editingTagIds.filter(
      (id) => !initialTagSet.has(id),
    );
    const removeTagIds = initialEditingTagIds.filter(
      (id) => !currentTagSet.has(id),
    );

    const hasNameChanged = trimmedName !== initialEditingGroupName.trim();
    const hasDescriptionChanged =
      editingGroupDescription.trim() !== initialEditingGroupDescription.trim();
    const hasTagChanged =
      addExistingTagIds.length > 0 || removeTagIds.length > 0;

    if (!hasNameChanged && !hasDescriptionChanged && !hasTagChanged) {
      setManageSuccess("未检测到修改");
      return;
    }

    setIsEditingGroup(true);
    setManageError(null);
    setManageSuccess(null);
    try {
      await patchTagGroup({
        id: editingGroupId,
        ...(hasNameChanged ? { name: trimmedName } : {}),
        ...(hasDescriptionChanged
          ? { description: editingGroupDescription.trim() }
          : {}),
        ...(addExistingTagIds.length > 0 ? { addExistingTagIds } : {}),
        ...(removeTagIds.length > 0 ? { removeTagIds } : {}),
      });

      const refreshedGroups = await loadTagGroups();
      setManageTagGroups(refreshedGroups);

      const updatedGroup = refreshedGroups.find(
        (group) => group.id === editingGroupId,
      );
      if (updatedGroup) {
        handleStartEditGroup(updatedGroup);
      }

      setManageSuccess("TagGroup 已更新");
    } catch (err) {
      setManageError((err as Error).message || "更新 TagGroup 失败");
    } finally {
      setIsEditingGroup(false);
    }
  };

  const handleDeleteGroup = async (group: TagGroup) => {
    setPendingDeleteGroup(group);
    deleteConfirmDialogRef.current?.showModal();
  };

  const handleConfirmDeleteGroup = async () => {
    if (!pendingDeleteGroup) {
      return;
    }

    const group = pendingDeleteGroup;
    setDeletingGroupId(group.id);
    setManageError(null);
    setManageSuccess(null);

    try {
      await deleteTagGroup(group.id);

      const refreshedGroups = await loadTagGroups();
      setManageTagGroups(refreshedGroups);

      if (editingGroupId === group.id) {
        handleCancelEditGroup();
      }

      setManageSuccess(`TagGroup「${group.name}」已删除`);
      deleteConfirmDialogRef.current?.close();
      setPendingDeleteGroup(null);
    } catch (err) {
      setManageError((err as Error).message || "删除 TagGroup 失败");
    } finally {
      setDeletingGroupId(null);
    }
  };

  const handleDeleteDialogKeyDown = (
    event: React.KeyboardEvent<HTMLDialogElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    if (event.nativeEvent.isComposing) {
      return;
    }

    if (!pendingDeleteGroup || deletingGroupId !== null) {
      return;
    }

    event.preventDefault();
    void handleConfirmDeleteGroup();
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
      await createSong(newSong);
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
      await updateSong(editingSongId, editingSongData);
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
      await deleteSong(confirmDeleteSongId);
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
      const { task_id } = await createSonglistFromPlatform(payload);
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

      // 立即查一次，然后每 2s 轮询
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
      await deleteSonglist(confirmDeleteSonglistId);
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
      // 使用新的room_songs API添加歌曲到房间
      await addSongsToRoom(roomid, {
        song_ids: [addSingleSongId],
        append_to_end: true,
      });
      setSongManageSuccess("单曲已添加到房间队列");
      setAddSingleSongId(null);
      // 重新加载房间歌曲列表
      setRoomSongsPage(1);
      await loadRoomSongs(1, roomSongSearchKw);
    } catch (err) {
      setSongManageError((err as Error).message || "添加单曲到房间失败");
    } finally {
      setIsAddingSingleSong(false);
    }
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

  const handleKickUser = async (userId: number) => {
    if (!roomid || !wsClient) return;
    setIsKicking(userId);
    setKickError(null);
    setKickSuccess(null);
    try {
      // 发送踢人事件
      await wsClient.sendJson({
        event: 15, // KICK_USER
        data: { user_id: userId },
      });
      setKickSuccess("踢人成功");
      // 3秒后清除成功消息
      setTimeout(() => {
        setKickSuccess(null);
      }, 3000);
    } catch (err) {
      setKickError((err as Error).message || "踢人失败");
      // 3秒后清除错误消息
      setTimeout(() => {
        setKickError(null);
      }, 3000);
    } finally {
      setIsKicking(null);
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

  const handleBindSonglistToRoom = async () => {
    if (!bindSonglistId || !roomid) return;
    setIsBindingSonglist(true);
    setSongManageError(null);
    setSongManageSuccess(null);
    try {
      // 先获取歌单详情，获取其中的歌曲ID列表
      const songlistDetail = await getSonglistDetail(bindSonglistId);
      if (!songlistDetail.songs || songlistDetail.songs.length === 0) {
        setSongManageError("该歌单中没有歌曲");
        return;
      }
      const songIds = songlistDetail.songs.map((song) => song.id);
      // 使用room_songs API添加所有歌曲
      await addSongsToRoom(roomid, {
        song_ids: songIds,
        append_to_end: true,
      });
      setSongManageSuccess(
        `歌单 "${songlistDetail.title || "未命名歌单"}" 已绑定到房间，添加了 ${songIds.length} 首歌曲`,
      );
      setBindSonglistId(null);
      // 重新加载房间歌曲列表
      setRoomSongsPage(1);
      await loadRoomSongs(1, roomSongSearchKw);
    } catch (err) {
      setSongManageError((err as Error).message || "绑定歌单到房间失败");
    } finally {
      setIsBindingSonglist(false);
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
            <img src="/icon_01.svg" alt="CCG 图标" className="w-8 h-8" />
            <h1 className="text-xl font-bold">猜猜歌 · 房间管理</h1>
          </div>
        </div>
        <div className="navbar-end gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => void handleOpenSongManageDialog()}
          >
            管理歌曲 / 歌单
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleOpenManageDialog}
          >
            管理 Tag / TagGroup
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/room/${roomid}`)}
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
                          disabled={roomSongs.length === 0}
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
                          disabled={selectedRoomSongIds.length === 0}
                        >
                          删除选中 ({selectedRoomSongIds.length})
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-warning btn-outline"
                          onClick={handleOpenClearRoomSongsConfirm}
                          disabled={roomSongs.length === 0}
                        >
                          清空全部
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-info btn-outline"
                          onClick={() => void handleShuffleRoomSongs()}
                          disabled={roomSongs.length === 0 || isShufflingRoomSongs}
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
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => {
                          setRoomSongsPage(1);
                          void loadRoomSongs(1, roomSongSearchKw);
                        }}
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
                  >
                    <Icon icon="mdi:music" className="text-lg" />
                    添加单曲到房间
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  className="btn btn-primary"
                  onClick={handleSaveSettings}
                  disabled={isSaving || !hasChanges}
                >
                  {isSaving ? "保存中..." : "保存设置"}
                </button>
                <button className="btn btn-success" onClick={handleStartGame}>
                  开始游戏
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
                          disabled={isKicking === player.id}
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

          {isManageLoading ? (
            <div className="py-10 text-center">
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="card bg-base-200">
                <div className="card-body gap-3">
                  <h4 className="card-title text-lg">创建 Tag</h4>
                  <label className="floating-label">
                    <input
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
          )}

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

    </div>
  );
};

export default RoomManagePage;
