## Plan: TagList 组件化与父层托管

这次改造的核心是把 `App.tsx` 里的标签 UI 抽成可复用组件，并把状态控制权上提给父组件：组件只负责展示和交互回调，不直接处理后端。根据你的决定，数据模型采用“每个 Tag 都有自己的 description”；交互采用“输入框 + 回车新增，点击小叉删除”；重复名称禁止；数量上限可配置，且 `0` 表示不限制。这样可以保证组件解耦、可复用，并且方便父层后续接入 WebSocket/接口同步逻辑。

**Steps**
1. 在 [src/types/tag.ts](src/types/tag.ts) 新增标签实体与组件配置类型  
   - 定义 `TagItem`（至少包含 `id`, `name`, `description`, `selected`）  
   - 定义 `TagListProps` 里需要的受控输入：`tags`, `onChange` 或者分离事件（`onToggle`, `onAdd`, `onRemove`, `onEditDescription`），以及 `maxTags`（`0`=无限制）、`allowDuplicate`（默认 `false`）。
2. 在 [src/components/TagList.tsx](src/components/TagList.tsx) 创建受控组件  
   - 渲染现有 tag 列表、选中态、删除按钮、自定义新增输入框。  
   - 回车触发新增；新增前做去重检查与上限检查；校验失败通过组件内轻提示（例如 `alert`/`label` 文案）反馈。  
   - 每个 tag 提供 description 编辑入口（可内联输入或展开区域），并通过回调通知父组件更新。  
   - 保持 daisyUI 语义一致：交互元素优先用 `button`，避免 `span onClick` 的可访问性问题。
3. 在 [src/components/index.ts](src/components/index.ts) 导出 `TagList`（若当前无该文件则新建）  
   - 统一组件出口，便于后续页面复用。
4. 在 [src/App.tsx](src/App.tsx) 替换原内联 tags 区块  
   - 把当前 `tags` 本地 state 迁移为新的 `TagItem[]` 结构（加入 `description`）。  
   - 用 `TagList` 替换 `tags.map(...)` + 输入框那段模板。  
   - 父层实现事件处理：toggle / add / remove / editDescription；保持“父层可完全接管数据”。
5. 兼容现有样式与文案  
   - 保留标题“选择 Tags”和整体卡片结构，不影响其它区域（音频、WS、表格、设置弹窗）。
   - 支持传入 daisyUI 相关 className 以配置 tag 样式。
6. 可选增强（不阻塞主线）  
   - 若后续需要和后端联动，可在 `App.tsx` 的回调里直接转发事件，不改 `TagList` 内部实现。  
   - 再下一步可把父层 state 挪到 store，但本次不做（遵循你“组件内部只做展示交互，父层管理数据”的边界）。

**Verification**
- 静态检查：`eslint` 与 TypeScript 无新增错误。  
- 交互手测（页面内）：  
  - 回车新增 tag；重复名阻止；`maxTags` 生效，`0` 时不限制。  
  - 点击 tag 切换选中态。  
  - 点击删除按钮后正确移除。  
  - 每个 tag 的 description 可编辑且更新到父层状态。  
- 可访问性快检：标签操作可通过键盘触发，按钮具备可读文本或 `aria-label`。

**Decisions**
- 状态归属：父组件托管（组件对外暴露数据与事件，便于后续后端交互）。  
- 描述模型：每个 Tag 都有 `description`。  
- 交互：回车新增 + 小叉删除。  
- 规则：禁止重复；上限可配置，`0` 代表无限制。
- 样式：保持 daisyUI 语义，优先用 `button` 等交互元素，避免 `span onClick` 的可访问性问题。