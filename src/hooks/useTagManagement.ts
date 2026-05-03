import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tag, TagGroup } from "../api/tags";
import {
  createTagGroup as apiCreateTagGroup,
  createTags,
  deleteTag as apiDeleteTag,
  deleteTagGroup as apiDeleteTagGroup,
  getTagGroups,
  getTags,
  patchTagGroup,
  updateTag as apiUpdateTag,
} from "../api/tags";
import { gameStore } from "../stores/gameStore";
import type { TagItem } from "../types/tag";

interface UseTagManagementOptions {
  roomid: string;
  loadTagGroups: () => Promise<TagGroup[]>;
  onTagGroupsLoaded: (groups: TagGroup[]) => void;
}

interface UseTagManagementReturn {
  manageTags: Tag[];
  setManageTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  manageTagGroups: TagGroup[];
  setManageTagGroups: React.Dispatch<React.SetStateAction<TagGroup[]>>;
  groupTagIds: number[];
  setGroupTagIds: React.Dispatch<React.SetStateAction<number[]>>;
  newTagName: string;
  setNewTagName: React.Dispatch<React.SetStateAction<string>>;
  newGroupName: string;
  setNewGroupName: React.Dispatch<React.SetStateAction<string>>;
  newGroupDescription: string;
  setNewGroupDescription: React.Dispatch<React.SetStateAction<string>>;
  isManageLoading: boolean;
  isCreatingTag: boolean;
  isUpdatingTag: boolean;
  deletingTagId: number | null;
  isCreatingGroup: boolean;
  isEditingGroup: boolean;
  deletingGroupId: number | null;
  pendingDeleteGroup: TagGroup | null;
  setPendingDeleteGroup: React.Dispatch<React.SetStateAction<TagGroup | null>>;
  manageError: string | null;
  setManageError: React.Dispatch<React.SetStateAction<string | null>>;
  manageSuccess: string | null;
  setManageSuccess: React.Dispatch<React.SetStateAction<string | null>>;
  editingTagId: number | null;
  editingTagName: string;
  setEditingTagName: React.Dispatch<React.SetStateAction<string>>;
  pendingDeleteTag: Tag | null;
  setPendingDeleteTag: React.Dispatch<React.SetStateAction<Tag | null>>;
  editingGroupId: number | null;
  editingGroupName: string;
  setEditingGroupName: React.Dispatch<React.SetStateAction<string>>;
  editingGroupDescription: string;
  setEditingGroupDescription: React.Dispatch<React.SetStateAction<string>>;
  editingTagIds: number[];
  setEditingTagIds: React.Dispatch<React.SetStateAction<number[]>>;

  manageDialogRef: React.RefObject<HTMLDialogElement | null>;
  editGroupDialogRef: React.RefObject<HTMLDialogElement | null>;
  editTagDialogRef: React.RefObject<HTMLDialogElement | null>;
  newTagInputRef: React.RefObject<HTMLInputElement | null>;
  deleteTagConfirmDialogRef: React.RefObject<HTMLDialogElement | null>;
  deleteConfirmDialogRef: React.RefObject<HTMLDialogElement | null>;

  loadManageData: () => Promise<void>;
  handleOpenManageDialog: () => Promise<void>;
  handleCreateTag: () => Promise<void>;
  handleStartEditTag: (tag: Tag) => void;
  handleCancelEditTag: () => void;
  handleSaveEditTag: () => Promise<void>;
  handleDeleteTag: (tag: Tag) => void;
  handleConfirmDeleteTag: () => Promise<void>;
  handleDeleteTagDialogKeyDown: (
    event: React.KeyboardEvent<HTMLDialogElement>,
  ) => void;
  handleNewTagKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => void;
  handleCreateTagGroup: () => Promise<void>;
  handleStartEditGroup: (group: TagGroup) => void;
  handleCancelEditGroup: () => void;
  handleSaveEditGroup: () => Promise<void>;
  handleDeleteGroup: (group: TagGroup) => Promise<void>;
  handleConfirmDeleteGroup: () => Promise<void>;
  handleDeleteDialogKeyDown: (
    event: React.KeyboardEvent<HTMLDialogElement>,
  ) => void;

  selectableTagItems: TagItem[];
  selectableEditTagItems: TagItem[];
}

export function useTagManagement({
  roomid,
  loadTagGroups,
  onTagGroupsLoaded,
}: UseTagManagementOptions): UseTagManagementReturn {
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
  const [pendingDeleteGroup, setPendingDeleteGroup] =
    useState<TagGroup | null>(null);
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

  const manageDialogRef = useRef<HTMLDialogElement | null>(null);
  const editGroupDialogRef = useRef<HTMLDialogElement | null>(null);
  const editTagDialogRef = useRef<HTMLDialogElement | null>(null);
  const newTagInputRef = useRef<HTMLInputElement | null>(null);
  const deleteTagConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteConfirmDialogRef = useRef<HTMLDialogElement | null>(null);

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
      onTagGroupsLoaded(allGroups);

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
  }, [onTagGroupsLoaded]);

  const handleOpenManageDialog = useCallback(async () => {
    manageDialogRef.current?.showModal();
    setManageSuccess(null);
    await loadManageData();
  }, [loadManageData]);

  const handleCreateTag = useCallback(async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setManageError("Tag 名称不能为空");
      return;
    }

    setIsCreatingTag(true);
    setManageError(null);
    setManageSuccess(null);
    try {
      const newTags = await createTags(roomid, [trimmed]);
      gameStore.getState().addTags(newTags);
      setNewTagName("");
      setManageSuccess("Tag 创建成功");
      await loadManageData();
      newTagInputRef.current?.focus();
    } catch (err) {
      setManageError((err as Error).message || "创建 Tag 失败");
    } finally {
      setIsCreatingTag(false);
    }
  }, [roomid, newTagName, loadManageData]);

  const handleStartEditTag = useCallback((tag: Tag) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
    setManageError(null);
    setManageSuccess(null);
    editTagDialogRef.current?.showModal();
  }, []);

  const handleCancelEditTag = useCallback(() => {
    editTagDialogRef.current?.close();
    setEditingTagId(null);
    setEditingTagName("");
  }, []);

  const handleSaveEditTag = useCallback(async () => {
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
      const updatedTag = await apiUpdateTag(roomid, editingTagId, trimmedName);
      gameStore.getState().updateTags([updatedTag]);
      await loadManageData();
      setManageSuccess(`Tag「${updatedTag.name}」已更新`);
      handleCancelEditTag();
    } catch (err) {
      setManageError((err as Error).message || "更新 Tag 失败");
    } finally {
      setIsUpdatingTag(false);
    }
  }, [roomid, editingTagId, editingTagName, loadManageData, handleCancelEditTag]);

  const handleDeleteTag = useCallback((tag: Tag) => {
    setPendingDeleteTag(tag);
    deleteTagConfirmDialogRef.current?.showModal();
  }, []);

  const handleConfirmDeleteTag = useCallback(async () => {
    if (!pendingDeleteTag) {
      return;
    }

    const tag = pendingDeleteTag;
    setDeletingTagId(tag.id);
    setManageError(null);
    setManageSuccess(null);
    try {
      await apiDeleteTag(roomid, tag.id);
      gameStore.getState().removeTags([tag.id]);
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
  }, [
    roomid,
    pendingDeleteTag,
    editingTagId,
    loadManageData,
    handleCancelEditTag,
  ]);

  const handleDeleteTagDialogKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDialogElement>) => {
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
    },
    [pendingDeleteTag, deletingTagId, handleConfirmDeleteTag],
  );

  const handleNewTagKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
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
    },
    [isCreatingTag, handleCreateTag],
  );

  const handleCreateTagGroup = useCallback(async () => {
    const trimmedGroupName = newGroupName.trim();
    if (!trimmedGroupName) {
      setManageError("TagGroup 名称不能为空");
      return;
    }

    setIsCreatingGroup(true);
    setManageError(null);
    setManageSuccess(null);
    try {
      const newGroup = await apiCreateTagGroup(roomid, {
        name: trimmedGroupName,
        description: newGroupDescription,
        existingTagIds: groupTagIds,
      });
      gameStore.getState().addTagGroups([newGroup]);
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
  }, [roomid, newGroupName, newGroupDescription, groupTagIds, loadTagGroups]);

  const handleStartEditGroup = useCallback((group: TagGroup) => {
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
  }, []);

  const handleCancelEditGroup = useCallback(() => {
    editGroupDialogRef.current?.close();
    setEditingGroupId(null);
    setEditingGroupName("");
    setEditingGroupDescription("");
    setEditingTagIds([]);
    setInitialEditingTagIds([]);
    setInitialEditingGroupName("");
    setInitialEditingGroupDescription("");
  }, []);

  const handleSaveEditGroup = useCallback(async () => {
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
      const updatedGroup = await patchTagGroup(roomid, {
        id: editingGroupId,
        ...(hasNameChanged ? { name: trimmedName } : {}),
        ...(hasDescriptionChanged
          ? { description: editingGroupDescription.trim() }
          : {}),
        ...(addExistingTagIds.length > 0 ? { addExistingTagIds } : {}),
        ...(removeTagIds.length > 0 ? { removeTagIds } : {}),
      });
      gameStore.getState().updateTagGroups([updatedGroup]);

      const refreshedGroups = await loadTagGroups();
      setManageTagGroups(refreshedGroups);

      const finalGroup = refreshedGroups.find(
        (group) => group.id === editingGroupId,
      );
      if (finalGroup) {
        handleStartEditGroup(finalGroup);
      }

      setManageSuccess("TagGroup 已更新");
    } catch (err) {
      setManageError((err as Error).message || "更新 TagGroup 失败");
    } finally {
      setIsEditingGroup(false);
    }
  }, [
    roomid,
    editingGroupId,
    editingGroupName,
    editingGroupDescription,
    editingTagIds,
    initialEditingTagIds,
    initialEditingGroupName,
    initialEditingGroupDescription,
    loadTagGroups,
    handleStartEditGroup,
  ]);

  const handleDeleteGroup = useCallback(async (group: TagGroup) => {
    setPendingDeleteGroup(group);
    deleteConfirmDialogRef.current?.showModal();
  }, []);

  const handleConfirmDeleteGroup = useCallback(async () => {
    if (!pendingDeleteGroup) {
      return;
    }

    const group = pendingDeleteGroup;
    setDeletingGroupId(group.id);
    setManageError(null);
    setManageSuccess(null);

    try {
      await apiDeleteTagGroup(roomid, group.id);
      gameStore.getState().removeTagGroups([group.id]);

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
  }, [
    roomid,
    pendingDeleteGroup,
    editingGroupId,
    loadTagGroups,
    handleCancelEditGroup,
  ]);

  const handleDeleteDialogKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDialogElement>) => {
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
    },
    [pendingDeleteGroup, deletingGroupId, handleConfirmDeleteGroup],
  );

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

  return {
    manageTags,
    setManageTags,
    manageTagGroups,
    setManageTagGroups,
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
    setManageError,
    manageSuccess,
    setManageSuccess,
    editingTagId,
    editingTagName,
    setEditingTagName,
    pendingDeleteTag,
    setPendingDeleteTag,
    editingGroupId,
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

    loadManageData,
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
  };
}
