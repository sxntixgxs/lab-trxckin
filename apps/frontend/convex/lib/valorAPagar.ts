import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  assertDocumentosInternosYCruces,
  buildResumenContableCruce,
  computeValorAPagarConCruces,
} from "./crucesDocumentosInternos";
import { getValorContable } from "./valorContable";

export const MONEY_TOLERANCE = 0.001;

export type PagoFinalSnapshot = {
  monto: number;
  moneda: string;
  sinDesembolso: boolean;
};

export function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) <= MONEY_TOLERANCE) return 0;
  return value;
}

/** @deprecated Use computeValorAPagarConCruces for full accounting. */
export function computeValorAPagar(args: {
  valorContable: number;
  crucesActivos: number;
  pagosAplicados: number;
}): number {
  return computeValorAPagarConCruces({
    valorContable: args.valorContable,
    valorDocumentosInternos: 0,
    valorAnticiposAplicados: args.crucesActivos,
    pagosAplicados: args.pagosAplicados,
  });
}

export function getPagosAplicadosFromAprobaciones(
  aprobaciones: Array<
    Pick<Doc<"facturacionAprobaciones">, "accion" | "pagoParcial" | "pagoFinal">
  >
): number {
  let total = 0;
  for (const item of aprobaciones) {
    if (item.accion === "pago_parcial") {
      total += item.pagoParcial?.monto ?? 0;
    } else if (item.accion === "registrar_pago") {
      total += item.pagoFinal?.monto ?? 0;
    }
  }
  return normalizeMoney(total);
}

export function aplicaValorAPagarPersistido(
  factura: Pick<
    Doc<"facturacionFacturas">,
    | "esLegalizacionAnticipo"
    | "esPeaje"
    | "rolOperacion"
    | "esLegalizacionCajaMenor"
    | "valorCrucesDocumentosInternos"
    | "cantidadCrucesDocumentosInternos"
  >,
  crucesAnticiposActivosCount: number,
  crucesDocumentosInternosCount?: number
) {
  if (factura.esPeaje || factura.rolOperacion === "PEAJES") return false;
  if (factura.esLegalizacionCajaMenor) return false;

  const documentosInternos =
    crucesDocumentosInternosCount ??
    factura.cantidadCrucesDocumentosInternos ??
    0;
  const tieneDocumentosInternos = documentosInternos > 0;
  const tieneAnticipos =
    factura.esLegalizacionAnticipo && crucesAnticiposActivosCount > 0;

  if (tieneDocumentosInternos || tieneAnticipos) return true;
  return false;
}

export function assertObligacionCubrePagos(args: {
  valorContable: number;
  valorDocumentosInternos?: number;
  crucesActivos?: number;
  pagosAplicados: number;
}) {
  const valorDocumentosInternos = args.valorDocumentosInternos ?? 0;
  assertDocumentosInternosYCruces({
    valorContable: args.valorContable,
    valorDocumentosInternos,
    pagosAplicados: args.pagosAplicados,
  });

  const valorAnticipos = args.crucesActivos ?? 0;
  const saldo =
    args.valorContable -
    valorDocumentosInternos -
    valorAnticipos -
    args.pagosAplicados;
  if (saldo + MONEY_TOLERANCE < 0) {
    throw new Error(
      "La corrección dejaría la obligación por debajo de los pagos acumulados."
    );
  }
}

export function getSaldoTesoreriaFactura(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "valorContable" | "total" | "valorAPagar" | "esLegalizacionAnticipo" | "cantidadCrucesDocumentosInternos"
  >
) {
  if (
    (factura.esLegalizacionAnticipo || (factura.cantidadCrucesDocumentosInternos ?? 0) > 0) &&
    factura.valorAPagar !== undefined
  ) {
    return factura.valorAPagar;
  }
  return getValorContable(factura);
}

type FacturacionCtx = MutationCtx | QueryCtx;

async function listarLegalizacionesActivasFactura(
  ctx: FacturacionCtx,
  facturaId: Id<"facturacionFacturas">
) {
  return await ctx.db
    .query("facturacionAnticipoLegalizaciones")
    .withIndex("by_facturaId_estado", (q) =>
      q.eq("facturaId", facturaId).eq("estado", "activa")
    )
    .collect();
}

async function listarCrucesDocumentosInternosActivos(
  ctx: FacturacionCtx,
  facturaId: Id<"facturacionFacturas">
) {
  return await ctx.db
    .query("facturacionCrucesDocumentosInternos")
    .withIndex("by_facturaId_estado", (q) =>
      q.eq("facturaId", facturaId).eq("estado", "activo")
    )
    .collect();
}

async function listarAprobacionesFactura(
  ctx: FacturacionCtx,
  facturaId: Id<"facturacionFacturas">
) {
  return await ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();
}

export async function sumarDocumentosInternosActivos(
  ctx: FacturacionCtx,
  facturaId: Id<"facturacionFacturas">
) {
  const rows = await listarCrucesDocumentosInternosActivos(ctx, facturaId);
  return {
    count: rows.length,
    total: normalizeMoney(rows.reduce((sum, row) => sum + row.valorAplicado, 0)),
    rows,
  };
}

export async function calcularValorAPagarFactura(
  ctx: FacturacionCtx,
  factura: Doc<"facturacionFacturas">
) {
  const legalizaciones = await listarLegalizacionesActivasFactura(ctx, factura._id);
  const crucesAnticipos = legalizaciones.reduce(
    (total, row) => total + row.valorAplicado,
    0
  );
  const documentosInternos = await sumarDocumentosInternosActivos(ctx, factura._id);

  if (
    !aplicaValorAPagarPersistido(
      factura,
      legalizaciones.length,
      documentosInternos.count
    )
  ) {
    return {
      valorAPagar: undefined,
      crucesActivos: crucesAnticipos,
      valorDocumentosInternos: documentosInternos.total,
      pagosAplicados: 0,
    };
  }

  const aprobaciones = await listarAprobacionesFactura(ctx, factura._id);
  const pagosAplicados = getPagosAplicadosFromAprobaciones(aprobaciones);
  const valorContable = getValorContable(factura);

  assertObligacionCubrePagos({
    valorContable,
    valorDocumentosInternos: documentosInternos.total,
    crucesActivos: crucesAnticipos,
    pagosAplicados,
  });

  return {
    valorAPagar: computeValorAPagarConCruces({
      valorContable,
      valorDocumentosInternos: documentosInternos.total,
      valorAnticiposAplicados: crucesAnticipos,
      pagosAplicados,
    }),
    crucesActivos: crucesAnticipos,
    valorDocumentosInternos: documentosInternos.total,
    pagosAplicados,
  };
}

export async function buildResumenContableFactura(
  ctx: FacturacionCtx,
  factura: Doc<"facturacionFacturas">
) {
  const legalizaciones = await listarLegalizacionesActivasFactura(ctx, factura._id);
  const documentosInternos = await sumarDocumentosInternosActivos(ctx, factura._id);
  const aprobaciones = await listarAprobacionesFactura(ctx, factura._id);
  const pagosAplicados = getPagosAplicadosFromAprobaciones(aprobaciones);
  const valorAnticiposAplicados = legalizaciones.reduce(
    (total, row) => total + row.valorAplicado,
    0
  );

  return buildResumenContableCruce({
    valorContable: getValorContable(factura),
    valorDocumentosInternos: documentosInternos.total,
    pagosAplicados,
    valorAnticiposAplicados,
    moneda: factura.moneda,
  });
}

export async function syncValorAPagarFactura(
  ctx: MutationCtx,
  facturaId: Id<"facturacionFacturas">,
  now: number = Date.now()
) {
  const factura = await ctx.db.get("facturacionFacturas", facturaId);
  if (!factura) return;

  const documentosInternos = await sumarDocumentosInternosActivos(ctx, facturaId);
  const { valorAPagar } = await calcularValorAPagarFactura(ctx, factura);
  const patch: Partial<Doc<"facturacionFacturas">> = {
    actualizadoEn: now,
    valorCrucesDocumentosInternos: documentosInternos.total,
    cantidadCrucesDocumentosInternos: documentosInternos.count,
  };

  if (valorAPagar === undefined) {
    if (factura.valorAPagar !== undefined) {
      patch.valorAPagar = undefined;
    }
  } else if (factura.valorAPagar !== valorAPagar) {
    patch.valorAPagar = valorAPagar;
  }

  const aggregatesChanged =
    factura.valorCrucesDocumentosInternos !== documentosInternos.total ||
    factura.cantidadCrucesDocumentosInternos !== documentosInternos.count;
  const valorChanged =
    (valorAPagar === undefined && factura.valorAPagar !== undefined) ||
    (valorAPagar !== undefined && factura.valorAPagar !== valorAPagar);

  if (aggregatesChanged || valorChanged) {
    await ctx.db.patch("facturacionFacturas", facturaId, patch);
  } else if (patch.actualizadoEn !== factura.actualizadoEn) {
    await ctx.db.patch("facturacionFacturas", facturaId, { actualizadoEn: now });
  }
}

export const SIN_DESEMBOLSO_COMMENT_BASE =
  "Legalizada en Tesorería sin desembolso; obligación cubierta";

export function buildComentarioSinDesembolso(args: {
  userComment?: string;
  tieneDocumentosInternos?: boolean;
  tieneAnticipos?: boolean;
}) {
  const partes: string[] = [SIN_DESEMBOLSO_COMMENT_BASE];
  const coberturas: string[] = [];
  if (args.tieneDocumentosInternos) coberturas.push("documentos internos");
  if (args.tieneAnticipos) coberturas.push("anticipos");
  if (coberturas.length > 0) {
    partes.push(`por ${coberturas.join(" y ")}.`);
  } else {
    partes.push("por anticipos.");
  }
  const trimmed = args.userComment?.trim();
  if (trimmed) partes.push(trimmed);
  return partes.join(" ");
}

export function tienePagosMonetarios(pagosAplicados: number) {
  return pagosAplicados > MONEY_TOLERANCE;
}

export async function validarElegibilidadSinDesembolso(
  ctx: FacturacionCtx,
  args: {
    factura: Doc<"facturacionFacturas">;
    tarea: Pick<Doc<"facturacionTareas">, "estado">;
    asignacion: Pick<Doc<"facturacionAsignaciones">, "fase" | "estado">;
  }
) {
  if (
    args.asignacion.fase !== "revision_tesoreria" ||
    args.tarea.estado !== "revision_tesoreria"
  ) {
    throw new Error("La factura debe estar en revisión de tesorería.");
  }
  if (args.asignacion.estado !== "pendiente") {
    throw new Error("La asignación ya no está activa.");
  }

  const legalizaciones = await listarLegalizacionesActivasFactura(ctx, args.factura._id);
  const documentosInternos = await sumarDocumentosInternosActivos(ctx, args.factura._id);
  if (legalizaciones.length === 0 && documentosInternos.count === 0) {
    throw new Error(
      "La factura no tiene documentos internos ni cruces de anticipos activos."
    );
  }

  const aprobaciones = await listarAprobacionesFactura(ctx, args.factura._id);
  const pagosAplicados = getPagosAplicadosFromAprobaciones(aprobaciones);
  if (tienePagosMonetarios(pagosAplicados)) {
    throw new Error(
      "No puedes confirmar sin desembolso cuando ya existen pagos monetarios."
    );
  }

  const resumen = await buildResumenContableFactura(ctx, args.factura);
  if (resumen.valorAPagar > MONEY_TOLERANCE) {
    throw new Error(
      "Solo puedes confirmar sin desembolso cuando el saldo a pagar es cero."
    );
  }

  return {
    valorAPagar: 0,
    crucesActivos: resumen.valorAnticiposAplicados,
    valorDocumentosInternos: resumen.valorDocumentosInternos,
    pagosAplicados,
  };
}

export async function validarYRecalcularValorAPagarTrasCambioObligacion(
  ctx: MutationCtx,
  factura: Doc<"facturacionFacturas">,
  now: number = Date.now()
) {
  await syncValorAPagarFactura(ctx, factura._id, now);
}
