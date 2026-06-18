import { describe, expect, it } from "vitest";
import {
  globalSkillsWorkspace,
  importedSkillBatchPath,
  importedSkillPath,
  type SkillState,
  type SkillSummary,
} from "./globalSkills";

const skills: SkillSummary[] = [
  {
    name: "tdd",
    description: "Test-driven development workflow.",
    path: "/Users/test/.codex/skills/tdd/SKILL.md",
    directory: "/Users/test/.codex/skills/tdd",
    source: "Codex global skills",
    enabled: true,
    configured: true,
    size: 2048,
  },
  {
    name: "triage",
    description: "Bug triage workflow.",
    path: "/Users/test/.agents/skills/triage/SKILL.md",
    directory: "/Users/test/.agents/skills/triage",
    source: "Agent global skills",
    enabled: false,
    configured: false,
    size: 1024,
  },
];

const state: SkillState = {
  roots: [],
  skills,
};

describe("global skills workspace", () => {
  it("filters skills and builds result labels", () => {
    expect(globalSkillsWorkspace(state, "", null, null)).toMatchObject({
      normalizedQuery: "",
      visibleSkills: skills,
      selectedSkill: skills[0],
      selectedMarkdown: "",
      resultLabel: "2 skills",
    });

    expect(globalSkillsWorkspace(state, " TRIAGE ", null, null)).toMatchObject({
      normalizedQuery: "triage",
      visibleSkills: [skills[1]],
      selectedSkill: skills[1],
      resultLabel: "1 / 2 skills",
    });
  });

  it("keeps selected skill by path and hides stale content", () => {
    expect(
      globalSkillsWorkspace(state, "", skills[1]!.path, {
        name: "triage",
        path: skills[1]!.path,
        rawMarkdown: "# triage",
      }),
    ).toMatchObject({
      selectedSkill: skills[1],
      selectedMarkdown: "# triage",
    });

    expect(
      globalSkillsWorkspace(state, "", skills[1]!.path, {
        name: "tdd",
        path: skills[0]!.path,
        rawMarkdown: "# stale",
      }).selectedMarkdown,
    ).toBe("");
  });

  it("prefers imported Agent global skills when choosing next selection", () => {
    const importedSkills = [
      {
        ...skills[0]!,
        path: "/Users/test/.codex/skills/imported/SKILL.md",
        directory: "/Users/test/.codex/skills/imported",
        source: "Codex global skills",
      },
      {
        ...skills[1]!,
        path: "/Users/test/.agents/skills/imported/SKILL.md",
        directory: "/Users/test/.agents/skills/imported",
        source: "Agent global skills",
      },
    ];

    expect(importedSkillPath(importedSkills, "/Users/test/skills/imported")).toBe(
      "/Users/test/.agents/skills/imported/SKILL.md",
    );
    expect(importedSkillPath(skills, "/Users/test/skills/missing")).toBe(skills[0]!.path);
    expect(importedSkillPath([], "/Users/test/skills/missing")).toBeNull();
  });

  it("chooses the first imported batch skill before existing fallbacks", () => {
    const batchSkills = [
      {
        ...skills[0]!,
        path: "/Users/test/.agents/skills/alpha/SKILL.md",
        directory: "/Users/test/.agents/skills/alpha",
        source: "Agent global skills",
      },
      {
        ...skills[1]!,
        path: "/Users/test/.agents/skills/beta/SKILL.md",
        directory: "/Users/test/.agents/skills/beta",
        source: "Agent global skills",
      },
    ];

    expect(
      importedSkillBatchPath(
        batchSkills,
        [
          "/Users/test/.agents/skills/beta/SKILL.md",
          "/Users/test/.agents/skills/alpha/SKILL.md",
        ],
        ["/Users/test/skills/alpha"],
      ),
    ).toBe("/Users/test/.agents/skills/beta/SKILL.md");
    expect(
      importedSkillBatchPath(batchSkills, [], ["/Users/test/skills/alpha"]),
    ).toBe("/Users/test/.agents/skills/alpha/SKILL.md");
  });
});
