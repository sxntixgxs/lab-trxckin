import { normalizeSearchText } from "../search-text";

export type RankKey = {
  /** Identifiers the user may type verbatim: invoice number, NIT, consecutivo, code. */
  ids: string[];
  /** Free text (names) used for the weakest match tier. */
  text: string;
  active?: boolean;
};

function compact(value: string): string {
  return normalizeSearchText(value).replace(/[\s.\-]/g, "");
}

function score(term: string, key: RankKey): number {
  const q = compact(term);
  const ids = key.ids.map(compact).filter(Boolean);
  let tier = 3;
  if (ids.some((id) => id === q)) tier = 0;
  else if (ids.some((id) => id.startsWith(q))) tier = 1;
  else if (normalizeSearchText(key.text).includes(normalizeSearchText(term))) tier = 2;
  // Active records win ties inside a tier.
  return tier * 2 + (key.active === false ? 1 : 0);
}

/**
 * Orders search results: exact identifier, identifier prefix, text match, anything else.
 * Stable, so the search index relevance order is kept inside a tier. Shared by the Convex
 * `globalSearch.buscar` query and the client.
 */
export function rankRecords<T>(term: string, rows: T[], keyOf: (row: T) => RankKey): T[] {
  return rows
    .map((row, index) => ({ row, index, score: score(term, keyOf(row)) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.row);
}
