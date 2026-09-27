/**
 * Extraction prompt sent with the RUT. The NIT/DV rule used to read "NIT should NOT include
 * the DV digit"; on scanned documents models took it as "drop the last digit of the NIT"
 * (evals/rut, 2026-09-27), so it now names the two boxes instead.
 */
export const RUT_PROMPT = `Extract the following fields from this DIAN RUT document and return ONLY a valid JSON object.
No markdown, no explanation, just raw JSON.

Rules:
- If a field is not present or empty, use null
- For "tipo_contribuyente": return either "natural" or "juridica"
- "nit" is box 5 (Número de Identificación Tributaria) and "dv" is the separate box 6 (DV). Copy every digit of box 5 into "nit", exactly as printed, and box 6 into "dv". Never drop, add or move a digit between them.
- Return codes as strings
- For "departamento": extract the department name (e.g. "CUNDINAMARCA", "ANTIOQUIA")
- For "municipio": extract the city/municipality name (e.g. "BOGOTÁ D.C.", "MEDELLÍN")
- For "direccion": extract the full address as written on the document
- For "nombre_representante_legal": extract the full name of the legal representative if present (persona jurídica); use null if not found or if natural person

{
  "nit": "",
  "dv": "",
  "tipo_contribuyente": "",
  "razon_social": null,
  "tipo_documento": null,
  "numero_identificacion": null,
  "primer_apellido": null,
  "segundo_apellido": null,
  "primer_nombre": null,
  "actividad_principal_codigo": "",
  "actividad_secundaria_codigo": null,
  "departamento": null,
  "municipio": null,
  "direccion": null,
  "nombre_representante_legal": null
}`;
