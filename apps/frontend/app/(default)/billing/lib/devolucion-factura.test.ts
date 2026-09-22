import { describe, expect, test } from "vitest";

import {
  assertDestinoDevolucionValido,
  getDevolucionDestinos,
  isEstadoTerminalDevolucion,
  puedeDevolverFactura,
  resolveFaseOrigenDevolucion,
} from "@/convex/lib/facturacionDevolucionRules";
import { puedeMostrarDevolverFactura } from "./devolucion-factura";

function fases(destinos: ReturnType<typeof getDevolucionDestinos>) {
  return destinos.map((destino) => destino.fase);
}

describe("devolucion-factura rules", () => {
  test("cadena principal ofrece solo fases anteriores", () => {
    expect(fases(getDevolucionDestinos("revision_tesoreria"))).toEqual([
      "gerencia",
      "eventos_dian",
      "revision_impuestos",
      "causacion",
      "revision_lider",
      "recepcion",
    ]);
    expect(fases(getDevolucionDestinos("causacion"))).toEqual([
      "revision_lider",
      "recepcion",
    ]);
  });

  test("recepcion activa no admite devolver", () => {
    expect(getDevolucionDestinos("recepcion")).toEqual([]);
    expect(
      puedeDevolverFactura({
        estadoActual: "recepcion",
        esPeaje: false,
        tieneTarea: true,
      })
    ).toBe(false);
  });

  test("estados terminales admiten devolucion con respaldo seguro", () => {
    expect(fases(getDevolucionDestinos("cerrada"))).toEqual(["recepcion"]);
    expect(fases(getDevolucionDestinos("pagada"))).toEqual([
      "revision_tesoreria",
      "gerencia",
      "eventos_dian",
      "revision_impuestos",
      "causacion",
      "revision_lider",
      "recepcion",
    ]);
    expect(fases(getDevolucionDestinos("legalizada"))).toEqual([
      "revision_impuestos",
      "causacion",
      "revision_lider",
      "recepcion",
    ]);
    expect(fases(getDevolucionDestinos("rechazada"))).toEqual([
      "revision_lider",
      "recepcion",
    ]);
    expect(fases(getDevolucionDestinos("rechazada_dian"))).toEqual([
      "eventos_dian",
      "revision_impuestos",
      "causacion",
      "revision_lider",
      "recepcion",
    ]);
    expect(fases(getDevolucionDestinos("nota_credito_cerrada"))).toEqual([
      "causacion",
      "revision_lider",
      "recepcion",
    ]);

    for (const estado of [
      "pagada",
      "legalizada",
      "cerrada",
      "rechazada",
      "rechazada_dian",
      "nota_credito_cerrada",
    ]) {
      expect(
        puedeDevolverFactura({
          estadoActual: estado,
          esPeaje: false,
          tieneTarea: true,
        })
      ).toBe(true);
      expect(isEstadoTerminalDevolucion(estado)).toBe(true);
    }
  });

  test("estados especiales usan fase base inclusiva", () => {
    expect(fases(getDevolucionDestinos("jefe_directo"))).toEqual(["revision_lider"]);
    expect(fases(getDevolucionDestinos("aceptada"))).toEqual([
      "revision_lider",
      "recepcion",
    ]);
    expect(fases(getDevolucionDestinos("pendiente_rechazar_dian"))).toEqual([
      "eventos_dian",
      "revision_impuestos",
      "causacion",
      "revision_lider",
      "recepcion",
    ]);
    expect(fases(getDevolucionDestinos("pendiente_nota_credito"))).toEqual([
      "eventos_dian",
      "revision_impuestos",
      "causacion",
      "revision_lider",
      "recepcion",
    ]);
    expect(fases(getDevolucionDestinos("reembolso_caja_menor"))).toEqual([
      "causacion",
      "revision_lider",
      "recepcion",
    ]);
  });

  test("terminal usa historial reciente y cae al respaldo", () => {
    const origenDesdeHistorial = resolveFaseOrigenDevolucion("pagada", "gerencia");
    expect(origenDesdeHistorial).toBe("gerencia");
    expect(fases(getDevolucionDestinos("pagada", origenDesdeHistorial))).toEqual([
      "gerencia",
      "eventos_dian",
      "revision_impuestos",
      "causacion",
      "revision_lider",
      "recepcion",
    ]);

    expect(resolveFaseOrigenDevolucion("pagada", "pendiente_rechazar_dian")).toBe(
      "eventos_dian"
    );
    expect(resolveFaseOrigenDevolucion("pagada", null)).toBe("revision_tesoreria");
  });

  test("peajes y facturas sin tarea quedan excluidas", () => {
    expect(
      puedeMostrarDevolverFactura({
        factura: { esPeaje: true },
        tarea: { estado: "causacion" },
      })
    ).toBe(false);
    expect(
      puedeMostrarDevolverFactura({
        factura: { esPeaje: false },
        tarea: null,
      })
    ).toBe(false);
  });

  test("valida destinos futuros y no permitidos", () => {
    expect(() =>
      assertDestinoDevolucionValido("causacion", "revision_impuestos")
    ).toThrow();
    expect(() =>
      assertDestinoDevolucionValido("jefe_directo", "causacion")
    ).toThrow();
    expect(() =>
      assertDestinoDevolucionValido("cerrada", "revision_tesoreria")
    ).toThrow();
    expect(() =>
      assertDestinoDevolucionValido("cerrada", "recepcion")
    ).not.toThrow();
    expect(() =>
      assertDestinoDevolucionValido("pagada", "revision_tesoreria")
    ).not.toThrow();
  });
});
