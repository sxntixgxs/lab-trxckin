import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { actorPuedeVerEmpresa, requirePermiso, type BillingActor } from "../billingAuth";
import { getFaseRow, obtenerRolConfig, rolParaFase, type OnboardingRol } from "./phases";
import { refFromDoc, type InscripcionDoc, type OnboardingModulo } from "./refs";

export const PERMISO_POR_MODULO: Record<OnboardingModulo, string> = {
  supplier: "suppliers/onboarding",
  customer: "customers/onboarding",
};

export type NivelAcceso = "full" | "consulta_creacion" | "solo_lectura" | "responsable";

export type OnboardingAccess = {
  nivel: NivelAcceso;
  roles: Array<{ empresa: number; rol: OnboardingRol }>;
  whitelist: Array<{ empresa: number; permiso: Doc<"onboardingWhitelist">["permiso"] }>;
  empresasVisibles: number[] | "todas";
  isAdmin: boolean;
  usuarioId: string;
};

function empresaVisible(actor: BillingActor, empresa: number, filtro: number | null): boolean {
  if (filtro !== null && empresa !== filtro) return false;
  return actorPuedeVerEmpresa(actor, empresa);
}

/**
 * Resuelve el nivel de acceso del actor al módulo, replicando la semántica del sistema
 * original: `full` = admin o cualquier rol configurado; `consulta_creacion` / `solo_lectura`
 * = whitelist; `responsable` = solo el permiso de ruta (crea procesos y ve los propios).
 */
export async function resolveOnboardingAccess(
  ctx: QueryCtx | MutationCtx,
  modulo: OnboardingModulo,
  empresa: number | null,
): Promise<{ actor: BillingActor; access: OnboardingAccess }> {
  const actor = await requirePermiso(ctx, PERMISO_POR_MODULO[modulo]);
  if (empresa !== null && !actorPuedeVerEmpresa(actor, empresa)) {
    throw new Error("Empresa no autorizada.");
  }
  const empresasVisibles: number[] | "todas" =
    actor.hasFullAccess || actor.accesoTodasEmpresas ? "todas" : actor.empresas;

  const rolesRows = await ctx.db
    .query("onboardingRoles")
    .withIndex("by_modulo_userId", (q) => q.eq("modulo", modulo).eq("userId", actor.usuarioId))
    .take(50);
  const roles = rolesRows
    .filter((r) => empresaVisible(actor, r.empresa, empresa))
    .map((r) => ({ empresa: r.empresa, rol: r.rol }));

  const wlRows = await ctx.db
    .query("onboardingWhitelist")
    .withIndex("by_modulo_userId", (q) => q.eq("modulo", modulo).eq("userId", actor.usuarioId))
    .take(50);
  const whitelist = wlRows
    .filter((w) => empresaVisible(actor, w.empresa, empresa))
    .map((w) => ({ empresa: w.empresa, permiso: w.permiso }));

  let nivel: NivelAcceso;
  if (actor.hasFullAccess || roles.length > 0) nivel = "full";
  else if (whitelist.some((w) => w.permiso === "CONSULTA_CREACION")) nivel = "consulta_creacion";
  else if (whitelist.length > 0) nivel = "solo_lectura";
  else nivel = "responsable";

  return {
    actor,
    access: { nivel, roles, whitelist, empresasVisibles, isAdmin: actor.hasFullAccess, usuarioId: actor.usuarioId },
  };
}

/** Puede iniciar procesos: cualquier nivel salvo `solo_lectura`. */
export async function requirePuedeCrear(
  ctx: MutationCtx,
  modulo: OnboardingModulo,
  empresa: number,
): Promise<BillingActor> {
  const { actor, access } = await resolveOnboardingAccess(ctx, modulo, empresa);
  if (access.nivel === "solo_lectura") {
    throw new Error("Tu acceso al módulo es de solo consulta; no puedes iniciar procesos.");
  }
  return actor;
}

/** Puede ver una inscripción: acceso `full`/whitelist, o ser su responsable. */
export function puedeVerInscripcion(access: OnboardingAccess, ins: InscripcionDoc): boolean {
  if (access.nivel !== "responsable") return true;
  return ins.matriz_00.responsableId === access.usuarioId;
}

/**
 * Gestión transversal de una inscripción (copiar enlace, reenviar correo, anular, devolver):
 * admin, cualquier rol configurado para la empresa, o el responsable (si no es solo lectura).
 */
export async function requireGestionInscripcion(
  ctx: QueryCtx | MutationCtx,
  modulo: OnboardingModulo,
  ins: InscripcionDoc,
): Promise<BillingActor> {
  const { actor, access } = await resolveOnboardingAccess(ctx, modulo, ins.empresa);
  if (access.nivel === "full") return actor;
  if (access.nivel !== "solo_lectura" && ins.matriz_00.responsableId === actor.usuarioId) return actor;
  throw new Error("No autorizado para gestionar esta inscripción.");
}

/**
 * Autoriza al actor a actuar en una fase: admin, el asignado de la fila de fase abierta,
 * o el usuario configurado para el rol que atiende la fase (escalado por riesgo cuando aplica).
 */
export async function requireActorEnFase(
  ctx: MutationCtx,
  modulo: OnboardingModulo,
  ins: InscripcionDoc,
  fase: string,
): Promise<BillingActor> {
  const actor = await requirePermiso(ctx, PERMISO_POR_MODULO[modulo]);
  if (!actorPuedeVerEmpresa(actor, ins.empresa)) throw new Error("Empresa no autorizada.");
  if (actor.hasFullAccess) return actor;

  const faseRow = await getFaseRow(ctx, refFromDoc(modulo, ins), fase);
  if (faseRow?.asignadoA && faseRow.asignadoA === actor.usuarioId) return actor;

  const rol = rolParaFase(modulo, fase, ins);
  if (rol) {
    const config = await obtenerRolConfig(ctx, modulo, ins.empresa, rol);
    if (config?.userId === actor.usuarioId) return actor;
  }
  throw new Error("No tienes asignada esta fase de la inscripción.");
}

/** El actor es el responsable de la inscripción y no es de solo lectura. */
export async function requireResponsable(
  ctx: MutationCtx,
  modulo: OnboardingModulo,
  ins: InscripcionDoc,
): Promise<BillingActor> {
  const { actor, access } = await resolveOnboardingAccess(ctx, modulo, ins.empresa);
  if (actor.hasFullAccess) return actor;
  if (access.nivel !== "solo_lectura" && ins.matriz_00.responsableId === actor.usuarioId) return actor;
  throw new Error("Solo el responsable de la inscripción puede realizar esta acción.");
}

/** Escritura de configuración (roles, whitelist, tipos): solo administradores. */
export async function requireAdminModulo(ctx: MutationCtx, modulo: OnboardingModulo): Promise<BillingActor> {
  const actor = await requirePermiso(ctx, PERMISO_POR_MODULO[modulo]);
  if (!actor.hasFullAccess && !actor.permisos.includes("*")) {
    throw new Error("Solo un administrador puede modificar la configuración del módulo.");
  }
  return actor;
}

/** El actor tiene alguno de los roles indicados para la empresa. */
export async function actorTieneRol(
  ctx: QueryCtx | MutationCtx,
  modulo: OnboardingModulo,
  actor: BillingActor,
  empresa: number,
  roles: readonly OnboardingRol[],
): Promise<boolean> {
  if (actor.hasFullAccess) return true;
  for (const rol of roles) {
    const config = await obtenerRolConfig(ctx, modulo, empresa, rol);
    if (config?.userId === actor.usuarioId) return true;
  }
  return false;
}
