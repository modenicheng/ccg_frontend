# Agent Guidelines for CCG Frontend

This document provides guidelines for AI agents working on the CCG frontend repository. It covers build commands, code style, conventions, and project-specific patterns.

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
├─ App.tsx                 # Root routing (HomePage, RoomPage, RoomManagePage)
├─ App.css                 # Global Tailwind/daisyUI styles
├─ api/                    # REST API clients (axios‑based)
├─ audioPlayer/            # Web Audio worklet and player logic
├─ components/             # Reusable UI components
├─ pages/                  # Page‑level components
├─ stores/                 # Zustand state stores
├─ types/                  # Shared TypeScript definitions
├─ utils/                  # Utility functions
└─ wsClient/               # WebSocket client and message handlers
```

## Development Notes

- **Backend proxy**: Vite proxies `/api` and `/ws` to `localhost:8000` (see `vite.config.ts`).
- **Environment variables**: Use `import.meta.env` (e.g., `VITE_BACKEND_ORIGIN`).
- **Theme persistence**: The `persistStore` automatically saves theme/volume/users to localStorage.
- **WebSocket connection**: Connects to `/ws/:roomid` (see `src/pages/RoomPage.tsx`).

## Cursor / Copilot Rules

No `.cursorrules`, `.cursor/rules/`, or `.github/copilot‑instructions.md` files are present in the repository. Follow the guidelines above when generating code.

---

*This file is intended for AI agents working on the CCG frontend. Keep it updated as the project evolves.*