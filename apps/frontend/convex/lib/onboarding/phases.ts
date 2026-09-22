import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { rolCumplimientoPorRiesgo } from "../../../lib/onboarding/risk/compute";
import { CUSTOMER_FASE_ROL } from "../../../lib/onboarding/phases/customers";
import { SUPPLIER_FASE_ROL } from "../../../lib/onboarding/phases/suppliers";
import { esSupplierDoc, tipoEvaluacionDe, type InscripcionDoc, type InscripcionRef, type OnboardingModulo } from "./refs";

export type SupplierFaseRow = Doc<"onboardingProveedoresFases">;
export type CustomerFaseRow = Doc<"onboardingClientesFases">;
export type FaseRow = SupplierFaseRow | CustomerFaseRow;
export type OnboardingRol = Doc<"onboardingRoles">["rol"];

/** Fases cuyo rol de Cumplimiento depende del nivel de riesgo de la inscripción. */
const FASES_POR_NIVEL_RIESGO = new Set(["IV_APROBADO_CUMPLIMIENTO", "IIIA_APROBACION_CUMPLIMIENTO"]);

/** Rol responsable de una fase para una inscripción concreta (o null si la fase no tiene rol). */
export function rolParaFase(modulo: OnboardingModulo, fase: string, ins: InscripcionDoc): OnboardingRol | null {
  if (FASES_POR_NIVEL_RIESGO.has(fase)) return rolCumplimientoPorRiesgo(tipoEvaluacionDe(ins));
  const table: Record<string, OnboardingRol> = modulo === "supplier" ? SUPPLIER_FASE_ROL : CUSTOMER_FASE_ROL;
  return table[fase] ?? null;
}

export function moduloDe(ins: InscripcionDoc): OnboardingModulo {
  return esSupplierDoc(ins) ? "supplier" : "customer";
}

/** Última fila de una fase (puede repetirse tras una devolución). */
export async function getFaseRow(
  ctx: QueryCtx | MutationCtx,
  ref: InscripcionRef,
  fase: string,
): Promise<FaseRow | null> {
  if (ref.modulo === "supplier") {
    return await ctx.db
      .query("onboardingProveedoresFases")
      .withIndex("by_inscripcionId_fase", (q) =>
        q.eq("inscripcionId", ref.inscripcionId).eq("fase", fase as SupplierFaseRow["fase"]),
      )
      .order("desc")
      .first();
  }
  return await ctx.db
    .query("onboardingClientesFases")
    .withIndex("by_inscripcionId_fase", (q) =>
      q.eq("inscripcionId", ref.inscripcionId).eq("fase", fase as CustomerFaseRow["fase"]),
    )
    .order("desc")
    .first();
}

/** Todas las filas de fase de una inscripción (acotado: un proceso tiene pocas fases). */
export async function listFases(ctx: QueryCtx | MutationCtx, ref: InscripcionRef): Promise<FaseRow[]> {
  if (ref.modulo === "supplier") {
    return await ctx.db
      .query("onboardingProveedoresFases")
      .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", ref.inscripcionId))
      .take(100);
  }
  return await ctx.db
    .query("onboardingClientesFases")
    .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", ref.inscripcionId))
    .take(100);
}

export async function obtenerRolConfig(
  ctx: QueryCtx | MutationCtx,
  modulo: OnboardingModulo,
  empresa: number,
  rol: OnboardingRol,
): Promise<Doc<"onboardingRoles"> | null> {
  return await ctx.db
    .query("onboardingRoles")
    .withIndex("by_modulo_empresa_rol", (q) => q.eq("modulo", modulo).eq("empresa", empresa).eq("rol", rol))
    .unique();
}

export async function listRolesEmpresa(
  ctx: QueryCtx | MutationCtx,
  modulo: OnboardingModulo,
  empresa: number,
): Promise<Doc<"onboardingRoles">[]> {
  return await ctx.db
    .query("onboardingRoles")
    .withIndex("by_modulo_empresa", (q) => q.eq("modulo", modulo).eq("empresa", empresa))
    .take(20);
}

/** Usuario configurado para el rol que atiende la fase; `undefined` si no está configurado. */
export async function resolverAsignado(
  ctx: QueryCtx | MutationCtx,
  modulo: OnboardingModulo,
  ins: InscripcionDoc,
  fase: string,
): Promise<{ rol: OnboardingRol | null; userId: string | undefined; nombre?: string; email?: string }> {
  const rol = rolParaFase(modulo, fase, ins);
  if (!rol) return { rol: null, userId: undefined };
  const config = await obtenerRolConfig(ctx, modulo, ins.empresa, rol);
  return { rol, userId: config?.userId, nombre: config?.nombre, email: config?.email };
}

export function faseEstaAbierta(row: FaseRow | null | undefined): boolean {
  return !!row && (row.estado === "PENDIENTE" || row.estado === "EN_PROGRESO");
}
