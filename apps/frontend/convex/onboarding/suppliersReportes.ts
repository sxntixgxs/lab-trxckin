import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { resolveOnboardingAccess } from "../lib/onboarding/access";
import { inscripcionToMatrizRiesgoReporteRow } from "../lib/onboarding/suppliersMatrizRiesgoReporte";
import { riesgoNivelValidator, tipoEvaluacionValidator, tipoSolicitudValidator } from "./validators";

const MAX_PAGE_SIZE = 100;

const factorReporteValidator = v.object({
  respuesta: v.string(),
  puntaje: v.union(v.number(), v.null()),
  nivel: riesgoNivelValidator,
});

export const matrizRiesgoReporteRowValidator = v.object({
  inscripcionId: v.id("onboardingProveedores"),
  empresaId: v.number(),
  fechaInicioProceso: v.number(),
  tipoSolicitud: tipoSolicitudValidator,
  estadoProceso: v.string(),
  proveedor: v.string(),
  tipoPersona: v.string(),
  tipoDocumento: v.string(),
  nit: v.string(),
  productoServicio: v.string(),
  ciiuPrincipal: v.string(),
  actividadEconomicaPrincipal: v.string(),
  ciiuSecundario: v.string(),
  actividadEconomicaSecundaria: v.string(),
  montoAnual: factorReporteValidator,
  sectorEconomico: factorReporteValidator,
  jurisdiccionNacional: factorReporteValidator,
  jurisdiccionInternacional: factorReporteValidator,
  pep: factorReporteValidator,
  listasRestrictivas: factorReporteValidator,
  riesgoGlobalPuntaje: v.union(v.number(), v.null()),
  riesgoGlobalNivel: riesgoNivelValidator,
  tipoEvaluacion: tipoEvaluacionValidator,
});

/**
 * Matrices de riesgo por rango de fecha de inicio (paginado). Solo para administradores
 * o usuarios con un rol configurado en el módulo (acceso `full`).
 */
export const listarMatricesRiesgoParaReporte = query({
  args: {
    empresa: v.number(),
    fechaDesde: v.number(),
    fechaHastaExclusiva: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(matrizRiesgoReporteRowValidator),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.fechaDesde) || !Number.isFinite(args.fechaHastaExclusiva)) {
      throw new Error("Rango de fechas inválido.");
    }
    if (args.fechaHastaExclusiva <= args.fechaDesde) {
      throw new Error("La fecha hasta debe ser posterior a la fecha desde.");
    }
    const { access } = await resolveOnboardingAccess(ctx, "supplier", args.empresa);
    if (access.nivel !== "full") throw new Error("No autorizado para generar reportes del módulo.");

    const numItems = Math.min(args.paginationOpts.numItems, MAX_PAGE_SIZE);
    const paginationOpts = { ...args.paginationOpts, numItems };
    const pageResult = await ctx.db
      .query("onboardingProveedores")
      .withIndex("by_empresa", (q) =>
        q.eq("empresa", args.empresa).gte("_creationTime", args.fechaDesde).lt("_creationTime", args.fechaHastaExclusiva),
      )
      .order("desc")
      .paginate(paginationOpts);

    return { ...pageResult, page: pageResult.page.map(inscripcionToMatrizRiesgoReporteRow) };
  },
});
