import { normalizarNit } from "../../common/nit";
import type { EntidadErp } from "../erp.config";
import type { FilaErp } from "./siesa-client";

/** Document types in the app's vocabulary (apps/frontend/lib/onboarding/risk/shared.ts). */
export type TipoDocumentoApp = "NIT" | "C.C." | "C.E" | "P.A.";
export type TipoPersonaApp = "PERSONA_JURIDICA" | "PERSONA_NATURAL";

/** One catalog row (Proveedor / Cliente) as built from an ERP row. */
export type RegistroCatalogo = {
  id_empresa: number;
  erp_tercero_id: string;
  nit: string;
  dv: string | null;
  tipo_documento: TipoDocumentoApp;
  tipo_persona: TipoPersonaApp;
  razon_social: string;
  sucursal_id: string;
  descripcion_sucursal: string;
  tercero_activo: boolean;
  activo: boolean;
  condicion_pago: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
};

const TIPO_DOCUMENTO_POR_CODIGO: Readonly<Record<string, TipoDocumentoApp>> = {
  N: "NIT",
  C: "C.C.",
  E: "C.E",
  P: "P.A.",
};

/** Case-insensitive, trimmed read of the first present column (SIESA's casing varies). */
export function valorFila(fila: FilaErp, ...claves: string[]): string {
  const entradas = Object.entries(fila);
  for (const clave of claves) {
    const encontrada = entradas.find(([k]) => k.toLowerCase() === clave.toLowerCase());
    if (encontrada && encontrada[1] !== null && encontrada[1] !== undefined) {
      const valor = String(encontrada[1]).trim();
      if (valor) return valor;
    }
  }
  return "";
}

/**
 * Maps an `API_v2_Proveedores` / `API_v2_Clientes` row to a catalog row. Returns null for rows
 * without a document number or branch, which cannot be keyed. Missing state columns count as
 * active, the way SIESA defaults them.
 */
export function mapearFila(entidad: EntidadErp, fila: FilaErp, empresa: number): RegistroCatalogo | null {
  const prefijo = entidad === "PROVEEDORES" ? "f202" : "f201";
  const nit = normalizarNit(valorFila(fila, "f200_nit", "nit"));
  const sucursal = valorFila(fila, `${prefijo}_id_sucursal`, "id_sucursal", "sucursalId");
  if (!nit || !sucursal) return null;

  const razonSocial = valorFila(fila, "f200_razon_social", "razon_social");
  const descripcion = valorFila(fila, `${prefijo}_descripcion_sucursal`, "descripcion_sucursal");
  const estadoSucursal = valorFila(fila, entidad === "PROVEEDORES" ? "f202_ind_estado" : "f201_ind_estado_activo");
  const texto = (...claves: string[]) => valorFila(fila, ...claves) || null;

  return {
    id_empresa: empresa,
    erp_tercero_id: valorFila(fila, "f200_id", "id") || nit,
    nit,
    dv: texto("f200_dv_nit"),
    tipo_documento: TIPO_DOCUMENTO_POR_CODIGO[valorFila(fila, "f200_id_tipo_ident").toUpperCase()] ?? "NIT",
    tipo_persona: valorFila(fila, "f200_ind_tipo_tercero") === "1" ? "PERSONA_NATURAL" : "PERSONA_JURIDICA",
    razon_social: razonSocial || descripcion,
    sucursal_id: sucursal,
    descripcion_sucursal: descripcion || razonSocial,
    tercero_activo: valorFila(fila, "f200_ind_estado") !== "0",
    activo: estadoSucursal !== "0",
    condicion_pago: texto(`${prefijo}_id_cond_pago`),
    email: texto("f015_email"),
    telefono: texto("f015_telefono"),
    direccion: texto("f015_direccion1"),
    ciudad: texto("f015_ciudad"),
    departamento: texto("f015_departamento"),
  };
}
