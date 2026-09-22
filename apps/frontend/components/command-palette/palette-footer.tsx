function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-sans text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
      {children}
    </kbd>
  );
}

export function PaletteFooter({ canGoBack }: { canGoBack: boolean }) {
  return (
    <div className="hidden items-center gap-4 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500 sm:flex dark:border-slate-700 dark:text-slate-400">
      <span className="flex items-center gap-1">
        <Key>↑</Key>
        <Key>↓</Key> navegar
      </span>
      <span className="flex items-center gap-1">
        <Key>↵</Key> abrir
      </span>
      {canGoBack && (
        <span className="flex items-center gap-1">
          <Key>⌫</Key> volver
        </span>
      )}
      <span className="ml-auto flex items-center gap-1">
        <Key>esc</Key> {canGoBack ? "atrás" : "cerrar"}
      </span>
    </div>
  );
}
