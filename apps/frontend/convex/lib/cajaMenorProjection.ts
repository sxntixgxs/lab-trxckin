import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  buildCajaMenorProceso,
  CAJA_MENOR_TERMINAL_PHASES,
  cajaMenorOwnerToValidOwner,
  cajaMenorProcesoToTimingMovements,
  type CajaMenorProceso,
  type CajaMenorPublicPhase,
} from "./cajaMenorFacturacionAdapter";
import { CAJA_MENOR_AUDIT_ACTIONS } from "./cajaMenorAuditoria";

const cajaMenorAuditActionSet = new Set<string>(CAJA_MENOR_AUDIT_ACTIONS);

export async function loadCajaMenorProjectionOverlay(
  ctx: MutationCtx | QueryCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    factura: Doc<"facturacionFacturas">;
    tarea: Doc<"facturacionTareas"> | null;
    aprobaciones: Doc<"facturacionAprobaciones">[];
    nowMs: number;
  }
) {
  const movimientos: Doc<"facturacionCajaMenorMovimientos">[] = [];
  for await (const movimiento of ctx.db
    .query("facturacionCajaMenorMovimientos")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))) {
    movimientos.push(movimiento);
  }

  if (
    !args.factura.esLegalizacionCajaMenor &&
    args.tarea?.estado !== "reembolso_caja_menor" &&
    movimientos.length === 0
  ) {
    return null;
  }

  const reembolsoIds = new Set<Id<"cajasMenoresReembolsos">>();
  for (const movimiento of movimientos) {
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

  const cajaMenorAprobaciones = args.aprobaciones.filter((a) =>
    cajaMenorAuditActionSet.has(a.accion)
  );

  const proceso = buildCajaMenorProceso({
    factura: {
      esLegalizacionCajaMenor: args.factura.esLegalizacionCajaMenor,
      cajaMenorMarcadorUserId: args.factura.cajaMenorMarcadorUserId,
      cajaMenorMarcadorNombre: args.factura.cajaMenorMarcadorNombre,
      cajaMenorMarcadorEmail: args.factura.cajaMenorMarcadorEmail,
    },
    tareaEstado: args.tarea?.estado,
    movimientos,
    reembolsos,
    eventos,
    aprobaciones: cajaMenorAprobaciones,
    nowMs: args.nowMs,
  });

  if (!proceso) return null;

  const reembolsoVigente = reembolsos.find((r) => String(r._id) === proceso.intentoVigenteId);
  const cierreReporteEn =
    reembolsoVigente?.recibidoEn ??
    reembolsoVigente?.comprobanteCargadoEn ??
    undefined;

  return {
    proceso,
    fasePublica: proceso.fasePublica as CajaMenorPublicPhase,
    fasePublicaLabel: proceso.fasePublicaLabel,
    responsableActual: proceso.responsableActual,
    esTerminal: CAJA_MENOR_TERMINAL_PHASES.has(proceso.fasePublica as CajaMenorPublicPhase),
    cierreReporteEn,
    participantes: collectCajaMenorParticipantes(cajaMenorAprobaciones, proceso.intervalos),
  };
}

function collectCajaMenorParticipantes(
  aprobaciones: Doc<"facturacionAprobaciones">[],
  intervalos: CajaMenorProceso["intervalos"]
) {
  const groups = new Map<
    string,
    {
      identityKey: string;
      userId?: string;
      email: string;
      nombre: string;
      primeraParticipacionEn: number;
      ultimaParticipacionEn: number;
      cantidadMovimientos: number;
    }
  >();

  const add = (args: {
    userId?: string;
    email?: string;
    nombre?: string;
    ts: number;
  }) => {
    if (!args.nombre?.trim()) return;
    const email = (args.email ?? "sin-email@local").trim().toLowerCase();
    const identityKey = args.userId ? `id:${args.userId}` : `email:${email}`;
    const existing = groups.get(identityKey);
    if (existing) {
      existing.primeraParticipacionEn = Math.min(existing.primeraParticipacionEn, args.ts);
      existing.ultimaParticipacionEn = Math.max(existing.ultimaParticipacionEn, args.ts);
      existing.cantidadMovimientos += 1;
      if (!existing.nombre && args.nombre) existing.nombre = args.nombre;
      return;
    }
    groups.set(identityKey, {
      identityKey,
      ...(args.userId ? { userId: args.userId } : {}),
      email,
      nombre: args.nombre.trim(),
      primeraParticipacionEn: args.ts,
      ultimaParticipacionEn: args.ts,
      cantidadMovimientos: 1,
    });
  };

  for (const approval of aprobaciones) {
    add({
      userId: approval.actorUserId,
      email: approval.actorEmail,
      nombre: approval.actorNombre,
      ts: approval.creadoEn,
    });
    const dest = approval.cajaMenorContexto?.responsableDestino;
    if (dest) {
      add({
        userId: dest.userId,
        email: dest.email,
        nombre: dest.nombre,
        ts: approval.creadoEn,
      });
    }
  }

  for (const intervalo of intervalos) {
    if (intervalo.responsableNombre === "Responsable no registrado") continue;
    add({
      userId: intervalo.responsableUserId,
      email: intervalo.responsableEmail,
      nombre: intervalo.responsableNombre,
      ts: intervalo.inicioEn,
    });
  }

  return [...groups.values()];
}

export async function programarRefrescoProyeccionCajaMenor(
  ctx: MutationCtx,
  facturaIds: Array<Id<"facturacionFacturas">>,
  nowMs: number = Date.now()
) {
  const unique = [...new Set(facturaIds.map((id) => String(id)))];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50) as Id<"facturacionFacturas">[];
    await ctx.scheduler.runAfter(0, internal.facturacionDashboard.refrescarProyeccionBatch, {
      facturaIds: batch,
      nowMs,
    });
  }
}

export function cajaMenorOwnersFromProceso(
  proceso: NonNullable<Awaited<ReturnType<typeof loadCajaMenorProjectionOverlay>>>,
  nowMs: number
) {
  if (proceso.esTerminal || !proceso.responsableActual) return [];
  return [
    cajaMenorOwnerToValidOwner(
      proceso.responsableActual,
      proceso.fasePublica,
      nowMs
    ),
  ];
}

export async function loadCajaMenorTimingMovements(
  ctx: MutationCtx | QueryCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    factura: Doc<"facturacionFacturas">;
    tarea: Doc<"facturacionTareas"> | null;
    aprobaciones: Doc<"facturacionAprobaciones">[];
    nowMs: number;
  }
) {
  const overlay = await loadCajaMenorProjectionOverlay(ctx, args);
  if (!overlay) return [];
  return cajaMenorProcesoToTimingMovements(overlay.proceso.intervalos, args.nowMs);
}
