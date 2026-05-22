# TODOS

## Schema

### Runtime schema refresh workflow

**What:** Add a workflow that refreshes the bundled Codex config schema from the official upstream schema, diffs changes, and preserves product metadata.

**Why:** The first schema foundation slice uses bundled schema metadata for speed and stability, but Codex can add or change configuration fields over time.

**Context:** `/plan-eng-review` intentionally deferred runtime schema refresh from the first slice. Build it after `config_schema.rs` and `schema_write.rs` are stable so refresh has a clear target structure. The workflow should fetch the official schema, show added/removed/changed fields, keep labels/groups/risk metadata where possible, and mark stale fields safely.

**Effort:** M
**Priority:** P2
**Depends on:** Schema Foundation Slice

## Completed
