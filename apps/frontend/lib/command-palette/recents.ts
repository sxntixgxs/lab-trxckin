export const RECENT_KINDS = [
  "page",
  "factura",
  "anticipo",
  "proveedor",
  "cliente",
  "centroCosto",
] as const;

export type RecentKind = (typeof RECENT_KINDS)[number];

export type RecentEntry = {
  kind: RecentKind;
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  /** Permission needed to open it again (re-checked when rendering). */
  permission?: string;
  /** Company of the record, when it has one. */
  empresa?: number;
  at: number;
};

export const MAX_RECENTS = 6;

/** Scoped per effective user so an admin's recents never show while impersonating. */
export function recentsKey(userId: string): string {
  return `trxckin:cmdk:recents:${userId}`;
}

function isRecentEntry(value: unknown): value is RecentEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === "string" &&
    (RECENT_KINDS as readonly string[]).includes(v.kind) &&
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.href === "string" &&
    v.href.startsWith("/") &&
    typeof v.at === "number" &&
    (v.sublabel === undefined || typeof v.sublabel === "string") &&
    (v.permission === undefined || typeof v.permission === "string") &&
    (v.empresa === undefined || typeof v.empresa === "number")
  );
}

export function parseRecents(raw: string | null): RecentEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentEntry).slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function pushRecent(
  list: RecentEntry[],
  entry: RecentEntry,
  max: number = MAX_RECENTS,
): RecentEntry[] {
  const rest = list.filter((item) => !(item.kind === entry.kind && item.id === entry.id));
  return [entry, ...rest].slice(0, max);
}
