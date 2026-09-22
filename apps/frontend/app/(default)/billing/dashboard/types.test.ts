import { describe, expect, it } from "vitest";
import {
  compareFacturasPorUrgencia,
  normalizeSearchText,
  slaUrgencyRank,
  type FacturaLedgerRow,
} from "./types";

function row(partial: Partial<FacturaLedgerRow> & Pick<FacturaLedgerRow, "facturaId">): FacturaLedgerRow {
  return {
    empresa: 1,
    numeroFactura: "F-1",
    proveedorNombre: "Prov",
    proveedorNit: "123",
    fechaEmision: "2026-01-01",
    faseActual: "revision_lider",
    grupoFase: "lideres",
    owners: [],
    phaseAgeMs: 0,
    slaEstado: "healthy",
    slaUmbralDias: 2,
    valorContable: 100,
    moneda: "COP",
    tipoFlujo: "normal",
    esLegacyJefeDirecto: false,
    fueraDeRango: false,
    integrityIssues: [],
    ...partial,
  };
}

describe("billing dashboard search and sort helpers", () => {
  it("normalizes accents and case for local search", () => {
    expect(normalizeSearchText("José García")).toBe("jose garcia");
    expect(normalizeSearchText("  CORREO@Ejemplo.COM ")).toBe("correo@ejemplo.com");
  });

  it("ranks SLA urgency breached > warning > rest", () => {
    expect(slaUrgencyRank("breached")).toBeLessThan(slaUrgencyRank("warning"));
    expect(slaUrgencyRank("warning")).toBeLessThan(slaUrgencyRank("healthy"));
    expect(slaUrgencyRank("sin_sla")).toBe(slaUrgencyRank("healthy"));
  });

  it("sorts globally by urgency, age, emission date and number", () => {
    const rows = [
      row({
        facturaId: "a" as FacturaLedgerRow["facturaId"],
        slaEstado: "healthy",
        phaseAgeMs: 9_000,
        fechaEmision: "2026-01-02",
        numeroFactura: "F-2",
      }),
      row({
        facturaId: "b" as FacturaLedgerRow["facturaId"],
        slaEstado: "breached",
        phaseAgeMs: 1_000,
        fechaEmision: "2026-01-01",
        numeroFactura: "F-1",
      }),
      row({
        facturaId: "c" as FacturaLedgerRow["facturaId"],
        slaEstado: "warning",
        phaseAgeMs: 5_000,
        fechaEmision: "2026-01-03",
        numeroFactura: "F-3",
      }),
      row({
        facturaId: "d" as FacturaLedgerRow["facturaId"],
        slaEstado: "breached",
        phaseAgeMs: 8_000,
        fechaEmision: "2026-01-01",
        numeroFactura: "F-0",
      }),
    ];

    const sorted = [...rows].sort(compareFacturasPorUrgencia);
    expect(sorted.map((r) => r.facturaId)).toEqual(["d", "b", "c", "a"]);
  });

  it("paginates 21 items into pages of 20 and 1", () => {
    const items = Array.from({ length: 21 }, (_, i) => i + 1);
    const pageSize = 20;
    const page0 = items.slice(0, pageSize);
    const page1 = items.slice(pageSize, pageSize * 2);
    expect(page0).toHaveLength(20);
    expect(page1).toHaveLength(1);
  });

  it("keeps 19 items on a single page", () => {
    const items = Array.from({ length: 19 }, (_, i) => i + 1);
    expect(items.slice(0, 20)).toHaveLength(19);
  });
});
