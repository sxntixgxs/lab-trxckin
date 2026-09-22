import { describe, expect, test } from "vitest";
import { diffDiasCalendario, diffDiasLaborales, esDiaLaboral } from "./dias-laborales";

describe("dias-laborales", () => {
  test("excluye fines de semana", () => {
    // 2026-09-21 is a Monday; 2026-09-28 the next Monday → 5 business days.
    const lunes = new Date(2026, 8, 21, 8, 0, 0).getTime();
    const siguienteLunes = new Date(2026, 8, 28, 8, 0, 0).getTime();
    expect(diffDiasLaborales(lunes, siguienteLunes)).toBe(5);
    expect(diffDiasCalendario(lunes, siguienteLunes)).toBe(7);
  });

  test("excluye festivos colombianos", () => {
    // 2026-01-01 (Año Nuevo) is a Thursday and a holiday.
    expect(esDiaLaboral(new Date(2026, 0, 1, 12))).toBe(false);
    expect(esDiaLaboral(new Date(2026, 0, 2, 12))).toBe(true);
  });

  test("valores nulos o invertidos", () => {
    expect(diffDiasLaborales(null, 10)).toBeNull();
    expect(diffDiasLaborales(20, 10)).toBe(0);
  });
});
