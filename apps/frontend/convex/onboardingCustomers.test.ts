/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { asUser, type ActingClient } from "../test-utils/onboardingActors";

const modules = import.meta.glob("./**/*.*s");

type T = ReturnType<typeof convexTest>;

async function flush(t: T) {
  await new Promise((resolve) => setTimeout(resolve, 25));
  await t.finishInProgressScheduledFunctions();
}

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, sent: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type PostedBody = { kind: string; token?: string; tipo?: string; destinatarios?: Array<{ email: string }> };

function postedBodies(fetchMock: ReturnType<typeof stubFetch>): PostedBody[] {
  return fetchMock.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)) as PostedBody);
}

function trackedTokens(fetchMock: ReturnType<typeof stubFetch>): string[] {
  return postedBodies(fetchMock)
    .filter((b) => b.kind === "tracked" && typeof b.token === "string")
    .map((b) => b.token as string);
}

async function storeBlob(t: T): Promise<Id<"_storage">> {
  return (await t.run(async (ctx) => ctx.storage.store(new Blob(["%PDF-1.4 demo"], { type: "application/pdf" })))) as Id<"_storage">;
}

const PERMISO = "customers/onboarding";

async function seedRoles(t: T) {
  const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });
  for (const [rol, userId] of [
    ["CUMPLIMIENTO_LOW_RISK", "cumpl"],
    ["CUMPLIMIENTO_MEDIUM_RISK", "cumpl-med"],
    ["CUMPLIMIENTO_HIGH_RISK", "cumpl-high"],
    ["CONTABILIDAD", "conta"],
    ["FINANCIERO", "fin"],
  ] as const) {
    await admin.mutation(api.onboarding.roles.configurarRol, {
      modulo: "customer",
      empresa: 1,
      rol,
      userId,
      nombre: userId,
      email: `${userId}@x.test`,
    });
  }
  const users: Record<string, ActingClient> = { admin };
  for (const id of ["resp", "cumpl", "cumpl-med", "cumpl-high", "conta", "fin", "lector"]) {
    users[id] = await asUser(t, { id, permisos: [PERMISO], empresas: [1] });
  }
  return users;
}

const MATRIZ = {
  empresa: 1,
  tipoPersona: "PERSONA_JURIDICA" as const,
  tipoDocumento: "NIT" as const,
  numeroDocumento: "800.555.111",
  razonSocial: "Cliente Demo S.A.S.",
  direccion: "Carrera 1 # 2-3",
  ciudad: "Tunja",
  departamento: "Boyacá",
  celular: "3100000000",
  email: "Contacto@cliente.test",
  representanteLegalNombre: "Marta RL",
  representanteLegalTipoDocumento: "C.C." as const,
  representanteLegalNumeroDocumento: "52000000",
  representanteLegalEmail: "Marta@cliente.test",
  representanteLegalNacionalidad: "Colombiana",
  servicioSuministrado: "Venta de agregados",
  montoAnual: "Ventas Comerciales Menor a 10 millones",
  sectorEconomico: "Privados: Otros",
  jurisdiccionNacional: "Boyacá",
  jurisdiccionInternacional: "",
  isPep: false,
  listas: "NO",
  codigoCiiu: "4290",
  actividadEconomica: "Construcción",
  formaPago: "Crédito" as const,
  plazo: "30 días" as const,
};

const IDENTIDAD = { tipoDocumento: "NIT" as const, numeroDocumento: "800555111" };

describe("flujo de inscripción de clientes", () => {
  beforeEach(() => {
    vi.stubEnv("FRONTEND_URL", "https://app.test");
    vi.stubEnv("NOTIFICATIONS_INTERNAL_KEY", "notif-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("de la matriz de riesgo al proceso completado, con devolución y anulación", async () => {
    const fetchMock = stubFetch();
    const t = convexTest(schema, modules);
    const u = await seedRoles(t);
    const rutStorageId = await storeBlob(t);

    // ── Inicio comercial ─────────────────────────────────────────────────
    await expect(u.resp.mutation(api.onboarding.customers.crearMatrizRiesgo, { ...MATRIZ, formaPago: "Anticipado", rutStorageId })).rejects.toThrow(/NA/);
    await expect(u.lector.mutation(api.onboarding.customers.crearMatrizRiesgo, { ...MATRIZ, empresa: 2, rutStorageId })).rejects.toThrow(/Empresa/);
    const inscripcionId = await u.resp.mutation(api.onboarding.customers.crearMatrizRiesgo, { ...MATRIZ, rutStorageId });
    let ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("II_PENDIENTE_FORMULARIO");
    expect(ins?.matriz_00.riesgo).toBe("BAJO");
    expect(ins?.tipoEvaluacion).toBe("SOLO LISTAS");
    expect(ins?.NIT).toBe("800555111");
    expect(ins?.datos_generales_01.email).toBe("contacto@cliente.test");
    expect(ins?.datos_generales_01.representanteLegalEmail).toBe("marta@cliente.test");
    expect(ins?.condicionesPago_12).toEqual({ formaPago: "Crédito", plazo: "30 días" });
    expect(ins?.actividadEconomica_02?.codigoCiiu).toBe("4290");
    expect(ins?.documentos_09?.rutUltimoAnio).toBe(rutStorageId);
    expect(ins?.correoResumen?.form?.estado).toBe("PENDIENTE");

    const fasesInicio = await u.resp.query(api.onboarding.customers.obtenerFasesDeInscripcion, { inscripcionId });
    expect(fasesInicio.map((f) => [f.fase, f.estado])).toEqual([
      ["I_ANALISIS_RIESGO", "COMPLETADO"],
      ["II_PENDIENTE_FORMULARIO", "PENDIENTE"],
    ]);
    expect(fasesInicio[0].payload).toMatchObject({ kind: "faseI", automatico: true, formaPago: "Crédito", plazo: "30 días" });

    const tablero = await u.resp.query(api.onboarding.customers.obtenerInscripcionesConUltimaFase, { empresa: 1 });
    expect(tablero.access.nivel).toBe("responsable");
    expect(tablero.inscripciones).toHaveLength(1);
    expect((await u.lector.query(api.onboarding.customers.obtenerInscripcionesConUltimaFase, { empresa: 1 })).inscripciones).toHaveLength(0);
    expect((await u.conta.query(api.onboarding.customers.obtenerInscripcionesConUltimaFase, { empresa: 1 })).access.nivel).toBe("full");

    await flush(t);
    const [formToken] = trackedTokens(fetchMock);
    expect(formToken).toBeDefined();

    // ── Formulario público (Fase II) ─────────────────────────────────────
    const publico = await t.query(api.onboarding.customersPublic.obtenerInscripcionPublica, { inscripcionId, token: formToken });
    expect(publico).not.toBeNull();
    expect(publico!.faseActual).toBe("II_PENDIENTE_FORMULARIO");
    expect(publico!.acceso.scope).toBe("FORM");
    expect(publico!.documentos.rutUltimoAnio).toBe(rutStorageId);
    expect(publico!.condicionesPago_12?.formaPago).toBe("Crédito");
    expect("matriz_00" in publico!).toBe(false);
    await expect(t.query(api.onboarding.customersPublic.obtenerInscripcionPublica, { inscripcionId, token: "nope" })).resolves.toBeNull();

    await expect(
      t.mutation(api.onboarding.customersPublic.actualizarInscripcion, {
        inscripcionId,
        token: formToken,
        tipoDocumento: "NIT",
        numeroDocumento: "1",
        adicionales_13: { aniosExperiencia: 3 },
      }),
    ).rejects.toThrow(/no coincide/);

    await t.mutation(api.onboarding.customersPublic.actualizarInscripcion, {
      inscripcionId,
      token: formToken,
      ...IDENTIDAD,
      datos_generales_01: { contactoNombre: "Pepe Contacto", contactoEmail: "Pepe@cliente.test" },
      infoTributaria_04: {
        impuestoRenta: { contribuyente: true, granContribuyente: true, resolucion: "" },
        impuestoIndustriaYComercio: { responsableImpuesto: true, municipios: ["Tunja (Boyacá)"] },
      },
      radicacionFactura_07: { direccion: "Carrera 1", correoFacturacion: "fact@cliente.test", fechaMaximaRadicacion: 25 },
      datosCuentasPagos_08: [{ tipoCuenta: "Ahorros", entidad: "Banco", numeroCuenta: "123", titular: "Cliente Demo" }],
      adicionales_13: { aniosExperiencia: 3 },
    });
    // Gran contribuyente sin resolución → no se puede enviar.
    await expect(t.mutation(api.onboarding.customersPublic.enviarFormulario, { inscripcionId, token: formToken, ...IDENTIDAD })).rejects.toThrow(/resolución/);
    await t.mutation(api.onboarding.customersPublic.actualizarInscripcion, {
      inscripcionId,
      token: formToken,
      ...IDENTIDAD,
      infoTributaria_04: { impuestoRenta: { resolucion: "RES-1" }, impuestoVentas: { tarifaRetencionIva: "15%" } },
    });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    // La fusión conserva los sub-bloques no enviados.
    expect(ins?.infoTributaria_04?.impuestoRenta).toMatchObject({ contribuyente: true, granContribuyente: true, resolucion: "RES-1" });
    expect(ins?.infoTributaria_04?.impuestoIndustriaYComercio?.municipios).toEqual(["Tunja (Boyacá)"]);
    expect(ins?.datos_generales_01.contactoEmail).toBe("pepe@cliente.test");

    await t.mutation(api.onboarding.customersPublic.enviarFormulario, { inscripcionId, token: formToken, ...IDENTIDAD });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("IIA_PENDIENTE_FIRMA");
    await expect(
      t.mutation(api.onboarding.customersPublic.actualizarInscripcion, { inscripcionId, token: formToken, ...IDENTIDAD, adicionales_13: { aniosExperiencia: 4 } }),
    ).rejects.toThrow(/ya fue enviado/);
    await flush(t);
    const tokens = trackedTokens(fetchMock);
    const signToken = tokens[tokens.length - 1];
    expect(signToken).not.toBe(formToken);
    expect(ins?.correoResumen?.sign?.email).toBe("marta@cliente.test");

    // ── Firma (IIA → III, un solo carril de Cumplimiento) ───────────────
    await expect(
      t.mutation(api.onboarding.customersPublic.firmarFormularioRepresentante, { inscripcionId, token: formToken, ...IDENTIDAD, firmaDataUrl: `data:image/png;base64,${"A".repeat(200)}` }),
    ).rejects.toThrow(/enlace/i);
    await t.mutation(api.onboarding.customersPublic.firmarFormularioRepresentante, { inscripcionId, token: signToken, ...IDENTIDAD, firmaDataUrl: `data:image/png;base64,${"A".repeat(200)}` });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("III_REVISION_DOCUMENTAL");
    expect(ins?.firmadoEn).toBeDefined();
    await expect(
      t.mutation(api.onboarding.customersPublic.firmarFormularioRepresentante, { inscripcionId, token: signToken, ...IDENTIDAD, firmaDataUrl: `data:image/png;base64,${"A".repeat(200)}` }),
    ).rejects.toThrow(/enlace/i);

    const docs = await u.cumpl.query(api.onboarding.customers.obtenerRevisionDocumentos, { inscripcionId });
    expect(docs.length).toBe(publico!.documentosRequeridos.length);
    expect(docs.every((d) => d.revisorRol === "CUMPLIMIENTO_LOW_RISK")).toBe(true);
    expect(docs.find((d) => d.docKey === "rutUltimoAnio")?.estado).toBe("EN_REVISION");
    expect(docs.filter((d) => d.docKey !== "rutUltimoAnio").every((d) => d.estado === "PENDIENTE")).toBe(true);
    const fasesIII = await u.cumpl.query(api.onboarding.customers.obtenerFasesDeInscripcion, { inscripcionId });
    expect(fasesIII.find((f) => f.fase === "III_REVISION_DOCUMENTAL")?.asignadoA).toBe("cumpl");
    expect((await u.cumpl.query(api.onboarding.customers.obtenerMisTareas, {})).map((x) => x.fase)).toEqual(["III_REVISION_DOCUMENTAL"]);
    expect(await u["cumpl-med"].query(api.onboarding.customers.obtenerMisTareas, {})).toHaveLength(0);

    // El cliente carga los documentos pendientes con el enlace del formulario (sigue vigente en Fase III).
    for (const d of docs) {
      if (d.estado === "PENDIENTE") {
        await t.mutation(api.onboarding.customersPublic.cargarDocumentoRevision, { inscripcionId, token: formToken, ...IDENTIDAD, docKey: d.docKey, storageId: await storeBlob(t) });
      }
    }
    await expect(
      t.mutation(api.onboarding.customersPublic.cargarDocumentoRevision, { inscripcionId, token: formToken, ...IDENTIDAD, docKey: "inventado", storageId: await storeBlob(t) }),
    ).rejects.toThrow(/no requerido/);

    // ── Revisión documental ──────────────────────────────────────────────
    await expect(u.conta.mutation(api.onboarding.customers.revisarDocumento, { inscripcionId, docKey: "rutUltimoAnio", decision: "APROBADO" })).rejects.toThrow(/asignada/);
    await expect(u.cumpl.mutation(api.onboarding.customers.revisarDocumento, { inscripcionId, docKey: "rutUltimoAnio", decision: "RECHAZADO" })).rejects.toThrow(/motivo/);
    await u.cumpl.mutation(api.onboarding.customers.revisarDocumento, { inscripcionId, docKey: "rutUltimoAnio", decision: "RECHAZADO", observaciones: "Vencido" });
    // El responsable reemplaza el documento rechazado en nombre del cliente.
    await expect(u.lector.mutation(api.onboarding.customers.cargarDocumentoRevisionInterno, { inscripcionId, docKey: "rutUltimoAnio", storageId: await storeBlob(t) })).rejects.toThrow(/responsable/);
    await u.resp.mutation(api.onboarding.customers.cargarDocumentoRevisionInterno, { inscripcionId, docKey: "rutUltimoAnio", storageId: await storeBlob(t) });
    expect((await u.cumpl.query(api.onboarding.customers.obtenerRevisionDocumentos, { inscripcionId })).find((d) => d.docKey === "rutUltimoAnio")?.estado).toBe("EN_REVISION");
    let ultimo: { faseActual: string; faseIIIAAbierta: boolean } | undefined;
    for (const d of docs) {
      ultimo = await u.cumpl.mutation(api.onboarding.customers.revisarDocumento, { inscripcionId, docKey: d.docKey, decision: "APROBADO" });
    }
    expect(ultimo).toEqual({ faseActual: "IIIA_APROBACION_CUMPLIMIENTO", faseIIIAAbierta: true });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("IIIA_APROBACION_CUMPLIMIENTO");
    const fasesIIIA = await u.cumpl.query(api.onboarding.customers.obtenerFasesDeInscripcion, { inscripcionId });
    expect(fasesIIIA.find((f) => f.fase === "III_REVISION_DOCUMENTAL")?.estado).toBe("COMPLETADO");
    expect(fasesIIIA.find((f) => f.fase === "IIIA_APROBACION_CUMPLIMIENTO")?.asignadoA).toBe("cumpl");
    await flush(t);
    const avisos = postedBodies(fetchMock).filter((b) => b.kind === "untracked");
    expect(avisos.map((b) => b.tipo)).toEqual(["DOC_RECHAZADO", "APROBACION_CUMPLIMIENTO_ASIGNADA"]);
    expect(avisos[1].destinatarios?.[0].email).toBe("cumpl@x.test");

    // ── Fase IIIA (aprobación por nivel de riesgo) ───────────────────────
    await expect(u["cumpl-high"].mutation(api.onboarding.customers.completarFaseIIIA, { inscripcionId, decision: "APROBADO" })).rejects.toThrow(/asignada/);
    await u.cumpl.mutation(api.onboarding.customers.completarFaseIIIA, { inscripcionId, decision: "APROBADO", observaciones: "OK" });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("IV_CREACION_CONTABILIDAD");
    expect((await u.conta.query(api.onboarding.customers.obtenerMisTareas, {})).map((x) => x.fase)).toEqual(["IV_CREACION_CONTABILIDAD"]);

    // ── Fase IV (Contabilidad) ───────────────────────────────────────────
    await expect(u.cumpl.mutation(api.onboarding.customers.completarFaseIV, { inscripcionId })).rejects.toThrow(/asignada/);
    await u.conta.mutation(api.onboarding.customers.completarFaseIV, { inscripcionId, notasContabilidad: "Creado con código CL-0001" });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("COMPLETADO");
    expect(ins?.notasContabilidadFaseIV).toContain("CL-0001");

    const reporte = await u.admin.query(api.onboarding.customers.obtenerReporteProcesos, { empresa: 1 });
    expect(reporte).toHaveLength(1);
    expect(reporte[0].estadoFinal).toBe("COMPLETADO");
    expect(reporte[0].fases.map((f) => f.fase)).toEqual([
      "I_ANALISIS_RIESGO",
      "II_PENDIENTE_FORMULARIO",
      "IIA_PENDIENTE_FIRMA",
      "III_REVISION_DOCUMENTAL",
      "IIIA_APROBACION_CUMPLIMIENTO",
      "IV_CREACION_CONTABILIDAD",
    ]);
    await expect(u.resp.query(api.onboarding.customers.obtenerReporteProcesos, { empresa: 1 })).rejects.toThrow(/reportes/);

    // ── Devolución a Fase IIIA ───────────────────────────────────────────
    const faseIIIARow = fasesIIIA.find((f) => f.fase === "IIIA_APROBACION_CUMPLIMIENTO")!;
    await expect(u.lector.mutation(api.onboarding.customers.devolverFase, { faseId: faseIIIARow._id, motivo: "x" })).rejects.toThrow(/No autorizado/);
    const devuelta = await u.admin.mutation(api.onboarding.customers.devolverFase, { faseId: faseIIIARow._id, motivo: "Revisar aprobación" });
    expect(devuelta.faseDestino).toBe("IIIA_APROBACION_CUMPLIMIENTO");
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("IIIA_APROBACION_CUMPLIMIENTO");
    expect(ins?.notasContabilidadFaseIV).toBeUndefined();
    expect(ins?.firmadoEn).toBeDefined();
    expect(ins?.devolucionesFase?.[0]).toMatchObject({ faseOrigen: "COMPLETADO", faseDestino: "IIIA_APROBACION_CUMPLIMIENTO" });
    const fasesTrasDevolver = await u.admin.query(api.onboarding.customers.obtenerFasesDeInscripcion, { inscripcionId });
    expect(fasesTrasDevolver.some((f) => f.fase === "IV_CREACION_CONTABILIDAD")).toBe(false);
    expect(fasesTrasDevolver.find((f) => f.fase === "IIIA_APROBACION_CUMPLIMIENTO")?.estado).toBe("EN_PROGRESO");
    await flush(t);
    expect(postedBodies(fetchMock).filter((b) => b.tipo === "APROBACION_CUMPLIMIENTO_ASIGNADA")).toHaveLength(2);

    // ── Anulación ────────────────────────────────────────────────────────
    await u.admin.mutation(api.onboarding.customers.anularProceso, { inscripcionId, motivo: "Duplicado" });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("ANULADA");
    expect((await u.admin.query(api.onboarding.customers.obtenerFasesDeInscripcion, { inscripcionId })).find((f) => f.fase === "IIIA_APROBACION_CUMPLIMIENTO")?.estado).toBe("ANULADA");
    await expect(t.query(api.onboarding.customersPublic.obtenerInscripcionPublica, { inscripcionId, token: formToken })).resolves.toBeNull();
  }, 30_000);

  test("ajuste de riesgo en Fase III y rechazo de Cumplimiento en Fase IIIA", async () => {
    const fetchMock = stubFetch();
    const t = convexTest(schema, modules);
    const u = await seedRoles(t);
    const inscripcionId = await u.resp.mutation(api.onboarding.customers.crearMatrizRiesgo, { ...MATRIZ, rutStorageId: await storeBlob(t) });
    await flush(t);
    const [formToken] = trackedTokens(fetchMock);
    await t.mutation(api.onboarding.customersPublic.enviarFormulario, { inscripcionId, token: formToken, ...IDENTIDAD });
    await flush(t);
    const tokens = trackedTokens(fetchMock);
    await t.mutation(api.onboarding.customersPublic.firmarFormularioRepresentante, { inscripcionId, token: tokens[tokens.length - 1], ...IDENTIDAD, firmaDataUrl: `data:image/png;base64,${"A".repeat(200)}` });

    const docsAntes = await u.cumpl.query(api.onboarding.customers.obtenerRevisionDocumentos, { inscripcionId });
    await expect(
      u.conta.mutation(api.onboarding.customers.ajustarRiesgoCumplimientoDocumental, { inscripcionId, isPep: true, listas: "NO", observacion: "x" }),
    ).rejects.toThrow(/Cumplimiento/);
    const ajuste = await u.cumpl.mutation(api.onboarding.customers.ajustarRiesgoCumplimientoDocumental, { inscripcionId, isPep: true, listas: "NO", observacion: "PEP confirmado" });
    expect(ajuste.riesgoAnterior).toBe("BAJO");
    expect(ajuste.riesgoNuevo).toBe("SUPERIOR");
    expect(ajuste.tipoEvaluacionNuevo).toBe("INTENSIFICADA");
    expect(ajuste.docsAgregados.length).toBeGreaterThan(0);
    const docsDespues = await u.cumpl.query(api.onboarding.customers.obtenerRevisionDocumentos, { inscripcionId });
    expect(docsDespues.length).toBe(docsAntes.length + ajuste.docsAgregados.length);
    await expect(
      u.cumpl.mutation(api.onboarding.customers.ajustarRiesgoCumplimientoDocumental, { inscripcionId, isPep: false, listas: "NO", observacion: "Bajar" }),
    ).rejects.toThrow(/aumenta/);
    let ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.ajustesRiesgoCumplimiento).toHaveLength(1);

    // Cargar y aprobar todo → Fase IIIA asignada al nivel HIGH.
    for (const d of docsDespues) {
      if (d.estado === "PENDIENTE") {
        await t.mutation(api.onboarding.customersPublic.cargarDocumentoRevision, { inscripcionId, token: formToken, ...IDENTIDAD, docKey: d.docKey, storageId: await storeBlob(t) });
      }
    }
    for (const d of docsDespues) {
      await u.cumpl.mutation(api.onboarding.customers.revisarDocumento, { inscripcionId, docKey: d.docKey, decision: "APROBADO" });
    }
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("IIIA_APROBACION_CUMPLIMIENTO");
    const fases = await u.cumpl.query(api.onboarding.customers.obtenerFasesDeInscripcion, { inscripcionId });
    expect(fases.find((f) => f.fase === "IIIA_APROBACION_CUMPLIMIENTO")?.asignadoA).toBe("cumpl-high");
    expect((await u["cumpl-high"].query(api.onboarding.customers.obtenerMisTareas, {})).map((x) => x.fase)).toEqual(["IIIA_APROBACION_CUMPLIMIENTO"]);
    expect(await u.cumpl.query(api.onboarding.customers.obtenerMisTareas, {})).toHaveLength(0);

    // Rechazo con motivo para el cliente y motivo interno.
    await expect(u.cumpl.mutation(api.onboarding.customers.rechazarCumplimiento, { inscripcionId, motivoCliente: "a", motivoInterno: "b" })).rejects.toThrow(/asignada/);
    await u["cumpl-high"].mutation(api.onboarding.customers.rechazarCumplimiento, { inscripcionId, motivoCliente: "No cumple requisitos", motivoInterno: "Alertas en listas" });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("RECHAZADO");
    expect(ins?.rechazadoCumplimiento).toMatchObject({ motivoExterno: "No cumple requisitos", motivoInterno: "Alertas en listas", rechazadoPorUserId: "cumpl-high" });
    // El cliente ve solo el motivo externo.
    const publico = await t.query(api.onboarding.customersPublic.obtenerInscripcionPublica, { inscripcionId, token: formToken });
    expect(publico?.faseActual).toBe("RECHAZADO");
    expect(publico?.motivoRechazo).toBe("No cumple requisitos");
    expect(JSON.stringify(publico)).not.toContain("Alertas en listas");

    const reporte = await u.admin.query(api.onboarding.customers.obtenerReporteProcesos, { empresa: 1 });
    expect(reporte[0].estadoFinal).toBe("RECHAZADO");
    expect(reporte[0].fases.find((f) => f.fase === "IIIA_APROBACION_CUMPLIMIENTO")?.estado).toBe("RECHAZADO");

    // Devolver a Fase III limpia el rechazo y reabre las revisiones.
    const faseIII = fases.find((f) => f.fase === "III_REVISION_DOCUMENTAL")!;
    await u.admin.mutation(api.onboarding.customers.devolverFase, { faseId: faseIII._id, motivo: "Nueva evidencia" });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("III_REVISION_DOCUMENTAL");
    expect(ins?.rechazadoCumplimiento).toBeUndefined();
    const docsReabiertos = await u.cumpl.query(api.onboarding.customers.obtenerRevisionDocumentos, { inscripcionId });
    expect(docsReabiertos.every((d) => d.estado === "EN_REVISION" && !d.revisadoPor)).toBe(true);
  }, 30_000);

  test("devolución a Fase II reenvía el enlace del formulario con token nuevo", async () => {
    const fetchMock = stubFetch();
    const t = convexTest(schema, modules);
    const u = await seedRoles(t);
    const inscripcionId = await u.resp.mutation(api.onboarding.customers.crearMatrizRiesgo, { ...MATRIZ, rutStorageId: await storeBlob(t) });
    await flush(t);
    const [formToken] = trackedTokens(fetchMock);
    await t.mutation(api.onboarding.customersPublic.enviarFormulario, { inscripcionId, token: formToken, ...IDENTIDAD });
    const fases = await u.resp.query(api.onboarding.customers.obtenerFasesDeInscripcion, { inscripcionId });
    const faseII = fases.find((f) => f.fase === "II_PENDIENTE_FORMULARIO")!;
    // El responsable puede devolver su propia inscripción.
    await u.resp.mutation(api.onboarding.customers.devolverFase, { faseId: faseII._id, motivo: "Corregir datos" });
    const ins = await t.run(async (ctx) => ctx.db.get("onboardingClientes", inscripcionId));
    expect(ins?.faseActual).toBe("II_PENDIENTE_FORMULARIO");
    expect(ins?.correoResumen?.form?.numeroIntento).toBe(2);
    await flush(t);
    const tokens = trackedTokens(fetchMock);
    const nuevoToken = tokens[tokens.length - 1];
    expect(nuevoToken).not.toBe(formToken);
    await expect(t.query(api.onboarding.customersPublic.obtenerInscripcionPublica, { inscripcionId, token: formToken })).resolves.toBeNull();
    const publico = await t.query(api.onboarding.customersPublic.obtenerInscripcionPublica, { inscripcionId, token: nuevoToken });
    expect(publico?.faseActual).toBe("II_PENDIENTE_FORMULARIO");
    expect((await u.resp.query(api.onboarding.customers.obtenerFasesDeInscripcion, { inscripcionId })).map((f) => f.fase)).toEqual(["I_ANALISIS_RIESGO", "II_PENDIENTE_FORMULARIO"]);
  }, 30_000);
});
