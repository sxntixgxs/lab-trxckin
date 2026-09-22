export type RecordKind = "factura" | "anticipo" | "proveedor" | "cliente" | "centroCosto";

/** Query params the target pages read once to open a record, then remove. */
export const DEEP_LINK_PARAMS = {
  anticipo: "anticipo",
  inscripcion: "inscripcion",
  empresa: "empresa",
  q: "q",
} as const;

export function recordHref(
  kind: RecordKind,
  row: { id: string; empresa?: number; codigo?: string },
): string {
  const id = encodeURIComponent(row.id);
  switch (kind) {
    case "factura":
      return `/billing/invoices/${id}`;
    case "anticipo":
      return `/finance/advances?${DEEP_LINK_PARAMS.anticipo}=${id}`;
    case "proveedor":
      return `/suppliers/onboarding?${DEEP_LINK_PARAMS.inscripcion}=${id}`;
    case "cliente":
      return `/customers/onboarding?${DEEP_LINK_PARAMS.inscripcion}=${id}`;
    case "centroCosto": {
      const params = new URLSearchParams();
      if (row.empresa !== undefined) params.set(DEEP_LINK_PARAMS.empresa, String(row.empresa));
      if (row.codigo) params.set(DEEP_LINK_PARAMS.q, row.codigo);
      const qs = params.toString();
      return `/administracion/centro-costo${qs ? `?${qs}` : ""}`;
    }
  }
}

/** Reads a deep-link param and returns the remaining params, so the page can drop it. */
export function readDeepLinkParam(
  params: URLSearchParams,
  key: string,
): { value: string | null; rest: URLSearchParams } {
  const rest = new URLSearchParams(params);
  const value = rest.get(key);
  rest.delete(key);
  return { value: value && value.trim() ? value.trim() : null, rest };
}
