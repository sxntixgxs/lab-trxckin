import { describe, expect, test } from "vitest";

import {
  classifyTesoreriaOutcome,
  explainTesoreriaBatchJointConflict,
  getTesoreriaPrimaryAction,
  shouldHidePagoParcialTesoreria,
} from "./tesoreria-action-utils";

describe("tesoreria action selection", () => {
  const facturaAnticipo = {
    esLegalizacionAnticipo: true as const,
    valorAPagar: 0,
    valorContable: 10,
    total: 10,
  };

  test("cero por cruces y sin pagos preselecciona Confirmar sin desembolso", () => {
    expect(classifyTesoreriaOutcome(facturaAnticipo, 0)).toBe("sin-desembolso");
    expect(getTesoreriaPrimaryAction(facturaAnticipo, 0)?.kind).toBe(
      "confirm-no-disbursement",
    );
  });

  test("cero después de pagos preselecciona Confirmar factura pagada", () => {
    expect(classifyTesoreriaOutcome(facturaAnticipo, 2)).toBe("confirm-paid");
    expect(getTesoreriaPrimaryAction(facturaAnticipo, 2)?.kind).toBe("confirm-paid");
  });

  test("saldo positivo preselecciona Confirmar factura pagada", () => {
    const factura = { ...facturaAnticipo, valorAPagar: 3 };
    expect(classifyTesoreriaOutcome(factura, 0)).toBe("confirm-paid");
    expect(getTesoreriaPrimaryAction(factura, 0)?.kind).toBe("confirm-paid");
  });

  test("oculta pago parcial cuando el saldo es cero", () => {
    expect(shouldHidePagoParcialTesoreria(facturaAnticipo)).toBe(true);
    expect(shouldHidePagoParcialTesoreria({ ...facturaAnticipo, valorAPagar: 4 })).toBe(
      false,
    );
  });

  test("lote mixto exige modo individual", () => {
    const tareaA = {
      facturaId: "a",
      factura: facturaAnticipo,
    } as never;
    const tareaB = {
      facturaId: "b",
      factura: { ...facturaAnticipo, valorAPagar: 5 },
    } as never;

    expect(
      explainTesoreriaBatchJointConflict([tareaA, tareaB], { a: 0, b: 0 }),
    ).toMatch(/modo Individual/i);
  });

  test("lote homogéneo sin desembolso no genera conflicto", () => {
    const tareaA = {
      facturaId: "a",
      factura: facturaAnticipo,
    } as never;
    const tareaB = {
      facturaId: "b",
      factura: { ...facturaAnticipo, valorAPagar: 0 },
    } as never;

    expect(explainTesoreriaBatchJointConflict([tareaA, tareaB])).toBeNull();
  });
});
