const decimal = new Intl.NumberFormat("zh-CN");
const relativeTime = new Intl.RelativeTimeFormat("zh-CN", {
  numeric: "auto",
});
const absoluteTime = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatCount(value: number): string {
  return decimal.format(value);
}

export function formatRelativeTime(unixSeconds: number): string {
  const delta = Math.round(unixSeconds - Date.now() / 1000);
  const absolute = Math.abs(delta);
  if (absolute < 45) return "刚刚";
  if (absolute < HOUR) {
    return relativeTime.format(Math.round(delta / MINUTE), "minute");
  }
  if (absolute < DAY) {
    return relativeTime.format(Math.round(delta / HOUR), "hour");
  }
  if (absolute < MONTH) {
    return relativeTime.format(Math.round(delta / DAY), "day");
  }
  if (absolute < YEAR) {
    return relativeTime.format(Math.round(delta / MONTH), "month");
  }
  return relativeTime.format(Math.round(delta / YEAR), "year");
}

export function formatAbsoluteTime(unixSeconds: number): string {
  return absoluteTime.format(new Date(unixSeconds * 1000));
}

export function fileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function parentPath(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const match = normalized.match(/^(.*)[\\/][^\\/]+$/);
  return match?.[1] ?? "";
}

export function formatRecentTime(openedAt: number): string {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - openedAt) / 60_000),
  );
  if (elapsedMinutes < 1) {
    return "刚刚";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} 分钟前`;
  }
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}
