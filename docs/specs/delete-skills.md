# Spec: Delete Global Skills

## Objective
Allow users to remove a single discovered global skill from the Skills workspace. Success means the skill disappears from the refreshed app state, stale disabled config entries are removed, and symlinked imported skills delete only the link entry, not the original source directory.

## Tech Stack
React + TypeScript frontend, Tauri commands, Rust backend using existing TOML workflow and file-token checks.

## Commands
- Frontend tests: `pnpm test -- --run`
- Frontend build: `pnpm build`
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`

## Project Structure
- `src/SkillsWorkspace.tsx` -> Skills UI and command invocation
- `src/App.test.tsx` -> UI behavior tests
- `src-tauri/src/skill_store.rs` -> Skill discovery and filesystem operations
- `src-tauri/src/lib.rs` -> Tauri command registration

## Code Style
```tsx
<Button onClick={() => onDelete(skill.path)} size="sm">
  <Trash2 size={14} />
  删除
</Button>
```

Use existing small function components, Chinese UI copy, and Tauri `invoke` calls. Rust command wrappers stay thin and behavior lives in `skill_store`.

## Testing Strategy
Add Rust tests for deleting normal directories, deleting symlink entries without touching targets, and rejecting paths outside discovered skill roots. Add UI tests for two-step delete confirmation and disabled state when unwritable.

## Boundaries
- Always: Validate paths against discovered skill roots before deleting.
- Always: Preserve original target directories when deleting symlinked imported skills.
- Ask first: Adding dependencies or changing skill import semantics.
- Never: Delete arbitrary paths outside discovered skill roots.
- Never: Batch delete skills in this change.

## Success Criteria
- A skill card exposes a delete action.
- The first click warns the user; the second click invokes `delete_skill`.
- Backend deletion removes the skill entry and refreshes state.
- Existing enable/disable and import behavior remains covered by tests.

## Open Questions
None for this scoped implementation.
