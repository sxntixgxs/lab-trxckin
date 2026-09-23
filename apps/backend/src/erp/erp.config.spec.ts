import { describe, expect, it } from "vitest";
import { companiaErpDeEmpresa, EMPRESAS_ERP, leerConfigErp, leerConfigSyncProgramada } from "./erp.config";

describe("companiaErpDeEmpresa", () => {
  it("maps each app company to its SIESA instance and company", () => {
    expect(companiaErpDeEmpresa(1, {})).toEqual({ idCompania: "5001", cia: 1 });
    expect(companiaErpDeEmpresa(2, {})).toEqual({ idCompania: "5002", cia: 1 });
    expect(companiaErpDeEmpresa(3, {})).toEqual({ idCompania: "5001", cia: 7 });
    expect(companiaErpDeEmpresa(4, {})).toEqual({ idCompania: "5001", cia: 13 });
    expect(EMPRESAS_ERP).toEqual([1, 2, 3, 4]);
  });

  it("takes the instance ids from the environment and fails closed for unknown companies", () => {
    expect(companiaErpDeEmpresa(2, { ERP_INSTANCIA_2_ID_COMPANIA: " 9321 " })).toEqual({ idCompania: "9321", cia: 1 });
    expect(companiaErpDeEmpresa(5, {})).toBeNull();
    expect(companiaErpDeEmpresa(0, {})).toBeNull();
  });
});

describe("leerConfigErp", () => {
  it("is null until URL and credentials are set", () => {
    expect(leerConfigErp({})).toBeNull();
    expect(leerConfigErp({ ERP_BASE_URL: "http://localhost:8100", ERP_CONNI_KEY: "k" })).toBeNull();
  });

  it("normalizes the URL and applies defaults and caps", () => {
    expect(
      leerConfigErp({
        ERP_BASE_URL: "http://localhost:8100/",
        ERP_CONNI_KEY: "k",
        ERP_CONNI_TOKEN: "t",
        ERP_TAM_PAGINA: "5000",
      }),
    ).toEqual({ baseUrl: "http://localhost:8100", conniKey: "k", conniToken: "t", timeoutMs: 30_000, tamanoPagina: 1000 });
  });
});

describe("leerConfigSyncProgramada", () => {
  it("is on by default at 02:00 Bogotá", () => {
    expect(leerConfigSyncProgramada({})).toEqual({ habilitada: true, cron: "0 0 2 * * *", zonaHoraria: "America/Bogota" });
    expect(leerConfigSyncProgramada({ ERP_SYNC_PROGRAMADA: "FALSE" }).habilitada).toBe(false);
  });
});
