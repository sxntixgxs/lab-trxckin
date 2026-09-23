"use client";

import {
  AlertTriangle,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Ellipsis,
  Eye,
  FileSearch,
  Landmark,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { faseLabels, formatterCOP } from "../../dashboard/constants";
import type { AnticipoRow, UsuarioInfo } from "../../dashboard/types";
import {
  formatDate,
  getDefaultReturnTarget,
  getEstadoClass,
  getPrincipalBulkAction,
  normalizeFaseActual,
} from "../../dashboard/utils";
import { getValorContableAnticipo } from "../../lib/valor-contable-anticipo";
import type { AnticiposFilters, AnticiposOwnerWorkload } from "../types";
import {
  type AnticiposInboxQuickFilter,
  getInboxQuickFilterPatch,
  isInboxQuickFilterActive,
  resolveAnticipoAssigneeName,
} from "../workspace-utils";
import type { ReviewDialogMode } from "./anticipos-review-dialog";

type InboxProps = {
  rows: AnticipoRow[];
  isLoading: boolean;
  error?: string;
  filters: AnticiposFilters;
  owners: AnticiposOwnerWorkload[];
  usersById: ReadonlyMap<string, UsuarioInfo>;
  onFiltersChange: (patch: Partial<AnticiposFilters>) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  onReview: (rows: AnticipoRow[]) => void;
  onIndividualAction: (row: AnticipoRow, mode: ReviewDialogMode) => void;
  /** Whether the viewer may annul this row (see `canAnularAnticipo`). */
  canAnular: (row: AnticipoRow) => boolean;
  onDetail: (row: AnticipoRow) => void;
  canGoBack: boolean;
  canGoNext: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

const PHASE_OPTIONS = [
  "II_APROBACION_JEFE_DIRECTO",
  "III_REVISION_CONTABILIDAD",
  "IV_APROBACION_GERENCIA",
  "IV_DESEMBOLSO_TESORERIA",
  "V_PENDIENTE_LEGALIZACION",
] as const;

function daysUntil(timestamp: number) {
  return Math.ceil((timestamp - Date.now()) / 86_400_000);
}

function urgencyMeta(row: AnticipoRow) {
  if (row.faseActual !== "V_PENDIENTE_LEGALIZACION") return null;
  const days = daysUntil(row.maxLegalizacionDate);
  if (days < 0) {
    return {
      label: `Vencido hace ${Math.abs(days)} d`,
      className: "border-rose-200 bg-rose-50 text-rose-800",
    };
  }
  if (days <= 7) {
    return {
      label: days === 0 ? "Vence hoy" : `Vence en ${days} d`,
      className: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }
  return null;
}

function RowPrimaryAction({
  row,
  onReview,
  onIndividualAction,
  onOpen,
}: {
  row: AnticipoRow;
  onReview: () => void;
  onIndividualAction: (mode: ReviewDialogMode) => void;
  onOpen: () => void;
}) {
  if (getPrincipalBulkAction(row.faseActual)) {
    return (
      <Button type="button" size="sm" className="h-9 gap-2 rounded-lg" onClick={onReview}>
        <ShieldCheck className="h-4 w-4" />
        Revisar
      </Button>
    );
  }
  if (row.faseActual === "IV_DESEMBOLSO_TESORERIA") {
    return (
      <Button
        type="button"
        size="sm"
        className="h-9 gap-2 rounded-lg bg-blue-600 hover:bg-blue-700"
        onClick={() => onIndividualAction("desembolso")}
      >
        <Landmark className="h-4 w-4" />
        Desembolso
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-9 gap-2 rounded-lg"
      onClick={onOpen}
    >
      <FileSearch className="h-4 w-4" />
      Trazabilidad
    </Button>
  );
}

function InboxRow({
  row,
  selected,
  selectionMode,
  assigneeName,
  canAnular,
  onSelectedChange,
  onReview,
  onIndividualAction,
  onDetail,
  onOpen,
}: {
  row: AnticipoRow;
  selected: boolean;
  selectionMode: boolean;
  assigneeName: string;
  canAnular: boolean;
  onSelectedChange: (selected: boolean) => void;
  onReview: () => void;
  onIndividualAction: (mode: ReviewDialogMode) => void;
  onDetail: () => void;
  onOpen: () => void;
}) {
  const selectable = Boolean(getPrincipalBulkAction(row.faseActual));
  const urgency = urgencyMeta(row);
  const accountingValue = getValorContableAnticipo(row);
  const legalized = row.saldoLegalizado ?? 0;
  const returnTarget = getDefaultReturnTarget(
    row.faseActual,
    row.responsableOrigen,
    row.cubreFacturaCompleta,
    row.tipoBolsa
  );

  return (
    <article
      role="button"
      tabIndex={selectionMode && !selectable ? -1 : 0}
      aria-disabled={selectionMode && !selectable ? true : undefined}
      aria-pressed={selectionMode ? selected : undefined}
      onClick={() => {
        if (selectionMode) {
          if (selectable) onSelectedChange(!selected);
          return;
        }
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (selectionMode) {
          if (selectable) onSelectedChange(!selected);
          return;
        }
        onOpen();
      }}
      className={cn(
        "group grid gap-4 px-4 py-4 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-5 lg:items-center",
        selectionMode
          ? "lg:grid-cols-[28px_minmax(220px,1.2fr)_minmax(180px,.9fr)_minmax(170px,.8fr)_auto]"
          : "lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,.9fr)_minmax(170px,.8fr)_auto]",
        selected
          ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300"
          : selectionMode && !selectable
            ? "cursor-not-allowed bg-slate-50/70 opacity-60"
            : "cursor-pointer bg-white hover:bg-slate-50"
      )}
    >
      {selectionMode ? (
        <div
          className="hidden lg:block"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            disabled={!selectable}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
            aria-label={`Seleccionar anticipo ${row.consecutivo}`}
          />
        </div>
      ) : null}

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <div
              className="lg:hidden"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Checkbox
                checked={selected}
                disabled={!selectable}
                onCheckedChange={(checked) => onSelectedChange(checked === true)}
                aria-label={`Seleccionar anticipo ${row.consecutivo}`}
              />
            </div>
          ) : null}
          <div className="min-w-0 text-left">
            <span className="block text-sm font-semibold text-slate-950">
              Anticipo #{row.consecutivo}
            </span>
            <span className="mt-0.5 block truncate text-sm text-slate-600">{row.razonSocial}</span>
            <span className="block text-xs text-slate-500">NIT {row.nit}</span>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <Badge
          variant="outline"
          className={cn("max-w-full rounded-full", getEstadoClass(row.faseActual))}
        >
          <span className="truncate">
            {faseLabels[normalizeFaseActual(row.faseActual)] ?? row.faseActual}
          </span>
        </Badge>
        <p className="mt-2 truncate text-xs text-slate-500">Asignado a {assigneeName}</p>
      </div>

      <div>
        <p className="text-sm font-semibold tabular-nums text-slate-950">
          {formatterCOP.format(accountingValue)}
        </p>
        {row.faseActual === "V_PENDIENTE_LEGALIZACION" ? (
          <p className="mt-1 text-xs tabular-nums text-slate-500">
            Pendiente {formatterCOP.format(Math.max(0, accountingValue - legalized))}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Solicitado {formatDate(row.createdAt)}</p>
        )}
        {urgency ? (
          <Badge
            variant="outline"
            className={cn("mt-2 rounded-full text-[11px]", urgency.className)}
          >
            {urgency.label}
          </Badge>
        ) : null}
      </div>

      <div
        className={cn(
          "flex items-center justify-end gap-2",
          selectionMode && "pointer-events-none invisible"
        )}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <RowPrimaryAction
          row={row}
          onReview={onReview}
          onIndividualAction={onIndividualAction}
          onOpen={onOpen}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg"
              aria-label="Más acciones"
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onDetail}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalle
            </DropdownMenuItem>
            {returnTarget ? (
              <DropdownMenuItem onClick={() => onIndividualAction("devolver")}>
                <CornerUpLeft className="mr-2 h-4 w-4" />
                Devolver
              </DropdownMenuItem>
            ) : null}
            {canAnular ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-700 focus:bg-rose-50 focus:text-rose-800"
                  onClick={() => onIndividualAction("anular")}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Anular anticipo
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}

export function AnticiposInbox({
  rows,
  isLoading,
  error,
  filters,
  owners,
  usersById,
  onFiltersChange,
  selectedIds,
  onSelectedIdsChange,
  onReview,
  onIndividualAction,
  canAnular,
  onDetail,
  canGoBack,
  canGoNext,
  onPreviousPage,
  onNextPage,
}: InboxProps) {
  const [selectionMode, setSelectionMode] = useState(false);
  const selectedRows = rows.filter((row) => selectedIds.includes(String(row._id)));
  const selectableRows = rows.filter((row) => Boolean(getPrincipalBulkAction(row.faseActual)));
  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((row) => selectedIds.includes(String(row._id)));

  function setSelected(id: string, selected: boolean) {
    onSelectedIdsChange(
      selected
        ? Array.from(new Set([...selectedIds, id]))
        : selectedIds.filter((current) => current !== id)
    );
  }

  function cancelSelection() {
    setSelectionMode(false);
    onSelectedIdsChange([]);
  }

  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      aria-labelledby="anticipos-inbox-title"
    >
      <header className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h2
              id="anticipos-inbox-title"
              className="flex items-center gap-2 text-base font-semibold text-slate-950"
            >
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Buzón de decisiones
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Solicitudes asignadas a tu usuario o rol operativo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectionMode ? (
              <>
                <Badge
                  variant="outline"
                  className="h-9 rounded-full bg-slate-50 px-3 text-slate-700"
                >
                  {selectedIds.length} seleccionados
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={selectableRows.length === 0}
                  onClick={() =>
                    onSelectedIdsChange(
                      allSelected ? [] : selectableRows.map((row) => String(row._id))
                    )
                  }
                >
                  {allSelected ? "Deseleccionar página" : "Seleccionar página"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-2"
                  disabled={selectedRows.length === 0}
                  onClick={() => {
                    setSelectionMode(false);
                    onReview(selectedRows);
                  }}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Revisar selección
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={cancelSelection}
                >
                  Cancelar
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-2"
                disabled={selectableRows.length === 0}
                onClick={() => setSelectionMode(true)}
              >
                <CheckSquare2 className="h-4 w-4" />
                Seleccionar varios
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="flex flex-wrap gap-2">
            {[
              { value: "all", label: "Todas" },
              { value: "legalization", label: "Por legalizar" },
              { value: "overdue", label: "Vencidas" },
              { value: "due_soon", label: "Próximas" },
              { value: "returned", label: "Devueltas" },
              { value: "integrity", label: "Por revisar" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  onFiltersChange(
                    getInboxQuickFilterPatch(option.value as AnticiposInboxQuickFilter)
                  )
                }
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  isInboxQuickFilterActive(filters, option.value as AnticiposInboxQuickFilter)
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 lg:flex-row">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={filters.search}
              onChange={(event) => onFiltersChange({ search: event.target.value })}
              placeholder="Buscar consecutivo, tercero o NIT"
              className="h-10 bg-white pl-9 pr-9"
            />
            {filters.search ? (
              <button
                type="button"
                onClick={() => onFiltersChange({ search: "" })}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Select
            value={filters.phase ?? "all"}
            onValueChange={(value) =>
              onFiltersChange({
                phase: value === "all" ? undefined : value,
                urgency: "all",
              })
            }
          >
            <SelectTrigger className="h-10 w-full bg-white lg:w-[250px]">
              <SelectValue placeholder="Todas las fases" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las fases</SelectItem>
              {PHASE_OPTIONS.map((phase) => (
                <SelectItem key={phase} value={phase}>
                  {faseLabels[phase]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.coverage ?? "all"}
            onValueChange={(value) =>
              onFiltersChange({
                coverage: value === "all" ? undefined : (value as "total" | "parcial"),
              })
            }
          >
            <SelectTrigger className="h-10 w-full bg-white lg:w-[190px]">
              <SelectValue placeholder="Cobertura" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda cobertura</SelectItem>
              <SelectItem value="total">Factura completa</SelectItem>
              <SelectItem value="parcial">Cobertura parcial</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.responsible ?? "all"}
            onValueChange={(value) =>
              onFiltersChange({ responsible: value === "all" ? undefined : value })
            }
          >
            <SelectTrigger className="h-10 w-full bg-white lg:w-[220px]">
              <SelectValue placeholder="Responsable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los responsables</SelectItem>
              {owners
                .filter((owner): owner is AnticiposOwnerWorkload & { userId: string } =>
                  Boolean(owner.userId)
                )
                .map((owner) => (
                  <SelectItem key={owner.userId} value={owner.userId}>
                    {owner.nombre} · {owner.rol}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="flex min-h-11 items-center border-b border-slate-200 bg-slate-50 px-4 text-xs text-slate-600 sm:px-5">
        {rows.length} solicitudes en esta página
      </div>

      {error ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center">
          <AlertTriangle className="h-7 w-7 text-rose-600" />
          <p className="text-sm font-semibold text-slate-900">No se pudo cargar el Buzón</p>
          <p className="max-w-md text-sm text-slate-600">{error}</p>
        </div>
      ) : isLoading ? (
        <div className="divide-y divide-slate-100" aria-label="Cargando anticipos">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="grid gap-4 px-5 py-5 lg:grid-cols-4">
              <div className="h-10 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
              <div className="h-10 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
              <div className="h-10 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
              <div className="h-10 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <CheckSquare2 className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm font-semibold text-slate-900">Tu Buzón está al día</p>
          <p className="mt-1 max-w-md text-sm text-slate-600">
            No hay decisiones que coincidan con estos filtros. Las nuevas asignaciones aparecerán
            aquí.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {rows.map((row) => (
            <InboxRow
              key={String(row._id)}
              row={row}
              selected={selectedIds.includes(String(row._id))}
              selectionMode={selectionMode}
              assigneeName={resolveAnticipoAssigneeName(row, usersById, owners)}
              canAnular={canAnular(row)}
              onSelectedChange={(selected) => setSelected(String(row._id), selected)}
              onReview={() => onReview([row])}
              onIndividualAction={(mode) => onIndividualAction(row, mode)}
              onDetail={() => onDetail(row)}
              onOpen={() => {
                if (getPrincipalBulkAction(row.faseActual)) {
                  onReview([row]);
                } else if (row.faseActual === "IV_DESEMBOLSO_TESORERIA") {
                  onIndividualAction(row, "desembolso");
                } else if (row.faseActual === "V_PENDIENTE_LEGALIZACION") {
                  onIndividualAction(row, "readonly");
                } else {
                  onDetail(row);
                }
              }}
            />
          ))}
        </div>
      )}

      <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 sm:px-5">
        <p className="text-xs text-slate-500">20 solicitudes por página</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={onPreviousPage}
            disabled={!canGoBack}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={onNextPage}
            disabled={!canGoNext}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </section>
  );
}
