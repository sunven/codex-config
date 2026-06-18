export type SkillState = {
  roots: SkillRoot[];
  skills: SkillSummary[];
};

export type SkillRoot = {
  path: string;
  label: string;
  exists: boolean;
};

export type SkillSummary = {
  name: string;
  description?: string;
  path: string;
  directory: string;
  symlink?: boolean;
  targetDirectory?: string;
  source: string;
  enabled: boolean;
  configured: boolean;
  size: number;
  modifiedMs?: number;
};

export type SkillContent = {
  name: string;
  description?: string;
  path: string;
  rawMarkdown: string;
};

export type GlobalSkillsWorkspace = {
  normalizedQuery: string;
  visibleSkills: SkillSummary[];
  selectedSkill?: SkillSummary;
  selectedMarkdown: string;
  resultLabel: string;
};

export function globalSkillsWorkspace(
  state: SkillState,
  query: string,
  selectedPath: string | null,
  content: SkillContent | null,
): GlobalSkillsWorkspace {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSkills = normalizedQuery
    ? state.skills.filter((skill) => skillMatchesQuery(skill, normalizedQuery))
    : state.skills;
  const selectedSkill =
    state.skills.find((skill) => skill.path === selectedPath) ?? visibleSkills[0];

  return {
    normalizedQuery,
    visibleSkills,
    selectedSkill,
    selectedMarkdown:
      content && content.path === selectedSkill?.path ? content.rawMarkdown : "",
    resultLabel: normalizedQuery
      ? `${visibleSkills.length} / ${state.skills.length} skills`
      : `${state.skills.length} skills`,
  };
}

export function importedSkillPath(skills: SkillSummary[], selectedDirectory: string) {
  const importedDirectoryName = pathBasename(selectedDirectory);
  const imported =
    skills.find(
      (skill) =>
        skill.source === "Agent global skills" &&
        pathBasename(skill.directory) === importedDirectoryName,
    ) ??
    skills.find(
      (skill) =>
        skill.directory === selectedDirectory ||
        pathBasename(skill.directory) === importedDirectoryName,
    );

  return imported?.path ?? skills[0]?.path ?? null;
}

export function importedSkillBatchPath(
  skills: SkillSummary[],
  preferredSkillPaths: string[],
  fallbackDirectories: string[],
) {
  for (const skillPath of preferredSkillPaths) {
    const imported = skills.find(
      (skill) => skill.source === "Agent global skills" && skill.path === skillPath,
    );

    if (imported) {
      return imported.path;
    }
  }

  for (const directory of fallbackDirectories) {
    const imported = importedSkillPath(skills, directory);

    if (imported) {
      return imported;
    }
  }

  return skills[0]?.path ?? null;
}

function skillMatchesQuery(skill: SkillSummary, normalizedQuery: string) {
  return [skill.name, skill.description, skill.path, skill.source]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function pathBasename(path: string) {
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]+/);

  return parts[parts.length - 1] ?? normalized;
}
