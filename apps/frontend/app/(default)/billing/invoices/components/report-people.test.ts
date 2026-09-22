import { describe, expect, test } from "vitest";
import { mergeReportPeople, type ReportPerson } from "./report-people";

function person(overrides: Partial<ReportPerson> = {}): ReportPerson {
  return {
    identityKey: "id:user-1",
    nombre: "Nombre anterior",
    email: "anterior@example.com",
    cantidadFacturasActuales: 2,
    cantidadFacturasHistoricamenteParticipadas: 5,
    ultimaParticipacionEn: 100,
    ...overrides,
  };
}

describe("mergeReportPeople", () => {
  test("merges the same identity across companies and aggregates its counters", () => {
    expect(
      mergeReportPeople([
        person(),
        person({
          nombre: "Nombre vigente",
          email: "vigente@example.com",
          cantidadFacturasActuales: 3,
          cantidadFacturasHistoricamenteParticipadas: 7,
          ultimaParticipacionEn: 200,
        }),
      ])
    ).toEqual([
      person({
        nombre: "Nombre vigente",
        email: "vigente@example.com",
        cantidadFacturasActuales: 5,
        cantidadFacturasHistoricamenteParticipadas: 12,
        ultimaParticipacionEn: 200,
      }),
    ]);
  });

  test("keeps distinct identities as separate filter options", () => {
    const rows = [person(), person({ identityKey: "id:user-2" })];

    expect(mergeReportPeople(rows)).toEqual(rows);
  });

  test("uses a non-empty profile value when the newest row lacks one", () => {
    expect(
      mergeReportPeople([
        person(),
        person({ nombre: "", email: "", ultimaParticipacionEn: 200 }),
      ])[0]
    ).toMatchObject({ nombre: "Nombre anterior", email: "anterior@example.com" });
  });
});
