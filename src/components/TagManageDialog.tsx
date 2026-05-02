import type { Tag, TagGroup } from "../api/tags";
import type { TagItem } from "../types/tag";
import { Icon } from "@iconify-icon/react";
import { TagList } from "../components";

export interface TagManageDialogProps {
  manageDialogRef: React.RefObject<HTMLDialogElement | null>;
  editTagDialogRef: React.RefObject<HTMLDialogElement | null>;
  deleteTagConfirmDialogRef: React.RefObject<HTMLDialogElement | null>;
  newTagInputRef: React.RefObject<HTMLInputElement | null>;

  manageTags: Tag[];
  manageTagGroups: TagGroup[];

  newTagName: string;
  setNewTagName: React.Dispatch<React.SetStateAction<string>>;
  newGroupName: string;
  setNewGroupName: React.Dispatch<React.SetStateAction<string>>;
  newGroupDescription: string;
  setNewGroupDescription: React.Dispatch<React.SetStateAction<string>>;

  groupTagIds: number[];
  setGroupTagIds: React.Dispatch<React.SetStateAction<number[]>>;

  isManageLoading: boolean;
  isCreatingTag: boolean;
  isUpdatingTag: boolean;
  deletingTagId: number | null;

  isCreatingGroup: boolean;
  isEditingGroup: boolean;
  deletingGroupId: number | null;

  editingTagName: string;
  setEditingTagName: React.Dispatch<React.SetStateAction<string>>;
  pendingDeleteTag: Tag | null;
  setPendingDeleteTag: React.Dispatch<React.SetStateAction<Tag | null>>;
  pendingDeleteGroup: TagGroup | null;
  editingGroupName: string;
  editingGroupDescription: string;
  editingTagIds: number[];

  handleNewTagKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => void;
  handleCreateTag: () => Promise<void>;
  handleStartEditTag: (tag: Tag) => void;
  handleCancelEditTag: () => void;
  handleSaveEditTag: () => Promise<void>;
  handleDeleteTag: (tag: Tag) => void;
  handleConfirmDeleteTag: () => Promise<void>;
  handleDeleteTagDialogKeyDown: (
    event: React.KeyboardEvent<HTMLDialogElement>,
  ) => void;

  handleCreateTagGroup: () => Promise<void>;
  handleStartEditGroup: (group: TagGroup) => void;
  handleDeleteGroup: (group: TagGroup) => Promise<void>;

  selectableTagItems: TagItem[];
}

export function TagManageDialog({
  manageDialogRef,
  editTagDialogRef,
  deleteTagConfirmDialogRef,
  newTagInputRef,
  manageTags,
  manageTagGroups,
  newTagName,
  setNewTagName,
  newGroupName,
  setNewGroupName,
  newGroupDescription,
  setNewGroupDescription,
  setGroupTagIds,
  isManageLoading,
  isCreatingTag,
  isUpdatingTag,
  deletingTagId,
  isCreatingGroup,
  deletingGroupId,
  editingTagName,
  setEditingTagName,
  pendingDeleteTag,
  setPendingDeleteTag,
  handleNewTagKeyDown,
  handleCreateTag,
  handleStartEditTag,
  handleCancelEditTag,
  handleSaveEditTag,
  handleDeleteTag,
  handleConfirmDeleteTag,
  handleDeleteTagDialogKeyDown,
  handleCreateTagGroup,
  handleStartEditGroup,
  handleDeleteGroup,
  selectableTagItems,
}: TagManageDialogProps) {
  return (
    <>
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
    </>
  );
}
