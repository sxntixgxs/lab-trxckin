import { useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { WalletCards } from "lucide-react";

import { CentroCostoDistribucionEditor } from "@/components/cajas-menores/centro-costo-distribucion-editor";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BuzonTarea } from "../../../components/buzon-row";
import { formatCurrency } from "../../../lib/utils";
import { getSaldoDisponibleTextClass } from "@/lib/cajas-menores";
import { EmpresaBadge } from "../../../lib/empresa-ui";
import { toLegacyCentroCosto } from "@/lib/cajas-menores/centros-costo-distribucion";
import { normalizeCajasMenoresDisponibles } from "@/lib/cajas-menores/disponibles-result";
import { AnticipoMiniMetric } from "./anticipo-panels";
import type { CajaMenorMovementDraft } from "./types";

type CajaMenorDisponible = {
  _id: Id<"cajasMenores">;
  nombre: string;
  empresa_id: number;
  saldoDisponible: number;
};

export function CajaMenorActionPicker({
  tarea,
  actorUserId,
  selectedIds,
  onChange,
  onOptionsLoaded,
}: {
  tarea: BuzonTarea;
  actorUserId?: string;
  selectedIds: string[];
  onChange: (next: string[], cajaNombre?: string) => void;
  onOptionsLoaded: (options: Array<{ id: string; nombre: string }>) => void;
}) {
  const factura = tarea.factura;
  const cajasResult = useQuery(
    api.cajasMenores.obtenerCajasAsignadasDisponiblesV2,
    actorUserId && factura
      ? {
          empresa: tarea.empresa ?? factura.empresa ?? 1,
          userId: actorUserId,
          valorMinimo: factura.total,
        }
      : "skip",
  );
  const selectedCajaId = selectedIds[0] as Id<"cajasMenores"> | undefined;
  const cajasNormalized = useMemo(
    () => normalizeCajasMenoresDisponibles<CajaMenorDisponible>(cajasResult),
    [cajasResult],
  );
  const cajasDisponibles = cajasNormalized.cajas;
  const permitirSaldoNegativo = cajasNormalized.permitirSaldoNegativo;
  const contratoIncompatible = cajasNormalized.contract !== "v2";

  useEffect(() => {
    if (cajasResult === undefined || !contratoIncompatible) return;
    console.error("[CajaMenor] Contrato de cajas disponibles incompatible", {
      empresa: tarea.empresa ?? factura?.empresa ?? 1,
      contract: cajasNormalized.contract,
    });
  }, [
    cajasNormalized.contract,
    cajasResult,
    contratoIncompatible,
    factura?.empresa,
    tarea.empresa,
  ]);

  useEffect(() => {
    if (!cajasResult) return;
    onOptionsLoaded(
      cajasDisponibles.map((caja) => ({
        id: String(caja._id),
        nombre: caja.nombre,
      })),
    );
  }, [cajasDisponibles, cajasResult, onOptionsLoaded]);

  if (!actorUserId) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
        No se pudo identificar tu usuario para buscar Cajas Menores asignadas.
      </div>
    );
  }

  if (cajasResult === undefined) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
        Cargando Cajas Menores disponibles...
      </div>
    );
  }

  const selectedCaja = selectedCajaId
    ? cajasDisponibles.find((caja) => caja._id === selectedCajaId)
    : undefined;
  const saldoDespuesSeleccion =
    factura && selectedCaja
      ? selectedCaja.saldoDisponible - factura.total
      : null;

  if (!factura || cajasDisponibles.length === 0) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
        {contratoIncompatible
          ? "No fue posible cargar las Cajas Menores. Actualiza la página o contacta soporte."
          : permitirSaldoNegativo
          ? "No hay Cajas Menores activas asignadas a ti en esta empresa."
          : "No hay Cajas Menores activas asignadas a ti con saldo suficiente para esta factura."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Caja Menor
      </p>
      {saldoDespuesSeleccion !== null && saldoDespuesSeleccion < 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Esta operación dejará la caja en saldo negativo (
          {formatCurrency(saldoDespuesSeleccion, factura.moneda)}).
        </div>
      ) : null}
      <div className="grid gap-2">
        {cajasDisponibles.map((caja) => {
          const selected = selectedCajaId === caja._id;
          return (
            <button
              key={caja._id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange([String(caja._id)], caja.nombre)}
              className={`rounded-xl border p-3 text-left text-sm transition ${
                selected
                  ? "border-teal-500 bg-teal-50 text-teal-950"
                  : "border-slate-200 bg-white text-slate-700 hover:border-teal-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{caja.nombre}</p>
                  <div className="mt-1">
                    <EmpresaBadge empresaId={caja.empresa_id} compact />
                  </div>
                </div>
                <span
                  className={`shrink-0 text-right text-xs font-semibold tabular-nums ${getSaldoDisponibleTextClass(caja.saldoDisponible)}`}
                >
                  {formatCurrency(caja.saldoDisponible, factura.moneda)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <AnticipoMiniMetric
                  label="Factura"
                  value={formatCurrency(factura.total, factura.moneda)}
                />
                <AnticipoMiniMetric
                  label="Después"
                  value={formatCurrency(
                    caja.saldoDisponible - factura.total,
                    factura.moneda,
                  )}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CajaMenorMovementFields({
  value,
  factura,
  empresa,
  onChange,
}: {
  value: CajaMenorMovementDraft;
  factura: BuzonTarea["factura"];
  empresa: number | null | undefined;
  onChange: (next: CajaMenorMovementDraft) => void;
}) {
  function patch(next: Partial<CajaMenorMovementDraft>) {
    const merged = { ...value, ...next };
    if (next.centrosCostoDistribucion) {
      const legacy = toLegacyCentroCosto(next.centrosCostoDistribucion);
      merged.centroCostoCodigo = legacy.centroCostoCodigo;
      merged.centroCostoNombre = legacy.centroCostoNombre;
    }
    onChange(merged);
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Datos para reembolso
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Se guardan como snapshot del movimiento de Caja Menor.
        </p>
      </div>
      <CentroCostoDistribucionEditor
        total={factura?.total ?? 0}
        value={value.centrosCostoDistribucion}
        empresa={empresa}
        onChange={(centrosCostoDistribucion) => patch({ centrosCostoDistribucion })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-medium text-slate-700">
          Fecha pago
          <input
            type="date"
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-hidden transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={value.fechaPago}
            onChange={(event) => patch({ fechaPago: event.target.value })}
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Valor
          <input
            type="text"
            readOnly
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold tabular-nums text-slate-700"
            value={formatCurrency(factura?.total ?? 0, factura?.moneda ?? "COP")}
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-slate-700">
        Concepto
        <input
          type="text"
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-hidden transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          value={value.concepto}
          onChange={(event) => patch({ concepto: event.target.value })}
          placeholder="Concepto del pago"
        />
      </label>
      <label className="block text-xs font-medium text-slate-700">
        Observaciones
        <textarea
          className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-hidden transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          value={value.observaciones}
          onChange={(event) => patch({ observaciones: event.target.value })}
          placeholder="Detalle adicional del movimiento"
        />
      </label>
    </div>
  );
}

export function CajaMenorQuickAccess({
  tarea,
  actorUserId,
}: {
  tarea: BuzonTarea;
  actorUserId?: string;
}) {
  const data = useQuery(
    api.facturacionTareas.obtenerLegalizacionCajaMenorFactura,
    tarea.facturaId
      ? { facturaId: tarea.facturaId, actorUserId }
      : "skip",
  );

  if (data === undefined) {
    return (
      <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
        Cargando cruce de Caja Menor...
      </div>
    );
  }

  const legalizacion = data?.legalizacionesDetalle?.[0];
  const movimiento = data?.movimientosDetalle?.[0];
  const factura = data?.factura ?? tarea.factura;
  const moneda = factura?.moneda ?? "COP";
  const cajaNombre =
    legalizacion?.cajaMenor?.nombre ??
    movimiento?.cajaMenor?.nombre ??
    tarea.factura?.cajaMenorNombre ??
    "Caja Menor pendiente de cruce";

  return (
    <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">
      <div className="flex items-start gap-2">
        <WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Legalización Caja Menor</p>
          <p className="mt-1 text-xs text-teal-800">
            {cajaNombre}
          </p>
          {legalizacion || movimiento ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <AnticipoMiniMetric
                label="Aplicado"
                value={formatCurrency(
                  legalizacion?.valorAplicado ?? movimiento?.valor ?? 0,
                  moneda,
                )}
              />
              {legalizacion ? (
                <>
                  <AnticipoMiniMetric
                    label="Saldo antes"
                    value={formatCurrency(legalizacion.saldoAntes, moneda)}
                  />
                  <AnticipoMiniMetric
                    label="Saldo después"
                    value={formatCurrency(legalizacion.saldoDespues, moneda)}
                  />
                </>
              ) : (
                <>
                  <AnticipoMiniMetric
                    label="Reembolso"
                    value={movimiento?.reembolso?.estado ?? "pendiente"}
                  />
                  <AnticipoMiniMetric
                    label="Centro costo"
                    value={movimiento?.centroCostoCodigo ?? "-"}
                  />
                </>
              )}
              <AnticipoMiniMetric
                label="Estado"
                value={legalizacion?.estado ?? movimiento?.estado ?? "-"}
              />
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-teal-100 bg-white px-3 py-2 text-xs text-teal-800">
              No hay un movimiento activo guardado para esta factura.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function CajaMenorPlanSummary({
  tarea,
  actorUserId,
  selectedCajaId,
}: {
  tarea: BuzonTarea;
  actorUserId?: string;
  selectedCajaId?: Id<"cajasMenores">;
}) {
  const data = useQuery(
    api.facturacionTareas.obtenerLegalizacionCajaMenorFactura,
    tarea.facturaId
      ? { facturaId: tarea.facturaId, actorUserId }
      : "skip",
  );

  if (data === undefined) {
    return (
      <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-800">
        Cargando resumen de Caja Menor...
      </div>
    );
  }

  const legalizacion = data?.legalizacionesDetalle?.[0];
  const movimiento = data?.movimientosDetalle?.[0];
  const factura = data?.factura ?? tarea.factura;
  const moneda = factura?.moneda ?? "COP";
  const cajasDisponibles = (data?.cajas ?? []) as CajaMenorDisponible[];
  const selectedCaja = selectedCajaId
    ? cajasDisponibles.find((caja) => caja._id === selectedCajaId)
    : null;

  if (!legalizacion && !movimiento && !selectedCaja) {
    return (
      <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-800">
        No se encontró información de Caja Menor para esta factura.
      </div>
    );
  }

  const valorFactura =
    factura?.total ?? movimiento?.valor ?? legalizacion?.valorAplicado ?? 0;
  const saldoAntes = legalizacion?.saldoAntes ?? selectedCaja?.saldoDisponible ?? 0;
  const saldoDespues =
    legalizacion?.saldoDespues ?? saldoAntes - valorFactura;
  const cajaNombre =
    legalizacion?.cajaMenor?.nombre ??
    movimiento?.cajaMenor?.nombre ??
    selectedCaja?.nombre;

  return (
    <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Caja Menor</span>
        <span className="rounded-full bg-teal-100 px-2 py-0.5 font-semibold text-teal-700">
          {legalizacion || movimiento ? "Movimiento activo" : "Por marcar"}
        </span>
      </div>
      <p className="mt-1 truncate text-teal-800">
        {cajaNombre}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <AnticipoMiniMetric
          label="Factura"
          value={formatCurrency(valorFactura, moneda)}
        />
        <AnticipoMiniMetric
          label="Saldo antes"
          value={formatCurrency(saldoAntes, moneda)}
        />
        <AnticipoMiniMetric
          label="Saldo después"
          value={formatCurrency(saldoDespues, moneda)}
        />
      </div>
    </div>
  );
}
