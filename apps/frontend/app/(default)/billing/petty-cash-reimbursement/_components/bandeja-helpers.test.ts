import { describe, expect, it } from "vitest";

import {
  dedupeSolicitudes,
  filterSolicitudesLoaded,
  getPaginationItems,
  paginateLoadedRows,
  pickInitialExpandedCaja,
  resolveInitialView,
  selectVisibleIds,
  sortCajasForFacturas,
} from "./bandeja-helpers";
import type { SolicitudBandejaRow } from "./types";

const caja = (overrides: Record<string, unknown> = {}) => ({
  cajaMenorId: "caja-1",
  empresaId: 1,
  nombre: "Caja A",
  estado: "activa" as const,
  saldoDisponible: 100,
  isCustodio: true,
  canGenerate: true,
  visibilityMode: "full" as const,
  facturasPendientesCount: 0,
  facturasPendientesValor: 0,
  solicitudesActivasCount: 0,
  solicitudesActivasValor: 0,
  accionesAsignadasCount: 0,
  ...overrides,
});

const solicitud = (overrides: Partial<SolicitudBandejaRow> = {}): SolicitudBandejaRow => ({
  reembolsoId: "r1" as SolicitudBandejaRow["reembolsoId"],
  numeroReembolso: "GFN-F006-001",
  cajaMenorId: "caja-1" as SolicitudBandejaRow["cajaMenorId"],
  cajaNombre: "Caja A",
  empresaId: 1,
  estado: "pendiente_revision",
  valorTotal: 1000,
  movimientosCount: 1,
  custodio: { userId: "u1", nombre: "Custodio" },
  responsableActual: { nombre: "Revisor", tipo: "revisor", userId: "u2" },
  creadoEn: 1,
  actualizadoEn: 100,
  puedeActuar: false,
  puedeReasignar: false,
  puedeDescargarFormato: true,
  apertura: "readonly",
  progreso: [],
  busquedaTexto: "gfn proveedor acme",
  ...overrides,
});

describe("resolveInitialView", () => {
  it("prioriza acciones asignadas", () => {
    expect(
      resolveInitialView({
        accionesAsignadas: 2,
        facturasPendientes: 5,
        solicitudesActivas: 3,
        canGenerate: true,
      }),
    ).toEqual({ view: "solicitudes", alcance: "accion" });
  });
});

describe("paginateLoadedRows", () => {
  it("maneja una sola solicitud en página 1 de 1", () => {
    const rows = [solicitud()];
    const result = paginateLoadedRows(rows, 1, 20);
    expect(result.pageStart).toBe(1);
    expect(result.pageEnd).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.safeCurrentPage).toBe(1);
    expect(result.visibleRows).toHaveLength(1);
  });

  it("calcula cortes de 20 para 21 y 41 filas", () => {
    const rows = Array.from({ length: 21 }, (_, index) =>
      solicitud({ reembolsoId: `r${index}` as SolicitudBandejaRow["reembolsoId"] }),
    );
    expect(paginateLoadedRows(rows, 2, 20).visibleRows).toHaveLength(1);
    expect(paginateLoadedRows(rows, 2, 20).totalPages).toBe(2);

    const rows41 = Array.from({ length: 41 }, (_, index) =>
      solicitud({ reembolsoId: `x${index}` as SolicitudBandejaRow["reembolsoId"] }),
    );
    expect(paginateLoadedRows(rows41, 3, 20).visibleRows).toHaveLength(1);
    expect(paginateLoadedRows(rows41, 3, 20).totalPages).toBe(3);
  });
});

describe("getPaginationItems", () => {
  it("no propone página 2 cuando sólo hay una página", () => {
    expect(getPaginationItems(1, 1)).toEqual([1]);
  });
});

describe("filterSolicitudesLoaded", () => {
  it("combina alcance, fase y búsqueda", () => {
    const rows = [
      solicitud({ reembolsoId: "a" as SolicitudBandejaRow["reembolsoId"], puedeActuar: true }),
      solicitud({
        reembolsoId: "b" as SolicitudBandejaRow["reembolsoId"],
        busquedaTexto: "otro",
      }),
    ];
    const filtered = filterSolicitudesLoaded(rows, {
      alcance: "accion",
      fases: [],
      cajaFiltro: "all",
      actualizadoDesde: "",
      actualizadoHasta: "",
      busqueda: "",
      sortDirection: "desc",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.reembolsoId).toBe("a");
  });
});

describe("dedupeSolicitudes", () => {
  it("elimina ids repetidos", () => {
    const rows = [solicitud(), solicitud()];
    expect(dedupeSolicitudes(rows)).toHaveLength(1);
  });
});

describe("sortCajasForFacturas", () => {
  it("incluye cajas asignadas aunque el KPI sea cero", () => {
    const sorted = sortCajasForFacturas([
      caja({ cajaMenorId: "a", facturasPendientesCount: 0 }),
      caja({ cajaMenorId: "b", facturasPendientesCount: 2 }),
    ]);
    expect(sorted.map((row) => row.cajaMenorId)).toEqual(["b", "a"]);
  });

  it("excluye cajas sin permiso de generación", () => {
    const sorted = sortCajasForFacturas([
      caja({ cajaMenorId: "a", canGenerate: false, facturasPendientesCount: 2 }),
      caja({ cajaMenorId: "b", canGenerate: true, facturasPendientesCount: 0 }),
    ]);
    expect(sorted.map((row) => row.cajaMenorId)).toEqual(["b"]);
  });
});

describe("pickInitialExpandedCaja", () => {
  it("elige la primera caja con facturas pendientes", () => {
    expect(
      pickInitialExpandedCaja("facturas", [
        caja({ cajaMenorId: "a", facturasPendientesCount: 0 }),
        caja({ cajaMenorId: "b", facturasPendientesCount: 3 }),
      ]),
    ).toBe("b");
  });

  it("cae a la primera caja asignada si ninguna reporta pendientes", () => {
    expect(
      pickInitialExpandedCaja("facturas", [
        caja({ cajaMenorId: "a", facturasPendientesCount: 0 }),
        caja({ cajaMenorId: "b", facturasPendientesCount: 0 }),
      ]),
    ).toBe("a");
  });
});

describe("selectVisibleIds", () => {
  it("agrega ids visibles sin duplicar", () => {
    expect(selectVisibleIds(["1"], ["2", "1"])).toEqual(["1", "2"]);
  });
});
