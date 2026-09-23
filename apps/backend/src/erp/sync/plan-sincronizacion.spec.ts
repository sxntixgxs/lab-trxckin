import { describe, expect, it } from "vitest";
import type { RegistroCatalogo } from "../siesa/siesa-filas";
import { planificarSincronizacion } from "./plan-sincronizacion";

function registro(nit: string, sucursal = "001", cambios: Partial<RegistroCatalogo> = {}): RegistroCatalogo {
  return {
    id_empresa: 1,
    erp_tercero_id: nit,
    nit,
    dv: "1",
    tipo_documento: "NIT",
    tipo_persona: "PERSONA_JURIDICA",
    razon_social: `Tercero ${nit}`,
    sucursal_id: sucursal,
    descripcion_sucursal: `Tercero ${nit}`,
    tercero_activo: true,
    activo: true,
    condicion_pago: "C30",
    email: null,
    telefono: null,
    direccion: null,
    ciudad: null,
    departamento: null,
    ...cambios,
  };
}

describe("planificarSincronizacion", () => {
  it("creates, updates, deletes and counts unchanged rows by company + document + branch", () => {
    const existentes = [
      { ...registro("100"), id: "a" },
      { ...registro("200"), id: "b" },
      { ...registro("300"), id: "c" },
      { ...registro("300", "002"), id: "d" },
    ];
    const entrantes = [
      registro("100"),
      registro("200", "001", { activo: false }),
      registro("300"),
      registro("400"),
    ];

    const plan = planificarSincronizacion(existentes, entrantes);
    expect(plan.crear.map((r) => r.nit)).toEqual(["400"]);
    expect(plan.actualizar).toEqual([{ id: "b", datos: registro("200", "001", { activo: false }) }]);
    expect(plan.eliminar).toEqual(["d"]);
    expect(plan.sinCambios).toBe(2);
  });

  it("keeps the last occurrence of a repeated ERP key", () => {
    const plan = planificarSincronizacion([], [registro("100", "001", { razon_social: "Vieja" }), registro("100", "001", { razon_social: "Nueva" })]);
    expect(plan.crear).toEqual([registro("100", "001", { razon_social: "Nueva" })]);
  });

  it("treats every existing row as gone when the ERP returns nothing", () => {
    const plan = planificarSincronizacion([{ ...registro("100"), id: "a" }], []);
    expect(plan.eliminar).toEqual(["a"]);
  });
});
