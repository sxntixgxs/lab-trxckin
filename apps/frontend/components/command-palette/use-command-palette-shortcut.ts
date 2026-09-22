"use client";

import { useEffect } from "react";
import { isCommandPaletteShortcut, isSlashShortcut } from "@/lib/command-palette/shortcut";
import { useCommandPaletteStore } from "@/store/command-palette-store";

function anotherDialogIsOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

/** Global Ctrl/Cmd+K (toggle, works while typing) and "/" (open, outside inputs). */
export function useCommandPaletteShortcut() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      const { open, toggle, setOpen } = useCommandPaletteStore.getState();

      if (isCommandPaletteShortcut(event)) {
        // Otherwise browsers focus the address bar / search box.
        event.preventDefault();
        if (!open && anotherDialogIsOpen()) return;
        toggle();
        return;
      }

      if (!open && isSlashShortcut(event, event.target) && !anotherDialogIsOpen()) {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
