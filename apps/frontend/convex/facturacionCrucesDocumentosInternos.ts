import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { reducirAnticiposPorExcesoBase } from "./lib/ajustarAnticiposPorBaseCruce";
import {
  buildComentarioAutomaticoCruceDocumentoInterno,
  buildResumenContableCruce,
  fasePermiteCruceDocumentoInterno,
  validateNumeroDocumentoInterno,
  validateValorAplicadoDocumentoInterno,
} from "./lib/crucesDocumentosInternos";
import { sessionMatchesAsignacion } from "./lib/facturacionAnticipoDueno";
import { refrescarProyeccionFactura } from "./lib/facturacionDashboardProjection";
import {
  buildResumenContableFactura,
  getPagosAplicadosFromAprobaciones,
  sumarDocumentosInternosActivos,
  validarYRecalcularValorAPagarTrasCambioObligacion,
} from "./lib/valorAPagar";
import { getValorContable } from "./lib/valorContable";
import { requireServerSecret } from "./lib/auth";
import { actorPuedeVerEmpresa, requirePermisoEmpresa } from "./lib/billingAuth";
import { facturaVisibleParaActor } from "./lib/facturacionAccess";
import { RUTAS_SISTEMA } from "../lib/rutas-sistema";
import { normalizeEmail, normalizeEmpresa } from "./lib/normalize";

const CRUCES_PAGE_CAP = 50;

const resumenContableValidator = v.object({
  valorContable: v.number(),
  valorDocumentosInternos: v.number(),
  pagosAplicados: v.number(),
  baseCruceAnticipos: v.number(),
  valorAnticiposAplicados: v.number(),
  valorAPagar: v.number(),
  moneda: v.string(),
});

const documentoInternoValidator = v.object({
  _id: v.id("facturacionCrucesDocumentosInternos"),
  _creationTime: v.number(),
  facturaId: v.id("facturacionFacturas"),
  empresa: v.number(),
  numeroDocumento: v.string(),
  numeroDocumentoNormalizado: v.string(),
  valorAplicado: v.number(),
  moneda: v.string(),
  estado: v.union(v.literal("activo"), v.literal("retirado")),
  actorUserId: v.optional(v.string()),
  actorNombre: v.string(),
  actorEmail: v.string(),
  comentario: v.optional(v.string()),
  actualizadoPorUserId: v.optional(v.string()),
  actualizadoPorNombre: v.optional(v.string()),
  actualizadoPorEmail: v.optional(v.string()),
  actualizadoComentario: v.optional(v.string()),
  creadoEn: v.number(),
  actualizadoEn: v.number(),
});

function isFacturaPeajes(factura: Doc<"facturacionFacturas">) {
  return Boolean(factura.esPeaje || factura.rolOperacion === "PEAJES");
}

function isNotaCreditoDebito(factura: Doc<"facturacionFacturas">) {
  return (
    factura.documentoClase === "nota_credito" ||
    factura.documentoClase === "nota_debito" ||
    factura.tipoDocumentoNormalizado === "91" ||
    factura.tipoDocumentoNormalizado === "92" ||
    factura.tipoDocumento === "91" ||
    factura.tipoDocumento === "92"
  );
}

function assertFacturaElegibleCruceDocumentoInterno(factura: Doc<"facturacionFacturas">) {
  if (isFacturaPeajes(factura)) {
    throw new Error("Las facturas PEAJES no admiten cruces con documentos internos.");
  }
  if (isNotaCreditoDebito(factura)) {
    throw new Error("Las notas crédito/débito no admiten cruces con documentos internos.");
  }
  if (factura.esLegalizacionCajaMenor) {
    throw new Error("Las facturas de Caja Menor no admiten cruces con documentos internos.");
  }
}

function isEstadoTerminalFacturacion(estado: string) {
  return [
    "pagada",
    "legalizada",
    "rechazada",
    "rechazada_dian",
    "cerrada",
    "nota_credito_cerrada",
  ].includes(estado);
}

async function resolverAccesoCruceDocumentoInterno(
  ctx: MutationCtx | QueryCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    asignacionId?: Id<"facturacionAsignaciones">;
    actorUserId: string;
    actorEmail: string;
    requireWrite?: boolean;
  }
) {
  const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
  if (!factura) throw new Error("Factura no encontrada.");
  assertFacturaElegibleCruceDocumentoInterno(factura);

  const tarea = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
    .unique();
  if (!tarea) throw new Error("Tarea de facturación no encontrada.");
  if (isEstadoTerminalFacturacion(tarea.estado)) {
    throw new Error("La factura ya está cerrada.");
  }

  const fase = tarea.estado;
  if (!fasePermiteCruceDocumentoInterno(fase)) {
    throw new Error(
      "Los cruces con documentos internos sólo se gestionan en recepción, líder, causación, contabilidad, eventos DIAN, gerencia o tesorería."
    );
  }

  const asignacion = args.asignacionId
    ? await ctx.db.get("facturacionAsignaciones", args.asignacionId)
    : tarea.currentAsignacionId
      ? await ctx.db.get("facturacionAsignaciones", tarea.currentAsignacionId)
      : null;

  if (!asignacion) {
    throw new Error("No hay una asignación activa para esta factura.");
  }

  const asignacionValida =
    asignacion.facturaId === args.facturaId &&
    asignacion.tareaId === tarea._id &&
    asignacion.estado === "pendiente" &&
    asignacion.fase === fase &&
    asignacion.fase === tarea.estado;

  if (!asignacionValida) {
    throw new Error("La asignación ya no está activa o no coincide con la fase actual.");
  }

  const esAsignado = sessionMatchesAsignacion({
    sessionUserId: args.actorUserId,
    sessionEmail: args.actorEmail,
    asignacion,
  });
  if (!esAsignado) {
    throw new Error("Sólo el usuario asignado activo puede gestionar los cruces internos.");
  }

  return { factura, tarea, asignacion, fase, puedeEditar: true };
}

async function registrarAuditoriaCruceDocumentoInterno(
  ctx: MutationCtx,
  args: {
    tareaId: Id<"facturacionTareas">;
    facturaId: Id<"facturacionFacturas">;
    asignacionId: Id<"facturacionAsignaciones">;
    empresa?: number;
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
    accion:
      | "agregar_cruce_documento_interno"
      | "editar_cruce_documento_interno"
      | "retirar_cruce_documento_interno";
    operacion: "agregar" | "editar" | "retirar";
    cruceId: Id<"facturacionCrucesDocumentosInternos">;
    comentario: string;
    estadoTarea: string;
    anterior?: { numeroDocumento: string; valorAplicado: number };
    nuevo?: { numeroDocumento: string; valorAplicado: number };
    resumenContable: ReturnType<typeof buildResumenContableCruce>;
    now: number;
  }
) {
  await ctx.db.insert("facturacionAprobaciones", {
    tareaId: args.tareaId,
    facturaId: args.facturaId,
    asignacionId: args.asignacionId,
    empresa: normalizeEmpresa(args.empresa, 0),
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: normalizeEmail(args.actorEmail),
    accion: args.accion,
    comentario: args.comentario,
    cruceDocumentoInternoCambio: {
      operacion: args.operacion,
      cruceId: args.cruceId,
      ...(args.anterior ? { anterior: args.anterior } : {}),
      ...(args.nuevo ? { nuevo: args.nuevo } : {}),
      resumenContable: args.resumenContable,
    },
    estadoAnterior: args.estadoTarea,
    estadoNuevo: args.estadoTarea,
    creadoEn: args.now,
  });
}

async function assertNumeroDocumentoUnicoActivo(
  ctx: MutationCtx | QueryCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    numeroDocumentoNormalizado: string;
    excludeCruceId?: Id<"facturacionCrucesDocumentosInternos">;
  }
) {
  const existing = await ctx.db
    .query("facturacionCrucesDocumentosInternos")
    .withIndex("by_facturaId_numeroDocumentoNormalizado", (q) =>
      q
        .eq("facturaId", args.facturaId)
        .eq("numeroDocumentoNormalizado", args.numeroDocumentoNormalizado)
    )
    .collect();

  const duplicate = existing.find(
    (row) =>
      row.estado === "activo" &&
      (!args.excludeCruceId || String(row._id) !== String(args.excludeCruceId))
  );
  if (duplicate) {
    throw new Error("Ya existe un documento interno activo con ese número en esta factura.");
  }
}

async function validarCapacidadDocumentosInternos(
  ctx: MutationCtx | QueryCtx,
  factura: Doc<"facturacionFacturas">,
  nuevoTotalDocumentos: number
) {
  const aprobaciones = await ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
    .collect();
  const pagosAplicados = getPagosAplicadosFromAprobaciones(aprobaciones);
  const valorContable = getValorContable(factura);
  if (nuevoTotalDocumentos + pagosAplicados > valorContable + 0.001) {
    throw new Error("La suma de documentos internos y pagos no puede superar el valor contable.");
  }
  return { pagosAplicados, valorContable };
}

async function postCambioCruceDocumentoInterno(
  ctx: MutationCtx,
  args: {
    factura: Doc<"facturacionFacturas">;
    actorUserId: string;
    comentario?: string;
    now: number;
  }
) {
  const resumenAntesAjuste = await buildResumenContableFactura(ctx, args.factura);
  await reducirAnticiposPorExcesoBase(ctx, {
    factura: args.factura,
    baseCruceAnticipos: resumenAntesAjuste.baseCruceAnticipos,
    actorUserId: args.actorUserId,
    now: args.now,
    comentario: args.comentario,
  });
  await validarYRecalcularValorAPagarTrasCambioObligacion(ctx, args.factura, args.now);
  await refrescarProyeccionFactura(ctx, args.factura._id, args.now);
  return await buildResumenContableFactura(ctx, args.factura);
}

async function obtenerResumenCrucesInternosDesdeServidorHandler(
  ctx: MutationCtx | QueryCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    asignacionId?: Id<"facturacionAsignaciones">;
    actorUserId: string;
    actorEmail: string;
    paginationOpts: { numItems: number; cursor: string | null };
  }
) {
  const acceso = await resolverAccesoCruceDocumentoInterno(ctx, {
    facturaId: args.facturaId,
    asignacionId: args.asignacionId,
    actorUserId: args.actorUserId,
    actorEmail: args.actorEmail,
  });

  const paginationOpts = {
    ...args.paginationOpts,
    numItems: Math.min(args.paginationOpts.numItems, CRUCES_PAGE_CAP),
  };

  const documentosPage = await ctx.db
    .query("facturacionCrucesDocumentosInternos")
    .withIndex("by_facturaId_estado", (q) =>
      q.eq("facturaId", args.facturaId).eq("estado", "activo")
    )
    .order("desc")
    .paginate(paginationOpts);
  const { page, isDone, continueCursor, splitCursor } = documentosPage;

  const resumen = await buildResumenContableFactura(ctx, acceso.factura);
  const documentosInternos = await sumarDocumentosInternosActivos(ctx, args.facturaId);

  return {
    empresa: normalizeEmpresa(acceso.factura.empresa, 0),
    resumen,
    documentos: {
      page,
      isDone,
      continueCursor,
      splitCursor,
    },
    totales: {
      cantidad: documentosInternos.count,
      valorAplicado: documentosInternos.total,
    },
    puedeEditar: acceso.puedeEditar,
    fase: acceso.fase,
  };
}

export const obtenerResumenCrucesInternosDesdeServidor = query({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    asignacionId: v.optional(v.id("facturacionAsignaciones")),
    actorUserId: v.string(),
    actorEmail: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    empresa: v.number(),
    resumen: resumenContableValidator,
    documentos: paginationResultValidator(documentoInternoValidator),
    totales: v.object({
      cantidad: v.number(),
      valorAplicado: v.number(),
    }),
    puedeEditar: v.boolean(),
    fase: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    return await obtenerResumenCrucesInternosDesdeServidorHandler(ctx, args);
  },
});

export const agregarCruceDocumentoInternoDesdeServidor = mutation({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    asignacionId: v.id("facturacionAsignaciones"),
    actorUserId: v.string(),
    actorNombre: v.string(),
    actorEmail: v.string(),
    numeroDocumento: v.string(),
    valorAplicado: v.number(),
    comentario: v.optional(v.string()),
  },
  returns: v.object({
    cruceId: v.id("facturacionCrucesDocumentosInternos"),
    resumen: resumenContableValidator,
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const acceso = await resolverAccesoCruceDocumentoInterno(ctx, {
      facturaId: args.facturaId,
      asignacionId: args.asignacionId,
      actorUserId: args.actorUserId,
      actorEmail: args.actorEmail,
      requireWrite: true,
    });

    const { numeroDocumento, numeroDocumentoNormalizado } = validateNumeroDocumentoInterno(
      args.numeroDocumento
    );
    const valorAplicado = validateValorAplicadoDocumentoInterno(args.valorAplicado);
    await assertNumeroDocumentoUnicoActivo(ctx, {
      facturaId: args.facturaId,
      numeroDocumentoNormalizado,
    });

    const documentosActuales = await sumarDocumentosInternosActivos(ctx, args.facturaId);
    await validarCapacidadDocumentosInternos(
      ctx,
      acceso.factura,
      documentosActuales.total + valorAplicado
    );

    const now = Date.now();
    const cruceId = await ctx.db.insert("facturacionCrucesDocumentosInternos", {
      facturaId: args.facturaId,
      empresa: normalizeEmpresa(acceso.factura.empresa, 0),
      numeroDocumento,
      numeroDocumentoNormalizado,
      valorAplicado,
      moneda: acceso.factura.moneda,
      estado: "activo",
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: normalizeEmail(args.actorEmail),
      comentario: args.comentario?.trim() || undefined,
      creadoEn: now,
      actualizadoEn: now,
    });

    const resumen = await postCambioCruceDocumentoInterno(ctx, {
      factura: acceso.factura,
      actorUserId: args.actorUserId,
      comentario: args.comentario,
      now,
    });

    const comentarioAuditoria =
      args.comentario?.trim() ||
      buildComentarioAutomaticoCruceDocumentoInterno({
        operacion: "agregar",
        numeroDocumento,
        valorAplicado,
      });

    await registrarAuditoriaCruceDocumentoInterno(ctx, {
      tareaId: acceso.tarea._id,
      facturaId: args.facturaId,
      asignacionId: args.asignacionId,
      empresa: acceso.tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "agregar_cruce_documento_interno",
      operacion: "agregar",
      cruceId,
      comentario: comentarioAuditoria,
      estadoTarea: acceso.tarea.estado,
      nuevo: { numeroDocumento, valorAplicado },
      resumenContable: resumen,
      now,
    });

    return { cruceId, resumen };
  },
});

export const editarCruceDocumentoInternoDesdeServidor = mutation({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    asignacionId: v.id("facturacionAsignaciones"),
    cruceId: v.id("facturacionCrucesDocumentosInternos"),
    expectedActualizadoEn: v.number(),
    actorUserId: v.string(),
    actorNombre: v.string(),
    actorEmail: v.string(),
    numeroDocumento: v.string(),
    valorAplicado: v.number(),
    comentario: v.optional(v.string()),
  },
  returns: v.object({
    resumen: resumenContableValidator,
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const acceso = await resolverAccesoCruceDocumentoInterno(ctx, {
      facturaId: args.facturaId,
      asignacionId: args.asignacionId,
      actorUserId: args.actorUserId,
      actorEmail: args.actorEmail,
      requireWrite: true,
    });

    const cruce = await ctx.db.get("facturacionCrucesDocumentosInternos", args.cruceId);
    if (!cruce || cruce.facturaId !== args.facturaId) {
      throw new Error("Documento interno no encontrado.");
    }
    if (cruce.estado !== "activo") {
      throw new Error("El documento interno ya no está activo.");
    }
    if (cruce.actualizadoEn !== args.expectedActualizadoEn) {
      throw new Error("El documento interno cambió. Recarga la información e intenta de nuevo.");
    }

    const { numeroDocumento, numeroDocumentoNormalizado } = validateNumeroDocumentoInterno(
      args.numeroDocumento
    );
    const valorAplicado = validateValorAplicadoDocumentoInterno(args.valorAplicado);
    await assertNumeroDocumentoUnicoActivo(ctx, {
      facturaId: args.facturaId,
      numeroDocumentoNormalizado,
      excludeCruceId: args.cruceId,
    });

    const documentosActuales = await sumarDocumentosInternosActivos(ctx, args.facturaId);
    const nuevoTotal = documentosActuales.total - cruce.valorAplicado + valorAplicado;
    await validarCapacidadDocumentosInternos(ctx, acceso.factura, nuevoTotal);

    const anterior = {
      numeroDocumento: cruce.numeroDocumento,
      valorAplicado: cruce.valorAplicado,
    };
    const now = Date.now();

    await ctx.db.patch("facturacionCrucesDocumentosInternos", args.cruceId, {
      numeroDocumento,
      numeroDocumentoNormalizado,
      valorAplicado,
      actualizadoPorUserId: args.actorUserId,
      actualizadoPorNombre: args.actorNombre,
      actualizadoPorEmail: normalizeEmail(args.actorEmail),
      actualizadoComentario: args.comentario?.trim() || undefined,
      actualizadoEn: now,
    });

    const resumen = await postCambioCruceDocumentoInterno(ctx, {
      factura: acceso.factura,
      actorUserId: args.actorUserId,
      comentario: args.comentario,
      now,
    });

    const comentarioAuditoria =
      args.comentario?.trim() ||
      buildComentarioAutomaticoCruceDocumentoInterno({
        operacion: "editar",
        numeroDocumento,
        valorAplicado,
        valorAnterior: anterior.valorAplicado,
      });

    await registrarAuditoriaCruceDocumentoInterno(ctx, {
      tareaId: acceso.tarea._id,
      facturaId: args.facturaId,
      asignacionId: args.asignacionId,
      empresa: acceso.tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "editar_cruce_documento_interno",
      operacion: "editar",
      cruceId: args.cruceId,
      comentario: comentarioAuditoria,
      estadoTarea: acceso.tarea.estado,
      anterior,
      nuevo: { numeroDocumento, valorAplicado },
      resumenContable: resumen,
      now,
    });

    return { resumen };
  },
});

export const retirarCruceDocumentoInternoDesdeServidor = mutation({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    asignacionId: v.id("facturacionAsignaciones"),
    cruceId: v.id("facturacionCrucesDocumentosInternos"),
    expectedActualizadoEn: v.number(),
    actorUserId: v.string(),
    actorNombre: v.string(),
    actorEmail: v.string(),
    comentario: v.optional(v.string()),
  },
  returns: v.object({
    resumen: resumenContableValidator,
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const acceso = await resolverAccesoCruceDocumentoInterno(ctx, {
      facturaId: args.facturaId,
      asignacionId: args.asignacionId,
      actorUserId: args.actorUserId,
      actorEmail: args.actorEmail,
      requireWrite: true,
    });

    const cruce = await ctx.db.get("facturacionCrucesDocumentosInternos", args.cruceId);
    if (!cruce || cruce.facturaId !== args.facturaId) {
      throw new Error("Documento interno no encontrado.");
    }
    if (cruce.estado !== "activo") {
      throw new Error("El documento interno ya no está activo.");
    }
    if (cruce.actualizadoEn !== args.expectedActualizadoEn) {
      throw new Error("El documento interno cambió. Recarga la información e intenta de nuevo.");
    }

    const anterior = {
      numeroDocumento: cruce.numeroDocumento,
      valorAplicado: cruce.valorAplicado,
    };
    const now = Date.now();

    await ctx.db.patch("facturacionCrucesDocumentosInternos", args.cruceId, {
      estado: "retirado",
      actualizadoPorUserId: args.actorUserId,
      actualizadoPorNombre: args.actorNombre,
      actualizadoPorEmail: normalizeEmail(args.actorEmail),
      actualizadoComentario: args.comentario?.trim() || undefined,
      actualizadoEn: now,
    });

    const resumen = await postCambioCruceDocumentoInterno(ctx, {
      factura: acceso.factura,
      actorUserId: args.actorUserId,
      comentario: args.comentario,
      now,
    });

    const comentarioAuditoria =
      args.comentario?.trim() ||
      buildComentarioAutomaticoCruceDocumentoInterno({
        operacion: "retirar",
        numeroDocumento: cruce.numeroDocumento,
        valorAnterior: cruce.valorAplicado,
      });

    await registrarAuditoriaCruceDocumentoInterno(ctx, {
      tareaId: acceso.tarea._id,
      facturaId: args.facturaId,
      asignacionId: args.asignacionId,
      empresa: acceso.tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "retirar_cruce_documento_interno",
      operacion: "retirar",
      cruceId: args.cruceId,
      comentario: comentarioAuditoria,
      estadoTarea: acceso.tarea.estado,
      anterior,
      resumenContable: resumen,
      now,
    });

    return { resumen };
  },
});

export const listarCrucesInternosActivosPorFactura = query({
  args: {
    facturaId: v.id("facturacionFacturas"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(documentoInternoValidator),
  handler: async (ctx, args) => {
    if (!(await facturaVisibleParaActor(ctx, args.facturaId))) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, CRUCES_PAGE_CAP),
    };
    return await ctx.db
      .query("facturacionCrucesDocumentosInternos")
      .withIndex("by_facturaId_estado", (q) =>
        q.eq("facturaId", args.facturaId).eq("estado", "activo")
      )
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const listarHistorialCrucesInternosFactura = query({
  args: {
    facturaId: v.id("facturacionFacturas"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("facturacionAprobaciones"),
      accion: v.union(
        v.literal("agregar_cruce_documento_interno"),
        v.literal("editar_cruce_documento_interno"),
        v.literal("retirar_cruce_documento_interno")
      ),
      comentario: v.string(),
      actorNombre: v.optional(v.string()),
      actorEmail: v.optional(v.string()),
      creadoEn: v.number(),
      cruceDocumentoInternoCambio: v.optional(
        v.object({
          operacion: v.union(v.literal("agregar"), v.literal("editar"), v.literal("retirar")),
          cruceId: v.id("facturacionCrucesDocumentosInternos"),
          anterior: v.optional(
            v.object({
              numeroDocumento: v.string(),
              valorAplicado: v.number(),
            })
          ),
          nuevo: v.optional(
            v.object({
              numeroDocumento: v.string(),
              valorAplicado: v.number(),
            })
          ),
          resumenContable: resumenContableValidator,
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, CRUCES_PAGE_CAP),
    };
    if (!(await facturaVisibleParaActor(ctx, args.facturaId))) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const all = await ctx.db
      .query("facturacionAprobaciones")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .order("desc")
      .paginate(paginationOpts);

    return {
      ...all,
      page: all.page
        .filter((row) =>
          [
            "agregar_cruce_documento_interno",
            "editar_cruce_documento_interno",
            "retirar_cruce_documento_interno",
          ].includes(row.accion)
        )
        .map((row) => ({
          _id: row._id,
          accion: row.accion as
            | "agregar_cruce_documento_interno"
            | "editar_cruce_documento_interno"
            | "retirar_cruce_documento_interno",
          comentario: row.comentario,
          actorNombre: row.actorNombre,
          actorEmail: row.actorEmail,
          creadoEn: row.creadoEn,
          cruceDocumentoInternoCambio: row.cruceDocumentoInternoCambio,
        })),
    };
  },
});

export const listarCrucesInternosActivosParaExportacion = query({
  args: {
    facturaIds: v.array(v.id("facturacionFacturas")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        cruce: documentoInternoValidator,
        factura: v.object({
          _id: v.id("facturacionFacturas"),
          numeroFactura: v.string(),
          proveedorNombre: v.string(),
          empresa: v.number(),
        }),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, CRUCES_PAGE_CAP),
    };

    const results: Array<{
      cruce: Doc<"facturacionCrucesDocumentosInternos">;
      factura: {
        _id: Id<"facturacionFacturas">;
        numeroFactura: string;
        proveedorNombre: string;
        empresa: number;
      };
    }> = [];

    // Invoice list export: invoices permission, only the caller's companies.
    const actor = await requirePermisoEmpresa(ctx, RUTAS_SISTEMA.FACTURACION_FACTURAS);
    for (const facturaId of args.facturaIds) {
      const factura = await ctx.db.get("facturacionFacturas", facturaId);
      if (!factura || !actorPuedeVerEmpresa(actor, normalizeEmpresa(factura.empresa))) continue;
      const cruces = await ctx.db
        .query("facturacionCrucesDocumentosInternos")
        .withIndex("by_facturaId_estado", (q) =>
          q.eq("facturaId", facturaId).eq("estado", "activo")
        )
        .collect();
      for (const cruce of cruces) {
        results.push({
          cruce,
          factura: {
            _id: factura._id,
            numeroFactura: factura.numeroFactura,
            proveedorNombre: factura.proveedorNombre,
            empresa: normalizeEmpresa(factura.empresa, 0),
          },
        });
      }
    }

    const start = args.paginationOpts.cursor ? Number.parseInt(args.paginationOpts.cursor, 10) : 0;
    const end = start + paginationOpts.numItems;
    const page = results.slice(start, end);

    return {
      page,
      isDone: end >= results.length,
      continueCursor: String(end),
    };
  },
});
