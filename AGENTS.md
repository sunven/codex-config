# Repository Guidelines

## Project Structure & Module Organization

This repository is a Tauri 2 desktop app for editing Codex `config.toml`.
Frontend code lives in `src/`: `App.tsx` is the main React UI, `main.tsx` is the
entry point, `configEditWorkflow.ts` contains edit/preview helpers, and
`src/components/ui/` holds reusable controls. Frontend tests are colocated as
`*.test.ts` or `*.test.tsx`.

Rust backend code lives in `src-tauri/src/`. Tauri commands are registered in
`src-tauri/src/lib.rs`; persistence, TOML editing, backups, schema writes, skills,
MCP servers, and model providers are separate modules. Schema assets are in
`src-tauri/schema/`, app icons in `src-tauri/icons/`, static assets in `public/`,
and project notes in `docs/`.

## Build, Test, and Development Commands

- `pnpm install` installs JS and Tauri CLI dependencies.
- `pnpm dev` runs the Vite frontend only.
- `CODEX_HOME=/tmp/codex-config-test pnpm tauri dev` runs the desktop app against
  a disposable Codex home.
- `pnpm build` runs TypeScript checks and builds Vite.
- `pnpm test` runs Vitest in jsdom.
- `cargo test --manifest-path src-tauri/Cargo.toml` runs Rust tests.
- `pnpm tauri build --debug` builds a debug desktop bundle.

## Coding Style & Naming Conventions

Use TypeScript strict mode and React function components. Keep frontend indentation
at two spaces, prefer explicit local types for shared state, and keep helpers near
their usage unless reused. Use `PascalCase` for components, `camelCase` for
functions and variables, and `*.test.tsx` for UI tests.

Rust uses standard `rustfmt`, `snake_case`, and small domain modules. Keep Tauri
command wrappers thin; put behavior in modules and map errors to strings at the
command boundary.

## Testing Guidelines

Frontend tests use Vitest, Testing Library, and `src/test/setup.ts`. Mock Tauri
APIs at the boundary and assert visible behavior. Backend tests should use
temporary directories and must not mutate the real `~/.codex/config.toml`. Add
tests when changing preview, save, backup, schema, or file-token behavior.

## Commit & Pull Request Guidelines

Recent history mixes concise imperative commits with Conventional Commit prefixes
such as `feat:`, `refactor:`, `style:`, and `chore:`. Prefer a short imperative
subject and use a prefix when it clarifies scope.

Pull requests should include a summary, commands run, and screenshots or screen
recordings for UI changes. For config-writing changes, call out safety behavior:
backups, previews, file-token checks, and `CODEX_HOME` test coverage.

## Security & Configuration Tips

The app edits the real Codex config unless `CODEX_HOME` is set. During development
and QA, use `CODEX_HOME=/tmp/codex-config-test` and avoid committing local config,
generated bundles, or secrets.
