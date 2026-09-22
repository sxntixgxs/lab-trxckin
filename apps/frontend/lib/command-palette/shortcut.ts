import { isEditableTarget } from "@/lib/impersonate-client";

type ShortcutEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

/** Ctrl+K / Cmd+K, without Alt or Shift (those combos belong to the browser/OS). */
export function isCommandPaletteShortcut(event: ShortcutEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "k"
  );
}

/** Bare "/" outside of editable fields, like GitHub or Vercel. */
export function isSlashShortcut(event: ShortcutEvent, target: EventTarget | null): boolean {
  return (
    event.key === "/" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !isEditableTarget(target)
  );
}

export function isApplePlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function modifierLabel(platform: string): "⌘" | "Ctrl" {
  return isApplePlatform(platform) ? "⌘" : "Ctrl";
}
