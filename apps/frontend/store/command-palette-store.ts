import { create } from "zustand";

export type PalettePage = "root" | "empresas" | "tema";

interface CommandPaletteState {
  open: boolean;
  /** Navigation stack; the last entry is the visible page. */
  pages: PalettePage[];
  setOpen: (open: boolean) => void;
  toggle: () => void;
  pushPage: (page: PalettePage) => void;
  popPage: () => void;
}

/** Shared by the header trigger and the global Ctrl/Cmd+K shortcut. Not persisted. */
export const useCommandPaletteStore = create<CommandPaletteState>()((set, get) => ({
  open: false,
  pages: ["root"],
  setOpen: (open) => set(open ? { open } : { open, pages: ["root"] }),
  toggle: () => get().setOpen(!get().open),
  pushPage: (page) => set((state) => ({ pages: [...state.pages, page] })),
  popPage: () =>
    set((state) => (state.pages.length > 1 ? { pages: state.pages.slice(0, -1) } : state)),
}));
