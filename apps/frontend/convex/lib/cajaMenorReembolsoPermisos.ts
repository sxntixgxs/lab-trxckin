import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isReembolsoEstadoSeguimientoActivo } from "./cajaMenorBandeja";

const ADMIN_ROLES = new Set([1, 99]);

export function isAdminRol(actorRol?: number) {
  return typeof actorRol === "number" && ADMIN_ROLES.has(actorRol);
}

export async function usuarioPuedeRevisarCajaMenorEmpresa(
  ctx: QueryCtx,
  empresa: number,
  actorUserId?: string,
  actorRol?: number
) {
  if (!actorUserId) return false;
  if (isAdminRol(actorRol)) return true;
  const config = await ctx.db
    .query("facturacionConfiguracion")
    .withIndex("by_empresa_clave", (q) =>
      q.eq("empresa", empresa).eq("clave", "revisor_caja_menor")
    )
    .first();
  if (!config) return false;
  if (config.usuarioId === actorUserId) return true;
  return (
    config.usuarios?.some((u) => u.usuarioId === actorUserId) ||
    config.usuariosPonderados?.some((u) => u.usuarioId === actorUserId) ||
    false
  );
}

export async function usuarioPuedeGestionarEmpresa(
  ctx: QueryCtx,
  empresa: number,
  actorUserId?: string,
  actorRol?: number
) {
  if (!actorUserId) return false;
  if (isAdminRol(actorRol)) return true;
  const config = await ctx.db
    .query("cajasMenoresRolesConfig")
    .withIndex("by_empresa_rol", (q) =>
      q.eq("empresa", empresa).eq("rol", "GERENCIA_FINANCIERA")
    )
    .first();
  return config?.usuarios.some((u) => u.userId === actorUserId) ?? false;
}

export async function usuarioConfiguradoEmpresa(
  ctx: QueryCtx,
  empresa: number,
  clave:
    | "revisor_caja_menor"
    | "contadores_impuestos"
    | "eventos_dian"
    | "tesorero",
  actorUserId?: string
) {
  if (!actorUserId) return false;
  const indexados = await ctx.db
    .query("facturacionConfiguracionUsuarios")
    .withIndex("by_empresa_clave", (q) => q.eq("empresa", empresa).eq("clave", clave))
    .collect();
  if (indexados.some((u) => u.usuarioId === actorUserId)) return true;
  const config = await ctx.db
    .query("facturacionConfiguracion")
    .withIndex("by_empresa_clave", (q) => q.eq("empresa", empresa).eq("clave", clave))
    .first();
  if (!config) return false;
  if (config.usuarioId === actorUserId) return true;
  return (
    config.usuarios?.some((u) => u.usuarioId === actorUserId) ||
    config.usuariosPonderados?.some((u) => u.usuarioId === actorUserId) ||
    false
  );
}

export async function getPermisosEmpresa(
  ctx: QueryCtx,
  empresa: number,
  actorUserId: string,
  actorRol?: number
) {
  const [
    canReview,
    canManage,
    canReviewReembolso,
    canReviewContabilidad,
    canReviewEventosDian,
    canPayTesoreria,
  ] = await Promise.all([
    usuarioPuedeRevisarCajaMenorEmpresa(ctx, empresa, actorUserId, actorRol),
    usuarioPuedeGestionarEmpresa(ctx, empresa, actorUserId, actorRol),
    usuarioConfiguradoEmpresa(ctx, empresa, "revisor_caja_menor", actorUserId),
    usuarioConfiguradoEmpresa(ctx, empresa, "contadores_impuestos", actorUserId),
    usuarioConfiguradoEmpresa(ctx, empresa, "eventos_dian", actorUserId),
    usuarioConfiguradoEmpresa(ctx, empresa, "tesorero", actorUserId),
  ]);
  return {
    canReview,
    canManage,
    canReviewReembolso,
    canReviewContabilidad,
    canReviewEventosDian,
    /** Gerencia Financiera via cajasMenoresRolesConfig */
    canApproveReembolso: canManage,
    canPayTesoreria,
  };
}

export type CajaVisibilityMode = "full" | "participant_only";

export type ReembolsoPermisosEmpresa = Awaited<ReturnType<typeof getPermisosEmpresa>>;

export function resolveCajaVisibilityMode(
  caja: Doc<"cajasMenores">,
  permisos: ReembolsoPermisosEmpresa,
  actorUserId: string,
  actorRol?: number
): CajaVisibilityMode {
  const isCustodio = caja.assignedUsersIds.includes(actorUserId);
  if (
    isAdminRol(actorRol) ||
    permisos.canManage ||
    permisos.canReview ||
    permisos.canReviewContabilidad ||
    permisos.canReviewEventosDian ||
    permisos.canApproveReembolso ||
    permisos.canPayTesoreria ||
    isCustodio
  ) {
    return "full";
  }
  return "participant_only";
}

export function puedeObservarReembolsoActivo(
  reembolso: Doc<"cajasMenoresReembolsos">,
  caja: Doc<"cajasMenores">,
  actorUserId: string,
  permisos: Omit<ReembolsoPermisosEmpresa, "canReview">,
  actorRol?: number,
  visibilityMode: CajaVisibilityMode = "full"
) {
  if (!isReembolsoEstadoSeguimientoActivo(reembolso.estado)) return false;
  if (visibilityMode === "participant_only") {
    return (
      reembolso.custodioUserId === actorUserId ||
      reembolso.liderAprobadorUserId === actorUserId ||
      reembolso.reviewAssignedUserId === actorUserId ||
      reembolso.contadorAsignadoUserId === actorUserId ||
      reembolso.eventosDianAsignadoUserId === actorUserId
    );
  }
  if (isAdminRol(actorRol) || permisos.canManage) return true;
  if (caja.assignedUsersIds.includes(actorUserId)) return true;
  if (reembolso.custodioUserId === actorUserId) return true;
  if (reembolso.liderAprobadorUserId === actorUserId) return true;
  if (permisos.canReviewReembolso) return true;
  if (permisos.canReviewContabilidad) return true;
  if (permisos.canReviewEventosDian) return true;
  if (permisos.canApproveReembolso) return true;
  if (permisos.canPayTesoreria) return true;
  return false;
}

export function reembolsoTieneAccionParaUsuario(
  reembolso: Doc<"cajasMenoresReembolsos">,
  actorUserId: string,
  permisos: ReembolsoPermisosEmpresa,
  actorRol?: number
) {
  const isAdmin = isAdminRol(actorRol);
  switch (reembolso.estado) {
    case "pendiente_aprobacion_lider":
      return reembolso.liderAprobadorUserId === actorUserId;
    case "pendiente_revision":
      return (
        (permisos.canReviewReembolso &&
          reembolso.reviewAssignedUserId === actorUserId) ||
        isAdmin ||
        permisos.canManage
      );
    case "pendiente_revision_impuestos":
      return (
        (permisos.canReviewContabilidad &&
          reembolso.contadorAsignadoUserId === actorUserId) ||
        isAdmin ||
        permisos.canManage
      );
    case "pendiente_eventos_dian":
      return (
        (permisos.canReviewEventosDian &&
          reembolso.eventosDianAsignadoUserId === actorUserId) ||
        isAdmin ||
        permisos.canManage
      );
    case "pendiente_aprobacion":
      return permisos.canApproveReembolso || isAdmin;
    case "pendiente_pago_tesoreria":
      return permisos.canPayTesoreria || isAdmin;
    default:
      return false;
  }
}

export function puedeReasignarReembolso(
  reembolso: Doc<"cajasMenoresReembolsos">,
  actorUserId: string,
  permisos: ReembolsoPermisosEmpresa,
  actorRol?: number
) {
  const isAdmin = isAdminRol(actorRol);
  switch (reembolso.estado) {
    case "pendiente_revision":
      return isAdmin || permisos.canManage || permisos.canReviewReembolso;
    case "pendiente_revision_impuestos":
      return isAdmin || permisos.canManage || permisos.canReviewContabilidad;
    case "pendiente_eventos_dian":
      return isAdmin || permisos.canManage || permisos.canReviewEventosDian;
    default:
      return false;
  }
}
