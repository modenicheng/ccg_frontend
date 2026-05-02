# Agent Guidelines for GUESongS Frontend

This document provides guidelines for AI agents working on the GUESongS frontend repository. It covers build commands, code style, conventions, and project-specific patterns.

## Build, Lint, and Test Commands

### Package Manager
- Use **pnpm** for all package management operations.
- Node.js >= 20, pnpm >= 10.

### Available Scripts (from `package.json`)
```bash
pnpm dev           # Start development server (Vite)
pnpm build         # TypeScript compilation + Vite production build
pnpm lint          # Run ESLint on all files
pnpm preview       # Preview production build locally
pnpm prepare       # Install Husky git hooks
```

### Type Checking
- Type checking is performed automatically during `pnpm build` via `tsc -b`.
- No separate type-check script; rely on the build step.
- Use `strict: true` and other strict TypeScript flags (see `tsconfig.app.json`).

### Linting
- ESLint configuration: `eslint.config.js`.
- Uses recommended rules for TypeScript, React Hooks, React Refresh.
- Run `pnpm lint` to check all files.
- No auto‑fix script; fix issues manually.

### Testing
- **No test framework is currently configured.**
- If adding tests later, consider Vitest (aligned with Vite).
- For now, ensure changes work via manual verification and the build passes.

### Pre‑commit Hooks
- Husky + Commitlint enforce Conventional Commits.
- Commit messages are validated; see “Git Conventions” below.

## Code Style Guidelines

### Imports
- Use **double quotes** for import paths: `import { http } from "./http";`
- Group imports: external packages first, then internal modules.
- Use `import type` for type‑only imports: `import type { PersistState } from "../types/store";`
- Avoid relative path traversals beyond one level up (`../`); prefer alias if needed (none currently defined).

### Formatting
- Indent with **2 spaces** (configured in `.vscode/settings.json`).
- Use semicolons.
- Maximum line length: not enforced by tooling, but keep lines readable (~100 chars).
- Use trailing commas in multi‑line objects/arrays for cleaner diffs.
- Prefer **functional components** (React) using either `function Component()` or `const Component = () => {}`.
- Place `export` before the declaration (`export function createRoom(...)`).

### TypeScript
- Enable `strict: true` and all strict flags (already in tsconfig).
- Prefer **`interface` over `type`** for object shapes, especially when extending.
- Use `Record<string, string[]>` for typed dictionaries.
- Use `| null` for nullable values; avoid `undefined` unless explicitly optional.
- Map backend snake_case fields to frontend camelCase (see `src/api/room.ts` for examples).
- Use `as const` for literal tuple types where needed.

### Naming Conventions
- **Variables & functions**: `camelCase`.
- **Types & interfaces**: `PascalCase`.
- **Constants**: `UPPER_SNAKE_CASE` for true constants, otherwise `camelCase`.
- **Component files**: `PascalCase.tsx` (e.g., `SongInfoCard.tsx`).
- **Utility/API files**: `camelCase.ts` (e.g., `http.ts`, `room.ts`).
- **Store files**: `camelCase.ts` (e.g., `persistStore.ts`).

### Error Handling
- API errors are centralized in `src/api/http.ts` with an axios interceptor.
- Always reject with an `Error` object containing a user‑friendly message.
- In components, catch errors and display appropriate UI feedback (toast/message).
- Use `try/catch` for async operations that can fail; propagate errors upward if needed.

### React Components
- Use **destructured props** with explicit interfaces.
- Provide default values for optional props.
- Use `clsx` (or `classnames`) for conditional CSS classes.
- Keep components focused; split large components into smaller ones.
- Use **Tailwind CSS 4 + daisyUI 5** for styling; avoid inline `style` attributes.
- Prefer daisyUI component classes (`card`, `btn`, etc.) where possible.

### State Management (Zustand)
- Stores are defined in `src/stores/` using `create` from `zustand`.
- Use middleware (e.g., `persist`) when needed.
- Store slices should be cohesive; avoid mega‑stores.
- Export the store hook as `useStore` (or `usePersistStore`).
- Use `set` and `get` appropriately; keep mutations simple.

### Styling (Tailwind CSS + daisyUI)
- **Always use Tailwind utility classes**; avoid custom CSS unless absolutely necessary.
- Use daisyUI’s theme‑aware component classes (`btn`, `card`, `modal`, etc.).
- Theme is controlled via `data‑theme` attribute and persisted in `persistStore`.
- Custom styles go in `App.css`; use `@layer` directives to extend Tailwind.
- No `tailwind.config.js` – Tailwind 4 is configured via Vite plugin (`@tailwindcss/vite`).

## Git Conventions

### Commit Messages
- Follow **Conventional Commits** (enforced by Commitlint).
- Format: `<type>(<scope>): <subject>` (scope optional).
- Allowed types (see `commitlint.config.ts`): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Write subject in imperative mood, lower‑case, no period.
- Example: `feat: add player list filtering`

### Branch Naming
- Not enforced, but recommend: `feat/xxx`, `fix/xxx`, `docs/xxx`, etc.

## Project Structure

```
src/
├─ App.tsx                 # Root routing (HomePage, RoomPage, RoomManagePage, SpectatorPage, JoinPage)
├─ App.css                 # Global Tailwind/daisyUI styles
├─ api/                    # REST API clients (axios‑based)
│  ├─ http.ts              # Axios instance with error interceptor
│  ├─ room.ts              # Room CRUD + room info
│  ├─ room_songs.ts        # Room song list management
│  ├─ song.ts              # Song CRUD + tag history (defines BackendSong/Song)
│  ├─ songlist.ts          # Songlist CRUD + platform import
│  └─ tags.ts              # Tag and tag group CRUD
├─ audioPlayer/            # Web Audio worklet and player logic
│  ├─ index.ts             # Re‑export
│  └─ player.ts            # audioPlayer class (playback, visualization, preloading)
├─ components/             # Reusable UI components (25 components)
│  ├─ AnswerModal.tsx       # Answer dialog (select tags + description)
│  ├─ BuzzButton.tsx        # Buzz button with keyboard hints
│  ├─ ConfirmActionDialogs.tsx  # End game / dissolve / clear songs confirmations
│  ├─ ConfirmAnswerDialog.tsx   # Answer submission confirmation
│  ├─ ConnectionStatusBar.tsx   # WS status, latency, canvas, settings
│  ├─ ErrorToastStack.tsx   # Auto‑dismissing toast stack
│  ├─ ExistingCredentialDialog.tsx  # Existing credential recovery
│  ├─ JudgingDialog.tsx     # Judging/grading dialog (393 lines)
│  ├─ OwnerControls.tsx     # Room owner control panel
│  ├─ PlayerAnswersTable.tsx # Player answers table for current round
│  ├─ PlayerList.tsx        # Online players with buzz order
│  ├─ RemovePlayerDialog.tsx # Kick player confirmation
│  ├─ RoomInfo.tsx          # Room title, ID copy, join link
│  ├─ RoundSummaryDialog.tsx # Round score summary with countdown
│  ├─ Scoreboard.tsx        # Score rankings table
│  ├─ SettingDialog.tsx     # Theme + volume settings
│  ├─ SongInfoCard.tsx      # Song info display (compact/normal)
│  ├─ SongManageDialog.tsx  # Song/songlist management dialog
│  ├─ TagGroupSelector.tsx  # Tag group radio selector
│  ├─ TagList.tsx           # Tag list with add/remove/toggle
│  ├─ TagManageDialog.tsx   # Tag/TagGroup management dialog
│  ├─ TestAudioModal.tsx    # BGM picker modal
│  ├─ UserBar.tsx           # Player row with status badges
│  ├─ VolumeToast.tsx       # Volume level toast
│  └─ index.ts              # Barrel re‑export
├─ hooks/                  # Custom React Hooks (12 hooks)
│  ├─ useAudioContextInterceptor.ts  # AudioContext NotAllowedError recovery
│  ├─ useAutoToast.ts       # Generic auto‑dismiss toast effect
│  ├─ useIsOwner.ts         # Check if current user is room owner
│  ├─ useKeyboardShortcuts.ts  # Buzz + volume hotkeys, gesture recovery
│  ├─ usePlayerManagement.ts # Player list + kick (RoomManagePage)
│  ├─ useRoomAudio.ts       # Audio lifecycle, canvas, volume, progress drag, playback sync
│  ├─ useRoomSongsManagement.ts  # Room songs state + handlers (RoomManagePage)
│  ├─ useSongManagement.ts  # Song/songlist CRUD (RoomManagePage)
│  ├─ useTagManagement.ts   # Tag/TagGroup CRUD (RoomManagePage)
│  ├─ useTestAudioManagement.ts  # BGM picker + polling (RoomManagePage)
│  ├─ useWindowFocus.ts     # Window focus/blur detection
│  └─ index.ts              # Barrel re‑export
├─ pages/                  # Page‑level components + shared WS handlers
│  ├─ HomePage.tsx          # Create / join / watch room tabs
│  ├─ JoinPage.tsx          # Standalone join page with room info preview
│  ├─ RoomPage.tsx          # Game room (player view, ~1170 lines)
│  ├─ RoomManagePage.tsx    # Room management (owner, ~1210 lines)
│  ├─ roomWsHandlers.ts     # Shared WS event handlers for RoomPage + SpectatorPage (~1330 lines)
│  └─ SpectatorPage.tsx     # Spectator view (~726 lines, reuses roomWsHandlers)
├─ stores/                 # Zustand state stores
│  ├─ errorToastStore.ts    # Toast notifications (error/success/info, max 6)
│  ├─ gameStore.ts          # Game state (audio, room, scores, tags)
│  ├─ persistStore.ts       # Persisted state (theme, volume, users) via localStorage
│  ├─ webSocketStore.ts     # WS connection state, latency, clock offset
│  └─ index.ts              # Barrel re‑export
├─ types/                  # Shared TypeScript definitions
│  ├─ eventTypes.ts         # WS binary event types + game event IDs
│  ├─ store.ts              # Zustand store type definitions
│  ├─ tag.ts                # UI tag component types
│  └─ wsMessages.ts         # WS message types + utility functions
├─ utils/                  # Utility functions
│  ├─ color.ts              # CSS variable reader
│  ├─ common.ts             # Cookie, clipboard, error parsing
│  ├─ gameHelpers.ts        # Shared game helpers (answer queue, score delta, rank map)
│  ├─ roomAuth.ts           # Room auth tokens (cookies, sessionStorage, Zustand)
│  └─ wsEndpoint.ts         # WebSocket URL builder
└─ wsClient/               # WebSocket client
   ├─ index.ts             # WS class with reconnection, JSON/binary dispatch
   ├─ dataFrames.ts        # Binary frame parsing (Audio, Heartbeat, TimeSync)
   └─ handlers.ts          # Heartbeat ping/pong + clock offset calculation
```

## Development Notes

- **Backend proxy**: Vite proxies `/api` and `/ws` to `localhost:8000` (see `vite.config.ts`).
- **Environment variables**: Use `import.meta.env` (e.g., `VITE_BACKEND_ORIGIN`).
- **Theme persistence**: The `persistStore` automatically saves theme/volume/users to localStorage.
- **WebSocket connection**: Player connects to `/ws/:roomid?token=...&user_id=...`; spectator connects to `/ws/:roomid/watch`.
- **Binary protocols**: WebSocket uses binary frames for audio streaming (AudioFrame, HeartbeatFrame, TimeSyncFrame).
- **Shared WS handlers**: `pages/roomWsHandlers.ts` contains all 25 game event handlers used by both RoomPage and SpectatorPage. Room‑only features (auth, judging UI, round summary) are optional fields in `RoomWsHandlerContext` with no‑op defaults.
- **Custom hooks**: Use `useIsOwner` to check room ownership, `useWindowFocus` for visibility detection.
- **Error toasts**: ErrorToastStore supports error/success/info variants, max 6 toasts displayed.

## Cursor / Copilot Rules

No `.cursorrules`, `.cursor/rules/`, or `.github/copilot‑instructions.md` files are present in the repository. Follow the guidelines above when generating code.

---

*This file is intended for AI agents working on the GUESongS frontend. Keep it updated as the project evolves.*