# GUESongS 前端

GUESongS 前端项目，基于 React + TypeScript + Vite 构建，使用 Tailwind CSS 4 + daisyUI 5 进行样式开发，状态管理采用 Zustand。这是一个实时多人音乐猜歌游戏前端，支持创建房间、加入游戏、观看比赛等功能。

## 快速开始

### 开发环境配置

本项目使用 `pnpm` 作为包管理器。

- Node.js：`>= 20`
- pnpm：`>= 10`

安装依赖：

```sh
pnpm install
```

启动开发环境：

```sh
pnpm dev
```

默认启动后访问：`http://localhost:5173`

### 生产构建

```sh
pnpm build
```

构建产物将输出到 `dist/` 目录。

### 本地预览

```sh
pnpm preview
```

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

# 安装 Husky Git 钩子
pnpm prepare
```

## 技术栈

- **框架**：React 19
- **语言**：TypeScript 5
- **构建工具**：Vite 7
- **样式方案**：Tailwind CSS 4 + daisyUI 5
- **状态管理**：Zustand 5
- **路由**：React Router DOM 7
- **HTTP 客户端**：Axios
- **图标**：Heroicons + Iconify
- **代码规范**：ESLint 9
- **提交规范**：Husky + Commitlint（Conventional Commits）
- **音频处理**：Web Audio API

## 项目结构

```
src/
├─ api/                    # REST API 客户端（基于 Axios）
│  ├─ http.ts              # HTTP 客户端配置与拦截器
│  ├─ room.ts              # 房间相关 API
│  ├─ room_songs.ts        # 房间歌曲相关 API
│  ├─ song.ts              # 歌曲相关 API
│  ├─ songlist.ts          # 歌单相关 API
│  └─ tags.ts              # 标签相关 API
├─ audioPlayer/            # Web Audio API 音频播放与可视化
│  ├─ index.ts             # 音频播放器导出
│  └─ player.ts            # 音频播放器核心实现
├─ components/             # 可复用 UI 组件
│  ├─ AnswerModal.tsx      # 答题弹窗组件
│  ├─ BuzzButton.tsx       # 抢答按钮组件
│  ├─ ConfirmAnswerDialog.tsx  # 确认答题对话框
│  ├─ ConnectionStatusBar.tsx  # 连接状态条组件
│  ├─ ErrorToastStack.tsx  # 错误提示组件
│  ├─ JudgingDialog.tsx    # 判分对话框组件
│  ├─ OwnerControls.tsx    # 房主控制组件
│  ├─ PlayerAnswersTable.tsx  # 玩家答案表格组件
│  ├─ PlayerList.tsx       # 玩家列表组件
│  ├─ RemovePlayerDialog.tsx  # 移除玩家对话框
│  ├─ RoomInfo.tsx         # 房间信息组件
│  ├─ RoundSummaryDialog.tsx  # 回合总结对话框
│  ├─ Scoreboard.tsx       # 记分板组件
│  ├─ SettingDialog.tsx    # 设置对话框组件
│  ├─ SongInfoCard.tsx     # 歌曲信息卡片组件
│  ├─ TagGroupSelector.tsx # 标签组选择器组件
│  ├─ TagList.tsx          # 标签列表组件
│  ├─ UserBar.tsx          # 用户状态栏组件
│  ├─ VolumeToast.tsx      # 音量提示组件
│  └─ index.ts             # 组件导出
├─ hooks/                  # React Hooks
│  ├─ useIsOwner.ts        # 判断是否为房主的 Hook
│  ├─ useWindowFocus.ts    # 窗口焦点检测 Hook
│  └─ index.ts             # Hooks 导出
├─ pages/                  # 页面级组件
│  ├─ HomePage.tsx         # 首页（创建/加入/观看房间）
│  ├─ RoomPage.tsx         # 房间页面（游戏主界面）
│  ├─ RoomManagePage.tsx   # 房间管理页面
│  └─ SpectatorPage.tsx    # 观战页面
├─ stores/                 # Zustand 状态管理
│  ├─ errorToastStore.ts   # 错误提示状态（支持 error/success/info）
│  ├─ gameStore.ts         # 游戏核心状态
│  ├─ persistStore.ts      # 持久化状态（主题、音量、用户）
│  ├─ webSocketStore.ts    # WebSocket 连接状态
│  └─ index.ts             # Stores 导出
├─ types/                  # TypeScript 类型定义
│  ├─ eventTypes.ts        # 事件类型定义
│  ├─ store.ts             # 状态存储类型
│  ├─ tag.ts               # 标签相关类型
│  └─ wsMessages.ts        # WebSocket 消息类型
├─ utils/                  # 工具函数
│  ├─ color.ts             # 颜色处理工具
│  ├─ common.ts            # 通用工具函数
│  └─ roomAuth.ts          # 房间认证工具
├─ wsClient/               # WebSocket 客户端
│  ├─ index.ts             # WebSocket 客户端导出
│  ├─ dataFrames.ts        # 数据帧处理（音频帧、心跳帧、时间同步帧）
│  └─ handlers.ts          # 消息处理器
├─ App.tsx                 # 根路由组件
├─ App.css                 # 全局样式（Tailwind/daisyUI）
├─ index.css               # 入口样式
└─ main.tsx                # 应用入口
```

## 路由说明

- `/`：首页 - 创建房间、加入房间、观看比赛
- `/room/:roomid`：房间页面 - 游戏主界面（玩家视角）
- `/room/:roomid/manage`：房间管理 - 管理歌曲、标签、房间设置
- `/room/:roomid/watch`：观战页面 - 仅观看游戏进程

## REST 接口说明

- `POST /api/room/`：创建房间
- `GET /api/room/:roomid`：获取房间信息
- `PATCH /api/room/:roomid`：更新房间设置
- `GET /api/songs/`：获取歌曲列表
- `POST /api/songs/`：创建歌曲
- `PUT /api/songs/:id`：更新歌曲
- `DELETE /api/songs/:id`：删除歌曲
- `GET /api/tags/`：获取标签列表
- `POST /api/tags/`：创建标签
- `GET /api/songlists/`：获取歌单列表

## WebSocket 连接说明

当前前端连接地址逻辑如下（见 `src/utils/wsEndpoint.ts`）：

- 玩家端路径：`/ws/:roomid`（携带 `token` 查询参数）
- 观战端路径：`/ws/:roomid/watch`
- 开发环境（`import.meta.env.PROD === false`）：返回同源相对路径 `/ws/...`，由 Vite 代理到后端
- 生产环境（`import.meta.env.PROD === true`）：固定连接 `wss://ccg-origin.modenc.top/ws/...`

开发模式下，Vite 已配置 `/api` 与 `/ws` 代理到后端 `localhost:8000`。

### WebSocket 消息类型

- `room_state`：房间状态更新
- `play_control`：播放控制
- `attempt_answer`：尝试答题
- `answer_queue`：答题队列
- `your_turn`：轮到玩家答题
- `answer_broadcast`：答案广播
- `round_start`：回合开始
- `start_pos_update`：播放位置更新
- `game_over`：游戏结束
- `kick_user`：踢出用户
- `preload_audio`：预加载音频

## UI 与样式约定

- 优先使用 **daisyUI 组件类** + **Tailwind 工具类**。
- 项目已安装并启用 daisyUI 5。
- 主题通过 `data-theme` 切换，并持久化到本地存储（见 `persistStore`）。
- 使用 `clsx` 进行条件 CSS 类组合。
- 避免使用内联样式，优先使用 Tailwind 工具类。
- Tailwind 4 通过 Vite 插件（`@tailwindcss/vite`）配置，同时保留 `tailwind.config.ts` 用于自定义配置（Iconify、daisyUI 插件）。

## 状态管理

项目使用 Zustand 进行状态管理，包含以下存储：

1. **gameStore**：游戏核心状态（音频、用户、房间状态等）
2. **persistStore**：持久化状态（主题、音量、用户信息）
3. **webSocketStore**：WebSocket 连接状态（连接状态、延迟、时钟偏移）
4. **errorToastStore**：错误提示状态（支持 error/success/info 三种类型，最多显示 6 条）

所有 stores 通过 `src/stores/index.ts` 统一导出。

## 音频处理

项目使用 Web Audio API 进行音频处理，支持：

- 音频播放控制（播放、暂停、跳转）
- 音量调节（持久化保存）
- 频率可视化（频谱显示）
- 音频预加载（根据房间歌曲队列）
- 多房间音频同步（基于心跳和时间同步帧）
- 音频帧二进制协议（Opus/PCM 编码）

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

## 开发注意事项

### 后端代理

Vite 开发服务器已配置代理：

- `/api` 请求代理到 `http://localhost:8000`
- `/ws` WebSocket 代理到 `ws://localhost:8000`

### 环境变量

使用 `import.meta.env` 访问环境变量：

- 当前 WebSocket 连接无需额外环境变量。
- 开发默认同源（`/ws/...`）+ Vite 代理；生产固定 `ccg-origin.modenc.top`。

### 认证机制

房间认证信息存储在 cookie 和 sessionStorage 中，通过 `roomAuth.ts` 工具函数管理。
Cookie 用于 WebSocket 握手认证，sessionStorage 用于前端状态恢复。

### 错误处理

API 错误通过 Axios 拦截器统一处理，组件中通过 `errorToastStore` 显示错误提示。
错误提示支持三种类型（error/success/info），最多同时显示 6 条，自动超时消失。

### Hooks

项目提供自定义 React Hooks：

- `useIsOwner`：判断当前用户是否为房主
- `useWindowFocus`：检测窗口是否处于聚焦状态

所有 Hooks 通过 `src/hooks/index.ts` 统一导出。

## 常见问题

### 1) 安装依赖失败

- 检查 Node 与 pnpm 版本是否符合要求。
- 清理后重装：删除 `node_modules` 后重新 `pnpm install`。

### 2) 提交被拦截

- 多数是 commit message 不符合规范。
- 按上面的 Conventional Commits 示例修改提交信息后重试。

### 3) WebSocket 连接失败

- 开发环境：确保后端服务已启动在 `localhost:8000`，并确认 Vite 代理配置存在 `/ws`。
- 生产环境：确认页面可访问 `wss://ccg-origin.modenc.top/ws/...`（含反向代理与证书配置）。
- 检查网络防火墙设置
- 查看浏览器开发者工具网络面板

### 4) 音频无法播放

- 确保浏览器支持 Web Audio API
- 检查浏览器是否允许自动播放音频
- 调整系统音量和浏览器音量设置

## 许可证

本项目为私有项目，未指定开源许可证。