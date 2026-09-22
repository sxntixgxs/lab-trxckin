"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import {
  Download,
  ExternalLink,
  FileCheck2,
  Wallet,
  WalletCards,
} from "lucide-react";

import { EstadoBadge } from "@/components/cajas-menores";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ProveedorOrigenInline } from "@/app/(default)/finance/advances/components/proveedor-manual-status";
import { ExpandableObservation } from "../../../components/expandable-observation";
import { EmpresaBadge } from "../../../lib/empresa-ui";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatElapsed,
} from "../../../lib/utils";
import { getValorContable } from "../../../lib/valor-contable";
import {
  NotaCreditoRelacionDialog,
  type NotaCreditoRelacionDialogSource,
} from "../../../components/nota-credito-relacion-dialog";
import type { NotaCreditoRelacionDetalle, PeajesCruceDetalle } from "./types";
import { MoneyCard } from "./shared-ui";

import type { CajaMenorProcesoIntervalo } from "./types";

type ResponsabilidadRow = {
  id: string;
  origen: "facturacion" | "caja_menor";
  fase: string;
  responsable: string;
  rol?: string;
  estado: string;
  inicioEn: number;
  finEn: number;
  enCurso: boolean;
  duracionMs: number;
  diasLaborales: number;
  observacion?: string;
};

export function AsignacionesSection({
  asignaciones,
  intervalosCajaMenor = [],
}: {
  asignaciones: Array<Doc<"facturacionAsignaciones">>;
  intervalosCajaMenor?: CajaMenorProcesoIntervalo[];
}) {
  // Stable reference time for in-progress durations (Date.now() is impure during render).
  const [now] = useState(() => Date.now());
  const lideres = asignaciones.filter(
    (asignacion) => asignacion.fase === "revision_lider"
  );
  const lideresCompletados = lideres.filter(
    (asignacion) => asignacion.estado === "completada"
  ).length;

  const filas: ResponsabilidadRow[] = [
    ...asignaciones.map((asignacion) => ({
      id: String(asignacion._id),
      origen: "facturacion" as const,
      fase: formatFaseAsignacion(asignacion.fase),
      responsable: asignacion.asignadoANombre,
      rol: formatRolAsignacion(asignacion.rol),
      estado: formatEstadoAsignacion(asignacion.estado),
      inicioEn: asignacion.fechaAsignacion,
      finEn:
        asignacion.fechaCompletado ??
        asignacion.fechaAsignacion + (asignacion.duracionMs ?? 0),
      enCurso: asignacion.estado === "pendiente",
      duracionMs:
        asignacion.duracionMs ??
        Math.max(
          0,
          (asignacion.fechaCompletado ?? now) - asignacion.fechaAsignacion
        ),
      diasLaborales: 0,
      observacion: asignacion.comentario,
    })),
    ...intervalosCajaMenor.map((intervalo) => ({
      id: intervalo.id,
      origen: "caja_menor" as const,
      fase: intervalo.faseLabel,
      responsable: intervalo.responsableNombre,
      rol: intervalo.rol,
      estado: formatEstadoIntervaloCajaMenor(intervalo.estado, intervalo.enCurso),
      inicioEn: intervalo.inicioEn,
      finEn: intervalo.finEn,
      enCurso: intervalo.enCurso,
      duracionMs: intervalo.duracionMs,
      diasLaborales: intervalo.diasLaborales,
      observacion: intervalo.observacion,
    })),
  ].sort((a, b) => a.inicioEn - b.inicioEn);

  if (filas.length === 0) return null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Responsables y tiempos
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Responsabilidades del flujo de factura y del reembolso Caja Menor.
          </p>
        </div>
        {lideres.length > 0 ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Líderes {lideresCompletados}/{lideres.length}
          </span>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
            <tr>
              <th className="px-3 py-2">Origen</th>
              <th className="px-3 py-2">Fase</th>
              <th className="px-3 py-2">Responsable</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Inicio</th>
              <th className="px-3 py-2">Fin</th>
              <th className="px-3 py-2">Tiempo calendario</th>
              <th className="px-3 py-2">Días laborales</th>
              <th className="px-3 py-2">Observación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((fila) => (
              <tr key={fila.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      fila.origen === "caja_menor"
                        ? "bg-teal-50 text-teal-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {fila.origen === "caja_menor"
                      ? "Reembolso Caja Menor"
                      : "Flujo de factura"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">
                  {fila.fase}
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium text-slate-800">{fila.responsable}</p>
                  {fila.rol ? (
                    <p className="text-xs text-slate-500">{fila.rol}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {fila.estado}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                  {formatDateTime(fila.inicioEn)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                  {fila.enCurso ? "En curso" : formatDateTime(fila.finEn)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">
                  {formatElapsed(fila.duracionMs)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                  {fila.origen === "caja_menor" ? fila.diasLaborales : "—"}
                </td>
                <td className="max-w-[260px] px-3 py-3 text-slate-600">
                  <ExpandableObservation
                    text={fila.observacion ?? ""}
                    collapsedLines={2}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatEstadoIntervaloCajaMenor(estado: string, enCurso: boolean) {
  if (enCurso) return "En curso";
  const labels: Record<string, string> = {
    en_curso: "En curso",
    completada: "Completada",
    devuelta: "Devuelta",
    rechazada: "Rechazada",
    reasignada: "Reasignada",
    anulada: "Anulada",
  };
  return labels[estado] ?? estado;
}

function formatFaseAsignacion(fase: string) {
  const labels: Record<string, string> = {
    recepcion: "Recepción",
    revision_lider: "Revisión líder",
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

function formatRolAsignacion(rol: string) {
  const labels: Record<string, string> = {
    recepcion: "Recepción",
    lider: "Líder",
    jefe_directo: "Jefe directo",
    analista_causacion: "Analista causación",
    contador_impuestos: "Contabilidad",
    eventos_dian: "Eventos DIAN",
    rechazos_dian: "Rechazos DIAN",
    gerencia: "Gerencia",
    gerente_financiero: "Gerente financiero",
    gerente_general: "Gerente general",
    tesorero: "Tesorero",
  };
  return labels[rol] ?? rol;
}

function formatEstadoAsignacion(estado: string) {
  const labels: Record<string, string> = {
    pendiente: "Pendiente",
    completada: "Completada",
    devuelta: "Devuelta",
    rechazada: "Rechazada",
    cancelada: "Cancelada",
    reasignada: "Reasignada",
  };
  return labels[estado] ?? estado;
}

function getAsignacionStatusClass(estado: string) {
  const classes: Record<string, string> = {
    pendiente: "bg-amber-50 text-amber-700",
    completada: "bg-emerald-50 text-emerald-700",
    devuelta: "bg-orange-50 text-orange-700",
    rechazada: "bg-rose-50 text-rose-700",
    cancelada: "bg-slate-100 text-slate-500",
    reasignada: "bg-indigo-50 text-indigo-700",
  };
  return classes[estado] ?? "bg-slate-100 text-slate-600";
}

function formatAssignmentDuration(asignacion: Doc<"facturacionAsignaciones">) {
  if (typeof asignacion.duracionMs === "number") {
    return formatDurationMs(asignacion.duracionMs);
  }
  if (asignacion.estado === "pendiente") {
    return formatElapsed(asignacion.fechaAsignacion);
  }
  return "-";
}

function formatDurationMs(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin ? `${hours}h ${remMin}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

export function PaymentReceiptCard({
  url,
  nombre,
  fechaPago,
}: {
  url: string | null;
  nombre: string | null;
  fechaPago: number;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-6 shadow-xs">
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-emerald-100/60 blur-2xl" />
      <div className="relative flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-200">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Factura pagada
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">
            Comprobante de pago disponible
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Registrado por tesorería el {formatDateTime(fechaPago)}.
          </p>
          {nombre ? (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-800">
              <FileCheck2 className="h-3.5 w-3.5" />
              {nombre}
            </p>
          ) : null}
        </div>
        {url ? (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-col">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-slate-800 sm:flex-initial"
            >
              <ExternalLink className="h-4 w-4" />
              Ver PDF
            </a>
            <a
              href={url}
              download
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 sm:flex-initial"
            >
              <Download className="h-4 w-4" />
              Descargar
            </a>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-emerald-300 bg-white px-4 py-2 text-xs text-emerald-700">
            Sin archivo cargado
          </p>
        )}
      </div>
    </section>
  );
}

export function NotaCreditoRelacionSection({
  detalle,
  facturaActualId,
  moneda,
  facturaActual,
  onRelacionChanged,
}: {
  detalle: NotaCreditoRelacionDetalle;
  facturaActualId: Id<"facturacionFacturas">;
  moneda: string;
  facturaActual: Doc<"facturacionFacturas">;
  onRelacionChanged?: () => void;
}) {
  const [dialogNota, setDialogNota] = useState<Doc<"facturacionFacturas"> | null>(
    null,
  );
  const historial = useQuery(
    api.facturacionNotaCreditoRelacion.listarHistorialRelacionDocumento,
    { facturaId: facturaActualId },
  );

  if (detalle.esPeajes) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50/40 p-6 shadow-xs">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
          Cruce nota crédito
        </p>
        <h2 className="mt-1 text-base font-semibold text-slate-900">
          Documento PEAJES
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {detalle.mensajePeajes ??
            "Las relaciones PEAJES solo se pueden cambiar desde una conciliación PEAJES activa."}
        </p>
      </section>
    );
  }

  const esFacturaOrigen =
    detalle.facturaOrigen != null &&
    detalle.facturaOrigen._id === facturaActualId;
  const esNotaActual =
    facturaActual.documentoClase === "nota_credito" ||
    facturaActual.tipoDocumento === "91" ||
    facturaActual.tipoDocumentoNormalizado === "91";
  const totalNotas = detalle.notasCredito.reduce(
    (sum, nota) => sum + Math.abs(getValorContable(nota)),
    0,
  );

  const dialogSource: NotaCreditoRelacionDialogSource | null = dialogNota
    ? {
        id: String(dialogNota._id),
        numero: dialogNota.numeroFactura,
        total: dialogNota.total,
        moneda: dialogNota.moneda,
        fechaEmision: dialogNota.fechaEmision,
        proveedorNombre: dialogNota.proveedorNombre,
        proveedorNit: dialogNota.proveedorNit,
        referenciaXml: dialogNota.referenciaDocumento,
        facturaActual: detalle.facturaOrigen
          ? {
              id: String(detalle.facturaOrigen._id),
              numero: detalle.facturaOrigen.numeroFactura,
              origen: detalle.origenRelacion === "manual" ? "manual" : "dian",
            }
          : undefined,
        origenRelacionEfectiva: detalle.origenRelacion ?? "sin_relacion",
      }
    : null;

  return (
    <section className="rounded-3xl border border-cyan-200 bg-cyan-50/40 p-6 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Cruce nota crédito
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">
            {esNotaActual
              ? detalle.facturaOrigen
                ? "Nota crédito asociada a factura origen"
                : "Nota crédito sin factura relacionada"
              : detalle.notasCredito.length > 0
                ? "Factura con nota crédito relacionada"
                : "Historial de relación de notas crédito"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            La relación queda visible desde ambos documentos sin cerrar
            automáticamente ninguno de los dos.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-2xl border border-cyan-200 bg-white px-4 py-3 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">
              Valor NC
            </p>
            <p className="text-lg font-black text-cyan-950">
              {formatCurrency(totalNotas, moneda)}
            </p>
          </div>
          {esNotaActual ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-cyan-200 bg-white text-cyan-800"
              onClick={() => setDialogNota(facturaActual)}
            >
              {detalle.facturaOrigen
                ? "Cambiar factura relacionada"
                : "Aplicar a otra factura"}
            </Button>
          ) : null}
        </div>
      </div>

      {detalle.facturaOrigen && !esFacturaOrigen ? (
        <div className="mt-4 rounded-2xl border border-cyan-100 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Factura origen
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">
                {detalle.facturaOrigen.numeroFactura}
              </p>
              <p className="text-xs text-slate-500">
                {detalle.facturaOrigen.proveedorNombre} · NIT{" "}
                {detalle.facturaOrigen.proveedorNit}
              </p>
            </div>
            <Link
              href={`/billing/invoices/${detalle.facturaOrigen._id}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-800 transition hover:bg-cyan-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver factura
            </Link>
          </div>
        </div>
      ) : null}

      {detalle.notasCredito.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-100 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-cyan-50 text-left text-xs uppercase tracking-wide text-cyan-700">
              <tr>
                <th className="px-4 py-3">Nota crédito</th>
                <th className="px-4 py-3">Referencia</th>
                <th className="px-4 py-3">Emisión</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-100">
              {detalle.notasCredito.map((nota) => (
                <tr key={nota._id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">
                      {nota.numeroFactura}
                    </p>
                    <p className="text-xs text-slate-500">{nota.proveedorNombre}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {nota.referenciaDocumento ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(nota.fechaEmision)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-cyan-700">
                    {formatCurrency(getValorContable(nota), nota.moneda)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {esFacturaOrigen ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl border-cyan-200"
                          onClick={() => setDialogNota(nota)}
                        >
                          Cambiar factura
                        </Button>
                      ) : null}
                      {nota._id === facturaActualId ? (
                        <span className="text-xs font-semibold text-slate-400">
                          Documento actual
                        </span>
                      ) : (
                        <Link
                          href={`/billing/invoices/${nota._id}`}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-800 transition hover:bg-cyan-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Ver nota
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {historial && historial.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-cyan-100 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">
            Historial de relaciones
          </p>
          <ul className="mt-3 space-y-3">
            {historial.map((row) => (
              <li
                key={row._id}
                className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {(row.facturaAnteriorNumero ?? "Sin relación") +
                        " → " +
                        row.facturaNuevaNumero}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.actorNombre} · {formatDateTime(row.creadoEn)} ·{" "}
                      {row.contexto}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    {row.origenRelacionAnterior}
                  </span>
                </div>
                <p className="mt-1 text-slate-600">{row.motivo}</p>
                {row.referenciaXml ? (
                  <p className="mt-1 text-xs text-slate-500">
                    XML origen: {row.referenciaXml}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dialogNota && dialogSource ? (
        <NotaCreditoRelacionDialog
          open={Boolean(dialogNota)}
          onOpenChange={(open) => {
            if (!open) setDialogNota(null);
          }}
          notaCreditoId={dialogNota._id}
          source={dialogSource}
          contexto={{ tipo: "detalle_factura" }}
          onSuccess={onRelacionChanged}
        />
      ) : null}
    </section>
  );
}

export function PeajesNotasCreditoSection({
  detalle,
  moneda,
}: {
  detalle: PeajesCruceDetalle;
  moneda: string;
}) {
  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Notas crédito aplicadas en PEAJES
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">
            Descuento aplicado antes de legalizar la factura
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Este cruce legaliza el neto después de descontar las notas crédito
            relacionadas.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            Neto PEAJES
          </p>
          <p className="text-lg font-black text-emerald-950">
            {formatCurrency(detalle.valorNeto, moneda)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <PeajesCruceMoneyMetric
          label="Bruto factura"
          value={detalle.valorBruto}
          moneda={moneda}
        />
        <PeajesCruceMoneyMetric
          label="Descuento NC"
          value={detalle.valorNotasCredito}
          moneda={moneda}
          highlight
        />
        <PeajesCruceMoneyMetric
          label="Neto aplicado"
          value={detalle.valorNeto}
          moneda={moneda}
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-emerald-100 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-emerald-50 text-left text-xs uppercase tracking-wide text-emerald-700">
            <tr>
              <th className="px-4 py-3">Nota crédito</th>
              <th className="px-4 py-3">Emisión</th>
              <th className="px-4 py-3">Factura relacionada</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100">
            {detalle.notasCredito.map((nota) => (
              <tr key={nota.notaCreditoId}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">
                    {nota.numeroFactura}
                  </p>
                  <p className="text-xs text-slate-500">
                    Ref. {nota.referenciaDocumento ?? "-"}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {nota.fechaEmision ? formatDate(nota.fechaEmision) : "-"}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {nota.facturaRelacionadaNumero ?? "-"}
                </td>
                <td className="px-4 py-3 text-right font-bold text-emerald-700">
                  {formatCurrency(nota.valor, moneda)}
                </td>
                <td className="px-4 py-3 text-right">
                  {nota.detalleDisponible ? (
                    <Link
                      href={`/billing/invoices/${nota.notaCreditoId}`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver nota crédito
                    </Link>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400">
                      Sin detalle
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PeajesCruceMoneyMetric({
  label,
  value,
  moneda,
  highlight,
}: {
  label: string;
  value: number;
  moneda: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-black ${
          highlight ? "text-emerald-700" : "text-slate-950"
        }`}
      >
        {formatCurrency(value, moneda)}
      </p>
    </div>
  );
}

export function AnticiposLegalizacionSection({
  legalizaciones,
  moneda,
  peajesCruceDetalle,
}: {
  legalizaciones: Array<
    Doc<"facturacionAnticipoLegalizaciones"> & {
      anticipo: Doc<"anticipos"> | null;
    }
  >;
  moneda: string;
  peajesCruceDetalle?: PeajesCruceDetalle | null;
}) {
  const total = legalizaciones.reduce(
    (sum, legalizacion) => sum + legalizacion.valorAplicado,
    0
  );

  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/50 p-6 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Legalización de anticipos
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">
            Esta factura cruza {legalizaciones.length} anticipo(s)
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Valor legalizado con esta factura:{" "}
            <span className="font-bold text-amber-900">
              {formatCurrency(total, moneda)}
            </span>
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {peajesCruceDetalle
              ? "Para PEAJES, el valor aplicado corresponde al neto después de descontar notas crédito."
              : "Estado actual de la factura según legalizaciones activas."}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
            Total aplicado
          </p>
          <p className="text-lg font-black text-amber-950">
            {formatCurrency(total, moneda)}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-amber-100 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-amber-50 text-left text-xs uppercase tracking-wide text-amber-700">
            <tr>
              <th className="px-4 py-3">Anticipo</th>
              <th className="px-4 py-3 text-right">Valor aplicado</th>
              <th className="px-4 py-3 text-right">Pendiente antes</th>
              <th className="px-4 py-3 text-right">Pendiente después</th>
              <th className="px-4 py-3">Líder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {legalizaciones.map((legalizacion) => (
              <tr key={legalizacion._id}>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      Anticipo #
                      {legalizacion.anticipo?.consecutivo ??
                        legalizacion.anticipoId}
                    </p>
                    <ProveedorOrigenInline
                      origen={legalizacion.anticipo?.proveedorOrigen}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {legalizacion.anticipo?.razonSocial ?? "Sin detalle"}
                  </p>
                </td>
                <td className="px-4 py-3 text-right font-bold text-emerald-700">
                  {formatCurrency(legalizacion.valorAplicado, moneda)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {formatCurrency(getSaldoPendienteAntes(legalizacion), moneda)}
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {formatCurrency(
                    getSaldoPendienteDespues(legalizacion),
                    moneda
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {legalizacion.liderNombre}
                  </p>
                  <p className="text-xs text-slate-500">
                    {legalizacion.liderEmail}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CajaMenorLegalizacionSection({
  legalizaciones,
  moneda,
}: {
  legalizaciones: Array<
    Doc<"facturacionCajaMenorLegalizaciones"> & {
      cajaMenor: Doc<"cajasMenores"> | null;
    }
  >;
  moneda: string;
}) {
  const total = legalizaciones.reduce(
    (sum, legalizacion) =>
      sum + (legalizacion.estado === "activa" ? legalizacion.valorAplicado : 0),
    0
  );

  return (
    <section className="rounded-3xl border border-teal-200 bg-teal-50/50 p-6 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-white">
            <WalletCards className="h-5 w-5" />
          </div>
          <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
            Legalización Caja Menor
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">
            Esta factura cruza {legalizaciones.length} movimiento(s) de Caja Menor
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Valor activo legalizado:{" "}
            <span className="font-bold text-teal-900">
              {formatCurrency(total, moneda)}
            </span>
          </p>
          </div>
        </div>
        <div className="rounded-2xl border border-teal-200 bg-white px-4 py-3 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">
            Movimiento activo
          </p>
          <p className="text-lg font-black text-teal-950">
            {formatCurrency(total, moneda)}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-teal-100 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-teal-50 text-left text-xs uppercase tracking-wide text-teal-700">
            <tr>
              <th className="px-4 py-3">Caja</th>
              <th className="px-4 py-3 text-right">Valor aplicado</th>
              <th className="px-4 py-3 text-right">Saldo antes</th>
              <th className="px-4 py-3 text-right">Saldo después</th>
              <th className="px-4 py-3">Responsable</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-teal-100">
            {legalizaciones.map((legalizacion) => (
              <tr key={legalizacion._id}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">
                    {legalizacion.cajaMenor?.nombre ?? String(legalizacion.cajaMenorId)}
                  </p>
                  <p className="text-xs text-slate-500">
                    <EmpresaBadge empresaId={legalizacion.empresa} compact />
                  </p>
                </td>
                <td className="px-4 py-3 text-right font-bold text-emerald-700">
                  {formatCurrency(legalizacion.valorAplicado, moneda)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {formatCurrency(legalizacion.saldoAntes, moneda)}
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {formatCurrency(legalizacion.saldoDespues, moneda)}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {legalizacion.actorNombre}
                  </p>
                  <p className="text-xs text-slate-500">
                    {legalizacion.actorEmail}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      legalizacion.estado === "activa"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {legalizacion.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CajaMenorReembolsoSection({
  movimientos,
  moneda,
}: {
  movimientos: Array<{
    _id: string;
    estado: string;
    valor: number;
    concepto: string;
    centroCostoCodigo: string;
    centroCostoNombre: string;
    origen?: string;
    cajaMenorId?: string;
    cajaMenor?: { nombre?: string } | null;
    reembolso?: { estado: string } | null;
  }>;
  moneda: string;
}) {
  const total = movimientos
    .filter((movimiento) => movimiento.estado !== "anulado")
    .reduce((sum, movimiento) => sum + movimiento.valor, 0);
  const cajaNombre =
    movimientos.find((movimiento) => movimiento.cajaMenor?.nombre)?.cajaMenor?.nombre ??
    "Caja Menor";

  return (
    <section className="rounded-3xl border border-teal-200 bg-teal-50/50 p-6 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-white">
            <WalletCards className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
              Reembolso Caja Menor
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">
              Relacionada con {cajaNombre}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Valor enviado a reembolso:{" "}
              <span className="font-bold text-teal-900">
                {formatCurrency(total, moneda)}
              </span>
            </p>
            {movimientos[0]?.cajaMenorId ? (
              <Link
                href="/finance/petty-cash"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 underline-offset-2 hover:underline"
              >
                Ver caja {cajaNombre}
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-teal-200 bg-white px-4 py-3 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">
            Total movimiento
          </p>
          <p className="text-lg font-black text-teal-950">
            {formatCurrency(total, moneda)}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-teal-100 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-teal-50 text-left text-xs uppercase tracking-wide text-teal-700">
            <tr>
              <th className="px-4 py-3">Caja</th>
              <th className="px-4 py-3">Centro costo</th>
              <th className="px-4 py-3">Concepto</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Reembolso</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-teal-100">
            {movimientos.map((movimiento) => (
              <tr key={String(movimiento._id)}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">
                    {movimiento.cajaMenor?.nombre ?? String(movimiento.cajaMenorId)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {movimiento.origen === "recibo_fisico" ? "Recibo físico" : "Factura sistema"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p>{movimiento.centroCostoCodigo}</p>
                  <p className="text-xs text-slate-500">
                    {movimiento.centroCostoNombre}
                  </p>
                </td>
                <td className="px-4 py-3">{movimiento.concepto}</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-700">
                  {formatCurrency(movimiento.valor, moneda)}
                </td>
                <td className="px-4 py-3">
                  {movimiento.reembolso ? (
                    <EstadoBadge kind="reembolso" estado={movimiento.reembolso.estado} />
                  ) : (
                    <EstadoBadge kind="movimiento" estado="pendiente_reembolso" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <EstadoBadge kind="movimiento" estado={movimiento.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getSaldoPendienteAntes(
  legalizacion: Doc<"facturacionAnticipoLegalizaciones"> & {
    anticipo: Doc<"anticipos"> | null;
  }
) {
  const valorAnticipo = legalizacion.anticipo?.valorNumerico;
  if (typeof valorAnticipo !== "number") return legalizacion.saldoAntes;
  return Math.max(0, valorAnticipo - legalizacion.saldoAntes);
}

function getSaldoPendienteDespues(
  legalizacion: Doc<"facturacionAnticipoLegalizaciones"> & {
    anticipo: Doc<"anticipos"> | null;
  }
) {
  const valorAnticipo = legalizacion.anticipo?.valorNumerico;
  if (typeof valorAnticipo !== "number") return legalizacion.saldoDespues;
  return Math.max(0, valorAnticipo - legalizacion.saldoDespues);
}

export function CrucesDocumentosInternosSection({
  facturaId,
  factura,
}: {
  facturaId: Id<"facturacionFacturas">;
  factura: Doc<"facturacionFacturas">;
}) {
  const documentos = useQuery(api.facturacionCrucesDocumentosInternos.listarCrucesInternosActivosPorFactura, {
    facturaId,
    paginationOpts: { numItems: 50, cursor: null },
  });
  const historial = useQuery(api.facturacionCrucesDocumentosInternos.listarHistorialCrucesInternosFactura, {
    facturaId,
    paginationOpts: { numItems: 50, cursor: null },
  });

  const cantidad = factura.cantidadCrucesDocumentosInternos ?? documentos?.page.length ?? 0;
  const totalInterno = factura.valorCrucesDocumentosInternos ?? 0;
  if (cantidad === 0 && (historial?.page.length ?? 0) === 0) return null;

  const valorContable = getValorContable(factura);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Facturas/cuentas de cobro internas
      </p>
      <h2 className="mt-1 text-base font-semibold text-slate-900">
        {cantidad} documento(s) activo(s)
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Total aplicado:{" "}
        <span className="font-bold text-emerald-800">
          {formatCurrency(totalInterno, factura.moneda)}
        </span>
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MoneyCard label="Valor contable" value={formatCurrency(valorContable, factura.moneda)} />
        <MoneyCard
          label="Documentos internos"
          value={formatCurrency(totalInterno, factura.moneda)}
        />
        <MoneyCard
          label="Valor a pagar"
          value={formatCurrency(factura.valorAPagar ?? Math.max(0, valorContable - totalInterno), factura.moneda)}
          highlight
        />
      </dl>

      {documentos?.page.length ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Valor aplicado</th>
                <th className="px-4 py-3">Registrado</th>
              </tr>
            </thead>
            <tbody>
              {documentos.page.map((row) => (
                <tr key={row._id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.numeroDocumento}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatCurrency(row.valorAplicado, row.moneda)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(row.creadoEn).toLocaleString("es-CO")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {historial?.page.length ? (
        <div className="mt-6">
          <p className="text-sm font-semibold text-slate-900">Historial de cambios</p>
          <div className="mt-3 space-y-3">
            {historial.page.map((evento) => (
              <div key={evento._id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-900">{evento.comentario}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {evento.actorNombre ?? evento.actorEmail ?? "Sistema"} ·{" "}
                  {new Date(evento.creadoEn).toLocaleString("es-CO")}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

