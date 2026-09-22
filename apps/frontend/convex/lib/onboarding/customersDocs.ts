// Helpers de dominio del módulo de CLIENTES: filas de revisión documental (un solo carril,
// Cumplimiento), materialización de documentos, fusión y validación de información tributaria.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { customerDocLabel, getCustomerDocKeys } from "../../../lib/onboarding/documents/customers";

export type CustomerDocRow = Doc<"onboardingClientesDocumentos">;
export const CUSTOMER_REVISOR_ROL = "CUMPLIMIENTO_LOW_RISK" as const;

export async function listDocsCliente(ctx: QueryCtx | MutationCtx, inscripcionId: Id<"onboardingClientes">): Promise<CustomerDocRow[]> {
  return await ctx.db
    .query("onboardingClientesDocumentos")
    .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", inscripcionId))
    .take(200);
}

export async function getDocCliente(
  ctx: QueryCtx | MutationCtx,
  inscripcionId: Id<"onboardingClientes">,
  docKey: string,
): Promise<CustomerDocRow | null> {
  return await ctx.db
    .query("onboardingClientesDocumentos")
    .withIndex("by_inscripcionId_docKey", (q) => q.eq("inscripcionId", inscripcionId).eq("docKey", docKey))
    .first();
}

/** Documentos requeridos al cliente (riesgo + tipo de persona + PEP). Todos los revisa Cumplimiento. */
export function documentosRequeridosCliente(
  ins: Doc<"onboardingClientes">,
): Array<{ docKey: string; docLabel: string; revisorRol: typeof CUSTOMER_REVISOR_ROL }> {
  return getCustomerDocKeys(ins.tipoEvaluacion, ins.datos_generales_01.tipoPersona, ins.matriz_00.isPep).map((docKey) => ({
    docKey,
    docLabel: customerDocLabel(docKey),
    revisorRol: CUSTOMER_REVISOR_ROL,
  }));
}

/** Storage del documento si el cliente ya lo cargó (el RUT viene de la matriz). */
export function storageCargadoDeCliente(ins: Doc<"onboardingClientes">, docKey: string): Id<"_storage"> | undefined {
  const cargados = ins.documentos_09 ?? {};
  return cargados[docKey] ?? (docKey === "rutUltimoAnio" ? ins.matriz_00.rutStorageId : undefined);
}

/** Crea (o reabre) la fila de revisión de cada documento requerido; devuelve las claves nuevas. */
export async function materializarDocumentosCliente(
  ctx: MutationCtx,
  ins: Doc<"onboardingClientes">,
  args: { accion: string; userId?: string; nota?: string; now: number; soloNuevos?: boolean },
): Promise<Array<{ docKey: string; docLabel: string }>> {
  const requeridos = documentosRequeridosCliente(ins);
  const agregados: Array<{ docKey: string; docLabel: string }> = [];
  for (const req of requeridos) {
    const storageId = storageCargadoDeCliente(ins, req.docKey);
    const existente = await getDocCliente(ctx, ins._id, req.docKey);
    const entrada = { accion: args.accion, fecha: args.now, userId: args.userId, nota: args.nota };
    if (existente) {
      if (args.soloNuevos) continue;
      await ctx.db.patch("onboardingClientesDocumentos", existente._id, {
        revisorRol: req.revisorRol,
        estado: storageId ? "EN_REVISION" : "PENDIENTE",
        storageId: storageId ?? undefined,
        historial: [...(existente.historial ?? []), entrada],
      });
    } else {
      await ctx.db.insert("onboardingClientesDocumentos", {
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

/** Todos los documentos aprobados (y al menos uno). Devuelve fecha y revisor del último. */
export function revisionDocumentalCompleta(docs: CustomerDocRow[], now: number): { ok: boolean; fecha: number; userId?: string } {
  if (docs.length === 0 || !docs.every((d) => d.estado === "APROBADO")) return { ok: false, fecha: 0 };
  const fecha = docs.reduce((max, d) => Math.max(max, d.fechaRevision ?? 0), 0) || now;
  const ultimo = docs.slice().sort((a, b) => (b.fechaRevision ?? 0) - (a.fechaRevision ?? 0))[0];
  return { ok: true, fecha, userId: ultimo?.revisadoPor };
}

// ─── Información tributaria ──────────────────────────────────────────────────

function asRecord(x: unknown): Record<string, unknown> | undefined {
  if (x != null && typeof x === "object" && !Array.isArray(x)) return x as Record<string, unknown>;
  return undefined;
}

/** Fusiona `infoTributaria_04` del cliente conservando sub-bloques que el patch no envía. */
export function mergeInfoTributariaCliente(
  prev: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = { ...(prev ?? {}) };
  const out: Record<string, unknown> = { ...base, ...patch };
  for (const key of ["impuestoRenta", "impuestoVentas", "impuestoIndustriaYComercio", "basesReteFuente", "contactoCertificadosRetencion"] as const) {
    const p = asRecord(patch[key]);
    if (p) out[key] = { ...(asRecord(base[key]) ?? {}), ...p };
  }
  return out;
}

/**
 * Reglas condicionales al enviar el formulario del cliente (Fase II → firma): cada «sí»
 * condicional exige sus datos asociados.
 */
export function assertInfoTributariaClienteParaEnvio(info: unknown): void {
  const root = asRecord(info);
  if (!root) return;
  const ir = asRecord(root.impuestoRenta);
  const iv = asRecord(root.impuestoVentas);
  const iyc = asRecord(root.impuestoIndustriaYComercio);
  const brf = asRecord(root.basesReteFuente);

  if (ir?.granContribuyente === true) {
    if (!String(ir.resolucion ?? "").trim()) {
      throw new Error("En información tributaria: indique el número de resolución de gran contribuyente DIAN.");
    }
    if (!String(iv?.tarifaRetencionIva ?? "").trim()) {
      throw new Error("En información tributaria: indique la tarifa de retención de IVA asociada a gran contribuyente DIAN.");
    }
  }
  if (iyc?.responsableImpuesto === true) {
    const municipios = Array.isArray(iyc.municipios) ? (iyc.municipios as unknown[]) : [];
    if (municipios.length === 0) {
      throw new Error("En información tributaria: indique ciudad y/o municipio donde es responsable de ICA.");
    }
  }
  if (iyc?.esGranContribuyenteIcaBogota === true && !String(iyc.resolucionGranContribuyenteIca ?? "").trim()) {
    throw new Error("En información tributaria: indique la resolución de gran contribuyente ICA Bogotá.");
  }
  if (brf?.practicaReteIca === true) {
    const municipios = Array.isArray(brf.municipiosRetIca) ? (brf.municipiosRetIca as unknown[]) : [];
    if (municipios.length === 0) {
      throw new Error("En información tributaria: indique ciudad y/o municipio para retención de ICA.");
    }
    if (!String(brf.tarifaRetencionIca ?? "").trim()) {
      throw new Error("En información tributaria: indique la tarifa de retención de ICA.");
    }
    if (!String(brf.whichBase ?? "").trim()) {
      throw new Error("En información tributaria: indique la base de retención de ICA.");
    }
  }
}

/** Forma de pago Anticipado ⇔ plazo NA (regla del módulo de clientes). */
export function assertCondicionesPagoCliente(formaPago: string, plazo: string): void {
  if (formaPago === "Anticipado" && plazo !== "NA") {
    throw new Error('Si la forma de pago es Anticipado, el plazo debe ser "NA".');
  }
  if (formaPago !== "Anticipado" && plazo === "NA") {
    throw new Error('El plazo "NA" solo aplica con forma de pago Anticipado.');
  }
}
