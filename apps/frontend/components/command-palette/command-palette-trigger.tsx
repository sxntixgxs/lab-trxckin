"use client";

import { Search } from "lucide-react";
import { useSyncExternalStore } from "react";
import { modifierLabel } from "@/lib/command-palette/shortcut";
import { useCommandPaletteStore } from "@/store/command-palette-store";

const noopSubscribe = () => () => {};

function readPlatform(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || nav.platform || "";
}

/** "⌘" on Apple devices, "Ctrl" elsewhere. The server snapshot avoids a hydration mismatch. */
export function useModifierLabel() {
  return useSyncExternalStore(
    noopSubscribe,
    () => modifierLabel(readPlatform()),
    () => "Ctrl" as const,
  );
}

export function CommandPaletteTrigger() {
  const setOpen = useCommandPaletteStore((state) => state.setOpen);
  const mod = useModifierLabel();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-keyshortcuts="Control+K Meta+K"
      className="ml-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 sm:w-64 sm:px-3 sm:py-1.5 lg:ml-0 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only sm:not-sr-only sm:flex-1 sm:text-left">Buscar…</span>
      <kbd className="hidden items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500 sm:inline-flex dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
        {mod === "⌘" ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
