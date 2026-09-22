import { describe, expect, it, vi } from "vitest";

vi.mock("@/convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/convexServerClient", () => ({
  convexServer: { query: vi.fn(), mutation: vi.fn() },
}));
vi.mock("@/lib/empresas", () => ({ hasGlobalEmpresaAccess: vi.fn() }));

import type { AnticipoManagementContext } from "@/app/(default)/billing/lib/anticipo-management";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildAnticipoOwnerSelectionKey,
  mergeAnticipoOwnerCandidates,
  parseAnticipoOwnerSelectionKey,
  resolveLiderDirectorioSnapshot,
  validateChangeAnticipoOwnerInput,
} from "./anticipo-route-lib";

function makeContext(
  overrides: Partial<AnticipoManagementContext> = {}
): AnticipoManagementContext {
  return {
    facturaId: "factura-1" as Id<"facturacionFacturas">,
    fase: "causacion",
    asignacionActivaId: "asignacion-activa" as Id<"facturacionAsignaciones">,
    puedeCruzar: true,
    puedeCambiarResponsable: true,
    requiereSeleccionResponsable: false,
    motivoBloqueoCruce: null,
    origenBolsa: "responsable_guardado",
    conflictoBolsaLider: null,
    puedeEditar: true,
    motivoBloqueo: null,
    facturaMarcada: false,
    duenoActual: null,
    candidatos: [],
    bolsaVista: null,
    crucesActivos: { ids: [], cantidad: 0, valorAplicado: 0 },
    requiereConfirmarReversion: false,
    anticipos: [],
    legalizaciones: [],
    totales: {
      valorFactura: 0,
      valorBrutoFactura: 0,
      valorNotasCredito: 0,
      valorAplicadoFactura: 0,
      pendienteDisponible: 0,
      diferenciaNoCubierta: 0,
      valorSolicitado: 0,
      valorLegalizado: 0,
    },
    ...overrides,
  };
}

describe("anticipo owner selections", () => {
  it("combina historial y líderes activos sin duplicar la misma persona y proceso", () => {
    const context = makeContext({
      candidatos: [
        {
          selectionKey: "",
          source: "historial",
          liderAsignacionId: "hist-1" as Id<"facturacionAsignaciones">,
          liderUserId: "leader-1",
          liderNombre: "Ana Histórica",
          liderEmail: "ana@example.com",
          procesoId: 41,
          procesoNombre: "Compras",
          ultimaInteraccionEn: 100,
          estadoAsignacion: "completada",
          esActual: false,
        },
      ],
    });

    const merged = mergeAnticipoOwnerCandidates(context, [
      {
        usuarioId: "leader-1",
        nombre: "Ana Actualizada",
        email: "ana@example.com",
        procesoId: 41,
        procesoNombre: "Compras",
      },
      {
        usuarioId: "leader-2",
        nombre: "Bruno Nuevo",
        email: "bruno@example.com",
        procesoId: 52,
        procesoNombre: "Operaciones",
      },
    ]);

    expect(merged.candidatos).toHaveLength(2);
    expect(merged.candidatos.map((candidate) => candidate.source)).toEqual([
      "historial",
      "directorio_empresa",
    ]);
    expect(merged.candidatos[1]).toMatchObject({
      liderUserId: "leader-2",
      selectionKey: "directorio_empresa:leader-2",
    });
  });

  it("reconoce como elegible a un dueño vigente que sólo existe en el directorio", () => {
    const context = makeContext({
      facturaMarcada: true,
      duenoActual: {
        liderUserId: "leader-2",
        liderNombre: "Bruno Nuevo",
        liderEmail: "bruno@example.com",
        procesoId: 52,
        procesoNombre: "Operaciones",
        elegible: false,
      },
    });

    const merged = mergeAnticipoOwnerCandidates(context, [
      {
        usuarioId: "leader-2",
        nombre: "Bruno Nuevo",
        email: "bruno@example.com",
        procesoId: 52,
        procesoNombre: "Operaciones",
      },
    ]);

    expect(merged.duenoActual?.elegible).toBe(true);
    expect(merged.candidatos[0]).toMatchObject({ esActual: true });
  });

  it("conserva un identificador discriminado para historial y directorio", () => {
    const historyKey = buildAnticipoOwnerSelectionKey("historial", "asig-1");
    const directoryKey = buildAnticipoOwnerSelectionKey("directorio_empresa", "user-1");

    expect(parseAnticipoOwnerSelectionKey(historyKey)).toEqual({
      source: "historial",
      liderAsignacionId: "asig-1",
    });
    expect(parseAnticipoOwnerSelectionKey(directoryKey)).toEqual({
      source: "directorio_empresa",
      liderUserId: "user-1",
    });
  });

  it("valida la selección del directorio sin confiar en snapshots del cliente", () => {
    expect(
      validateChangeAnticipoOwnerInput({
        asignacionId: "asig-activa",
        ownerSelection: {
          source: "directorio_empresa",
          liderUserId: "user-9",
          liderNombre: "Nombre manipulado",
          procesoId: 999,
        },
        confirmarReversionCruces: false,
        expectedLegalizacionIds: [],
      })
    ).toMatchObject({
      ownerSelection: { source: "directorio_empresa", liderUserId: "user-9" },
    });
  });

  it("rechaza un líder activo que no permite resolver una bolsa por proceso", () => {
    expect(() =>
      resolveLiderDirectorioSnapshot(
        [
          {
            usuarioId: "user-3",
            nombre: "Sin proceso",
            email: "sin-proceso@example.com",
          },
        ],
        "user-3"
      )
    ).toThrow("no tiene un proceso configurado");
  });
});
