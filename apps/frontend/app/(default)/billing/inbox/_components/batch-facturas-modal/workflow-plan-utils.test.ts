import { describe, expect, test } from "vitest";

import type { BuzonTarea } from "../../../components/buzon-row";
import { CLOSE_INVOICE_PHASES } from "../../../lib/workflow-config";
import {
  getAvailableActionsForTask,
  isActionAvailableForTask,
  validatePlan,
} from "./workflow-plan-utils";
import type { BatchPlan } from "./types";

function createTareaForStage(
  stage: string,
  overrides: {
    esLegalizacionAnticipo?: boolean;
    esLegalizacionCajaMenor?: boolean;
    documentoClase?: "factura" | "nota_credito";
    tipoDocumento?: string;
  } = {},
): BuzonTarea {
  return {
    _id: "tarea-1" as BuzonTarea["_id"],
    _creationTime: 0,
    facturaId: "factura-1" as BuzonTarea["facturaId"],
    estado: stage,
    faseAsignacion: stage,
    factura: {
      _id: "factura-1" as NonNullable<BuzonTarea["factura"]>["_id"],
      _creationTime: 0,
      empresa: 1,
      numeroFactura: "FAC-001",
      esLegalizacionAnticipo: overrides.esLegalizacionAnticipo,
      esLegalizacionCajaMenor: overrides.esLegalizacionCajaMenor,
      documentoClase: overrides.documentoClase,
      tipoDocumento: overrides.tipoDocumento,
      tipoDocumentoNormalizado: overrides.tipoDocumento,
    } as NonNullable<BuzonTarea["factura"]>,
    pdfUrl: null,
  } as BuzonTarea;
}

function createRevisionLiderTarea(
  overrides: {
    esLegalizacionAnticipo?: boolean;
    esLegalizacionCajaMenor?: boolean;
  } = {},
): BuzonTarea {
  return createTareaForStage("revision_lider", overrides);
}

describe("getAvailableActionsForTask anticipo filtering", () => {
  test("muestra marcar anticipo cuando la factura ya está marcada como anticipo", () => {
    const tarea = createRevisionLiderTarea({ esLegalizacionAnticipo: true });
    const actions = getAvailableActionsForTask(tarea);

    expect(
      actions.some((action) => action.kind === "mark-anticipo"),
    ).toBe(true);
    expect(
      actions.some((action) => action.kind === "mark-caja-menor"),
    ).toBe(false);
  });

  test("oculta marcar anticipo cuando la factura está marcada como caja menor", () => {
    const tarea = createRevisionLiderTarea({ esLegalizacionCajaMenor: true });
    const actions = getAvailableActionsForTask(tarea);

    expect(
      actions.some((action) => action.kind === "mark-anticipo"),
    ).toBe(false);
    expect(
      actions.some((action) => action.kind === "mark-caja-menor"),
    ).toBe(false);
  });

  test("muestra marcar anticipo y caja menor en revisión sin marcas previas", () => {
    const tarea = createRevisionLiderTarea();
    const actions = getAvailableActionsForTask(tarea);

    expect(
      actions.some((action) => action.kind === "mark-anticipo"),
    ).toBe(true);
    expect(
      actions.some((action) => action.kind === "mark-caja-menor"),
    ).toBe(true);
  });
});

describe("getAvailableActionsForTask close-invoice", () => {
  test("expone cerrar factura en las cinco fases permitidas", () => {
    for (const stage of CLOSE_INVOICE_PHASES) {
      const tarea = createTareaForStage(stage);
      const actions = getAvailableActionsForTask(tarea);

      expect(
        actions.some((action) => action.kind === "close-invoice"),
      ).toBe(true);
    }
  });

  test("no filtra cerrar factura por tipo de documento", () => {
    for (const stage of CLOSE_INVOICE_PHASES) {
      const tarea = createTareaForStage(stage, {
        documentoClase: "nota_credito",
        tipoDocumento: "91",
      });
      const actions = getAvailableActionsForTask(tarea);

      expect(
        actions.some((action) => action.kind === "close-invoice"),
      ).toBe(true);
    }
  });

  test("validatePlan acepta cerrar factura con observación en fases permitidas", () => {
    const closeInvoiceAction = {
      kind: "close-invoice" as const,
      label: "Cerrar factura",
    };
    const context = {
      lideres: [],
      contadoresPorEmpresa: {},
      eventosDianPorEmpresa: {},
      analistasCausacionPorEmpresa: {},
      usuarios: [],
      usuariosById: new Map(),
    };

    for (const stage of CLOSE_INVOICE_PHASES) {
      const plan: BatchPlan = {
        tarea: createTareaForStage(stage),
        action: closeInvoiceAction,
        observation: "Cierre administrativo.",
        selectedIds: [],
      };

      expect(isActionAvailableForTask(plan.tarea, plan.action, context)).toBe(
        true,
      );
      expect(validatePlan(plan, context)).toBeNull();
    }
  });
});
