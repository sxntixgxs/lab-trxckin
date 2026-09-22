import { TableAggregate } from "@convex-dev/aggregate";
import type { Doc, Id } from "../_generated/dataModel";
import type { DataModel } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { components } from "../_generated/api";

export const REEMBOLSO_ESTADOS_SEGUIMIENTO_ACTIVO = [
  "pendiente_aprobacion_lider",
  "pendiente_revision",
  "pendiente_revision_impuestos",
  "pendiente_eventos_dian",
  "pendiente_aprobacion",
  "pendiente_pago_tesoreria",
] as const;

export type ReembolsoEstadoActivo = (typeof REEMBOLSO_ESTADOS_SEGUIMIENTO_ACTIVO)[number];

export type ReembolsoResponsableTipo =
  | "lider"
  | "revisor"
  | "contabilidad"
  | "eventos_dian"
  | "gerencia_financiera"
  | "tesoreria";

export const PROYECCION_BANDEJA_VERSION = 1;

export function isReembolsoEstadoSeguimientoActivo(
  estado: string
): estado is ReembolsoEstadoActivo {
  return (REEMBOLSO_ESTADOS_SEGUIMIENTO_ACTIVO as readonly string[]).includes(estado);
}

function normalizeSearchToken(value: string | undefined) {
  if (!value?.trim()) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function buildBusquedaBandeja(
  reembolso: Doc<"cajasMenoresReembolsos">,
  extras?: { cajaNombre?: string }
) {
  const tokens = new Set<string>();
  const push = (value: string | undefined) => {
    const normalized = normalizeSearchToken(value);
    if (normalized) tokens.add(normalized);
  };

  push(reembolso.numeroReembolso);
  push(reembolso.custodioNombre);
  push(reembolso.responsableActualNombre);
  push(reembolso.liderAprobadorNombre);
  push(reembolso.reviewAssignedNombre);
  push(reembolso.contadorAsignadoNombre);
  push(reembolso.eventosDianAsignadoNombre);
  push(extras?.cajaNombre);

  for (const movimiento of reembolso.formatoSnapshot?.movimientos ?? []) {
    push(movimiento.numeroFactura);
    push(movimiento.proveedorNombre);
    push(movimiento.proveedorNit);
    push(movimiento.concepto);
  }

  return [...tokens].join(" ");
}

export function deriveReembolsoResponsable(reembolso: Doc<"cajasMenoresReembolsos">): {
  responsableActualUserId?: string;
  responsableActualNombre: string;
  responsableActualTipo: ReembolsoResponsableTipo;
} {
  switch (reembolso.estado) {
    case "pendiente_aprobacion_lider":
      return {
        responsableActualUserId: reembolso.liderAprobadorUserId,
        responsableActualNombre: reembolso.liderAprobadorNombre ?? "Líder custodio",
        responsableActualTipo: "lider",
      };
    case "pendiente_revision":
      return {
        responsableActualUserId: reembolso.reviewAssignedUserId,
        responsableActualNombre: reembolso.reviewAssignedNombre ?? "Revisor Caja Menor",
        responsableActualTipo: "revisor",
      };
    case "pendiente_revision_impuestos":
      return {
        responsableActualUserId: reembolso.contadorAsignadoUserId,
        responsableActualNombre:
          reembolso.contadorAsignadoNombre ?? "Contador Impuestos/Contabilidad",
        responsableActualTipo: "contabilidad",
      };
    case "pendiente_eventos_dian":
      return {
        responsableActualUserId: reembolso.eventosDianAsignadoUserId,
        responsableActualNombre: reembolso.eventosDianAsignadoNombre ?? "Eventos DIAN",
        responsableActualTipo: "eventos_dian",
      };
    case "pendiente_aprobacion":
      return {
        responsableActualNombre: "Gerencia Financiera",
        responsableActualTipo: "gerencia_financiera",
      };
    case "pendiente_pago_tesoreria":
      return {
        responsableActualNombre: "Tesorería",
        responsableActualTipo: "tesoreria",
      };
    default:
      return {
        responsableActualNombre: "Sin responsable",
        responsableActualTipo: "revisor",
      };
  }
}

export function deriveReembolsoBandejaFields(
  reembolso: Doc<"cajasMenoresReembolsos">,
  extras?: { cajaNombre?: string; empresaId?: number }
): Partial<Doc<"cajasMenoresReembolsos">> {
  const seguimientoActivo = isReembolsoEstadoSeguimientoActivo(reembolso.estado);
  const responsable = deriveReembolsoResponsable(reembolso);
  const empresaId = extras?.empresaId ?? reembolso.empresaId;
  return {
    seguimientoActivo,
    responsableActualUserId: responsable.responsableActualUserId,
    responsableActualNombre: responsable.responsableActualNombre,
    responsableActualTipo: responsable.responsableActualTipo,
    ...(empresaId !== undefined ? { empresaId } : {}),
    busquedaBandeja: buildBusquedaBandeja(
      {
        ...reembolso,
        responsableActualNombre: responsable.responsableActualNombre,
        ...(empresaId !== undefined ? { empresaId } : {}),
      },
      extras?.cajaNombre ? { cajaNombre: extras.cajaNombre } : undefined
    ),
    proyeccionBandejaVersion: PROYECCION_BANDEJA_VERSION,
  };
}

export function esMovimientoPendienteParaReembolso(
  movimiento: Pick<Doc<"facturacionCajaMenorMovimientos">, "estado" | "reembolsoId">
) {
  return movimiento.estado === "pendiente_reembolso" && movimiento.reembolsoId === undefined;
}

export function deriveMovimientoBandejaFields(
  movimiento: Doc<"facturacionCajaMenorMovimientos">
): Partial<Doc<"facturacionCajaMenorMovimientos">> {
  return {
    disponibleEnBandeja: esMovimientoPendienteParaReembolso(movimiento),
    proyeccionBandejaVersion: PROYECCION_BANDEJA_VERSION,
  };
}

export const movimientosDisponiblesAggregate = new TableAggregate<{
  Namespace: Id<"cajasMenores">;
  Key: number;
  DataModel: DataModel;
  TableName: "facturacionCajaMenorMovimientos";
}>(components.cajaMenorMovimientosDisponibles, {
  namespace: (doc) => doc.cajaMenorId,
  sortKey: (doc) => doc.actualizadoEn,
  sumValue: (doc) => doc.valor,
});

export const reembolsosActivosCajaAggregate = new TableAggregate<{
  Namespace: Id<"cajasMenores">;
  Key: [string, number];
  DataModel: DataModel;
  TableName: "cajasMenoresReembolsos";
}>(components.cajaMenorReembolsosActivosCaja, {
  namespace: (doc) => doc.cajaMenorId,
  sortKey: (doc) => [doc.estado, doc.actualizadoEn],
  sumValue: (doc) => doc.valorTotal,
});

export const reembolsosActivosResponsableAggregate = new TableAggregate<{
  Namespace: string;
  Key: Id<"cajasMenores">;
  DataModel: DataModel;
  TableName: "cajasMenoresReembolsos";
}>(components.cajaMenorReembolsosActivosResponsable, {
  namespace: (doc) => doc.responsableActualUserId ?? "",
  sortKey: (doc) => doc.cajaMenorId,
  sumValue: (doc) => doc.valorTotal,
});

export const reembolsosActivosCustodioAggregate = new TableAggregate<{
  Namespace: string;
  Key: Id<"cajasMenores">;
  DataModel: DataModel;
  TableName: "cajasMenoresReembolsos";
}>(components.cajaMenorReembolsosActivosCustodio, {
  namespace: (doc) => doc.custodioUserId,
  sortKey: (doc) => doc.cajaMenorId,
  sumValue: (doc) => doc.valorTotal,
});

function movimientoEnAggregate(doc: Doc<"facturacionCajaMenorMovimientos">) {
  return esMovimientoPendienteParaReembolso(doc);
}

function reembolsoEnAggregate(doc: Doc<"cajasMenoresReembolsos">) {
  return doc.seguimientoActivo === true;
}

function wasProjectedForBandeja(
  doc: { proyeccionBandejaVersion?: number } | null | undefined
) {
  return doc?.proyeccionBandejaVersion === PROYECCION_BANDEJA_VERSION;
}

async function syncMovimientoAggregate(
  ctx: MutationCtx,
  previous: Doc<"facturacionCajaMenorMovimientos"> | null,
  next: Doc<"facturacionCajaMenorMovimientos"> | null
) {
  const prevIn = previous ? movimientoEnAggregate(previous) : false;
  const nextIn = next ? movimientoEnAggregate(next) : false;

  if (previous && next && prevIn && nextIn) {
    await movimientosDisponiblesAggregate.replaceOrInsert(ctx, previous, next);
  } else if (previous && prevIn) {
    await movimientosDisponiblesAggregate.deleteIfExists(ctx, previous);
  } else if (next && nextIn) {
    await movimientosDisponiblesAggregate.insertIfDoesNotExist(ctx, next);
  }
}

async function syncReembolsoAggregates(
  ctx: MutationCtx,
  previous: Doc<"cajasMenoresReembolsos"> | null,
  next: Doc<"cajasMenoresReembolsos"> | null
) {
  if (previous && wasProjectedForBandeja(previous) && reembolsoEnAggregate(previous)) {
    await reembolsosActivosCajaAggregate.delete(ctx, previous);
    if (previous.responsableActualUserId) {
      await reembolsosActivosResponsableAggregate.delete(ctx, previous);
    }
    await reembolsosActivosCustodioAggregate.delete(ctx, previous);
  }
  if (next && reembolsoEnAggregate(next)) {
    await reembolsosActivosCajaAggregate.insert(ctx, next);
    if (next.responsableActualUserId) {
      await reembolsosActivosResponsableAggregate.insert(ctx, next);
    }
    await reembolsosActivosCustodioAggregate.insert(ctx, next);
  }
}

export async function insertMovimientoConBandeja(
  ctx: MutationCtx,
  doc: Omit<Doc<"facturacionCajaMenorMovimientos">, "_id" | "_creationTime">
) {
  const bandejaFields = deriveMovimientoBandejaFields(
    doc as Doc<"facturacionCajaMenorMovimientos">
  );
  const id = await ctx.db.insert("facturacionCajaMenorMovimientos", {
    ...doc,
    ...bandejaFields,
  });
  const inserted = await ctx.db.get("facturacionCajaMenorMovimientos", id);
  if (!inserted) throw new Error("No se pudo crear el movimiento.");
  await syncMovimientoAggregate(ctx, null, inserted);
  return id;
}

export async function patchMovimientoConBandeja(
  ctx: MutationCtx,
  movimientoId: Id<"facturacionCajaMenorMovimientos">,
  patch: Partial<Doc<"facturacionCajaMenorMovimientos">>
) {
  const previous = await ctx.db.get("facturacionCajaMenorMovimientos", movimientoId);
  if (!previous) throw new Error("Movimiento no encontrado.");
  const merged = { ...previous, ...patch };
  const bandejaFields = deriveMovimientoBandejaFields(merged);
  await ctx.db.patch("facturacionCajaMenorMovimientos", movimientoId, { ...patch, ...bandejaFields });
  const next = await ctx.db.get("facturacionCajaMenorMovimientos", movimientoId);
  if (!next) throw new Error("Movimiento no encontrado.");
  await syncMovimientoAggregate(ctx, previous, next);
  return next;
}

export async function insertReembolsoConBandeja(
  ctx: MutationCtx,
  doc: Omit<Doc<"cajasMenoresReembolsos">, "_id" | "_creationTime">
) {
  const caja = await ctx.db.get("cajasMenores", doc.cajaMenorId);
  const empresaId = doc.empresaId ?? caja?.empresa_id;
  const bandejaFields = deriveReembolsoBandejaFields(doc as Doc<"cajasMenoresReembolsos">, {
    empresaId,
    cajaNombre: caja?.nombre,
  });
  const id = await ctx.db.insert("cajasMenoresReembolsos", {
    ...doc,
    ...bandejaFields,
  });
  const inserted = await ctx.db.get("cajasMenoresReembolsos", id);
  if (!inserted) throw new Error("No se pudo crear el reembolso.");
  await syncReembolsoAggregates(ctx, null, inserted);
  return id;
}

export async function patchReembolsoConBandeja(
  ctx: MutationCtx,
  reembolsoId: Id<"cajasMenoresReembolsos">,
  patch: Partial<Doc<"cajasMenoresReembolsos">>
) {
  const previous = await ctx.db.get("cajasMenoresReembolsos", reembolsoId);
  if (!previous) throw new Error("Reembolso no encontrado.");
  const merged = { ...previous, ...patch };
  let cajaNombre: string | undefined;
  let empresaId = merged.empresaId;
  if (empresaId === undefined) {
    const caja = await ctx.db.get("cajasMenores", merged.cajaMenorId);
    empresaId = caja?.empresa_id;
    cajaNombre = caja?.nombre;
  }
  const bandejaFields = deriveReembolsoBandejaFields(merged, {
    empresaId,
    cajaNombre,
  });
  await ctx.db.patch("cajasMenoresReembolsos", reembolsoId, { ...patch, ...bandejaFields });
  const next = await ctx.db.get("cajasMenoresReembolsos", reembolsoId);
  if (!next) throw new Error("Reembolso no encontrado.");
  await syncReembolsoAggregates(ctx, previous, next);
  return next;
}

export async function backfillDocumentoBandeja(
  ctx: MutationCtx,
  table: "facturacionCajaMenorMovimientos" | "cajasMenoresReembolsos",
  id: Id<typeof table>
) {
  if (table === "facturacionCajaMenorMovimientos") {
    const movimientoId = id as Id<"facturacionCajaMenorMovimientos">;
    const doc = await ctx.db.get("facturacionCajaMenorMovimientos", movimientoId);
    if (!doc) return;
    await repairMovimientoDisponibilidadBandeja(ctx, doc);
    return;
  }
  const reembolsoId = id as Id<"cajasMenoresReembolsos">;
  const doc = await ctx.db.get("cajasMenoresReembolsos", reembolsoId);
  if (!doc) return;
  const caja = await ctx.db.get("cajasMenores", doc.cajaMenorId);
  const bandejaFields = deriveReembolsoBandejaFields(doc, {
    empresaId: doc.empresaId ?? caja?.empresa_id,
    cajaNombre: caja?.nombre,
  });
  await ctx.db.patch("cajasMenoresReembolsos", reembolsoId, bandejaFields);
  const next = await ctx.db.get("cajasMenoresReembolsos", reembolsoId);
  if (!next) return;
  await syncReembolsoAggregates(ctx, null, next);
}

export async function repairMovimientoDisponibilidadBandeja(
  ctx: MutationCtx,
  doc: Doc<"facturacionCajaMenorMovimientos">
) {
  const expected = esMovimientoPendienteParaReembolso(doc);
  const stored = doc.disponibleEnBandeja === true;
  let current = doc;

  if (stored !== expected) {
    const bandejaFields = deriveMovimientoBandejaFields(doc);
    await ctx.db.patch("facturacionCajaMenorMovimientos", doc._id, bandejaFields);
    current = { ...doc, ...bandejaFields };
  }

  if (expected) {
    await movimientosDisponiblesAggregate.insertIfDoesNotExist(ctx, current);
  } else {
    await movimientosDisponiblesAggregate.deleteIfExists(ctx, doc);
  }
}

export async function deleteMovimientoConBandeja(
  ctx: MutationCtx,
  movimientoId: Id<"facturacionCajaMenorMovimientos">
) {
  const previous = await ctx.db.get("facturacionCajaMenorMovimientos", movimientoId);
  if (!previous) return;
  await ctx.db.delete("facturacionCajaMenorMovimientos", movimientoId);
  await syncMovimientoAggregate(ctx, previous, null);
}

export async function deleteReembolsoConBandeja(
  ctx: MutationCtx,
  reembolsoId: Id<"cajasMenoresReembolsos">
) {
  const previous = await ctx.db.get("cajasMenoresReembolsos", reembolsoId);
  if (!previous) return;
  await ctx.db.delete("cajasMenoresReembolsos", reembolsoId);
  await syncReembolsoAggregates(ctx, previous, null);
}
