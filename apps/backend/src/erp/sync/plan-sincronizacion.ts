import type { RegistroCatalogo } from "../siesa/siesa-filas";

export type FilaCatalogo = RegistroCatalogo & { id: string };

export type PlanSincronizacion = {
  crear: RegistroCatalogo[];
  actualizar: Array<{ id: string; datos: RegistroCatalogo }>;
  /** Ids of catalog rows the ERP no longer returns. */
  eliminar: string[];
  sinCambios: number;
};

/** Columns that, when they differ, turn a row into an update. */
const CAMPOS_COMPARADOS = [
  "erp_tercero_id",
  "dv",
  "tipo_documento",
  "tipo_persona",
  "razon_social",
  "descripcion_sucursal",
  "tercero_activo",
  "activo",
  "condicion_pago",
  "email",
  "telefono",
  "direccion",
  "ciudad",
  "departamento",
] as const satisfies readonly (keyof RegistroCatalogo)[];

const clave = (r: Pick<RegistroCatalogo, "id_empresa" | "nit" | "sucursal_id">) => `${r.id_empresa}|${r.nit}|${r.sucursal_id}`;

/**
 * Diff between the catalog rows of one scope and what the ERP returned for it. Rows are keyed by
 * company + document + branch; a key repeated in the ERP data keeps its last occurrence.
 */
export function planificarSincronizacion(
  existentes: readonly FilaCatalogo[],
  entrantes: readonly RegistroCatalogo[],
): PlanSincronizacion {
  const porClave = new Map(entrantes.map((registro) => [clave(registro), registro]));
  const existentesPorClave = new Map(existentes.map((fila) => [clave(fila), fila]));

  const plan: PlanSincronizacion = { crear: [], actualizar: [], eliminar: [], sinCambios: 0 };
  for (const [llave, registro] of porClave) {
    const actual = existentesPorClave.get(llave);
    if (!actual) plan.crear.push(registro);
    else if (CAMPOS_COMPARADOS.some((campo) => actual[campo] !== registro[campo])) {
      plan.actualizar.push({ id: actual.id, datos: registro });
    } else plan.sinCambios++;
  }
  for (const [llave, fila] of existentesPorClave) {
    if (!porClave.has(llave)) plan.eliminar.push(fila.id);
  }
  return plan;
}
