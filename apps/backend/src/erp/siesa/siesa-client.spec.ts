import { describe, expect, it, vi } from "vitest";
import type { ConfigErp } from "../erp.config";
import { ErpError, literalSiesa, SiesaClient } from "./siesa-client";

const config: ConfigErp = {
  baseUrl: "http://erp.test",
  conniKey: "key",
  conniToken: "token",
  timeoutMs: 1000,
  tamanoPagina: 2,
};

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

const pagina = (...filas: unknown[]) => json(200, { codigo: 0, mensaje: "Transacción Exitosa", detalle: { Table: filas } });
const sinRegistros = () => json(400, { codigo: 1, mensaje: "Error", detalle: "No se encontraron registros" });

function crearCliente(respuestas: Array<Response | Error>) {
  const fetchMock = vi.fn(async () => {
    const siguiente = respuestas.shift();
    if (!siguiente) throw new Error("unexpected call");
    if (siguiente instanceof Error) throw siguiente;
    return siguiente;
  });
  const esperar = vi.fn(async () => undefined);
  const cliente = new SiesaClient(config, { fetch: fetchMock as unknown as typeof fetch, esperar });
  return { cliente, fetchMock, esperar };
}

describe("SiesaClient.consultarTodo", () => {
  it("pages until a short page and sends SIESA's query string and headers", async () => {
    const { cliente, fetchMock } = crearCliente([pagina({ a: 1 }, { a: 2 }), pagina({ a: 3 })]);
    const filas = await cliente.consultarTodo({ idCompania: "5001", descripcion: "API_v2_Proveedores", parametros: "f200_id_cia = 1" });

    expect(filas).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/siesa/v3/ejecutarconsultaestandar");
    expect(url.searchParams.get("idCompania")).toBe("5001");
    expect(url.searchParams.get("paginacion")).toBe("numPag=2|tamPag=2");
    expect(url.searchParams.get("parametros")).toBe("f200_id_cia = 1");
    expect(init.headers).toMatchObject({ ConniKey: "key", ConniToken: "token" });
  });

  it("treats SIESA's 400 'no records' as the end of the data", async () => {
    const { cliente } = crearCliente([pagina({ a: 1 }, { a: 2 }), sinRegistros()]);
    await expect(cliente.consultarTodo({ idCompania: "5001", descripcion: "API_v2_Clientes" })).resolves.toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("reads detalle.Datos too", async () => {
    const { cliente } = crearCliente([json(200, { codigo: 0, detalle: { Datos: [{ b: 1 }] } })]);
    await expect(cliente.consultarTodo({ idCompania: "5001", descripcion: "API_v2_Clientes" })).resolves.toEqual([{ b: 1 }]);
  });
});

describe("SiesaClient retries", () => {
  it("retries 5xx and network errors on queries", async () => {
    const { cliente, fetchMock, esperar } = crearCliente([json(503, {}), new TypeError("fetch failed"), pagina({ a: 1 })]);
    await expect(cliente.consultarPagina({ idCompania: "5001", descripcion: "x", pagina: 1, tamano: 2 })).resolves.toEqual([{ a: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(esperar).toHaveBeenNthCalledWith(1, 500);
    expect(esperar).toHaveBeenNthCalledWith(2, 1000);
  });

  it("gives up after the retries and reports SIESA's message", async () => {
    const { cliente } = crearCliente([json(500, { mensaje: "Caído" }), json(500, {}), json(500, { mensaje: "Sigue caído" })]);
    await expect(cliente.consultarPagina({ idCompania: "5001", descripcion: "x", pagina: 1, tamano: 2 })).rejects.toMatchObject({
      name: "ErpError",
      status: 500,
      message: "Sigue caído",
    });
  });

  it("does not retry other 4xx", async () => {
    const { cliente, fetchMock } = crearCliente([json(400, { codigo: 1, mensaje: "Error en parametros", detalle: "x" })]);
    await expect(cliente.consultarPagina({ idCompania: "5001", descripcion: "x", pagina: 1, tamano: 2 })).rejects.toBeInstanceOf(
      ErpError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("literalSiesa", () => {
  it("quotes values the way SIESA clients do", () => {
    expect(literalSiesa("900222333")).toBe("''900222333''");
  });
});
