# 01. 安全发现 skill 目录软链

Status: done

## Parent

[PRD: 新增本地 Skill 软链导入功能](../PRD.md)

## What to build

Update global skill discovery so valid directory symlinks inside discovered global skill roots are treated like skill directories. A symlinked directory that contains `SKILL.md` should appear in the Skills workspace, be searchable, be previewable, and keep working with the existing enable/disable flow.

The scanner must remain safe: duplicate links to the same target should not duplicate the skill, recursive symlinks should not loop forever, broken symlinks should be ignored, and the existing scan-depth guard should still apply.

## Acceptance criteria

- [x] A valid symlinked skill directory under a global skills root is discovered and appears in app state with parsed name, description, path, directory, source, enabled state, size, and modified time.
- [x] Existing `read_skill_content` and skill enable/disable validation accept a discovered symlinked skill.
- [x] Duplicate symlinks to the same `SKILL.md` are deduplicated by canonical skill path.
- [x] Symlink cycles do not recurse forever and do not fail the whole skill scan.
- [x] Broken symlinks or symlinks without a readable `SKILL.md` are ignored rather than surfaced as skills.
- [x] Existing non-symlink skill discovery behavior and existing skill-store tests remain green.
- [x] New backend tests cover valid symlink discovery, duplicate/canonical dedupe, and cycle safety.

## Blocked by

None - can start immediately
