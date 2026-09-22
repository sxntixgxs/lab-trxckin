/// <reference types="vite/client" />

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  deriveCausacionEstado,
  matchesCausacionEstadoFilter,
  normalizeNumeroFp,
  puedeEditarCausacionFlujo,
  puedeEditarCausacionReembolso,
  resolveCausacionTransition,
  validateMotivoCambio,
  validateNumeroFp,
} from "./lib/facturacionCausacion";
import { recomputeReembolsoCausacionCounts } from "./facturacionCausacion";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const EMPRESA = 1;
const NOW = 1_779_840_000_000;
const SECRET = "test-facturacion-causacion-secret";

const ANALISTA = {
  userId: "analista-1",
  nombre: "Analista Causación",
  email: "analista@example.com",
};

const OTRO = {
  userId: "otro-1",
  nombre: "Otro Usuario",
  email: "otro@example.com",
};

function makeTest() {
  process.env.CONVEX_SERVER_SECRET = SECRET;
  return convexTest(schema, modules);
}

async function insertFactura(
  t: ReturnType<typeof makeTest>,
  args: { numero: string; esPeaje?: boolean; causado?: boolean; numeroFp?: string }
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("facturacionFacturas", {
      empresa: EMPRESA,
      numeroFactura: args.numero,
      tipoDocumento: "01",
      tipoDocumentoNormalizado: "01",
      documentoClase: "factura",
      proveedorNit: "900123456",
      proveedorNitNormalizado: "900123456",
      numeroFacturaNormalizado: args.numero.replace(/\D/g, ""),
      proveedorNombre: "Proveedor Test",
      fechaEmision: "2026-06-01",
      subtotal: 100_000,
      impuestos: 0,
      total: 100_000,
      moneda: "COP",
      descripcion: "Documento de prueba",
      origen: "carga_manual",
      ...(args.esPeaje ? { esPeaje: true } : {}),
      ...(args.causado !== undefined ? { causado: args.causado } : {}),
      ...(args.numeroFp ? { numeroFp: args.numeroFp } : {}),
      creadoEn: NOW,
      actualizadoEn: NOW,
    })
  );
}

async function seedCausacionTask(
  t: ReturnType<typeof makeTest>,
  facturaId: Id<"facturacionFacturas">,
  usuario = ANALISTA
) {
  return await t.run(async (ctx) => {
    const tareaId = await ctx.db.insert("facturacionTareas", {
      facturaId,
      empresa: EMPRESA,
      estado: "causacion",
      categoria: "administracion",
      asignadoAUserId: usuario.userId,
      asignadoANombre: usuario.nombre,
      asignadoAEmail: usuario.email,
      causacionAsignadoAUserId: usuario.userId,
      causacionAsignadoANombre: usuario.nombre,
      causacionAsignadoAEmail: usuario.email,
      liderProcesoUserId: usuario.userId,
      liderProcesoNombre: usuario.nombre,
      liderProcesoEmail: usuario.email,
      creadoEn: NOW,
      actualizadoEn: NOW,
    });
    const grupoId = `causacion:${String(facturaId)}:${String(tareaId)}`;
    const asignacionId = await ctx.db.insert("facturacionAsignaciones", {
      facturaId,
      tareaId,
      empresa: EMPRESA,
      fase: "causacion",
      estado: "pendiente",
      rol: "analista_causacion",
      grupoId,
      asignadoAUserId: usuario.userId,
      asignadoANombre: usuario.nombre,
      asignadoAEmail: usuario.email,
      fechaAsignacion: NOW,
      creadoEn: NOW,
      actualizadoEn: NOW,
    });
    await ctx.db.patch("facturacionTareas", tareaId, {
      currentAsignacionId: asignacionId,
      grupoAsignacionActualId: grupoId,
    });
    return { tareaId, asignacionId };
  });
}

function expectConvexCode(error: unknown, code: string) {
  expect(error).toBeInstanceOf(ConvexError);
  const data = (error as ConvexError<{ code: string; message: string }>).data;
  expect(data.code).toBe(code);
}

describe("facturacionCausacion domain", () => {
  test("deriveCausacionEstado distingue sin registro, causado y no causado", () => {
    expect(deriveCausacionEstado(undefined)).toBe("sin_registro");
    expect(deriveCausacionEstado(true)).toBe("causado");
    expect(deriveCausacionEstado(false)).toBe("no_causado");
  });

  test("validateNumeroFp preserva ceros, trim y rechaza controles", () => {
    expect(validateNumeroFp("  FP-00123  ")).toBe("FP-00123");
    expect(validateNumeroFp("00045")).toBe("00045");
    expect(() => validateNumeroFp("")).toThrow(/obligatorio/);
    expect(() => validateNumeroFp("a\u0001b")).toThrow(/no permitidos/);
  });

  test("resolveCausacionTransition exige FP al causar y rechaza FP si no causado", () => {
    expect(() =>
      resolveCausacionTransition({
        causadoAnterior: null,
        numeroFpAnterior: null,
        causadoNuevo: true,
        numeroFpNuevo: "",
      })
    ).toThrow(/obligatorio/);

    expect(() =>
      resolveCausacionTransition({
        causadoAnterior: null,
        numeroFpAnterior: null,
        causadoNuevo: false,
        numeroFpNuevo: "FP-1",
      })
    ).toThrow(/no está causada/);

    const first = resolveCausacionTransition({
      causadoAnterior: null,
      numeroFpAnterior: null,
      causadoNuevo: true,
      numeroFpNuevo: "FP-100",
    });
    expect(first.isNoOp).toBe(false);
    expect(first.numeroFpNuevo).toBe("FP-100");

    const noop = resolveCausacionTransition({
      causadoAnterior: true,
      numeroFpAnterior: "FP-100",
      causadoNuevo: true,
      numeroFpNuevo: "FP-100",
    });
    expect(noop.isNoOp).toBe(true);
  });

  test("resolveCausacionTransition exige motivo al cambiar FP o descausar", () => {
    expect(() =>
      resolveCausacionTransition({
        causadoAnterior: true,
        numeroFpAnterior: "FP-1",
        causadoNuevo: true,
        numeroFpNuevo: "FP-2",
      })
    ).toThrow(/motivo/);

    expect(() =>
      resolveCausacionTransition({
        causadoAnterior: true,
        numeroFpAnterior: "FP-1",
        causadoNuevo: false,
      })
    ).toThrow(/motivo/);

    const changed = resolveCausacionTransition({
      causadoAnterior: true,
      numeroFpAnterior: "FP-1",
      causadoNuevo: true,
      numeroFpNuevo: "FP-2",
      motivoCambio: "Corrección de digitación",
    });
    expect(changed.motivoCambio).toBe("Corrección de digitación");
    expect(changed.isNoOp).toBe(false);
  });

  test("validateMotivoCambio y matchesCausacionEstadoFilter", () => {
    expect(validateMotivoCambio("  ok  ", true)).toBe("ok");
    expect(matchesCausacionEstadoFilter(undefined, "sin_registro")).toBe(true);
    expect(matchesCausacionEstadoFilter(true, "causado")).toBe(true);
    expect(normalizeNumeroFp("   ")).toBeNull();
  });

  test("puedeEditarCausacionFlujo respeta fase, peajes y asignación", () => {
    expect(
      puedeEditarCausacionFlujo({
        esPeaje: true,
        tieneTarea: true,
        faseActual: "causacion",
        asignadoAUserId: ANALISTA.userId,
        actorUserId: ANALISTA.userId,
      })
    ).toMatchObject({ puedeEditar: false, motivoSoloLectura: "peajes_solo_consulta" });

    expect(
      puedeEditarCausacionFlujo({
        esPeaje: false,
        tieneTarea: true,
        faseActual: "gerencia",
        asignadoAUserId: ANALISTA.userId,
        actorUserId: ANALISTA.userId,
      }).motivoSoloLectura
    ).toBe("fase_no_habilitada");

    expect(
      puedeEditarCausacionFlujo({
        esPeaje: false,
        tieneTarea: true,
        faseActual: "causacion",
        asignadoAUserId: ANALISTA.userId,
        actorUserId: OTRO.userId,
      }).motivoSoloLectura
    ).toBe("no_asignado");
  });

  test("puedeEditarCausacionReembolso valida responsable y fase", () => {
    expect(
      puedeEditarCausacionReembolso({
        estadoReembolso: "pendiente_revision",
        responsableActualUserId: ANALISTA.userId,
        actorUserId: ANALISTA.userId,
        reviewAssignedUserId: ANALISTA.userId,
      }).puedeEditar
    ).toBe(true);

    expect(
      puedeEditarCausacionReembolso({
        estadoReembolso: "aprobado_pendiente_recibo",
        responsableActualUserId: ANALISTA.userId,
        actorUserId: ANALISTA.userId,
        reviewAssignedUserId: ANALISTA.userId,
      }).motivoSoloLectura
    ).toBe("fase_no_habilitada");
  });
});

describe("facturacionCausacion API", () => {
  test("actualizarDesdeServidor registra causación, auditoría y versión", async () => {
    const t = makeTest();
    const facturaId = await insertFactura(t, { numero: "FAC-CAUS-001" });
    const { tareaId } = await seedCausacionTask(t, facturaId);

    const result = await t.mutation(api.facturacionCausacion.actualizarDesdeServidor, {
      secret: SECRET,
      facturaId,
      actor: ANALISTA,
      empresasAutorizadas: [EMPRESA],
      expectedVersion: 0,
      causado: true,
      numeroFp: "FP-9001",
      contexto: { tipo: "flujo_factura" },
    });

    expect(result.estado).toBe("causado");
    expect(result.numeroFp).toBe("FP-9001");
    expect(result.version).toBe(1);

    const snapshot = await t.run(async (ctx) => {
      const factura = await ctx.db.get("facturacionFacturas", facturaId);
      const aprobaciones = await ctx.db
        .query("facturacionAprobaciones")
        .withIndex("by_tareaId", (q) => q.eq("tareaId", tareaId))
        .collect();
      const dashboard = await ctx.db
        .query("facturacionDashboardItems")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
        .first();
      return { factura, aprobaciones, dashboard };
    });

    expect(snapshot.factura?.causado).toBe(true);
    expect(snapshot.factura?.numeroFp).toBe("FP-9001");
    expect(snapshot.factura?.causacionVersion).toBe(1);
    expect(snapshot.aprobaciones.some((row) => row.accion === "actualizar_causacion")).toBe(true);
    expect(snapshot.dashboard?.causado).toBe(true);
    expect(snapshot.dashboard?.numeroFp).toBe("FP-9001");
  });

  test("actualizarDesdeServidor rechaza no-op, conflicto de versión y permisos", async () => {
    const t = makeTest();
    const facturaId = await insertFactura(t, {
      numero: "FAC-CAUS-002",
      causado: true,
      numeroFp: "FP-EXISTENTE",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("facturacionFacturas", facturaId, { causacionVersion: 2 });
    });
    await seedCausacionTask(t, facturaId);

    try {
      await t.mutation(api.facturacionCausacion.actualizarDesdeServidor, {
        secret: SECRET,
        facturaId,
        actor: ANALISTA,
        empresasAutorizadas: [EMPRESA],
        expectedVersion: 0,
        causado: true,
        numeroFp: "FP-EXISTENTE",
        contexto: { tipo: "flujo_factura" },
      });
      throw new Error("expected conflict");
    } catch (error) {
      expectConvexCode(error, "CONFLICT");
    }

    await t.run(async (ctx) => {
      await ctx.db.patch("facturacionFacturas", facturaId, { causacionVersion: 2 });
    });

    try {
      await t.mutation(api.facturacionCausacion.actualizarDesdeServidor, {
        secret: SECRET,
        facturaId,
        actor: ANALISTA,
        empresasAutorizadas: [EMPRESA],
        expectedVersion: 2,
        causado: true,
        numeroFp: "FP-EXISTENTE",
        contexto: { tipo: "flujo_factura" },
      });
      throw new Error("expected noop");
    } catch (error) {
      expectConvexCode(error, "UNPROCESSABLE");
    }

    try {
      await t.mutation(api.facturacionCausacion.actualizarDesdeServidor, {
        secret: SECRET,
        facturaId,
        actor: OTRO,
        empresasAutorizadas: [EMPRESA],
        expectedVersion: 2,
        causado: false,
        motivoCambio: "No corresponde",
        contexto: { tipo: "flujo_factura" },
      });
      throw new Error("expected forbidden");
    } catch (error) {
      expectConvexCode(error, "FORBIDDEN");
    }
  });

  test("obtenerDesdeServidor deja peajes en solo lectura", async () => {
    const t = makeTest();
    const facturaId = await insertFactura(t, { numero: "PEAJE-001", esPeaje: true });
    await seedCausacionTask(t, facturaId);

    const snapshot = await t.query(api.facturacionCausacion.obtenerDesdeServidor, {
      secret: SECRET,
      facturaId,
      actorUserId: ANALISTA.userId,
      empresasAutorizadas: [EMPRESA],
      contexto: { tipo: "flujo_factura" },
    });

    expect(snapshot.puedeEditar).toBe(false);
    expect(snapshot.motivoSoloLectura).toBe("peajes_solo_consulta");
    expect(snapshot.estado).toBe("sin_registro");
  });

  test("recomputeReembolsoCausacionCounts agrega conteos por movimiento", async () => {
    const t = makeTest();
    const facturaCausada = await insertFactura(t, {
      numero: "FAC-R-1",
      causado: true,
      numeroFp: "FP-A",
    });
    const facturaNo = await insertFactura(t, { numero: "FAC-R-2", causado: false });
    const facturaSin = await insertFactura(t, { numero: "FAC-R-3" });

    const { reembolsoId } = await t.run(async (ctx) => {
      const cajaMenorId = await ctx.db.insert("cajasMenores", {
        empresa_id: EMPRESA,
        nombre: "Caja Test",
        assignedValue: 100_000,
        assignedValueLetras: "Cien mil",
        assignedUsersIds: [ANALISTA.userId],
        estado: "activa",
        createdAt: NOW,
        createdByUserId: ANALISTA.userId,
        updatedAt: NOW,
        updatedByUserId: ANALISTA.userId,
      });

      const movimientoIds = [];
      for (const facturaId of [facturaCausada, facturaNo, facturaSin]) {
        const movimientoId = await ctx.db.insert("facturacionCajaMenorMovimientos", {
          facturaId,
          cajaMenorId,
          origen: "factura_sistema",
          estado: "en_reembolso",
          nombreEmpresa: "Proveedor",
          concepto: "Compra",
          fechaPago: "2026-06-01",
          valor: 10_000,
          centroCostoCodigo: "CC-1",
          centroCostoNombre: "Centro",
          actorUserId: ANALISTA.userId,
          actorNombre: ANALISTA.nombre,
          actorEmail: ANALISTA.email,
          creadoEn: NOW,
          actualizadoEn: NOW,
        });
        movimientoIds.push(movimientoId);
      }

      const reembolsoId = await ctx.db.insert("cajasMenoresReembolsos", {
        cajaMenorId,
        movimientoIds,
        estado: "pendiente_revision",
        valorTotal: 30_000,
        custodioUserId: ANALISTA.userId,
        custodioNombre: ANALISTA.nombre,
        custodioEmail: ANALISTA.email,
        responsableActualUserId: ANALISTA.userId,
        reviewAssignedUserId: ANALISTA.userId,
        creadoEn: NOW,
        actualizadoEn: NOW,
      });

      return { reembolsoId };
    });

    await t.run(async (ctx) => {
      await recomputeReembolsoCausacionCounts(ctx, reembolsoId, NOW);
    });

    const reembolso = await t.run(async (ctx) => ctx.db.get("cajasMenoresReembolsos", reembolsoId));
    expect(reembolso?.causacionCausadasCount).toBe(1);
    expect(reembolso?.causacionNoCausadasCount).toBe(1);
    expect(reembolso?.causacionSinRegistroCount).toBe(1);
  });
});
