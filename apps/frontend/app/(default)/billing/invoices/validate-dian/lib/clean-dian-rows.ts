import {
  getCufeTrimmed,
  isApplicationResponseTipo,
  type DianRow,
} from "./dian-headers";

export type CleanDianRowsResult = {
  originalCount: number;
  removedApplicationResponseCount: number;
  rows: DianRow[];
};

/**
 * Elimina únicamente filas cuyo tipo sea exactamente "Application response"
 * (ignorando mayúsculas y espacios). Conserva el orden original.
 */
export function cleanDianRows(rows: DianRow[]): CleanDianRowsResult {
  const kept: DianRow[] = [];
  let removedApplicationResponseCount = 0;

  for (const row of rows) {
    if (isApplicationResponseTipo(row["Tipo de documento"])) {
      removedApplicationResponseCount += 1;
      continue;
    }
    kept.push(row);
  }

  return {
    originalCount: rows.length,
    removedApplicationResponseCount,
    rows: kept,
  };
}

/** CUFE/CUDE únicos no vacíos, en orden de primera aparición. */
export function collectUniqueCufes(rows: DianRow[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const cufe = getCufeTrimmed(row);
    if (!cufe || seen.has(cufe)) continue;
    seen.add(cufe);
    unique.push(cufe);
  }
  return unique;
}
