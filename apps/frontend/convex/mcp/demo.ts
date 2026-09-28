import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { refreshAnticipoDashboardProjection } from "../lib/anticiposDashboardProjection";
import { isColombianBusinessDay } from "../lib/colombiaHolidays";
import { eliminarProyeccionFactura, refrescarProyeccionFactura } from "../lib/facturacionDashboardProjection";
import { normalizePeajesDocumentNumber, normalizePeajesProviderNit } from "../lib/peajes";

/**
 * Demo data for the MCP server (dev deployments only): invoices from the fictional supplier
 * ACME Logistics and two others at different approval phases and SLA states, plus employee
 * advances with partial settlements. Every person uses an example.com address and every
 * NIT is fictional.
 *
 *   npx convex run mcp/demo:sembrar '{"empresa": 2}'
 *   npx convex run mcp/demo:limpiar
 *
 * Seeded rows are marked (cufe prefix, createdById prefix, SLA config author) so `limpiar`
 * removes exactly them. SLA thresholds are only added for phases a company has not
 * configured; existing configuration is never overwritten.
 */

const MARCA_CUFE = "mcp-demo-";
const MARCA_USUARIO = "mcp-demo-";
const AUTOR_SLA = "Semilla demo MCP";
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

type Fase = Doc<"facturacionAsignaciones">["fase"];
type Rol = Doc<"facturacionAsignaciones">["rol"];

const PERSONAS = {
  recepcion: { nombre: "Diego Salas", email: "diego.salas@example.com", rol: "recepcion" },
  lider: { nombre: "Santiago Sandoval", email: "santiago.sandoval@example.com", rol: "lider" },
  causacion: { nombre: "Andrés Ruiz", email: "andres.ruiz@example.com", rol: "analista_causacion" },
  impuestos: { nombre: "Paula Ortega", email: "paula.ortega@example.com", rol: "contador_impuestos" },
  gerencia: { nombre: "Julián Herrera", email: "julian.herrera@example.com", rol: "gerencia" },
  tesoreria: { nombre: "Camila Rojas", email: "camila.rojas@example.com", rol: "tesorero" },
} as const satisfies Record<string, { nombre: string; email: string; rol: Rol }>;

const RESPONSABLE_POR_FASE: Partial<Record<Fase, keyof typeof PERSONAS>> = {
  recepcion: "recepcion",
  revision_lider: "lider",
  causacion: "causacion",
  revision_impuestos: "impuestos",
  gerencia: "gerencia",
  revision_tesoreria: "tesoreria",
};

const PROVEEDORES = {
  acme: { nit: "901555222", nombre: "ACME Logistics S.A.S." },
  quebradaHonda: { nit: "900777111", nombre: "Transportes Quebrada Honda S.A.S." },
  nevado: { nit: "900888333", nombre: "Suministros El Nevado S.A.S." },
} as const;

/** Default thresholds (business days) for phases the company has not configured. */
const UMBRALES_SLA: Record<Exclude<Fase, "jefe_directo">, number> = {
  recepcion: 1,
  revision_lider: 3,
  causacion: 2,
  revision_impuestos: 2,
  eventos_dian: 2,
  pendiente_rechazar_dian: 2,
  gerencia: 2,
  revision_tesoreria: 3,
};

type FacturaDemo = {
  numero: string;
  proveedor: keyof typeof PROVEEDORES;
  total: number;
  descripcion: string;
  /** Active phase, or "cerrada" for a finished invoice. */
  fase: Fase | "cerrada";
  /** Business days the invoice has spent in its current phase. */
  diasEnFase: number;
  /** Company override (defaults to the seeded company). */
  empresa?: number;
};

const FACTURAS: FacturaDemo[] = [
  { numero: "DRM-1041", proveedor: "acme", total: 18_450_000, descripcion: "Mantenimiento de bandas transportadoras", fase: "revision_lider", diasEnFase: 6 },
  { numero: "DRM-1066", proveedor: "acme", total: 6_730_000, descripcion: "Calibración de básculas de despacho", fase: "revision_lider", diasEnFase: 2.6 },
  { numero: "DRM-1052", proveedor: "acme", total: 7_980_000, descripcion: "Repuestos hidráulicos", fase: "causacion", diasEnFase: 1.7 },
  { numero: "DRM-1063", proveedor: "acme", total: 32_600_000, descripcion: "Alquiler de montacargas, agosto", fase: "revision_tesoreria", diasEnFase: 4 },
  { numero: "DRM-1060", proveedor: "acme", total: 4_250_000, descripcion: "Inspección de seguridad industrial", fase: "gerencia", diasEnFase: 0.5 },
  { numero: "DRM-1070", proveedor: "acme", total: 3_200_000, descripcion: "Viáticos de montaje en planta", fase: "cerrada", diasEnFase: 0 },
  { numero: "DRM-1072", proveedor: "acme", total: 2_500_000, descripcion: "Hospedaje del equipo de montaje", fase: "cerrada", diasEnFase: 0 },
  { numero: "QH-551", proveedor: "quebradaHonda", total: 12_300_000, descripcion: "Transporte de material, semana 36", fase: "revision_impuestos", diasEnFase: 1 },
  { numero: "NEV-88", proveedor: "nevado", total: 2_140_000, descripcion: "Elementos de protección personal", fase: "recepcion", diasEnFase: 3 },
  { numero: "NEV-90", proveedor: "nevado", total: 5_870_000, descripcion: "Papelería y consumibles", fase: "revision_lider", diasEnFase: 1 },
  // Outside the MCP scope when MCP_EMPRESAS lists only the seeded company.
  { numero: "DRM-2001", proveedor: "acme", total: 9_900_000, descripcion: "Mantenimiento preventivo", fase: "revision_lider", diasEnFase: 5, empresa: 3 },
];

const SOLICITANTES = {
  mateo: { id: `${MARCA_USUARIO}mateo`, nombre: "Mateo Castaño", email: "mateo.castano@example.com" },
  sara: { id: `${MARCA_USUARIO}sara`, nombre: "Sara Villegas", email: "sara.villegas@example.com" },
} as const;

/** The instant `dias` Colombian business days before `desde` (fractions count as hours). */
export function restarDiasLaborales(desde: number, dias: number): number {
  let restante = dias;
  let cursor = desde;
  while (restante > 0) {
    const paso = Math.min(restante, 1);
    cursor -= DIA_MS * paso;
    if (isColombianBusinessDay(cursor)) restante -= paso;
  }
  return cursor;
}

function fechaIso(ms: number) {
  return new Date(ms - 5 * HORA_MS).toISOString().slice(0, 10);
}

async function asegurarUmbralesSla(ctx: MutationCtx, empresa: number, ahora: number) {
  for (const [fase, umbral] of Object.entries(UMBRALES_SLA) as [keyof typeof UMBRALES_SLA, number][]) {
    const existente = await ctx.db
      .query("facturacionSlaConfiguracion")
      .withIndex("by_empresa_fase", (q) => q.eq("empresa", empresa).eq("fase", fase))
      .unique();
    if (existente) continue;
    await ctx.db.insert("facturacionSlaConfiguracion", {
      empresa,
      fase,
      umbralDiasLaborales: umbral,
      habilitado: true,
      actualizadoEn: ahora,
      actualizadoPorNombre: AUTOR_SLA,
    });
  }
}

async function crearFactura(ctx: MutationCtx, demo: FacturaDemo, empresa: number, ahora: number) {
  const proveedor = PROVEEDORES[demo.proveedor];
  const inicioFase = restarDiasLaborales(ahora, demo.diasEnFase);
  const creadaEn = restarDiasLaborales(inicioFase, 2);
  const impuestos = Math.round((demo.total * 0.19) / 1.19);

  const facturaId = await ctx.db.insert("facturacionFacturas", {
    empresa,
    numeroFactura: demo.numero,
    cufe: `${MARCA_CUFE}${empresa}-${demo.numero}`,
    tipoDocumento: "01",
    tipoDocumentoNormalizado: "01",
    documentoClase: "factura",
    proveedorNit: proveedor.nit,
    proveedorNitNormalizado: normalizePeajesProviderNit(proveedor.nit),
    numeroFacturaNormalizado: normalizePeajesDocumentNumber(demo.numero),
    esPeaje: false,
    proveedorNombre: proveedor.nombre,
    fechaEmision: fechaIso(creadaEn),
    subtotal: demo.total - impuestos,
    impuestos,
    total: demo.total,
    valorContable: demo.total,
    valorAPagar: demo.total,
    moneda: "COP",
    descripcion: demo.descripcion,
    origen: "carga_manual",
    creadoEn: creadaEn,
    actualizadoEn: inicioFase,
  });

  const lider = PERSONAS.lider;
  const responsable = demo.fase === "cerrada" ? PERSONAS.tesoreria : PERSONAS[RESPONSABLE_POR_FASE[demo.fase] ?? "lider"];
  const tareaId = await ctx.db.insert("facturacionTareas", {
    facturaId,
    empresa,
    estado: demo.fase,
    categoria: "administracion",
    asignadoANombre: responsable.nombre,
    asignadoAEmail: responsable.email,
    liderProcesoNombre: lider.nombre,
    liderProcesoEmail: lider.email,
    liderProcesoProcesoNombre: "Operaciones",
    faseIniciadaEn: inicioFase,
    ...(demo.fase === "cerrada" ? { finalizadoEn: inicioFase } : {}),
    creadoEn: creadaEn,
    actualizadoEn: inicioFase,
  });

  if (demo.fase !== "cerrada") {
    const grupoId = `${demo.fase}:${facturaId}:${inicioFase}:mcpdemo`;
    const asignacionId: Id<"facturacionAsignaciones"> = await ctx.db.insert("facturacionAsignaciones", {
      facturaId,
      tareaId,
      empresa,
      fase: demo.fase,
      estado: "pendiente",
      rol: responsable.rol,
      grupoId,
      asignadoANombre: responsable.nombre,
      asignadoAEmail: responsable.email,
      fechaAsignacion: inicioFase,
      creadoEn: inicioFase,
      actualizadoEn: inicioFase,
    });
    await ctx.db.patch("facturacionTareas", tareaId, {
      currentAsignacionId: asignacionId,
      grupoAsignacionActualId: grupoId,
    });
  }

  await refrescarProyeccionFactura(ctx, facturaId, ahora);
  return facturaId;
}

async function crearAnticipo(
  ctx: MutationCtx,
  args: {
    empresa: number;
    consecutivo: number;
    solicitante: (typeof SOLICITANTES)[keyof typeof SOLICITANTES];
    valor: number;
    valorLetra: string;
    fase: Doc<"anticipos">["faseActual"];
    legalizaciones: { facturaId: Id<"facturacionFacturas">; valor: number }[];
    limiteLegalizacion: number;
    ahora: number;
  }
) {
  const legalizado = args.legalizaciones.reduce((suma, l) => suma + l.valor, 0);
  const anticipoId = await ctx.db.insert("anticipos", {
    empresa: args.empresa,
    empresa_id: args.empresa,
    consecutivo: args.consecutivo,
    razonSocial: PROVEEDORES.acme.nombre,
    nit: PROVEEDORES.acme.nit,
    formaPago: "TRANSFERENCIA BANCARIA",
    valorNumerico: args.valor,
    valorContable: args.valor,
    valorLetra: args.valorLetra,
    saldoLegalizado: legalizado,
    maxLegalizacionDate: args.limiteLegalizacion,
    observaciones: "Anticipo de demostración (datos ficticios).",
    createdById: args.solicitante.id,
    solicitanteNombre: args.solicitante.nombre,
    solicitanteEmail: args.solicitante.email,
    procesoNombre: "Operaciones",
    cubreFacturaCompleta: false,
    faseActual: args.fase,
    legalizacion: args.legalizaciones.map((l) => ({
      legalizadoPorUserId: args.solicitante.id,
      fechaLegalizacion: args.ahora - 2 * DIA_MS,
      facturaId: l.facturaId,
      valorLegalizado: l.valor,
    })),
    createdAt: args.ahora - 20 * DIA_MS,
    updatedAt: args.ahora - 2 * DIA_MS,
  });
  await refreshAnticipoDashboardProjection(ctx, anticipoId, args.ahora);
  return anticipoId;
}

async function yaSembrada(ctx: MutationCtx, empresa: number) {
  const factura = await ctx.db
    .query("facturacionFacturas")
    .withIndex("by_empresa_numeroFacturaNormalizado", (q) =>
      q.eq("empresa", empresa).eq("numeroFacturaNormalizado", normalizePeajesDocumentNumber(FACTURAS[0].numero))
    )
    .first();
  return Boolean(factura?.cufe?.startsWith(MARCA_CUFE));
}

export const sembrar = internalMutation({
  args: { empresa: v.number() },
  returns: v.object({ sembrada: v.boolean(), facturas: v.number(), anticipos: v.number() }),
  handler: async (ctx, args) => {
    if (await yaSembrada(ctx, args.empresa)) {
      return { sembrada: false, facturas: 0, anticipos: 0 };
    }
    const ahora = Date.now();
    const empresasSla = new Set(FACTURAS.map((f) => f.empresa ?? args.empresa));
    for (const empresa of empresasSla) await asegurarUmbralesSla(ctx, empresa, ahora);

    const ids = new Map<string, Id<"facturacionFacturas">>();
    for (const demo of FACTURAS) {
      ids.set(demo.numero, await crearFactura(ctx, demo, demo.empresa ?? args.empresa, ahora));
    }

    const ultimo = await ctx.db.query("anticipos").withIndex("by_consecutivo").order("desc").first();
    let consecutivo = (ultimo?.consecutivo ?? 0) + 1;
    const facturaViaticos = ids.get("DRM-1070")!;
    const facturaHospedaje = ids.get("DRM-1072")!;
    const anticipos = [
      {
        solicitante: SOLICITANTES.mateo,
        valor: 5_000_000,
        valorLetra: "CINCO MILLONES DE PESOS M/CTE",
        fase: "V_PENDIENTE_LEGALIZACION" as const,
        legalizaciones: [{ facturaId: facturaViaticos, valor: 3_200_000 }],
        limiteLegalizacion: ahora + 10 * DIA_MS,
      },
      {
        solicitante: SOLICITANTES.mateo,
        valor: 1_200_000,
        valorLetra: "UN MILLÓN DOSCIENTOS MIL PESOS M/CTE",
        fase: "V_PENDIENTE_LEGALIZACION" as const,
        legalizaciones: [],
        limiteLegalizacion: ahora - 3 * DIA_MS,
      },
      {
        solicitante: SOLICITANTES.sara,
        valor: 2_500_000,
        valorLetra: "DOS MILLONES QUINIENTOS MIL PESOS M/CTE",
        fase: "COMPLETADO" as const,
        legalizaciones: [{ facturaId: facturaHospedaje, valor: 2_500_000 }],
        limiteLegalizacion: ahora - 5 * DIA_MS,
      },
    ];
    for (const anticipo of anticipos) {
      await crearAnticipo(ctx, { empresa: args.empresa, consecutivo: consecutivo++, ahora, ...anticipo });
    }

    return { sembrada: true, facturas: FACTURAS.length, anticipos: anticipos.length };
  },
});

/** Removes every row `sembrar` created, in any company. */
export const limpiar = internalMutation({
  args: {},
  returns: v.object({ facturas: v.number(), anticipos: v.number(), umbrales: v.number() }),
  handler: async (ctx) => {
    const ahora = Date.now();
    let facturas = 0;
    const numeros = new Set(FACTURAS.map((f) => normalizePeajesDocumentNumber(f.numero)));
    for await (const factura of ctx.db.query("facturacionFacturas")) {
      if (!factura.cufe?.startsWith(MARCA_CUFE) || !numeros.has(factura.numeroFacturaNormalizado ?? "")) continue;
      const tareas = await ctx.db
        .query("facturacionTareas")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
        .take(5);
      for (const tarea of tareas) await ctx.db.delete("facturacionTareas", tarea._id);
      const asignaciones = await ctx.db
        .query("facturacionAsignaciones")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
        .take(20);
      for (const asignacion of asignaciones) await ctx.db.delete("facturacionAsignaciones", asignacion._id);
      await ctx.db.delete("facturacionFacturas", factura._id);
      await eliminarProyeccionFactura(ctx, factura._id, ahora);
      facturas++;
    }

    let anticipos = 0;
    for (const solicitante of Object.values(SOLICITANTES)) {
      const filas = await ctx.db
        .query("anticipos")
        .withIndex("by_createdById", (q) => q.eq("createdById", solicitante.id))
        .take(20);
      for (const anticipo of filas) {
        await ctx.db.delete("anticipos", anticipo._id);
        await refreshAnticipoDashboardProjection(ctx, anticipo._id, ahora);
        anticipos++;
      }
    }

    let umbrales = 0;
    for await (const config of ctx.db.query("facturacionSlaConfiguracion")) {
      if (config.actualizadoPorNombre !== AUTOR_SLA) continue;
      await ctx.db.delete("facturacionSlaConfiguracion", config._id);
      umbrales++;
    }
    return { facturas, anticipos, umbrales };
  },
});
