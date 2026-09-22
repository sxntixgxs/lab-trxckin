"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { Command, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { cn } from "@/lib/utils";
import { useCommandPaletteStore, type PalettePage } from "@/store/command-palette-store";
import { PaletteFooter } from "./palette-footer";
import { EmpresasPage } from "./pages/empresas-page";
import { RootPage } from "./pages/root-page";
import { TemaPage } from "./pages/tema-page";
import { useCommandPaletteShortcut } from "./use-command-palette-shortcut";
import { useGlobalSearch, type GlobalSearchState } from "./use-global-search";
import { useRecents } from "./use-recents";

const PLACEHOLDERS: Record<PalettePage, string> = {
  root: "Busca páginas, acciones, facturas, NIT, anticipos…",
  empresas: "Buscar empresa…",
  tema: "Buscar tema…",
};

const PAGE_TITLES: Partial<Record<PalettePage, string>> = {
  empresas: "Cambiar empresa",
  tema: "Cambiar tema",
};

/** Convex `useQuery` throws on server errors; keep the rest of the palette usable. */
class SearchErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="px-4 py-3 text-sm text-red-600 dark:text-red-400">
          No se pudo buscar. Intenta de nuevo.
        </div>
      );
    }
    return this.props.children;
  }
}

/** Mounted once in the authenticated shell. Opens with Ctrl/Cmd+K, "/" or the header button. */
export function CommandPalette() {
  useCommandPaletteShortcut();
  const open = useCommandPaletteStore((state) => state.open);
  const setOpen = useCommandPaletteStore((state) => state.setOpen);
  const pages = useCommandPaletteStore((state) => state.pages);
  const popPage = useCommandPaletteStore((state) => state.popPage);
  const page = pages[pages.length - 1] ?? "root";
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => {
            // Esc on a sub-page goes back instead of closing.
            if (page !== "root") {
              event.preventDefault();
              popPage();
            }
          }}
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 flex w-full max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "max-sm:inset-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-w-none max-sm:translate-x-0 max-sm:rounded-none max-sm:border-0",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Paleta de comandos</DialogPrimitive.Title>
          {open && <PaletteBody page={page} close={close} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteBody({ page, close }: { page: PalettePage; close: () => void }) {
  const popPage = useCommandPaletteStore((state) => state.popPage);
  const [query, setQuery] = useState("");

  // Each page starts with an empty input.
  useEffect(() => setQuery(""), [page]);

  return (
    <Command
      key={page}
      shouldFilter={false}
      loop
      className="flex min-h-0 flex-1 flex-col rounded-none bg-transparent [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-item]]:gap-0 [&_[cmdk-item]]:rounded-lg [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2"
      onKeyDown={(event) => {
        if (event.key === "Backspace" && query === "" && page !== "root") {
          event.preventDefault();
          popPage();
        }
      }}
    >
      <div className="flex items-center border-b border-slate-200 dark:border-slate-700">
        {page !== "root" && (
          <button
            type="button"
            onClick={popPage}
            className="ml-2 flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-3 w-3" aria-hidden />
            {PAGE_TITLES[page]}
          </button>
        )}
        <div className="min-w-0 flex-1 [&_[cmdk-input-wrapper]]:border-b-0">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={PLACEHOLDERS[page]}
            inputMode="search"
            className="h-12 text-[15px]"
          />
        </div>
        <button
          type="button"
          onClick={close}
          className="mr-3 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 sm:hidden dark:hover:bg-slate-800"
        >
          Cerrar
        </button>
      </div>

      <CommandList className="max-h-[min(60vh,440px)] px-1 py-1 max-sm:max-h-none max-sm:flex-1">
        {page === "root" && (
          <SearchErrorBoundary resetKey={query}>
            <RootSection query={query} close={close} />
          </SearchErrorBoundary>
        )}
        {page === "empresas" && <EmpresasPage query={query} close={close} />}
        {page === "tema" && <TemaPage query={query} close={close} />}
        {page !== "root" && <CommandEmpty>Sin resultados para “{query.trim()}”.</CommandEmpty>}
      </CommandList>

      <PaletteFooter canGoBack={page !== "root"} />
    </Command>
  );
}

/** Root page plus the record search. Lives inside the error boundary because `useQuery` throws. */
function RootSection({ query, close }: { query: string; close: () => void }) {
  const { backendUser } = useCurrentUser();
  const { empresaActiva, empresasParaFiltro, canAccessAllEmpresas } = useEmpresaFilter();
  const { recents, addRecent } = useRecents(backendUser?.id ?? null);
  const multiEmpresa = empresaActiva === null && (canAccessAllEmpresas || empresasParaFiltro.length > 1);
  const search = useGlobalSearch(query, empresaActiva, multiEmpresa);

  return (
    <>
      <RootPage query={query} close={close} recents={recents} addRecent={addRecent} search={search} />
      <SearchHints search={search} query={query} />
    </>
  );
}

function SearchHints({ search, query }: { search: GlobalSearchState; query: string }) {
  if (search.tooShort) {
    return <Hint>Escribe al menos 2 caracteres para buscar registros.</Hint>;
  }
  if (search.loading) {
    return (
      <Hint>
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Buscando registros…
      </Hint>
    );
  }
  return <CommandEmpty>Sin resultados para “{query.trim()}”.</CommandEmpty>;
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <CommandPrimitive.Loading>
      <p className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">{children}</p>
    </CommandPrimitive.Loading>
  );
}
