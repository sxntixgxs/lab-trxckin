import { describe, expect, test } from "vitest";

import { resolveFacturacionActorName } from "./use-facturacion-actors";
import type { FacturacionUsuario } from "./use-facturacion-users";

const USUARIO: FacturacionUsuario = {
  id: "user-1",
  nombre: "Santiago Sandoval",
  email: "santiago@example.com",
  cedula: "",
  cargo: "",
  telf: "",
  id_proceso: null,
  proceso: "",
  lider_proceso: false,
  activo: true,
};

describe("facturacion actor lookup", () => {
  test("resuelve el nombre consultado usando actorUserId", () => {
    const usuariosById = new Map([[USUARIO.id, USUARIO]]);

    expect(resolveFacturacionActorName({ actorUserId: "user-1" }, usuariosById, false)).toBe(
      "Santiago Sandoval"
    );
  });

  test("no necesita nombre ni correo persistidos", () => {
    expect(resolveFacturacionActorName({ actorUserId: "user-1" }, new Map(), true)).toBe(
      "Consultando usuario…"
    );
  });
});
