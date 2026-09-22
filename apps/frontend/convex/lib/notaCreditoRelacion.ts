import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  getPeajesDocumentoClase,
  isPeajesFactura,
  isPeajesNotaCredito,
  normalizePeajesDocumentNumber,
  normalizePeajesProviderNit,
} from "./peajes";
import { getValorContable } from "./valorContable";
import { normalizeEmpresa } from "./normalize";

export const NOTA_CREDITO_RELACION_VALUE_TOLERANCE = 1;

export const ESTADOS_TERMINALES_NOTA_CREDITO_RELACION = [
  "pagada",
  "legalizada",
  "cerrada",
  "rechazada",
  "rechazada_dian",
  "nota_credito_cerrada",
] as const;

export type OrigenRelacionEfectiva = "dian" | "manual" | "sin_relacion";

export type RelacionEfectiva = {
  factura: Doc<"facturacionFacturas"> | null;
  origen: OrigenRelacionEfectiva;
};

export type SnapshotMonetarioFactura = {
  valorBase: number;
  totalNotasCredito: number;
  neto: number;
  usaValorXmlComoBase: boolean;
};

export type BloqueadorRelacion = {
  tipo: string;
  identificador: string;
  fecha?: string;
  enlace?: string;
  detalle: string;
};

export type ElegibilidadResultado =
  | { ok: true }
  | { ok: false; codigo: string; mensaje: string; bloqueadores?: BloqueadorRelacion[] };

type DbCtx = QueryCtx | MutationCtx;

type FacturaLike = Doc<"facturacionFacturas">;

function normalizeMoneda(value?: string) {
  return (value ?? "COP").trim().toUpperCase();
}

export function normalizeNumeroFacturaBusqueda(value?: string) {
  return normalizePeajesDocumentNumber(value);
}

export function getDocumentoClaseRelacion(factura: FacturaLike) {
  if (factura.documentoClase) return factura.documentoClase;
  return getPeajesDocumentoClase({
    tipoDocumento: factura.tipoDocumentoNormalizado ?? factura.tipoDocumento,
  });
}

export function isFacturaPeajesRelacion(factura: FacturaLike) {
  return isPeajesFactura(factura) || factura.rolOperacion === "PEAJES";
}

export function isNotaCreditoPeajesRelacion(factura: FacturaLike) {
  return isPeajesNotaCredito(factura) || factura.rolOperacion === "PEAJES";
}

export function getValorBaseFactura(factura: FacturaLike) {
  return getValorContable(factura);
}

export function getValorNotaCredito(nota: FacturaLike) {
  return nota.total;
}

export function buildSnapshotMonetario(args: {
  factura: FacturaLike;
  notasCredito: FacturaLike[];
}): SnapshotMonetarioFactura {
  const valorBase = getValorBaseFactura(args.factura);
  const totalNotasCredito = args.notasCredito.reduce(
    (total, nota) => total + getValorNotaCredito(nota),
    0
  );
  return {
    valorBase,
    totalNotasCredito,
    neto: valorBase - totalNotasCredito,
    usaValorXmlComoBase: args.factura.valorContable === undefined,
  };
}

function proveedorNitCoincide(a: FacturaLike, b: FacturaLike) {
  const nitA =
    a.proveedorNitNormalizado ?? normalizePeajesProviderNit(a.proveedorNit);
  const nitB =
    b.proveedorNitNormalizado ?? normalizePeajesProviderNit(b.proveedorNit);
  return Boolean(nitA) && nitA === nitB;
}

function mismaEmpresa(a: FacturaLike, b: FacturaLike) {
  return normalizeEmpresa(a.empresa) === normalizeEmpresa(b.empresa);
}

function mismaMoneda(a: FacturaLike, b: FacturaLike) {
  return normalizeMoneda(a.moneda) === normalizeMoneda(b.moneda);
}

function fechaObjetivoCompatible(factura: FacturaLike, nota: FacturaLike) {
  return factura.fechaEmision <= nota.fechaEmision;
}

export async function resolveRelacionEfectiva(
  ctx: DbCtx,
  nota: FacturaLike,
  options?: { permitirPeajes?: boolean }
): Promise<RelacionEfectiva> {
  const permitirPeajes = options?.permitirPeajes ?? false;

  if (nota.facturaRelacionadaId) {
    const relacionada = await ctx.db.get("facturacionFacturas", nota.facturaRelacionadaId);
    if (
      relacionada &&
      getDocumentoClaseRelacion(relacionada) === "factura" &&
      mismaEmpresa(nota, relacionada) &&
      proveedorNitCoincide(nota, relacionada) &&
      (permitirPeajes || !isFacturaPeajesRelacion(relacionada))
    ) {
      return {
        factura: relacionada,
        origen: nota.relacionDocumentoOrigen === "manual" ? "manual" : "dian",
      };
    }
  }

  const referenciaNormalizada =
    nota.referenciaDocumentoNormalizado ??
    normalizePeajesDocumentNumber(nota.referenciaDocumento);
  if (!referenciaNormalizada) {
    return { factura: null, origen: "sin_relacion" };
  }

  const candidatos = await ctx.db
    .query("facturacionFacturas")
    .withIndex("by_empresa_numeroFacturaNormalizado", (q) =>
      q
        .eq("empresa", normalizeEmpresa(nota.empresa))
        .eq("numeroFacturaNormalizado", referenciaNormalizada)
    )
    .collect();

  const matches = candidatos.filter((item) => {
    if (getDocumentoClaseRelacion(item) !== "factura") return false;
    if (!permitirPeajes && isFacturaPeajesRelacion(item)) return false;
    if (permitirPeajes && !isFacturaPeajesRelacion(item) && isNotaCreditoPeajesRelacion(nota)) {
      return false;
    }
    return proveedorNitCoincide(nota, item);
  });

  if (matches.length === 1) {
    return { factura: matches[0]!, origen: "dian" };
  }

  return { factura: null, origen: "sin_relacion" };
}

/**
 * Reference matches only count when the NC has no explicit facturaRelacionadaId.
 * A manually assigned NC must not keep appearing under its XML-referenced invoice.
 */
export async function listNotasCreditoRelacionadasAFactura(
  ctx: DbCtx,
  factura: FacturaLike,
  options?: { incluirPeajes?: boolean; soloPeajes?: boolean }
) {
  const incluirPeajes = options?.incluirPeajes ?? false;
  const soloPeajes = options?.soloPeajes ?? false;
  const empresa = normalizeEmpresa(factura.empresa);
  const nitNormalizado =
    factura.proveedorNitNormalizado ??
    normalizePeajesProviderNit(factura.proveedorNit);
  const numeroNormalizado =
    factura.numeroFacturaNormalizado ??
    normalizePeajesDocumentNumber(factura.numeroFactura);

  const notasPorRelacion = await ctx.db
    .query("facturacionFacturas")
    .withIndex("by_empresa_facturaRelacionadaId", (q) =>
      q.eq("empresa", empresa).eq("facturaRelacionadaId", factura._id)
    )
    .collect();

  const notasPorReferencia = numeroNormalizado
    ? await ctx.db
        .query("facturacionFacturas")
        .withIndex("by_empresa_referenciaDocumentoNormalizado", (q) =>
          q
            .eq("empresa", empresa)
            .eq("referenciaDocumentoNormalizado", numeroNormalizado)
        )
        .collect()
    : [];

  const notas = new Map<string, FacturaLike>();

  for (const nota of notasPorRelacion) {
    if (getDocumentoClaseRelacion(nota) !== "nota_credito") continue;
    const esPeajes = isNotaCreditoPeajesRelacion(nota);
    if (soloPeajes && !esPeajes) continue;
    if (!incluirPeajes && !soloPeajes && esPeajes) continue;
    const notaNit =
      nota.proveedorNitNormalizado ??
      normalizePeajesProviderNit(nota.proveedorNit);
    if (notaNit !== nitNormalizado) continue;
    notas.set(String(nota._id), nota);
  }

  for (const nota of notasPorReferencia) {
    if (getDocumentoClaseRelacion(nota) !== "nota_credito") continue;
    if (nota.facturaRelacionadaId) continue;
    const esPeajes = isNotaCreditoPeajesRelacion(nota);
    if (soloPeajes && !esPeajes) continue;
    if (!incluirPeajes && !soloPeajes && esPeajes) continue;
    const notaNit =
      nota.proveedorNitNormalizado ??
      normalizePeajesProviderNit(nota.proveedorNit);
    if (notaNit !== nitNormalizado) continue;
    notas.set(String(nota._id), nota);
  }

  return Array.from(notas.values());
}

export async function buildNotaCreditoRelacionDetalleShared(
  ctx: DbCtx,
  factura: FacturaLike
) {
  if (isFacturaPeajesRelacion(factura) || isNotaCreditoPeajesRelacion(factura)) {
    return null;
  }

  const clase = getDocumentoClaseRelacion(factura);

  if (clase === "nota_credito") {
    const efectiva = await resolveRelacionEfectiva(ctx, factura, {
      permitirPeajes: false,
    });
    return {
      facturaOrigen: efectiva.factura,
      notasCredito: [factura],
      origenRelacion: efectiva.origen,
    };
  }

  if (clase !== "factura") return null;

  const notasCredito = await listNotasCreditoRelacionadasAFactura(ctx, factura, {
    incluirPeajes: false,
  });

  if (notasCredito.length === 0) {
    return {
      facturaOrigen: factura,
      notasCredito: [],
      origenRelacion: "sin_relacion" as const,
    };
  }

  return {
    facturaOrigen: factura,
    notasCredito,
    origenRelacion: "dian" as const,
  };
}

async function getTareaForFactura(ctx: DbCtx, facturaId: Id<"facturacionFacturas">) {
  return await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .unique();
}

function isEstadoTerminal(estado?: string | null) {
  if (!estado) return false;
  return (ESTADOS_TERMINALES_NOTA_CREDITO_RELACION as readonly string[]).includes(
    estado
  );
}

export async function collectBloqueadoresConsumo(
  ctx: DbCtx,
  nota: FacturaLike
): Promise<BloqueadorRelacion[]> {
  const bloqueadores: BloqueadorRelacion[] = [];

  const legalizaciones = await ctx.db
    .query("facturacionAnticipoLegalizaciones")
    .withIndex("by_facturaId_estado", (q) =>
      q.eq("facturaId", nota._id).eq("estado", "activa")
    )
    .collect();
  for (const legalizacion of legalizaciones) {
    bloqueadores.push({
      tipo: "legalizacion_anticipo",
      identificador: String(legalizacion._id),
      fecha: new Date(legalizacion.creadoEn).toISOString(),
      detalle: "La nota crédito está referenciada en una legalización activa.",
      enlace: `/facturacion/facturas/${nota._id}`,
    });
  }

  if (nota.peajesCruce) {
    bloqueadores.push({
      tipo: "peajes_cruce",
      identificador: String(nota.peajesCruce.operacionId),
      fecha: new Date(nota.peajesCruce.aplicadoEn).toISOString(),
      detalle: "La nota crédito ya fue aplicada en una operación PEAJES.",
      enlace: `/facturacion/peajes`,
    });
  }

  const itemsOperacion = await ctx.db
    .query("facturacionPeajesOperacionItems")
    .withIndex("by_empresa_tipo", (q) =>
      q.eq("empresa", normalizeEmpresa(nota.empresa)).eq("tipo", "nota_credito")
    )
    .collect();
  for (const item of itemsOperacion) {
    const payload = item.payload as { notaCreditoId?: string; _id?: string } | null;
    const matchedId =
      payload &&
      (payload.notaCreditoId === String(nota._id) ||
        payload._id === String(nota._id));
    if (!matchedId) continue;
    const operacion = await ctx.db.get("facturacionPeajesOperaciones", item.operacionId);
    if (!operacion) continue;
    if (
      operacion.estado === "aplicada" ||
      operacion.estado === "parcial" ||
      operacion.estado === "sin_aplicacion"
    ) {
      bloqueadores.push({
        tipo: "peajes_operacion",
        identificador: String(operacion._id),
        fecha: new Date(operacion.creadoEn).toISOString(),
        detalle: `La nota crédito participa en la operación PEAJES ${operacion.archivoNombre}.`,
        enlace: `/facturacion/peajes`,
      });
    }
  }

  if (nota.esLegalizacionCajaMenor || nota.cajaMenorId) {
    bloqueadores.push({
      tipo: "caja_menor",
      identificador: String(nota.cajaMenorId ?? nota._id),
      detalle: "La nota crédito está asociada a un registro de caja menor.",
      enlace: `/facturacion/facturas/${nota._id}`,
    });
  }

  const tarea = await getTareaForFactura(ctx, nota._id);
  if (tarea && isEstadoTerminal(tarea.estado)) {
    bloqueadores.push({
      tipo: "estado_terminal",
      identificador: tarea.estado,
      detalle: `La nota crédito está en estado terminal (${tarea.estado}).`,
      enlace: `/facturacion/facturas/${nota._id}`,
    });
  }

  return bloqueadores;
}

export async function evaluarElegibilidadReasignacion(
  ctx: DbCtx,
  args: {
    nota: FacturaLike;
    facturaNueva: FacturaLike;
    facturaAnterior: FacturaLike | null;
    modo: "general" | "peajes";
    facturasArchivoIds?: Set<string>;
    facturasConOtraDiferenciaCritica?: Set<string>;
  }
): Promise<ElegibilidadResultado> {
  const { nota, facturaNueva, facturaAnterior, modo } = args;

  if (getDocumentoClaseRelacion(nota) !== "nota_credito") {
    return {
      ok: false,
      codigo: "fuente_invalida",
      mensaje: "El documento origen debe ser una nota crédito.",
    };
  }
  if (getDocumentoClaseRelacion(facturaNueva) !== "factura") {
    return {
      ok: false,
      codigo: "destino_invalido",
      mensaje: "El destino debe ser una factura.",
    };
  }

  const notaEsPeajes = isNotaCreditoPeajesRelacion(nota);
  const facturaEsPeajes = isFacturaPeajesRelacion(facturaNueva);

  if (modo === "general") {
    if (notaEsPeajes) {
      return {
        ok: false,
        codigo: "peajes_solo_conciliacion",
        mensaje:
          "Las notas crédito PEAJES solo se pueden reasignar desde una conciliación PEAJES activa.",
      };
    }
    if (facturaEsPeajes) {
      return {
        ok: false,
        codigo: "destino_peajes",
        mensaje: "No puedes relacionar una nota crédito general con una factura PEAJES.",
      };
    }
  } else {
    if (!notaEsPeajes || !facturaEsPeajes) {
      return {
        ok: false,
        codigo: "peajes_requerido",
        mensaje: "En PEAJES ambos documentos deben ser PEAJES.",
      };
    }
    if (args.facturasArchivoIds && !args.facturasArchivoIds.has(String(facturaNueva._id))) {
      return {
        ok: false,
        codigo: "fuera_archivo",
        mensaje: "La factura destino no está en el archivo de conciliación cargado.",
      };
    }
    if (
      args.facturasConOtraDiferenciaCritica?.has(String(facturaNueva._id))
    ) {
      return {
        ok: false,
        codigo: "otra_diferencia_critica",
        mensaje:
          "La factura destino tiene otra diferencia crítica sin resolver en esta conciliación.",
      };
    }
  }

  if (!mismaEmpresa(nota, facturaNueva)) {
    return {
      ok: false,
      codigo: "empresa",
      mensaje: "La nota crédito y la factura pertenecen a empresas diferentes.",
    };
  }
  if (!proveedorNitCoincide(nota, facturaNueva)) {
    return {
      ok: false,
      codigo: "proveedor",
      mensaje: "El NIT del proveedor no coincide.",
    };
  }
  if (!mismaMoneda(nota, facturaNueva)) {
    return {
      ok: false,
      codigo: "moneda",
      mensaje: "La moneda de la nota crédito y la factura no coincide.",
    };
  }
  if (!fechaObjetivoCompatible(facturaNueva, nota)) {
    return {
      ok: false,
      codigo: "fecha",
      mensaje:
        "La factura destino debe tener fecha de emisión igual o anterior a la de la nota crédito.",
    };
  }
  if (facturaAnterior && String(facturaAnterior._id) === String(facturaNueva._id)) {
    return {
      ok: false,
      codigo: "mismo_destino",
      mensaje: "La factura seleccionada ya es la relación efectiva actual.",
    };
  }

  const bloqueadores: BloqueadorRelacion[] = [];
  bloqueadores.push(...(await collectBloqueadoresConsumo(ctx, nota)));

  for (const documento of [facturaAnterior, facturaNueva].filter(Boolean) as FacturaLike[]) {
    const tarea = await getTareaForFactura(ctx, documento._id);
    if (tarea && isEstadoTerminal(tarea.estado)) {
      bloqueadores.push({
        tipo: "estado_terminal",
        identificador: `${documento.numeroFactura}:${tarea.estado}`,
        detalle: `${documento.numeroFactura} está en estado terminal (${tarea.estado}).`,
        enlace: `/facturacion/facturas/${documento._id}`,
      });
    }
  }

  if (bloqueadores.length > 0) {
    return {
      ok: false,
      codigo: "bloqueado",
      mensaje: bloqueadores[0]!.detalle,
      bloqueadores,
    };
  }

  const notasActuales = await listNotasCreditoRelacionadasAFactura(
    ctx,
    facturaNueva,
    modo === "peajes" ? { soloPeajes: true } : { incluirPeajes: false }
  );
  const notasSinFuente = notasActuales.filter(
    (item) => String(item._id) !== String(nota._id)
  );
  const snapshot = buildSnapshotMonetario({
    factura: facturaNueva,
    notasCredito: [...notasSinFuente, nota],
  });
  if (snapshot.neto < -NOTA_CREDITO_RELACION_VALUE_TOLERANCE) {
    return {
      ok: false,
      codigo: "neto_negativo",
      mensaje: `Aplicar la nota dejaría el neto de la factura en ${snapshot.neto.toLocaleString("es-CO")}.`,
    };
  }

  return { ok: true };
}
