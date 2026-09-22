/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { asUser, type ActingClient } from "../test-utils/onboardingActors";

const modules = import.meta.glob("./**/*.*s");

type T = ReturnType<typeof convexTest>;

/** `runAfter(0)` jobs start on a real macrotask; yield once before waiting for them. */
async function flush(t: T) {
  await new Promise((resolve) => setTimeout(resolve, 25));
  await t.finishInProgressScheduledFunctions();
}

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, sent: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function trackedTokens(fetchMock: ReturnType<typeof stubFetch>): string[] {
  return fetchMock.mock.calls
    .map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)) as { kind: string; token?: string })
    .filter((b) => b.kind === "tracked" && typeof b.token === "string")
    .map((b) => b.token as string);
}

async function storeBlob(t: T): Promise<Id<"_storage">> {
  return (await t.run(async (ctx) => ctx.storage.store(new Blob(["%PDF-1.4 demo"], { type: "application/pdf" })))) as Id<"_storage">;
}

const PERMISO = "suppliers/onboarding";

async function seedRoles(t: T) {
  const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });
  for (const [rol, userId] of [
    ["CUMPLIMIENTO_LOW_RISK", "cumpl"],
    ["CUMPLIMIENTO_MEDIUM_RISK", "cumpl-med"],
    ["CUMPLIMIENTO_HIGH_RISK", "cumpl-high"],
    ["COMPRAS", "compras"],
    ["CONTABILIDAD", "conta"],
    ["FINANCIERO", "fin"],
  ] as const) {
    await admin.mutation(api.onboarding.roles.configurarRol, {
      modulo: "supplier",
      empresa: 1,
      rol,
      userId,
      nombre: userId,
      email: `${userId}@x.test`,
    });
  }
  const users: Record<string, ActingClient> = { admin };
  for (const id of ["resp", "cumpl", "cumpl-med", "cumpl-high", "compras", "conta", "fin", "lector"]) {
    users[id] = await asUser(t, { id, permisos: [PERMISO], empresas: [1] });
  }
  return users;
}

const MATRIZ = {
  empresa: 1,
  tipoPersona: "PERSONA_JURIDICA" as const,
  tipoDocumento: "NIT" as const,
  numeroDocumento: "900.123.456",
  razonSocial: "Proveedor Demo S.A.S.",
  contactoNombre: "Ana Contacto",
  contactoEmail: "Ana@demo.test",
  contactoCelular: "3000000000",
  servicioSuministrado: "Insumos",
  montoAnual: "Menor a 10 millones COP",
  codigoCiiu: "4711",
  actividadEconomicaPrincipal: "Comercio",
  codigoCiiuSecundario: "",
  actividadEconomicaSecundaria: "",
  sectorEconomico: "Proveedores materias primas e insumos",
  jurisdiccionNacional: "Boyacá",
  jurisdiccionInternacional: "",
  isPep: false,
  listas: "NO",
  representanteLegalNombre: "Luis RL",
  representanteLegalEmail: "luis@demo.test",
};

const INFO_TRIBUTARIA = {
  origenFondos: "Actividad comercial",
  tarifaReteFuente: 2.5,
  impuestoRenta: {
    contribuyente: true,
    calidadContribuyente: "ORDINARIO" as const,
    regimenOrdinario: true,
    granContribuyente: false,
    autorretenedorRenta: false,
    resolucion: "",
    resolucionAutorretenedor: "",
  },
  impuestoVentas: { responsableIva: true, retencionIva: false },
  impuestoIndustriaYComercio: { responsableImpuesto: true, municipiosIcaResponsable: ["Tunja (Boyacá)"] },
  sujetoReteIca: { es: false, municipios: [] },
  autorretenedorIca: { es: false, municipios: [] },
};

describe("flujo de inscripción de proveedores", () => {
  beforeEach(() => {
    vi.stubEnv("FRONTEND_URL", "https://app.test");
    vi.stubEnv("NOTIFICATIONS_INTERNAL_KEY", "notif-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("de la matriz de riesgo al proceso completado, con devolución final", async () => {
    const fetchMock = stubFetch();
    const t = convexTest(schema, modules);
    const u = await seedRoles(t);
    const rutStorageId = await storeBlob(t);

    // ── Inicio (responsable con permiso de ruta) ──────────────────────────
    await expect(
      u.lector.mutation(api.onboarding.suppliers.crearMatrizRiesgo, { ...MATRIZ, empresa: 2, rutStorageId }),
    ).rejects.toThrow(/Empresa/);
    const inscripcionId = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, { ...MATRIZ, rutStorageId });
    let ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("II_PENDIENTE_FORMULARIO");
    expect(ins?.matriz_00.riesgo).toBe("BAJO");
    expect(ins?.tipoEvaluacion_14).toBe("SOLO LISTAS");
    expect(ins?.matriz_00.responsableId).toBe("resp");
    expect(ins?.datos_generales_01.contactoEmail).toBe("ana@demo.test");
    expect(ins?.correoResumen?.form?.estado).toBe("PENDIENTE");

    const tablero = await u.resp.query(api.onboarding.suppliers.obtenerInscripcionesConUltimaFase, { empresa: 1 });
    expect(tablero.access.nivel).toBe("responsable");
    expect(tablero.inscripciones).toHaveLength(1);
    const tableroLector = await u.lector.query(api.onboarding.suppliers.obtenerInscripcionesConUltimaFase, { empresa: 1 });
    expect(tableroLector.inscripciones).toHaveLength(0);
    const tableroCumpl = await u.cumpl.query(api.onboarding.suppliers.obtenerInscripcionesConUltimaFase, { empresa: 1 });
    expect(tableroCumpl.access.nivel).toBe("full");
    expect(tableroCumpl.inscripciones).toHaveLength(1);

    await flush(t);
    const [formToken] = trackedTokens(fetchMock);
    expect(formToken).toBeDefined();

    // ── Formulario público (Fase II) ─────────────────────────────────────
    const publico = await t.query(api.onboarding.suppliersPublic.obtenerInscripcionPublica, { inscripcionId, token: formToken });
    expect(publico.faseActual).toBe("II_PENDIENTE_FORMULARIO");
    expect(publico.documentosRequeridos.map((d) => d.docKey)).toContain("rutUltimoAnio");
    expect(publico.documentos.rutUltimoAnio).toBe(rutStorageId);
    expect("matriz_00" in publico).toBe(false);

    await expect(
      t.mutation(api.onboarding.suppliersPublic.actualizarInscripcion, {
        inscripcionId,
        token: formToken,
        tipoDocumento: "NIT",
        numeroDocumento: "1",
        adicionales_13: { aniosExperiencia: 3, certificaciones: [], serviciosXGarantias: "Garantía 1 año" },
      }),
    ).rejects.toThrow(/no coincide/);

    await t.mutation(api.onboarding.suppliersPublic.actualizarInscripcion, {
      inscripcionId,
      token: formToken,
      tipoDocumento: "NIT",
      numeroDocumento: "900123456",
      datos_generales_01: { direccion: "Calle 1", ciudad: "Tunja", departamento: "Boyacá" },
      infoTributaria_04: INFO_TRIBUTARIA,
      condicionesPago_12: { formaPago: "Crédito", plazo: "30 días" },
      adicionales_13: { aniosExperiencia: 3, certificaciones: [], serviciosXGarantias: "Garantía 1 año" },
    });

    await expect(
      t.mutation(api.onboarding.suppliersPublic.enviarFormulario, {
        inscripcionId,
        token: formToken,
        tipoDocumento: "NIT",
        numeroDocumento: "900123456",
      }),
    ).rejects.toThrow(/Faltan documentos/);

    const documentos: Record<string, Id<"_storage">> = {};
    for (const req of publico.documentosRequeridos) {
      if (req.docKey === "rutUltimoAnio") continue;
      documentos[req.docKey] = await storeBlob(t);
    }
    await t.mutation(api.onboarding.suppliersPublic.actualizarInscripcion, {
      inscripcionId,
      token: formToken,
      tipoDocumento: "NIT",
      numeroDocumento: "900123456",
      documentos_15: documentos,
    });
    await t.mutation(api.onboarding.suppliersPublic.enviarFormulario, {
      inscripcionId,
      token: formToken,
      tipoDocumento: "NIT",
      numeroDocumento: "900123456",
    });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("IIA_PENDIENTE_FIRMA");
    await flush(t);
    const tokens = trackedTokens(fetchMock);
    const signToken = tokens[tokens.length - 1];
    expect(signToken).not.toBe(formToken);

    // ── Firma del representante legal (IIA → III) ────────────────────────
    await expect(
      t.mutation(api.onboarding.suppliersPublic.firmarFormularioRepresentante, {
        inscripcionId,
        token: formToken,
        firmaDataUrl: `data:image/png;base64,${"A".repeat(200)}`,
      }),
    ).rejects.toThrow(/enlace/i);
    await t.mutation(api.onboarding.suppliersPublic.firmarFormularioRepresentante, {
      inscripcionId,
      token: signToken,
      firmaDataUrl: `data:image/png;base64,${"A".repeat(200)}`,
    });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("III_REVISION_DOCUMENTAL");
    expect(ins?.firmadoEn).toBeDefined();
    await expect(
      t.mutation(api.onboarding.suppliersPublic.firmarFormularioRepresentante, {
        inscripcionId,
        token: signToken,
        firmaDataUrl: `data:image/png;base64,${"A".repeat(200)}`,
      }),
    ).rejects.toThrow(/enlace/i);

    const docs = await u.cumpl.query(api.onboarding.suppliers.obtenerRevisionDocumentos, { inscripcionId });
    expect(docs.length).toBe(publico.documentosRequeridos.length);
    expect(docs.every((d) => d.estado === "EN_REVISION")).toBe(true);
    const fasesIII = await u.cumpl.query(api.onboarding.suppliers.obtenerFasesDeInscripcion, { inscripcionId });
    expect(fasesIII.find((f) => f.fase === "III_REVISION_DOCUMENTAL_CUMPLIMIENTO")?.asignadoA).toBe("cumpl");
    expect(fasesIII.find((f) => f.fase === "III_REVISION_DOCUMENTAL_COMPRAS")?.asignadoA).toBe("compras");

    const tareasCumpl = await u.cumpl.query(api.onboarding.suppliers.obtenerMisTareas, {});
    expect(tareasCumpl.map((x) => x.fase)).toEqual(["III_REVISION_DOCUMENTAL_CUMPLIMIENTO"]);
    const tareasMed = await u["cumpl-med"].query(api.onboarding.suppliers.obtenerMisTareas, {});
    expect(tareasMed).toHaveLength(0);

    // ── Revisión documental por carriles ─────────────────────────────────
    const docCumpl = docs.find((d) => d.revisorRol === "CUMPLIMIENTO_LOW_RISK")!;
    const docCompras = docs.find((d) => d.revisorRol === "COMPRAS")!;
    await expect(
      u.compras.mutation(api.onboarding.suppliers.revisarDocumento, {
        inscripcionId,
        docKey: docCumpl.docKey,
        decision: "APROBADO",
      }),
    ).rejects.toThrow(/asignada/);
    await expect(
      u.cumpl.mutation(api.onboarding.suppliers.revisarDocumento, {
        inscripcionId,
        docKey: docCumpl.docKey,
        decision: "RECHAZADO",
      }),
    ).rejects.toThrow(/motivo/);
    await u.cumpl.mutation(api.onboarding.suppliers.revisarDocumento, {
      inscripcionId,
      docKey: docCumpl.docKey,
      decision: "RECHAZADO",
      observaciones: "Ilegible",
    });
    // El proveedor recarga con el enlace del formulario (sigue vigente en Fase III).
    await t.mutation(api.onboarding.suppliersPublic.cargarDocumentoRevision, {
      inscripcionId,
      token: formToken,
      tipoDocumento: "NIT",
      numeroDocumento: "900123456",
      docKey: docCumpl.docKey,
      storageId: await storeBlob(t),
    });
    for (const d of docs) {
      const revisor = d.revisorRol === "COMPRAS" ? u.compras : u.cumpl;
      await revisor.mutation(api.onboarding.suppliers.revisarDocumento, { inscripcionId, docKey: d.docKey, decision: "APROBADO" });
    }
    ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("IV_APROBADO_CUMPLIMIENTO");
    const fasesIV = await u.cumpl.query(api.onboarding.suppliers.obtenerFasesDeInscripcion, { inscripcionId });
    expect(fasesIV.find((f) => f.fase === "IV_APROBADO_CUMPLIMIENTO")?.asignadoA).toBe("cumpl");
    expect(fasesIV.find((f) => f.fase === "III_REVISION_DOCUMENTAL_COMPRAS")?.estado).toBe("COMPLETADO");
    expect(docCompras.docKey).toBeDefined();

    // ── Fase IV (aprobación por nivel de riesgo) ─────────────────────────
    await expect(
      u["cumpl-high"].mutation(api.onboarding.suppliers.completarFaseIV, { inscripcionId, decision: "APROBADO" }),
    ).rejects.toThrow(/asignada/);
    await u.cumpl.mutation(api.onboarding.suppliers.completarFaseIV, { inscripcionId, decision: "APROBADO", observaciones: "OK" });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("V_EVALUACION_COMPRAS");

    // ── Fase V (evaluación de Compras) ───────────────────────────────────
    await expect(u.compras.mutation(api.onboarding.suppliers.completarFaseV, { inscripcionId })).rejects.toThrow(/evaluación/i);
    await u.compras.mutation(api.onboarding.suppliersEvaluar.evaluarProveedor, {
      inscripcionId,
      experiencia: 30,
      referencias: 30,
      portfolio: 30,
      certificados: 30,
      garantias: 30,
      fichasTecnicas: 30,
      formaPago: 30,
      sstAmbiental: null,
      calificacionGeneral: 5,
      isAprobado: true,
    });
    await u.compras.mutation(api.onboarding.suppliers.completarFaseV, { inscripcionId });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("VI_CREACION_CONTABILIDAD");
    const tareasConta = await u.conta.query(api.onboarding.suppliers.obtenerMisTareas, {});
    expect(tareasConta.map((x) => x.fase)).toEqual(["VI_CREACION_CONTABILIDAD"]);

    // ── Fase VI (Contabilidad) ───────────────────────────────────────────
    await expect(u.compras.mutation(api.onboarding.suppliers.completarFaseVI, { inscripcionId })).rejects.toThrow(/asignada/);
    await u.conta.mutation(api.onboarding.suppliers.completarFaseVI, {
      inscripcionId,
      notasContabilidad: { justificacionCambios: "Creado en SIESA con código 0001" },
    });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("COMPLETADO");
    expect(ins?.notasContabilidadFaseVI?.justificacionCambios).toContain("SIESA");

    const reporte = await u.admin.query(api.onboarding.suppliers.obtenerReporteProcesos, { empresa: 1 });
    expect(reporte).toHaveLength(1);
    expect(reporte[0].estadoFinal).toBe("COMPLETADO");
    expect(reporte[0].fases.map((f) => f.fase)).toContain("VI_CREACION_CONTABILIDAD");
    await expect(u.resp.query(api.onboarding.suppliers.obtenerReporteProcesos, { empresa: 1 })).rejects.toThrow(/reportes/);

    const evaluaciones = await u.admin.query(api.onboarding.suppliersEvaluar.obtenerTodasEvaluacionesConProveedor, { empresa: 1 });
    expect(evaluaciones).toHaveLength(1);

    // ── Devolución a Fase V ──────────────────────────────────────────────
    const fasesFinal = await u.admin.query(api.onboarding.suppliers.obtenerFasesDeInscripcion, { inscripcionId });
    const faseV = fasesFinal.find((f) => f.fase === "V_EVALUACION_COMPRAS")!;
    await expect(u.lector.mutation(api.onboarding.suppliers.devolverFase, { faseId: faseV._id, motivo: "x" })).rejects.toThrow(
      /No autorizado/,
    );
    await u.admin.mutation(api.onboarding.suppliers.devolverFase, { faseId: faseV._id, motivo: "Revisar evaluación" });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("V_EVALUACION_COMPRAS");
    expect(ins?.devolucionesFase?.[0]).toMatchObject({ faseOrigen: "COMPLETADO", faseDestino: "V_EVALUACION_COMPRAS" });
    const fasesTrasDevolver = await u.admin.query(api.onboarding.suppliers.obtenerFasesDeInscripcion, { inscripcionId });
    expect(fasesTrasDevolver.some((f) => f.fase === "VI_CREACION_CONTABILIDAD")).toBe(false);

    // ── Anulación ────────────────────────────────────────────────────────
    await u.admin.mutation(api.onboarding.suppliers.anularProceso, { inscripcionId, motivo: "Duplicado" });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("ANULADA");
    // Los enlaces revocados devuelven null (la página pública muestra "enlace inválido") en vez de lanzar.
    await expect(
      t.query(api.onboarding.suppliersPublic.obtenerInscripcionPublica, { inscripcionId, token: formToken }),
    ).resolves.toBeNull();
  }, 30_000);

  test("rechazo de Cumplimiento en Fase IV y ajuste de riesgo en Fase III", async () => {
    const fetchMock = stubFetch();
    const t = convexTest(schema, modules);
    const u = await seedRoles(t);
    const inscripcionId = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, { ...MATRIZ, rutStorageId: await storeBlob(t) });
    await flush(t);
    const [formToken] = trackedTokens(fetchMock);
    const publico = await t.query(api.onboarding.suppliersPublic.obtenerInscripcionPublica, { inscripcionId, token: formToken });
    const documentos: Record<string, Id<"_storage">> = {};
    for (const req of publico.documentosRequeridos) if (req.docKey !== "rutUltimoAnio") documentos[req.docKey] = await storeBlob(t);
    await t.mutation(api.onboarding.suppliersPublic.actualizarInscripcion, {
      inscripcionId,
      token: formToken,
      tipoDocumento: "NIT",
      numeroDocumento: "900123456",
      infoTributaria_04: INFO_TRIBUTARIA,
      documentos_15: documentos,
    });
    await t.mutation(api.onboarding.suppliersPublic.enviarFormulario, { inscripcionId, token: formToken, tipoDocumento: "NIT", numeroDocumento: "900123456" });
    await flush(t);
    const tokens = trackedTokens(fetchMock);
    await t.mutation(api.onboarding.suppliersPublic.firmarFormularioRepresentante, {
      inscripcionId,
      token: tokens[tokens.length - 1],
      firmaDataUrl: `data:image/png;base64,${"A".repeat(200)}`,
    });

    // Ajuste de riesgo: PEP=true eleva a SUPERIOR y agrega documentos.
    await expect(
      u.compras.mutation(api.onboarding.suppliers.ajustarRiesgoCumplimientoDocumental, {
        inscripcionId,
        isPep: true,
        listas: "NO",
        observacion: "Aparece en listas",
      }),
    ).rejects.toThrow(/Cumplimiento/);
    const ajuste = await u.cumpl.mutation(api.onboarding.suppliers.ajustarRiesgoCumplimientoDocumental, {
      inscripcionId,
      isPep: true,
      listas: "NO",
      observacion: "PEP confirmado",
    });
    expect(ajuste.riesgoNuevo).toBe("SUPERIOR");
    expect(ajuste.docsAgregados.length).toBeGreaterThan(0);
    await expect(
      u.cumpl.mutation(api.onboarding.suppliers.ajustarRiesgoCumplimientoDocumental, {
        inscripcionId,
        isPep: false,
        listas: "NO",
        observacion: "Bajar",
      }),
    ).rejects.toThrow(/aumenta/);

    // Aprobar todo → Fase IV asignada al nivel HIGH.
    const docs = await u.cumpl.query(api.onboarding.suppliers.obtenerRevisionDocumentos, { inscripcionId });
    for (const d of docs) {
      if (d.estado === "PENDIENTE") {
        await t.mutation(api.onboarding.suppliersPublic.cargarDocumentoRevision, {
          inscripcionId,
          token: formToken,
          tipoDocumento: "NIT",
          numeroDocumento: "900123456",
          docKey: d.docKey,
          storageId: await storeBlob(t),
        });
      }
      const revisor = d.revisorRol === "COMPRAS" ? u.compras : u.cumpl;
      await revisor.mutation(api.onboarding.suppliers.revisarDocumento, { inscripcionId, docKey: d.docKey, decision: "APROBADO" });
    }
    let ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("IV_APROBADO_CUMPLIMIENTO");
    const fases = await u.admin.query(api.onboarding.suppliers.obtenerFasesDeInscripcion, { inscripcionId });
    expect(fases.find((f) => f.fase === "IV_APROBADO_CUMPLIMIENTO")?.asignadoA).toBe("cumpl-high");
    expect((await u["cumpl-high"].query(api.onboarding.suppliers.obtenerMisTareas, {})).map((x) => x.fase)).toEqual(["IV_APROBADO_CUMPLIMIENTO"]);
    expect(await u.cumpl.query(api.onboarding.suppliers.obtenerMisTareas, {})).toHaveLength(0);

    await expect(
      u.cumpl.mutation(api.onboarding.suppliers.rechazarCumplimiento, { inscripcionId, motivoProveedor: "x", motivoInterno: "y" }),
    ).rejects.toThrow(/asignada/);
    await u["cumpl-high"].mutation(api.onboarding.suppliers.rechazarCumplimiento, {
      inscripcionId,
      motivoProveedor: "Documentación insuficiente",
      motivoInterno: "Coincidencia en listas",
    });
    ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("RECHAZADO");
    const publicoRechazado = await t.query(api.onboarding.suppliersPublic.obtenerInscripcionPublica, { inscripcionId, token: formToken });
    expect(publicoRechazado.motivoRechazo).toBe("Documentación insuficiente");
    expect(JSON.stringify(publicoRechazado)).not.toContain("Coincidencia en listas");
  }, 30_000);
});
