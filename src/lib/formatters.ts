export function displayPath(path: string, homeDir: string | undefined) {
  const home = normalizedHomeDir(homeDir);

  if (!home) {
    return path;
  }

  if (path.replace(/[\\/]+$/, "") === home) {
    return "~";
  }

  for (const separator of ["/", "\\"]) {
    const prefix = `${home}${separator}`;
    if (path.startsWith(prefix)) {
      return `~${separator}${path.slice(prefix.length)}`;
    }
  }

  return path;
}

export function formatIsoDateTime(value: string | undefined) {
  if (!value) {
    return "未知";
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function normalizedHomeDir(homeDir: string | undefined) {
  const trimmed = homeDir?.trim();

  if (!trimmed || trimmed === "." || trimmed === "/" || trimmed === "\\") {
    return undefined;
  }

  const normalized = trimmed.replace(/[\\/]+$/, "");

  return normalized && !/^[A-Za-z]:$/.test(normalized) ? normalized : undefined;
}
