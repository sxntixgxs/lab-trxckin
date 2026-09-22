"use client";

import { useCallback, useEffect, useState } from "react";
import { parseRecents, pushRecent, recentsKey, type RecentEntry } from "@/lib/command-palette/recents";

/** Recent palette picks in localStorage, scoped to the effective (maybe impersonated) user. */
export function useRecents(userId: string | null) {
  const [recents, setRecents] = useState<RecentEntry[]>([]);

  useEffect(() => {
    if (!userId) {
      setRecents([]);
      return;
    }
    try {
      setRecents(parseRecents(window.localStorage.getItem(recentsKey(userId))));
    } catch {
      setRecents([]);
    }
  }, [userId]);

  const addRecent = useCallback(
    (entry: Omit<RecentEntry, "at">) => {
      if (!userId) return;
      setRecents((current) => {
        const next = pushRecent(current, { ...entry, at: Date.now() });
        try {
          window.localStorage.setItem(recentsKey(userId), JSON.stringify(next));
        } catch {
          // Storage can be unavailable (private mode, quota); recents are best-effort.
        }
        return next;
      });
    },
    [userId],
  );

  return { recents, addRecent };
}
