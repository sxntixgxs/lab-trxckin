import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import {
  type CausacionContextoTipo,
  type CausacionMotivoSoloLectura,
  deriveCausacionEstado,
  getCausacionVersion,
  normalizeNumeroFp,
  puedeEditarCausacionFlujo,
  puedeEditarCausacionReembolso,
  resolveCausacionTransition,
} from "./lib/facturacionCausacion";
import { refrescarProyeccionFactura } from "./lib/facturacionDashboardProjection";
import { requireServerSecret } from "./lib/auth";
import { normalizeEmpresa } from "./lib/normalize";

const HISTORIAL_PAGE_SIZE = 20;

function causacionError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

const contextoFlujoValidator = v.object({ tipo: v.literal("flujo_factura") });
const contextoReembolsoValidator = v.object({
  tipo: v.literal("reembolso_caja_menor"),
  reembolsoId: v.id("cajasMenoresReembolsos"),
  movimientoId: v.id("facturacionCajaMenorMovimientos"),
});
const contextoValidator = v.union(contextoFlujoValidator, contextoReembolsoValidator);

const actorValidator = v.object({
  userId: v.string(),
  nombre: v.string(),
  email: v.string(),
});

const causacionAuditEventValidator = v.object({
  id: v.id("facturacionAprobaciones"),
  creadoEn: v.number(),
  actorUserId: v.union(v.string(), v.null()),
  actorNombre: v.union(v.string(), v.null()),
  actorEmail: v.union(v.string(), v.null()),
  comentario: v.string(),
  causacionCambio: v.union(
    v.object({
      causadoAnterior: v.union(v.boolean(), v.null()),
      causadoNuevo: v.boolean(),
      numeroFpAnterior: v.union(v.string(), v.null()),
      numeroFpNuevo: v.union(v.string(), v.null()),
      motivoCambio: v.union(v.string(), v.null()),
      versionAnterior: v.number(),
      versionNueva: v.number(),
      contexto: v.union(v.literal("flujo_factura"), v.literal("reembolso_caja_menor")),
      faseOperativa: v.string(),
      reembolsoId: v.optional(v.id("cajasMenoresReembolsos")),
      movimientoId: v.optional(v.id("facturacionCajaMenorMovimientos")),
    }),
    v.null()
  ),
});

const causacionSnapshotValidator = v.object({
  facturaId: v.id("facturacionFacturas"),
  estado: v.union(v.literal("sin_registro"), v.literal("causado"), v.literal("no_causado")),
  causado: v.union(v.boolean(), v.null()),
  numeroFp: v.union(v.string(), v.null()),
  version: v.number(),
  actualizadoEn: v.union(v.number(), v.null()),
  actualizadoPor: v.union(
    v.object({
      userId: v.union(v.string(), v.null()),
      nombre: v.string(),
      email: v.string(),
    }),
    v.null()
  ),
  faseOperativa: v.union(v.string(), v.null()),
  puedeEditar: v.boolean(),
  motivoSoloLectura: v.union(
    v.literal("fase_no_habilitada"),
    v.literal("no_asignado"),
    v.literal("sin_workflow"),
    v.literal("peajes_solo_consulta"),
    v.null()
  ),
  historial: v.object({
    page: v.array(causacionAuditEventValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
});

async function resolverAsignacionPendienteCanonica(
  ctx: QueryCtx | MutationCtx,
  tarea: Doc<"facturacionTareas">
) {
  const asignaciones = await ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_tareaId", (q) => q.eq("tareaId", tarea._id))
    .collect();

  const pendientes = asignaciones.filter(
    (asignacion) =>
      asignacion.estado === "pendiente" &&
      asignacion.fase === tarea.estado &&
      (!tarea.grupoAsignacionActualId || asignacion.grupoId === tarea.grupoAsignacionActualId)
  );

  if (tarea.currentAsignacionId) {
    const current = asignaciones.find((row) => row._id === tarea.currentAsignacionId);
    if (current && current.estado === "pendiente" && current.fase === tarea.estado) {
      return current;
    }
  }

  return [...pendientes].sort((left, right) => left.creadoEn - right.creadoEn)[0] ?? null;
}

function buildSnapshotFromFactura(factura: Doc<"facturacionFacturas">) {
  return {
    estado: deriveCausacionEstado(factura.causado),
    causado: factura.causado === undefined ? null : factura.causado,
    numeroFp: factura.causado === true ? (factura.numeroFp ?? null) : null,
    version: getCausacionVersion(factura),
    actualizadoEn: factura.causacionActualizadaEn ?? null,
    actualizadoPor:
      factura.causacionActualizadaEn != null
        ? {
            userId: factura.causacionActualizadaPorUserId ?? null,
            nombre: factura.causacionActualizadaPorNombre ?? "—",
            email: factura.causacionActualizadaPorEmail ?? "—",
          }
        : null,
  };
}

async function listarHistorialCausacion(
  ctx: QueryCtx,
  facturaId: Id<"facturacionFacturas">,
  cursor?: string | null
) {
  const events: Array<{
    id: Id<"facturacionAprobaciones">;
    creadoEn: number;
    actorUserId: string | null;
    actorNombre: string | null;
    actorEmail: string | null;
    comentario: string;
    causacionCambio: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]> | null;
  }> = [];

  let sourceCursor: string | null = cursor ?? null;
  let isDone = false;
  const maxScans = 25;
  let scans = 0;

  while (events.length < HISTORIAL_PAGE_SIZE && !isDone && scans < maxScans) {
    scans += 1;
    const batch = await ctx.db
      .query("facturacionAprobaciones")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
      .order("desc")
      .paginate({ numItems: 50, cursor: sourceCursor });

    for (const row of batch.page) {
      // Workflow decisions carry causation in the same approval movement;
      // legacy direct edits use the standalone action.
      if (!row.causacionCambio && row.accion !== "actualizar_causacion") continue;
      events.push({
        id: row._id,
        creadoEn: row.creadoEn,
        actorUserId: row.actorUserId ?? null,
        actorNombre: row.actorNombre ?? null,
        actorEmail: row.actorEmail ?? null,
        comentario: row.comentario,
        causacionCambio: row.causacionCambio ?? null,
      });
      if (events.length >= HISTORIAL_PAGE_SIZE) break;
    }

    if (events.length >= HISTORIAL_PAGE_SIZE) {
      return {
        page: events,
        isDone: false,
        continueCursor: batch.continueCursor || null,
      };
    }

    isDone = batch.isDone;
    sourceCursor = batch.continueCursor || null;
    if (isDone) break;
  }

  return {
    page: events,
    isDone,
    continueCursor: isDone ? null : sourceCursor,
  };
}

async function resolverPermisoEdicion(args: {
  ctx: QueryCtx | MutationCtx;
  factura: Doc<"facturacionFacturas">;
  actorUserId: string;
  contexto: {
    tipo: CausacionContextoTipo;
    reembolsoId?: Id<"cajasMenoresReembolsos">;
    movimientoId?: Id<"facturacionCajaMenorMovimientos">;
  };
  forWrite: boolean;
}): Promise<{
  puedeEditar: boolean;
  motivoSoloLectura: CausacionMotivoSoloLectura | null;
  faseOperativa: string | null;
  tarea: Doc<"facturacionTareas"> | null;
  asignacionId: Id<"facturacionAsignaciones"> | null;
}> {
  const tarea = await args.ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.factura._id))
    .unique();

  if (args.contexto.tipo === "reembolso_caja_menor") {
    const reembolsoId = args.contexto.reembolsoId;
    const movimientoId = args.contexto.movimientoId;
    if (!reembolsoId || !movimientoId) {
      if (args.forWrite) causacionError("BAD_REQUEST", "Contexto de reembolso incompleto.");
      return {
        puedeEditar: false,
        motivoSoloLectura: "fase_no_habilitada",
        faseOperativa: null,
        tarea,
        asignacionId: null,
      };
    }

    const reembolso = await args.ctx.db.get("cajasMenoresReembolsos", reembolsoId);
    if (!reembolso) {
      if (args.forWrite) causacionError("NOT_FOUND", "Reembolso no encontrado.");
      return {
        puedeEditar: false,
        motivoSoloLectura: "fase_no_habilitada",
        faseOperativa: null,
        tarea,
        asignacionId: null,
      };
    }

    const movimiento = await args.ctx.db.get("facturacionCajaMenorMovimientos", movimientoId);
    if (!movimiento || movimiento.reembolsoId !== reembolsoId) {
      if (args.forWrite) causacionError("NOT_FOUND", "Movimiento no encontrado en el reembolso.");
      return {
        puedeEditar: false,
        motivoSoloLectura: "fase_no_habilitada",
        faseOperativa: reembolso.estado,
        tarea,
        asignacionId: null,
      };
    }

    if (movimiento.facturaId !== args.factura._id) {
      if (args.forWrite) {
        causacionError("CONFLICT", "El movimiento no corresponde a esta factura.");
      }
      return {
        puedeEditar: false,
        motivoSoloLectura: "no_asignado",
        faseOperativa: reembolso.estado,
        tarea,
        asignacionId: null,
      };
    }

    const permiso = puedeEditarCausacionReembolso({
      estadoReembolso: reembolso.estado,
      responsableActualUserId: reembolso.responsableActualUserId,
      actorUserId: args.actorUserId,
      reviewAssignedUserId: reembolso.reviewAssignedUserId,
      contadorAsignadoUserId: reembolso.contadorAsignadoUserId,
      eventosDianAsignadoUserId: reembolso.eventosDianAsignadoUserId,
    });

    return {
      ...permiso,
      tarea,
      asignacionId: null,
    };
  }

  if (args.factura.esPeaje) {
    return {
      puedeEditar: false,
      motivoSoloLectura: "peajes_solo_consulta",
      faseOperativa: tarea?.estado ?? null,
      tarea,
      asignacionId: null,
    };
  }

  const asignacion = tarea ? await resolverAsignacionPendienteCanonica(args.ctx, tarea) : null;
  const permiso = puedeEditarCausacionFlujo({
    esPeaje: Boolean(args.factura.esPeaje),
    tieneTarea: Boolean(tarea),
    faseActual: tarea?.estado ?? null,
    asignadoAUserId: asignacion?.asignadoAUserId,
    actorUserId: args.actorUserId,
  });

  return {
    ...permiso,
    faseOperativa: tarea?.estado ?? null,
    tarea,
    asignacionId: asignacion?._id ?? null,
  };
}

export async function recomputeReembolsoCausacionCounts(
  ctx: MutationCtx,
  reembolsoId: Id<"cajasMenoresReembolsos">,
  nowMs: number = Date.now()
) {
  const reembolso = await ctx.db.get("cajasMenoresReembolsos", reembolsoId);
  if (!reembolso) return;

  let causadas = 0;
  let noCausadas = 0;
  let sinRegistro = 0;

  for (const movimientoId of reembolso.movimientoIds) {
    const movimiento = await ctx.db.get("facturacionCajaMenorMovimientos", movimientoId);
    if (!movimiento) continue;
    const factura = await ctx.db.get("facturacionFacturas", movimiento.facturaId);
    if (!factura) {
      sinRegistro += 1;
      continue;
    }
    const estado = deriveCausacionEstado(factura.causado);
    if (estado === "causado") causadas += 1;
    else if (estado === "no_causado") noCausadas += 1;
    else sinRegistro += 1;
  }

  await ctx.db.patch("cajasMenoresReembolsos", reembolsoId, {
    causacionCausadasCount: causadas,
    causacionNoCausadasCount: noCausadas,
    causacionSinRegistroCount: sinRegistro,
    actualizadoEn: nowMs,
  });
}

async function registrarCausacionAprobacion(
  ctx: MutationCtx,
  args: {
    tarea: Doc<"facturacionTareas">;
    facturaId: Id<"facturacionFacturas">;
    asignacionId?: Id<"facturacionAsignaciones">;
    empresa: number;
    actor: { userId: string; nombre: string; email: string };
    comentario: string;
    causacionCambio: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]>;
    creadoEn: number;
  }
) {
  await ctx.db.insert("facturacionAprobaciones", {
    tareaId: args.tarea._id,
    facturaId: args.facturaId,
    ...(args.asignacionId ? { asignacionId: args.asignacionId } : {}),
    empresa: args.empresa,
    actorUserId: args.actor.userId,
    actorNombre: args.actor.nombre,
    actorEmail: args.actor.email,
    accion: "actualizar_causacion",
    comentario: args.comentario,
    causacionCambio: args.causacionCambio,
    estadoAnterior: args.tarea.estado,
    estadoNuevo: args.tarea.estado,
    creadoEn: args.creadoEn,
  });
}

export const obtenerDesdeServidor = query({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    actorUserId: v.string(),
    contexto: contextoValidator,
    historialCursor: v.optional(v.string()),
    empresasAutorizadas: v.array(v.number()),
  },
  returns: causacionSnapshotValidator,
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);

    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) {
      causacionError("NOT_FOUND", "Factura no encontrada.");
    }

    const empresa = normalizeEmpresa(factura.empresa, 0);
    if (!args.empresasAutorizadas.includes(empresa)) {
      causacionError("FORBIDDEN", "Empresa no autorizada.");
    }

    const permiso = await resolverPermisoEdicion({
      ctx,
      factura,
      actorUserId: args.actorUserId,
      contexto: args.contexto,
      forWrite: false,
    });

    const snapshot = buildSnapshotFromFactura(factura);
    const historial = await listarHistorialCausacion(ctx, args.facturaId, args.historialCursor);

    return {
      facturaId: args.facturaId,
      ...snapshot,
      faseOperativa: permiso.faseOperativa,
      puedeEditar: permiso.puedeEditar,
      motivoSoloLectura: permiso.motivoSoloLectura,
      historial,
    };
  },
});

export const actualizarDesdeServidor = mutation({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    actor: actorValidator,
    empresasAutorizadas: v.array(v.number()),
    expectedVersion: v.number(),
    causado: v.boolean(),
    numeroFp: v.optional(v.string()),
    motivoCambio: v.optional(v.string()),
    contexto: contextoValidator,
  },
  returns: causacionSnapshotValidator,
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);

    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) {
      causacionError("NOT_FOUND", "Factura no encontrada.");
    }

    const empresa = normalizeEmpresa(factura.empresa, 0);
    if (!args.empresasAutorizadas.includes(empresa)) {
      causacionError("FORBIDDEN", "Empresa no autorizada.");
    }

    const versionActual = getCausacionVersion(factura);
    if (args.expectedVersion !== versionActual) {
      causacionError("CONFLICT", "La causación cambió desde que abriste el formulario.");
    }

    const permiso = await resolverPermisoEdicion({
      ctx,
      factura,
      actorUserId: args.actor.userId,
      contexto: args.contexto,
      forWrite: true,
    });

    if (!permiso.puedeEditar) {
      causacionError("FORBIDDEN", "No tienes permiso para editar la causación en esta fase.");
    }

    if (!permiso.tarea) {
      causacionError("FORBIDDEN", "La factura no tiene un flujo activo para registrar causación.");
    }

    const tarea = permiso.tarea;

    const causadoAnterior = factura.causado === undefined ? null : factura.causado;
    const numeroFpAnterior = factura.causado === true ? normalizeNumeroFp(factura.numeroFp) : null;

    let transition;
    try {
      transition = resolveCausacionTransition({
        causadoAnterior,
        numeroFpAnterior,
        causadoNuevo: args.causado,
        numeroFpNuevo: args.numeroFp,
        motivoCambio: args.motivoCambio,
      });
    } catch (error) {
      causacionError(
        "UNPROCESSABLE",
        error instanceof Error ? error.message : "Transición inválida."
      );
    }

    if (transition.isNoOp) {
      causacionError("UNPROCESSABLE", "No hay cambios que guardar.");
    }

    const nowMs = Date.now();
    const versionNueva = versionActual + 1;
    const contextoAudit: CausacionContextoTipo = args.contexto.tipo;
    const faseOperativa = permiso.faseOperativa ?? "desconocida";

    const patch: Partial<Doc<"facturacionFacturas">> = {
      causado: transition.causadoNuevo,
      causacionVersion: versionNueva,
      causacionActualizadaEn: nowMs,
      causacionActualizadaPorUserId: args.actor.userId,
      causacionActualizadaPorNombre: args.actor.nombre,
      causacionActualizadaPorEmail: args.actor.email,
      actualizadoEn: nowMs,
    };

    if (transition.causadoNuevo) {
      patch.numeroFp = transition.numeroFpNuevo ?? undefined;
    } else {
      patch.numeroFp = undefined;
    }

    await ctx.db.patch("facturacionFacturas", args.facturaId, patch);

    const causacionCambio: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]> = {
      causadoAnterior,
      causadoNuevo: transition.causadoNuevo,
      numeroFpAnterior,
      numeroFpNuevo: transition.numeroFpNuevo,
      motivoCambio: transition.motivoCambio,
      versionAnterior: versionActual,
      versionNueva,
      contexto: contextoAudit,
      faseOperativa,
      ...(args.contexto.tipo === "reembolso_caja_menor"
        ? {
            reembolsoId: args.contexto.reembolsoId,
            movimientoId: args.contexto.movimientoId,
          }
        : {}),
    };

    await registrarCausacionAprobacion(ctx, {
      tarea,
      facturaId: args.facturaId,
      asignacionId: permiso.asignacionId ?? undefined,
      empresa,
      actor: args.actor,
      comentario: transition.comentario,
      causacionCambio,
      creadoEn: nowMs,
    });

    await refrescarProyeccionFactura(ctx, args.facturaId, nowMs);

    if (args.contexto.tipo === "reembolso_caja_menor") {
      await recomputeReembolsoCausacionCounts(ctx, args.contexto.reembolsoId, nowMs);
    }

    const updated = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!updated) {
      causacionError("NOT_FOUND", "Factura no encontrada.");
    }

    const historial = await listarHistorialCausacion(ctx, args.facturaId);
    const snapshot = buildSnapshotFromFactura(updated);

    return {
      facturaId: args.facturaId,
      ...snapshot,
      faseOperativa,
      puedeEditar: true,
      motivoSoloLectura: null,
      historial,
    };
  },
});
