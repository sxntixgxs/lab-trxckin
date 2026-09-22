"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  CornerUpLeft,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  Landmark,
  Loader2,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { useQuery as useConvexQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getEmpresaNombre } from "@/lib/empresas";
import { cn } from "@/lib/utils";
import {
  ProveedorManualAlert,
  ProveedorOrigenInline,
  isProveedorManualOrigen,
} from "@/app/(default)/finance/advances/components/proveedor-manual-status";

import { fasesFlujoAnticipo, formatterCOP, faseLabels } from "../constants";
import type {
  AnticipoFase,
  AnticipoRow,
  Decision,
  DialogAction,
  UsuarioInfo,
} from "../types";
import {
  formatDate,
  getActionLabel,
  getDefaultReturnTarget,
  getEstadoClass,
  getPhaseProgress,
  getPrincipalAction,
  getPrincipalBulkAction,
  getUsuarioCargo,
  getUsuarioNombre,
  getUsuarioProceso,
  isClosed,
  matchesFaseFilter,
  normalizeFaseActual,
} from "../utils";
import {
  AnticipoPagoAmount,
  ValorContableCambioAnticipoBadge,
  type ValorContableCambioAnticipo,
} from "../../components/valor-contable-anticipo-ui";
import { getValorContableAnticipo } from "../../lib/valor-contable-anticipo";
import { getSaldoPendienteLegalizableAnticipo, getValorLegalizableAnticipo } from "../../lib/valor-legalizable-anticipo";
import { getCoberturaFacturaLabel } from "../../lib/anticipo-routing";
import { AnticipoAjusteSection } from "./AnticipoAjusteSection";

export const PAGE_SIZE = 20;
const ONE_DAY = 24 * 60 * 60 * 1000;

export const anticiposTableHeadClass =
  "sticky top-0 z-10 border-b border-slate-100 bg-slate-50/95 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-xs";

export const anticiposTableCellClass = "px-4 py-3 align-top";

export type DecisionDraft = {
  decision: Decision;
  observacion: string;
  archivos: File[];
};

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function daysUntil(timestamp: number) {
  return Math.ceil((timestamp - Date.now()) / ONE_DAY);
}

export function shortFormaPago(formaPago: string) {
  if (formaPago === "TRANSFERENCIA BANCARIA") return "Transferencia bancaria";
  if (formaPago === "TRANSFERENCIA PAGO ELECTRÓNICO") return "Pago electrónico";
  return formaPago;
}

export function PhaseProgress({ anticipo }: { anticipo: AnticipoRow }) {
  const faseNormalizada = normalizeFaseActual(anticipo.faseActual);
  const progress = getPhaseProgress(anticipo);
  const isRejected = faseNormalizada === "RECHAZADO";
  const isCanceled = faseNormalizada === "ANULADO";
  const isTerminal = faseNormalizada === "COMPLETADO";
  const barColor = isTerminal
    ? "bg-emerald-500"
    : faseNormalizada === "V_PENDIENTE_LEGALIZACION"
      ? "bg-amber-500"
      : "bg-gradient-to-r from-blue-500 to-cyan-500";
  const label = faseLabels[faseNormalizada] ?? faseNormalizada;

  if (isRejected || isCanceled) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "max-w-[220px] gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
          getEstadoClass(anticipo.faseActual)
        )}
      >
        <XCircle className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </Badge>
    );
  }

  return (
    <div className="space-y-2">
      <Badge
        variant="outline"
        className={cn(
          "max-w-[220px] gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
          getEstadoClass(anticipo.faseActual)
        )}
      >
        {isTerminal ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <Clock3 className="h-3 w-3" />
        )}
        <span className="truncate">{label}</span>
      </Badge>
      <div className="flex items-center gap-2">
        <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/70">
          <div
            className={cn(
              "h-full rounded-full shadow-xs transition-all",
              barColor
            )}
            style={{ width: `${progress.progress}%` }}
          />
        </div>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 ring-1 ring-inset ring-slate-200/70">
          {progress.done}/{progress.total}
        </span>
      </div>
    </div>
  );
}

export function FasesStatusLine({
  rows,
  faseFiltro,
  onFaseFiltroChange,
}: {
  rows: AnticipoRow[];
  faseFiltro: string;
  onFaseFiltroChange: (value: string) => void;
}) {
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    rows.forEach((row) => {
      const fase = normalizeFaseActual(row.faseActual);
      result[fase] = (result[fase] ?? 0) + 1;
    });
    return result;
  }, [rows]);

  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/70 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">
            Estado del flujo
          </p>
          <p className="text-xs font-medium text-slate-500">
            Consulta el volumen por fase operativa del anticipo.
          </p>
        </div>
        <Button
          type="button"
          variant={faseFiltro === "TODOS" ? "default" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => onFaseFiltroChange("TODOS")}
        >
          Todos
          <span className="ml-1 rounded-xs bg-white/20 px-1.5 font-mono text-[10px]">
            {rows.length}
          </span>
        </Button>
      </div>

      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {fasesFlujoAnticipo.map((fase, index) => {
          const count = counts[fase.faseKey] ?? 0;
          const selected = matchesFaseFilter(fase.faseKey, faseFiltro);
          const disabled = count === 0 && !selected;
          return (
            <div
              key={fase.faseKey}
              className="flex shrink-0 items-center gap-1"
            >
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 self-center text-slate-300" />
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onFaseFiltroChange(selected ? "TODOS" : fase.faseKey)
                }
                className={cn(
                  "flex min-h-14 min-w-[150px] flex-col items-start rounded-md border px-3 py-2 text-left transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500",
                  selected
                    ? "border-emerald-500 bg-emerald-600 text-white shadow-xs"
                    : count > 0
                      ? "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:text-slate-950 hover:shadow-xs"
                      : "cursor-default border-slate-100 bg-white/60 text-slate-400 opacity-60"
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-black leading-tight">
                    {fase.label}
                  </span>
                  <span
                    className={cn(
                      "rounded-xs px-1.5 font-mono text-[10px]",
                      selected ? "bg-white/20" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {count}
                  </span>
                </span>
                {fase.responsable && (
                  <span
                    className={cn(
                      "mt-1 text-[10px] font-medium leading-tight",
                      selected ? "text-white/80" : "text-slate-500"
                    )}
                  >
                    {fase.responsable}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SolicitanteCell({
  usuario,
  fallback,
}: {
  usuario?: UsuarioInfo;
  fallback: string;
}) {
  const nombre = getUsuarioNombre(usuario, fallback);
  const proceso = getUsuarioProceso(usuario);
  const cargo = getUsuarioCargo(usuario);

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[10px] font-semibold text-emerald-700">
        {nombre ? getInitials(nombre) : <User className="h-4 w-4" />}
      </div>
      <div className="min-w-0">
        <p
          className="block max-w-[200px] truncate text-xs font-semibold text-slate-800"
          title={nombre}
        >
          {nombre}
        </p>
        <p
          className="block max-w-[200px] truncate text-[10px] font-semibold text-slate-500"
          title={proceso}
        >
          {proceso}
        </p>
        <p
          className="block max-w-[200px] truncate text-[10px] font-medium text-slate-400"
          title={cargo}
        >
          {cargo}
        </p>
      </div>
    </div>
  );
}

export function AnticipoIdentityCell({
  anticipo,
  onOpenDetail,
}: {
  anticipo: AnticipoRow;
  onOpenDetail: (anticipo: AnticipoRow) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs font-semibold text-slate-400">
          #{anticipo.consecutivo}
        </span>
        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          {getEmpresaNombre(anticipo.empresa_id ?? anticipo.empresa ?? 1)}
        </span>
        <span
          className={cn(
            "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
            anticipo.cubreFacturaCompleta === false
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          )}
        >
          {getCoberturaFacturaLabel(anticipo)}
        </span>
        <ProveedorOrigenInline origen={anticipo.proveedorOrigen} />
      </div>
      <button
        type="button"
        onClick={() => onOpenDetail(anticipo)}
        className="mt-0.5 block max-w-full truncate text-left text-sm font-semibold text-slate-900 transition-colors hover:text-emerald-700"
        title={anticipo.razonSocial}
      >
        {anticipo.razonSocial}
      </button>
      <p className="mt-0.5 text-xs text-slate-500">NIT / Doc. {anticipo.nit}</p>
    </div>
  );
}

export function AnticipoPagoCell({ anticipo }: { anticipo: AnticipoRow }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-900">
        <AnticipoPagoAmount anticipo={anticipo} />
      </p>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
        {anticipo.formaPago === "TRANSFERENCIA BANCARIA" ? (
          <Landmark className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <CreditCard className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
        <span className="truncate">{shortFormaPago(anticipo.formaPago)}</span>
      </div>
      {anticipo.banco && (
        <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-slate-400">
          {anticipo.banco}
          {anticipo.numeroCuenta ? ` · ${anticipo.numeroCuenta}` : ""}
        </p>
      )}
    </div>
  );
}

export function AnticipoFechasCell({ anticipo }: { anticipo: AnticipoRow }) {
  const legalizacionDays = daysUntil(anticipo.maxLegalizacionDate);
  const legalizacionVencida =
    legalizacionDays < 0 && !isClosed(anticipo.faseActual);
  const legalizacionProxima =
    legalizacionDays <= 3 && !isClosed(anticipo.faseActual);

  return (
    <div className="min-w-0 space-y-1.5 text-xs">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Solicitud
        </p>
        <p className="font-medium text-slate-700">
          {formatDate(anticipo.createdAt)}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Última fase
        </p>
        <p className="text-slate-600">{formatDate(anticipo.ultimaFaseInicio)}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Legalización
        </p>
        <p
          className={cn(
            "font-medium",
            legalizacionVencida
              ? "text-rose-600"
              : legalizacionProxima
                ? "text-amber-700"
                : "text-slate-600"
          )}
        >
          {formatDate(anticipo.maxLegalizacionDate)}
        </p>
        {!isClosed(anticipo.faseActual) && (
          <p
            className={cn(
              "text-[11px]",
              legalizacionVencida
                ? "text-rose-500"
                : legalizacionProxima
                  ? "text-amber-600"
                  : "text-slate-400"
            )}
          >
            {legalizacionVencida
              ? `Vencido hace ${Math.abs(legalizacionDays)}d`
              : `${legalizacionDays}d restantes`}
          </p>
        )}
      </div>
    </div>
  );
}

export function DecisionControls({
  anticipo,
  draft,
  disabled,
  onChange,
}: {
  anticipo: AnticipoRow;
  draft?: DecisionDraft;
  disabled: boolean;
  onChange: (next?: DecisionDraft) => void;
}) {
  const approvalAction = getPrincipalBulkAction(anticipo.faseActual);
  const isActionable = Boolean(approvalAction) && !disabled;
  const isApproved = draft?.decision === "APROBADO";
  const isRejected = draft?.decision === "RECHAZADO";

  if (!approvalAction) {
    return (
      <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-400">
        Sin decisión
      </span>
    );
  }

  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        title={
          isActionable
            ? "Marcar para aprobar"
            : "Solo el responsable asignado puede decidir"
        }
        disabled={!isActionable}
        onClick={() =>
          onChange(
            isApproved
              ? undefined
              : {
                  decision: "APROBADO",
                  observacion: draft?.observacion ?? "",
                  archivos: draft?.archivos ?? [],
                }
          )
        }
        className={cn(
          "h-7 w-7 rounded-full",
          isApproved
            ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white"
            : "text-emerald-700 hover:bg-emerald-50"
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        title={
          isActionable
            ? "Marcar para rechazar"
            : "Solo el responsable asignado puede decidir"
        }
        disabled={!isActionable}
        onClick={() =>
          onChange(
            isRejected
              ? undefined
              : {
                  decision: "RECHAZADO",
                  observacion: draft?.observacion ?? "",
                  archivos: draft?.archivos ?? [],
                }
          )
        }
        className={cn(
          "h-7 w-7 rounded-full",
          isRejected
            ? "bg-rose-600 text-white hover:bg-rose-700 hover:text-white"
            : "text-rose-700 hover:bg-rose-50"
        )}
      >
        <XCircle className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function AnticipoActionsCell({
  anticipo,
  isAssignedToCurrentUser,
  decisionDraft,
  onDecisionChange,
  onOpenAction,
  onOpenDetail,
}: {
  anticipo: AnticipoRow;
  isAssignedToCurrentUser: boolean;
  decisionDraft?: DecisionDraft;
  onDecisionChange: (next?: DecisionDraft) => void;
  onOpenAction: (anticipo: AnticipoRow, action: DialogAction) => void;
  onOpenDetail: (anticipo: AnticipoRow) => void;
}) {
  const workflowAction = getPrincipalAction(anticipo.faseActual);
  const approvalAction = getPrincipalBulkAction(anticipo.faseActual);
  const isExternalLegalization =
    anticipo.faseActual === "V_PENDIENTE_LEGALIZACION";
  const requiresContabilidadModal = approvalAction === "contabilidad";
  const saldoLegalizado = anticipo.saldoLegalizado ?? 0;
  const saldoPendiente = getSaldoPendienteLegalizableAnticipo(anticipo);
  const legalizacionesFacturacion = anticipo.legalizacionesFacturacion ?? [];
  const returnTarget = getDefaultReturnTarget(
    anticipo.faseActual,
    anticipo.responsableOrigen,
    anticipo.cubreFacturaCompleta,
    anticipo.tipoBolsa
  );

  return (
    <div className="flex flex-col items-end gap-1.5">
      {requiresContabilidadModal ? (
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 rounded-lg px-3 text-xs font-semibold"
          disabled={!isAssignedToCurrentUser}
          onClick={() => onOpenAction(anticipo, "contabilidad")}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Revisar
        </Button>
      ) : approvalAction ? (
        <DecisionControls
          anticipo={anticipo}
          draft={decisionDraft}
          disabled={!isAssignedToCurrentUser}
          onChange={onDecisionChange}
        />
      ) : workflowAction ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg px-3 text-xs font-semibold"
          disabled={!isAssignedToCurrentUser}
          onClick={() => onOpenAction(anticipo, workflowAction)}
          title={getActionLabel(workflowAction)}
        >
          <Send className="h-3.5 w-3.5" />
          {workflowAction === "desembolso" ? "Desembolso" : "Gestionar"}
        </Button>
      ) : isExternalLegalization ? (
        <div className="w-full max-w-[160px] rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-2 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Saldo pendiente
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {formatterCOP.format(saldoPendiente)}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Legalizado {formatterCOP.format(saldoLegalizado)}
          </p>
          {legalizacionesFacturacion.length > 0 && (
            <div className="mt-1.5 space-y-0.5 border-t border-amber-100 pt-1.5">
              {legalizacionesFacturacion.slice(0, 2).map((row) => (
                <a
                  key={row._id}
                  href={`/billing/invoices/${row.facturaId}`}
                  className="block truncate text-[10px] font-medium text-amber-800 underline-offset-2 hover:underline"
                >
                  #{row.factura?.numeroFactura ?? row.facturaId} ·{" "}
                  {formatterCOP.format(row.valorAplicado)}
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span className="text-xs font-medium text-slate-400">Sin acción</span>
      )}

      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-lg px-2 text-xs font-medium text-slate-600 hover:text-slate-900"
          onClick={() => onOpenDetail(anticipo)}
        >
          <Eye className="h-3.5 w-3.5" />
          Detalle
        </Button>
        {workflowAction &&
          !isExternalLegalization &&
          returnTarget && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-orange-50 hover:text-orange-700"
              disabled={!isAssignedToCurrentUser}
              onClick={() => onOpenAction(anticipo, "devolver")}
            >
              <CornerUpLeft className="h-3.5 w-3.5" />
              Devolver
            </Button>
          )}
      </div>
    </div>
  );
}

export function AnticipoDetailDialog({
  anticipo,
  usuariosById,
  onOpenChange,
  onAnticipoChanged,
}: {
  anticipo: AnticipoRow | null;
  usuariosById: Map<string, UsuarioInfo>;
  onOpenChange: (open: boolean) => void;
  onAnticipoChanged?: (anticipo: AnticipoRow) => void;
}) {
  const [legalizacionSearchState, setLegalizacionSearchState] = useState({
    anticipoId: "",
    value: "",
  });
  const fases = useConvexQuery(
    api.financiero.anticipos.obtenerFasesDeAnticipo,
    anticipo ? { anticipoId: anticipo._id } : "skip"
  ) as AnticipoFase[] | undefined;

  const anticipoId = anticipo ? String(anticipo._id) : "";
  const legalizacionSearch =
    legalizacionSearchState.anticipoId === anticipoId
      ? legalizacionSearchState.value
      : "";

  const legalizacionesFacturacion = useMemo(
    () => anticipo?.legalizacionesFacturacion ?? [],
    [anticipo?.legalizacionesFacturacion]
  );

  const legalizacionesFiltradas = useMemo(() => {
    const termino = normalizeSearchText(legalizacionSearch).trim();
    if (!termino) return legalizacionesFacturacion;

    return legalizacionesFacturacion.filter((legalizacion) => {
      const factura = legalizacion.factura;
      const searchable = [
        legalizacion.facturaId,
        legalizacion.valorAplicado,
        formatterCOP.format(legalizacion.valorAplicado),
        factura?.numeroFactura,
        factura?.proveedorNombre,
      ]
        .map(normalizeSearchText)
        .join(" ");

      return searchable.includes(termino);
    });
  }, [legalizacionSearch, legalizacionesFacturacion]);

  if (!anticipo) return null;

  const solicitanteInfo = usuariosById.get(anticipo.createdById);
  const solicitante = getUsuarioNombre(solicitanteInfo, anticipo.createdById);
  const responsableInfo = anticipo.responsableUserId
    ? usuariosById.get(anticipo.responsableUserId)
    : undefined;
  const responsable = getUsuarioNombre(
    responsableInfo,
    anticipo.responsableNombre ??
      anticipo.responsableUserId ??
      anticipo.createdById
  );
  const rechazoPor = anticipo.rechazo?.rechazadoPorUserId
    ? getUsuarioNombre(
        usuariosById.get(anticipo.rechazo.rechazadoPorUserId),
        anticipo.rechazo.rechazadoPorUserId
      )
    : null;
  const anulacionPor = anticipo.anulacion?.anuladoPorUserId
    ? getUsuarioNombre(
        usuariosById.get(anticipo.anulacion.anuladoPorUserId),
        anticipo.anulacion.anuladoPorUserId
      )
    : null;

  return (
    <Dialog open={Boolean(anticipo)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-hidden p-0">
        <div className="max-h-[90vh] min-w-0 overflow-y-auto px-6 pb-6 pt-6">
          <DialogHeader className="min-w-0">
            <DialogTitle>Anticipo #{anticipo.consecutivo}</DialogTitle>
            <DialogDescription className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 max-w-full truncate">
                {anticipo.razonSocial}
              </span>
              <ProveedorOrigenInline origen={anticipo.proveedorOrigen} />
              <Badge
                variant="outline"
                className={cn(
                  "w-fit shrink-0 rounded-full",
                  getEstadoClass(anticipo.faseActual)
                )}
              >
                {faseLabels[normalizeFaseActual(anticipo.faseActual)] ??
                  anticipo.faseActual}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "w-fit shrink-0 rounded-full",
                  anticipo.cubreFacturaCompleta === false
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                )}
              >
                {getCoberturaFacturaLabel(anticipo)}
              </Badge>
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 min-w-0 space-y-4">
            {isProveedorManualOrigen(anticipo.proveedorOrigen) ? (
              <ProveedorManualAlert compact />
            ) : null}
            <div className="grid min-w-0 gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
              <DetailItem label="Tercero" value={anticipo.razonSocial} />
              <DetailItem label="NIT / Documento" value={anticipo.nit} />
              <DetailItem
                label="Empresa"
                value={getEmpresaNombre(
                  anticipo.empresa_id ?? anticipo.empresa ?? 1
                )}
              />
              <DetailItem label="Solicitante" value={solicitante} />
              <DetailItem
                label="Responsable anticipo"
                value={`${responsable}${
                  anticipo.responsableOrigen
                    ? ` · ${anticipo.responsableOrigen.replace("_", " ")}`
                    : ""
                }`}
              />
              <DetailItem
                label="Proceso"
                value={getUsuarioProceso(solicitanteInfo)}
              />
              <DetailItem
                label="Cargo"
                value={getUsuarioCargo(solicitanteInfo)}
              />
              <DetailItem
                label="Valor solicitado"
                value={formatterCOP.format(anticipo.valorNumerico)}
              />
              <DetailItem
                label="Cobertura de factura"
                value={getCoberturaFacturaLabel(anticipo)}
              />
              <DetailItem
                label="Valor contable"
                value={formatterCOP.format(getValorContableAnticipo(anticipo))}
              />
              <DetailItem
                label="Valor legalizable"
                value={formatterCOP.format(getValorLegalizableAnticipo(anticipo))}
              />
              <DetailItem
                label="Forma de pago"
                value={shortFormaPago(anticipo.formaPago)}
              />
              {anticipo.banco && (
                <DetailItem label="Banco" value={anticipo.banco} />
              )}
              {anticipo.numeroCuenta && (
                <DetailItem label="Cuenta" value={anticipo.numeroCuenta} />
              )}
              <DetailItem
                label="Fecha máxima de legalización"
                value={formatDate(anticipo.maxLegalizacionDate)}
              />
            </div>

            {anticipo.observaciones && (
              <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900">
                  <MessageSquare className="h-4 w-4 text-slate-500" />
                  Observaciones de la solicitud
                </div>
                <p className="break-words text-sm leading-relaxed text-slate-700">
                  {anticipo.observaciones}
                </p>
              </div>
            )}

            {anticipo.soportesSolicitud &&
              anticipo.soportesSolicitud.length > 0 && (
                <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                    <Paperclip className="h-4 w-4 text-slate-500" />
                    Documentos de la solicitud
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {anticipo.soportesSolicitud.map((adjunto) => (
                      <a
                        key={String(adjunto.storageId)}
                        href={`/api/convex/storage/${adjunto.storageId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition hover:border-emerald-200 hover:bg-emerald-50"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
                          <span className="truncate font-semibold text-slate-700">
                            {adjunto.nombre}
                          </span>
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

            <AnticipoAjusteSection anticipo={anticipo} onAnticipoChanged={onAnticipoChanged} />

            <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                <Clock3 className="h-4 w-4 text-slate-500" />
                Historial de fases
              </div>
              {fases === undefined ? (
                <div className="flex h-20 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : fases.length === 0 ? (
                <p className="text-sm text-slate-500">Sin fases registradas.</p>
              ) : (
                <div className="space-y-2">
                  {fases.map((fase) => {
                    const asignado = fase.asignadoA
                      ? getUsuarioNombre(
                          usuariosById.get(fase.asignadoA),
                          fase.asignadoA
                        )
                      : "Sin asignar";
                    const completadoPor = fase.completadoPor
                      ? getUsuarioNombre(
                          usuariosById.get(fase.completadoPor),
                          fase.completadoPor
                        )
                      : null;
                    return (
                      <div
                        key={fase._id}
                        className="min-w-0 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900">
                              {faseLabels[fase.fase] ?? fase.fase}
                            </p>
                            <p className="break-words text-xs text-slate-500">
                              Asignado a {asignado}
                              {completadoPor
                                ? ` · Completado por ${completadoPor}`
                                : ""}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "w-fit shrink-0 justify-self-start rounded-full text-[10px] sm:justify-self-end",
                              getEstadoClass(fase.estado)
                            )}
                          >
                            {fase.estado}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          {fase.fechaInicio && (
                            <span>Inicio: {formatDate(fase.fechaInicio)}</span>
                          )}
                          {fase.fechaCompletado && (
                            <span>Fin: {formatDate(fase.fechaCompletado)}</span>
                          )}
                        </div>
                        {fase.observaciones && (
                          <p className="mt-2 break-words rounded-xs border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
                            {fase.observaciones}
                          </p>
                        )}
                        {(() => {
                          const payload = fase.payload as
                            | { valorContableCambio?: ValorContableCambioAnticipo }
                            | undefined;
                          return payload?.valorContableCambio ? (
                            <ValorContableCambioAnticipoBadge
                              cambio={payload.valorContableCambio}
                            />
                          ) : null;
                        })()}
                        {fase.adjuntos && fase.adjuntos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {fase.adjuntos.map((adjunto) => (
                              <a
                                key={String(adjunto.storageId)}
                                href={`/api/convex/storage/${adjunto.storageId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:text-emerald-700"
                              >
                                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                  {adjunto.nombre}
                                </span>
                                <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {anticipo.rechazo && (
              <div className="min-w-0 rounded-md border border-rose-200 bg-rose-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-black text-rose-800">
                  <XCircle className="h-4 w-4" />
                  Motivo de rechazo
                </div>
                <p className="break-words text-sm leading-relaxed text-rose-800">
                  {anticipo.rechazo.motivo}
                </p>
                <p className="mt-2 text-xs font-medium text-rose-700">
                  Registrado por {rechazoPor ?? "usuario"} el{" "}
                  {formatDate(anticipo.rechazo.fechaRechazo)}
                </p>
              </div>
            )}

            {anticipo.anulacion && (
              <div className="min-w-0 rounded-md border border-rose-200 bg-rose-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-black text-rose-800">
                  <XCircle className="h-4 w-4" />
                  Motivo de anulación
                </div>
                <p className="break-words text-sm leading-relaxed text-rose-800">
                  {anticipo.anulacion.motivo}
                </p>
                <p className="mt-2 text-xs font-medium text-rose-700">
                  Registrado por {anulacionPor ?? "usuario"} el{" "}
                  {formatDate(anticipo.anulacion.fechaAnulacion)}
                </p>
              </div>
            )}

            {legalizacionesFacturacion.length > 0 && (
              <div className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-black text-emerald-900">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Facturas relacionadas a la legalización</span>
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-full border-emerald-200 bg-white text-[10px] font-bold text-emerald-700"
                    >
                      {legalizacionesFiltradas.length}/
                      {legalizacionesFacturacion.length}
                    </Badge>
                  </div>
                  <div className="relative w-full lg:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      value={legalizacionSearch}
                      onChange={(event) =>
                        setLegalizacionSearchState({
                          anticipoId,
                          value: event.target.value,
                        })
                      }
                      placeholder="Buscar factura, proveedor o valor"
                      className="h-9 bg-white pl-9"
                    />
                  </div>
                </div>
                {legalizacionesFiltradas.length === 0 ? (
                  <div className="rounded-md border border-dashed border-emerald-200 bg-white px-3 py-6 text-center text-sm font-medium text-slate-500">
                    No hay facturas que coincidan con la búsqueda.
                  </div>
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    {legalizacionesFiltradas.map((legalizacion) => (
                      <a
                        key={legalizacion._id}
                        href={`/billing/invoices/${legalizacion.facturaId}`}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-100 bg-white px-3 py-2 text-sm transition hover:border-emerald-300 hover:bg-emerald-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900">
                            Factura #
                            {legalizacion.factura?.numeroFactura ??
                              legalizacion.facturaId}
                          </span>
                          <span className="text-xs text-slate-500">
                            {legalizacion.factura?.proveedorNombre ??
                              "Proveedor no disponible"}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 font-black text-emerald-800">
                          {formatterCOP.format(legalizacion.valorAplicado)}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value?: string | number;
}) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="truncate font-semibold text-slate-800">{value}</p>
    </div>
  );
}
