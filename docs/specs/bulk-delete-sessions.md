# Spec: Bulk Delete Codex Sessions

## Objective
Let users clean old Codex session `.jsonl` files from the Sessions workspace without deleting them one by one. Success means the user can delete sessions older than 7 days or 30 days, sees how many files match in a confirmation dialog, and the refreshed list no longer shows deleted files.

## Tech Stack
React + TypeScript frontend, Tauri commands, Rust backend using the existing `codex_session_store`.

## Commands
- Frontend tests: `pnpm test -- --run`
- Frontend build: `pnpm build`
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`

## Project Structure
- `src/SessionsWorkspace.tsx` -> Sessions UI and command invocation
- `src/codexSessions.ts` -> Session summary helpers
- `src/App.test.tsx` -> UI behavior tests
- `src-tauri/src/codex_session_store.rs` -> Session discovery and deletion
- `src-tauri/src/lib.rs` -> Tauri command registration

## Code Style
```tsx
<Button onClick={() => onDeleteOlderThan(30)} size="sm">
  <Trash2 data-icon="inline-start" />
  删除 30 天前
</Button>
```

Use existing function components, Chinese UI copy, lucide icons, and Tauri `invoke` calls. Rust command wrappers stay thin and filesystem behavior lives in `codex_session_store`.

## Testing Strategy
Add one Rust test for deleting only files older than a cutoff. Add one UI test for the Dialog confirmation and command payload.

## Boundaries
- Always: Delete only `.jsonl` files under the resolved Codex `sessions` directory.
- Always: Keep single-session deletion behind Dialog confirmation.
- Ask first: Custom date pickers, undo, moving files to trash, or adding dependencies.
- Never: Delete `config.toml` or arbitrary paths outside `sessions`.

## Success Criteria
- Sessions UI shows fixed actions for deleting sessions older than 7 days and 30 days.
- Each delete action requires Dialog confirmation before invoking the backend command.
- The Dialog confirmation text includes the matching session count for bulk deletes.
- Backend deletion removes only matching `.jsonl` files and reloads app state with sessions.

## Open Questions
None for the first scoped implementation.
