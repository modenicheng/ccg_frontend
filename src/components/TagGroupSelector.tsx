import clsx from "clsx";
import { Icon } from "@iconify-icon/react";
import type { WsTagGroup } from "../types/wsMessages";

interface TagGroupSelectorProps {
  /** 标签组数据 */
  tagGroups: WsTagGroup[];
  /** 已选标签映射：groupId -> tagId 或 null */
  selectedTags: Record<number, number | null>;
  /** 选择标签的回调函数 */
  onSelectTag: (groupId: number, tagId: number) => void;
  /** 要高亮的标签ID数组（例如历史标签） */
  highlightTagIds?: number[];
  /** 是否只读模式 */
  readOnly?: boolean;
  /** 是否显示组件标题 */
  showHeader?: boolean;
  /** 自定义标题文本 */
  headerText?: string;
  /** 自定义类名 */
  className?: string;
  /** 是否显示空状态提示 */
  showEmptyState?: boolean;
  /** 空状态提示文本 */
  emptyStateText?: string;
}

/**
 * 通用的标签组选择器组件
 * 支持普通选择和判分场景，可配置高亮标签和只读模式
 */
export function TagGroupSelector({
  tagGroups,
  selectedTags,
  onSelectTag,
  highlightTagIds = [],
  readOnly = false,
  showHeader = true,
  headerText = "选择 Tags",
  className = "",
  showEmptyState = true,
  emptyStateText = "暂无可选标签分组",
}: TagGroupSelectorProps) {
  if (tagGroups.length === 0 && showEmptyState) {
    return (
      <div className={clsx("card shadow-sm min-h-56", className)}>
        <div className="card-body">
          {showHeader && (
            <>
              <h2 className="text-lg font-semibold flex items-center">
                <Icon
                  icon="heroicons:tag"
                  width={24}
                  height={24}
                  className="inline mr-1"
                />
                {headerText}
              </h2>
              <div className="divider m-0"></div>
            </>
          )}
          <div className="alert alert-soft alert-warning">
            {emptyStateText}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("card shadow-sm min-h-56", className)}>
      <div className="card-body">
        {showHeader && (
          <>
            <h2 className="text-lg font-semibold flex items-center">
              <Icon
                icon="heroicons:tag"
                width={24}
                height={24}
                className="inline mr-1"
              />
              {headerText}
            </h2>
            <div className="divider m-0"></div>
          </>
        )}
        <div className="space-y-4">
          {tagGroups.map((group) => {
            const selectedTagId = selectedTags[group.id];
            const selectedCount = selectedTagId ? 1 : 0;

            return (
              <fieldset
                key={group.id}
                className="fieldset border border-base-300 rounded-box p-3"
              >
                <legend className="fieldset-legend w-full">
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="ml-2 font-semibold text-base">
                      {group.name}
                    </span>
                    <span
                      className={clsx("badge badge-sm", {
                        "badge-success badge-soft": selectedCount > 0,
                        "badge-ghost": selectedCount === 0,
                      })}
                    >
                      {selectedCount ? "已选择" : "未选择"}
                    </span>
                  </div>
                </legend>

                {group.description ? (
                  <p className="mb-1">{group.description}</p>
                ) : null}

                <div className="flex flex-wrap gap-4">
                  {group.tags.map((tag) => {
                    const isHighlighted = highlightTagIds.includes(tag.id);
                    const isSelected = selectedTagId === tag.id;

                    return (
                      <label
                        key={tag.id}
                        className={clsx("label cursor-pointer gap-2", {
                          "cursor-default": readOnly,
                        })}
                      >
                        <input
                          type="radio"
                          name={`tag-group-${group.id}`}
                          className="radio radio-primary radio-sm"
                          checked={isSelected}
                          onChange={() => {
                            if (!readOnly) {
                              onSelectTag(group.id, tag.id);
                            }
                          }}
                          disabled={readOnly}
                        />
                        <span
                          className={clsx("text-sm", {
                            "font-bold": isHighlighted,
                            "text-primary": isSelected && !readOnly,
                            "opacity-70": readOnly && !isSelected,
                          })}
                        >
                          {tag.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      </div>
    </div>
  );
}