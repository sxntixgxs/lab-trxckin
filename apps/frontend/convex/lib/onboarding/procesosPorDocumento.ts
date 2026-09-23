import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { puedeVerInscripcion, type OnboardingAccess } from "./access";
import { candidatosNumeroDocumento } from "./nit";
import type { CustomerDoc, InscripcionDoc, OnboardingModulo, SupplierDoc } from "./refs";

const FASES_TERMINALES: ReadonlySet<string> = new Set(["COMPLETADO", "RECHAZADO", "ANULADA"]);
/** Procesos cerrados que muestra la alerta: inscrito (COMPLETADO) y RECHAZADO. ANULADA se oculta. */
const FASES_CERRADAS_VISIBLES: ReadonlySet<string> = new Set(["COMPLETADO", "RECHAZADO"]);
export const MAX_PROCESOS_POR_GRUPO = 5;
const MAX_POR_CANDIDATO = 50;

/** Proceso existente para el mismo documento, tal como lo muestra el modal "Iniciar proceso". */
export type ProcesoPorDocumento<TId extends string = string> = {
  /** null cuando el actor no puede ver la inscripción (nivel responsable, de otro responsable). */
  inscripcionId: TId | null;
  faseActual: string;
  /** Desde cuándo está en la fase actual (para cerrados: fecha de cierre). */
  desde: number;
  creadoEn: number;
  tipoSolicitud: "INSCRIPCIÓN" | "ACTUALIZACIÓN";
  razonSocial: string | null;
  responsableNombre: string | null;
  visible: boolean;
};

export function estaEnCurso(ins: Pick<InscripcionDoc, "faseActual">): boolean {
  return !FASES_TERMINALES.has(ins.faseActual);
}

/**
 * Inscripciones de la empresa cuyo documento coincide (con o sin DV, con o sin ceros a la
 * izquierda), sin filtrar por visibilidad: la regla de "un proceso en curso por documento" aplica
 * aunque el actor no vea el otro proceso.
 */
export async function inscripcionesPorDocumento(
  ctx: QueryCtx | MutationCtx,
  modulo: "supplier",
  empresa: number,
  numeroDocumento: string,
  tipoDocumento?: string | null,
): Promise<SupplierDoc[]>;
export async function inscripcionesPorDocumento(
  ctx: QueryCtx | MutationCtx,
  modulo: "customer",
  empresa: number,
  numeroDocumento: string,
  tipoDocumento?: string | null,
): Promise<CustomerDoc[]>;
export async function inscripcionesPorDocumento(
  ctx: QueryCtx | MutationCtx,
  modulo: OnboardingModulo,
  empresa: number,
  numeroDocumento: string,
  tipoDocumento?: string | null,
): Promise<InscripcionDoc[]>;
export async function inscripcionesPorDocumento(
  ctx: QueryCtx | MutationCtx,
  modulo: OnboardingModulo,
  empresa: number,
  numeroDocumento: string,
  tipoDocumento?: string | null,
): Promise<InscripcionDoc[]> {
  const encontradas = new Map<string, InscripcionDoc>();
  for (const nit of candidatosNumeroDocumento(numeroDocumento, tipoDocumento)) {
    const filas: InscripcionDoc[] =
      modulo === "supplier"
        ? await ctx.db
            .query("onboardingProveedores")
            .withIndex("by_empresa_NIT", (q) => q.eq("empresa", empresa).eq("NIT", nit))
            .take(MAX_POR_CANDIDATO)
        : await ctx.db
            .query("onboardingClientes")
            .withIndex("by_empresa_NIT", (q) => q.eq("empresa", empresa).eq("NIT", nit))
            .take(MAX_POR_CANDIDATO);
    for (const fila of filas) encontradas.set(fila._id, fila);
  }
  return [...encontradas.values()];
}

/** Primer proceso en curso para el documento en la empresa (excluyendo `exceptoId`), o null. */
export async function procesoEnCursoPorDocumento(
  ctx: QueryCtx | MutationCtx,
  modulo: OnboardingModulo,
  empresa: number,
  numeroDocumento: string,
  tipoDocumento?: string | null,
  exceptoId?: string,
): Promise<InscripcionDoc | null> {
  const inscripciones = await inscripcionesPorDocumento(ctx, modulo, empresa, numeroDocumento, tipoDocumento);
  return inscripciones.find((ins) => ins._id !== exceptoId && estaEnCurso(ins)) ?? null;
}

async function nombresDeResponsables(ctx: QueryCtx | MutationCtx, inscripciones: readonly InscripcionDoc[]) {
  const nombres = new Map<string, string>();
  for (const id of new Set(inscripciones.map((ins) => ins.matriz_00.responsableId))) {
    const usuario = await ctx.db
      .query("users")
      .withIndex("by_nestUserId", (q) => q.eq("nestUserId", id))
      .first();
    if (usuario) nombres.set(id, usuario.name);
  }
  return nombres;
}

/**
 * Agrupa los procesos para la alerta: en curso (bloquean un proceso nuevo) y cerrados como
 * COMPLETADO o RECHAZADO, del más reciente al más antiguo. Los que el actor no puede ver se
 * reducen a estado, fechas y responsable.
 */
export async function resumirProcesos<T extends InscripcionDoc>(
  ctx: QueryCtx | MutationCtx,
  access: OnboardingAccess,
  inscripciones: readonly T[],
): Promise<{ enCurso: ProcesoPorDocumento<T["_id"]>[]; finalizados: ProcesoPorDocumento<T["_id"]>[] }> {
  const desde = (ins: T) => ins.faseActualDesde ?? ins._creationTime;
  const enCurso = inscripciones
    .filter(estaEnCurso)
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, MAX_PROCESOS_POR_GRUPO);
  const finalizados = inscripciones
    .filter((ins) => FASES_CERRADAS_VISIBLES.has(ins.faseActual))
    .sort((a, b) => desde(b) - desde(a))
    .slice(0, MAX_PROCESOS_POR_GRUPO);
  const nombres = await nombresDeResponsables(ctx, [...enCurso, ...finalizados]);

  const proyectar = (ins: T): ProcesoPorDocumento<T["_id"]> => {
    const visible = puedeVerInscripcion(access, ins);
    return {
      inscripcionId: visible ? ins._id : null,
      faseActual: ins.faseActual,
      desde: desde(ins),
      creadoEn: ins._creationTime,
      tipoSolicitud: ins.datos_generales_01.tipoSolicitud ?? "INSCRIPCIÓN",
      razonSocial: visible ? ins.datos_generales_01.razonSocial : null,
      responsableNombre: nombres.get(ins.matriz_00.responsableId) ?? null,
      visible,
    };
  };
  return { enCurso: enCurso.map(proyectar), finalizados: finalizados.map(proyectar) };
}
