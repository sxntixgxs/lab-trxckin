import { describe, expect, it } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildCajaMenorProceso,
  CAJA_MENOR_PHASE_LABELS,
  cajaMenorProcesoToTimingMovements,
  mapReembolsoEstadoToPublicPhase,
  resolvePublicPhase,
} from "./lib/cajaMenorFacturacionAdapter";
import { buildInvoiceTiming } from "./lib/facturacionTiempos";

const NOW = 1_700_000_000_000;

function reembolso(
  overrides: Partial<Doc<"cajasMenoresReembolsos">> = {}
): Doc<"cajasMenoresReembolsos"> {
  return {
    _id: "reembolso-1" as Id<"cajasMenoresReembolsos">,
    _creationTime: NOW,
    cajaMenorId: "caja-1" as Id<"cajasMenores">,
    movimientoIds: ["mov-1" as Id<"facturacionCajaMenorMovimientos">],
    estado: "pendiente_revision",
    valorTotal: 100_000,
    custodioUserId: "custodio-1",
    custodioNombre: "Custodio",
    custodioEmail: "custodio@example.com",
    actualizadoEn: NOW,
    creadoEn: NOW,
    ...overrides,
  } as Doc<"cajasMenoresReembolsos">;
}

function movimiento(
  overrides: Partial<Doc<"facturacionCajaMenorMovimientos">> = {}
): Doc<"facturacionCajaMenorMovimientos"> {
  return {
    _id: "mov-1" as Id<"facturacionCajaMenorMovimientos">,
    _creationTime: NOW,
    facturaId: "factura-1" as Id<"facturacionFacturas">,
    cajaMenorId: "caja-1" as Id<"cajasMenores">,
    estado: "en_reembolso",
    reembolsoId: "reembolso-1" as Id<"cajasMenoresReembolsos">,
    valor: 100_000,
    actorUserId: "custodio-1",
    actorNombre: "Custodio",
    actorEmail: "custodio@example.com",
    actualizadoEn: NOW,
    creadoEn: NOW,
    ...overrides,
  } as Doc<"facturacionCajaMenorMovimientos">;
}

describe("cajaMenorFacturacionAdapter", () => {
  it("maps reimbursement states to public phases", () => {
    expect(mapReembolsoEstadoToPublicPhase("pendiente_aprobacion_lider")).toBe(
      "caja_menor_aprobacion_lider"
    );
    expect(mapReembolsoEstadoToPublicPhase("pendiente_revision")).toBe("caja_menor_revision");
    expect(mapReembolsoEstadoToPublicPhase("aprobado_pendiente_recibo")).toBe(
      "caja_menor_tesoreria_pendiente_regularizar"
    );
    expect(mapReembolsoEstadoToPublicPhase("rechazado")).toBe("caja_menor_rechazado");
  });

  it("uses custodian for pending-generate phase", () => {
    const phase = resolvePublicPhase({
      factura: {
        esLegalizacionCajaMenor: true,
        cajaMenorMarcadorUserId: "marcador-1",
        cajaMenorMarcadorNombre: "Marcador",
        cajaMenorMarcadorEmail: "marcador@example.com",
      },
      tareaEstado: "reembolso_caja_menor",
      movimiento: movimiento({ estado: "pendiente_reembolso", reembolsoId: undefined }),
      reembolso: null,
    });
    expect(phase.fase).toBe("caja_menor_por_generar");

    const proceso = buildCajaMenorProceso({
      factura: {
        esLegalizacionCajaMenor: true,
        cajaMenorMarcadorUserId: "marcador-1",
        cajaMenorMarcadorNombre: "Marcador",
        cajaMenorMarcadorEmail: "marcador@example.com",
      },
      tareaEstado: "reembolso_caja_menor",
      movimientos: [movimiento({ estado: "pendiente_reembolso", reembolsoId: undefined })],
      reembolsos: [],
      eventos: [],
      aprobaciones: [],
      nowMs: NOW,
    });
    expect(proceso?.responsableActual?.nombre).toBe("Marcador");
  });

  it("keeps legacy pending-receipt as tesoreria pendiente de regularizar", () => {
    const phase = resolvePublicPhase({
      factura: { esLegalizacionCajaMenor: true },
      tareaEstado: "reembolso_caja_menor",
      movimiento: movimiento({ estado: "en_reembolso" }),
      reembolso: reembolso({ estado: "aprobado_pendiente_recibo" }),
    });
    expect(phase.fase).toBe("caja_menor_tesoreria_pendiente_regularizar");
  });

  it("marks reimbursed movimiento as reembolsada", () => {
    const phase = resolvePublicPhase({
      factura: { esLegalizacionCajaMenor: true },
      movimiento: movimiento({ estado: "reembolsado" }),
      reembolso: reembolso({ estado: "recibido", recibidoEn: NOW }),
    });
    expect(phase.fase).toBe("caja_menor_reembolsada");
  });

  it("warns when caja menor link is missing", () => {
    const phase = resolvePublicPhase({
      factura: { esLegalizacionCajaMenor: true },
      tareaEstado: "reembolso_caja_menor",
      movimiento: null,
      reembolso: null,
    });
    expect(phase.fase).toBe("caja_menor_relacion_pendiente");
    expect(phase.advertencia).toMatch(/reembolso relacionado/i);
  });

  it("merges caja menor intervals into timing without false sin_asignar gaps", () => {
    const inicio = NOW - 86_400_000;
    const cajaMenorMovimientos = cajaMenorProcesoToTimingMovements(
      [
        {
          id: "cm-1",
          fase: "caja_menor_revision",
          faseLabel: CAJA_MENOR_PHASE_LABELS.caja_menor_revision,
          rol: "revisor",
          estado: "pendiente_revision",
          responsableUserId: "revisor-1",
          responsableNombre: "Revisor",
          responsableEmail: "revisor@example.com",
          inicioEn: inicio,
          finEn: NOW,
          duracionMs: NOW - inicio,
          diasLaborales: 1,
          enCurso: true,
          observacion: "En revisión",
        },
      ],
      NOW
    );

    const timing = buildInvoiceTiming({
      factura: { creadoEn: inicio },
      tarea: { estado: "reembolso_caja_menor" },
      asignaciones: [
        {
          id: "a-1",
          estado: "completada",
          fase: "revision_lider",
          fechaAsignacion: inicio,
          fechaCompletado: inicio + 3_600_000,
        },
      ],
      cajaMenorMovimientos,
      nowMs: NOW,
    });

    const sinAsignar = timing.movimientos.filter(
      (movement) => movement.tipoIntervalo === "sin_asignar" && movement.duracionMs > 0
    );
    expect(cajaMenorMovimientos).toHaveLength(1);
    expect(sinAsignar).toHaveLength(0);
  });

  it("splits a reassignment into two intervals of the same phase", () => {
    const t0 = NOW - 3 * 3_600_000;
    const t1 = NOW - 2 * 3_600_000;
    const t2 = NOW - 3_600_000;
    const proceso = buildCajaMenorProceso({
      factura: { esLegalizacionCajaMenor: true },
      tareaEstado: "reembolso_caja_menor",
      movimientos: [movimiento()],
      reembolsos: [
        reembolso({
          estado: "pendiente_revision",
          reviewAssignedUserId: "revisor-2",
          reviewAssignedNombre: "Revisor B",
          reviewAssignedEmail: "revisor-b@example.com",
          creadoEn: t0,
        }),
      ],
      eventos: [],
      aprobaciones: [
        {
          _id: "apr-1" as Id<"facturacionAprobaciones">,
          _creationTime: t0,
          facturaId: "factura-1" as Id<"facturacionFacturas">,
          tareaId: "tarea-1" as Id<"facturacionTareas">,
          actorNombre: "Sistema",
          actorEmail: "sistema@example.com",
          accion: "generar_reembolso_caja_menor",
          comentario: "Generado",
          estadoAnterior: "pendiente_reembolso",
          estadoNuevo: "pendiente_revision",
          creadoEn: t0,
          cajaMenorContexto: {
            reembolsoId: "reembolso-1" as Id<"cajasMenoresReembolsos">,
            intentoId: "reembolso-1",
            responsableDestino: {
              userId: "revisor-1",
              nombre: "Revisor A",
              email: "revisor-a@example.com",
            },
          },
        },
        {
          _id: "apr-2" as Id<"facturacionAprobaciones">,
          _creationTime: t1,
          facturaId: "factura-1" as Id<"facturacionFacturas">,
          tareaId: "tarea-1" as Id<"facturacionTareas">,
          actorNombre: "Admin",
          actorEmail: "admin@example.com",
          accion: "reasignar_revisor_caja_menor",
          comentario: "Cambio de revisor",
          estadoAnterior: "pendiente_revision",
          estadoNuevo: "pendiente_revision",
          creadoEn: t1,
          cajaMenorContexto: {
            reembolsoId: "reembolso-1" as Id<"cajasMenoresReembolsos">,
            intentoId: "reembolso-1",
            responsableDestino: {
              userId: "revisor-2",
              nombre: "Revisor B",
              email: "revisor-b@example.com",
            },
          },
        },
      ] as Doc<"facturacionAprobaciones">[],
      nowMs: t2,
    });

    const revisionIntervals = proceso?.intervalos.filter(
      (intervalo) => intervalo.fase === "caja_menor_revision"
    );
    expect(revisionIntervals).toHaveLength(2);
    expect(revisionIntervals?.[0]?.estado).toBe("reasignada");
    expect(revisionIntervals?.[0]?.finEn).toBe(t1);
    expect(revisionIntervals?.[1]?.enCurso).toBe(true);
  });
});
