"use client";

import {
  CheckCircle2,
  FileCheck2,
  Lock,
  XCircle,
} from "lucide-react";
import { useQuery } from "convex/react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { FacturacionStatusBadge, resolveFacturaEstado } from "../../../components/status-badge";
import {
  getStageDisplayLabel,
  getStageIndexInOrder,
  getTerminalBranchStage,
  isTerminalFacturacionStage,
  TERMINAL_STAGE_META,
  TERMINAL_TONE_STYLES,
  type FacturacionTerminal,
} from "../../../lib/workflow-config";
import { FLOW_STEPS, type CajaMenorProceso, type PeajesCruceDetalle } from "./types";

function UnifiedCajaMenorStep({
  index,
  label,
  estado,
}: {
  index: number;
  label: string;
  estado: "completado" | "actual" | "omitida" | "pendiente";
}) {
  const barClass =
    estado === "completado"
      ? "bg-emerald-500"
      : estado === "actual"
        ? "bg-amber-500"
        : estado === "omitida"
          ? "bg-slate-300"
          : "bg-slate-200";
  const chipClass =
    estado === "completado"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : estado === "actual"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : estado === "omitida"
          ? "border-slate-200 bg-slate-50 text-slate-500 line-through decoration-slate-400"
          : "border-slate-200 bg-white text-slate-400";

  return (
    <li
      className="flex min-w-[9.5rem] shrink-0 flex-col gap-2 snap-start"
      aria-current={estado === "actual" ? "step" : undefined}
    >
      <div className={`h-1.5 rounded-full ${barClass}`} />
      <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${chipClass}`}>
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            estado === "completado"
              ? "bg-emerald-500 text-white"
              : estado === "actual"
                ? "bg-amber-500 text-white"
                : "border border-slate-200 bg-white text-slate-400"
          }`}
        >
          {index}
        </span>
        <span className="text-[11px] font-semibold leading-tight">
          {estado === "omitida" ? `${label} · Omitida` : label}
        </span>
      </div>
    </li>
  );
}

function CajaMenorUnifiedFlowStrip({
  cajaMenorProceso,
  tareaEstado,
}: {
  cajaMenorProceso: CajaMenorProceso;
  tareaEstado?: string;
}) {
  return (
    <section className="rounded-3xl border border-teal-200 bg-teal-50/20 p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
            Progreso Caja Menor
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            Etapa actual: {cajaMenorProceso.fasePublicaLabel}
          </p>
          {cajaMenorProceso.responsableActual ? (
            <p className="mt-1 text-xs text-slate-600">
              Responsable: {cajaMenorProceso.responsableActual.nombre}
            </p>
          ) : null}
        </div>
        <FacturacionStatusBadge estado={cajaMenorProceso.fasePublica} />
      </div>
      {cajaMenorProceso.advertencia ? (
        <p
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          {cajaMenorProceso.advertencia}
        </p>
      ) : null}
      <div className="mt-5 -mx-1 overflow-x-auto pb-1">
        <ol
          className="flex min-w-max gap-2 px-1 snap-x snap-mandatory"
          aria-label="Etapas del flujo de factura y reembolso Caja Menor"
        >
          {cajaMenorProceso.pasosBarraUnificada.map((paso, index) => (
            <UnifiedCajaMenorStep
              key={paso.key}
              index={index + 1}
              label={paso.label}
              estado={paso.estado}
            />
          ))}
        </ol>
      </div>
      {tareaEstado === "reembolso_caja_menor" ? (
        <p className="mt-3 text-xs text-slate-500">
          Las etapas omitidas no generan duración en responsables y tiempos.
        </p>
      ) : null}
    </section>
  );
}

function computeStepIndex(estado: string): number {
  if (estado === "jefe_directo") {
    return FLOW_STEPS.findIndex((step) => step.key === "revision_lider");
  }
  if (
    estado === "pendiente_rechazar_dian" ||
    estado === "pendiente_nota_credito"
  ) {
    return FLOW_STEPS.findIndex((step) => step.key === "eventos_dian");
  }
  const idx = FLOW_STEPS.findIndex((step) => step.key === estado);
  return idx < 0 ? 0 : idx;
}

function getTerminalIcon(terminal: FacturacionTerminal) {
  switch (terminal) {
    case "pagada":
      return CheckCircle2;
    case "legalizada":
    case "cerrada":
      return FileCheck2;
    case "nota_credito_cerrada":
      return Lock;
    case "rechazada":
    case "rechazada_dian":
      return XCircle;
  }
}

function PeajesStage({
  index,
  label,
  active,
  done,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  const filled = active || done;
  return (
    <li className="flex flex-col gap-2">
      <div
        className={`h-1.5 rounded-full ${
          done ? "bg-emerald-500" : active ? "bg-amber-500" : "bg-slate-200"
        }`}
      />
      <div
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
          done
            ? "border-emerald-200 bg-emerald-50"
            : active
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-white"
        }`}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            done
              ? "bg-emerald-500 text-white"
              : active
                ? "bg-amber-500 text-white"
                : "border border-slate-200 bg-white text-slate-400"
          }`}
        >
          {index}
        </span>
        <span
          className={`text-sm font-semibold ${
            filled
              ? done
                ? "text-emerald-900"
                : "text-amber-900"
              : "text-slate-500"
          }`}
        >
          {label}
        </span>
      </div>
    </li>
  );
}

function PeajesFlowStrip({
  factura,
  peajesCruceDetalle,
  estadoResuelto,
}: {
  factura: Doc<"facturacionFacturas">;
  peajesCruceDetalle: PeajesCruceDetalle | null;
  estadoResuelto?: string | null;
}) {
  const contable = useQuery(api.facturacionPeajesContabilidad.obtenerEstadoContableFactura, {
    facturaId: factura._id,
  });
  const estado = resolveFacturaEstado({
    factura,
    estadoResuelto,
    estadoContable: contable?.estado ?? null,
  });
  const cruceAplicado =
    Boolean(peajesCruceDetalle) ||
    Boolean(factura.peajesCruce) ||
    Boolean(contable);
  const pendienteContabilidad = contable?.estado === "pendiente_contabilidad";
  const contabilizada = contable?.estado === "contabilizada";

  const copy = contabilizada
    ? "Factura revisada y contabilizada."
    : pendienteContabilidad
      ? "Cruce aplicado. Pendiente de contabilización."
      : cruceAplicado
        ? "Cruce masivo aplicado sobre esta factura."
        : "Pendiente de cruce masivo en el módulo de peajes.";

  return (
    <section className="rounded-3xl border border-teal-200 bg-teal-50/30 p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
            Flujo peajes electrónicos
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">{copy}</p>
        </div>
        {estado ? <FacturacionStatusBadge estado={estado} /> : null}
      </div>
      <ol className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PeajesStage index={1} label="Recepción" active={!cruceAplicado} done={cruceAplicado || pendienteContabilidad || contabilizada} />
        <PeajesStage index={2} label="Cruce aplicado" active={cruceAplicado && !pendienteContabilidad && !contabilizada} done={pendienteContabilidad || contabilizada || cruceAplicado} />
        <PeajesStage index={3} label="Pendiente contabilidad" active={pendienteContabilidad} done={contabilizada} />
        <PeajesStage index={4} label="Contabilizada" active={contabilizada} done={contabilizada} />
      </ol>
    </section>
  );
}

export function FacturaFlowProgress({
  factura,
  tarea,
  aprobaciones,
  peajesCruceDetalle,
  estadoResuelto,
  cajaMenorProceso,
}: {
  factura: Doc<"facturacionFacturas">;
  tarea: Doc<"facturacionTareas"> | null;
  aprobaciones: Array<Doc<"facturacionAprobaciones">>;
  peajesCruceDetalle: PeajesCruceDetalle | null;
  estadoResuelto?: string | null;
  cajaMenorProceso?: CajaMenorProceso | null;
}) {
  if (!tarea && factura.esPeaje) {
    return (
      <PeajesFlowStrip
        factura={factura}
        peajesCruceDetalle={peajesCruceDetalle}
        estadoResuelto={estadoResuelto}
      />
    );
  }

  if (!tarea) return null;

  if (cajaMenorProceso?.aplica) {
    return (
      <CajaMenorUnifiedFlowStrip
        cajaMenorProceso={cajaMenorProceso}
        tareaEstado={tarea.estado}
      />
    );
  }

  const stepIndex = computeStepIndex(tarea.estado);
  const isTerminal = isTerminalFacturacionStage(tarea.estado);
  const terminalStage = isTerminal ? (tarea.estado as FacturacionTerminal) : null;
  const terminalMeta = terminalStage ? TERMINAL_STAGE_META[terminalStage] : null;
  const branchIndex =
    terminalStage && terminalStage !== "pagada"
      ? getStageIndexInOrder(
          getTerminalBranchStage(terminalStage, aprobaciones),
          FLOW_STEPS.map((step) => step.key),
        )
      : terminalStage === "pagada"
        ? FLOW_STEPS.length - 1
        : stepIndex;
  const etapaActual = getStageDisplayLabel(tarea.estado);
  const isRechazada = tarea.estado === "rechazada";
  const lideresProgress =
    tarea.estado === "revision_lider" && tarea.lideresTotal
      ? `${tarea.lideresCompletados ?? 0}/${tarea.lideresTotal} aprobados`
      : null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Progreso del flujo
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {isRechazada
              ? "La factura fue rechazada y salió del flujo."
              : `Etapa actual: ${etapaActual}`}
          </p>
          {lideresProgress ? (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              Revisión líder: {lideresProgress}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <FacturacionStatusBadge estado={tarea.estado} />
          {factura.isFisico ? (
            <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
              Documento físico
            </Badge>
          ) : null}
        </div>
      </div>

      <ol
        className="mt-5 grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${FLOW_STEPS.length}, minmax(0, 1fr))`,
        }}
      >
        {isTerminal && terminalStage && terminalStage !== "pagada" ? (
          <>
            {FLOW_STEPS.slice(0, branchIndex + 1).map((step, idx) => (
              <li key={step.key} className="flex flex-col gap-2">
                <div className="h-1.5 rounded-full bg-emerald-500 transition" />
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                    {idx + 1}
                  </span>
                  <span className="truncate text-[11px] font-medium text-slate-700">
                    {step.label}
                  </span>
                </div>
              </li>
            ))}
            <li
              className="flex flex-col gap-2"
              style={{
                gridColumn: `span ${FLOW_STEPS.length - branchIndex - 1}`,
              }}
            >
              <div
                className={`h-1.5 rounded-full ${TERMINAL_TONE_STYLES[terminalMeta!.tone].bar}`}
              />
              <div
                className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${TERMINAL_TONE_STYLES[terminalMeta!.tone].chip}`}
              >
                {(() => {
                  const Icon = getTerminalIcon(terminalStage);
                  return <Icon className="h-3.5 w-3.5 shrink-0" />;
                })()}
                <span className="truncate text-[11px] font-semibold">
                  {terminalMeta!.label}
                </span>
              </div>
            </li>
          </>
        ) : isTerminal && terminalStage === "pagada" ? (
          FLOW_STEPS.map((step, idx) => (
            <li key={step.key} className="flex flex-col gap-2">
              <div className="h-1.5 rounded-full bg-emerald-500 transition" />
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  {idx === FLOW_STEPS.length - 1 ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <span className="text-[10px] font-bold">{idx + 1}</span>
                  )}
                </span>
                <span className="truncate text-[11px] font-medium text-slate-700">
                  {step.label}
                </span>
              </div>
            </li>
          ))
        ) : (
          FLOW_STEPS.map((step, idx) => {
            const reached = idx <= stepIndex;
            const current = idx === stepIndex;
            return (
              <li key={step.key} className="flex flex-col gap-2">
                <div
                  className={`h-1.5 rounded-full transition ${
                    reached
                      ? current
                        ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                        : "bg-emerald-500"
                      : "bg-slate-200"
                  }`}
                />
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      reached
                        ? "bg-emerald-500 text-white"
                        : "border border-slate-200 bg-white text-slate-400"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span
                    className={`truncate text-[11px] font-medium ${
                      current
                        ? "text-slate-900"
                        : reached
                          ? "text-slate-700"
                          : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
