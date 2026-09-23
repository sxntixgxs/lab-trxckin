import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  PEAJES_NIT,
  getPeajesDocumentoClase,
  isPeajesFactura,
  isPeajesNotaCredito,
  isPeajesProviderNit,
  normalizePeajesDocumentNumber,
  normalizePeajesProviderNit,
} from "./lib/peajes";
import {
  getValorContable,
  resolverValorContableEnReimportacion,
  valorContableInicialParaInsert,
} from "./lib/valorContable";
import { refrescarProyeccionFactura } from "./lib/facturacionDashboardProjection";
import {
  matchesCausacionEstadoFilter,
} from "./lib/facturacionCausacion";
import { buildNotaCreditoRelacionDetalleShared } from "./lib/notaCreditoRelacion";
import { resolveValidOwners } from "./lib/facturacionOwnership";
import {
  buildCajaMenorProceso,
  cajaMenorProcesoValidator,
} from "./lib/cajaMenorFacturacionAdapter";
import { SYSTEM_ACTOR_EMAIL } from "./lib/env";
import { requireServerSecret } from "./lib/auth";
import {
  actorPuedeVerEmpresa,
  empresasVisibles,
  requireActor,
  requirePermisoEmpresa,
} from "./lib/billingAuth";
import { actorPuedeVerFactura } from "./lib/facturacionAccess";
import { RUTAS_SISTEMA } from "../lib/rutas-sistema";
import { normalizeEmail, normalizeEmpresa } from "./lib/normalize";

const DEFAULT_EMPRESA = 1;
const PEAJES_PROCESO_NOMBRE = "PEAJES";
const VALUE_TOLERANCE = 1;

const lineaValidator = v.object({
  descripcion: v.string(),
  cantidad: v.number(),
  precioUnitario: v.number(),
  total: v.number(),
});

const categoriaValidator = v.union(
  v.literal("tecnologia"),
  v.literal("administracion"),
  v.literal("otro")
);

function isPdfFile(nombre?: string, mimeType?: string) {
  return (
    mimeType?.trim().toLowerCase() === "application/pdf" ||
    Boolean(nombre?.trim().toLowerCase().endsWith(".pdf"))
  );
}

const MAX_SUPPORT_FILE_BYTES = 25 * 1024 * 1024;

type FacturacionCtx = QueryCtx | MutationCtx;
type DocumentoClase = "factura" | "nota_credito" | "nota_debito" | "otro";
type PeajesCruceDetalleNota = {
  notaCreditoId: Id<"facturacionFacturas">;
  numeroFactura: string;
  fechaEmision?: string;
  valor: number;
  referenciaDocumento?: string;
  facturaRelacionadaId?: Id<"facturacionFacturas">;
  facturaRelacionadaNumero: string;
  detalleDisponible: boolean;
};

function normalizeDocumentNumber(value?: string) {
  return normalizePeajesDocumentNumber(value);
}

function normalizeProveedorNit(value?: string) {
  return normalizePeajesProviderNit(value);
}

function normalizeTipoDocumento(value?: string) {
  const raw = (value ?? "").trim();
  if (raw === "1") return "01";
  return raw;
}

function getDocumentoClase(tipoDocumento?: string): DocumentoClase {
  return getPeajesDocumentoClase({
    tipoDocumento: normalizeTipoDocumento(tipoDocumento),
  });
}

function isPeajesNit(value?: string) {
  return isPeajesProviderNit(value);
}

function isDocumentoPeajes(factura: Doc<"facturacionFacturas">) {
  return factura.esPeaje === true || isPeajesNit(factura.proveedorNit);
}

function getClaseFactura(factura: Doc<"facturacionFacturas">): DocumentoClase {
  return factura.documentoClase ?? getDocumentoClase(factura.tipoDocumento);
}

async function registrarRelacionNotaCreditoSiHayTarea(
  ctx: MutationCtx,
  args: {
    nota: Doc<"facturacionFacturas">;
    factura: Doc<"facturacionFacturas">;
  }
) {
  const now = Date.now();
  for (const documento of [args.nota, args.factura]) {
    const tarea = await ctx.db
      .query("facturacionTareas")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", documento._id))
      .unique();
    if (!tarea) continue;
    const aprobaciones = await ctx.db
      .query("facturacionAprobaciones")
      .withIndex("by_tareaId", (q) => q.eq("tareaId", tarea._id))
      .collect();
    const yaRegistrada = aprobaciones.some(
      (aprobacion) =>
        aprobacion.accion === "relacionar_nota_credito" &&
        aprobacion.comentario ===
          `Cruce nota crédito ${args.nota.numeroFactura} con factura ${args.factura.numeroFactura}.`
    );
    if (yaRegistrada) continue;

    await ctx.db.insert("facturacionAprobaciones", {
      tareaId: tarea._id,
      facturaId: documento._id,
      empresa: normalizeEmpresa(documento.empresa),
      actorNombre: "Sistema",
      actorEmail: SYSTEM_ACTOR_EMAIL,
      accion: "relacionar_nota_credito",
      comentario: `Cruce nota crédito ${args.nota.numeroFactura} con factura ${args.factura.numeroFactura}.`,
      estadoAnterior: tarea.estado,
      estadoNuevo: tarea.estado,
      creadoEn: now,
    });
  }
}

function isFacturaPeajes(factura: Doc<"facturacionFacturas">) {
  return isPeajesFactura(factura);
}

function isNotaCreditoPeajes(factura: Doc<"facturacionFacturas">) {
  return isPeajesNotaCredito(factura);
}

function buildFacturaMetadata(args: {
  numeroFactura: string;
  tipoDocumento: string;
  proveedorNit: string;
  referenciaDocumento?: string;
  referenciaCufe?: string;
}) {
  const tipoDocumentoNormalizado = normalizeTipoDocumento(args.tipoDocumento);
  const documentoClase = getDocumentoClase(tipoDocumentoNormalizado);
  const proveedorNitNormalizado = normalizeProveedorNit(args.proveedorNit);
  const numeroFacturaNormalizado = normalizeDocumentNumber(args.numeroFactura);
  const referenciaDocumento = args.referenciaDocumento?.trim() || undefined;
  const referenciaDocumentoNormalizado =
    normalizeDocumentNumber(referenciaDocumento);
  const referenciaCufe = args.referenciaCufe?.trim() || undefined;
  const esPeaje = proveedorNitNormalizado === PEAJES_NIT;

  return {
    tipoDocumentoNormalizado,
    documentoClase,
    proveedorNitNormalizado,
    numeroFacturaNormalizado,
    esPeaje,
    rolOperacion: esPeaje ? ("PEAJES" as const) : undefined,
    referenciaDocumento,
    referenciaDocumentoNormalizado: referenciaDocumentoNormalizado || undefined,
    referenciaCufe,
    ...(esPeaje && documentoClase === "factura"
      ? {
          esLegalizacionAnticipo: true,
          anticipoProcesoNombre: PEAJES_PROCESO_NOMBRE,
        }
      : {}),
  };
}

function getUsuariosConfig(config: Doc<"facturacionConfiguracion"> | null) {
  if (!config) return [];
  if (config.usuarios && config.usuarios.length > 0) {
    return config.usuarios.map((usuario) => ({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email: normalizeEmail(usuario.email),
    }));
  }
  if (config.usuariosPonderados && config.usuariosPonderados.length > 0) {
    return config.usuariosPonderados.map((usuario) => ({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email: normalizeEmail(usuario.email),
    }));
  }
  if (config.usuarioId && config.nombre && config.email) {
    return [
      {
        usuarioId: config.usuarioId,
        nombre: config.nombre,
        email: normalizeEmail(config.email),
      },
    ];
  }
  return [];
}

async function getRecepcionConfig(
  ctx: MutationCtx,
  empresa: number
): Promise<Doc<"facturacionConfiguracion"> | null> {
  const scoped = await ctx.db
    .query("facturacionConfiguracion")
    .withIndex("by_empresa_clave", (q) =>
      q.eq("empresa", empresa).eq("clave", "recepcion")
    )
    .first();
  if (scoped) return scoped;

  if (empresa !== DEFAULT_EMPRESA) return null;

  const legacyConfigs = await ctx.db
    .query("facturacionConfiguracion")
    .withIndex("by_clave", (q) => q.eq("clave", "recepcion"))
    .take(20);
  return legacyConfigs.find((config) => config.empresa === undefined) ?? null;
}

function trimRequired(value: string, fieldName: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${fieldName} es obligatorio.`);
  return trimmed;
}

function assertPositiveAmount(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} debe ser mayor a cero.`);
  }
}

function assertNonNegativeAmount(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} no puede ser negativo.`);
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) >= 1e-7) {
    throw new Error(`${fieldName} no puede tener más de dos decimales.`);
  }
}

function normalizeAmountToCents(value: number, fieldName: string) {
  assertNonNegativeAmount(value, fieldName);
  return Math.round((value + Number.EPSILON) * 100);
}

function isIsoDate(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

async function findPeajesFacturaByNumero(
  ctx: FacturacionCtx,
  empresa: number,
  numeroNormalizado: string
) {
  if (!numeroNormalizado) return null;
  const candidates = await ctx.db
    .query("facturacionFacturas")
    .withIndex("by_empresa_numeroFacturaNormalizado", (q) =>
      q.eq("empresa", empresa).eq("numeroFacturaNormalizado", numeroNormalizado)
    )
    .collect();

  return candidates.find(isFacturaPeajes) ?? null;
}

function proveedorNitCoincide(
  left: Doc<"facturacionFacturas">,
  right: Doc<"facturacionFacturas">
) {
  const leftNit = left.proveedorNitNormalizado ?? normalizeProveedorNit(left.proveedorNit);
  const rightNit =
    right.proveedorNitNormalizado ?? normalizeProveedorNit(right.proveedorNit);
  return Boolean(leftNit && rightNit && leftNit === rightNit);
}

async function findFacturaRelacionadaPorReferencia(
  ctx: FacturacionCtx,
  documento: Doc<"facturacionFacturas">
) {
  const empresa = normalizeEmpresa(documento.empresa);
  const referenciaNormalizada =
    documento.referenciaDocumentoNormalizado ??
    normalizeDocumentNumber(documento.referenciaDocumento);
  if (!referenciaNormalizada) return null;

  if (isDocumentoPeajes(documento)) {
    return await findPeajesFacturaByNumero(ctx, empresa, referenciaNormalizada);
  }

  const candidatos = await ctx.db
    .query("facturacionFacturas")
    .withIndex("by_empresa_numeroFacturaNormalizado", (q) =>
      q.eq("empresa", empresa).eq("numeroFacturaNormalizado", referenciaNormalizada)
    )
    .collect();
  const matches = candidatos.filter((factura) => {
    if (String(factura._id) === String(documento._id)) return false;
    if (getClaseFactura(factura) !== "factura") return false;
    if (isFacturaPeajes(factura)) return false;
    return proveedorNitCoincide(documento, factura);
  });

  return matches.length === 1 ? matches[0] : null;
}

async function enlazarNotasCreditoAutomaticamente(
  ctx: MutationCtx,
  facturaId: Id<"facturacionFacturas">
) {
  const documento = await ctx.db.get("facturacionFacturas", facturaId);
  if (!documento) return;

  const empresa = normalizeEmpresa(documento.empresa);
  const clase = getClaseFactura(documento);
  const numeroNormalizado =
    documento.numeroFacturaNormalizado ??
    normalizeDocumentNumber(documento.numeroFactura);

  if (clase === "nota_credito") {
    if (documento.facturaRelacionadaId) return;
    const facturaRelacionada = await findFacturaRelacionadaPorReferencia(
      ctx,
      documento
    );

    if (facturaRelacionada) {
      await ctx.db.patch("facturacionFacturas", documento._id, {
        facturaRelacionadaId: facturaRelacionada._id,
        relacionDocumentoOrigen: "dian",
        actualizadoEn: Date.now(),
      });
      if (!isDocumentoPeajes(documento) && !isFacturaPeajes(facturaRelacionada)) {
        await registrarRelacionNotaCreditoSiHayTarea(ctx, {
          nota: documento,
          factura: facturaRelacionada,
        });
      }
    }
    return;
  }

  if (clase !== "factura" || !numeroNormalizado) return;

  const notas = await ctx.db
    .query("facturacionFacturas")
    .withIndex("by_empresa_referenciaDocumentoNormalizado", (q) =>
      q
        .eq("empresa", empresa)
        .eq("referenciaDocumentoNormalizado", numeroNormalizado)
    )
    .collect();

  const notasRelacionables = isDocumentoPeajes(documento)
    ? notas.filter(isNotaCreditoPeajes)
    : notas.filter((nota) => {
        if (getClaseFactura(nota) !== "nota_credito") return false;
        if (isNotaCreditoPeajes(nota)) return false;
        return proveedorNitCoincide(documento, nota);
      });

  for (const nota of notasRelacionables) {
    if (nota.facturaRelacionadaId === documento._id) continue;
    if (nota.facturaRelacionadaId) continue;
    await ctx.db.patch("facturacionFacturas", nota._id, {
      facturaRelacionadaId: documento._id,
      relacionDocumentoOrigen: "dian",
      actualizadoEn: Date.now(),
    });
    if (!isDocumentoPeajes(documento) && !isNotaCreditoPeajes(nota)) {
      await registrarRelacionNotaCreditoSiHayTarea(ctx, {
        nota,
        factura: documento,
      });
    }
  }
}

async function getLegalizacionesActivasPorEmpresa(
  ctx: FacturacionCtx,
  empresa?: number
) {
  if (typeof empresa === "number") {
    return await ctx.db
      .query("facturacionAnticipoLegalizaciones")
      .withIndex("by_empresa_estado", (q) =>
        q.eq("empresa", empresa).eq("estado", "activa")
      )
      .collect();
  }

  return await ctx.db
    .query("facturacionAnticipoLegalizaciones")
    .withIndex("by_estado", (q) => q.eq("estado", "activa"))
    .collect();
}

function buildNotasPorFactura(
  facturas: Array<Doc<"facturacionFacturas">>,
  notasCredito: Array<Doc<"facturacionFacturas">>
) {
  const facturaByNumero = new Map<string, Doc<"facturacionFacturas">>();
  for (const factura of facturas) {
    const key =
      factura.numeroFacturaNormalizado ??
      normalizeDocumentNumber(factura.numeroFactura);
    if (key && !facturaByNumero.has(key)) facturaByNumero.set(key, factura);
  }

  const notasPorFactura = new Map<string, Array<Doc<"facturacionFacturas">>>();
  for (const nota of notasCredito) {
    let facturaId = nota.facturaRelacionadaId
      ? String(nota.facturaRelacionadaId)
      : "";
    if (!facturaId) {
      const referencia =
        nota.referenciaDocumentoNormalizado ??
        normalizeDocumentNumber(nota.referenciaDocumento);
      const facturaRelacionada = facturaByNumero.get(referencia);
      facturaId = facturaRelacionada ? String(facturaRelacionada._id) : "";
    }
    if (!facturaId) continue;
    const current = notasPorFactura.get(facturaId) ?? [];
    current.push(nota);
    notasPorFactura.set(facturaId, current);
  }

  return notasPorFactura;
}

function buildLegalizacionesPorFactura(
  legalizaciones: Array<Doc<"facturacionAnticipoLegalizaciones">>
) {
  const legalizacionesPorFactura = new Map<
    string,
    Array<Doc<"facturacionAnticipoLegalizaciones">>
  >();
  for (const row of legalizaciones) {
    const key = String(row.facturaId);
    const current = legalizacionesPorFactura.get(key) ?? [];
    current.push(row);
    legalizacionesPorFactura.set(key, current);
  }
  return legalizacionesPorFactura;
}

type PeajesConciliacionEstado =
  | "pendiente"
  | "parcial"
  | "cubierta"
  | "sobrecubierta";

function computeEstadoConciliacionPeaje(args: {
  neto: number;
  valorAplicado: number;
}): PeajesConciliacionEstado {
  const { neto, valorAplicado } = args;
  if (neto < 0) return "sobrecubierta";
  if (valorAplicado + VALUE_TOLERANCE >= neto) return "cubierta";
  if (valorAplicado > 0) return "parcial";
  return "pendiente";
}

function resolveFacturaEstadoResuelto(args: {
  factura: Doc<"facturacionFacturas">;
  tareaEstado?: string;
  estadoConciliacion?: PeajesConciliacionEstado;
}): string | null {
  if (args.tareaEstado) return args.tareaEstado;
  if (!args.factura.esPeaje) return null;
  if (args.factura.peajesCruce) return "peajes_cubierta";
  const conciliacion = args.estadoConciliacion;
  if (conciliacion === "cubierta" || conciliacion === "sobrecubierta") {
    return "peajes_cubierta";
  }
  return "recepcion_peajes";
}

async function buildEstadoResueltoPorFacturaId(
  ctx: FacturacionCtx,
  facturas: Array<Doc<"facturacionFacturas">>,
  tareaEstadoPorFacturaId: Map<string, string>,
  empresaFiltro?: number
) {
  const estadoResueltoPorFacturaId = new Map<string, string | null>();
  const peajesFacturas = facturas.filter((factura) => factura.esPeaje === true);
  const legalizaciones = await getLegalizacionesActivasPorEmpresa(
    ctx,
    empresaFiltro
  );
  const legalizacionesPorFactura =
    buildLegalizacionesPorFactura(legalizaciones);
  const notasCredito = facturas.filter(
    (factura) => getDocumentoClaseFactura(factura) === "nota_credito"
  );
  const notasPorFactura = buildNotasPorFactura(peajesFacturas, notasCredito);

  for (const factura of facturas) {
    const key = String(factura._id);
    const tareaEstado = tareaEstadoPorFacturaId.get(key);
    if (tareaEstado) {
      estadoResueltoPorFacturaId.set(key, tareaEstado);
      continue;
    }
    if (!factura.esPeaje) {
      estadoResueltoPorFacturaId.set(key, null);
      continue;
    }

    const notas = notasPorFactura.get(key) ?? [];
    const valorNotasCredito = notas.reduce(
      (total, nota) => total + nota.total,
      0
    );
    const neto = getValorContable(factura) - valorNotasCredito;
    const legalizacionesFactura = legalizacionesPorFactura.get(key) ?? [];
    const valorAplicado = legalizacionesFactura.reduce(
      (total, row) => total + row.valorAplicado,
      0
    );
    const estadoConciliacion = computeEstadoConciliacionPeaje({
      neto,
      valorAplicado,
    });
    estadoResueltoPorFacturaId.set(
      key,
      resolveFacturaEstadoResuelto({
        factura,
        estadoConciliacion,
      })
    );
  }

  return estadoResueltoPorFacturaId;
}

async function buildPeajesCruceDetalleForFactura(
  ctx: QueryCtx,
  factura: Doc<"facturacionFacturas">,
  legalizaciones: Array<Doc<"facturacionAnticipoLegalizaciones">>
) {
  const snapshot = factura.peajesCruce;
  if (snapshot) {
    const notasCredito = await Promise.all(
      snapshot.notasCredito.map(async (nota) => {
        const notaDoc = await ctx.db.get("facturacionFacturas", nota.notaCreditoId);
        return {
          notaCreditoId: nota.notaCreditoId,
          numeroFactura: notaDoc?.numeroFactura ?? nota.numeroFactura,
          fechaEmision: notaDoc?.fechaEmision,
          valor: notaDoc?.total ?? nota.valor,
          referenciaDocumento:
            notaDoc?.referenciaDocumento ?? nota.referenciaDocumento,
          facturaRelacionadaId: notaDoc?.facturaRelacionadaId ?? factura._id,
          facturaRelacionadaNumero: factura.numeroFactura,
          detalleDisponible: Boolean(notaDoc),
        };
      })
    );

    if (
      snapshot.valorNotasCredito <= VALUE_TOLERANCE &&
      notasCredito.length === 0
    ) {
      return null;
    }

    return {
      fuente: snapshot.fuente,
      operacionId: snapshot.operacionId,
      legalizacionIds: snapshot.legalizacionIds,
      aplicadoEn: snapshot.aplicadoEn,
      valorBruto: snapshot.valorBruto,
      valorNotasCredito: snapshot.valorNotasCredito,
      valorNeto: snapshot.valorNeto,
      notasCredito,
    };
  }

  const legalizacionesPeajes = legalizaciones.filter(
    (legalizacion) =>
      legalizacion.tipoBolsa === "peajes" &&
      (legalizacion.notaCreditoIds?.length ?? 0) > 0
  );
  if (legalizacionesPeajes.length === 0) return null;

  const notaCreditoIds = Array.from(
    new Set(
      legalizacionesPeajes.flatMap((legalizacion) =>
        (legalizacion.notaCreditoIds ?? []).map((notaId) => String(notaId))
      )
    )
  ) as Array<Id<"facturacionFacturas">>;
  const notasCreditoRows = await Promise.all(
    notaCreditoIds.map(async (notaCreditoId) => {
      const notaDoc = await ctx.db.get("facturacionFacturas", notaCreditoId);
      if (!notaDoc) return null;
      return {
        notaCreditoId,
        numeroFactura: notaDoc.numeroFactura,
        fechaEmision: notaDoc.fechaEmision,
        valor: notaDoc.total,
        referenciaDocumento: notaDoc.referenciaDocumento,
        facturaRelacionadaId: notaDoc.facturaRelacionadaId ?? factura._id,
        facturaRelacionadaNumero: factura.numeroFactura,
        detalleDisponible: true,
      };
    })
  );
  const notasCredito: PeajesCruceDetalleNota[] = notasCreditoRows.flatMap((nota) =>
    nota ? [nota] : []
  );
  const valorNotasCredito = notasCredito.reduce(
    (total, nota) => total + nota.valor,
    0
  );
  if (valorNotasCredito <= VALUE_TOLERANCE && notasCredito.length === 0) {
    return null;
  }

  return {
    fuente: "peajes_excel" as const,
    legalizacionIds: legalizacionesPeajes.map(
      (legalizacion) => legalizacion._id
    ),
    aplicadoEn: Math.min(
      ...legalizacionesPeajes.map((legalizacion) => legalizacion.creadoEn)
    ),
    valorBruto: factura.total,
    valorNotasCredito,
    valorNeto:
      legalizacionesPeajes.find(
        (legalizacion) => typeof legalizacion.valorNetoFactura === "number"
      )?.valorNetoFactura ??
        Math.max(0, getValorContable(factura) - valorNotasCredito),
    notasCredito,
  };
}

async function buildNotaCreditoRelacionDetalle(
  ctx: QueryCtx,
  factura: Doc<"facturacionFacturas">
) {
  if (isFacturaPeajes(factura) || isNotaCreditoPeajes(factura)) {
    return {
      esPeajes: true as const,
      facturaOrigen: null,
      notasCredito: [] as Doc<"facturacionFacturas">[],
      origenRelacion: "sin_relacion" as const,
      mensajePeajes:
        "Las relaciones PEAJES solo se pueden cambiar desde una conciliación PEAJES activa.",
    };
  }

  const detalle = await buildNotaCreditoRelacionDetalleShared(ctx, factura);
  if (!detalle) return null;

  // Always expose NC detail (even unassigned) and invoice detail when current
  // NCs exist or history may be relevant from the client.
  if (
    getClaseFactura(factura) === "nota_credito" ||
    detalle.notasCredito.length > 0
  ) {
    return {
      esPeajes: false as const,
      facturaOrigen: detalle.facturaOrigen,
      notasCredito: detalle.notasCredito,
      origenRelacion: detalle.origenRelacion,
    };
  }

  const historial = await ctx.db
    .query("facturacionNotaCreditoRelacionHistorial")
    .withIndex("by_facturaAnteriorId_creadoEn", (q) =>
      q.eq("facturaAnteriorId", factura._id)
    )
    .take(1);
  if (historial.length === 0) return null;

  return {
    esPeajes: false as const,
    facturaOrigen: factura,
    notasCredito: [] as Doc<"facturacionFacturas">[],
    origenRelacion: "sin_relacion" as const,
  };
}

export const getWithTarea = query({
  args: { id: v.id("facturacionFacturas") },
  returns: v.union(
    v.null(),
    v.object({
      factura: v.any(),
      tarea: v.union(v.any(), v.null()),
      aprobaciones: v.array(v.any()),
      asignaciones: v.array(v.any()),
      legalizacionesAnticipos: v.array(v.any()),
      legalizacionesCajaMenor: v.array(v.any()),
      movimientosCajaMenor: v.array(v.any()),
      peajesCruceDetalle: v.any(),
      notaCreditoRelacion: v.any(),
      rechazoDianRelacion: v.any(),
      cajaMenorProceso: v.union(cajaMenorProcesoValidator, v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const factura = await ctx.db.get("facturacionFacturas", args.id);
    if (!factura || !(await actorPuedeVerFactura(ctx, actor, factura))) return null;

    const tarea = await ctx.db
      .query("facturacionTareas")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.id))
      .unique();

    const aprobaciones = tarea
      ? await ctx.db
          .query("facturacionAprobaciones")
          .withIndex("by_tareaId", (q) => q.eq("tareaId", tarea._id))
          .collect()
      : [];
    const asignaciones = await ctx.db
      .query("facturacionAsignaciones")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.id))
      .collect();
    const legalizaciones = await ctx.db
      .query("facturacionAnticipoLegalizaciones")
      .withIndex("by_facturaId_estado", (q) =>
        q.eq("facturaId", args.id).eq("estado", "activa")
      )
      .collect();
    const legalizacionesAnticipos = await Promise.all(
      legalizaciones.map(async (legalizacion) => ({
        ...legalizacion,
        anticipo: await ctx.db.get("anticipos", legalizacion.anticipoId),
      }))
    );
    const legalizacionesCajaMenor = await ctx.db
      .query("facturacionCajaMenorLegalizaciones")
      .withIndex("by_facturaId_estado", (q) =>
        q.eq("facturaId", args.id).eq("estado", "activa")
      )
      .collect();
    const legalizacionesCajaMenorDetalle = await Promise.all(
      legalizacionesCajaMenor.map(async (legalizacion) => ({
        ...legalizacion,
        cajaMenor: await ctx.db.get("cajasMenores", legalizacion.cajaMenorId),
      }))
    );
    const movimientosCajaMenor = await ctx.db
      .query("facturacionCajaMenorMovimientos")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.id))
      .collect();
    const movimientosCajaMenorDetalle = await Promise.all(
      movimientosCajaMenor.map(async (movimiento) => ({
        ...movimiento,
        cajaMenor: await ctx.db.get("cajasMenores", movimiento.cajaMenorId),
        reembolso: movimiento.reembolsoId
          ? await ctx.db.get("cajasMenoresReembolsos", movimiento.reembolsoId)
          : null,
      }))
    );
    const peajesCruceDetalle = await buildPeajesCruceDetalleForFactura(
      ctx,
      factura,
      legalizaciones
    );
    const notaCreditoRelacion = await buildNotaCreditoRelacionDetalle(
      ctx,
      factura
    );

    const reembolsoIds = new Set<Id<"cajasMenoresReembolsos">>();
    for (const movimiento of movimientosCajaMenor) {
      if (movimiento.reembolsoId) reembolsoIds.add(movimiento.reembolsoId);
    }
    const reembolsos: Doc<"cajasMenoresReembolsos">[] = [];
    for (const reembolsoId of reembolsoIds) {
      const reembolso = await ctx.db.get("cajasMenoresReembolsos", reembolsoId);
      if (reembolso) reembolsos.push(reembolso);
    }
    const eventos: Doc<"cajasMenoresReembolsoEventos">[] = [];
    for (const reembolsoId of reembolsoIds) {
      for await (const evento of ctx.db
        .query("cajasMenoresReembolsoEventos")
        .withIndex("by_reembolsoId", (q) => q.eq("reembolsoId", reembolsoId))) {
        eventos.push(evento);
      }
    }

    const aprobacionesFactura = await ctx.db
      .query("facturacionAprobaciones")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.id))
      .collect();

    const cajaMenorProceso = buildCajaMenorProceso({
      factura: {
        esLegalizacionCajaMenor: factura.esLegalizacionCajaMenor,
        cajaMenorMarcadorUserId: factura.cajaMenorMarcadorUserId,
        cajaMenorMarcadorNombre: factura.cajaMenorMarcadorNombre,
        cajaMenorMarcadorEmail: factura.cajaMenorMarcadorEmail,
      },
      tareaEstado: tarea?.estado,
      movimientos: movimientosCajaMenor,
      reembolsos,
      eventos,
      aprobaciones: aprobacionesFactura,
      nowMs: Date.now(),
    });

    return {
      factura,
      tarea,
      aprobaciones,
      asignaciones,
      legalizacionesAnticipos,
      legalizacionesCajaMenor: legalizacionesCajaMenorDetalle,
      movimientosCajaMenor: movimientosCajaMenorDetalle,
      peajesCruceDetalle,
      notaCreditoRelacion,
      rechazoDianRelacion: notaCreditoRelacion,
      cajaMenorProceso,
    };
  },
});

const RECHAZO_ESTADOS = new Set([
  "rechazada",
  "rechazada_dian",
  "pendiente_rechazar_dian",
  "pendiente_nota_credito",
  "nota_credito_cerrada",
]);

type DocumentoClaseFiltro = "factura" | "nota_credito" | "nota_debito";

function getDocumentoClaseFactura(
  factura: Doc<"facturacionFacturas">
): DocumentoClaseFiltro {
  const clase = factura.documentoClase;
  const tipo = factura.tipoDocumentoNormalizado ?? factura.tipoDocumento;
  if (clase === "nota_credito" || tipo === "91") return "nota_credito";
  if (clase === "nota_debito" || tipo === "92") return "nota_debito";
  return "factura";
}

function matchesBusquedaFactura(
  factura: Doc<"facturacionFacturas">,
  busqueda: string
) {
  const busquedaTexto = busqueda.toLowerCase();
  const busquedaNumero = normalizeDocumentNumber(busqueda);
  const busquedaNit = normalizeProveedorNit(busqueda);
  const numeroFacturaNormalizado =
    factura.numeroFacturaNormalizado ??
    normalizeDocumentNumber(factura.numeroFactura);
  const proveedorNitNormalizado =
    factura.proveedorNitNormalizado ??
    normalizeProveedorNit(factura.proveedorNit);
  const texto = [
    factura.proveedorNombre,
    factura.proveedorNit,
    factura.numeroFactura,
    factura.descripcion,
    factura.numeroFp,
    factura.tipoDocumento,
    factura.tipoDocumentoNormalizado,
    factura.documentoClase,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    texto.includes(busquedaTexto) ||
    (busquedaNumero.length > 0 &&
      numeroFacturaNormalizado.includes(busquedaNumero)) ||
    (busquedaNit.length > 0 &&
      proveedorNitNormalizado.includes(busquedaNit))
  );
}

type ListadoFacturasFiltros = {
  empresa?: number;
  empresas?: number[];
  busqueda?: string;
  documentoClase?: DocumentoClaseFiltro;
  estados?: string[];
  soloRechazos?: boolean;
  fechaEmisionDesde?: string;
  fechaEmisionHasta?: string;
  montoMin?: number;
  montoMax?: number;
  esPeaje?: boolean;
  origen?: "correo" | "carga_manual" | "recibo_fisico" | "documento_fisico";
  esLegalizacionAnticipo?: boolean;
  esLegalizacionCajaMenor?: boolean;
  tipoFlujo?: "peajes" | "legalizacion_anticipo" | "legalizacion_caja_menor" | "normal";
  responsableUserIds?: string[];
  responsableEmails?: string[];
  incluirSinResponsable?: boolean;
  causacionEstado?: "causado" | "no_causado" | "sin_registro";
};

type ResponsableActualListado = {
  userId: string | null;
  email: string;
  nombre: string;
  rol: string;
};

type ResponsabilidadListado = {
  responsablesActuales: ResponsableActualListado[];
  responsabilidadEstado: "con_responsable" | "sin_responsable" | "no_aplica";
};

function resolverResponsabilidadListado(
  factura: Doc<"facturacionFacturas">,
  tarea: Doc<"facturacionTareas"> | null | undefined,
  asignaciones: Doc<"facturacionAsignaciones">[]
): ResponsabilidadListado {
  const ownership = resolveValidOwners({ factura, tarea, asignaciones });
  const responsablesActuales = ownership.owners.map((owner) => ({
    userId: owner.userId ?? null,
    email: owner.email,
    nombre: owner.nombre,
    rol: owner.rol,
  }));

  return {
    responsablesActuales,
    responsabilidadEstado: !ownership.esActiva
      ? "no_aplica"
      : responsablesActuales.length > 0
        ? "con_responsable"
        : "sin_responsable",
  };
}

function resolverResponsabilidadDesdeProyeccion(
  dashboardItem: Doc<"facturacionDashboardItems"> | undefined,
  responsables: Doc<"facturacionDashboardResponsables">[],
  fallback: ResponsabilidadListado
): ResponsabilidadListado {
  if (!dashboardItem) return fallback;
  if (!dashboardItem.esActiva) {
    return {
      responsablesActuales: [],
      responsabilidadEstado: "no_aplica",
    };
  }
  const activos = responsables.filter((responsable) => responsable.esActiva);
  if (activos.length === 0) {
    return {
      responsablesActuales: [],
      responsabilidadEstado: "sin_responsable",
    };
  }
  return {
    responsablesActuales: activos.map((responsable) => ({
      userId: responsable.userId ?? null,
      email: responsable.email,
      nombre: responsable.nombre,
      rol: responsable.rol,
    })),
    responsabilidadEstado: "con_responsable",
  };
}

function resolverEstadoListadoDesdeProyeccion(
  dashboardItem: Doc<"facturacionDashboardItems"> | undefined,
  fallback: string | null
): string | null {
  if (!dashboardItem) return fallback;
  return dashboardItem.estadoListado ?? dashboardItem.faseActual ?? fallback;
}

function buildDashboardMaps(
  dashboardItems: Doc<"facturacionDashboardItems">[],
  dashboardResponsables: Doc<"facturacionDashboardResponsables">[]
) {
  const dashboardItemPorFacturaId = new Map(
    dashboardItems.map((item) => [String(item.facturaId), item] as const)
  );
  const responsablesPorFacturaId = new Map<string, Doc<"facturacionDashboardResponsables">[]>();
  for (const responsable of dashboardResponsables) {
    const key = String(responsable.facturaId);
    const existentes = responsablesPorFacturaId.get(key) ?? [];
    existentes.push(responsable);
    responsablesPorFacturaId.set(key, existentes);
  }
  return { dashboardItemPorFacturaId, responsablesPorFacturaId };
}

function buildEstadoListadoPorFacturaId(
  estadoResueltoPorFacturaId: Map<string, string | null>,
  dashboardItemPorFacturaId: Map<string, Doc<"facturacionDashboardItems">>
) {
  const estadoListadoPorFacturaId = new Map<string, string | null>();
  for (const [key, fallback] of estadoResueltoPorFacturaId) {
    estadoListadoPorFacturaId.set(
      key,
      resolverEstadoListadoDesdeProyeccion(dashboardItemPorFacturaId.get(key), fallback)
    );
  }
  return estadoListadoPorFacturaId;
}

function matchesResponsabilidadListado(
  responsabilidad: ResponsabilidadListado,
  args: Pick<
    ListadoFacturasFiltros,
    "responsableUserIds" | "responsableEmails" | "incluirSinResponsable"
  >
) {
  const userIds = new Set(
    (args.responsableUserIds ?? []).map((userId) => userId.trim()).filter(Boolean)
  );
  const emails = new Set(
    (args.responsableEmails ?? [])
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
  const hasOwnerFilter = userIds.size > 0 || emails.size > 0;
  if (!hasOwnerFilter && !args.incluirSinResponsable) return true;

  const matchesSelectedOwner = responsabilidad.responsablesActuales.some(
    (responsable) =>
      (responsable.userId !== null && userIds.has(responsable.userId)) ||
      emails.has(normalizeEmail(responsable.email))
  );

  return (
    matchesSelectedOwner ||
    (args.incluirSinResponsable &&
      responsabilidad.responsabilidadEstado === "sin_responsable")
  );
}

function matchesEmpresaScope(
  factura: Doc<"facturacionFacturas">,
  args: Pick<ListadoFacturasFiltros, "empresa" | "empresas">
) {
  const facturaEmpresa = normalizeEmpresa(factura.empresa);
  if (typeof args.empresa === "number") {
    return facturaEmpresa === args.empresa;
  }
  if (args.empresas && args.empresas.length > 0) {
    return args.empresas.includes(facturaEmpresa);
  }
  return true;
}

function filtrarFacturasListado(
  facturas: Array<Doc<"facturacionFacturas">>,
  args: ListadoFacturasFiltros,
  tareaEstadoPorFacturaId: Map<string, string>,
  estadoResueltoPorFacturaId: Map<string, string | null>
) {
  const busqueda = args.busqueda?.trim();
  const estadosFiltro =
    args.estados && args.estados.length > 0
      ? new Set(args.estados)
      : undefined;

  return facturas.filter((f) => {
    if (!matchesEmpresaScope(f, args)) return false;
    if (busqueda && !matchesBusquedaFactura(f, busqueda)) return false;

    if (
      args.documentoClase &&
      getDocumentoClaseFactura(f) !== args.documentoClase
    ) {
      return false;
    }

    const tareaEstado = tareaEstadoPorFacturaId.get(String(f._id));
    const estadoResuelto =
      estadoResueltoPorFacturaId.get(String(f._id)) ?? null;

    if (estadosFiltro) {
      if (!estadoResuelto || !estadosFiltro.has(estadoResuelto)) return false;
    }

    if (args.soloRechazos) {
      const esNotaCredito = getDocumentoClaseFactura(f) === "nota_credito";
      const esRechazoEstado =
        tareaEstado !== undefined && RECHAZO_ESTADOS.has(tareaEstado);
      if (!esNotaCredito && !esRechazoEstado) return false;
    }

    if (args.fechaEmisionDesde && f.fechaEmision < args.fechaEmisionDesde) {
      return false;
    }
    if (args.fechaEmisionHasta && f.fechaEmision > args.fechaEmisionHasta) {
      return false;
    }

    if (typeof args.montoMin === "number" && f.total < args.montoMin) {
      return false;
    }
    if (typeof args.montoMax === "number" && f.total > args.montoMax) {
      return false;
    }

    if (typeof args.esPeaje === "boolean" && Boolean(f.esPeaje) !== args.esPeaje) {
      return false;
    }

    if (args.origen && f.origen !== args.origen) {
      return false;
    }

    if (
      typeof args.esLegalizacionAnticipo === "boolean" &&
      Boolean(f.esLegalizacionAnticipo) !== args.esLegalizacionAnticipo
    ) {
      return false;
    }

    if (
      typeof args.esLegalizacionCajaMenor === "boolean" &&
      Boolean(f.esLegalizacionCajaMenor) !== args.esLegalizacionCajaMenor
    ) {
      return false;
    }

    if (args.tipoFlujo) {
      const esPeaje = f.esPeaje === true;
      const esAnticipo = f.esLegalizacionAnticipo === true;
      const esCajaMenor = f.esLegalizacionCajaMenor === true;
      const esNormal = !esPeaje && !esAnticipo && !esCajaMenor;
      const matches =
        (args.tipoFlujo === "peajes" && esPeaje) ||
        (args.tipoFlujo === "legalizacion_anticipo" && esAnticipo) ||
        (args.tipoFlujo === "legalizacion_caja_menor" && esCajaMenor) ||
        (args.tipoFlujo === "normal" && esNormal);
      if (!matches) return false;
    }

    if (
      args.causacionEstado &&
      !matchesCausacionEstadoFilter(f.causado, args.causacionEstado)
    ) {
      return false;
    }

    return true;
  });
}

const facturaExportRowValidator = v.object({
  nit: v.string(),
  proveedorNombre: v.string(),
  cufe: v.string(),
  numeroFactura: v.string(),
  fechaEmision: v.string(),
  estadoActual: v.string(),
  empresa: v.number(),
  facturaId: v.id("facturacionFacturas"),
  valorContable: v.number(),
  cantidadCrucesDocumentosInternos: v.number(),
  valorCrucesDocumentosInternos: v.number(),
  baseCruceAnticipos: v.number(),
  valorAPagar: v.optional(v.number()),
  responsablesActuales: v.array(
    v.object({
      userId: v.union(v.string(), v.null()),
      email: v.string(),
      nombre: v.string(),
      rol: v.string(),
    })
  ),
  responsabilidadEstado: v.union(
    v.literal("con_responsable"),
    v.literal("sin_responsable"),
    v.literal("no_aplica")
  ),
  causado: v.union(v.boolean(), v.null()),
  numeroFp: v.union(v.string(), v.null()),
});

const listadoFacturasFiltrosArgs = {
  empresa: v.optional(v.number()),
  empresas: v.optional(v.array(v.number())),
  busqueda: v.optional(v.string()),
  documentoClase: v.optional(
    v.union(
      v.literal("factura"),
      v.literal("nota_credito"),
      v.literal("nota_debito")
    )
  ),
  estados: v.optional(v.array(v.string())),
  soloRechazos: v.optional(v.boolean()),
  fechaEmisionDesde: v.optional(v.string()),
  fechaEmisionHasta: v.optional(v.string()),
  montoMin: v.optional(v.number()),
  montoMax: v.optional(v.number()),
  esPeaje: v.optional(v.boolean()),
  origen: v.optional(
    v.union(
      v.literal("correo"),
      v.literal("carga_manual"),
      v.literal("recibo_fisico"),
      v.literal("documento_fisico")
    )
  ),
  esLegalizacionAnticipo: v.optional(v.boolean()),
  esLegalizacionCajaMenor: v.optional(v.boolean()),
  responsableUserIds: v.optional(v.array(v.string())),
  responsableEmails: v.optional(v.array(v.string())),
  incluirSinResponsable: v.optional(v.boolean()),
  tipoFlujo: v.optional(
    v.union(
      v.literal("peajes"),
      v.literal("legalizacion_anticipo"),
      v.literal("legalizacion_caja_menor"),
      v.literal("normal")
    )
  ),
  causacionEstado: v.optional(
    v.union(v.literal("causado"), v.literal("no_causado"), v.literal("sin_registro"))
  ),
} as const;

/**
 * Invoice list and export need the invoices permission. Company-scoped users are limited
 * to their companies: requested companies outside their scope are dropped and "every
 * company" means every company of theirs. Returns null when nothing is left to read.
 */
async function acotarListadoFacturasAlActor<
  T extends { empresa?: number; empresas?: number[] },
>(ctx: QueryCtx, args: T): Promise<T | null> {
  const actor = await requirePermisoEmpresa(
    ctx,
    RUTAS_SISTEMA.FACTURACION_FACTURAS,
    args.empresa
  );
  const visibles = empresasVisibles(actor);
  if (visibles === "todas" || typeof args.empresa === "number") return args;
  const empresas =
    args.empresas && args.empresas.length > 0
      ? args.empresas.filter((empresa) => visibles.includes(empresa))
      : visibles;
  return empresas.length > 0 ? { ...args, empresas } : null;
}

/**
 * Distinct active, canonical owners available to the invoice-list filter.
 * This intentionally resolves directly from the workflow source of truth so a
 * recently changed assignment is not hidden while dashboard projections catch up.
 */
export const listarResponsablesActuales = query({
  args: {
    empresa: v.optional(v.number()),
    empresas: v.optional(v.array(v.number())),
  },
  handler: async (ctx, rawArgs) => {
    const args = await acotarListadoFacturasAlActor(ctx, rawArgs);
    if (!args) return [];
    // The filter is rendered when the page opens, so this query must stay
    // bounded.  The old implementation collected every invoice, task, and
    // assignment before reducing them to a few people, which could exceed
    // Convex's read-byte limit on a normal-sized database.  The materialized
    // directory is maintained by the dashboard projection and is intentionally
    // the read model for this filter.
    const empresas = Array.from(
      new Set(
        [
          ...(typeof args.empresa === "number" ? [args.empresa] : []),
          ...(args.empresas ?? []),
        ].filter((empresa): empresa is number => Number.isFinite(empresa))
      )
    );
    if (empresas.length === 0) return [];

    const responsables = new Map<string, ResponsableActualListado>();
    for (const empresa of empresas) {
      // A directory row is one person per company/identity, rather than one
      // row per invoice.  Keep a defensive cap for partially migrated or
      // unexpectedly large directories; the paginated people API is used by
      // the reports tab when the complete directory is needed.
      const personas = await ctx.db
        .query("facturacionReportePersonas")
        .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
        .order("asc")
        .take(1000);
      for (const persona of personas) {
        if (persona.cantidadFacturasActuales <= 0) continue;
        const key = persona.identityKey;
        if (!responsables.has(key)) {
          responsables.set(key, {
            userId: persona.userId ?? null,
            email: persona.email,
            nombre: persona.nombre,
            rol: "Responsable actual",
          });
        }
      }

      // Keep the directory useful while the historical backfill is still
      // progressing.  Dashboard-responsible rows are already maintained by
      // the operational projection and therefore provide a bounded fallback
      // for identities that have not reached facturacionReportePersonas yet.
      // The index is constrained by company; esActiva is filtered before the
      // small defensive cap is applied.
      const ownerRows = await ctx.db
        .query("facturacionDashboardResponsables")
        .withIndex("by_empresa_email_esActiva", (q) => q.eq("empresa", empresa))
        .order("asc")
        .take(1000);
      for (const owner of ownerRows) {
        if (!owner.esActiva) continue;
        const key = owner.userId
          ? `id:${owner.userId}`
          : `email:${normalizeEmail(owner.email)}`;
        if (!responsables.has(key)) {
          responsables.set(key, {
            userId: owner.userId ?? null,
            email: owner.email,
            nombre: owner.nombre,
            rol: owner.rol,
          });
        }
      }
    }

    return Array.from(responsables.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
    );
  },
});

export const listarFilasParaExportar = query({
  args: {
    ...listadoFacturasFiltrosArgs,
    cursor: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    rows: v.array(facturaExportRowValidator),
    total: v.number(),
    cursor: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, rawArgs) => {
    const args = await acotarListadoFacturasAlActor(ctx, rawArgs);
    const batchSize = Math.min(Math.max(Math.trunc(rawArgs.batchSize ?? 500), 1), 1000);
    const cursor = Math.max(Math.trunc(rawArgs.cursor ?? 0), 0);
    if (!args) return { rows: [], total: 0, cursor, isDone: true };

    const [todas, todasTareas, todasAsignaciones, dashboardItems, dashboardResponsables] =
      await Promise.all([
      ctx.db.query("facturacionFacturas").order("desc").collect(),
      ctx.db.query("facturacionTareas").collect(),
      ctx.db.query("facturacionAsignaciones").collect(),
      ctx.db.query("facturacionDashboardItems").collect(),
      ctx.db.query("facturacionDashboardResponsables").collect(),
    ]);

    const tareaEstadoPorFacturaId = new Map<string, string>();
    const tareaPorFacturaId = new Map<string, Doc<"facturacionTareas">>();
    for (const tarea of todasTareas) {
      const key = String(tarea.facturaId);
      tareaEstadoPorFacturaId.set(key, tarea.estado);
      tareaPorFacturaId.set(key, tarea);
    }
    const asignacionesPorFacturaId = new Map<string, Doc<"facturacionAsignaciones">[]>();
    for (const asignacion of todasAsignaciones) {
      const key = String(asignacion.facturaId);
      const existentes = asignacionesPorFacturaId.get(key) ?? [];
      existentes.push(asignacion);
      asignacionesPorFacturaId.set(key, existentes);
    }
    const { dashboardItemPorFacturaId, responsablesPorFacturaId } = buildDashboardMaps(
      dashboardItems,
      dashboardResponsables
    );

    const estadoResueltoPorFacturaId = await buildEstadoResueltoPorFacturaId(
      ctx,
      todas,
      tareaEstadoPorFacturaId,
      args.empresa
    );
    const estadoListadoPorFacturaId = buildEstadoListadoPorFacturaId(
      estadoResueltoPorFacturaId,
      dashboardItemPorFacturaId
    );

    const filtradasBase = filtrarFacturasListado(
      todas,
      args,
      tareaEstadoPorFacturaId,
      estadoListadoPorFacturaId
    );
    const responsabilidadPorFacturaId = new Map<string, ResponsabilidadListado>();
    for (const factura of filtradasBase) {
      const key = String(factura._id);
      const fallback = resolverResponsabilidadListado(
        factura,
        tareaPorFacturaId.get(key),
        asignacionesPorFacturaId.get(key) ?? []
      );
      responsabilidadPorFacturaId.set(
        key,
        resolverResponsabilidadDesdeProyeccion(
          dashboardItemPorFacturaId.get(key),
          responsablesPorFacturaId.get(key) ?? [],
          fallback
        )
      );
    }
    const filtradas = filtradasBase.filter((factura) =>
      matchesResponsabilidadListado(
        responsabilidadPorFacturaId.get(String(factura._id))!,
        args
      )
    );

    const total = filtradas.length;
    const slice = filtradas.slice(cursor, cursor + batchSize);
    const nextCursor = cursor + slice.length;

    const rows = slice.map((factura) => {
      const valorContable = getValorContable(factura);
      const valorCruces = factura.valorCrucesDocumentosInternos ?? 0;
      const key = String(factura._id);
      const projected = dashboardItemPorFacturaId.get(key);
      return {
        nit: factura.proveedorNit,
        proveedorNombre: factura.proveedorNombre,
        cufe: factura.cufe ?? "",
        numeroFactura: factura.numeroFactura,
        fechaEmision: factura.fechaEmision,
        estadoActual:
          projected?.estadoListado ??
          projected?.faseActual ??
          estadoListadoPorFacturaId.get(key) ??
          "",
        empresa: normalizeEmpresa(factura.empresa),
        facturaId: factura._id,
        valorContable,
        cantidadCrucesDocumentosInternos: factura.cantidadCrucesDocumentosInternos ?? 0,
        valorCrucesDocumentosInternos: valorCruces,
        baseCruceAnticipos: Math.max(0, valorContable - valorCruces),
        valorAPagar: factura.valorAPagar,
        causado: factura.causado === undefined ? null : factura.causado,
        numeroFp: factura.causado === true ? (factura.numeroFp ?? null) : null,
        ...responsabilidadPorFacturaId.get(String(factura._id))!,
      };
    });

    return {
      rows,
      total,
      cursor: nextCursor,
      isDone: nextCursor >= total,
    };
  },
});

export const getByIdInterno = internalQuery({
  args: { facturaId: v.id("facturacionFacturas") },
  handler: async (ctx, args) => {
    return await ctx.db.get("facturacionFacturas", args.facturaId);
  },
});

export const patchSoportes = internalMutation({
  args: {
    facturaId: v.id("facturacionFacturas"),
    soportesStorageId: v.id("_storage"),
    soportesNombre: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("facturacionFacturas", args.facturaId, {
      soportesStorageId: args.soportesStorageId,
      soportesNombre: args.soportesNombre,
      actualizadoEn: Date.now(),
    });
  },
});

export const patchPdfStorageId = internalMutation({
  args: {
    facturaId: v.id("facturacionFacturas"),
    pdfStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("facturacionFacturas", args.facturaId, {
      pdfStorageId: args.pdfStorageId,
      actualizadoEn: Date.now(),
    });
  },
});

/**
 * Deduplicación de documentos importados: primero por CUFE (identificador
 * único DIAN) y luego por empresa + número normalizado + NIT del proveedor,
 * usando índices (sin table scan).
 */
async function buscarFacturaExistenteParaDedupe(
  ctx: MutationCtx,
  empresa: number,
  cufe: string | undefined,
  metadata: ReturnType<typeof buildFacturaMetadata>
): Promise<Doc<"facturacionFacturas"> | null> {
  const cufeNormalizado = cufe?.trim();
  if (cufeNormalizado) {
    const porCufe = await ctx.db
      .query("facturacionFacturas")
      .withIndex("by_cufe", (q) => q.eq("cufe", cufeNormalizado))
      .first();
    if (porCufe) return porCufe;
  }

  if (!metadata.numeroFacturaNormalizado) return null;

  const candidatos = await ctx.db
    .query("facturacionFacturas")
    .withIndex("by_empresa_numeroFacturaNormalizado", (q) =>
      q
        .eq("empresa", empresa)
        .eq("numeroFacturaNormalizado", metadata.numeroFacturaNormalizado)
    )
    .take(50);

  return (
    candidatos.find((factura) => {
      const nitExistente =
        factura.proveedorNitNormalizado ??
        normalizeProveedorNit(factura.proveedorNit);
      // Sin NIT en alguno de los dos lados no se puede distinguir: se asume
      // el mismo documento (comportamiento previo).
      if (!nitExistente || !metadata.proveedorNitNormalizado) return true;
      return nitExistente === metadata.proveedorNitNormalizado;
    }) ?? null
  );
}

/**
 * Backfill de numeroFacturaNormalizado / proveedorNitNormalizado en filas
 * antiguas, para que el dedupe por índice cubra todo el histórico. Se
 * re-agenda a sí mismo hasta terminar. Ejecutar una vez tras el deploy:
 * `npx convex run facturacionFacturas:backfillNormalizados`
 */
export const backfillNormalizados = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batch: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ updated: number; isDone: boolean }> => {
    const batch = Math.min(args.batch ?? 200, 500);
    const page = await ctx.db
      .query("facturacionFacturas")
      .paginate({ numItems: batch, cursor: args.cursor ?? null });

    let updated = 0;
    for (const factura of page.page) {
      const patch: Partial<Doc<"facturacionFacturas">> = {};
      if (factura.numeroFacturaNormalizado === undefined) {
        patch.numeroFacturaNormalizado = normalizeDocumentNumber(
          factura.numeroFactura
        );
      }
      if (factura.proveedorNitNormalizado === undefined) {
        patch.proveedorNitNormalizado = normalizeProveedorNit(
          factura.proveedorNit
        );
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch("facturacionFacturas", factura._id, patch);
        updated += 1;
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.facturacionFacturas.backfillNormalizados,
        { cursor: page.continueCursor, batch }
      );
    }

    return { updated, isDone: page.isDone };
  },
});

export const crearDesdeXml = internalMutation({
  args: {
    empresa: v.optional(v.number()),
    numeroFactura: v.string(),
    cufe: v.optional(v.string()),
    tipoDocumento: v.string(),
    referenciaDocumento: v.optional(v.string()),
    referenciaCufe: v.optional(v.string()),
    proveedorNit: v.string(),
    proveedorNombre: v.string(),
    proveedorDireccion: v.optional(v.string()),
    proveedorTelefono: v.optional(v.string()),
    proveedorEmail: v.optional(v.string()),
    fechaEmision: v.string(),
    fechaVencimiento: v.optional(v.string()),
    subtotal: v.number(),
    impuestos: v.number(),
    total: v.number(),
    moneda: v.string(),
    descripcion: v.string(),
    lineas: v.optional(v.array(lineaValidator)),
    xmlStorageId: v.optional(v.id("_storage")),
    pdfStorageId: v.optional(v.id("_storage")),
    soportesStorageId: v.optional(v.id("_storage")),
    soportesNombre: v.optional(v.string()),
    emailId: v.optional(v.id("facturacionCorreos")),
    graphMessageId: v.optional(v.string()),
    origen: v.union(
      v.literal("correo"),
      v.literal("carga_manual"),
      v.literal("recibo_fisico")
    ),
  },
  handler: async (ctx, args) => {
    const empresa = args.empresa ?? DEFAULT_EMPRESA;
    const metadata = buildFacturaMetadata(args);
    const existing = await buscarFacturaExistenteParaDedupe(
      ctx,
      empresa,
      args.cufe,
      metadata
    );

    if (existing) {
      const valorContable = resolverValorContableEnReimportacion(
        existing,
        args.total
      );
      await ctx.db.patch("facturacionFacturas", existing._id, {
        ...args,
        ...metadata,
        empresa,
        ...(valorContable !== undefined ? { valorContable } : {}),
        actualizadoEn: Date.now(),
      });
      await enlazarNotasCreditoAutomaticamente(ctx, existing._id);
      await refrescarProyeccionFactura(ctx, existing._id);
      return existing._id;
    }

    const facturaInsert = {
      ...args,
      ...metadata,
      empresa,
      creadoEn: Date.now(),
      actualizadoEn: Date.now(),
    };
    const valorContableInicial = valorContableInicialParaInsert({
      ...facturaInsert,
      documentoClase: metadata.documentoClase,
    });

    const facturaId = await ctx.db.insert("facturacionFacturas", {
      ...facturaInsert,
      ...(valorContableInicial !== undefined
        ? { valorContable: valorContableInicial }
        : {}),
    });
    await enlazarNotasCreditoAutomaticamente(ctx, facturaId);
    await refrescarProyeccionFactura(ctx, facturaId);
    return facturaId;
  },
});

export const crearDocumentoFisicoDesdeServidor = mutation({
  args: {
    secret: v.string(),
    empresa: v.optional(v.number()),
    numeroFactura: v.string(),
    proveedorNit: v.string(),
    proveedorNombre: v.string(),
    fechaEmision: v.string(),
    fechaVencimiento: v.optional(v.string()),
    subtotal: v.number(),
    impuestos: v.number(),
    total: v.optional(v.number()),
    totalManual: v.optional(v.boolean()),
    moneda: v.string(),
    descripcion: v.string(),
    categoria: categoriaValidator,
    soporteStorageId: v.id("_storage"),
    soporteNombre: v.string(),
    soporteMimeType: v.optional(v.string()),
    soporteSize: v.optional(v.number()),
    actorUserId: v.string(),
    actorNombre: v.string(),
    actorEmail: v.string(),
    actorProcesoId: v.optional(v.number()),
    actorProcesoNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    return await ejecutarCrearDocumentoFisico(ctx, args);
  },
});

async function ejecutarCrearDocumentoFisico(
  ctx: MutationCtx,
  args: {
    empresa?: number;
    numeroFactura: string;
    proveedorNit: string;
    proveedorNombre: string;
    fechaEmision: string;
    fechaVencimiento?: string;
    subtotal: number;
    impuestos: number;
    total?: number;
    totalManual?: boolean;
    moneda: string;
    descripcion: string;
    categoria: "administracion" | "tecnologia" | "otro";
    soporteStorageId: Id<"_storage">;
    soporteNombre: string;
    soporteMimeType?: string;
    soporteSize?: number;
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
    actorProcesoId?: number;
    actorProcesoNombre?: string;
  }
): Promise<{
  facturaId: Id<"facturacionFacturas">;
  tareaId: Id<"facturacionTareas">;
  asignacionId: Id<"facturacionAsignaciones">;
  estado: "revision_lider";
}> {
    const empresa = normalizeEmpresa(args.empresa);
    const numeroFactura = trimRequired(args.numeroFactura, "Número de factura");
    const proveedorNit = trimRequired(args.proveedorNit, "NIT del proveedor");
    const proveedorNombre = trimRequired(
      args.proveedorNombre,
      "Nombre del proveedor"
    );
    const descripcion = trimRequired(args.descripcion, "Descripción");
    const soporteNombre = trimRequired(args.soporteNombre, "Soporte");
    const soporteEsPdf = isPdfFile(soporteNombre, args.soporteMimeType);
    const moneda = (args.moneda.trim() || "COP").toUpperCase();

    if (!isIsoDate(args.fechaEmision)) {
      throw new Error("Fecha de emisión inválida.");
    }
    if (args.fechaVencimiento && !isIsoDate(args.fechaVencimiento)) {
      throw new Error("Fecha de vencimiento inválida.");
    }
    const subtotalCents = normalizeAmountToCents(args.subtotal, "Subtotal");
    const impuestosCents = normalizeAmountToCents(args.impuestos, "Impuestos");
    const totalCents =
      args.totalManual === true
        ? normalizeAmountToCents(args.total ?? 0, "Total")
        : subtotalCents + impuestosCents;
    const total = totalCents / 100;
    assertPositiveAmount(total, "Total");
    if (
      typeof args.soporteSize === "number" &&
      args.soporteSize > MAX_SUPPORT_FILE_BYTES
    ) {
      throw new Error("El soporte no puede superar 25MB.");
    }

    const recepcionUsuarios = getUsuariosConfig(
      await getRecepcionConfig(ctx, empresa)
    );
    if (recepcionUsuarios.length === 0) {
      throw new Error("Configura al menos un usuario de recepción.");
    }

    const metadata = buildFacturaMetadata({
      numeroFactura,
      tipoDocumento: "01",
      proveedorNit,
    });
    if (!metadata.numeroFacturaNormalizado) {
      throw new Error("El número de factura debe contener letras o números.");
    }
    if (metadata.esPeaje || isPeajesNit(proveedorNit)) {
      throw new Error(
        "Los documentos PEAJES no se crean por documento físico manual."
      );
    }

    let duplicate: Doc<"facturacionFacturas"> | null = await ctx.db
      .query("facturacionFacturas")
      .withIndex("by_empresa_numeroFacturaNormalizado", (q) =>
        q
          .eq("empresa", empresa)
          .eq("numeroFacturaNormalizado", metadata.numeroFacturaNormalizado)
      )
      .first();
    if (!duplicate) {
      const candidates = await ctx.db
        .query("facturacionFacturas")
        .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
        .collect();
      duplicate = candidates.find(
        (factura) =>
          (factura.numeroFacturaNormalizado ??
            normalizeDocumentNumber(factura.numeroFactura)) ===
          metadata.numeroFacturaNormalizado
      ) ?? null;
    }
    if (duplicate) {
      throw new Error("Ya existe una factura con ese número para esta empresa.");
    }

    const now = Date.now();
    const facturaInsert = {
      empresa,
      numeroFactura,
      tipoDocumento: "01",
      proveedorNit,
      proveedorNombre,
      fechaEmision: args.fechaEmision,
      ...(args.fechaVencimiento
        ? { fechaVencimiento: args.fechaVencimiento }
        : {}),
      subtotal: subtotalCents / 100,
      impuestos: impuestosCents / 100,
      total,
      moneda,
      descripcion,
      lineas: [
        {
          descripcion,
          cantidad: 1,
          precioUnitario: total,
          total,
        },
      ],
      origen: "documento_fisico" as const,
      isFisico: true,
      ...(soporteEsPdf
        ? { pdfStorageId: args.soporteStorageId }
        : {
            soportesStorageId: args.soporteStorageId,
            soportesNombre: soporteNombre,
          }),
      ...metadata,
      creadoEn: now,
      actualizadoEn: now,
    };
    const valorContableInicial = valorContableInicialParaInsert({
      ...facturaInsert,
      documentoClase: metadata.documentoClase,
    });

    const facturaId = await ctx.db.insert("facturacionFacturas", {
      ...facturaInsert,
      ...(valorContableInicial !== undefined
        ? { valorContable: valorContableInicial }
        : {}),
    });
    const tareaId: Id<"facturacionTareas"> = await ctx.runMutation(
      internal.facturacionTareas.crearDesdeFacturaInterno,
      {
        facturaId,
        empresa,
        categoria: args.categoria,
      }
    );

    await ctx.db.insert("facturacionAdjuntos", {
      facturaId,
      empresa,
      storageId: args.soporteStorageId,
      nombre: soporteNombre,
      ...(args.soporteMimeType?.trim()
        ? { mimeType: args.soporteMimeType.trim() }
        : {}),
      ...(typeof args.soporteSize === "number" ? { size: args.soporteSize } : {}),
      ...(args.actorUserId ? { subidoPorUserId: args.actorUserId } : {}),
      subidoPorNombre: args.actorNombre,
      subidoPorEmail: normalizeEmail(args.actorEmail),
      creadoEn: now,
    });

    await ctx.db.insert("facturacionAprobaciones", {
      tareaId,
      facturaId,
      empresa,
      ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
      actorNombre: args.actorNombre,
      actorEmail: normalizeEmail(args.actorEmail),
      accion: "crear_documento_fisico",
      comentario: `Documento físico creado manualmente por ${args.actorNombre}.`,
      estadoAnterior: "captura",
      estadoNuevo: "recepcion",
      creadoEn: now,
    });

    await refrescarProyeccionFactura(ctx, facturaId, now);

    const autoAsignacion: {
      asignacionId: Id<"facturacionAsignaciones">;
      estado: "revision_lider";
    } = await ctx.runMutation(
      internal.facturacionTareas.autoAsignarDocumentoFisicoALiderInterno,
      {
        tareaId,
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        actorProcesoId: args.actorProcesoId,
        actorProcesoNombre: args.actorProcesoNombre,
      }
    );

    return {
      facturaId,
      tareaId,
      asignacionId: autoAsignacion.asignacionId,
      estado: autoAsignacion.estado,
    };
}

const VALIDACION_DIAN_MAX_CUFES = 250;

/**
 * Busca facturas por CUFE/CUDE para la validación DIAN en el navegador.
 * Solo recibe identificadores (no el Excel completo). Máximo 250 únicos por llamada.
 */
export const buscarPorCufesParaValidacionDian = query({
  args: {
    cufes: v.array(v.string()),
    empresa: v.optional(v.number()),
  },
  returns: v.object({
    coincidencias: v.array(
      v.object({
        cufe: v.string(),
        facturaId: v.id("facturacionFacturas"),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const actor = await requirePermisoEmpresa(
      ctx,
      RUTAS_SISTEMA.FACTURACION_FACTURAS,
      args.empresa
    );
    const uniqueCufes: string[] = [];
    const seen = new Set<string>();
    for (const raw of args.cufes) {
      const cufe = raw.trim();
      if (!cufe || seen.has(cufe)) continue;
      seen.add(cufe);
      uniqueCufes.push(cufe);
    }

    if (uniqueCufes.length > VALIDACION_DIAN_MAX_CUFES) {
      throw new Error(
        `Máximo ${VALIDACION_DIAN_MAX_CUFES} CUFE/CUDE por consulta`
      );
    }

    const empresaFiltro =
      typeof args.empresa === "number" ? args.empresa : undefined;
    const coincidencias: Array<{
      cufe: string;
      facturaId: Id<"facturacionFacturas">;
    }> = [];

    for (const cufe of uniqueCufes) {
      // Varios documentos pueden compartir CUFE entre empresas; tomamos un
      // lote pequeño y filtramos por alcance empresarial.
      const candidatos = await ctx.db
        .query("facturacionFacturas")
        .withIndex("by_cufe", (q) => q.eq("cufe", cufe))
        .take(25);

      const match =
        typeof empresaFiltro === "number"
          ? candidatos.find(
              (factura) => normalizeEmpresa(factura.empresa) === empresaFiltro
            )
          : candidatos.find((factura) =>
              actorPuedeVerEmpresa(actor, normalizeEmpresa(factura.empresa))
            );

      if (match) {
        coincidencias.push({ cufe, facturaId: match._id });
      }
    }

    return { coincidencias };
  },
});
