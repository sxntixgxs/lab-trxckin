/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import type { AssistantToolResult } from '../lib/assistant/contracts';
import { asUser, type TestUser } from '../test-utils/onboardingActors';
import { internal } from './_generated/api';
import schema from './schema';
import { revalidateAssistantSources } from './assistant/tools';
import { refrescarProyeccionFactura } from './lib/facturacionDashboardProjection';
import { refreshAnticipoDashboardProjection } from './lib/anticiposDashboardProjection';

const modules = import.meta.glob('./**/*.*s');
type T = ReturnType<typeof convexTest>;
const now = Date.UTC(2026, 8, 25);
async function actor(t: T, input: TestUser) {
  await asUser(t, input);
  return t.withIdentity({
    tokenIdentifier: `test|${input.id}`,
    subject: input.id,
    email: `${input.id}@example.com`,
    name: input.id,
  });
}
async function invoice(t: T, company = 1, name = 'F-123') {
  return t.run(async (ctx) => {
    const id = await ctx.db.insert('facturacionFacturas', {
      empresa: company,
      numeroFactura: name,
      tipoDocumento: '01',
      documentoClase: 'factura',
      proveedorNit: '900123456',
      proveedorNombre: 'Proveedor Visible',
      fechaEmision: '2026-09-10',
      subtotal: 100,
      impuestos: 19,
      total: 119,
      moneda: 'COP',
      descripcion: 'INTERNAL_ATTACHMENT_BODY_DO_NOT_EXPOSE',
      origen: 'carga_manual',
      creadoEn: now,
      actualizadoEn: now,
    });
    await refrescarProyeccionFactura(ctx, id, now);
    return id;
  });
}
async function onboarding(t: T, type: 'supplier' | 'customer', owner: string, company = 1) {
  return t.run(async (ctx) => {
    const common = {
      empresa: company,
      NIT: '900123456',
      faseActual: 'II_PENDIENTE_FORMULARIO' as const,
      matriz_00: {
        responsableId: owner,
        servicioSuministrado: 'Servicio',
        montoAnual: 'Menor a 10 millones COP',
        sectorEconomico: 'Comercio',
        jurisdiccionNacional: 'Bogotá',
        jurisdiccionInternacional: '',
        isPep: false,
        listas: 'NO',
        riesgo: 'BAJO' as const,
      },
      datos_generales_01: {
        tipoPersona: 'PERSONA_JURIDICA' as const,
        tipoDocumento: 'NIT' as const,
        numeroDocumento: '900123456',
        razonSocial: `${type} autorizado`,
        contactoNombre: 'Contacto',
        contactoCelular: '3000000000',
        contactoEmail: 'private-contact@example.com',
      },
    };
    if (type === 'customer') return ctx.db.insert('onboardingClientes', { ...common, tipoEvaluacion: 'SOLO LISTAS' });
    return ctx.db.insert('onboardingProveedores', {
      ...common,
      matriz_00: {
        ...common.matriz_00,
        actividadEconomicaPrincipal: 'Comercio',
        codigoCiiuSecundario: '',
        actividadEconomicaSecundaria: '',
      },
      tipoEvaluacion_14: 'SOLO LISTAS',
    });
  });
}
async function advance(t: T, owner: string) {
  return t.run(async (ctx) => {
    const id = await ctx.db.insert('anticipos', {
      empresa: 1,
      empresa_id: 1,
      consecutivo: 123,
      razonSocial: 'Proveedor Visible',
      nit: '900123456',
      formaPago: 'TRANSFERENCIA PAGO ELECTRÓNICO',
      valorNumerico: 200,
      valorContable: 180,
      valorLegalizableActual: 150,
      saldoLegalizado: 90,
      valorLetra: 'Doscientos',
      maxLegalizacionDate: now,
      createdById: owner,
      responsableUserId: owner,
      faseActual: 'V_PENDIENTE_LEGALIZACION',
      legalizacion: [],
      createdAt: now,
      updatedAt: now,
    });
    await refreshAnticipoDashboardProjection(ctx, id, now);
    return id;
  });
}
async function box(t: T, custodian: string) {
  return t.run((ctx) =>
    ctx.db.insert('cajasMenores', {
      empresa_id: 1,
      nombre: 'Caja principal',
      assignedValue: 500,
      assignedValueLetras: 'Quinientos',
      assignedUsersIds: [custodian],
      updatedAt: now,
      updatedByUserId: 'admin',
    }),
  );
}

describe('Assistant authorized native tools', () => {
  test('rejects unauthenticated, forged acting identity, company scope and mutation operations', async () => {
    const t = convexTest(schema, modules);
    const args = {
      domain: 'billing' as const,
      operation: 'search' as const,
      companyIds: [1],
      expectedActingUserId: 'reader',
    };
    await expect(t.query(internal.assistant.tools.readAssistantData, args)).rejects.toThrow();
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['billing/invoices'] });
    await expect(
      user.query(internal.assistant.tools.readAssistantData, { ...args, expectedActingUserId: 'admin' }),
    ).rejects.toThrow('identidad');
    await expect(user.query(internal.assistant.tools.readAssistantData, { ...args, companyIds: [2] })).rejects.toThrow(
      'empresas',
    );
    await expect(
      user.query(internal.assistant.tools.readAssistantData, { ...args, operation: 'delete' as 'search' }),
    ).rejects.toThrow();
  });

  test('billing returns linked minimal evidence and hides unscoped invoices', async () => {
    const t = convexTest(schema, modules);
    const id = await invoice(t);
    const other = await invoice(t, 2);
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['billing/invoices'] });
    const args = {
      domain: 'billing' as const,
      operation: 'detail' as const,
      companyIds: [1],
      expectedActingUserId: 'reader',
    };
    const result = await user.query(internal.assistant.tools.readAssistantData, { ...args, recordId: id });
    expect(result.records[0]).toMatchObject({ id, href: `/billing/invoices/${id}`, amount: 119, currency: 'COP' });
    expect(result.rows[0]).toMatchObject({ factura: 'F-123', sla: 'n_a', totalFactura: 119 });
    expect(JSON.stringify(result)).not.toContain('INTERNAL_ATTACHMENT_BODY');
    expect(
      (await user.query(internal.assistant.tools.readAssistantData, { ...args, recordId: other })).records,
    ).toEqual([]);
    expect(await user.run((ctx) => revalidateAssistantSources(ctx, result.sources, [1], 'reader'))).toBe(true);
    await actor(t, { id: 'reader', empresas: [1], permisos: [] });
    expect(await user.run((ctx) => revalidateAssistantSources(ctx, result.sources, [1], 'reader'))).toBe(false);
  });

  test('keeps the invoice participant exception while checking fixed company scope', async () => {
    const t = convexTest(schema, modules);
    const id = await invoice(t);
    await t.run((ctx) =>
      ctx.db.insert('facturacionTareas', {
        facturaId: id,
        estado: 'recepcion',
        categoria: 'otro',
        liderProcesoNombre: '',
        liderProcesoEmail: '',
        asignadoANombre: 'Participant',
        asignadoAEmail: 'participant@example.com',
        asignadoAUserId: 'participant',
        creadoEn: now,
        actualizadoEn: now,
      }),
    );
    const user = await actor(t, { id: 'participant', empresas: [1], permisos: [] });
    const result = await user.query(internal.assistant.tools.readAssistantData, {
      domain: 'billing',
      operation: 'detail',
      recordId: id,
      companyIds: [1],
      expectedActingUserId: 'participant',
    });
    expect(result.records).toHaveLength(1);
    expect(await user.run((ctx) => revalidateAssistantSources(ctx, result.sources, [1], 'participant'))).toBe(true);
  });

  test.each(['supplier', 'customer'] as const)(
    '%s onboarding enforces responsibility and locks history after reassignment',
    async (type) => {
      const t = convexTest(schema, modules);
      const own = await onboarding(t, type, 'reader');
      const other = await onboarding(t, type, 'other');
      const domain = type === 'supplier' ? 'suppliers' : 'customers';
      const user = await actor(t, { id: 'reader', empresas: [1], permisos: [`${domain}/onboarding`] });
      const args = { domain, operation: 'detail' as const, companyIds: [1], expectedActingUserId: 'reader' };
      const result = await user.query(internal.assistant.tools.readAssistantData, { ...args, recordId: own });
      expect(result.records).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain('private-contact');
      expect(
        (await user.query(internal.assistant.tools.readAssistantData, { ...args, recordId: other })).records,
      ).toEqual([]);
      await t.run(async (ctx) => {
        if (type === 'supplier') {
          const id = ctx.db.normalizeId('onboardingProveedores', own)!;
          const doc = (await ctx.db.get('onboardingProveedores', id))!;
          await ctx.db.patch('onboardingProveedores', id, { matriz_00: { ...doc.matriz_00, responsableId: 'other' } });
        } else {
          const id = ctx.db.normalizeId('onboardingClientes', own)!;
          const doc = (await ctx.db.get('onboardingClientes', id))!;
          await ctx.db.patch('onboardingClientes', id, { matriz_00: { ...doc.matriz_00, responsableId: 'other' } });
        }
      });
      expect(await user.run((ctx) => revalidateAssistantSources(ctx, result.sources, [1], 'reader'))).toBe(false);
    },
  );

  test('advances respect owners and use adjusted legalization values', async () => {
    const t = convexTest(schema, modules);
    const own = await advance(t, 'reader');
    const other = await advance(t, 'other');
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['finance/advances/request'] });
    const args = {
      domain: 'advances' as const,
      operation: 'detail' as const,
      companyIds: [1],
      expectedActingUserId: 'reader',
    };
    const result = await user.query(internal.assistant.tools.readAssistantData, { ...args, recordId: own });
    expect(result.rows[0]).toMatchObject({ valorLegalizable: 150, saldoLegalizado: 90, saldoPendiente: 60 });
    expect(
      (await user.query(internal.assistant.tools.readAssistantData, { ...args, recordId: other })).records,
    ).toHaveLength(0);
    const summary = await user.query(internal.assistant.tools.readAssistantData, { ...args, operation: 'summary' });
    expect(summary.summary).toMatchObject({ registros: 1, saldoPendiente_COP: 60, saldoLegalizado_COP: 90 });
    expect(summary.metadata.complete).toBe(true);
  });

  test('cash balances use confirmed refills and never publish a truncated balance', async () => {
    const t = convexTest(schema, modules);
    const id = await box(t, 'reader');
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['finance/petty-cash'] });
    const args = {
      domain: 'pettyCash' as const,
      operation: 'detail' as const,
      recordId: id,
      companyIds: [1],
      expectedActingUserId: 'reader',
    };
    await t.run((ctx) =>
      ctx.db.insert('cajasMenoresRefills', {
        cajaMenorId: id,
        refillDate: now,
        refillValue: 200,
        refillValueLetras: 'Doscientos',
        refillByUserId: 'admin',
        refillToUserId: 'reader',
        receiptConfirmed: false,
      }),
    );
    expect((await user.query(internal.assistant.tools.readAssistantData, args)).rows[0]).toMatchObject({
      saldoActual: 500,
      saldoDisponible: 0,
      recargaPendiente: true,
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++)
        await ctx.db.insert('cajasMenoresRefills', {
          cajaMenorId: id,
          refillDate: now,
          refillValue: 1,
          refillValueLetras: 'Uno',
          refillByUserId: 'admin',
          refillToUserId: 'reader',
          receiptConfirmed: true,
        });
    });
    const truncated = await user.query(internal.assistant.tools.readAssistantData, args);
    expect(truncated.rows[0].saldoActual).toBeNull();
    expect(truncated.metadata.complete).toBe(false);
    const other = await actor(t, { id: 'other', empresas: [1], permisos: ['finance/petty-cash'] });
    expect(
      (await other.query(internal.assistant.tools.readAssistantData, { ...args, expectedActingUserId: 'other' }))
        .records,
    ).toHaveLength(0);
  });

  test('search pages expose partial scope and reject cursors reused with different filters', async () => {
    const t = convexTest(schema, modules);
    await invoice(t, 1, 'F-1');
    await invoice(t, 1, 'F-2');
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['billing/invoices'] });
    const args = {
      domain: 'billing' as const,
      operation: 'search' as const,
      companyIds: [1],
      expectedActingUserId: 'reader',
      limit: 1,
    };
    const result: AssistantToolResult = await user.query(internal.assistant.tools.readAssistantData, args);
    expect(result.metadata.complete).toBe(false);
    expect(result.records).toHaveLength(1);
    expect(result.metadata.nextCursor).toBeTruthy();
    await expect(
      user.query(internal.assistant.tools.readAssistantData, {
        ...args,
        search: 'changed',
        cursor: result.metadata.nextCursor!,
      }),
    ).rejects.toThrow('Cursor');
  });

  test('cash movements and reimbursement evidence preserve box and participant access', async () => {
    const t = convexTest(schema, modules);
    const boxId = await box(t, 'custodian');
    const invoiceId = await invoice(t);
    const reimbursementId = await t.run(async (ctx) => {
      const movementId = await ctx.db.insert('facturacionCajaMenorMovimientos', {
        cajaMenorId: boxId,
        facturaId: invoiceId,
        origen: 'factura_sistema',
        estado: 'pendiente_reembolso',
        nombreEmpresa: 'Proveedor Visible',
        concepto: 'Papelería',
        fechaPago: '2026-09-20',
        valor: 50,
        centroCostoCodigo: 'CC1',
        centroCostoNombre: 'Administración',
        actorNombre: 'Custodian',
        actorEmail: 'custodian@example.com',
        creadoEn: now,
        actualizadoEn: now,
      });
      return ctx.db.insert('cajasMenoresReembolsos', {
        cajaMenorId: boxId,
        empresaId: 1,
        movimientoIds: [movementId],
        valorTotal: 50,
        numeroReembolso: 'GFN-F006-2026-0001',
        estado: 'pendiente_aprobacion_lider',
        liderAprobadorUserId: 'leader',
        custodioUserId: 'custodian',
        custodioNombre: 'Custodian',
        custodioEmail: 'custodian@example.com',
        creadoEn: now,
        actualizadoEn: now,
      });
    });
    const user = await actor(t, { id: 'custodian', empresas: [1], permisos: ['finance/petty-cash'] });
    const result = await user.query(internal.assistant.tools.readAssistantData, {
      domain: 'pettyCash',
      operation: 'movements',
      recordId: boxId,
      companyIds: [1],
      expectedActingUserId: 'custodian',
    });
    expect(result.rows[0]).toMatchObject({ concepto: 'Papelería', valor: 50 });
    expect(result.records[0].href).toBe(`/finance/petty-cash?caja=${boxId}`);
    const leader = await actor(t, { id: 'leader', empresas: [1], permisos: ['billing/petty-cash-reimbursement'] });
    const reimbursement = await leader.query(internal.assistant.tools.readAssistantData, {
      domain: 'pettyCash',
      operation: 'detail',
      recordId: reimbursementId,
      companyIds: [1],
      expectedActingUserId: 'leader',
    });
    expect(reimbursement.records[0]).toMatchObject({ id: reimbursementId, amount: 50 });
    await t.run((ctx) =>
      ctx.db.patch('cajasMenoresReembolsos', reimbursementId, { liderAprobadorUserId: 'new-leader' }),
    );
    expect(await leader.run((ctx) => revalidateAssistantSources(ctx, reimbursement.sources, [1], 'leader'))).toBe(
      false,
    );
    await t.run((ctx) => ctx.db.patch('cajasMenores', boxId, { assignedUsersIds: [] }));
    expect(await user.run((ctx) => revalidateAssistantSources(ctx, result.sources, [1], 'custodian'))).toBe(false);
  });

  test('legalization does not disclose invoice details through advance-only permissions', async () => {
    const t = convexTest(schema, modules);
    const advanceId = await advance(t, 'reader');
    const invoiceId = await invoice(t);
    await t.run((ctx) =>
      ctx.db.insert('facturacionAnticipoLegalizaciones', {
        facturaId: invoiceId,
        anticipoId: advanceId,
        empresa: 1,
        estado: 'activa',
        valorAplicado: 90,
        saldoAntes: 150,
        saldoDespues: 60,
        liderNombre: 'Leader',
        liderEmail: 'leader@example.com',
        creadoEn: now,
        actualizadoEn: now,
        actorUserId: 'admin',
        actorNombre: 'Admin',
        actorEmail: 'admin@example.com',
      }),
    );
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['finance/advances/request'] });
    const args = {
      domain: 'advances' as const,
      operation: 'legalizations' as const,
      recordId: advanceId,
      companyIds: [1],
      expectedActingUserId: 'reader',
    };
    const result = await user.query(internal.assistant.tools.readAssistantData, args);
    expect(result.records).toHaveLength(0);
    const billingUser = await actor(t, {
      id: 'reader',
      empresas: [1],
      permisos: ['finance/advances/request', 'billing/invoices'],
    });
    expect((await billingUser.query(internal.assistant.tools.readAssistantData, args)).records[0].id).toBe(invoiceId);
  });

  test('legalization filters search fields and inclusive Bogota creation dates before returning evidence', async () => {
    const t = convexTest(schema, modules);
    const advanceId = await advance(t, 'reader');
    const fixtures = [
      { number: 'LC-BEFORE', timestamp: Date.parse('2026-09-20T04:59:59Z') },
      { number: 'LC-A', timestamp: Date.parse('2026-09-20T05:00:00Z') },
      { number: 'LC-B', timestamp: Date.parse('2026-09-21T04:59:59Z') },
      { number: 'LC-AFTER', timestamp: Date.parse('2026-09-21T05:00:00Z') },
    ];
    for (const fixture of fixtures) {
      const invoiceId = await invoice(t, 1, fixture.number);
      await t.run((ctx) =>
        ctx.db.insert('facturacionAnticipoLegalizaciones', {
          facturaId: invoiceId,
          anticipoId: advanceId,
          empresa: 1,
          estado: 'activa',
          valorAplicado: 10,
          saldoAntes: 150,
          saldoDespues: 140,
          liderNombre: 'Leader',
          liderEmail: 'leader@example.com',
          creadoEn: fixture.timestamp,
          actualizadoEn: fixture.timestamp,
          actorUserId: 'admin',
          actorNombre: 'Admin',
          actorEmail: 'admin@example.com',
        }),
      );
    }
    const user = await actor(t, {
      id: 'reader',
      empresas: [1],
      permisos: ['finance/advances/request', 'billing/invoices'],
    });
    const args = {
      domain: 'advances' as const,
      operation: 'legalizations' as const,
      recordId: advanceId,
      companyIds: [1],
      expectedActingUserId: 'reader',
      from: '2026-09-20',
      to: '2026-09-20',
    };
    const result = await user.query(internal.assistant.tools.readAssistantData, args);
    expect(result.rows.map((row) => row.factura)).toEqual(['LC-A', 'LC-B']);
    expect(result.rows.every((row) => row.fecha === '2026-09-20')).toBe(true);
    expect(result.metadata).toMatchObject({
      from: '2026-09-20',
      to: '2026-09-20',
      returned: 2,
      scanned: 4,
      complete: true,
    });
    const invoiceSearch = await user.query(internal.assistant.tools.readAssistantData, { ...args, search: 'LC-A' });
    expect(invoiceSearch.records.map((record) => record.title)).toEqual(['LC-A']);
    expect(invoiceSearch.sources.filter((source) => source.recordType === 'invoice')).toHaveLength(1);
    for (const search of ['proveedor visible', '900123456']) {
      expect((await user.query(internal.assistant.tools.readAssistantData, { ...args, search })).records).toHaveLength(
        2,
      );
    }
    expect(
      (await user.query(internal.assistant.tools.readAssistantData, { ...args, search: 'no coincide' })).records,
    ).toHaveLength(0);
  });

  test('aggregate entitlement revocation locks prior empty search results', async () => {
    const t = convexTest(schema, modules);
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['customers/onboarding'] });
    const roleId = await t.run((ctx) =>
      ctx.db.insert('onboardingWhitelist', {
        modulo: 'customer',
        empresa: 1,
        userId: 'reader',
        nombre: 'Reader',
        email: 'reader@example.com',
        permiso: 'CONSULTA',
      }),
    );
    const result = await user.query(internal.assistant.tools.readAssistantData, {
      domain: 'customers',
      operation: 'summary',
      companyIds: [1],
      expectedActingUserId: 'reader',
    });
    expect(result.sources.some((source) => source.kind === 'aggregate')).toBe(true);
    expect(await user.run((ctx) => revalidateAssistantSources(ctx, result.sources, [1], 'reader'))).toBe(true);
    await t.run((ctx) => ctx.db.delete('onboardingWhitelist', roleId));
    expect(await user.run((ctx) => revalidateAssistantSources(ctx, result.sources, [1], 'reader'))).toBe(false);
  });

  test('complete billing summaries respect dashboard-only access and never mix currencies', async () => {
    const t = convexTest(schema, modules);
    await invoice(t, 1, 'COP-1');
    const usdId = await invoice(t, 1, 'USD-1');
    await t.run(async (ctx) => {
      await ctx.db.patch('facturacionFacturas', usdId, { moneda: 'USD', total: 10 });
      await refrescarProyeccionFactura(ctx, usdId, now);
    });
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['billing/dashboard'] });
    const args = {
      domain: 'billing' as const,
      operation: 'summary' as const,
      companyIds: [1],
      expectedActingUserId: 'reader',
    };
    const result = await user.query(internal.assistant.tools.readAssistantData, args);
    expect(result.metadata.complete).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.summary).toMatchObject({ registros: 2, valorContable_COP: 119, valorContable_USD: 10 });
    expect(result.records).toEqual([]);
    expect(
      (await user.query(internal.assistant.tools.readAssistantData, { ...args, operation: 'detail', recordId: usdId }))
        .records,
    ).toEqual([]);
    expect(await user.run((ctx) => revalidateAssistantSources(ctx, result.sources, [1], 'reader'))).toBe(true);
    await actor(t, { id: 'reader', empresas: [1], permisos: [] });
    expect(await user.run((ctx) => revalidateAssistantSources(ctx, result.sources, [1], 'reader'))).toBe(false);
  });

  test('summary scan caps are explicitly incomplete and narrower date ranges use indexed bounds', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 101; i++) {
        const id = await ctx.db.insert('facturacionFacturas', {
          empresa: 1,
          numeroFactura: `F-${i}`,
          tipoDocumento: '01',
          documentoClase: 'factura',
          proveedorNit: '900123456',
          proveedorNombre: 'Visible',
          fechaEmision: i === 0 ? '2026-08-10' : '2026-09-10',
          subtotal: 100,
          impuestos: 19,
          total: 119,
          moneda: 'COP',
          descripcion: '',
          origen: 'carga_manual',
          creadoEn: now,
          actualizadoEn: now,
        });
        await refrescarProyeccionFactura(ctx, id, now);
      }
    });
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['billing/invoices'] });
    const args = {
      domain: 'billing' as const,
      operation: 'summary' as const,
      companyIds: [1],
      expectedActingUserId: 'reader',
    };
    const incomplete = await user.query(internal.assistant.tools.readAssistantData, args);
    expect(incomplete.metadata.complete).toBe(false);
    expect(incomplete.summary?.registros).toBe(100);
    expect(incomplete.metadata.notes.join(' ')).toContain('subtotales');
    const narrowed = await user.query(internal.assistant.tools.readAssistantData, {
      ...args,
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(narrowed.metadata.complete).toBe(true);
    expect(narrowed.summary?.registros).toBe(1);
    await expect(
      user.query(internal.assistant.tools.readAssistantData, { ...args, from: '2026-02-30' }),
    ).rejects.toThrow();
  });

  test('workflow guidance is repository grounded and separately permission guarded', async () => {
    const t = convexTest(schema, modules);
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['customers/onboarding'] });
    const args = {
      domain: 'customers' as const,
      operation: 'workflow' as const,
      companyIds: [1],
      expectedActingUserId: 'reader',
    };
    const result = await user.query(internal.assistant.tools.readAssistantData, args);
    expect(result.guide?.sourcePaths).toContain('docs/customers.md');
    expect(result.guide?.steps.join(' ')).toContain('no incluye Compras');
    expect(result.records).toEqual([]);
    await expect(
      user.query(internal.assistant.tools.readAssistantData, { ...args, domain: 'suppliers' }),
    ).rejects.toThrow('módulo');
  });

  test('ERP evidence and impersonated histories recheck permission and acting identity', async () => {
    const t = convexTest(schema, modules);
    const user = await actor(t, { id: 'reader', empresas: [1], permisos: ['customers/onboarding'] });
    const sources = [
      {
        domain: 'customers' as const,
        kind: 'erp' as const,
        companyId: 1,
        permission: 'customers/onboarding',
        erpMode: 'document' as const,
      },
    ];
    expect(await user.run((ctx) => revalidateAssistantSources(ctx, sources, [1], 'reader'))).toBe(true);
    expect(await user.run((ctx) => revalidateAssistantSources(ctx, sources, [1], 'impersonated'))).toBe(false);
    expect(
      await user.run((ctx) =>
        revalidateAssistantSources(ctx, [{ ...sources[0], permission: 'customers/catalog' }], [1], 'reader'),
      ),
    ).toBe(false);
  });
});
