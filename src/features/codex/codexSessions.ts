export type CodexSessionSummary = {
  id: string;
  sessionId?: string;
  title: string;
  cwd?: string;
  path: string;
  relativePath: string;
  createdAt?: string;
  lastTimestamp?: string;
  cliVersion?: string;
  modelProvider?: string;
  size: number;
  modifiedMs?: number;
  messageCount: number;
  userMessageCount: number;
  parseError?: string;
};

export type CodexSessionMonthGroup = {
  key: string;
  label: string;
  sessions: CodexSessionSummary[];
  totalSize: number;
};

export type CodexSessionYearGroup = {
  key: string;
  label: string;
  months: CodexSessionMonthGroup[];
  sessionCount: number;
  totalSize: number;
};

export type CodexSessionBrowserState = {
  years: CodexSessionYearGroup[];
  selectedYearKey: string | null;
  selectedYear?: CodexSessionYearGroup;
  totalSessionSize: number;
};

export function codexSessionBrowserState(
  sessions: CodexSessionSummary[],
  activeYear: string | null,
): CodexSessionBrowserState {
  const years = groupCodexSessionsByYear(sessions);
  const selectedYearKey =
    activeYear && years.some((year) => year.key === activeYear)
      ? activeYear
      : years[0]?.key ?? null;

  return {
    years,
    selectedYearKey,
    selectedYear: years.find((year) => year.key === selectedYearKey),
    totalSessionSize: sessions.reduce((total, session) => total + session.size, 0),
  };
}

export function toggleCollapsedMonth(
  collapsedMonths: Record<string, boolean>,
  monthKey: string,
) {
  return {
    ...collapsedMonths,
    [monthKey]: !collapsedMonths[monthKey],
  };
}

export function sessionsOlderThanCount(
  sessions: CodexSessionSummary[],
  days: number,
  nowMs = Date.now(),
) {
  const cutoffMs = nowMs - days * 24 * 60 * 60 * 1000;

  return sessions.filter((session) => (
    typeof session.modifiedMs === "number" && session.modifiedMs < cutoffMs
  )).length;
}

export function groupCodexSessionsByYear(sessions: CodexSessionSummary[]) {
  const yearsByKey = new Map<string, CodexSessionYearGroup>();

  for (const session of sessions) {
    const groupInfo = sessionYearMonthGroupInfo(session);
    const year =
      yearsByKey.get(groupInfo.yearKey) ??
      {
        key: groupInfo.yearKey,
        label: groupInfo.yearLabel,
        months: [],
        sessionCount: 0,
        totalSize: 0,
      };
    let month = year.months.find((candidate) => candidate.key === groupInfo.monthKey);

    if (!month) {
      month = {
        key: groupInfo.monthKey,
        label: groupInfo.monthLabel,
        sessions: [],
        totalSize: 0,
      };
      year.months.push(month);
    }

    month.sessions.push(session);
    month.totalSize += session.size;
    year.sessionCount += 1;
    year.totalSize += session.size;
    yearsByKey.set(year.key, year);
  }

  return Array.from(yearsByKey.values())
    .map((year) => ({
      ...year,
      months: year.months.sort((left, right) => compareSessionGroupKeys(left.key, right.key)),
    }))
    .sort((left, right) => compareSessionGroupKeys(left.key, right.key));
}

function compareSessionGroupKeys(left: string, right: string) {
  if (left === "unfiled") {
    return 1;
  }
  if (right === "unfiled") {
    return -1;
  }

  return right.localeCompare(left);
}

function sessionYearMonthGroupInfo(session: CodexSessionSummary) {
  const [year, month] = session.relativePath.split(/[\\/]/);

  if (/^\d{4}$/.test(year ?? "") && /^(0[1-9]|1[0-2])$/.test(month ?? "")) {
    return {
      yearKey: year,
      yearLabel: `${year}`,
      monthKey: `${year}/${month}`,
      monthLabel: `${month} 月`,
    };
  }

  return {
    yearKey: "unfiled",
    yearLabel: "未分组",
    monthKey: "unfiled",
    monthLabel: "未分组",
  };
}
