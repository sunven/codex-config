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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **codex-config** (934 symbols, 2455 relationships, 78 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/codex-config/context` | Codebase overview, check index freshness |
| `gitnexus://repo/codex-config/clusters` | All functional areas |
| `gitnexus://repo/codex-config/processes` | All execution flows |
| `gitnexus://repo/codex-config/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
