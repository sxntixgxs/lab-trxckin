export type CentroCostoSiesa = {
  id: string;
  empresa: number;
  compania_id: string;
  rowid: number;
  codigo: string;
  descripcion: string;
  centro_operacion?: string | null;
  responsable?: string | null;
  estado?: boolean;
};

export type CentroCostoOption = {
  id: string;
  codigo: string;
  nombre: string;
};

export const CENTROS_COSTO_SIESA_MAX_RESULTADOS = 50;
export const CENTROS_COSTO_SIESA_CATALOG_LIMIT = 5000;

export const CENTROS_COSTO_SIESA_API =
  "/api/compras/solicitud-compra/centros-costo-siesa";

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type CentroCostoIndexado = {
  centro: CentroCostoSiesa;
  codigoNorm: string;
  descripcionNorm: string;
  palabrasDescripcion: string[];
  restoNorm: string;
};

function indexarCentroCosto(centro: CentroCostoSiesa): CentroCostoIndexado {
  const codigoNorm = normalizarTexto(centro.codigo);
  const descripcionNorm = normalizarTexto(centro.descripcion);
  const palabrasDescripcion = descripcionNorm.split(/\s+/).filter(Boolean);
  const restoNorm = normalizarTexto(centro.centro_operacion ?? "");

  return {
    centro,
    codigoNorm,
    descripcionNorm,
    palabrasDescripcion,
    restoNorm,
  };
}

function centroCostoOptionKey(option: CentroCostoOption): string {
  return option.id;
}

function dedupeCentroCostoOptions(
  options: CentroCostoOption[],
): CentroCostoOption[] {
  const unique = new Map<string, CentroCostoOption>();
  for (const option of options) {
    unique.set(centroCostoOptionKey(option), option);
  }
  return Array.from(unique.values());
}

function dedupeSelectOptions<T extends { value: string }>(options: T[]): T[] {
  const unique = new Map<string, T>();
  for (const option of options) {
    unique.set(option.value, option);
  }
  return Array.from(unique.values());
}

export function toCentroCostoOption(centro: CentroCostoSiesa): CentroCostoOption {
  return {
    id: centro.id.trim(),
    codigo: centro.codigo.trim(),
    nombre: centro.descripcion.trim(),
  };
}

export function toCentroCostoOptions(
  centros: CentroCostoSiesa[],
): CentroCostoOption[] {
  return dedupeCentroCostoOptions(centros.map(toCentroCostoOption));
}

export function parseCentrosCostoSiesa(data: unknown): CentroCostoSiesa[] {
  const rows = getCentrosCostoRows(data);
  const unique = new Map<string, CentroCostoSiesa>();

  for (const row of rows) {
    if (!isRecord(row)) continue;
    // Backend already filters estado: true; keep the same rule client-side.
    if (row.estado !== true) continue;

    const codigo = normalizeCentroCostoText(row.codigo);
    const descripcion = normalizeCentroCostoText(row.descripcion);
    if (!codigo || !descripcion) continue;

    const id =
      normalizeCentroCostoText(row.id) ||
      `${normalizeCentroCostoText(row.empresa) || "0"}:${normalizeCentroCostoText(row.compania_id) || "000"}:${codigo}`;

    unique.set(id, {
      id,
      empresa: Number(row.empresa) || 0,
      compania_id: normalizeCentroCostoText(row.compania_id) || "000",
      rowid: Number(row.rowid) || 0,
      codigo,
      descripcion,
      centro_operacion: normalizeCentroCostoText(row.centro_operacion) || null,
      responsable: normalizeCentroCostoText(row.responsable) || null,
      estado: true,
    });
  }

  return Array.from(unique.values()).sort((a, b) =>
    `${a.codigo} ${a.descripcion}`.localeCompare(
      `${b.codigo} ${b.descripcion}`,
      "es",
      { sensitivity: "base" },
    ),
  );
}

export function normalizeCentrosCostoSiesa(data: unknown): CentroCostoOption[] {
  return toCentroCostoOptions(parseCentrosCostoSiesa(data));
}

export function filtrarCentrosCostoSiesa(
  items: CentroCostoSiesa[],
  query: string,
  max = CENTROS_COSTO_SIESA_MAX_RESULTADOS,
): CentroCostoSiesa[] {
  const indexados = items.map(indexarCentroCosto);
  const q = normalizarTexto(query.trim());

  if (!q) {
    return indexados.slice(0, max).map((item) => item.centro);
  }

  const tokens = q.split(/\s+/);
  const puntuados: { score: number; item: CentroCostoIndexado }[] = [];

  for (const item of indexados) {
    let score = 0;
    let coincideTodo = true;

    for (const token of tokens) {
      if (item.codigoNorm === token) {
        score += 5;
      } else if (item.codigoNorm.startsWith(token)) {
        score += 4;
      } else if (item.palabrasDescripcion.some((palabra) => palabra === token)) {
        score += 4;
      } else if (item.palabrasDescripcion.some((palabra) => palabra.startsWith(token))) {
        score += 3;
      } else if (item.descripcionNorm.includes(token)) {
        score += 2;
      } else if (item.restoNorm.includes(token)) {
        score += 1;
      } else {
        coincideTodo = false;
        break;
      }
    }

    if (!coincideTodo) continue;
    if (item.codigoNorm.startsWith(tokens[0])) score += 2;
    if (item.descripcionNorm.startsWith(tokens[0])) score += 1;
    puntuados.push({ score, item });
  }

  puntuados.sort(
    (a, b) =>
      b.score - a.score ||
      a.item.codigoNorm.localeCompare(b.item.codigoNorm) ||
      a.item.descripcionNorm.localeCompare(b.item.descripcionNorm),
  );

  return puntuados.slice(0, max).map((entry) => entry.item.centro);
}

export function buildCentrosCostoSiesaUrl(params: {
  empresa?: number | string | null;
  limit?: number;
  q?: string;
  companiaId?: string;
}) {
  const search = new URLSearchParams();
  if (params.empresa != null && params.empresa !== "") {
    search.set("empresa", String(params.empresa));
  }
  search.set("limit", String(params.limit ?? CENTROS_COSTO_SIESA_CATALOG_LIMIT));
  if (params.q?.trim()) {
    search.set("q", params.q.trim());
  }
  if (params.companiaId?.trim()) {
    search.set("companiaId", params.companiaId.trim());
  }
  return `${CENTROS_COSTO_SIESA_API}?${search.toString()}`;
}

export function filtrarCentroCostoOptions(
  items: CentroCostoOption[],
  query: string,
  max = CENTROS_COSTO_SIESA_MAX_RESULTADOS,
): CentroCostoOption[] {
  const centros = dedupeCentroCostoOptions(items).map((item) => ({
    id: item.id,
    empresa: 0,
    compania_id: "000",
    rowid: 0,
    codigo: item.codigo,
    descripcion: item.nombre,
  }));

  return filtrarCentrosCostoSiesa(centros, query, max).map(toCentroCostoOption);
}

export function buildCentroCostoDistribucionSelectOptions(
  centrosCosto: CentroCostoOption[],
  search: string,
  selectedValue: string,
): { label: string; value: string }[] {
  const filtered = filtrarCentroCostoOptions(centrosCosto, search);
  const options = dedupeSelectOptions(
    filtered.map((centro) => ({
      label: `${centro.codigo} - ${centro.nombre}`,
      value: centro.id,
    })),
  );

  if (!selectedValue) return options;

  const exists = options.some((option) => option.value === selectedValue);
  if (exists) return options;

  const selected = centrosCosto.find((centro) => centro.id === selectedValue);
  if (!selected) return options;

  return dedupeSelectOptions([
    {
      label: `${selected.codigo} - ${selected.nombre}`,
      value: selected.id,
    },
    ...options,
  ]);
}

export function buildTallerCentroCostoSelectOptions(
  centrosCosto: CentroCostoSiesa[],
  search: string,
  selectedValue: string,
): { label: string; value: string }[] {
  const filtered = filtrarCentrosCostoSiesa(centrosCosto, search);
  const options = filtered.map((centro) => ({
    value: centro.id,
    label: `${centro.codigo} - ${centro.descripcion}`,
  }));

  if (!selectedValue) return options;

  const exists = options.some((option) => option.value === selectedValue);
  if (exists) return options;

  const selected = centrosCosto.find((centro) => centro.id === selectedValue);
  if (!selected) return options;

  return [
    {
      value: selected.id,
      label: `${selected.codigo} - ${selected.descripcion}`,
    },
    ...options,
  ];
}

export async function fetchCentrosCostoSiesaCatalog(params: {
  empresa?: number | string | null;
  signal?: AbortSignal;
}) {
  const response = await fetch(
    buildCentrosCostoSiesaUrl({
      empresa: params.empresa,
      limit: CENTROS_COSTO_SIESA_CATALOG_LIMIT,
    }),
    { cache: "no-store", signal: params.signal },
  );
  if (!response.ok) {
    throw new Error("Error al obtener centros de costo Siesa");
  }
  const data = await response.json();
  return parseCentrosCostoSiesa(data);
}

function getCentrosCostoRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.centrosCosto)) return data.centrosCosto;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function normalizeCentroCostoText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
