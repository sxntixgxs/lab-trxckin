import { describe, expect, test } from "vitest";

import {
  computeValorAPagar,
  getPagosAplicadosFromAprobaciones,
  normalizeMoney,
} from "@/convex/lib/valorAPagar";
import {
  aplicaValorAPagarEnUi,
  computeResumenContableEstimado,
  computeValorAPagarEstimado,
  getValorAPagarDisplay,
  getBasePagoTesoreria,
  shouldShowValorAPagar,
  tesoreriaSaldoEsCero,
} from "./valor-a-pagar";

describe("valorAPagar backend", () => {
  test("valor contable 9, cruces 9, pagos 0 produce 0", () => {
    expect(
      computeValorAPagar({
        valorContable: 9,
        crucesActivos: 9,
        pagosAplicados: 0,
      })
    ).toBe(0);
  });

  test("valor contable 10, cruces 6, pago parcial 1 produce 3", () => {
    expect(
      computeValorAPagar({
        valorContable: 10,
        crucesActivos: 6,
        pagosAplicados: 1,
      })
    ).toBe(3);
  });

  test("normaliza diferencias dentro de tolerancia", () => {
    expect(normalizeMoney(0.0005)).toBe(0);
  });

  test("suma pagos parciales y finales auditados", () => {
    expect(
      getPagosAplicadosFromAprobaciones([
        { accion: "pago_parcial", pagoParcial: { monto: 1, comprobanteStorageId: "x" as never, comprobanteNombre: "a" }, pagoFinal: undefined },
        { accion: "registrar_pago", pagoParcial: undefined, pagoFinal: { monto: 2, moneda: "COP", sinDesembolso: false } },
      ])
    ).toBe(3);
  });
});

describe("valorAPagar frontend", () => {
  const facturaAnticipo = {
    esLegalizacionAnticipo: true as const,
    valorAPagar: 3,
    valorContable: 10,
    total: 10,
  };

  test("muestra valor a pagar en causacion", () => {
    expect(shouldShowValorAPagar("causacion", facturaAnticipo)).toBe(true);
  });

  test("oculta valor a pagar en recepcion", () => {
    expect(shouldShowValorAPagar("recepcion", facturaAnticipo)).toBe(false);
  });

  test("estimado local con borrador de valor contable", () => {
    expect(
      computeValorAPagarEstimado({
        valorContable: 12,
        valorDocumentosInternos: 2,
        valorAnticiposAplicados: 4,
        pagosAplicados: 1,
      })
    ).toBe(5);
  });

  test("recalcula el borrador con documentos internos en lugar del saldo persistido", () => {
    const facturaCruces = {
      esLegalizacionAnticipo: false as const,
      esPeaje: false as const,
      rolOperacion: undefined,
      esLegalizacionCajaMenor: false as const,
      valorAPagar: 32_900,
      cantidadCrucesDocumentosInternos: 1,
      valorCrucesDocumentosInternos: 4_620_000,
      valorContable: 4_652_900,
      total: 4_652_900,
    };

    expect(
      getValorAPagarDisplay({
        factura: facturaCruces,
        fase: "causacion",
        valorContableDraft: 4_632_000,
      })
    ).toBe(12_000);
  });

  test("recalcula conjuntamente base de anticipos y valor a pagar", () => {
    expect(
      computeResumenContableEstimado({
        valorContable: 4_632_000,
        valorDocumentosInternos: 4_620_000,
        valorAnticiposAplicados: 2_000,
        pagosAplicados: 0,
      })
    ).toEqual({
      baseCruceAnticipos: 12_000,
      valorAPagar: 10_000,
    });
  });

  test("tesoreria usa valorAPagar como base", () => {
    expect(getBasePagoTesoreria(facturaAnticipo)).toBe(3);
    expect(tesoreriaSaldoEsCero({ ...facturaAnticipo, valorAPagar: 0 })).toBe(true);
  });

  test("muestra valor a pagar con documentos internos en recepción", () => {
    const facturaCruces = {
      esLegalizacionAnticipo: false as const,
      esPeaje: false as const,
      rolOperacion: undefined,
      esLegalizacionCajaMenor: false as const,
      valorAPagar: 20,
      cantidadCrucesDocumentosInternos: 2,
      valorContable: 100,
      total: 100,
    };
    expect(aplicaValorAPagarEnUi(facturaCruces)).toBe(true);
    expect(shouldShowValorAPagar("recepcion", facturaCruces)).toBe(true);
    expect(shouldShowValorAPagar("revision_lider", facturaCruces)).toBe(true);
  });

  test("tesorería usa valorAPagar cuando hay documentos internos", () => {
    const facturaCruces = {
      esLegalizacionAnticipo: false as const,
      valorAPagar: 15,
      valorContable: 100,
      total: 100,
      cantidadCrucesDocumentosInternos: 1,
    };
    expect(getBasePagoTesoreria(facturaCruces)).toBe(15);
  });
});
