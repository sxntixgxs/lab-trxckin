"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import {
  Check,
  ExternalLink,
  FilePlus2,
  FileText,
  History,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { FacturacionStatusBadge } from "./status-badge";
import { FacturacionUserPicker } from "./user-picker";
import {
  type AdvanceActionDescriptor,
  canReject,
  getNextActionForState,
} from "../lib/buzon-actions";
import type { FacturacionUsuario } from "../hooks/use-facturacion-users";
import { formatCurrency, formatDate, formatElapsed } from "../lib/utils";
import { getDocumentoLabel } from "../lib/valor-contable";
import { FacturaPagoAmount } from "./valor-contable-ui";
import { getActiveStage } from "../lib/workflow-config";
import {
  FacturaEmpresaBadge,
  getEmpresaAccentStyle,
  resolveFacturacionEmpresaId,
} from "../lib/empresa-ui";
import {
  isFacturaEligibleForAnticipoLegalizacion,
  shouldShowAnticipoLegalizacionPanel,
} from "../lib/anticipo-legalizacion";
import { getFacturacionErrorMessage } from "../lib/user-facing-error";
import { CausacionResumenBadge } from "@/components/facturacion/factura-causacion-panel";

type NotaCreditoRelacionResumen = {
  tipo: "factura" | "nota_credito";
  cantidadNotasCredito: number;
  valorNotasCredito: number;
  notasCredito: Array<{
    facturaId: Doc<"facturacionFacturas">["_id"];
    numeroFactura: string;
    total: number;
    moneda: string;
  }>;
  facturaOrigen?: {
    facturaId: Doc<"facturacionFacturas">["_id"];
    numeroFactura: string;
    total: number;
    moneda: string;
  };
};

export type BuzonTarea = Doc<"facturacionTareas"> & {
  tareaIdReal?: Doc<"facturacionTareas">["_id"];
  asignacionId?: Doc<"facturacionAsignaciones">["_id"];
  asignacion?: Doc<"facturacionAsignaciones"> | null;
  faseAsignacion?: string;
  rolAsignacion?: string;
  factura: Doc<"facturacionFacturas"> | null;
  notaCreditoRelacion?: NotaCreditoRelacionResumen | null;
  adjuntosCount?: number;
  pdfUrl: string | null;
};

export type RowDecision = "approve" | "reject";

type Actor = {
  actorUserId?: string;
  actorNombre: string;
  actorEmail: string;
};

export function BuzonRow({
  tarea,
  actor,
  decision,
  onDecisionChange,
  comentario,
  onComentarioChange,
  asignadoIds,
  onAsignadoChange,
  lideres,
  usuariosFinanzas,
  contadoresImpuestos,
  onOpenTimeline,
  onOpenAdjuntos,
  onOpenLegalizacionAnticipo,
  isSaving,
}: {
  tarea: BuzonTarea;
  actor: Actor;
  decision: RowDecision | null;
  onDecisionChange: (next: RowDecision | null) => void;
  comentario: string;
  onComentarioChange: (value: string) => void;
  asignadoIds: string[];
  onAsignadoChange: (next: string[]) => void;
  lideres: FacturacionUsuario[];
  usuariosFinanzas: FacturacionUsuario[];
  contadoresImpuestos: FacturacionUsuario[];
  onOpenTimeline: (tarea: BuzonTarea) => void;
  onOpenAdjuntos: (tarea: BuzonTarea) => void;
  onOpenLegalizacionAnticipo: (tarea: BuzonTarea) => void;
  isSaving: boolean;
}) {
  const factura = tarea.factura;
  const notaCreditoRelacion = tarea.notaCreditoRelacion;
  const hasContadorPrevio =
    tarea.faseAsignacion === "causacion" &&
    Boolean(tarea.contadorAsignadoAEmail) &&
    tarea.asignacion?.metadata?.origen === "devolucion_impuestos";
  const advance: AdvanceActionDescriptor | null = getNextActionForState(
    tarea.estado,
    tarea.faseAsignacion,
    hasContadorPrevio,
  );
  const rejectable = canReject(tarea.estado, tarea.faseAsignacion);

  const [legalizacionPending, setLegalizacionPending] = useState(false);
  const marcarEsLegalizacionAnticipo = useMutation(
    api.facturacionTareas.marcarEsLegalizacionAnticipo,
  );

  async function handleLegalizacionAnticipoChange(value: "si" | "no") {
    if (!factura) return;

    const next = value === "si";
    if (Boolean(factura.esLegalizacionAnticipo) === next) return;

    setLegalizacionPending(true);
    try {
      await marcarEsLegalizacionAnticipo({
        tareaId: tarea._id,
        ...(tarea.asignacionId ? { asignacionId: tarea.asignacionId } : {}),
        esLegalizacionAnticipo: next,
        ...actor,
      });
      toast.success(
        next
          ? "Marcada como legalización de anticipo."
          : "Desmarcada como legalización de anticipo.",
      );
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo actualizar la factura. Intenta nuevamente.",
        ),
      );
    } finally {
      setLegalizacionPending(false);
    }
  }

  const empresaId = resolveFacturacionEmpresaId(tarea);
  const empresaAccent = getEmpresaAccentStyle(empresaId);

  const rowBg =
    decision === "approve"
      ? "bg-emerald-50/40 hover:bg-emerald-50/60"
      : decision === "reject"
        ? "bg-rose-50/40 hover:bg-rose-50/60"
        : "bg-white hover:bg-slate-50";
  const stickyBg =
    decision === "approve"
      ? "bg-emerald-50/40 group-hover:bg-emerald-50/60"
      : decision === "reject"
        ? "bg-rose-50/40 group-hover:bg-rose-50/60"
        : "bg-white group-hover:bg-slate-50";

  const legalizacionAnticipoActual =
    factura?.esLegalizacionAnticipo === true ? "si" : "no";
  const asignadoActualNombre = tarea.asignadoANombre.split(" ")[0];
  const asignacionCandidates =
    tarea.faseAsignacion === "recepcion" || tarea.estado === "revision_lider"
      ? lideres
      : tarea.faseAsignacion === "causacion"
        ? contadoresImpuestos
      : usuariosFinanzas;
  const selectedSingleAssigneeId = asignadoIds[0] ?? null;
  const selectedAssignees = asignacionCandidates.filter((usuario) =>
    asignadoIds.includes(usuario.id),
  );
  const isReceptionAssignment = tarea.faseAsignacion === "recepcion";
  const asignacionUserId = tarea.asignacion?.asignadoAUserId ?? actor.actorUserId;
  const asignacionEmail = (
    tarea.asignacion?.asignadoAEmail ?? actor.actorEmail
  ).trim().toLowerCase();
  const anticipoOwnerMatchesAssignment =
    !factura?.anticipoLiderUserId ||
    (asignacionUserId && factura.anticipoLiderUserId === asignacionUserId) ||
    (factura.anticipoLiderEmail &&
      factura.anticipoLiderEmail.trim().toLowerCase() === asignacionEmail);
  const isActiveLeaderAssignment =
    tarea.faseAsignacion === "revision_lider" &&
    tarea.asignacion?.fase === "revision_lider" &&
    tarea.asignacion.estado === "pendiente";
  const isActiveCausacionAssignment =
    tarea.faseAsignacion === "causacion" &&
    tarea.asignacion?.fase === "causacion" &&
    tarea.asignacion.estado === "pendiente";
  const isEligibleForAnticipo = isFacturaEligibleForAnticipoLegalizacion(factura);
  const canToggleLegalizacionAnticipo =
    isEligibleForAnticipo &&
    ((isActiveLeaderAssignment &&
      (!factura?.esLegalizacionAnticipo || anticipoOwnerMatchesAssignment)) ||
      (isActiveCausacionAssignment &&
        (factura?.esLegalizacionAnticipo === true ||
          !factura?.esLegalizacionAnticipo)));
  const canOpenLegalizacionAnticipo =
    Boolean(factura && shouldShowAnticipoLegalizacionPanel(tarea)) &&
    (tarea.faseAsignacion !== "revision_lider" || isActiveLeaderAssignment);
  let approveTooltip = "Sin transición disponible";
  if (isReceptionAssignment) {
    approveTooltip = "Asignar factura a uno o varios líderes";
  } else if (tarea.estado === "revision_lider") {
    approveTooltip = selectedSingleAssigneeId
      ? "Reasignar revisión al líder seleccionado"
      : "Aprobar revisión de líder";
  } else if (advance) {
    approveTooltip = `${advance.label}${advance.needsAssignee ? " (define responsable)" : ""}`;
  }
  const rejectTooltip = rejectable
    ? tarea.faseAsignacion === "revision_impuestos"
      ? "Devolver a causación"
      : "Rechazar factura"
    : `Rechazo no disponible en estado "${tarea.estado}"`;

  return (
    <tr
      className={`group border-b border-slate-100 align-middle transition ${rowBg}`}
      style={{ boxShadow: `inset 3px 0 0 ${empresaAccent.rowBorder}` }}
    >
      {/* Aprobar */}
      <td
        className={`sticky left-0 z-10 w-[88px] px-3 py-2 ${stickyBg} shadow-[1px_0_0_0_rgb(241_245_249)]`}
      >
        <div className="flex items-center gap-1.5">
          <DecisionCircle
            tone="approve"
            active={decision === "approve"}
            disabled={isSaving || advance === null}
            tooltip={approveTooltip}
            onClick={() =>
              onDecisionChange(decision === "approve" ? null : "approve")
            }
          />
          <DecisionCircle
            tone="reject"
            active={decision === "reject"}
            disabled={isSaving || !rejectable}
            tooltip={rejectTooltip}
            onClick={() =>
              onDecisionChange(decision === "reject" ? null : "reject")
            }
          />
        </div>
      </td>

      {/* Proveedor / Factura */}
      <td className="min-w-[240px] px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-slate-900">
            {factura?.proveedorNombre ?? "Sin proveedor"}
          </p>
          <FacturaEmpresaBadge tarea={tarea} compact />
          <FacturacionStatusBadge estado={tarea.estado} />
          {tarea.faseAsignacion ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              {formatFaseAsignacion(tarea.faseAsignacion)}
            </span>
          ) : null}
          {factura?.esLegalizacionAnticipo ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              <Sparkles className="h-2.5 w-2.5" />
              Anticipo
            </span>
          ) : null}
          {factura?.isFisico ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
              <FilePlus2 className="h-2.5 w-2.5" />
              Documento físico
            </span>
          ) : null}
          {notaCreditoRelacion ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">
              <FileText className="h-2.5 w-2.5" />
              {notaCreditoRelacion.tipo === "factura"
                ? `NC ${notaCreditoRelacion.cantidadNotasCredito} · ${formatCurrency(
                    notaCreditoRelacion.valorNotasCredito,
                    notaCreditoRelacion.notasCredito[0]?.moneda ??
                      factura?.moneda ??
                      "COP",
                  )}`
                : notaCreditoRelacion.facturaOrigen
                  ? `Cruce NC · #${notaCreditoRelacion.facturaOrigen.numeroFactura}`
                  : "Cruce NC"}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          #{factura?.numeroFactura ?? "-"} · NIT{" "}
          {factura?.proveedorNit ?? "-"} · {getDocumentoLabel(factura)}
        </p>
      </td>

      {/* Fechas / Pago */}
      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">
        <p className="font-medium text-slate-800">
          {factura ? formatDate(factura.fechaEmision) : "-"}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500">
          Vence:{" "}
          {factura?.fechaVencimiento
            ? formatDate(factura.fechaVencimiento)
            : "—"}
        </p>
        {factura?.formaPago ? (
          <p className="mt-0.5 max-w-[160px] truncate text-[10px] text-indigo-600">
            Pago: {factura.formaPago}
          </p>
        ) : null}
      </td>

      {/* Tiempo */}
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium text-slate-700">
        {formatElapsed(tarea.creadoEn)}
      </td>

      {/* Valor total */}
      <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold tabular-nums text-slate-900">
        {factura ? (
          <FacturaPagoAmount
            factura={factura}
            fase={String(getActiveStage(tarea))}
          />
        ) : (
          "-"
        )}
      </td>

      {/* Observaciones */}
      <td className="min-w-[200px] px-3 py-2">
        <textarea
          value={comentario}
          onChange={(event) => onComentarioChange(event.target.value)}
          placeholder="Observación..."
          rows={1}
          className="block h-9 w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-hidden focus:ring-1 focus:ring-slate-200 disabled:bg-slate-50"
          disabled={isSaving}
        />
      </td>

      {/* Acciones rápidas */}
      <td className="whitespace-nowrap px-3 py-2">
        <div className="flex items-center justify-center gap-1">
          <IconAction
            tooltip={
              tarea.pdfUrl ? "Ver PDF de la factura" : "Sin PDF disponible"
            }
            disabled={!tarea.pdfUrl}
            href={tarea.pdfUrl ?? undefined}
          >
            <FileText className="h-4 w-4" />
          </IconAction>

          <IconAction
            tooltip="Ver línea de tiempo"
            onClick={() => onOpenTimeline(tarea)}
          >
            <History className="h-4 w-4" />
          </IconAction>

          <IconAction
            tooltip={
              (tarea.adjuntosCount ?? 0) > 0
                ? `Adjuntos (${tarea.adjuntosCount})`
                : "Adjuntar documento"
            }
            onClick={() => onOpenAdjuntos(tarea)}
            badge={tarea.adjuntosCount ?? 0}
          >
            <Paperclip className="h-4 w-4" />
          </IconAction>

          {canOpenLegalizacionAnticipo ? (
            <IconAction
              tooltip={
                tarea.faseAsignacion === "causacion" ||
                tarea.faseAsignacion === "revision_lider"
                  ? factura?.esLegalizacionAnticipo
                    ? "Legalizar anticipos"
                    : "Marcar como anticipo"
                  : tarea.faseAsignacion === "revision_impuestos"
                    ? "Corregir cruce de anticipos"
                    : "Ver legalización de anticipo"
              }
              onClick={() => onOpenLegalizacionAnticipo(tarea)}
            >
              <Sparkles className="h-4 w-4" />
            </IconAction>
          ) : null}

          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-lg p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title="Ver detalle"
          >
            <Link href={`/billing/invoices/${tarea.facturaId}`}>
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </td>

      {/* Legalización de anticipo */}
      <td className="px-3 py-2 text-center">
        <LegalizacionAnticipoSelect
          value={legalizacionAnticipoActual}
          loading={legalizacionPending}
          disabled={isSaving || !factura || !canToggleLegalizacionAnticipo}
          onChange={handleLegalizacionAnticipoChange}
        />
      </td>

      {/* Causación / FP */}
      <td className="px-3 py-2 text-center">
        <CausacionResumenBadge
          causado={factura?.causado}
          numeroFp={factura?.numeroFp}
        />
      </td>

      {/* Asignar a */}
      <td className="px-3 py-2">
        <div className="w-[220px] space-y-1.5">
          <FacturacionUserPicker
            value={isReceptionAssignment ? null : selectedSingleAssigneeId}
            onChange={(next) => {
              if (isReceptionAssignment) {
                if (!next || asignadoIds.includes(next)) return;
                onAsignadoChange([...asignadoIds, next]);
                return;
              }
              onAsignadoChange(next ? [next] : []);
            }}
            usuarios={asignacionCandidates}
            placeholder={
              isReceptionAssignment
                ? "Agregar líder..."
                : tarea.faseAsignacion === "causacion"
                  ? "Asignar revisor..."
                : tarea.estado === "revision_lider"
                ? "Enviar a otro líder..."
                : "Asignar a..."
            }
            disabled={isSaving}
          />
          {selectedAssignees.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedAssignees.map((usuario) => (
                <button
                  key={usuario.id}
                  type="button"
                  onClick={() =>
                    onAsignadoChange(
                      asignadoIds.filter((id) => id !== usuario.id),
                    )
                  }
                  disabled={isSaving}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
                  title="Quitar"
                >
                  <span className="truncate">{usuario.nombre}</span>
                  <X className="h-2.5 w-2.5 shrink-0" />
                </button>
              ))}
            </div>
          ) : null}
          <p className="truncate text-[10px] text-slate-400">
            Actual: {asignadoActualNombre}
          </p>
        </div>
      </td>
    </tr>
  );
}

function formatFaseAsignacion(fase: string) {
  const labels: Record<string, string> = {
    recepcion: "Recepción",
    revision_lider: "Líder",
    jefe_directo: "Jefe directo",
    causacion: "Causación",
    revision_impuestos: "Contabilidad",
    eventos_dian: "Eventos DIAN",
    pendiente_rechazar_dian: "Rechazos DIAN",
    gerencia: "Gerencia",
    revision_tesoreria: "Tesorería",
  };
  return labels[fase] ?? fase;
}

function LegalizacionAnticipoSelect({
  value,
  loading,
  disabled,
  onChange,
}: {
  value: "si" | "no";
  loading: boolean;
  disabled: boolean;
  onChange: (next: "si" | "no") => void;
}) {
  const isSi = value === "si";
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as "si" | "no")}
      disabled={disabled || loading}
    >
      <SelectTrigger
        className={`h-8 w-[112px] gap-1 rounded-lg border px-3 py-1 text-xs font-semibold focus:ring-2 focus:ring-offset-0 ${
          isSi
            ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-[112px]">
        <SelectItem value="no">No</SelectItem>
        <SelectItem value="si">Sí</SelectItem>
      </SelectContent>
    </Select>
  );
}

function DecisionCircle({
  tone,
  active,
  disabled,
  tooltip,
  onClick,
}: {
  tone: "approve" | "reject";
  active: boolean;
  disabled: boolean;
  tooltip: string;
  onClick: () => void;
}) {
  const palette =
    tone === "approve"
      ? {
          base: "border-emerald-400 text-emerald-500 hover:bg-emerald-50",
          active:
            "border-emerald-500 bg-emerald-500 text-white shadow-xs shadow-emerald-200/70",
        }
      : {
          base: "border-rose-400 text-rose-500 hover:bg-rose-50",
          active:
            "border-rose-500 bg-rose-500 text-white shadow-xs shadow-rose-200/70",
        };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 ${
              active ? palette.active : palette.base
            }`}
          >
            {tone === "approve" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function IconAction({
  tooltip,
  onClick,
  href,
  disabled,
  badge,
  children,
}: {
  tooltip: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  const baseClasses =
    "relative flex h-8 w-8 items-center justify-center rounded-lg transition";
  const enabledClasses =
    "text-slate-500 hover:bg-slate-100 hover:text-slate-800";
  const disabledClasses = "text-slate-300";

  const inner = (
    <>
      {children}
      {badge && badge > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={disabled}
              className={`${baseClasses} ${
                disabled ? disabledClasses : enabledClasses
              } ${disabled ? "pointer-events-none" : ""}`}
            >
              {inner}
            </a>
          ) : (
            <button
              type="button"
              onClick={onClick}
              disabled={disabled}
              className={`${baseClasses} ${
                disabled ? disabledClasses : enabledClasses
              }`}
            >
              {inner}
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
