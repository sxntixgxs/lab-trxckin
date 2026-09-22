import { matchesSearchText, normalizeSearchText } from "@/lib/search-text";

export type FilterableCommand = { label: string; keywords?: string[] };

/**
 * Accent-insensitive, token-based filter for local commands. Commands whose label starts
 * with the query come first; the original order is kept otherwise.
 */
export function filterCommands<T extends FilterableCommand>(commands: T[], query: string): T[] {
  const q = normalizeSearchText(query);
  if (!q) return commands;
  const matches = commands.filter((command) =>
    matchesSearchText([command.label, ...(command.keywords ?? [])].join(" "), q),
  );
  const prefix: T[] = [];
  const rest: T[] = [];
  for (const command of matches) {
    (normalizeSearchText(command.label).startsWith(q) ? prefix : rest).push(command);
  }
  return [...prefix, ...rest];
}
