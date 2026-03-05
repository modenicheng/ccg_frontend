import clsx from "clsx";
import { Icon } from "@iconify-icon/react";
import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { TagListProps } from "../types/tag";

function TagList({
  tags,
  onToggleTag,
  onAddTag,
  onRemoveTag,
  showAddControls = true,
  showRemoveButton = true,
  maxTags = 0,
  allowDuplicate = false,
  className,
  tagClassName = "",
  selectedTagClassName,
  unselectedTagClassName,
  inputClassName,
}: TagListProps) {
  const [newTagName, setNewTagName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const normalizedTagSet = useMemo(
    () => new Set(tags.map((tag) => tag.name.trim().toLowerCase())),
    [tags],
  );

  const canAddMore = maxTags === 0 || tags.length < maxTags;

  const createTag = () => {
    const normalized = newTagName.trim();
    if (!normalized) {
      setErrorMessage("Tag 名称不能为空");
      return;
    }

    if (!canAddMore) {
      setErrorMessage(`最多只能添加 ${maxTags} 个 Tag`);
      return;
    }

    if (!allowDuplicate && normalizedTagSet.has(normalized.toLowerCase())) {
      setErrorMessage("Tag 已存在，不能重复添加");
      return;
    }

    onAddTag(normalized);
    setNewTagName("");
    setErrorMessage("");
  };

  const onInputKeyDown = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      createTag();
    }
  };

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div className="flex gap-2 flex-wrap justify-start items-center">
        {tags.map((tag, index) => {
          return (
            <div
              key={`${tag.id}-${tag.name}-${index}`}
              className="flex flex-col gap-1"
            >
              {/** tag.canClose 默认为 true；showRemoveButton 是全局开关 */}
              <div
                className={clsx(
                  "btn btn-sm btn-soft cursor-pointer select-none p-0",
                  tagClassName,
                  {
                    "bg-primary-content text-primary shadow": tag.selected,
                    "bg-base-200": !tag.selected,
                  },
                  tag.selected ? selectedTagClassName : unselectedTagClassName,
                )}
                title={tag.name}
                onClick={() => onToggleTag(tag.id)}
              >
                <div className="card-body p-1.5">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-sm font-medium">
                      {tag.name}
                    </span>

                    {showRemoveButton && tag.canClose !== false ? (
                      <button
                        type="button"
                        className="inline-flex h-6 min-h-6 w-6 items-center justify-center rounded-full cursor-pointer"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onRemoveTag(tag.id);
                        }}
                        aria-label={`删除 Tag：${tag.name}`}
                        title={`删除 ${tag.name}`}
                      >
                        <Icon icon="heroicons:x-mark" width={14} height={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAddControls ? (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            className={clsx("input input-sm w-40", inputClassName)}
            placeholder="输入新 Tag 后回车"
            value={newTagName}
            onChange={(ev) => {
              setNewTagName(ev.target.value);
              if (errorMessage) {
                setErrorMessage("");
              }
            }}
            onKeyDown={onInputKeyDown}
            aria-label="新增 Tag"
            disabled={!canAddMore}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={createTag}
            disabled={!canAddMore}
          >
            添加
          </button>
          {maxTags > 0 ? (
            <span className="text-xs opacity-70">
              {tags.length}/{maxTags}
            </span>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-error text-xs" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export default TagList;
