import { z } from "zod";

/** The 15 fields the prompt asks for, in prompt order. */
export const RUT_FIELDS = [
  "nit",
  "dv",
  "tipo_contribuyente",
  "razon_social",
  "tipo_documento",
  "numero_identificacion",
  "primer_apellido",
  "segundo_apellido",
  "primer_nombre",
  "actividad_principal_codigo",
  "actividad_secundaria_codigo",
  "departamento",
  "municipio",
  "direccion",
  "nombre_representante_legal",
] as const;

export type RutField = (typeof RUT_FIELDS)[number];

/** Numbers become strings, text is trimmed, and "" / "null" / missing become null. */
function limpiarTexto(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value !== "string") return value;
  const texto = value.trim();
  return texto === "" || texto.toLowerCase() === "null" ? null : texto;
}

/** "Persona Jurídica", "JURIDICA" → "juridica"; anything else is left for the enum to reject. */
function limpiarTipoContribuyente(value: unknown): unknown {
  const texto = limpiarTexto(value);
  if (typeof texto !== "string") return texto;
  const plano = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (plano.includes("juridica")) return "juridica";
  if (plano.includes("natural")) return "natural";
  return plano;
}

const texto = z.preprocess(limpiarTexto, z.string().nullable());

/**
 * Model output for a RUT. Lenient but deterministic about formatting; unknown keys pass
 * through untouched (the route has always forwarded them).
 */
export const rutFieldsSchema = z.looseObject({
  nit: texto,
  dv: texto,
  tipo_contribuyente: z.preprocess(limpiarTipoContribuyente, z.enum(["natural", "juridica"]).nullable()),
  razon_social: texto,
  tipo_documento: texto,
  numero_identificacion: texto,
  primer_apellido: texto,
  segundo_apellido: texto,
  primer_nombre: texto,
  actividad_principal_codigo: texto,
  actividad_secundaria_codigo: texto,
  departamento: texto,
  municipio: texto,
  direccion: texto,
  nombre_representante_legal: texto,
});

/** The 15 validated fields (without the pass-through keys). */
export type RutFields = Pick<z.infer<typeof rutFieldsSchema>, RutField>;
