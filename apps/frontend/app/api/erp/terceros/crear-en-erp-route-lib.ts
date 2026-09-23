import { mensajeDeError } from "@/lib/erp/errores";
import type { ExistenciaTerceroErp, RegistroErp } from "@/lib/erp/terceros";

export type ModuloOnboarding = "supplier" | "customer";

/** What Convex returns for the tercero (onboarding/erp:datosParaCrearEnErp). */
export type DatosTerceroParaErp = {
  entidad: "PROVEEDOR" | "CLIENTE";
  empresa: number;
  tipoDocumento: string;
  numeroDocumento: string;
  tipoPersona: string;
  razonSocial: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  codigoCiiu?: string;
  formaPago?: string;
  plazo?: string;
  registroErp: RegistroErp | null;
};

/** What Nest answers after registering it in the ERP (POST /api/v1/erp/terceros). */
export type RespuestaCreacionErp = {
  erpTerceroId: string;
  sucursalId: string;
  accion: "CREADO" | "ACTUALIZADO";
  catalogoActualizado: boolean;
  existencia: ExistenciaTerceroErp;
};

export type DependenciasCrearEnErp = {
  /** Convex, with the user's token: checks they may act on the last phase and returns the data. */
  obtenerDatos: () => Promise<DatosTerceroParaErp>;
  /** Nest (internal key + user token): registers the tercero in the ERP and re-syncs it. */
  registrarEnErp: (datos: Omit<DatosTerceroParaErp, "registroErp">) => Promise<Response>;
  /** Convex, with the user's token and the server secret: records the result on the inscription. */
  anotarEnInscripcion: (resultado: RespuestaCreacionErp) => Promise<RegistroErp>;
};

export type ResultadoCrearEnErp =
  | { ok: true; registroErp: RegistroErp; existencia: ExistenciaTerceroErp | null }
  | { ok: false; status: number; error: string };

/**
 * "Crear en ERP" from the last onboarding phase. The tercero data comes from Convex (never from
 * the browser); Nest only runs it after Convex confirmed the user may act on the phase.
 */
export async function crearTerceroEnErp(deps: DependenciasCrearEnErp): Promise<ResultadoCrearEnErp> {
  let datos: DatosTerceroParaErp;
  try {
    datos = await deps.obtenerDatos();
  } catch (error) {
    return { ok: false, status: 403, error: mensajeDeError(error, "No puedes registrar esta inscripción en el ERP.") };
  }
  const { registroErp, ...payload } = datos;
  if (registroErp?.catalogoActualizado) return { ok: true, registroErp, existencia: null };

  let respuesta: Response;
  try {
    respuesta = await deps.registrarEnErp(payload);
  } catch {
    return { ok: false, status: 502, error: "No se pudo conectar con el backend." };
  }
  const cuerpo: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    return { ok: false, status: respuesta.status, error: mensajeDeError(cuerpo, "No se pudo registrar el tercero en el ERP.") };
  }

  const resultado = cuerpo as RespuestaCreacionErp;
  try {
    const registro = await deps.anotarEnInscripcion(resultado);
    return { ok: true, registroErp: registro, existencia: resultado.existencia ?? null };
  } catch (error) {
    // The ERP already has it; only the note on the inscription failed. Retrying is safe.
    return {
      ok: false,
      status: 500,
      error: mensajeDeError(error, "El tercero quedó en el ERP, pero no se pudo anotar en la inscripción. Reintenta."),
    };
  }
}
