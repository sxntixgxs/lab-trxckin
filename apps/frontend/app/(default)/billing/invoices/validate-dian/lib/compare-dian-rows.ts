import { getCufeTrimmed, type DianRow } from "./dian-headers";

export type DianMatch = {
  cufe: string;
  facturaId: string;
};

export type ComparedDianRow = {
  row: DianRow;
  facturaId: string | null;
};

export type CompareDianRowsResult = {
  encontradas: ComparedDianRow[];
  noEncontradas: ComparedDianRow[];
};

/**
 * Clasifica filas limpias contra el mapa CUFE → facturaId.
 * Filas sin CUFE o con CUFE ausente del mapa quedan como no encontradas.
 * Se conserva el orden original; duplicados de CUFE se clasifican por fila.
 */
export function compareDianRows(
  rows: DianRow[],
  matches: Iterable<DianMatch>
): CompareDianRowsResult {
  const byCufe = new Map<string, string>();
  for (const match of matches) {
    const cufe = match.cufe.trim();
    if (!cufe || byCufe.has(cufe)) continue;
    byCufe.set(cufe, match.facturaId);
  }

  const encontradas: ComparedDianRow[] = [];
  const noEncontradas: ComparedDianRow[] = [];

  for (const row of rows) {
    const cufe = getCufeTrimmed(row);
    const facturaId = cufe ? (byCufe.get(cufe) ?? null) : null;
    const compared: ComparedDianRow = { row, facturaId };
    if (facturaId) encontradas.push(compared);
    else noEncontradas.push(compared);
  }

  return { encontradas, noEncontradas };
}

export function chunkCufes(cufes: string[], batchSize: number): string[][] {
  if (batchSize <= 0) throw new Error("batchSize debe ser positivo");
  const chunks: string[][] = [];
  for (let i = 0; i < cufes.length; i += batchSize) {
    chunks.push(cufes.slice(i, i + batchSize));
  }
  return chunks;
}
