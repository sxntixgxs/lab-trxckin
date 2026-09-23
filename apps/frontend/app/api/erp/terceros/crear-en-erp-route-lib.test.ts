import { describe, expect, it, vi } from "vitest";
import type { RegistroErp } from "@/lib/erp/terceros";
import { crearTerceroEnErp, type DatosTerceroParaErp, type RespuestaCreacionErp } from "./crear-en-erp-route-lib";

const DATOS: DatosTerceroParaErp = {
  entidad: "PROVEEDOR",
  empresa: 1,
  tipoDocumento: "NIT",
  numeroDocumento: "900.123.456",
  tipoPersona: "PERSONA_JURIDICA",
  razonSocial: "ACME Colombia S.A.S.",
  email: "laura@acme.test",
  registroErp: null,
};

const CREADO: RespuestaCreacionErp = {
  erpTerceroId: "900123456",
  sucursalId: "001",
  accion: "CREADO",
  catalogoActualizado: true,
  existencia: { existe: true, tercero: null, catalogo: { sincronizado: true, ultimaSincronizacion: null } },
};

const REGISTRO: RegistroErp = {
  erpTerceroId: "900123456",
  sucursalId: "001",
  accion: "CREADO",
  catalogoActualizado: true,
  fecha: 1,
  porUserId: "conta",
};

function dependencias(overrides: Partial<Parameters<typeof crearTerceroEnErp>[0]> = {}) {
  return {
    obtenerDatos: vi.fn(async () => DATOS),
    registrarEnErp: vi.fn(async () => Response.json(CREADO)),
    anotarEnInscripcion: vi.fn(async () => REGISTRO),
    ...overrides,
  };
}

describe("crearTerceroEnErp", () => {
  it("envía a Nest los datos de Convex (sin el registro previo) y anota el resultado", async () => {
    const deps = dependencias();
    const resultado = await crearTerceroEnErp(deps);

    expect(resultado).toEqual({ ok: true, registroErp: REGISTRO, existencia: CREADO.existencia });
    expect(deps.registrarEnErp).toHaveBeenCalledWith({
      entidad: "PROVEEDOR",
      empresa: 1,
      tipoDocumento: "NIT",
      numeroDocumento: "900.123.456",
      tipoPersona: "PERSONA_JURIDICA",
      razonSocial: "ACME Colombia S.A.S.",
      email: "laura@acme.test",
    });
    expect(deps.anotarEnInscripcion).toHaveBeenCalledWith(CREADO);
  });

  it("no llama a Nest si Convex niega el acceso", async () => {
    const deps = dependencias({
      obtenerDatos: vi.fn(async () => {
        throw new Error("[CONVEX Q(onboarding/erp:datosParaCrearEnErp)] Uncaught Error: No tienes asignada esta fase de la inscripción.");
      }),
    });
    expect(await crearTerceroEnErp(deps)).toEqual({ ok: false, status: 403, error: "No tienes asignada esta fase de la inscripción." });
    expect(deps.registrarEnErp).not.toHaveBeenCalled();
  });

  it("devuelve el registro existente sin volver a llamar al ERP", async () => {
    const deps = dependencias({ obtenerDatos: vi.fn(async () => ({ ...DATOS, registroErp: REGISTRO })) });
    expect(await crearTerceroEnErp(deps)).toEqual({ ok: true, registroErp: REGISTRO, existencia: null });
    expect(deps.registrarEnErp).not.toHaveBeenCalled();
  });

  it("reintenta si el catálogo no se había actualizado", async () => {
    const deps = dependencias({
      obtenerDatos: vi.fn(async () => ({ ...DATOS, registroErp: { ...REGISTRO, catalogoActualizado: false } })),
    });
    expect((await crearTerceroEnErp(deps)).ok).toBe(true);
    expect(deps.registrarEnErp).toHaveBeenCalledOnce();
  });

  it("propaga el rechazo del ERP y no anota nada", async () => {
    const deps = dependencias({
      registrarEnErp: vi.fn(async () =>
        Response.json({ message: "El ERP rechazó el tercero: Errores en la importación (F200_DV_NIT: ...)" }, { status: 422 }),
      ),
    });
    expect(await crearTerceroEnErp(deps)).toEqual({
      ok: false,
      status: 422,
      error: "El ERP rechazó el tercero: Errores en la importación (F200_DV_NIT: ...)",
    });
    expect(deps.anotarEnInscripcion).not.toHaveBeenCalled();
  });

  it("responde 502 si el backend no responde", async () => {
    const deps = dependencias({ registrarEnErp: vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) });
    expect(await crearTerceroEnErp(deps)).toMatchObject({ ok: false, status: 502 });
  });

  it("avisa si el ERP lo registró pero no se pudo anotar en la inscripción", async () => {
    const deps = dependencias({ anotarEnInscripcion: vi.fn(async () => Promise.reject(new Error("boom"))) });
    expect(await crearTerceroEnErp(deps)).toMatchObject({ ok: false, status: 500, error: "boom" });
  });
});
