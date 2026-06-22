import { describe, expect, it } from "vitest";
import {
  claudeSessionsOlderThanCount,
  groupClaudeSessionsByProject,
  type ClaudeSessionSummary,
} from "./claudeState";

function session(overrides: Partial<ClaudeSessionSummary>): ClaudeSessionSummary {
  return {
    id: "p/a.jsonl",
    title: "t",
    project: "/repo",
    path: "/x/p/a.jsonl",
    relativePath: "p/a.jsonl",
    size: 10,
    messageCount: 1,
    userMessageCount: 1,
    ...overrides,
  };
}

describe("groupClaudeSessionsByProject", () => {
  it("groups sessions by project and sums size", () => {
    const groups = groupClaudeSessionsByProject([
      session({ id: "1", project: "/repo/a", size: 10 }),
      session({ id: "2", project: "/repo/a", size: 5 }),
      session({ id: "3", project: "/repo/b", size: 7 }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["/repo/a", "/repo/b"]);
    expect(groups[0].sessions).toHaveLength(2);
    expect(groups[0].totalSize).toBe(15);
    expect(groups[1].totalSize).toBe(7);
  });
});

describe("claudeSessionsOlderThanCount", () => {
  it("counts sessions modified before the cutoff", () => {
    const now = 30 * 24 * 60 * 60 * 1000;
    const count = claudeSessionsOlderThanCount(
      [
        session({ id: "old", modifiedMs: now - 8 * 24 * 60 * 60 * 1000 }),
        session({ id: "fresh", modifiedMs: now - 1 * 24 * 60 * 60 * 1000 }),
      ],
      7,
      now,
    );

    expect(count).toBe(1);
  });
});
