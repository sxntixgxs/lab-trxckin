import { describe, expect, test } from "vitest";

import {
  CLOSE_INVOICE_PHASES,
  DEVOLUCION_STAGE_ORDER,
  getAccountingPhaseActions,
  getAccountingSkipAction,
  getHorizontalActions,
  getSecondaryActions,
  getTerminalBranchStage,
  isTerminalFacturacionStage,
  workflowUsersMatchById,
} from "./workflow-config";

const usuarioA = {
  id: "usuario-a",
  email: "usuario-a@example.com",
};

const usuarioB = {
  id: "usuario-b",
  email: "usuario-b@example.com",
};

const usuarioC = {
  id: "usuario-c",
  email: "usuario-c@example.com",
};

describe("getAccountingSkipAction", () => {
  test("devuelve Enviar a Gerencia cuando Causacion, Contabilidad y Eventos DIAN son el mismo default", () => {
    const action = getAccountingSkipAction("causacion", {
      currentUser: usuarioA,
      contadores: [usuarioA],
      eventosDian: [usuarioA],
    });

    expect(action).toMatchObject({
      kind: "skip-accounting-chain",
      label: "Enviar a Gerencia",
      targetStage: "gerencia",
      skippedStages: ["revision_impuestos", "eventos_dian"],
    });
  });

  test("devuelve Enviar a Eventos DIAN cuando solo se puede saltar Contabilidad", () => {
    const action = getAccountingSkipAction("causacion", {
      currentUser: usuarioA,
      contadores: [usuarioA],
      eventosDian: [usuarioB],
    });

    expect(action).toMatchObject({
      kind: "skip-accounting-chain",
      label: "Enviar a Eventos DIAN",
      targetStage: "eventos_dian",
      skippedStages: ["revision_impuestos"],
    });
  });

  test("exige selector de Eventos DIAN cuando hay varios candidatos distintos", () => {
    const action = getAccountingSkipAction("causacion", {
      currentUser: usuarioA,
      contadores: [usuarioA],
      eventosDian: [usuarioB, usuarioC],
    });

    expect(action).toMatchObject({
      kind: "skip-accounting-chain",
      targetStage: "eventos_dian",
      needsAssignee: "eventos_dian",
    });
  });

  test("permite salto cuando una fase tiene multiples usuarios configurados pero incluye al actual", () => {
    const action = getAccountingSkipAction("causacion", {
      currentUser: usuarioA,
      contadores: [usuarioA, usuarioB],
      eventosDian: [usuarioA],
    });

    expect(action).toMatchObject({
      kind: "skip-accounting-chain",
      label: "Enviar a Gerencia",
      targetStage: "gerencia",
    });
  });

  test("anticipo cubierto devuelve Enviar a Gerencia como accion principal", () => {
    const actions = getAccountingPhaseActions("causacion", {
      currentUser: usuarioA,
      contadores: [usuarioA],
      eventosDian: [usuarioA],
      isAnticipo: true,
      anticipoCubiertoTotal: true,
    });

    expect(actions[0]).toMatchObject({
      kind: "skip-accounting-chain",
      label: "Enviar a Gerencia",
      targetStage: "gerencia",
    });
    expect(actions[1]).toMatchObject({
      kind: "legalize",
      label: "Legalizar factura",
    });
  });

  test("anticipo parcialmente cubierto mantiene Enviar a Gerencia", () => {
    const action = getAccountingSkipAction("causacion", {
      currentUser: usuarioA,
      contadores: [usuarioA],
      eventosDian: [usuarioA],
      isAnticipo: true,
      anticipoCubiertoTotal: false,
    });

    expect(action).toMatchObject({
      kind: "skip-accounting-chain",
      label: "Enviar a Gerencia",
      targetStage: "gerencia",
    });
  });

  test("revision_impuestos con anticipo cubierto ofrece Enviar a Gerencia y Legalizar", () => {
    const actions = getAccountingPhaseActions("revision_impuestos", {
      currentUser: usuarioA,
      contadores: [usuarioA],
      eventosDian: [usuarioA],
      isAnticipo: true,
      anticipoCubiertoTotal: true,
    });

    expect(actions[0]).toMatchObject({
      kind: "skip-accounting-chain",
      label: "Enviar a Gerencia",
    });
    expect(actions[1]).toMatchObject({
      kind: "legalize",
      label: "Legalizar factura",
    });
  });

  test("revision_impuestos permite salto cuando hay multiples Eventos DIAN pero el asignado esta en ambos roles", () => {
    const action = getAccountingSkipAction("revision_impuestos", {
      currentUser: usuarioA,
      contadores: [usuarioA],
      eventosDian: [usuarioA, usuarioB],
      isAnticipo: true,
      anticipoCubiertoTotal: true,
    });

    expect(action).toMatchObject({
      kind: "skip-accounting-chain",
      label: "Enviar a Gerencia",
      targetStage: "gerencia",
    });
  });

  test("revision_impuestos no permite salto si el asignado no esta en Eventos DIAN", () => {
    const action = getAccountingSkipAction("revision_impuestos", {
      currentUser: usuarioA,
      contadores: [usuarioA],
      eventosDian: [usuarioB],
    });

    expect(action).toBeNull();
  });

  test("Caja Menor no ofrece legalizar desde salto contable", () => {
    const action = getAccountingSkipAction("causacion", {
      currentUser: usuarioA,
      contadores: [usuarioA],
      eventosDian: [usuarioA],
      isCajaMenor: true,
      isAnticipo: true,
      anticipoCubiertoTotal: true,
    });

    expect(action).toBeNull();
  });
});

describe("getHorizontalActions", () => {
  test("incluye Asignar a otro par en gerencia", () => {
    const actions = getHorizontalActions("gerencia");

    expect(actions).toEqual([
      {
        kind: "assign-horizontal-par",
        label: "Asignar a otro par",
        needsAssignee: "gerencia",
      },
    ]);
  });
});

describe("workflowUsersMatchById", () => {
  test("empareja solo por id", () => {
    expect(
      workflowUsersMatchById(
        { usuarioId: "william-id", email: "software@example.com" },
        { id: "william-id", email: "otro@example.com" },
      ),
    ).toBe(true);
  });

  test("no trata como el mismo usuario a dos ids distintos aunque compartan correo", () => {
    expect(
      workflowUsersMatchById(
        { usuarioId: "william-id", email: "software@example.com" },
        { id: "julio-id", email: "software@example.com" },
      ),
    ).toBe(false);
  });

  test("devuelve false si falta algun id", () => {
    expect(
      workflowUsersMatchById(
        { email: "software@example.com" },
        { id: "julio-id", email: "software@example.com" },
      ),
    ).toBe(false);
  });
});

describe("getSecondaryActions backward devolver", () => {
  function getBackwardTargets(stage: string) {
    return getSecondaryActions(stage)
      .filter((action) => action.kind === "backward")
      .map((action) => action.targetStage);
  }

  test("DEVOLUCION_STAGE_ORDER excluye ramas del flujo principal", () => {
    expect(DEVOLUCION_STAGE_ORDER).toEqual([
      "recepcion",
      "revision_lider",
      "causacion",
      "revision_impuestos",
      "eventos_dian",
      "gerencia",
      "revision_tesoreria",
    ]);
  });

  test("cada fase principal puede devolver a todas las fases anteriores", () => {
    const expectations: Record<string, string[]> = {
      revision_lider: ["recepcion"],
      causacion: ["revision_lider", "recepcion"],
      revision_impuestos: [
        "causacion",
        "revision_lider",
        "recepcion",
      ],
      eventos_dian: [
        "revision_impuestos",
        "causacion",
        "revision_lider",
        "recepcion",
      ],
      gerencia: [
        "eventos_dian",
        "revision_impuestos",
        "causacion",
        "revision_lider",
        "recepcion",
      ],
      revision_tesoreria: [
        "gerencia",
        "eventos_dian",
        "revision_impuestos",
        "causacion",
        "revision_lider",
        "recepcion",
      ],
    };

    for (const [stage, expectedTargets] of Object.entries(expectations)) {
      expect(getBackwardTargets(stage)).toEqual(expectedTargets);
    }
  });

  test("recepcion y fases especiales no ofrecen devolver", () => {
    expect(getBackwardTargets("recepcion")).toEqual([]);
    expect(getBackwardTargets("pendiente_rechazar_dian")).toEqual([]);
    expect(getBackwardTargets("reembolso_caja_menor")).toEqual([]);
  });

  test("jefe_directo conserva devolver solo a lider", () => {
    expect(getBackwardTargets("jefe_directo")).toEqual(["revision_lider"]);
  });
});

describe("cerrada terminal status", () => {
  test("cerrada is terminal", () => {
    expect(isTerminalFacturacionStage("cerrada")).toBe(true);
  });

  test("close-invoice appears for allowed accounting phases only", () => {
    for (const stage of CLOSE_INVOICE_PHASES) {
      const actions = getSecondaryActions(stage);
      expect(actions.some((action) => action.kind === "close-invoice")).toBe(true);
    }

    for (const stage of [
      "revision_lider",
      "jefe_directo",
      "pendiente_rechazar_dian",
      "revision_tesoreria",
      "reembolso_caja_menor",
      "pagada",
      "legalizada",
      "cerrada",
      "rechazada",
      "rechazada_dian",
      "nota_credito_cerrada",
    ]) {
      const actions = getSecondaryActions(stage);
      expect(actions.some((action) => action.kind === "close-invoice")).toBe(false);
    }
  });

  test("terminal branch fallback for cerrada is recepcion", () => {
    expect(getTerminalBranchStage("cerrada")).toBe("recepcion");
  });
});
