import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { leerConfig } from "./config.js";
import { crearLabData, type LabData } from "./lab-data.js";
import { crearServidor, mensajeDeError } from "./server.js";

const NOW = Date.UTC(2026, 8, 25, 15);

function fakeData(overrides: Partial<LabData> = {}): LabData {
  return {
    empresas: vi.fn(async () => [{ id: 2, nombre: "Cordillera Minería S.A.S.", nit: "900000002" }]),
    estadoFactura: vi.fn(async () => ({ facturas: [] })),
    aprobacionesPendientes: vi.fn(async () => ({ empresa: 2, facturas: [], hayMas: false, escaneoTruncado: false })),
    saldoAnticipos: vi.fn(async () => ({ anticipos: [], totalPendiente: 0 })),
    ...overrides,
  };
}

async function conectar(data: LabData) {
  const server = crearServidor(data, () => NOW);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const texto = (result: Awaited<ReturnType<Client["callTool"]>>) =>
  (result.content as { type: string; text: string }[])[0].text;

describe("lab-trxckin MCP server", () => {
  afterEach(() => vi.restoreAllMocks());

  it("registers only read-only tools, and search_suppliers only with the API configured", async () => {
    const sinApi = await conectar(fakeData());
    const { tools } = await sinApi.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_advance_balance",
      "get_invoice_status",
      "list_pending_approvals",
    ]);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    }

    const conApi = await conectar(fakeData({ buscarProveedores: vi.fn(async () => ({ proveedores: [] })) }));
    expect((await conApi.listTools()).tools.map((t) => t.name)).toContain("search_suppliers");
  });

  it("maps tool arguments to the Convex query and passes the current time", async () => {
    const data = fakeData();
    const client = await conectar(data);
    await client.callTool({
      name: "list_pending_approvals",
      arguments: { supplier: "ACME", assignee: "santiago", limit: 5 },
    });
    expect(data.aprobacionesPendientes).toHaveBeenCalledWith({
      nowMs: NOW,
      empresa: undefined,
      responsable: "santiago",
      proveedor: "ACME",
      limit: 5,
    });
  });

  it("returns compact JSON as text and structured content", async () => {
    const payload = { anticipos: [], totalPendiente: 1_800_000 };
    const client = await conectar(fakeData({ saldoAnticipos: vi.fn(async () => payload) }));
    const result = await client.callTool({
      name: "get_advance_balance",
      arguments: { requesterEmail: "mateo.castano@example.com" },
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(texto(result))).toEqual(payload);
    expect(result.structuredContent).toEqual(payload);
  });

  it("rejects invalid input before reaching the data layer", async () => {
    const data = fakeData();
    const client = await conectar(data);

    const sinSelector = await client.callTool({ name: "get_invoice_status", arguments: {} });
    expect(sinSelector.isError).toBe(true);
    expect(texto(sinSelector)).toBe("Pass invoiceId or invoiceNumber.");

    const limiteInvalido = await client.callTool({ name: "list_pending_approvals", arguments: { limit: 500 } });
    expect(limiteInvalido.isError).toBe(true);

    const emailInvalido = await client.callTool({
      name: "get_advance_balance",
      arguments: { requesterEmail: "no-es-un-email" },
    });
    expect(emailInvalido.isError).toBe(true);

    expect(data.estadoFactura).not.toHaveBeenCalled();
    expect(data.aprobacionesPendientes).not.toHaveBeenCalled();
    expect(data.saldoAnticipos).not.toHaveBeenCalled();
  });

  it("turns server errors into a one-line message, without stack traces", async () => {
    const error = new Error(
      "[Request ID: 3f2a] Server Error\nUncaught Error: Empresa fuera del alcance del servidor MCP.\n    at resolverEmpresaMcp (../lib/mcpScope.ts:40:11)"
    );
    const client = await conectar(fakeData({ aprobacionesPendientes: vi.fn(async () => Promise.reject(error)) }));
    const result = await client.callTool({ name: "list_pending_approvals", arguments: { companyId: 3 } });
    expect(result.isError).toBe(true);
    expect(texto(result)).toBe("Empresa fuera del alcance del servidor MCP.");
  });

  it("search_suppliers defaults to the only company in scope", async () => {
    const buscarProveedores = vi.fn(async () => ({ proveedores: [] }));
    const client = await conectar(fakeData({ buscarProveedores }));
    await client.callTool({ name: "search_suppliers", arguments: { query: "  acme " } });
    expect(buscarProveedores).toHaveBeenCalledWith({ empresa: 2, q: "acme", limit: 10 });
  });

  it("exposes the companies in scope as a resource", async () => {
    const client = await conectar(fakeData());
    const { contents } = await client.readResource({ uri: "lab://companies" });
    expect(JSON.parse((contents[0] as { text: string }).text)).toEqual([
      { id: 2, nombre: "Cordillera Minería S.A.S.", nit: "900000002" },
    ]);
  });
});

describe("mensajeDeError", () => {
  it("keeps plain messages", () => {
    expect(mensajeDeError(new Error("Supplier catalog answered 403: Forbidden"))).toBe(
      "Supplier catalog answered 403: Forbidden"
    );
  });
});

describe("supplier catalog client", () => {
  it("sends the MCP key and the query to the API", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ proveedores: [] }), { status: 200 }));
    const data = crearLabData(
      leerConfig({
        LAB_CONVEX_URL: "https://example.convex.cloud",
        LAB_MCP_SECRET: "s",
        LAB_API_URL: "http://localhost:8000/api/v1/",
        LAB_MCP_API_KEY: "k",
      }),
      fetchMock as unknown as typeof fetch
    );
    await data.buscarProveedores!({ empresa: 2, q: "acme", limit: 10 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("http://localhost:8000/api/v1/mcp/proveedores/search?empresa=2&q=acme&limit=10");
    expect(init.headers).toEqual({ "x-mcp-key": "k" });
  });

  it("reports the API status instead of a parse error", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Invalid MCP key" }), { status: 401 }));
    const data = crearLabData(
      leerConfig({ LAB_CONVEX_URL: "https://x.convex.cloud", LAB_MCP_SECRET: "s", LAB_API_URL: "http://api", LAB_MCP_API_KEY: "k" }),
      fetchMock as unknown as typeof fetch
    );
    await expect(data.buscarProveedores!({ empresa: 2, q: "dr", limit: 1 })).rejects.toThrow(
      "Supplier catalog answered 401: Invalid MCP key"
    );
  });
});

describe("leerConfig", () => {
  it("requires the Convex URL and secret, and leaves the API optional", () => {
    expect(() => leerConfig({})).toThrow("LAB_CONVEX_URL, LAB_MCP_SECRET");
    expect(leerConfig({ LAB_CONVEX_URL: "https://x.convex.cloud", LAB_MCP_SECRET: "s" }).api).toBeNull();
  });
});
