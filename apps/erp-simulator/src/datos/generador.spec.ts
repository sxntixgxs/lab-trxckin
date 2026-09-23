import { describe, expect, it } from "vitest";
import { COMPANIAS_SIMULADAS } from "./companias";
import { NITS_DEMO, tercerosDemo } from "./demo";
import {
  construirDatosSimulados,
  generarTercerosCompania,
  NITS_RESERVADOS,
  TERCEROS_GENERADOS_POR_COMPANIA,
} from "./generador";
import { calcularDvNit, normalizarNit } from "./nit";

describe("construirDatosSimulados", () => {
  const datos = construirDatosSimulados();

  it("is deterministic", () => {
    expect(construirDatosSimulados()).toEqual(datos);
    const compania = COMPANIAS_SIMULADAS[0];
    expect(generarTercerosCompania(compania, 10, new Set())).toEqual(generarTercerosCompania(compania, 10, new Set()));
  });

  it("contains the demo cases plus the generated bulk of every company", () => {
    expect(datos).toHaveLength(tercerosDemo().length + COMPANIAS_SIMULADAS.length * TERCEROS_GENERADOS_POR_COMPANIA);
    for (const nit of Object.values(NITS_DEMO)) {
      expect(datos.filter((t) => t.nit === nit)).toHaveLength(1);
    }
  });

  it("keeps document numbers unique per company", () => {
    const claves = datos.map((t) => `${t.idInstancia}:${t.cia}:${normalizarNit(t.nit)}`);
    expect(new Set(claves).size).toBe(claves.length);
    const codigos = datos.map((t) => `${t.idInstancia}:${t.cia}:${t.id}`);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("never includes reserved documents (ACME, the app companies, test fixtures)", () => {
    const documentos = new Set(datos.map((t) => normalizarNit(t.nit)));
    for (const reservado of NITS_RESERVADOS) expect(documentos.has(reservado)).toBe(false);
    expect(documentos.has("900123456")).toBe(false);
  });

  it("stores a valid DV for every NIT and none for natural persons", () => {
    for (const t of datos) {
      if (t.tipoIdentificacion === "N") expect(t.dv).toBe(calcularDvNit(t.nit));
      else expect(t.dv).toBeNull();
    }
  });

  it("gives every tercero at least one branch, and inactive terceros only inactive branches", () => {
    for (const t of datos) {
      const sucursales = [...t.proveedor, ...t.cliente];
      expect(sucursales.length).toBeGreaterThan(0);
      if (!t.activo) expect(sucursales.every((s) => !s.activa)).toBe(true);
      for (const s of sucursales) expect(s.id).toMatch(/^\d{3}$/);
    }
  });

  it("mixes the expected kinds of terceros", () => {
    const generados = datos.slice(tercerosDemo().length);
    expect(generados.some((t) => t.tipoTercero === 1)).toBe(true);
    expect(generados.some((t) => !t.activo)).toBe(true);
    expect(generados.some((t) => t.proveedor.length === 2 || t.cliente.length === 2)).toBe(true);
    expect(generados.some((t) => t.proveedor.length > 0 && t.cliente.length > 0)).toBe(true);
  });
});
