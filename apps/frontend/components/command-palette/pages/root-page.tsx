"use client";

import {
  ArrowLeftRight,
  Building2,
  Clock,
  LogOut,
  Palette,
  Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { useSessionActions } from "@/hooks/useSessionActions";
import { filterCommands } from "@/lib/command-palette/filter";
import { buildNavCommands } from "@/lib/command-palette/nav-commands";
import type { RecentEntry } from "@/lib/command-palette/recents";
import { NAV_ITEMS } from "@/lib/nav";
import { useCommandPaletteStore } from "@/store/command-palette-store";
import { RecordGroups } from "../record-groups";
import type { GlobalSearchState } from "../use-global-search";

type Action = {
  id: string;
  label: string;
  icon: LucideIcon;
  keywords: string[];
  run: () => void;
};

export function RootPage({
  query,
  close,
  recents,
  addRecent,
  search,
}: {
  query: string;
  close: () => void;
  recents: RecentEntry[];
  addRecent: (entry: Omit<RecentEntry, "at">) => void;
  search: GlobalSearchState;
}) {
  const router = useRouter();
  const { hasAccessTo } = useCurrentUser();
  const { mostrarSelector, empresaActivaInfo, empresaActiva, setEmpresaActiva } = useEmpresaFilter();
  const { isImpersonating, restore, logout } = useSessionActions();
  const pushPage = useCommandPaletteStore((state) => state.pushPage);

  const navCommands = useMemo(() => buildNavCommands(NAV_ITEMS, hasAccessTo), [hasAccessTo]);

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];
    if (mostrarSelector) {
      list.push({
        id: "cambiar-empresa",
        label: "Cambiar empresa…",
        icon: Building2,
        keywords: ["empresa", "company", "compañia"],
        run: () => pushPage("empresas"),
      });
    }
    list.push({
      id: "cambiar-tema",
      label: "Cambiar tema…",
      icon: Palette,
      keywords: ["tema", "oscuro", "claro", "dark", "light", "theme"],
      run: () => pushPage("tema"),
    });
    if (isImpersonating) {
      list.push({
        id: "volver-cuenta",
        label: "Volver a mi cuenta",
        icon: Undo2,
        keywords: ["impersonar", "actuando", "restaurar"],
        run: () => {
          close();
          void restore();
        },
      });
    }
    list.push({
      id: "cerrar-sesion",
      label: "Cerrar sesión",
      icon: LogOut,
      keywords: ["salir", "logout", "sign out"],
      run: () => {
        close();
        void logout();
      },
    });
    return list;
  }, [mostrarSelector, isImpersonating, pushPage, close, restore, logout]);

  const q = query.trim();
  const visibleRecents = q
    ? []
    : recents.filter((entry) => hasAccessTo(entry.permission));
  const pages = filterCommands(navCommands, q);
  const visibleActions = filterCommands(actions, q);

  const goTo = (entry: Omit<RecentEntry, "at">) => {
    addRecent(entry);
    // Onboarding boards only list the active company's rows.
    const esOnboarding = entry.kind === "proveedor" || entry.kind === "cliente";
    if (esOnboarding && entry.empresa !== undefined && empresaActiva !== null && empresaActiva !== entry.empresa) {
      setEmpresaActiva(entry.empresa);
    }
    close();
    router.push(entry.href);
  };

  return (
    <>
      {visibleRecents.length > 0 && (
        <CommandGroup heading="Recientes">
          {visibleRecents.map((entry) => (
            <CommandItem
              key={`${entry.kind}:${entry.id}`}
              value={`reciente:${entry.kind}:${entry.id}`}
              onSelect={() => goTo(entry)}
            >
              <Clock className="mr-2 h-4 w-4 text-slate-400" aria-hidden />
              <span className="flex-1 truncate">{entry.label}</span>
              {entry.sublabel && (
                <span className="ml-2 truncate text-xs text-slate-400">{entry.sublabel}</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {pages.length > 0 && (
        <CommandGroup heading="Ir a">
          {pages.map((command) => {
            const Icon = command.icon;
            return (
              <CommandItem
                key={command.id}
                value={`pagina:${command.id}`}
                onSelect={() =>
                  goTo({
                    kind: "page",
                    id: command.id,
                    label: command.label,
                    sublabel: command.section !== "General" ? command.section : undefined,
                    href: command.href,
                    permission: command.permission,
                  })
                }
              >
                <Icon className="mr-2 h-4 w-4 text-slate-400" aria-hidden />
                <span className="flex-1 truncate">{command.label}</span>
                {command.section !== "General" && (
                  <span className="ml-2 text-xs text-slate-400">{command.section}</span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}

      {visibleActions.length > 0 && (
        <CommandGroup heading="Acciones">
          {visibleActions.map((action) => {
            const Icon = action.icon;
            return (
              <CommandItem key={action.id} value={`accion:${action.id}`} onSelect={action.run}>
                <Icon className="mr-2 h-4 w-4 text-slate-400" aria-hidden />
                <span className="flex-1">{action.label}</span>
                {action.id === "cambiar-empresa" && (
                  <span className="ml-2 flex items-center gap-1 text-xs text-slate-400">
                    <ArrowLeftRight className="h-3 w-3" aria-hidden />
                    {empresaActivaInfo?.nombreCorto ?? "Todas"}
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}

      <RecordGroups search={search} close={close} addRecent={addRecent} />
    </>
  );
}
