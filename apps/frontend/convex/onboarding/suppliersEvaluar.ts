import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { puedeVerInscripcion, requireActorEnFase, resolveOnboardingAccess } from "../lib/onboarding/access";

const criterio = v.union(v.number(), v.null());

/** Registra (o reemplaza) la evaluación de Compras de la Fase V. */
export const evaluarProveedor = mutation({
  args: {
    inscripcionId: v.id("onboardingProveedores"),
    experiencia: criterio,
    referencias: criterio,
    portfolio: criterio,
    certificados: criterio,
    garantias: criterio,
    fichasTecnicas: criterio,
    formaPago: criterio,
    sstAmbiental: criterio,
    calificacionGeneral: v.number(),
    isAprobado: v.boolean(),
  },
  returns: v.id("onboardingProveedoresEvaluaciones"),
  handler: async (ctx, args) => {
    const ins = await ctx.db.get("onboardingProveedores", args.inscripcionId);
    if (!ins) throw new Error("Inscripción no encontrada.");
    if (ins.faseActual !== "V_EVALUACION_COMPRAS") throw new Error("La inscripción no está en Fase V.");
    const actor = await requireActorEnFase(ctx, "supplier", ins, "V_EVALUACION_COMPRAS");

    const criterios = [
      args.experiencia,
      args.referencias,
      args.portfolio,
      args.certificados,
      args.garantias,
      args.fichasTecnicas,
      args.formaPago,
      args.sstAmbiental,
    ];
    if (criterios.every((valor) => valor === null)) {
      throw new Error("Selecciona al menos un criterio aplicable para registrar la evaluación.");
    }

    const payload = {
      inscripcionId: args.inscripcionId,
      evaluadorUserId: actor.usuarioId,
      experiencia: args.experiencia,
      referencias: args.referencias,
      portfolio: args.portfolio,
      certificados: args.certificados,
      garantias: args.garantias,
      fichasTecnicas: args.fichasTecnicas,
      formaPago: args.formaPago,
      sstAmbiental: args.sstAmbiental,
      calificacionGeneral: args.calificacionGeneral,
      isAprobado: args.isAprobado,
    };
    const existing = await ctx.db
      .query("onboardingProveedoresEvaluaciones")
      .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", args.inscripcionId))
      .first();
    if (existing) {
      await ctx.db.patch("onboardingProveedoresEvaluaciones", existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("onboardingProveedoresEvaluaciones", payload);
  },
});

export const obtenerEvaluacionPorInscripcion = query({
  args: { inscripcionId: v.id("onboardingProveedores") },
  handler: async (ctx, args) => {
    const ins = await ctx.db.get("onboardingProveedores", args.inscripcionId);
    if (!ins) return null;
    const { access } = await resolveOnboardingAccess(ctx, "supplier", ins.empresa);
    if (!puedeVerInscripcion(access, ins)) throw new Error("No autorizado.");
    const rows = await ctx.db
      .query("onboardingProveedoresEvaluaciones")
      .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", args.inscripcionId))
      .take(10);
    return rows.sort((a, b) => b._creationTime - a._creationTime)[0] ?? null;
  },
});

/** Última evaluación de cada proveedor con datos del proveedor (exportación Excel). */
export const obtenerTodasEvaluacionesConProveedor = query({
  args: { empresa: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { access } = await resolveOnboardingAccess(ctx, "supplier", args.empresa ?? null);
    if (access.nivel !== "full") throw new Error("No autorizado para exportar evaluaciones.");
    const empresas =
      args.empresa !== undefined ? [args.empresa] : access.empresasVisibles === "todas" ? [1, 2, 3, 4] : access.empresasVisibles;

    const resultado: Array<Record<string, unknown>> = [];
    for (const empresa of empresas) {
      const inscripciones = await ctx.db
        .query("onboardingProveedores")
        .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
        .take(2000);
      for (const ins of inscripciones) {
        const evs = await ctx.db
          .query("onboardingProveedoresEvaluaciones")
          .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", ins._id))
          .take(10);
        const ev = evs.sort((a, b) => b._creationTime - a._creationTime)[0];
        if (!ev) continue;
        const dg = ins.datos_generales_01;
        resultado.push({
          ...ev,
          empresa: ins.empresa,
          tipoSolicitud: dg.tipoSolicitud ?? "INSCRIPCIÓN",
          razonSocial: dg.razonSocial ?? "Sin razón social",
          tipoDocumento: dg.tipoDocumento ?? "—",
          numeroDocumento: dg.numeroDocumento ?? "—",
          tipoPersona: dg.tipoPersona ?? "—",
          servicioSuministrado: ins.matriz_00.servicioSuministrado ?? "—",
          tipoEvaluacion: ins.tipoEvaluacion_14 ?? "—",
          riesgo: ins.matriz_00.riesgo ?? "—",
          ciudad: dg.ciudad ?? "—",
          fechaInscripcion: ins._creationTime,
          faseActual: ins.faseActual,
        });
      }
    }
    return resultado;
  },
});
