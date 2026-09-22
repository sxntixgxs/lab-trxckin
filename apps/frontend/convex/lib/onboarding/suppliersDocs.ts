// Helpers de dominio del módulo de PROVEEDORES: carriles de revisión documental,
// materialización de filas de documentos, fusión y validación de información tributaria.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  getSupplierDocKeys,
  supplierDocLabel,
  supplierDocRevisorRol,
} from "../../../lib/onboarding/documents/suppliers";

export type SupplierDocRow = Doc<"onboardingProveedoresDocumentos">;
export type RevisionDocumentalGrupo = "COMPRAS" | "CUMPLIMIENTO";
export type GrupoRevisionCompletado = { ok: boolean; fecha: number; userId?: string };

export type RevisionDocumentoLike = Pick<SupplierDocRow, "docKey" | "estado" | "revisorRol"> & {
  revisadoPor?: string;
  fechaRevision?: number;
};

export function grupoDeDocumento(doc: RevisionDocumentoLike): RevisionDocumentalGrupo {
  const rol = doc.revisorRol ?? supplierDocRevisorRol(doc.docKey);
  return rol === "COMPRAS" ? "COMPRAS" : "CUMPLIMIENTO";
}

/** Un carril está completo cuando todos sus documentos están APROBADOS (o no tiene documentos). */
export function getGrupoRevisionCompletado(
  docs: RevisionDocumentoLike[],
  grupo: RevisionDocumentalGrupo,
  now: number,
): GrupoRevisionCompletado {
  const docsGrupo = docs.filter((doc) => grupoDeDocumento(doc) === grupo);
  if (docsGrupo.length === 0) return { ok: true, fecha: now };
  if (!docsGrupo.every((doc) => doc.estado === "APROBADO")) return { ok: false, fecha: 0 };
  const fecha = docsGrupo.reduce((max, doc) => Math.max(max, doc.fechaRevision ?? 0), 0) || now;
  const ultimoDoc = docsGrupo.slice().sort((a, b) => (b.fechaRevision ?? 0) - (a.fechaRevision ?? 0))[0];
  return { ok: true, fecha, userId: ultimoDoc?.revisadoPor };
}

export function getCompletadosRevisionDocumental(docs: RevisionDocumentoLike[], now: number) {
  return {
    compras: getGrupoRevisionCompletado(docs, "COMPRAS", now),
    cumplimiento: getGrupoRevisionCompletado(docs, "CUMPLIMIENTO", now),
  };
}

export function getCompletadoDocumentalPorFase(
  fase: string,
  completados: ReturnType<typeof getCompletadosRevisionDocumental>,
): GrupoRevisionCompletado | null {
  if (fase === "III_REVISION_DOCUMENTAL_COMPRAS") return completados.compras.ok ? completados.compras : null;
  if (fase === "III_REVISION_DOCUMENTAL_CUMPLIMIENTO") return completados.cumplimiento.ok ? completados.cumplimiento : null;
  return null;
}

export const FASE_LANE_POR_GRUPO: Record<RevisionDocumentalGrupo, "III_REVISION_DOCUMENTAL_COMPRAS" | "III_REVISION_DOCUMENTAL_CUMPLIMIENTO"> = {
  COMPRAS: "III_REVISION_DOCUMENTAL_COMPRAS",
  CUMPLIMIENTO: "III_REVISION_DOCUMENTAL_CUMPLIMIENTO",
};

export async function listDocsProveedor(
  ctx: QueryCtx | MutationCtx,
  inscripcionId: Id<"onboardingProveedores">,
): Promise<SupplierDocRow[]> {
  return await ctx.db
    .query("onboardingProveedoresDocumentos")
    .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", inscripcionId))
    .take(200);
}

export async function getDocProveedor(
  ctx: QueryCtx | MutationCtx,
  inscripcionId: Id<"onboardingProveedores">,
  docKey: string,
): Promise<SupplierDocRow | null> {
  return await ctx.db
    .query("onboardingProveedoresDocumentos")
    .withIndex("by_inscripcionId_docKey", (q) => q.eq("inscripcionId", inscripcionId).eq("docKey", docKey))
    .first();
}

/** Documentos extra configurados para el tipo de proveedor de la inscripción (empresa-scoped). */
export async function extraDocsDeTipo(
  ctx: QueryCtx | MutationCtx,
  ins: Doc<"onboardingProveedores">,
): Promise<Array<{ docKey: string; docLabel: string; revisorRol: "COMPRAS" | "CUMPLIMIENTO_LOW_RISK" }>> {
  const tipo = await ctx.db
    .query("onboardingProveedoresTipos")
    .withIndex("by_empresa_key", (q) => q.eq("empresa", ins.empresa).eq("key", ins.tipoProveedor ?? "GENERAL"))
    .first();
  return tipo?.extraDocs ?? [];
}

/** Documentos requeridos (riesgo + tipo de proveedor) con etiqueta y carril. */
export async function documentosRequeridosProveedor(
  ctx: QueryCtx | MutationCtx,
  ins: Doc<"onboardingProveedores">,
): Promise<Array<{ docKey: string; docLabel: string; revisorRol: "COMPRAS" | "CUMPLIMIENTO_LOW_RISK" }>> {
  const base = getSupplierDocKeys(ins.tipoEvaluacion_14, ins.datos_generales_01.tipoPersona, ins.matriz_00.isPep).map(
    (docKey) => ({ docKey, docLabel: supplierDocLabel(docKey), revisorRol: supplierDocRevisorRol(docKey) }),
  );
  const extras = await extraDocsDeTipo(ctx, ins);
  const seen = new Set(base.map((d) => d.docKey));
  for (const extra of extras) {
    if (seen.has(extra.docKey)) continue;
    seen.add(extra.docKey);
    base.push(extra);
  }
  return base;
}

/** Storage del documento si el proveedor ya lo cargó (el RUT viene de la matriz). */
export function storageCargadoDe(ins: Doc<"onboardingProveedores">, docKey: string): Id<"_storage"> | undefined {
  const cargados = ins.documentos_15 ?? {};
  return cargados[docKey] ?? (docKey === "rutUltimoAnio" ? ins.matriz_00.rutStorageId : undefined);
}

/**
 * Crea (o reabre) la fila de revisión de cada documento requerido. Devuelve las claves
 * que se agregaron como nuevas.
 */
export async function materializarDocumentosProveedor(
  ctx: MutationCtx,
  ins: Doc<"onboardingProveedores">,
  args: { accion: string; userId?: string; nota?: string; now: number; soloNuevos?: boolean },
): Promise<Array<{ docKey: string; docLabel: string }>> {
  const requeridos = await documentosRequeridosProveedor(ctx, ins);
  const agregados: Array<{ docKey: string; docLabel: string }> = [];
  for (const req of requeridos) {
    const storageId = storageCargadoDe(ins, req.docKey);
    const existente = await getDocProveedor(ctx, ins._id, req.docKey);
    const entrada = { accion: args.accion, fecha: args.now, userId: args.userId, nota: args.nota };
    if (existente) {
      if (args.soloNuevos) continue;
      await ctx.db.patch("onboardingProveedoresDocumentos", existente._id, {
        revisorRol: req.revisorRol,
        estado: storageId ? "EN_REVISION" : "PENDIENTE",
        storageId: storageId ?? undefined,
        historial: [...(existente.historial ?? []), entrada],
      });
    } else {
      await ctx.db.insert("onboardingProveedoresDocumentos", {
        inscripcionId: ins._id,
        docKey: req.docKey,
        docLabel: req.docLabel,
        revisorRol: req.revisorRol,
        estado: storageId ? "EN_REVISION" : "PENDIENTE",
        storageId: storageId ?? undefined,
        historial: [entrada],
      });
      agregados.push({ docKey: req.docKey, docLabel: req.docLabel });
    }
  }
  return agregados;
}

// ─── Información tributaria ──────────────────────────────────────────────────

function asRecord(x: unknown): Record<string, unknown> | undefined {
  if (x != null && typeof x === "object" && !Array.isArray(x)) return x as Record<string, unknown>;
  return undefined;
}

/** Fusiona `infoTributaria_04` conservando sub-bloques que el patch no envía. */
export function mergeInfoTributariaProveedor(
  prev: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = { ...(prev ?? {}) };
  const out: Record<string, unknown> = { ...base, ...patch };
  for (const key of ["impuestoRenta", "impuestoVentas", "sujetoReteIca", "autorretenedorIca"] as const) {
    const p = asRecord(patch[key]);
    if (p) out[key] = { ...(asRecord(base[key]) ?? {}), ...p };
  }
  const pIyc = asRecord(patch.impuestoIndustriaYComercio);
  if (pIyc) {
    const bIyc = asRecord(base.impuestoIndustriaYComercio);
    const merged = { ...(bIyc ?? {}), ...pIyc };
    const pGcb = asRecord(pIyc.granContribuyenteBogota);
    if (pGcb) merged.granContribuyenteBogota = { ...(bIyc ? asRecord(bIyc.granContribuyenteBogota) ?? {} : {}), ...pGcb };
    out.impuestoIndustriaYComercio = merged;
  }
  return out;
}

function esNumeroPositivo(value: unknown): boolean {
  const n = typeof value === "number" ? value : Number(value);
  return value !== undefined && value !== null && Number.isFinite(n) && n > 0;
}

/** Reglas condicionales al enviar el formulario (Fase II → firma). */
export function assertInfoTributariaProveedorParaEnvio(info: unknown, tipoPersona: string): void {
  const root = asRecord(info);
  if (!root) throw new Error("Complete la sección de información tributaria antes de enviar el formulario.");
  const ir = asRecord(root.impuestoRenta);
  if (!ir) throw new Error("Complete la información tributaria (calidad del contribuyente) antes de enviar el formulario.");
  const iyc = asRecord(root.impuestoIndustriaYComercio);
  const sr = asRecord(root.sujetoReteIca);
  const ar = asRecord(root.autorretenedorIca);

  const contribuyente = ir.contribuyente === true;
  const calidad = ir.calidadContribuyente;
  const esRst = calidad === "RST" || ir.regimenSimple === true;

  if (ir.granContribuyente === true && !String(ir.resolucion ?? "").trim()) {
    throw new Error("En información tributaria: indique el número de resolución de gran contribuyente DIAN.");
  }
  if (esRst && !esNumeroPositivo(root.tarifaReteIvaRST)) {
    throw new Error("En información tributaria: indique la tarifa de retención de IVA aplicable (RST).");
  }
  if (contribuyente && calidad !== "NO_CONTRIBUYENTE" && ir.autorretenedorRenta === false) {
    const hasTarifa = esNumeroPositivo(root.tarifaReteFuente);
    const naturalTipo = String(root.tipoReteFuenteIfPersonaNatural ?? "").trim();
    if (tipoPersona === "PERSONA_JURIDICA" && !hasTarifa) {
      throw new Error("En información tributaria: indique la tarifa de retención en la fuente.");
    }
    if (tipoPersona === "PERSONA_NATURAL" && !hasTarifa && !naturalTipo) {
      throw new Error(
        "En información tributaria: indique la tarifa de retención en la fuente o si se acoge al Art. 383 / tarifa general.",
      );
    }
  }
  if (ir.autorretenedorRenta === true && !String(ir.resolucionAutorretenedor ?? "").trim()) {
    throw new Error("En información tributaria: indique la resolución de autorretenedor DIAN.");
  }
  if (iyc?.responsableImpuesto === true) {
    const arr = Array.isArray(iyc.municipiosIcaResponsable) ? (iyc.municipiosIcaResponsable as unknown[]) : [];
    if (arr.length === 0) {
      throw new Error("En información tributaria: indique al menos un municipio donde es responsable de ICA.");
    }
  }
  const gcb = iyc ? asRecord(iyc.granContribuyenteBogota) : undefined;
  if (gcb?.es === true && !String(gcb.resolucion ?? "").trim()) {
    throw new Error("En información tributaria: indique la resolución de gran contribuyente Bogotá (ICA).");
  }
  if (sr?.es === true) {
    const mun = Array.isArray(sr.municipios) ? (sr.municipios as unknown[]).filter((x) => typeof x === "string") : [];
    if (mun.length === 0) throw new Error("En información tributaria: indique municipios donde es sujeto de retención de ICA.");
    if (!esNumeroPositivo(sr.tarifa)) throw new Error("En información tributaria: indique la tarifa de retención de ICA.");
  }
  if (ar?.es === true) {
    const mun = Array.isArray(ar.municipios) ? (ar.municipios as unknown[]).filter((x) => typeof x === "string") : [];
    if (mun.length === 0) throw new Error("En información tributaria: indique municipios donde es autorretenedor de ICA.");
  }
}

/** Todos los documentos requeridos deben estar cargados antes de enviar el formulario. */
export async function assertDocumentosRequeridosCargados(
  ctx: MutationCtx,
  ins: Doc<"onboardingProveedores">,
): Promise<void> {
  const requeridos = await documentosRequeridosProveedor(ctx, ins);
  const faltantes = requeridos.filter((req) => !storageCargadoDe(ins, req.docKey));
  if (faltantes.length > 0) {
    throw new Error(`Faltan documentos requeridos: ${faltantes.map((f) => f.docLabel).join(", ")}.`);
  }
}
