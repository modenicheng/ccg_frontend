# CCG 前端

CCG 前端项目，基于 React + TypeScript + Vite 构建，使用 Tailwind CSS 4 + daisyUI 5 进行样式开发，状态管理采用 Zustand。

## 快速开始

### 开发环境配置

本项目使用 `pnpm` 作为包管理器。

- Node.js：建议 `>= 20`
- pnpm：建议 `>= 10`

安装依赖：

```sh
pnpm install
```

启动开发环境：

```sh
pnpm dev
```

默认启动后访问：`http://localhost:5173`

## 常用脚本

```sh
# 启动开发服务器
pnpm dev

# 生产构建（先 TS 编译检查，再 Vite 构建）
pnpm build

# 本地预览构建产物
pnpm preview

# 代码检查
pnpm lint
```

## 技术栈

- **框架**：React 19
- **语言**：TypeScript 5
- **构建工具**：Vite 7
- **样式方案**：Tailwind CSS 4 + daisyUI 5
- **状态管理**：Zustand
- **代码规范**：ESLint 9
- **提交规范**：Husky + Commitlint（Conventional Commits）

## Git 提交规范

本项目已启用提交信息校验（`.husky/commit-msg`）。

请使用 Conventional Commits 规范，例如：

```text
feat: 新增玩家列表筛选功能
fix: 修复断线重连后延迟显示异常
docs: 完善 README 启动说明
```

支持的 `type`（见 `commitlint.config.ts`）：

- `feat`
- `fix`
- `docs`
- `style`
- `refactor`
- `perf`
- `test`
- `build`
- `ci`
- `chore`
- `revert`

## 目录结构

```text
src/
├─ App.tsx                # 路由入口（/ 与 /room/:roomid）
├─ App.css                # 全局样式（含 Tailwind / daisyUI 插件与局部样式）
├─ api/                   # REST API 封装（/api/room/*）
├─ audioPlayer/           # 音频播放与 worklet 逻辑
├─ components/            # 通用组件
├─ pages/                 # 页面组件（HomePage / RoomPage）
├─ stores/                # Zustand 状态管理
├─ types/                 # 类型定义
├─ utils/                 # 工具函数
└─ wsClient/              # WebSocket 客户端与消息处理
```

## 路由说明

- `/`：创建/加入房间页面
- `/room/:roomid`：房间页面（原先 `App.tsx` 的主要内容）

## REST 接口说明

- `POST /api/room/`：创建房间
- `GET /api/room/:roomid`：获取房间信息
- `PATCH /api/room/:roomid`：更新房间设置（如歌单、标题、描述）

## WebSocket 连接说明

当前前端连接地址逻辑如下（见 `src/pages/RoomPage.tsx`）：

- 连接路径：`/ws/:roomid`
- 开发环境：默认连接 `http://localhost:8000` 对应的 WS（可通过 `VITE_BACKEND_ORIGIN` 覆盖）
- 生产环境：同源连接

开发模式下，Vite 已配置 `/api` 与 `/ws` 代理到后端 `localhost:8000`。

如需联调，请确保后端 WebSocket 服务可用。

## UI 与样式约定

- 优先使用 **daisyUI 组件类** + **Tailwind 工具类**。
- 项目已安装并启用 daisyUI 5。
- 主题通过 `data-theme` 切换，并持久化到本地存储（见 `persistStore`）。

## 常见问题

### 1) 安装依赖失败

- 检查 Node 与 pnpm 版本是否符合要求。
- 清理后重装：删除 `node_modules` 后重新 `pnpm install`。

### 2) 提交被拦截

- 多数是 commit message 不符合规范。
- 按上面的 Conventional Commits 示例修改提交信息后重试。
