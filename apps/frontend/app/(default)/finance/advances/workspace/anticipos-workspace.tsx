"use client";

import { useQuery } from "@tanstack/react-query";
import { useConvex, useQuery as useConvexQuery } from "convex/react";
import { BarChart3, Inbox, Plus, Settings2, UserRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/useCurrentUser";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { cn } from "@/lib/utils";
import { AnticipoDetailDialog } from "../dashboard/components/AnticipoWorkflowParts";
import type { AnticipoRoleConfig, AnticipoRow, UsuarioInfo } from "../dashboard/types";
import { fetchUsuarios } from "../dashboard/utils";
import {
  bagWorkspacePageNumber,
  buildBagWorkspaceSearchParams,
  DEFAULT_BAG_SORT,
  DEFAULT_BAG_STATUS,
  isBagDetailDialogOpen,
  parseBagWorkspaceUrl,
  shouldRefetchBagItems,
  shouldRefreshBagItemsOnAnticipoClose,
} from "./bag-workspace-utils";
import { AnticiposBagDetailDialog } from "./components/anticipos-bag-detail-dialog";
import { AnticiposBagsView } from "./components/anticipos-bags-view";
import { AnticiposInbox } from "./components/anticipos-inbox";
import { AnticiposOperationalDashboard } from "./components/anticipos-operational-dashboard";
import { AnticiposReviewDialog, type ReviewDialogMode } from "./components/anticipos-review-dialog";
import { AnticiposSettingsView } from "./components/anticipos-settings-view";
import { MyAnticiposView } from "./components/my-anticipos-view";
import {
  useAnticiposBagItems,
  useAnticiposBags,
  useAnticiposDashboardSummary,
  useAnticiposItems,
  useAnticiposWorkload,
} from "./hooks/use-anticipos-data";
import type {
  AnticiposBagSummary,
  AnticiposFilters,
  AnticiposScope,
  AnticiposWorkspaceView,
} from "./types";
import { canAccessAnticiposSettings } from "./workspace-utils";

const DEFAULT_FILTERS: AnticiposFilters = {
  search: "",
  urgency: "all",
  mode: "backlog",
  preset: "mes_actual",
};

const VIEW_META: Record<
  AnticiposWorkspaceView,
  { label: string; description: string; icon: typeof Inbox }
> = {
  buzon: {
    label: "Buzón",
    description: "Decisiones y tareas asignadas",
    icon: Inbox,
  },
  mine: {
    label: "Mis solicitudes",
    description: "Seguimiento personal",
    icon: UserRound,
  },
  dashboard: {
    label: "Dashboard",
    description: "Flujo y carga operativa",
    icon: BarChart3,
  },
  bags: {
    label: "Bolsas",
    description: "Saldo por empresa y proceso",
    icon: WalletCards,
  },
  settings: {
    label: "Configuración",
    description: "Responsables y administración",
    icon: Settings2,
  },
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

export function AnticiposWorkspace({
  canManage,
  canRequest,
}: {
  canManage: boolean;
  canRequest: boolean;
}) {
  const { data: session } = useSession();
  const convex = useConvex();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const bagUrlState = useMemo(() => parseBagWorkspaceUrl(searchParams), [searchParams]);
  const bagOpenTriggerRef = useRef<HTMLButtonElement | null>(null);
  const bagItemsDirtyRef = useRef(false);
  const {
    empresaActiva,
    empresaActivaInfo,
    empresasParaFiltro,
    mostrarSelector,
    opcionesSelector,
    setEmpresaActiva,
  } = useEmpresaFilter();
  const [view, setView] = useState<AnticiposWorkspaceView>(canManage ? "buzon" : "mine");
  const [bagSearch, setBagSearch] = useState("");
  const [bagEstado, setBagEstado] = useState(DEFAULT_BAG_STATUS);
  const [bagOrden, setBagOrden] = useState(DEFAULT_BAG_SORT);
  const [bagCursorHistory, setBagCursorHistory] = useState<string[]>([]);
  const deferredBagSearch = useDeferredValue(bagSearch);
  const [filters, setFilters] = useState<AnticiposFilters>(DEFAULT_FILTERS);
  const deferredSearch = useDeferredValue(filters.search);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<AnticipoRow | null>(null);
  const [reviewItems, setReviewItems] = useState<AnticipoRow[]>([]);
  const [reviewMode, setReviewMode] = useState<ReviewDialogMode>("review");
  const rolesConfig = useConvexQuery(api.financiero.anticipos.obtenerRolesConfig, {}) as
    | AnticipoRoleConfig[]
    | undefined;
  const canConfigure = canAccessAnticiposSettings({
    userId: session?.user?.id,
    roleId: session?.user?.id_rol,
    empresa: empresaActiva,
    roles: rolesConfig,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["usuarios"],
    queryFn: fetchUsuarios,
    staleTime: 5 * 60 * 1000,
  });
  const usersById = useMemo(
    () => new Map<string, UsuarioInfo>(users.map((user) => [user.id, user])),
    [users]
  );

  const scope: AnticiposScope = view === "buzon" ? "buzon" : view === "mine" ? "mine" : "visible";
  const itemsEnabled = ["buzon", "mine", "dashboard"].includes(view);
  const cursor = cursorHistory[cursorHistory.length - 1];
  const queryFilters = useMemo(
    () => ({ ...filters, search: deferredSearch }),
    [deferredSearch, filters]
  );
  const itemsQuery = useAnticiposItems({
    empresas: empresasParaFiltro,
    scope,
    filters: queryFilters,
    pageSize: 20,
    cursor,
    enabled: itemsEnabled,
  });
  const summaryQuery = useAnticiposDashboardSummary({
    empresas: empresasParaFiltro,
    filters,
    enabled: canManage && view === "dashboard",
  });
  const workloadQuery = useAnticiposWorkload({
    empresas: empresasParaFiltro,
    enabled: canManage && (view === "dashboard" || view === "buzon"),
  });
  const bagsQuery = useAnticiposBags({
    empresas: empresasParaFiltro,
    enabled: canManage && view === "bags",
  });
  const bagItemsQuery = useAnticiposBagItems({
    bolsaId: bagUrlState.bagId,
    empresas: empresasParaFiltro,
    q: deferredBagSearch,
    estado: bagEstado,
    orden: bagOrden,
    cursor: bagCursorHistory[bagCursorHistory.length - 1],
    enabled: canManage && view === "bags" && Boolean(bagUrlState.bagId),
  });

  const resetKey = [
    view,
    empresasParaFiltro.join(","),
    deferredSearch,
    filters.phase,
    filters.urgency,
    filters.coverage,
    filters.responsible,
    filters.kpi,
    filters.mode,
    filters.preset,
    filters.from,
    filters.to,
  ].join("|");
  const bagFilterResetKey = [bagUrlState.bagId, deferredBagSearch, bagEstado, bagOrden].join("|");

  useEffect(() => {
    void resetKey;
    setCursorHistory([]);
    setSelectedIds([]);
  }, [resetKey]);

  useEffect(() => {
    void bagFilterResetKey;
    setBagCursorHistory([]);
  }, [bagFilterResetKey]);

  useEffect(() => {
    const nextView = bagUrlState.view ?? (canManage ? "buzon" : "mine");
    setView((current) => (current === nextView ? current : nextView));
  }, [bagUrlState.view, canManage]);

  useEffect(() => {
    setBagSearch(bagUrlState.q);
    setBagEstado(bagUrlState.estado);
    setBagOrden(bagUrlState.orden);
  }, [bagUrlState.q, bagUrlState.estado, bagUrlState.orden]);

  useEffect(() => {
    if (bagUrlState.bagId) return;
    const trigger = bagOpenTriggerRef.current;
    if (!trigger) return;
    bagOpenTriggerRef.current = null;
    requestAnimationFrame(() => trigger.focus());
  }, [bagUrlState.bagId]);

  function replaceWorkspaceSearch(next: URLSearchParams) {
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function patchBagUrl(
    patch: Partial<{
      view: AnticiposWorkspaceView;
      bagId: string | null;
      q: string;
      estado: typeof bagEstado;
      orden: typeof bagOrden;
      clearBag: boolean;
    }>
  ) {
    replaceWorkspaceSearch(buildBagWorkspaceSearchParams(searchParams, patch));
  }

  const rows = itemsQuery.data?.page ?? [];
  const availableViews: AnticiposWorkspaceView[] = canManage
    ? ["buzon", "mine", "dashboard", "bags", ...(canConfigure ? ["settings" as const] : [])]
    : ["mine"];

  useEffect(() => {
    if (view === "settings" && !canConfigure) setView(canManage ? "buzon" : "mine");
  }, [canConfigure, canManage, view]);

  function patchFilters(patch: Partial<AnticiposFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function changeView(next: AnticiposWorkspaceView) {
    setView(next);
    setFilters((current) => ({
      ...current,
      search: "",
      phase: undefined,
      urgency: "all",
      coverage: undefined,
      responsible: undefined,
      kpi: undefined,
      mode: "backlog",
      preset: "mes_actual",
      from: undefined,
      to: undefined,
    }));
    patchBagUrl({
      view: next,
      clearBag: true,
      q: "",
      estado: DEFAULT_BAG_STATUS,
      orden: DEFAULT_BAG_SORT,
    });
  }

  function openBagDetail(bag: AnticiposBagSummary, trigger: HTMLButtonElement | null) {
    if (!bag.bolsaId) return;
    bagOpenTriggerRef.current = trigger;
    patchBagUrl({
      view: "bags",
      bagId: bag.bolsaId,
      q: "",
      estado: DEFAULT_BAG_STATUS,
      orden: DEFAULT_BAG_SORT,
    });
  }

  function closeBagDetail() {
    const trigger = bagOpenTriggerRef.current;
    patchBagUrl({
      view: "bags",
      clearBag: true,
      q: "",
      estado: DEFAULT_BAG_STATUS,
      orden: DEFAULT_BAG_SORT,
    });
    requestAnimationFrame(() => trigger?.focus());
  }

  function openReview(selected: AnticipoRow[]) {
    setReviewMode("review");
    setReviewItems(selected);
    setDetail(null);
  }

  function openIndividualAction(row: AnticipoRow, mode: ReviewDialogMode) {
    setReviewMode(mode);
    setReviewItems([row]);
    setDetail(null);
  }

  async function openDetailById(anticipoId: string) {
    try {
      const anticipo = await convex.query(api.financiero.anticipos.obtenerAnticipoPorId, {
        id: anticipoId as Id<"anticipos">,
      });
      if (!anticipo) {
        toast.error("No se encontró el anticipo.");
        return;
      }
      setDetail(anticipo as AnticipoRow);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo abrir el anticipo.");
    }
  }

  function handleAnticipoDetailChange(anticipo: AnticipoRow) {
    setDetail(anticipo);
    if (bagUrlState.bagId) {
      bagItemsDirtyRef.current = true;
    }
  }

  function handleAnticipoDetailOpenChange(open: boolean) {
    if (open) return;
    const shouldRefresh = shouldRefreshBagItemsOnAnticipoClose(
      bagUrlState.bagId,
      bagItemsDirtyRef.current
    );
    setDetail(null);
    if (shouldRefresh) {
      bagItemsDirtyRef.current = false;
      void bagItemsQuery.refetch();
      void bagsQuery.refetch();
    }
  }

  const bagDetailDialogOpen = isBagDetailDialogOpen(bagUrlState, Boolean(detail));
  const bagDetailSuspended = Boolean(bagUrlState.bagId) && Boolean(detail);

  async function refreshAll() {
    await Promise.all([
      itemsQuery.refetch(),
      summaryQuery.refetch(),
      workloadQuery.refetch(),
      bagsQuery.refetch(),
      ...(shouldRefetchBagItems(bagUrlState.bagId) ? [bagItemsQuery.refetch()] : []),
    ]);
  }

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 pb-12 sm:px-5 lg:px-7">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        {mostrarSelector && opcionesSelector.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Empresa activa">
            {opcionesSelector.map((option) => (
              <button
                key={option.id ?? "all"}
                type="button"
                onClick={() => setEmpresaActiva(option.id)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  empresaActiva === option.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                )}
              >
                {option.nombre}
              </button>
            ))}
          </div>
        ) : null}

        <header className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                  Anticipos
                </h1>
                <Badge
                  variant="outline"
                  className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-800"
                >
                  Finanzas
                </Badge>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                {VIEW_META[view].description}
                {empresaActivaInfo?.nombre ? ` · ${empresaActivaInfo.nombre}` : ""}
              </p>
            </div>
            {canRequest ? (
              <Button asChild className="gap-2 self-start rounded-lg lg:self-auto">
                <Link href="/finance/advances/request">
                  <Plus className="h-4 w-4" />
                  Solicitar anticipo
                </Link>
              </Button>
            ) : null}
          </div>

          <nav
            className="mt-4 flex gap-1 overflow-x-auto border-t border-slate-100 pt-3"
            aria-label="Vistas de Anticipos"
          >
            {availableViews.map((item) => {
              const meta = VIEW_META[item];
              const Icon = meta.icon;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => changeView(item)}
                  aria-current={view === item ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                    view === item
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </button>
              );
            })}
          </nav>
        </header>

        {empresasParaFiltro.length === 0 ? (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Selecciona una empresa para cargar Anticipos.
          </div>
        ) : null}

        {view === "buzon" ? (
          <AnticiposInbox
            rows={rows}
            isLoading={itemsQuery.isLoading || itemsQuery.isFetching}
            error={errorMessage(itemsQuery.error)}
            filters={filters}
            onFiltersChange={patchFilters}
            owners={workloadQuery.data ?? []}
            usersById={usersById}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            onReview={openReview}
            onIndividualAction={openIndividualAction}
            onDetail={setDetail}
            canGoBack={cursorHistory.length > 0}
            canGoNext={!itemsQuery.data?.isDone}
            onPreviousPage={() => setCursorHistory((current) => current.slice(0, -1))}
            onNextPage={() => {
              if (itemsQuery.data?.continueCursor) {
                setCursorHistory((current) => [...current, itemsQuery.data!.continueCursor]);
              }
            }}
          />
        ) : null}

        {view === "mine" ? (
          <MyAnticiposView
            rows={rows}
            filters={filters}
            onFiltersChange={patchFilters}
            isLoading={itemsQuery.isLoading || itemsQuery.isFetching}
            error={errorMessage(itemsQuery.error)}
            onDetail={setDetail}
            canGoBack={cursorHistory.length > 0}
            canGoNext={!itemsQuery.data?.isDone}
            onPreviousPage={() => setCursorHistory((current) => current.slice(0, -1))}
            onNextPage={() => {
              if (itemsQuery.data?.continueCursor) {
                setCursorHistory((current) => [...current, itemsQuery.data!.continueCursor]);
              }
            }}
          />
        ) : null}

        {view === "dashboard" ? (
          <AnticiposOperationalDashboard
            summary={summaryQuery.data}
            workload={workloadQuery.data ?? []}
            rows={rows}
            filters={filters}
            onFiltersChange={patchFilters}
            isLoading={summaryQuery.isLoading}
            isRefreshing={
              summaryQuery.isFetching || workloadQuery.isFetching || itemsQuery.isFetching
            }
            error={errorMessage(summaryQuery.error ?? workloadQuery.error ?? itemsQuery.error)}
            onRefresh={() => void refreshAll()}
            onDetail={setDetail}
            canGoBack={cursorHistory.length > 0}
            canGoNext={!itemsQuery.data?.isDone}
            onPreviousPage={() => setCursorHistory((current) => current.slice(0, -1))}
            onNextPage={() => {
              if (itemsQuery.data?.continueCursor) {
                setCursorHistory((current) => [...current, itemsQuery.data!.continueCursor]);
              }
            }}
          />
        ) : null}

        {view === "bags" ? (
          <AnticiposBagsView
            bags={bagsQuery.data ?? []}
            isLoading={bagsQuery.isLoading}
            error={errorMessage(bagsQuery.error)}
            onDetail={(anticipoId) => void openDetailById(anticipoId)}
            onOpenBag={openBagDetail}
          />
        ) : null}

        {view === "settings" ? (
          <AnticiposSettingsView empresa={empresaActiva} onChanged={() => void refreshAll()} />
        ) : null}
      </div>

      <AnticiposReviewDialog
        open={reviewItems.length > 0}
        items={reviewItems}
        mode={reviewMode}
        onOpenChange={(open) => {
          if (!open) setReviewItems([]);
        }}
        onComplete={() => {
          setSelectedIds([]);
          void refreshAll();
        }}
        usersById={usersById}
      />

      {view === "bags" && bagUrlState.bagId ? (
        <AnticiposBagDetailDialog
          open={bagDetailDialogOpen}
          suspendedForAnticipoDetail={bagDetailSuspended}
          onOpenChange={(open) => {
            if (!open && !detail) closeBagDetail();
          }}
          data={bagItemsQuery.data}
          isLoading={bagItemsQuery.isLoading}
          isFetching={bagItemsQuery.isFetching}
          error={errorMessage(bagItemsQuery.error)}
          q={bagSearch}
          estado={bagEstado}
          orden={bagOrden}
          canGoBack={bagCursorHistory.length > 0}
          canGoNext={!bagItemsQuery.data?.isDone}
          pageNumber={bagWorkspacePageNumber(bagCursorHistory.length)}
          onRetry={() => void bagItemsQuery.refetch()}
          onSearchChange={(value) => {
            setBagSearch(value);
            patchBagUrl({ q: value, bagId: bagUrlState.bagId });
          }}
          onEstadoChange={(value) => {
            setBagEstado(value);
            patchBagUrl({ estado: value, bagId: bagUrlState.bagId });
          }}
          onOrdenChange={(value) => {
            setBagOrden(value);
            patchBagUrl({ orden: value, bagId: bagUrlState.bagId });
          }}
          onClearFilters={() => {
            setBagSearch("");
            setBagEstado(DEFAULT_BAG_STATUS);
            setBagOrden(DEFAULT_BAG_SORT);
            patchBagUrl({
              bagId: bagUrlState.bagId,
              q: "",
              estado: DEFAULT_BAG_STATUS,
              orden: DEFAULT_BAG_SORT,
            });
          }}
          onPreviousPage={() => setBagCursorHistory((current) => current.slice(0, -1))}
          onNextPage={() => {
            if (bagItemsQuery.data?.continueCursor) {
              setBagCursorHistory((current) => [...current, bagItemsQuery.data!.continueCursor]);
            }
          }}
          onDetail={(anticipoId) => void openDetailById(anticipoId)}
        />
      ) : null}

      <AnticipoDetailDialog
        anticipo={detail}
        usuariosById={usersById}
        onAnticipoChanged={handleAnticipoDetailChange}
        onOpenChange={handleAnticipoDetailOpenChange}
      />
    </div>
  );
}
