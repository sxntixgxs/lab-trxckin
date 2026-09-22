import { describe, expect, test } from "vitest";

import type { BuzonTarea } from "../components/buzon-row";
import {
  getAnticipoCruceSummary,
  getAnticipoLegalizacionPanelMode,
  isFacturaEligibleForAnticipoLegalizacion,
  shouldShowAnticipoLegalizacionPanel,
} from "./anticipo-legalizacion";

function createTarea(
  stage: string,
  overrides: {
    esLegalizacionAnticipo?: boolean;
    esLegalizacionCajaMenor?: boolean;
    documentoClase?: "factura" | "nota_credito";
    tipoDocumento?: string;
    esPeaje?: boolean;
    rolOperacion?: string;
    asignacionEstado?: string;
  } = {}
): BuzonTarea {
  return {
    _id: "tarea-1" as BuzonTarea["_id"],
    _creationTime: 0,
    facturaId: "factura-1" as BuzonTarea["facturaId"],
    estado: stage,
    faseAsignacion: stage,
    asignacion: {
      _id: "asignacion-1" as NonNullable<BuzonTarea["asignacion"]>["_id"],
      _creationTime: 0,
      fase: stage,
      estado: overrides.asignacionEstado ?? "pendiente",
    } as NonNullable<BuzonTarea["asignacion"]>,
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
      esPeaje: overrides.esPeaje,
      rolOperacion: overrides.rolOperacion,
    } as NonNullable<BuzonTarea["factura"]>,
    pdfUrl: null,
  } as BuzonTarea;
}

describe("anticipo legalizacion visibility", () => {
  test("calcula el saldo disponible pendiente con la misma regla del servidor", () => {
    const summary = getAnticipoCruceSummary({
      factura: { total: 2_910_000, moneda: "COP" },
      legalizaciones: [{}],
      totales: {
        valorFactura: 2_910_000,
        valorAplicadoFactura: 2_840_307,
        pendienteDisponible: 101_160_116,
        diferenciaNoCubierta: 69_693,
      },
    });

    expect(summary?.restantePorCruzar).toBe(69_693);
  });

  test("solo exige el saldo de anticipo realmente disponible", () => {
    const summary = getAnticipoCruceSummary({
      factura: { total: 2_910_000, moneda: "COP" },
      legalizaciones: [{}],
      totales: {
        valorFactura: 2_910_000,
        valorAplicadoFactura: 2_840_307,
        pendienteDisponible: 50_000,
      },
    });

    expect(summary?.restantePorCruzar).toBe(50_000);
  });

  test("no bloquea cuando el cruce ya cubre la base", () => {
    const summary = getAnticipoCruceSummary({
      factura: { total: 2_910_000, moneda: "COP" },
      legalizaciones: [{}],
      totales: {
        valorFactura: 2_910_000,
        valorAplicadoFactura: 2_910_000,
        pendienteDisponible: 101_090_423,
      },
    });

    expect(summary?.restantePorCruzar).toBe(0);
  });

  test("causacion muestra panel para facturas elegibles marcadas y no marcadas", () => {
    expect(
      shouldShowAnticipoLegalizacionPanel(
        createTarea("causacion", { esLegalizacionAnticipo: true })
      )
    ).toBe(true);
    expect(
      getAnticipoLegalizacionPanelMode(createTarea("causacion", { esLegalizacionAnticipo: false }))
    ).toBe("mark-and-cross");
  });

  test("contabilidad muestra panel marcada y no marcada", () => {
    expect(
      shouldShowAnticipoLegalizacionPanel(
        createTarea("revision_impuestos", { esLegalizacionAnticipo: true })
      )
    ).toBe(true);
    expect(
      shouldShowAnticipoLegalizacionPanel(
        createTarea("revision_impuestos", { esLegalizacionAnticipo: false })
      )
    ).toBe(true);
    expect(
      getAnticipoLegalizacionPanelMode(
        createTarea("revision_impuestos", { esLegalizacionAnticipo: true })
      )
    ).toBe("correct");
    expect(
      getAnticipoLegalizacionPanelMode(
        createTarea("revision_impuestos", { esLegalizacionAnticipo: false })
      )
    ).toBe("mark-and-cross");
  });

  test("eventos dian usa modos contables de anticipo", () => {
    expect(
      getAnticipoLegalizacionPanelMode(
        createTarea("eventos_dian", { esLegalizacionAnticipo: false })
      )
    ).toBe("mark-and-cross");
    expect(
      getAnticipoLegalizacionPanelMode(
        createTarea("eventos_dian", { esLegalizacionAnticipo: true })
      )
    ).toBe("cross");
  });

  test("excluye notas crédito, peajes y caja menor", () => {
    expect(isFacturaEligibleForAnticipoLegalizacion(createTarea("causacion").factura)).toBe(true);
    expect(
      isFacturaEligibleForAnticipoLegalizacion(
        createTarea("causacion", {
          documentoClase: "nota_credito",
          tipoDocumento: "91",
        }).factura
      )
    ).toBe(false);
    expect(
      isFacturaEligibleForAnticipoLegalizacion(
        createTarea("causacion", { rolOperacion: "PEAJES" }).factura
      )
    ).toBe(false);
    expect(
      isFacturaEligibleForAnticipoLegalizacion(
        createTarea("causacion", { esLegalizacionCajaMenor: true }).factura
      )
    ).toBe(false);
  });

  test("revision_lider no marcada devuelve cross con asignación activa", () => {
    const tarea = createTarea("revision_lider", { esLegalizacionAnticipo: false });
    expect(getAnticipoLegalizacionPanelMode(tarea)).toBe("cross");
    expect(shouldShowAnticipoLegalizacionPanel(tarea)).toBe(true);
  });

  test("revision_lider no marcada con mark-anticipo también devuelve cross", () => {
    const tarea = createTarea("revision_lider", { esLegalizacionAnticipo: false });
    expect(getAnticipoLegalizacionPanelMode(tarea, { actionKind: "mark-anticipo" })).toBe("cross");
  });

  test("revision_lider no marcada con forward devuelve cross", () => {
    const tarea = createTarea("revision_lider", { esLegalizacionAnticipo: false });
    expect(getAnticipoLegalizacionPanelMode(tarea, { actionKind: "forward" })).toBe("cross");
  });

  test("revision_lider marcada devuelve cross aunque la acción sea diferente", () => {
    const tarea = createTarea("revision_lider", { esLegalizacionAnticipo: true });
    expect(getAnticipoLegalizacionPanelMode(tarea, { actionKind: "forward" })).toBe("cross");
  });

  test("asignación líder finalizada no devuelve modo editable con mark-anticipo", () => {
    const tarea = createTarea("revision_lider", {
      esLegalizacionAnticipo: false,
      asignacionEstado: "finalizada",
    });
    expect(getAnticipoLegalizacionPanelMode(tarea, { actionKind: "mark-anticipo" })).toBeNull();
  });

  test("asignación activa que no coincide con revision_lider no habilita el panel", () => {
    const tarea = createTarea("revision_lider", { esLegalizacionAnticipo: false });
    tarea.asignacion = {
      ...tarea.asignacion!,
      fase: "causacion",
    };
    expect(getAnticipoLegalizacionPanelMode(tarea, { actionKind: "mark-anticipo" })).toBeNull();
  });

  test("caja menor, peajes y notas crédito devuelven null con mark-anticipo", () => {
    expect(
      getAnticipoLegalizacionPanelMode(
        createTarea("revision_lider", {
          esLegalizacionAnticipo: false,
          esLegalizacionCajaMenor: true,
        }),
        { actionKind: "mark-anticipo" }
      )
    ).toBeNull();
    expect(
      getAnticipoLegalizacionPanelMode(
        createTarea("revision_lider", {
          esLegalizacionAnticipo: false,
          rolOperacion: "PEAJES",
        }),
        { actionKind: "mark-anticipo" }
      )
    ).toBeNull();
    expect(
      getAnticipoLegalizacionPanelMode(
        createTarea("revision_lider", {
          esLegalizacionAnticipo: false,
          documentoClase: "nota_credito",
          tipoDocumento: "91",
        }),
        { actionKind: "mark-anticipo" }
      )
    ).toBeNull();
  });

  test("causación y contabilidad mantienen comportamiento sin cambios", () => {
    expect(
      getAnticipoLegalizacionPanelMode(createTarea("causacion", { esLegalizacionAnticipo: false }))
    ).toBe("mark-and-cross");
    expect(
      getAnticipoLegalizacionPanelMode(createTarea("causacion", { esLegalizacionAnticipo: true }))
    ).toBe("cross");
    expect(
      getAnticipoLegalizacionPanelMode(
        createTarea("revision_impuestos", { esLegalizacionAnticipo: true })
      )
    ).toBe("correct");
    expect(
      getAnticipoLegalizacionPanelMode(
        createTarea("revision_impuestos", { esLegalizacionAnticipo: false })
      )
    ).toBe("mark-and-cross");
  });
});
