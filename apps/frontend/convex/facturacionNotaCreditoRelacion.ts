import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { refrescarProyeccionFactura } from "./lib/facturacionDashboardProjection";
import {
  buildSnapshotMonetario,
  evaluarElegibilidadReasignacion,
  getDocumentoClaseRelacion,
  getValorBaseFactura,
  getValorNotaCredito,
  isFacturaPeajesRelacion,
  isNotaCreditoPeajesRelacion,
  listNotasCreditoRelacionadasAFactura,
  normalizeNumeroFacturaBusqueda,
  resolveRelacionEfectiva,
  type OrigenRelacionEfectiva,
} from "./lib/notaCreditoRelacion";
import { normalizePeajesDocumentNumber } from "./lib/peajes";
import { requireServerSecret } from "./lib/auth";
import { normalizeEmail, normalizeEmpresa } from "./lib/normalize";

const MAX_CANDIDATOS = 20;
const MAX_MOTIVO = 500;

const peajesDocumentoValidator = v.object({
  tipo: v.union(v.literal("factura"), v.literal("nota_credito")),
  numero: v.string(),
  numeroNormalizado: v.string(),
  referencia: v.optional(v.string()),
  referenciaNormalizada: v.optional(v.string()),
  total: v.number(),
  proveedorNit: v.optional(v.string()),
  operador: v.optional(v.string()),
  placa: v.optional(v.string()),
  centroCosto: v.optional(v.string()),
  fechaCreacion: v.optional(v.string()),
});

const contextoValidator = v.union(
  v.object({ tipo: v.literal("detalle_factura") }),
  v.object({
    tipo: v.literal("conciliacion_peajes"),
    archivoNombre: v.string(),
    documentosArchivo: v.array(peajesDocumentoValidator),
  })
);

const reasignacionBaseArgs = {
  notaCreditoId: v.id("facturacionFacturas"),
  facturaNuevaId: v.id("facturacionFacturas"),
  facturaAnteriorEfectivaEsperadaId: v.union(
    v.id("facturacionFacturas"),
    v.null()
  ),
  origenRelacionAnteriorEsperado: v.union(
    v.literal("dian"),
    v.literal("manual"),
    v.literal("sin_relacion")
  ),
  motivo: v.string(),
  actorUserId: v.optional(v.string()),
  actorNombre: v.string(),
  actorEmail: v.string(),
};

type PeajesDocumentoArchivo = {
  tipo: "factura" | "nota_credito";
  numero: string;
  numeroNormalizado: string;
  referencia?: string;
  referenciaNormalizada?: string;
  total: number;
  proveedorNit?: string;
  operador?: string;
  placa?: string;
  centroCosto?: string;
  fechaCreacion?: string;
};

type ReasignacionArgs = {
  notaCreditoId: Id<"facturacionFacturas">;
  facturaNuevaId: Id<"facturacionFacturas">;
  facturaAnteriorEfectivaEsperadaId: Id<"facturacionFacturas"> | null;
  origenRelacionAnteriorEsperado: OrigenRelacionEfectiva;
  motivo: string;
  contexto:
    | { tipo: "detalle_factura" }
    | {
        tipo: "conciliacion_peajes";
        archivoNombre: string;
        documentosArchivo: PeajesDocumentoArchivo[];
      };
  actorUserId?: string;
  actorNombre: string;
  actorEmail: string;
};

function toNotaPublica(nota: Doc<"facturacionFacturas">, efectiva: {
  factura: Doc<"facturacionFacturas"> | null;
  origen: OrigenRelacionEfectiva;
}) {
  return {
    id: String(nota._id),
    numero: nota.numeroFactura,
    total: getValorNotaCredito(nota),
    moneda: nota.moneda,
    fechaEmision: nota.fechaEmision,
    proveedorNombre: nota.proveedorNombre,
    proveedorNit: nota.proveedorNit,
    referenciaXml: nota.referenciaDocumento,
    esPeajes: isNotaCreditoPeajesRelacion(nota),
    facturaActual: efectiva.factura
      ? {
          id: String(efectiva.factura._id),
          numero: efectiva.factura.numeroFactura,
          origen:
            efectiva.origen === "sin_relacion"
              ? ("dian" as const)
              : (efectiva.origen as "dian" | "manual"),
        }
      : undefined,
  };
}

async function buildCandidato(
  ctx: { db: QueryCtxDb },
  args: {
    factura: Doc<"facturacionFacturas">;
    nota: Doc<"facturacionFacturas">;
    modo: "general" | "peajes";
  }
) {
  const notas = await listNotasCreditoRelacionadasAFactura(ctx as never, args.factura, {
    incluirPeajes: args.modo === "peajes",
    soloPeajes: args.modo === "peajes",
  });
  const snapshotActual = buildSnapshotMonetario({
    factura: args.factura,
    notasCredito: notas,
  });
  const notasSinFuente = notas.filter(
    (item) => String(item._id) !== String(args.nota._id)
  );
  const snapshotProyectado = buildSnapshotMonetario({
    factura: args.factura,
    notasCredito: [...notasSinFuente, args.nota],
  });
  const tarea = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.factura._id))
    .unique();

  return {
    id: String(args.factura._id),
    numero: args.factura.numeroFactura,
    fechaEmision: args.factura.fechaEmision,
    estado: tarea?.estado,
    proveedorNombre: args.factura.proveedorNombre,
    proveedorNit: args.factura.proveedorNit,
    moneda: args.factura.moneda,
    valorBaseFactura: snapshotActual.valorBase,
    usaValorXmlComoBase: snapshotActual.usaValorXmlComoBase,
    totalNotasCreditoActual: snapshotActual.totalNotasCredito,
    netoActual: snapshotActual.neto,
    netoProyectado: snapshotProyectado.neto,
  };
}

type QueryCtxDb = {
  query: import("./_generated/server").QueryCtx["db"]["query"];
  get: import("./_generated/server").QueryCtx["db"]["get"];
};

export const obtenerNotaCreditoParaRelacionDesdeServidor = query({
  args: {
    secret: v.string(),
    notaCreditoId: v.id("facturacionFacturas"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const nota = await ctx.db.get("facturacionFacturas", args.notaCreditoId);
    if (!nota) throw new Error("Documento no encontrado");
    if (getDocumentoClaseRelacion(nota) !== "nota_credito") {
      throw new Error("El documento no es una nota crédito");
    }
    const efectiva = await resolveRelacionEfectiva(ctx, nota, {
      permitirPeajes: isNotaCreditoPeajesRelacion(nota),
    });
    return {
      empresa: normalizeEmpresa(nota.empresa),
      notaCredito: toNotaPublica(nota, efectiva),
      origenRelacionEfectiva: efectiva.origen,
      facturaAnteriorEfectivaId: efectiva.factura
        ? String(efectiva.factura._id)
        : null,
    };
  },
});

export const buscarFacturasCandidatasDesdeServidor = query({
  args: {
    secret: v.string(),
    notaCreditoId: v.id("facturacionFacturas"),
    q: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const nota = await ctx.db.get("facturacionFacturas", args.notaCreditoId);
    if (!nota) throw new Error("Documento no encontrado");
    if (getDocumentoClaseRelacion(nota) !== "nota_credito") {
      throw new Error("El documento no es una nota crédito");
    }
    if (isNotaCreditoPeajesRelacion(nota)) {
      throw new Error(
        "Las notas crédito PEAJES solo se pueden reasignar desde una conciliación PEAJES activa."
      );
    }

    const qNormalizado = normalizeNumeroFacturaBusqueda(args.q);
    if (qNormalizado.length < 2) {
      throw new Error("La búsqueda requiere al menos 2 caracteres.");
    }

    const efectiva = await resolveRelacionEfectiva(ctx, nota, {
      permitirPeajes: false,
    });
    const empresa = normalizeEmpresa(nota.empresa);
    const nitNormalizado =
      nota.proveedorNitNormalizado ??
      nota.proveedorNit.replace(/\D/g, "").replace(/^0+/, "");

    const searchResults = await ctx.db
      .query("facturacionFacturas")
      .withSearchIndex("search_numeroFacturaRelacion", (q) =>
        q
          .search("numeroFacturaNormalizado", qNormalizado)
          .eq("empresa", empresa)
          .eq("proveedorNitNormalizado", nitNormalizado)
          .eq("documentoClase", "factura")
      )
      .take(80);

    const prefixMatches = searchResults
      .filter((factura) => {
        const numero =
          factura.numeroFacturaNormalizado ??
          normalizePeajesDocumentNumber(factura.numeroFactura);
        return numero.startsWith(qNormalizado);
      })
      .filter((factura) => !isFacturaPeajesRelacion(factura))
      .sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision));

    const candidatos = [];
    for (const factura of prefixMatches) {
      if (candidatos.length >= MAX_CANDIDATOS) break;
      if (
        efectiva.factura &&
        String(efectiva.factura._id) === String(factura._id)
      ) {
        continue;
      }
      const elegibilidad = await evaluarElegibilidadReasignacion(ctx, {
        nota,
        facturaNueva: factura,
        facturaAnterior: efectiva.factura,
        modo: "general",
      });
      if (!elegibilidad.ok) continue;
      candidatos.push(
        await buildCandidato(
          { db: ctx.db },
          { factura, nota, modo: "general" }
        )
      );
    }

    return {
      notaCredito: toNotaPublica(nota, efectiva),
      candidatos,
    };
  },
});

export const listarHistorialRelacionDocumento = query({
  args: {
    facturaId: v.id("facturacionFacturas"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) return [];

    const asNota = await ctx.db
      .query("facturacionNotaCreditoRelacionHistorial")
      .withIndex("by_notaCreditoId_creadoEn", (q) =>
        q.eq("notaCreditoId", args.facturaId)
      )
      .order("desc")
      .take(50);
    const asAnterior = await ctx.db
      .query("facturacionNotaCreditoRelacionHistorial")
      .withIndex("by_facturaAnteriorId_creadoEn", (q) =>
        q.eq("facturaAnteriorId", args.facturaId)
      )
      .order("desc")
      .take(50);
    const asNueva = await ctx.db
      .query("facturacionNotaCreditoRelacionHistorial")
      .withIndex("by_facturaNuevaId_creadoEn", (q) =>
        q.eq("facturaNuevaId", args.facturaId)
      )
      .order("desc")
      .take(50);

    const byId = new Map<string, Doc<"facturacionNotaCreditoRelacionHistorial">>();
    for (const row of [...asNota, ...asAnterior, ...asNueva]) {
      byId.set(String(row._id), row);
    }
    return Array.from(byId.values()).sort((a, b) => b.creadoEn - a.creadoEn);
  },
});

async function aplicarReasignacionNotaCredito(
  ctx: MutationCtx,
  args: ReasignacionArgs
) {
    const motivo = args.motivo.trim();
    if (!motivo) throw new Error("El motivo es obligatorio.");
    if (motivo.length > MAX_MOTIVO) {
      throw new Error("El motivo no puede superar 500 caracteres.");
    }

    const nota = await ctx.db.get("facturacionFacturas", args.notaCreditoId);
    const facturaNueva = await ctx.db.get("facturacionFacturas", args.facturaNuevaId);
    if (!nota || !facturaNueva) throw new Error("Documento no encontrado");

    const modo =
      args.contexto.tipo === "conciliacion_peajes" ? "peajes" : "general";
    const efectiva = await resolveRelacionEfectiva(ctx, nota, {
      permitirPeajes: modo === "peajes",
    });

    const expectedId = args.facturaAnteriorEfectivaEsperadaId
      ? String(args.facturaAnteriorEfectivaEsperadaId)
      : null;
    const actualId = efectiva.factura ? String(efectiva.factura._id) : null;
    if (
      expectedId !== actualId ||
      args.origenRelacionAnteriorEsperado !== efectiva.origen
    ) {
      throw new Error(
        "CONFLICTO_RELACION: La relación efectiva cambió después de abrir el diálogo."
      );
    }

    let facturasArchivoIds: Set<string> | undefined;
    let facturasConOtraDiferenciaCritica: Set<string> | undefined;

    if (args.contexto.tipo === "conciliacion_peajes") {
      const docs = args.contexto.documentosArchivo;
      const notaEnArchivo = docs.some(
        (doc) =>
          doc.tipo === "nota_credito" &&
          doc.numeroNormalizado ===
            (nota.numeroFacturaNormalizado ??
              normalizePeajesDocumentNumber(nota.numeroFactura))
      );
      const facturaEnArchivo = docs.some(
        (doc) =>
          doc.tipo === "factura" &&
          doc.numeroNormalizado ===
            (facturaNueva.numeroFacturaNormalizado ??
              normalizePeajesDocumentNumber(facturaNueva.numeroFactura))
      );
      if (!notaEnArchivo || !facturaEnArchivo) {
        throw new Error(
          "VALIDACION_PEAJES: La nota o la factura no pertenecen al archivo de conciliación."
        );
      }

      facturasArchivoIds = new Set<string>();
      for (const doc of docs) {
        if (doc.tipo !== "factura") continue;
        const matches = await ctx.db
          .query("facturacionFacturas")
          .withIndex("by_empresa_numeroFacturaNormalizado", (q) =>
            q
              .eq("empresa", normalizeEmpresa(nota.empresa))
              .eq("numeroFacturaNormalizado", doc.numeroNormalizado)
          )
          .collect();
        for (const match of matches) {
          if (isFacturaPeajesRelacion(match)) {
            facturasArchivoIds.add(String(match._id));
          }
        }
      }
      facturasConOtraDiferenciaCritica = new Set();
    }

    const elegibilidad = await evaluarElegibilidadReasignacion(ctx, {
      nota,
      facturaNueva,
      facturaAnterior: efectiva.factura,
      modo,
      facturasArchivoIds,
      facturasConOtraDiferenciaCritica,
    });
    if (!elegibilidad.ok) {
      throw new Error(`BLOQUEADO:${elegibilidad.mensaje}`);
    }

    const notasAnterior = efectiva.factura
      ? await listNotasCreditoRelacionadasAFactura(ctx, efectiva.factura, {
          incluirPeajes: modo === "peajes",
          soloPeajes: modo === "peajes",
        })
      : [];
    const snapshotAnteriorAntes = efectiva.factura
      ? buildSnapshotMonetario({
          factura: efectiva.factura,
          notasCredito: notasAnterior,
        })
      : null;
    const snapshotAnteriorDespues = efectiva.factura
      ? buildSnapshotMonetario({
          factura: efectiva.factura,
          notasCredito: notasAnterior.filter(
            (item) => String(item._id) !== String(nota._id)
          ),
        })
      : null;

    const notasNueva = await listNotasCreditoRelacionadasAFactura(
      ctx,
      facturaNueva,
      {
        incluirPeajes: modo === "peajes",
        soloPeajes: modo === "peajes",
      }
    );
    const snapshotNuevaAntes = buildSnapshotMonetario({
      factura: facturaNueva,
      notasCredito: notasNueva.filter(
        (item) => String(item._id) !== String(nota._id)
      ),
    });
    const snapshotNuevaDespues = buildSnapshotMonetario({
      factura: facturaNueva,
      notasCredito: [
        ...notasNueva.filter((item) => String(item._id) !== String(nota._id)),
        nota,
      ],
    });

    const now = Date.now();
    const historialId = await ctx.db.insert(
      "facturacionNotaCreditoRelacionHistorial",
      {
        empresa: normalizeEmpresa(nota.empresa),
        notaCreditoId: nota._id,
        notaCreditoNumero: nota.numeroFactura,
        notaCreditoTotal: getValorNotaCredito(nota),
        notaCreditoMoneda: nota.moneda,
        notaCreditoFechaEmision: nota.fechaEmision,
        notaCreditoProveedorNit: nota.proveedorNit,
        notaCreditoProveedorNombre: nota.proveedorNombre,
        referenciaXml: nota.referenciaDocumento,
        referenciaXmlNormalizada:
          nota.referenciaDocumentoNormalizado ??
          normalizePeajesDocumentNumber(nota.referenciaDocumento),
        facturaAnteriorId: efectiva.factura?._id,
        facturaAnteriorNumero: efectiva.factura?.numeroFactura,
        facturaNuevaId: facturaNueva._id,
        facturaNuevaNumero: facturaNueva.numeroFactura,
        origenRelacionAnterior: efectiva.origen,
        origenRelacionNueva: "manual",
        contexto:
          args.contexto.tipo === "conciliacion_peajes"
            ? "conciliacion_peajes"
            : "detalle_factura",
        archivoNombrePeajes:
          args.contexto.tipo === "conciliacion_peajes"
            ? args.contexto.archivoNombre
            : undefined,
        motivo,
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: normalizeEmail(args.actorEmail),
        creadoEn: now,
        snapshotFacturaAnterior:
          snapshotAnteriorAntes && snapshotAnteriorDespues
            ? {
                valorBase: snapshotAnteriorAntes.valorBase,
                totalNotasCreditoAntes: snapshotAnteriorAntes.totalNotasCredito,
                netoAntes: snapshotAnteriorAntes.neto,
                totalNotasCreditoDespues:
                  snapshotAnteriorDespues.totalNotasCredito,
                netoDespues: snapshotAnteriorDespues.neto,
                usaValorXmlComoBase: snapshotAnteriorAntes.usaValorXmlComoBase,
              }
            : undefined,
        snapshotFacturaNueva: {
          valorBase: snapshotNuevaAntes.valorBase,
          totalNotasCreditoAntes: snapshotNuevaAntes.totalNotasCredito,
          netoAntes: snapshotNuevaAntes.neto,
          totalNotasCreditoDespues: snapshotNuevaDespues.totalNotasCredito,
          netoDespues: snapshotNuevaDespues.neto,
          usaValorXmlComoBase: snapshotNuevaAntes.usaValorXmlComoBase,
        },
      }
    );

    // Preserve XML reference fields — never overwrite them.
    await ctx.db.patch("facturacionFacturas", nota._id, {
      facturaRelacionadaId: facturaNueva._id,
      relacionDocumentoOrigen: "manual",
      relacionDocumentoAuditadaPorUserId: args.actorUserId,
      relacionDocumentoAuditadaPorNombre: args.actorNombre,
      relacionDocumentoAuditadaPorEmail: normalizeEmail(args.actorEmail),
      relacionDocumentoAuditadaEn: now,
      relacionDocumentoComentario: motivo,
      actualizadoEn: now,
    });

    const documentosAfectados = [
      nota._id,
      ...(efectiva.factura ? [efectiva.factura._id] : []),
      facturaNueva._id,
    ];
    for (const documentoId of documentosAfectados) {
      await ctx.db.patch("facturacionFacturas", documentoId, { actualizadoEn: now });
      await refrescarProyeccionFactura(ctx, documentoId, now);
    }

    const cambioPayload = {
      historialId,
      notaCreditoId: nota._id,
      notaCreditoNumero: nota.numeroFactura,
      notaCreditoTotal: getValorNotaCredito(nota),
      facturaAnteriorId: efectiva.factura?._id,
      facturaAnteriorNumero: efectiva.factura?.numeroFactura,
      facturaNuevaId: facturaNueva._id,
      facturaNuevaNumero: facturaNueva.numeroFactura,
      contexto:
        args.contexto.tipo === "conciliacion_peajes"
          ? ("conciliacion_peajes" as const)
          : ("detalle_factura" as const),
      origenRelacionAnterior: efectiva.origen,
    };

    for (const documentoId of documentosAfectados) {
      const tarea = await ctx.db
        .query("facturacionTareas")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", documentoId))
        .unique();
      if (!tarea) continue;
      await ctx.db.insert("facturacionAprobaciones", {
        tareaId: tarea._id,
        facturaId: documentoId,
        empresa: normalizeEmpresa(nota.empresa),
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: normalizeEmail(args.actorEmail),
        accion: "reasignar_nota_credito",
        comentario: motivo,
        notaCreditoRelacionCambio: cambioPayload,
        estadoAnterior: tarea.estado,
        estadoNuevo: tarea.estado,
        creadoEn: now,
      });
    }

    return {
      historialId: String(historialId),
      notaCreditoId: String(nota._id),
      notaCreditoNumero: nota.numeroFactura,
      facturaAnteriorId: efectiva.factura ? String(efectiva.factura._id) : null,
      facturaAnteriorNumero: efectiva.factura?.numeroFactura,
      facturaNuevaId: String(facturaNueva._id),
      facturaNuevaNumero: facturaNueva.numeroFactura,
      creadoEn: now,
      valorBaseFacturaNueva: getValorBaseFactura(facturaNueva),
    };
}

export const reasignarNotaCreditoDesdeServidor = mutation({
  args: {
    secret: v.string(),
    ...reasignacionBaseArgs,
    contexto: contextoValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const { secret: _secret, ...rest } = args;
    return await aplicarReasignacionNotaCredito(ctx, rest);
  },
});
