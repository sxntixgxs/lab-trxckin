/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";

import type { Doc, Id } from "./_generated/dataModel";
import {
  buildAnticipoOwnerCandidates,
  buildAnticipoDuenoCambioComentario,
  fasePermitePermisoAnticipo,
  isFaseAnticipoCruce,
  sameAnticipoBolsaSnapshot,
} from "./lib/facturacionAnticipoDueno";

const NOW = 1_779_840_000_000;

function makeAsignacion(args: {
  id: string;
  userId?: string;
  email: string;
  nombre: string;
  procesoId?: number;
  procesoNombre?: string;
  estado?: Doc<"facturacionAsignaciones">["estado"];
  offset?: number;
}): Doc<"facturacionAsignaciones"> {
  return {
    _id: args.id as Id<"facturacionAsignaciones">,
    _creationTime: NOW,
    facturaId: "factura1" as Id<"facturacionFacturas">,
    tareaId: "tarea1" as Id<"facturacionTareas">,
    empresa: 1,
    fase: "revision_lider",
    estado: args.estado ?? "completada",
    rol: "lider",
    grupoId: "g1",
    asignadoAUserId: args.userId,
    asignadoANombre: args.nombre,
    asignadoAEmail: args.email,
    asignadoAProcesoId: args.procesoId,
    asignadoAProcesoNombre: args.procesoNombre,
    fechaAsignacion: NOW - (args.offset ?? 0),
    creadoEn: NOW - (args.offset ?? 0),
    actualizadoEn: NOW - (args.offset ?? 0),
  };
}

function makeFactura(
  overrides: Partial<Doc<"facturacionFacturas">> = {}
): Doc<"facturacionFacturas"> {
  return {
    _id: "factura1" as Id<"facturacionFacturas">,
    _creationTime: NOW,
    empresa: 1,
    numeroFactura: "F-1",
    tipoDocumento: "01",
    proveedorNit: "900",
    proveedorNitNormalizado: "900",
    numeroFacturaNormalizado: "F1",
    proveedorNombre: "Proveedor",
    fechaEmision: "2026-01-01",
    subtotal: 100,
    impuestos: 0,
    total: 100,
    moneda: "COP",
    descripcion: "x",
    origen: "carga_manual",
    creadoEn: NOW,
    actualizadoEn: NOW,
    ...overrides,
  };
}

describe("buildAnticipoOwnerCandidates", () => {
  test("five leaders with distinct processes produce five candidates", () => {
    const asignaciones = [1, 2, 3, 4, 5].map((index) =>
      makeAsignacion({
        id: `a${index}`,
        userId: `lider-${index}`,
        email: `lider${index}@example.com`,
        nombre: `Líder ${index}`,
        procesoId: 100 + index,
        procesoNombre: `Proceso ${index}`,
        offset: index * 1000,
      })
    );
    const { candidatos } = buildAnticipoOwnerCandidates({
      asignaciones,
      factura: makeFactura(),
    });
    expect(candidatos).toHaveLength(5);
  });

  test("excludes cancelled assignments and leaders without process", () => {
    const asignaciones = [
      makeAsignacion({
        id: "cancelada",
        email: "c@example.com",
        nombre: "Cancelado",
        procesoId: 1,
        procesoNombre: "P1",
        estado: "cancelada",
      }),
      makeAsignacion({
        id: "sin-proceso",
        email: "s@example.com",
        nombre: "Sin proceso",
      }),
      makeAsignacion({
        id: "valida",
        userId: "ok",
        email: "ok@example.com",
        nombre: "OK",
        procesoId: 2,
        procesoNombre: "P2",
      }),
    ];
    const { candidatos } = buildAnticipoOwnerCandidates({
      asignaciones,
      factura: makeFactura(),
    });
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]?.liderUserId).toBe("ok");
  });

  test("deduplicates same leader and process keeping most recent", () => {
    const asignaciones = [
      makeAsignacion({
        id: "old",
        userId: "lider-1",
        email: "l1@example.com",
        nombre: "L1",
        procesoId: 10,
        procesoNombre: "Proc",
        offset: 10_000,
      }),
      makeAsignacion({
        id: "new",
        userId: "lider-1",
        email: "l1@example.com",
        nombre: "L1",
        procesoId: 10,
        procesoNombre: "Proc",
        offset: 1_000,
      }),
    ];
    const { candidatos } = buildAnticipoOwnerCandidates({
      asignaciones,
      factura: makeFactura(),
    });
    expect(candidatos).toHaveLength(1);
    expect(String(candidatos[0]?.liderAsignacionId)).toBe("new");
  });

  test("same person in two processes appears twice", () => {
    const asignaciones = [
      makeAsignacion({
        id: "p1",
        userId: "same",
        email: "same@example.com",
        nombre: "Same",
        procesoId: 1,
        procesoNombre: "Uno",
      }),
      makeAsignacion({
        id: "p2",
        userId: "same",
        email: "same@example.com",
        nombre: "Same",
        procesoId: 2,
        procesoNombre: "Dos",
      }),
    ];
    const { candidatos } = buildAnticipoOwnerCandidates({
      asignaciones,
      factura: makeFactura(),
    });
    expect(candidatos).toHaveLength(2);
  });

  test("marks current owner first when eligible", () => {
    const factura = makeFactura({
      esLegalizacionAnticipo: true,
      anticipoLiderUserId: "lider-2",
      anticipoLiderNombre: "L2",
      anticipoLiderEmail: "l2@example.com",
      anticipoProcesoId: 2,
      anticipoProcesoNombre: "Dos",
    });
    const asignaciones = [
      makeAsignacion({
        id: "p1",
        userId: "lider-1",
        email: "l1@example.com",
        nombre: "L1",
        procesoId: 1,
        procesoNombre: "Uno",
        offset: 100,
      }),
      makeAsignacion({
        id: "p2",
        userId: "lider-2",
        email: "l2@example.com",
        nombre: "L2",
        procesoId: 2,
        procesoNombre: "Dos",
        offset: 1,
      }),
    ];
    const { candidatos, duenoActual } = buildAnticipoOwnerCandidates({
      asignaciones,
      factura,
    });
    expect(candidatos[0]?.esActual).toBe(true);
    expect(duenoActual?.elegible).toBe(true);
  });

  test("shows ineligible legacy owner", () => {
    const factura = makeFactura({
      esLegalizacionAnticipo: true,
      anticipoLiderUserId: "legacy",
      anticipoLiderNombre: "Legacy",
      anticipoLiderEmail: "legacy@example.com",
      anticipoProcesoId: 99,
      anticipoProcesoNombre: "Fantasma",
    });
    const { duenoActual, candidatos } = buildAnticipoOwnerCandidates({
      asignaciones: [],
      factura,
    });
    expect(duenoActual?.elegible).toBe(false);
    expect(candidatos).toHaveLength(0);
  });
});

describe("permisos y bolsas de anticipo", () => {
  test("revision_lider permite cruce y cambio de responsable", () => {
    expect(isFaseAnticipoCruce("revision_lider")).toBe(true);
    expect(fasePermitePermisoAnticipo("revision_lider", "cruce")).toBe(true);
    expect(fasePermitePermisoAnticipo("revision_lider", "cambiar_responsable")).toBe(true);
  });

  test("sameAnticipoBolsaSnapshot compara por bolsaId o proceso", () => {
    expect(
      sameAnticipoBolsaSnapshot(
        { bolsaId: "bolsa-a" as Id<"bolsasAnticipos"> },
        { bolsaId: "bolsa-a" as Id<"bolsasAnticipos">, procesoId: 99 }
      )
    ).toBe(true);
    expect(
      sameAnticipoBolsaSnapshot(
        { procesoId: 10, procesoNombre: "Compras" },
        { procesoId: 10, procesoNombre: "Compras" }
      )
    ).toBe(true);
    expect(
      sameAnticipoBolsaSnapshot(
        { procesoId: 10, procesoNombre: "Compras" },
        { procesoId: 11, procesoNombre: "Otro" }
      )
    ).toBe(false);
  });
});

describe("buildAnticipoDuenoCambioComentario", () => {
  test("builds readable summary", () => {
    const text = buildAnticipoDuenoCambioComentario({
      anterior: {
        liderNombre: "Ana",
        liderEmail: "a@example.com",
        procesoNombre: "A",
        elegible: true,
      },
      nuevo: {
        liderNombre: "Bruno",
        liderEmail: "b@example.com",
        procesoNombre: "B",
        elegible: true,
      },
      crucesRevertidos: { cantidad: 2, valor: 50000 },
    });
    expect(text).toContain("Ana");
    expect(text).toContain("Bruno");
    expect(text).toContain("Revirtió 2 cruce(s)");
  });
});
