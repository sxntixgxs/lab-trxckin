export type ReportPerson = {
  identityKey: string;
  nombre: string;
  email: string;
  cantidadFacturasActuales: number;
  cantidadFacturasHistoricamenteParticipadas: number;
  ultimaParticipacionEn: number;
};

/**
 * The people directory contains one row per company and identity. When the
 * report covers several companies, merge those rows into the single identity
 * option understood by the report filters.
 */
export function mergeReportPeople(rows: ReportPerson[]): ReportPerson[] {
  const merged = new Map<string, ReportPerson>();

  for (const row of rows) {
    const current = merged.get(row.identityKey);
    if (!current) {
      merged.set(row.identityKey, { ...row });
      continue;
    }

    const rowIsNewer = row.ultimaParticipacionEn > current.ultimaParticipacionEn;
    merged.set(row.identityKey, {
      identityKey: current.identityKey,
      nombre: rowIsNewer ? row.nombre || current.nombre : current.nombre || row.nombre,
      email: rowIsNewer ? row.email || current.email : current.email || row.email,
      cantidadFacturasActuales: current.cantidadFacturasActuales + row.cantidadFacturasActuales,
      cantidadFacturasHistoricamenteParticipadas:
        current.cantidadFacturasHistoricamenteParticipadas +
        row.cantidadFacturasHistoricamenteParticipadas,
      ultimaParticipacionEn: Math.max(current.ultimaParticipacionEn, row.ultimaParticipacionEn),
    });
  }

  return Array.from(merged.values());
}
