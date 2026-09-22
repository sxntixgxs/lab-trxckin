import { describe, expect, test } from "vitest";
import {
  calcularEvaluacionCompras,
  etiquetaValorCriterioCompras,
  obtenerValoresEvaluacionCompras,
} from "./evaluacion-compras";

describe("calcularEvaluacionCompras", () => {
  test("conserva la fórmula legacy cuando los ocho criterios son aplicables", () => {
    expect(calcularEvaluacionCompras([15, 10, 10, 10, 30, 30, 15, 25])).toMatchObject({
      estaCompleta: true,
      puedeCalcular: true,
      cantidadAplicables: 8,
      sumaPuntos: 145,
      maximoPosible: 240,
      resultadoPorcentaje: 60,
      calificacionGeneral: 3,
      proveedorStatus: "NO ACEPTABLE",
      isAprobado: false,
    });
  });

  test("excluye NO APLICA del puntaje y del máximo posible", () => {
    expect(calcularEvaluacionCompras([30, 30, 30, 30, 30, 30, 30, null])).toMatchObject({
      cantidadAplicables: 7,
      sumaPuntos: 210,
      maximoPosible: 210,
      resultadoPorcentaje: 100,
      calificacionGeneral: 5,
      proveedorStatus: "ACEPTABLE",
      isAprobado: true,
    });
  });

  test("NO APLICA no envía a reserva, pero un cero aplicable sí", () => {
    const result = calcularEvaluacionCompras([30, 30, 30, 30, 30, 30, 0, null]);

    expect(result.tieneCeroAplicable).toBe(true);
    expect(result.proveedorStatus).toBe("PROVEEDOR EN RESERVA");
    expect(result.isAprobado).toBe(false);
  });

  test("no calcula mientras haya criterios pendientes", () => {
    expect(calcularEvaluacionCompras([30, 30, 30, 30, 30, 30, null, undefined])).toMatchObject({
      estaCompleta: false,
      puedeCalcular: false,
      proveedorStatus: null,
    });
  });

  test("no permite calcular cuando todos los criterios son NO APLICA", () => {
    expect(calcularEvaluacionCompras([null, null, null, null, null, null, null, null])).toMatchObject({
      estaCompleta: true,
      tieneCriteriosAplicables: false,
      puedeCalcular: false,
      cantidadAplicables: 0,
      maximoPosible: 0,
      proveedorStatus: null,
    });
  });

  test("conserva null al reconstruir una evaluación y lo etiqueta como NO APLICA", () => {
    const valores = obtenerValoresEvaluacionCompras({
      experiencia: 30,
      referencias: 25,
      portfolio: null,
      certificados: 30,
      garantias: 30,
      fichasTecnicas: 30,
      formaPago: 30,
      sstAmbiental: 30,
    });

    expect(valores).toEqual([30, 25, null, 30, 30, 30, 30, 30]);
    expect(etiquetaValorCriterioCompras("portfolio", null)).toBe("NO APLICA");
  });
});
