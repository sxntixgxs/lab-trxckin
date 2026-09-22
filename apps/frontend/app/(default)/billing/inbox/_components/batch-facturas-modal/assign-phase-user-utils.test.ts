import { describe, expect, test } from "vitest";

import type { BuzonTarea } from "../../../components/buzon-row";
import {
  ASSIGN_PHASE_USER_ACTION,
  getGerenciaPhaseAssignmentActionIfAllowed,
  isActorInGerenciaPool,
  validatePhaseAssignmentPlan,
  wouldProduceSamePhaseAndUser,
} from "./assign-phase-user-utils";
import type { BatchPlan, PhaseAssignmentDraft } from "./types";

function createTarea(stage: string, overrides: Partial<BuzonTarea> = {}): BuzonTarea {
  return {
    _id: "tarea-1" as BuzonTarea["_id"],
    _creationTime: 0,
    facturaId: "factura-1" as BuzonTarea["facturaId"],
    estado: stage,
    faseAsignacion: stage,
    asignacionId: "asignacion-1" as BuzonTarea["asignacionId"],
    asignacion: {
      _id: "asignacion-1" as NonNullable<BuzonTarea["asignacion"]>["_id"],
      _creationTime: 0,
      asignadoAUserId: "user-current",
      asignadoANombre: "Actual",
      asignadoAEmail: "actual@example.com",
    } as NonNullable<BuzonTarea["asignacion"]>,
    factura: {
      _id: "factura-1" as NonNullable<BuzonTarea["factura"]>["_id"],
      _creationTime: 0,
      empresa: 1,
      numeroFactura: "FAC-001",
    } as NonNullable<BuzonTarea["factura"]>,
    pdfUrl: null,
    ...overrides,
  } as BuzonTarea;
}

describe("assign phase user utils", () => {
  test("expone acción solo para gerencia configurada por id de sesión", () => {
    const gerenciasPorEmpresa = {
      1: [{ id: "gerente-1", nombre: "Gerente", email: "g@example.com" } as const],
    };

    expect(
      isActorInGerenciaPool("gerente-1", 1, gerenciasPorEmpresa as never),
    ).toBe(true);
    expect(
      isActorInGerenciaPool("gerente-1", 2, gerenciasPorEmpresa as never),
    ).toBe(false);
    expect(
      isActorInGerenciaPool(undefined, 1, gerenciasPorEmpresa as never),
    ).toBe(false);
    expect(
      getGerenciaPhaseAssignmentActionIfAllowed({
        actorUserId: "gerente-1",
        empresa: 1,
        gerenciasPorEmpresa: gerenciasPorEmpresa as never,
      }),
    ).toEqual(ASSIGN_PHASE_USER_ACTION);
  });

  test("valida fase, usuario, observación y pool vacío", () => {
    const context = {
      recepcionPorEmpresa: {},
      lideresPorEmpresa: { 1: [] },
      analistasCausacionPorEmpresa: { 1: [] },
      contadoresPorEmpresa: {},
      eventosDianPorEmpresa: {},
      gerenciasPorEmpresa: { 1: [] },
      tesoreriaPorEmpresa: {},
      usuariosById: new Map(),
    };
    const basePlan = {
      tarea: createTarea("gerencia"),
      source: "joint",
      action: ASSIGN_PHASE_USER_ACTION,
      observation: "",
      selectedIds: [],
      phaseAssignment: { targetStage: "", assigneeId: "" } satisfies PhaseAssignmentDraft,
    } as unknown as BatchPlan;

    expect(validatePhaseAssignmentPlan(basePlan, context)).toContain("fase destino");
    expect(
      validatePhaseAssignmentPlan(
        {
          ...basePlan,
          phaseAssignment: { targetStage: "causacion", assigneeId: "" },
        },
        context,
      ),
    ).toContain("usuario responsable");
    expect(
      validatePhaseAssignmentPlan(
        {
          ...basePlan,
          phaseAssignment: { targetStage: "causacion", assigneeId: "analista-1" },
          observation: "Observación",
        },
        context,
      ),
    ).toContain("no tiene usuarios configurados");
  });

  test("detecta mismo par fase/usuario", () => {
    const tarea = createTarea("gerencia");
    expect(
      wouldProduceSamePhaseAndUser(tarea, "gerencia", "user-current"),
    ).toBe(true);
    expect(
      wouldProduceSamePhaseAndUser(tarea, "gerencia", "otro-user"),
    ).toBe(false);
  });
});
