import { useMemo, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  FileCheck2,
  Lock,
  RotateCcw,
  Repeat,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Doc } from "@/convex/_generated/dataModel";
import { ExpandableObservation } from "../../components/expandable-observation";
import { FACTURACION_STATUS_LABELS } from "../../components/status-badge";
import { FacturacionUserPicker } from "../../components/user-picker";
import { useFacturacionActorNames } from "../../hooks/use-facturacion-actors";
import type { FacturacionUsuario } from "../../hooks/use-facturacion-users";
import { formatCurrency, formatDateTime, formatElapsed } from "../../lib/utils";
import { STAGE_LABELS, STAGE_ORDER, getProgressStage, getStageIndexInOrder, getTerminalBranchStage, isTerminalFacturacionStage, TERMINAL_STAGE_META, TERMINAL_TONE_STYLES, type FacturacionTerminal, type WorkflowAction } from "../../lib/workflow-config";
import { ValorContableCambioBadge } from "../../components/valor-contable-ui";
import type { BuzonTarea } from "../../components/buzon-row";
import {
  formatCausacionEstadoLabel,
  formatFpDisplay,
  deriveCausacionEstado,
} from "@/lib/facturacion-causacion";
import { getDueLabel } from "./helpers";
import type { UsuarioAsignacion } from "./types";

export function AssigneeControl({
  action,
  selectedIds,
  onChange,
  lideres,
  contadores,
  analistasCausacion = [],
  eventosDian,
  rechazosDian = [],
  gerencias = [],
  usuarios,
  jefeDirectoAuto,
}: {
  action: WorkflowAction | null;
  selectedIds: string[];
  onChange: (next: string[]) => void;
  lideres: FacturacionUsuario[];
  contadores: FacturacionUsuario[];
  analistasCausacion?: FacturacionUsuario[];
  eventosDian: FacturacionUsuario[];
  rechazosDian?: FacturacionUsuario[];
  gerencias?: FacturacionUsuario[];
  usuarios: FacturacionUsuario[];
  jefeDirectoAuto?: FacturacionUsuario | null;
}) {
  if (!action?.needsAssignee) return null;
  if (action.needsAssignee === "jefe_directo" && jefeDirectoAuto) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Jefe directo sugerido:{" "}
        <span className="font-semibold text-slate-900">{jefeDirectoAuto.nombre}</span>
      </div>
    );
  }

  const options =
    action.needsAssignee === "lideres"
      ? lideres
      : action.needsAssignee === "contadores"
        ? contadores
        : action.needsAssignee === "analistas_causacion"
          ? analistasCausacion
        : action.needsAssignee === "eventos_dian"
          ? eventosDian
        : action.needsAssignee === "rechazos_dian"
          ? rechazosDian
        : action.needsAssignee === "gerencia"
          ? gerencias
          : usuarios.filter((usuario) => usuario.activo);
  const isMulti =
    action.needsAssignee === "lideres" &&
    (action.kind === "assign-horizontal-lider" || action.kind === "forward");
  const selected = options.filter((usuario) => selectedIds.includes(usuario.id));

  return (
    <div className="space-y-2">
      <FacturacionUserPicker
        value={isMulti ? null : selectedIds[0] ?? null}
        onChange={(next) => {
          if (!next) {
            onChange([]);
            return;
          }
          if (isMulti) {
            if (!selectedIds.includes(next)) onChange([...selectedIds, next]);
          } else {
            onChange([next]);
          }
        }}
        usuarios={options}
        placeholder={
          action.needsAssignee === "lideres"
            ? "Agregar líder..."
            : action.needsAssignee === "contadores"
              ? "Seleccionar contabilidad..."
              : action.needsAssignee === "analistas_causacion"
                ? "Seleccionar analista de causación..."
              : action.needsAssignee === "eventos_dian"
                ? "Seleccionar Eventos DIAN..."
              : action.needsAssignee === "rechazos_dian"
                ? "Seleccionar Rechazos DIAN..."
              : action.needsAssignee === "gerencia"
                ? "Seleccionar gerencia..."
                : "Seleccionar jefe directo..."
        }
      />
      {selected.length > 0 && isMulti ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((usuario) => (
            <button
              key={usuario.id}
              type="button"
              onClick={() => onChange(selectedIds.filter((id) => id !== usuario.id))}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700"
            >
              {usuario.nombre}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DetailGrid({ tarea }: { tarea: BuzonTarea }) {
  const factura = tarea.factura;
  return (
    <div className="grid gap-4 text-sm">
      <DetailRow icon={<UserRound className="h-4 w-4" />} label="Asignado a">
        {tarea.asignadoANombre}
      </DetailRow>
      <DetailRow icon={<Clock className="h-4 w-4" />} label="Tiempo en fase">
        {formatElapsed(tarea.creadoEn)}
      </DetailRow>
      <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Días para vencer">
        {getDueLabel(factura?.fechaVencimiento).label}
      </DetailRow>
      <DetailRow icon={<CheckCircle2 className="h-4 w-4" />} label="Causación">
        {formatCausacionEstadoLabel(deriveCausacionEstado(tarea.factura?.causado))}
      </DetailRow>
      <DetailRow icon={<CheckCircle2 className="h-4 w-4" />} label="Número FP">
        {formatFpDisplay(tarea.factura?.causado ?? null, tarea.factura?.numeroFp)}
      </DetailRow>
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-semibold uppercase text-slate-500">Observaciones</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {factura?.descripcion || "Sin observaciones."}
        </p>
      </div>
    </div>
  );
}

export function BulkMetaGrid({ tarea }: { tarea: BuzonTarea }) {
  const factura = tarea.factura;
  return (
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 text-sm md:grid-cols-2">
      <DetailRow icon={<UserRound className="h-4 w-4" />} label="Asignado a">
        {tarea.asignadoANombre}
      </DetailRow>
      <DetailRow icon={<Clock className="h-4 w-4" />} label="Tiempo en fase">
        {formatElapsed(tarea.creadoEn)}
      </DetailRow>
      <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Días para vencer">
        {getDueLabel(factura?.fechaVencimiento).label}
      </DetailRow>
      <DetailRow icon={<CheckCircle2 className="h-4 w-4" />} label="Causación">
        {formatCausacionEstadoLabel(deriveCausacionEstado(tarea.factura?.causado))}
      </DetailRow>
      <DetailRow icon={<CheckCircle2 className="h-4 w-4" />} label="Número FP">
        {formatFpDisplay(tarea.factura?.causado ?? null, tarea.factura?.numeroFp)}
      </DetailRow>
    </div>
  );
}

export function FacturaObservationCard({ tarea }: { tarea: BuzonTarea }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase text-slate-500">Observaciones</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        {tarea.factura?.descripcion || "Sin observaciones."}
      </p>
    </div>
  );
}

export function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-2 text-slate-500">
        {icon}
        {label}
      </span>
      <span className="font-medium text-slate-950">{children}</span>
    </div>
  );
}

export function FileRow({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="inline-flex items-center gap-2">
        <span className="text-slate-500">{icon}</span>
        {label}
      </span>
      <span className="text-xs text-slate-500">{value}</span>
    </>
  );
  if (!href) {
    return <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">{content}</div>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50"
    >
      {content}
    </a>
  );
}

export function LastPhaseObservation({
  aprobaciones,
}: {
  aprobaciones: Doc<"facturacionAprobaciones">[];
}) {
  const getActorName = useFacturacionActorNames(aprobaciones);
  const latest = [...aprobaciones]
    .filter((event) => event.comentario?.trim())
    .sort((a, b) => b.creadoEn - a.creadoEn)[0];

  if (!latest) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
        <p className="text-xs font-semibold uppercase text-slate-500">
          Última observación de fase
        </p>
        <p className="mt-2">Sin observaciones registradas en el flujo.</p>
      </div>
    );
  }

  const phaseLabel =
    STAGE_LABELS[latest.estadoAnterior] && STAGE_LABELS[latest.estadoNuevo]
      ? `${STAGE_LABELS[latest.estadoAnterior]} → ${STAGE_LABELS[latest.estadoNuevo]}`
      : STAGE_LABELS[latest.estadoNuevo] ?? latest.estadoNuevo;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Última observación de fase
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{phaseLabel}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {formatElapsed(latest.creadoEn)}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {formatAccion(latest.accion, latest.estadoNuevo)} · {getActorName(latest)} ·{" "}
        {formatDateTime(latest.creadoEn)}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        {latest.comentario}
      </p>
    </div>
  );
}

export function HistoryList({
  aprobaciones,
}: {
  aprobaciones: Doc<"facturacionAprobaciones">[];
}) {
  const getActorName = useFacturacionActorNames(aprobaciones);
  const sorted = [...aprobaciones].sort((a, b) => b.creadoEn - a.creadoEn);
  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
        Sin eventos de historial.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {sorted.map((event) => (
        <div key={event._id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">
              {formatAccion(event.accion, event.estadoNuevo)}
            </p>
            <span className="text-xs text-slate-500">{formatDateTime(event.creadoEn)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {getActorName(event)} · {STAGE_LABELS[event.estadoAnterior] ?? event.estadoAnterior} →{" "}
            {STAGE_LABELS[event.estadoNuevo] ?? event.estadoNuevo}
          </p>
          <p className="mt-2 text-sm text-slate-700">{event.comentario || "-"}</p>
          {event.valorContableCambio ? (
            <ValorContableCambioBadge cambio={event.valorContableCambio} />
          ) : null}
          {event.causacionCambio ? <CausacionCambioBadge cambio={event.causacionCambio} /> : null}
        </div>
      ))}
    </div>
  );
}

export function HistoryTimeline({
  aprobaciones,
}: {
  aprobaciones: Doc<"facturacionAprobaciones">[];
}) {
  const getActorName = useFacturacionActorNames(aprobaciones);
  const sorted = [...aprobaciones].sort((a, b) => a.creadoEn - b.creadoEn);
  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        Sin eventos de historial.
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:flex lg:items-start lg:overflow-x-auto lg:pb-1">
      {sorted.map((event, index) => (
        <div
          key={event._id}
          className="relative rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:w-80 lg:shrink-0"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
              {index + 1}
            </span>
            <span className="min-w-0 truncate text-xs font-medium text-slate-500">
              {formatDateTime(event.creadoEn)}
            </span>
          </div>
          <p className="truncate text-sm font-semibold text-slate-900">
            {formatAccion(event.accion, event.estadoNuevo)}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {getActorName(event)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {STAGE_LABELS[event.estadoAnterior] ?? event.estadoAnterior} →{" "}
            {STAGE_LABELS[event.estadoNuevo] ?? event.estadoNuevo}
          </p>
          <div className="mt-3">
            <ExpandableObservation
              text={event.comentario}
              collapsedLines={3}
              className="text-sm leading-relaxed text-slate-700"
            />
          </div>
          {event.valorContableCambio ? (
            <ValorContableCambioBadge cambio={event.valorContableCambio} />
          ) : null}
          {event.causacionCambio ? <CausacionCambioBadge cambio={event.causacionCambio} /> : null}
          {event.pagoParcial ? (
            <p className="mt-2 text-xs font-semibold tabular-nums text-sky-800">
              Pago parcial: {formatCurrency(event.pagoParcial.monto, "COP")}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
function CausacionCambioBadge({
  cambio,
}: {
  cambio: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]>;
}) {
  return (
    <div className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50/60 px-3 py-2 text-xs text-cyan-950">
      <p className="font-semibold">Causación actualizada</p>
      <p className="mt-0.5">
        {formatCausacionEstadoLabel(deriveCausacionEstado(cambio.causadoNuevo))} · FP{" "}
        {formatFpDisplay(cambio.causadoNuevo, cambio.numeroFpNuevo)}
      </p>
    </div>
  );
}

export function StageProgress({
  stage,
  compact,
  aprobaciones = [],
}: {
  stage: string;
  compact?: boolean;
  aprobaciones?: Doc<"facturacionAprobaciones">[];
}) {
  const getActorName = useFacturacionActorNames(aprobaciones);
  const isTerminal = isTerminalFacturacionStage(stage);
  const terminalStage = isTerminal ? (stage as FacturacionTerminal) : null;
  const terminalMeta = terminalStage ? TERMINAL_STAGE_META[terminalStage] : null;
  const progressStage = getProgressStage(stage);
  const activeIndex = STAGE_ORDER.findIndex((item) => item === progressStage);
  const branchIndex =
    terminalStage && terminalStage !== "pagada"
      ? getStageIndexInOrder(getTerminalBranchStage(terminalStage, aprobaciones))
      : terminalStage === "pagada"
        ? STAGE_ORDER.length - 1
        : activeIndex;
  const eventsByStage = useMemo(
    () => getStageObservationEvents(aprobaciones),
    [aprobaciones],
  );

  if (compact) {
    if (isTerminal && terminalStage && terminalMeta) {
      const toneStyles = TERMINAL_TONE_STYLES[terminalMeta.tone];
      return (
        <div className="flex items-center gap-1.5">
          {STAGE_ORDER.map((item, index) => {
            if (terminalStage !== "pagada" && index > branchIndex) return null;
            const complete = index <= branchIndex;
            const dot = complete ? "bg-emerald-500" : "bg-slate-200";
            return <span key={item} className={"h-2 w-2 rounded-full " + dot} />;
          })}
          {terminalStage !== "pagada" ? (
            <span
              className={
                "h-2.5 min-w-[2.5rem] rounded-full px-1.5 " + toneStyles.dot
              }
              title={terminalMeta.label}
            />
          ) : null}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5">
        {STAGE_ORDER.map((item, index) => {
          const complete = activeIndex >= 0 && index < activeIndex;
          const active = item === progressStage;
          const dot = active
            ? "bg-slate-900"
            : complete
              ? "bg-emerald-500"
              : "bg-slate-200";
          return <span key={item} className={"h-2 w-2 rounded-full " + dot} />;
        })}
      </div>
    );
  }

  if (isTerminal && terminalStage && terminalMeta && terminalStage !== "pagada") {
    const toneStyles = TERMINAL_TONE_STYLES[terminalMeta.tone];
    const traversedStages = STAGE_ORDER.slice(0, branchIndex + 1);
    const remainingSpan = STAGE_ORDER.length - branchIndex - 1;

    return (
      <TooltipProvider delayDuration={180}>
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${STAGE_ORDER.length}, minmax(0, 1fr))`,
          }}
        >
          {traversedStages.map((item) => {
            const events = eventsByStage.get(item) ?? [];
            const hasEvents = events.length > 0;
            const hasReturns = events.some(isReturnApprovalEvent);
            const dot = hasReturns ? "bg-amber-500" : "bg-emerald-500";
            const label = (
              <div key={item} className="min-w-0">
                <div className={"relative h-2 rounded-full " + dot}>
                  {hasReturns ? (
                    <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-500" />
                  ) : null}
                </div>
                <p
                  className={
                    "mt-2 truncate text-[10px] font-medium " +
                    (hasReturns ? "text-amber-700" : "text-slate-700")
                  }
                >
                  {STAGE_LABELS[item]}
                </p>
              </div>
            );

            if (!hasEvents) return label;

            return (
              <Tooltip key={item}>
                <TooltipTrigger asChild>
                  <button type="button" className="min-w-0 cursor-help text-left">
                    {label}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  className="max-w-sm border-slate-200 bg-white p-0 text-slate-900 shadow-xl"
                >
                  {renderStageTooltipContent(item, events, getActorName)}
                </TooltipContent>
              </Tooltip>
            );
          })}
          {remainingSpan > 0 ? (
            <div
              className="min-w-0"
              style={{ gridColumn: `span ${remainingSpan}` }}
            >
              <div className={"h-2 rounded-full " + toneStyles.bar} />
              <div
                className={
                  "mt-2 flex items-center gap-1.5 rounded-lg border px-2 py-1 " +
                  toneStyles.chip
                }
              >
                {terminalStage === "legalizada" || terminalStage === "cerrada" ? (
                  <FileCheck2 className="h-3 w-3 shrink-0" />
                ) : terminalStage === "nota_credito_cerrada" ? (
                  <Lock className="h-3 w-3 shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 shrink-0" />
                )}
                <p className={"truncate text-[10px] font-semibold " + toneStyles.text}>
                  {terminalMeta.label}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </TooltipProvider>
    );
  }

  if (isTerminal && terminalStage === "pagada") {
    return (
      <TooltipProvider delayDuration={180}>
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${STAGE_ORDER.length}, minmax(0, 1fr))`,
          }}
        >
          {STAGE_ORDER.map((item) => {
            const events = eventsByStage.get(item) ?? [];
            const hasEvents = events.length > 0;
            const hasReturns = events.some(isReturnApprovalEvent);
            const dot = hasReturns ? "bg-amber-500" : "bg-emerald-500";
            const label = (
              <div key={item} className="min-w-0">
                <div className={"relative h-2 rounded-full " + dot}>
                  {hasReturns ? (
                    <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-500" />
                  ) : null}
                </div>
                <p
                  className={
                    "mt-2 truncate text-[10px] font-medium " +
                    (hasReturns ? "text-amber-700" : "text-slate-700")
                  }
                >
                  {STAGE_LABELS[item]}
                </p>
              </div>
            );

            if (!hasEvents) return label;

            return (
              <Tooltip key={item}>
                <TooltipTrigger asChild>
                  <button type="button" className="min-w-0 cursor-help text-left">
                    {label}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  className="max-w-sm border-slate-200 bg-white p-0 text-slate-900 shadow-xl"
                >
                  {renderStageTooltipContent(item, events, getActorName)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={180}>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${STAGE_ORDER.length}, minmax(0, 1fr))`,
        }}
      >
        {STAGE_ORDER.map((item, index) => {
          const complete = activeIndex >= 0 && index < activeIndex;
          const active = item === progressStage;
          const events = eventsByStage.get(item) ?? [];
          const hasEvents = events.length > 0;
          const hasReturns = events.some(isReturnApprovalEvent);
          const dot = active
            ? "bg-slate-900"
            : complete
              ? hasReturns
                ? "bg-amber-500"
                : "bg-emerald-500"
              : hasReturns
                ? "bg-amber-300"
                : "bg-slate-200";
          const label = (
            <div key={item} className="min-w-0">
              <div className={"relative h-2 rounded-full " + dot}>
                {hasReturns ? (
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-500" />
                ) : null}
              </div>
              <p
                className={
                  "mt-2 truncate text-[10px] font-medium " +
                  (active
                    ? "text-slate-900"
                    : hasReturns
                      ? "text-amber-700"
                      : "text-slate-500")
                }
              >
                {STAGE_LABELS[item]}
              </p>
            </div>
          );

          if (!hasEvents) return label;

          return (
            <Tooltip key={item}>
              <TooltipTrigger asChild>
                <button type="button" className="min-w-0 cursor-help text-left">
                  {label}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="start"
                className="max-w-sm border-slate-200 bg-white p-0 text-slate-900 shadow-xl"
              >
                {renderStageTooltipContent(item, events, getActorName)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function renderStageTooltipContent(
  item: string,
  events: StageObservationEvent[],
  getActorName: (event: StageObservationEvent) => string,
) {
  return (
    <>
      <div className="border-b border-slate-100 px-3 py-2">
        <p className="text-xs font-semibold text-slate-950">
          {STAGE_LABELS[item]}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {events.length} observación{events.length === 1 ? "" : "es"} registrada
          {events.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto p-3">
        {events.map((event) => {
          const returned = isReturnApprovalEvent(event);
          return (
            <div
              key={event._id}
              className={
                "rounded-lg border p-3 " +
                (returned
                  ? "border-amber-200 bg-amber-50/80"
                  : "border-slate-200 bg-slate-50/80")
              }
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900">
                  {formatAccion(event.accion, event.estadoNuevo)}
                </p>
                {returned ? (
                  <Badge className="shrink-0 border-amber-200 bg-amber-100 text-[10px] font-semibold uppercase text-amber-800 hover:bg-amber-100">
                    <Repeat className="mr-1 h-3 w-3" />
                    Devolución
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {getActorName(event)} · {formatDateTime(event.creadoEn)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-700">
                {event.comentario?.trim() || "Sin observación registrada."}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}

type StageObservationEvent = Doc<"facturacionAprobaciones">;

function getStageObservationEvents(aprobaciones: StageObservationEvent[]) {
  const grouped = new Map<string, StageObservationEvent[]>();
  const validStages = new Set<string>(STAGE_ORDER);
  const sorted = [...aprobaciones].sort((a, b) => a.creadoEn - b.creadoEn);

  for (const event of sorted) {
    const phaseKey = getEventPhaseKey(event, validStages);
    if (!phaseKey) continue;
    const current = grouped.get(phaseKey) ?? [];
    current.push(event);
    grouped.set(phaseKey, current);
  }

  return grouped;
}

function getEventPhaseKey(event: StageObservationEvent, validStages: Set<string>) {
  if (isReturnApprovalEvent(event) && validStages.has(event.estadoNuevo)) {
    return event.estadoNuevo;
  }
  if (validStages.has(event.estadoAnterior)) {
    return event.estadoAnterior;
  }
  if (validStages.has(event.estadoNuevo)) {
    return event.estadoNuevo;
  }
  return null;
}

function isReturnApprovalEvent(event: StageObservationEvent) {
  return event.accion === "devolver_fase" || event.accion === "devolver_causacion";
}

export function getActionIcon(action: WorkflowAction) {
  if (action.kind === "assign-horizontal-lider" || action.kind === "assign-horizontal-par") {
    return <UserRound className="h-4 w-4" />;
  }
  if (action.kind === "reject-dian") return <XCircle className="h-4 w-4" />;
  if (action.kind === "confirm-reject-dian") return <CheckCircle2 className="h-4 w-4" />;
  if (action.kind === "close-nc") return <FileCheck2 className="h-4 w-4" />;
  if (action.kind === "close-invoice") return <Lock className="h-4 w-4" />;
  if (action.kind === "backward") return <RotateCcw className="h-4 w-4" />;
  if (action.kind === "legalize") return <CheckCircle2 className="h-4 w-4" />;
  if (action.kind === "mark-caja-menor" || action.kind === "legalize-caja-menor") {
    return <WalletCards className="h-4 w-4" />;
  }
  if (action.kind === "cross-anticipo" || action.kind === "mark-anticipo") {
    return <Coins className="h-4 w-4" />;
  }
  return <ArrowRight className="h-4 w-4" />;
}

export function getSelectedAssignee(
  action: WorkflowAction | null,
  ids: string[],
  pools: {
    lideres: FacturacionUsuario[];
    contadores: FacturacionUsuario[];
    analistasCausacion?: FacturacionUsuario[];
    eventosDian: FacturacionUsuario[];
    rechazosDian?: FacturacionUsuario[];
    gerencias?: FacturacionUsuario[];
    usuarios: FacturacionUsuario[];
  },
) {
  const id = ids[0];
  if (!action?.needsAssignee || !id) return null;
  const pool =
    action.needsAssignee === "lideres"
      ? pools.lideres
      : action.needsAssignee === "contadores"
        ? pools.contadores
      : action.needsAssignee === "analistas_causacion"
        ? (pools.analistasCausacion ?? [])
      : action.needsAssignee === "eventos_dian"
        ? pools.eventosDian
      : action.needsAssignee === "rechazos_dian"
        ? (pools.rechazosDian ?? [])
      : action.needsAssignee === "gerencia"
        ? (pools.gerencias ?? [])
        : pools.usuarios;
  return pool.find((usuario) => usuario.id === id) ?? null;
}

export function toUsuarioAsignacion(usuario: FacturacionUsuario): UsuarioAsignacion {
  return {
    usuarioId: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    procesoId: usuario.id_proceso ?? undefined,
    procesoNombre: usuario.proceso || undefined,
  };
}

export function getLiderProcesoSnapshot(
  tarea: BuzonTarea,
  usuariosById: Map<string, FacturacionUsuario>,
) {
  const tareaConProceso = tarea as BuzonTarea & {
    liderProcesoProcesoId?: number;
    liderProcesoProcesoNombre?: string;
  };
  const asignacionConProceso = tarea.asignacion as
    | (NonNullable<BuzonTarea["asignacion"]> & {
        asignadoAProcesoId?: number;
        asignadoAProcesoNombre?: string;
      })
    | null
    | undefined;
  const liderId =
    tarea.faseAsignacion === "revision_lider"
      ? tarea.asignacion?.asignadoAUserId ?? tarea.liderProcesoUserId
      : tarea.liderProcesoUserId;
  const lider = liderId ? usuariosById.get(liderId) : null;

  return {
    procesoId:
      asignacionConProceso?.asignadoAProcesoId ??
      tareaConProceso.liderProcesoProcesoId ??
      lider?.id_proceso ??
      undefined,
    procesoNombre:
      asignacionConProceso?.asignadoAProcesoNombre ??
      tareaConProceso.liderProcesoProcesoNombre ??
      lider?.proceso ??
      undefined,
  };
}

function formatAccion(accion: string, estadoNuevo?: string | null) {
  if (accion === "asignar_fase_usuario") {
    return estadoNuevo
      ? (FACTURACION_STATUS_LABELS[estadoNuevo] ?? estadoNuevo)
      : "Asignó fase y usuario";
  }

  const labels: Record<string, string> = {
    asignar_recepcion: "Asignó recepción",
    asignar_lider: "Asignó líder",
    aceptar: "Aceptó",
    rechazar: "Rechazó",
    rechazar_dian: "Rechazó DIAN",
    solicitar_rechazo_dian: "Solicitó rechazo DIAN",
    confirmar_rechazo_dian: "Confirmó rechazo DIAN",
    cruzar_nota_credito_rechazo_dian: "Relacionó nota crédito",
    relacionar_nota_credito: "Relacionó nota crédito",
    cerrar_nota_credito: "Cerró nota crédito",
    cerrar_factura: "Cerró factura",
    migrar_rechazo_dian: "Migró rechazo DIAN",
    causar: "Envió a causación",
    enviar_impuestos: "Envió a contabilidad",
    aprobar_impuestos: "Aprobó contabilidad",
    devolver_causacion: "Devolvió a causación",
    devolver_fase: "Devolvió fase",
    reenviar_impuestos: "Reenvió a contabilidad",
    asignar_jefe_directo: "Asignó jefe directo",
    asignar_lider_horizontal: "Asignó a otro(s) líder(es)",
    asignar_par: "Asignó a otro par",
    asignar_eventos_dian: "Asignó Eventos DIAN",
    asignar_gerencia: "Asignó gerencia",
    legalizar_factura: "Legalizó factura",
    aprobar_gerencia: "Aprobó gerencia",
    aprobar_pago: "Envió a tesorería",
    registrar_pago: "Registró pago",
    pago_parcial: "Registró pago parcial",
    reasignar: "Reasignó",
    comentar: "Comentó",
    adjuntar: "Adjuntó",
    marcar_causada: "Actualizó causada",
    actualizar_causacion: "Actualizó causación",
    marcar_anticipo: "Actualizó anticipo",
    cambiar_dueno_anticipo: "Cambió dueño del anticipo",
    legalizar_anticipo: "Legalizó anticipo",
    marcar_caja_menor: "Actualizó Caja Menor",
    crear_documento_fisico: "Creó documento físico",
    crear_movimiento_caja_menor: "Creó movimiento Caja Menor",
    generar_reembolso_caja_menor: "Generó reembolso Caja Menor",
    actualizar_centro_costo_caja_menor: "Actualizó centro de costo Caja Menor",
    aprobar_lider_reembolso_caja_menor: "Aprobó líder reembolso Caja Menor",
    rechazar_lider_reembolso_caja_menor: "Rechazó líder reembolso Caja Menor",
    aprobar_reembolso_caja_menor: "Aprobó reembolso Caja Menor",
    rechazar_reembolso_caja_menor: "Rechazó reembolso Caja Menor",
    confirmar_reembolso_caja_menor: "Confirmó recibo Caja Menor",
    anular_movimiento_caja_menor: "Anuló movimiento Caja Menor",
    devolver_buzon: "Devolvió a buzón",
    reasignar_revisor_caja_menor: "Reasignó revisor Caja Menor",
    legalizar_caja_menor: "Legalizó Caja Menor",
    enviar_impuestos_reembolso_caja_menor: "Envió a Contabilidad reembolso Caja Menor",
    aprobar_impuestos_reembolso_caja_menor: "Aprobó Contabilidad reembolso Caja Menor",
    rechazar_impuestos_reembolso_caja_menor: "Rechazó Contabilidad reembolso Caja Menor",
    devolver_impuestos_reembolso_caja_menor:
      "Devolvió a Revisor Caja Menor desde Contabilidad",
    reasignar_contador_reembolso_caja_menor: "Reasignó contador reembolso Caja Menor",
    devolver_gerencia_contabilidad_reembolso_caja_menor:
      "Devolvió a Contabilidad reembolso Caja Menor",
    devolver_gerencia_revision_reembolso_caja_menor:
      "Devolvió a Revisor reembolso Caja Menor",
    reenviar_gerencia_reembolso_caja_menor: "Reenvió a Gerencia reembolso Caja Menor",
  };
  return labels[accion] ?? accion;
}
