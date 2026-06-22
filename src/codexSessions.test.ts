import { describe, expect, it } from "vitest";
import {
  codexSessionBrowserState,
  sessionsOlderThanCount,
  toggleCollapsedMonth,
  type CodexSessionSummary,
} from "./codexSessions";

const sessions: CodexSessionSummary[] = [
  {
    id: "2026/06/08/rollout-alpha.jsonl",
    title: "Alpha",
    path: "/Users/test/.codex/sessions/2026/06/08/rollout-alpha.jsonl",
    relativePath: "2026/06/08/rollout-alpha.jsonl",
    createdAt: "2026-06-08T00:00:00.000Z",
    size: 1024,
    modifiedMs: 2_000,
    messageCount: 4,
    userMessageCount: 2,
  },
  {
    id: "2025/12/24/rollout-beta.jsonl",
    title: "Beta",
    path: "/Users/test/.codex/sessions/2025/12/24/rollout-beta.jsonl",
    relativePath: "2025/12/24/rollout-beta.jsonl",
    createdAt: "2025-12-24T00:00:00.000Z",
    size: 512,
    modifiedMs: 1_000,
    messageCount: 2,
    userMessageCount: 1,
  },
  {
    id: "loose.jsonl",
    title: "Loose",
    path: "/Users/test/.codex/sessions/loose.jsonl",
    relativePath: "loose.jsonl",
    size: 256,
    modifiedMs: 3_000,
    messageCount: 0,
    userMessageCount: 0,
  },
];

describe("Codex session browser state", () => {
  it("groups sessions by newest year and month, with unfiled last", () => {
    const state = codexSessionBrowserState(sessions, null);

    expect(state.totalSessionSize).toBe(1792);
    expect(state.selectedYearKey).toBe("2026");
    expect(state.years.map((year) => year.key)).toEqual(["2026", "2025", "unfiled"]);
    expect(state.years[0]).toMatchObject({
      key: "2026",
      sessionCount: 1,
      totalSize: 1024,
      months: [
        {
          key: "2026/06",
          label: "06 月",
          totalSize: 1024,
        },
      ],
    });
    expect(state.years[2]).toMatchObject({
      key: "unfiled",
      label: "未分组",
      months: [{ key: "unfiled", label: "未分组" }],
    });
  });

  it("uses an active year when present and falls back when stale", () => {
    expect(codexSessionBrowserState(sessions, "2025").selectedYear?.label).toBe("2025");
    expect(codexSessionBrowserState(sessions, "2030").selectedYear?.label).toBe("2026");
    expect(codexSessionBrowserState([], "2026")).toMatchObject({
      selectedYearKey: null,
      selectedYear: undefined,
      totalSessionSize: 0,
    });
  });

  it("keeps collapse state explicit", () => {
    expect(toggleCollapsedMonth({}, "2026/06")).toEqual({ "2026/06": true });
    expect(toggleCollapsedMonth({ "2026/06": true }, "2026/06")).toEqual({
      "2026/06": false,
    });
  });

  it("counts sessions older than a fixed day threshold", () => {
    expect(sessionsOlderThanCount(sessions, 1, 24 * 60 * 60 * 1000 + 2_500)).toBe(2);
    expect(sessionsOlderThanCount(sessions, 7, 3_000)).toBe(0);
    expect(
      sessionsOlderThanCount(
        [{ ...sessions[0]!, modifiedMs: undefined }],
        1,
        10 * 24 * 60 * 60 * 1000,
      ),
    ).toBe(0);
  });
});
