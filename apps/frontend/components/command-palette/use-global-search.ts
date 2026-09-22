"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { normalizeSearchText } from "@/lib/search-text";

export type GlobalSearchResult = FunctionReturnType<typeof api.globalSearch.buscar>;

export type GlobalSearchState = {
  /** Debounced term the results belong to ("" when the search is idle). */
  term: string;
  data: GlobalSearchResult | null;
  loading: boolean;
  /** 1 character typed: too short for the server search. */
  tooShort: boolean;
  /** More than one company in scope, so rows show a company badge. */
  multiEmpresa: boolean;
};

export const MIN_SEARCH_LENGTH = 2;

/** Debounced, reactive record search. Keeps the previous result while the next one loads. */
export function useGlobalSearch(
  query: string,
  empresa: number | null,
  multiEmpresa: boolean,
): GlobalSearchState {
  const q = query.trim();
  const debounced = useDebouncedValue(q, 200);
  const enabled = normalizeSearchText(debounced).length >= MIN_SEARCH_LENGTH;
  const data = useQuery(
    api.globalSearch.buscar,
    enabled ? { q: debounced, empresa: empresa ?? undefined } : "skip",
  );

  // Keep the previous result on screen while the next term loads (no flicker).
  const [last, setLast] = useState<GlobalSearchResult | null>(null);
  if (enabled && data !== undefined && data !== last) setLast(data);

  const searching = normalizeSearchText(q).length >= MIN_SEARCH_LENGTH;
  return {
    term: enabled ? debounced : "",
    data: searching ? last : null,
    loading: searching && (debounced !== q || data === undefined),
    tooShort: normalizeSearchText(q).length === 1,
    multiEmpresa,
  };
}
