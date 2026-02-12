export type RecentServer = {
  code: string;
  targetUrl: string;
  at: string;
  favorite?: boolean;
};

const RECENT_KEY = "privatechat_desktop_recent_servers_v1";

export function readRecentServers(): RecentServer[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentServer[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 8);
  } catch {
    return [];
  }
}

export function writeRecentServer(next: RecentServer): RecentServer[] {
  const current = readRecentServers();
  const existing = current.find((item) => item.code === next.code);
  const merged = [
    { ...existing, ...next },
    ...current.filter((item) => item.code !== next.code),
  ].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage write errors
  }
  return merged;
}

export function removeRecentServer(code: string): RecentServer[] {
  const next = readRecentServers().filter((item) => item.code !== code);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore storage write errors
  }
  return next;
}

export function toggleFavoriteServer(code: string): RecentServer[] {
  const next = readRecentServers()
    .map((item) =>
      item.code === code ? { ...item, favorite: !item.favorite } : item,
    )
    .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)));
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore storage write errors
  }
  return next;
}
