import { describe, expect, it } from "vitest";
import {
  buildFacturaTiempoMovimientos,
  buildFacturaTiempoResumen,
  buildInvoiceTiming,
  resolveInvoiceClosure,
  type TimingAsignacion,
} from "./lib/facturacionTiempos";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const at = (value: string) => new Date(value).getTime();

describe("facturacion process timing", () => {
  it("keeps an active invoice open through nowMs", () => {
    const inicio = at("2026-08-11T09:00:00-05:00");
    const now = at("2026-08-12T09:00:00-05:00");
    const result = buildFacturaTiempoResumen({
      factura: { id: "f-activa", creadoEn: inicio },
      tarea: { estado: "causacion" },
      nowMs: now,
    });

    expect(result.finEn).toBe(now);
    expect(result.enCurso).toBe(true);
    expect(result.tiempoCalendarioMs).toBe(DAY);
    expect(result.sinWorkflow).toBe(false);
    expect(result).not.toHaveProperty("finCalidad");
    expect(result).not.toHaveProperty("contieneEstimaciones");
  });

  it("uses exact finalizadoEn for a terminal invoice", () => {
    const inicio = at("2026-08-03T09:00:00-05:00");
    const fin = at("2026-08-05T15:00:00-05:00");
    const result = buildFacturaTiempoResumen({
      factura: { creadoEn: inicio, actualizadoEn: fin + DAY },
      tarea: { estado: "pagada", finalizadoEn: fin },
      nowMs: fin + DAY,
    });

    expect(result.enCurso).toBe(false);
    expect(result.finEn).toBe(fin);
  });

  it("falls back to the latest approval without exposing data-quality metadata", () => {
    const inicio = at("2026-08-03T09:00:00-05:00");
    const approval = at("2026-08-06T12:00:00-05:00");
    const result = resolveInvoiceClosure({
      factura: { creadoEn: inicio, actualizadoEn: approval + DAY },
      tarea: { estado: "cerrada", actualizadoEn: approval - DAY },
      asignaciones: [
        {
          fechaAsignacion: at("2026-08-03T10:00:00-05:00"),
          fechaCompletado: at("2026-08-04T10:00:00-05:00"),
        },
      ],
      aprobaciones: [{ creadoEn: approval }],
      nowMs: approval + DAY,
    });

    expect(result.finEn).toBe(approval);
    expect(result.enCurso).toBe(false);
  });

  it("creates a single Sin asignar movement for an invoice without workflow", () => {
    const inicio = at("2026-08-10T09:00:00-05:00");
    const now = at("2026-08-11T09:00:00-05:00");
    const result = buildInvoiceTiming({
      factura: { id: "f-sin-workflow", creadoEn: inicio },
      tarea: null,
      nowMs: now,
    });

    expect(result.sinWorkflow).toBe(true);
    expect(result.movimientos).toHaveLength(1);
    expect(result.movimientos[0]).toMatchObject({
      tipoIntervalo: "sin_asignar",
      estado: "sin_asignar",
      enCurso: true,
      inicioEn: inicio,
      finEn: now,
    });
    expect(result.movimientos[0]).not.toHaveProperty("calidadDato");
    expect(result.tiempoCalendarioSinAsignarMs).toBe(DAY);
  });

  it("uses exact, duration-derived, approval-derived and in-progress assignment ends", () => {
    const inicio = at("2026-08-03T09:00:00-05:00");
    const now = at("2026-08-04T18:00:00-05:00");
    const assignments: TimingAsignacion[] = [
      {
        id: "a-exact",
        fase: "recepcion",
        rol: "recepcion",
        estado: "completada",
        fechaAsignacion: inicio,
        fechaCompletado: inicio + 2 * HOUR,
      },
      {
        id: "a-duration",
        fase: "revision_lider",
        rol: "lider",
        estado: "devuelta",
        fechaAsignacion: inicio + 3 * HOUR,
        duracionMs: HOUR,
      },
      {
        id: "a-approval",
        fase: "causacion",
        rol: "analista_causacion",
        estado: "rechazada",
        fechaAsignacion: inicio + 5 * HOUR,
        actualizadoEn: now,
      },
      {
        id: "a-pending",
        fase: "eventos_dian",
        rol: "eventos_dian",
        estado: "pendiente",
        fechaAsignacion: inicio + 6 * HOUR,
      },
    ];
    const result = buildInvoiceTiming({
      factura: { creadoEn: inicio },
      tarea: { estado: "eventos_dian" },
      asignaciones: assignments,
      aprobaciones: [{ asignacionId: "a-approval", creadoEn: inicio + 6 * HOUR }],
      nowMs: now,
    });
    const movementById = new Map(
      result.movimientos
        .filter((movement) => movement.tipoIntervalo === "asignacion")
        .map((m) => [m.id, m])
    );

    expect(movementById.get("a-exact")).toMatchObject({ enCurso: false, duracionMs: 2 * HOUR });
    expect(movementById.get("a-duration")).toMatchObject({ enCurso: false, duracionMs: HOUR });
    expect(movementById.get("a-approval")).toMatchObject({
      enCurso: false,
      finEn: inicio + 6 * HOUR,
    });
    expect(movementById.get("a-pending")).toMatchObject({ enCurso: true, finEn: now });
  });

  it("does not create a negative interval", () => {
    const inicio = at("2026-08-04T10:00:00-05:00");
    const result = buildFacturaTiempoMovimientos({
      factura: { creadoEn: inicio },
      tarea: { estado: "causacion" },
      asignaciones: [
        {
          id: "a-invalid",
          estado: "completada",
          fechaAsignacion: inicio,
          fechaCompletado: inicio - HOUR,
        },
      ],
      nowMs: inicio + DAY,
    });
    const invalid = result.find((movement) => movement.id === "a-invalid");

    expect(invalid).toMatchObject({
      duracionMs: 0,
    });
    expect(invalid).not.toHaveProperty("calidadDato");
    expect(invalid).not.toHaveProperty("intervaloValido");
  });

  it("fills gaps while unioning parallel assignments, without inflating total time", () => {
    const inicio = at("2026-08-03T09:00:00-05:00");
    const fin = at("2026-08-03T17:00:00-05:00");
    const result = buildInvoiceTiming({
      factura: { creadoEn: inicio },
      tarea: { estado: "cerrada", finalizadoEn: fin },
      asignaciones: [
        {
          id: "a-1",
          estado: "completada",
          fechaAsignacion: inicio + HOUR,
          fechaCompletado: inicio + 4 * HOUR,
        },
        {
          id: "a-2",
          estado: "completada",
          fechaAsignacion: inicio + 2 * HOUR,
          fechaCompletado: inicio + 5 * HOUR,
        },
        {
          id: "a-3",
          estado: "completada",
          fechaAsignacion: inicio + 6 * HOUR,
          fechaCompletado: fin - HOUR,
        },
      ],
      nowMs: fin + DAY,
    });
    const unassigned = result.movimientos.filter(
      (movement) => movement.tipoIntervalo === "sin_asignar"
    );

    expect(unassigned).toHaveLength(3);
    expect(unassigned.map((movement) => movement.duracionMs)).toEqual([HOUR, HOUR, HOUR]);
    expect(result.tiempoCalendarioMs).toBe(8 * HOUR);
    expect(result.tiempoCalendarioSinAsignarMs).toBe(3 * HOUR);
  });

  it("excludes Peajes from the time report", () => {
    const result = buildInvoiceTiming({
      factura: { id: "f-peaje", creadoEn: 100, esPeaje: true },
      tarea: { estado: "pagada", finalizadoEn: 200 },
      nowMs: 300,
    });

    expect(result.incluidaEnReporte).toBe(false);
    expect(result.excluidaPorPeaje).toBe(true);
    expect(result.movimientos).toEqual([]);
  });

  it("calculates Colombian business days independently of calendar duration", () => {
    const inicio = at("2026-07-10T12:00:00-05:00"); // Friday
    const fin = at("2026-07-13T12:00:00-05:00"); // Monday
    const result = buildFacturaTiempoResumen({
      factura: { creadoEn: inicio },
      tarea: { estado: "cerrada", finalizadoEn: fin },
      nowMs: fin,
    });

    expect(result.tiempoCalendarioMs).toBe(3 * DAY);
    expect(result.diasLaborales).toBeGreaterThan(0.9);
    expect(result.diasLaborales).toBeLessThan(1.2);
  });

  it("counts caja menor movements in covered intervals", () => {
    const inicio = at("2026-08-03T09:00:00-05:00");
    const now = at("2026-08-04T09:00:00-05:00");
    const result = buildInvoiceTiming({
      factura: { creadoEn: inicio },
      tarea: { estado: "reembolso_caja_menor" },
      cajaMenorMovimientos: [
        {
          id: "cm-1",
          tipoIntervalo: "caja_menor",
          esSintetico: false,
          fase: "caja_menor_revision",
          rol: "revisor",
          estado: "pendiente_revision",
          responsableUserId: "revisor-1",
          responsableNombre: "Revisor",
          responsableEmail: "revisor@example.com",
          procesoId: null,
          procesoNombre: null,
          inicioEn: inicio + HOUR,
          finEn: now,
          duracionMs: now - (inicio + HOUR),
          diasLaborales: 1,
          enCurso: true,
          comentario: null,
        },
      ],
      nowMs: now,
    });

    expect(result.cantidadMovimientos).toBe(1);
    expect(
      result.movimientos.some((movement) => movement.tipoIntervalo === "caja_menor")
    ).toBe(true);
    expect(result.tiempoCalendarioSinAsignarMs).toBeLessThan(result.tiempoCalendarioMs);
  });
});
