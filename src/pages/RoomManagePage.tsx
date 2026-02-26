import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icon } from "@iconify-icon/react";
import { TagList } from "../components";
import { gameStore, useGameStore } from "../stores/gameStore";
import useWebSocketStore from "../stores/webSocketStore";
import { getRoomInfo, patchRoomInfo } from "../api/room";
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

const RoomManagePage = () => {
  const { roomid } = useParams<{ roomid: string }>();
  const navigate = useNavigate();
  const { roomState } = useGameStore();
  const { wsClient } = useWebSocketStore();

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

  const loadTagGroups = async () => {
    const allGroups = await getTagGroups();
    setTagGroups(allGroups);

    const validIds = new Set(allGroups.map((group) => group.id));
    setSelectedTagGroupIds((prev) => prev.filter((id) => validIds.has(id)));
    setInitialSelectedIds((prev) => prev.filter((id) => validIds.has(id)));

    return allGroups;
  };

  const loadManageData = async () => {
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
  };

  useEffect(() => {
    let isMounted = true;

    const initPage = async () => {
      if (!roomid) {
        navigate("/");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [roomInfo, allGroups] = await Promise.all([
          getRoomInfo(roomid),
          loadTagGroups(),
        ]);

        if (!isMounted) {
          return;
        }

        gameStore.getState().setRoomState({
          roomId: roomInfo.roomId,
          hostPlayerId: roomInfo.hostPlayerId,
          status: roomInfo.status,
          title: roomInfo.title ?? "",
          description: roomInfo.description ?? null,
          players: roomInfo.players,
          songQueue: roomInfo.songQueue,
          tagGroups: roomInfo.tagGroups,
          playProgress: roomInfo.playProgress,
          startPositionPercent: roomInfo.startPositionPercent ?? 0,
        });

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
  }, [navigate, roomid]);

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

      gameStore.getState().setRoomState({
        roomId: room.roomId,
        hostPlayerId: room.hostPlayerId,
        status: room.status,
        title: room.title ?? "",
        description: room.description ?? null,
        players: room.players,
        songQueue: room.songQueue,
        tagGroups: room.tagGroups,
        playProgress: room.playProgress,
        startPositionPercent: room.startPositionPercent ?? 0,
      });

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
          <h1 className="text-xl font-bold">猜猜歌 · 房间管理</h1>
        </div>
        <div className="navbar-end gap-2">
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
                  {tagGroups.map((group) => {
                    const selected = selectedTagGroupIds.includes(group.id);
                    return (
                      <button
                        key={group.id}
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
                    <div className="alert alert-warning alert-soft py-2">
                      <span>还没有可选 TagGroup，请先在弹窗里创建。</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {error ? (
                <div className="alert  alert-soft alert-error">{error}</div>
              ) : null}
              {success ? (
                <div className="alert alert-success alert-soft">{success}</div>
              ) : null}

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
                  <span>{roomState?.players?.length || 0}</span>
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
                    .map((group) => (
                      <span
                        key={group.id}
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
                    {manageTags.map((tag) => (
                      <div key={tag.id} className="badge badge-lg gap-0 pr-0">
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
                    {manageTagGroups.map((group) => (
                      <tr key={group.id}>
                        <td>{group.name}</td>
                        <td>{group.description || "-"}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {group.tags.map((tag) => (
                              <span
                                key={tag.id}
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

      {(manageError || manageSuccess) && (
        <div className="toast toast-top toast-center z-50">
          {manageError ? (
            <div className="alert alert-soft alert-error">
              <span>{manageError}</span>
            </div>
          ) : null}
          {manageSuccess ? (
            <div className="alert alert-soft alert-success">
              <span>{manageSuccess}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default RoomManagePage;
