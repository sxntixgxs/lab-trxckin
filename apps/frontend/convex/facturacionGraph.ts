"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import JSZip from "jszip";
import { getFacturacionAccessToken } from "./lib/facturacionMicrosoftGraph";
import { parseDianXml } from "./lib/facturacionDianXmlParser";
import { isPeajesProviderNit } from "./lib/peajes";
import { backgroundJobsHabilitados } from "./lib/backgroundJobs";
import {
  diagnoseGraphAccess,
  graph403Hint,
  inspectGraphTokenClaims,
} from "./lib/facturacionGraphDiagnostics";
import {
  buildInboxMessagesUrl,
  computeSyncStartIso,
  computeSevenDayBackfillStartIso,
  advanceWatermark,
  formatSyncError,
  getRetryDelayMs,
  isRetryableGraphStatus,
  necesitaImportarAdjuntos,
  SYNC_MAX_CONTINUACIONES,
  SYNC_MAX_INTENTOS_CORREO,
  SYNC_MAX_MENSAJES_POR_CORRIDA,
  SYNC_PAGE_SIZE,
} from "./lib/facturacionGraphSync";
import { EMPRESAS_MAP } from "../lib/empresas";
import { facturacionGraphMailboxes, frontendUrl } from "./lib/env";
const MAX_ATTACHMENT_SIZE = 30 * 1024 * 1024;
const GRAPH_FETCH_MAX_INTENTOS = 4;
const REPROCESO_BATCH = 50;
const ALERTA_EDAD_MINIMA_MS = 60 * 60 * 1000; // 1 hora sin procesar => alerta
const ALERTA_COOLDOWN_MS = 6 * 60 * 60 * 1000; // máx. una alerta cada 6 horas
const ALLOWED_EXTENSIONS = new Set([
  "xml",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "png",
  "jpg",
  "jpeg",
  "zip",
]);

type GraphAttachment = {
  id?: string;
  name?: string;
  size?: number;
  contentType?: string;
  isInline?: boolean;
  "@odata.type"?: string;
};

type GraphMessage = {
  id?: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  bodyPreview?: string;
  body?: { content?: string };
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  importance?: string;
  isDraft?: boolean;
};

type ImportedAttachment = {
  graphAttachmentId: string;
  storageId: Id<"_storage">;
  name: string;
  contentType?: string | null;
  size?: number | null;
  isInline: boolean;
};

type CuentaRecepcion = {
  empresa: number;
  email: string;
};

type CuentaRecepcionOmitida = {
  empresa: number;
  email: string;
  motivo: "carga_manual";
};

type SyncOneInboxResult = {
  synced: number;
  processed: number;
  failed: number;
  total: number;
  accountEmail: string;
  empresa: number;
  error?: string;
  hayMasTrabajo?: boolean;
  siguienteUrl?: string;
  leaseOcupado?: boolean;
};

type SyncInboxResult = {
  synced: number;
  processed: number;
  failed: number;
  total: number;
  accounts: SyncOneInboxResult[];
  skipped: number;
  skippedAccounts: CuentaRecepcionOmitida[];
};

type SyncOrigen = "cron" | "manual" | "continuacion" | "backfill";

type BackfillContinuation = {
  email: string;
  empresa: number;
  siguienteUrl: string;
};

type SyncOneInboxOptions = {
  startIso?: string;
  continuationUrl?: string;
};

type SyncInboxOptions = {
  backfillStartIso?: string;
  backfillContinuations?: BackfillContinuation[];
};

type ProcessUploadedXmlArgs = {
  xmlStorageId: Id<"_storage">;
  pdfStorageId?: Id<"_storage">;
  empresa?: number;
  categoria: "tecnologia" | "administracion" | "otro";
};

type ProcessUploadedXmlResult = {
  facturaId: Id<"facturacionFacturas">;
  esPeaje: boolean;
  tareaCreada: boolean;
  parsed: {
    numeroFactura: string;
    clienteNit: string;
    proveedorNombre: string;
    proveedorNit: string;
    total: number;
    moneda: string;
    fechaEmision: string;
    descripcion: string;
    lineasCount: number;
    referenciaDocumento: string;
    referenciaCufe: string;
  };
};

function getExtension(name: string | undefined) {
  if (!name || !name.includes(".")) return null;
  return name.split(".").pop()?.trim().toLowerCase() ?? null;
}

function isPeajesProveedorNit(value?: string) {
  return isPeajesProviderNit(value);
}
// 900.000.001-1 => 900000001
function normalizeNitForMatch(value?: string) {
  const base = (value ?? "").split("-")[0] ?? "";
  return base.replace(/\D/g, "").replace(/^0+/, "");
}

// Consulta el NIT del cliente; si no existe retorna 0 y no se crea la factura.
function getEmpresaByNit(nit: string): number {
  const nitNormalizado = normalizeNitForMatch(nit);
  if (!nitNormalizado) return 0;

  const empresa = Object.values(EMPRESAS_MAP).find((item) => {
    const empresaNit = normalizeNitForMatch(item.nit);
    if (!empresaNit) return false;
    return nitNormalizado === empresaNit;
  });

  return empresa?.id ?? 0;
}

function isAllowedAttachment(attachment: GraphAttachment) {
  if (
    attachment["@odata.type"] &&
    attachment["@odata.type"] !== "#microsoft.graph.fileAttachment"
  ) {
    return false;
  }

  if (!attachment.id || attachment.isInline) return false;

  const ext = getExtension(attachment.name);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) return false;

  if (typeof attachment.size === "number" && attachment.size > MAX_ATTACHMENT_SIZE) {
    return false;
  }

  return true;
}

const ZIP_EXTRACTABLE_EXTENSIONS = new Set(["xml", "pdf", "zip"]);

function getZipEntryContentType(ext: string) {
  if (ext === "xml") return "application/xml";
  if (ext === "pdf") return "application/pdf";
  return "application/zip";
}

async function extractFilesFromZip(
  ctx: ActionCtx,
  zipBlob: Blob,
  zipName: string
): Promise<ImportedAttachment[]> {
  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
  const extracted: ImportedAttachment[] = [];

  for (const [fileName, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;

    const ext = getExtension(fileName);
    if (!ext || !ZIP_EXTRACTABLE_EXTENSIONS.has(ext)) continue;

    const fileData = await zipEntry.async("blob");
    const contentType = getZipEntryContentType(ext);
    const blob = new Blob([fileData], { type: contentType });
    const storageId = await ctx.storage.store(blob);

    extracted.push({
      graphAttachmentId: `zip:${zipName}/${fileName}`,
      storageId,
      name: fileName,
      contentType,
      size: fileData.size,
      isInline: false,
    });
  }

  return extracted;
}

type AdjuntoSoporte = {
  storageId: Id<"_storage">;
  name: string;
  graphAttachmentId: string;
};

function getContenedorTopLevel(graphAttachmentId: string): string | null {
  if (!graphAttachmentId.startsWith("zip:")) return null;
  const fueraPrefijo = graphAttachmentId.slice("zip:".length);
  const sep = fueraPrefijo.indexOf("/");
  return sep > 0 ? fueraPrefijo.slice(0, sep) : null;
}

function pickPdfDeFactura<T extends { name: string; graphAttachmentId: string }>(
  attachments: T[],
  xmlAttachment: T
): T | undefined {
  const xmlContenedor = getContenedorTopLevel(xmlAttachment.graphAttachmentId);
  const pdfMismoContenedor = attachments.find((a) => {
    if (!a.name.toLowerCase().endsWith(".pdf")) return false;
    return getContenedorTopLevel(a.graphAttachmentId) === xmlContenedor;
  });
  if (pdfMismoContenedor) return pdfMismoContenedor;
  return attachments.find((a) => a.name.toLowerCase().endsWith(".pdf"));
}

function buscarSoportesEnCorreo(
  attachments: AdjuntoSoporte[],
  invoiceStorageIds: Set<string>
): AdjuntoSoporte[] {
  const contenedoresConXml = new Set<string>();
  for (const a of attachments) {
    if (a.graphAttachmentId.startsWith("zip:")) {
      const fueraPrefijo = a.graphAttachmentId.slice("zip:".length);
      const sep = fueraPrefijo.lastIndexOf("/");
      if (sep > 0 && a.name.toLowerCase().endsWith(".xml")) {
        contenedoresConXml.add(fueraPrefijo.slice(0, sep));
      }
    }
  }

  return attachments.filter((a) => {
    if (a.graphAttachmentId.startsWith("zip:")) return false;
    if (invoiceStorageIds.has(a.storageId as unknown as string)) return false;
    if (a.name.toLowerCase().endsWith(".zip") && contenedoresConXml.has(a.name)) {
      return false;
    }
    return true;
  });
}

async function empaquetarSoportes(
  ctx: ActionCtx,
  soportes: AdjuntoSoporte[],
  numeroFactura: string
): Promise<{ storageId: Id<"_storage">; nombre: string } | null> {
  if (soportes.length === 0) return null;
  const zip = new JSZip();
  for (const soporte of soportes) {
    const blob = await ctx.storage.get(soporte.storageId);
    if (!blob) continue;
    zip.file(soporte.name, await blob.arrayBuffer());
  }
  if (Object.keys(zip.files).length === 0) return null;
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
  });
  const storageId = await ctx.storage.store(blob);
  const slug = numeroFactura.replace(/[^A-Za-z0-9_-]+/g, "_") || "factura";
  return { storageId, nombre: `soportes-${slug}.zip` };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch a Graph con reintentos: 429/5xx (respetando Retry-After) y errores de
 * red se reintentan con backoff exponencial.
 */
async function fetchGraphResponse(url: string, token: string): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= GRAPH_FETCH_MAX_INTENTOS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      lastError = error;
      if (attempt < GRAPH_FETCH_MAX_INTENTOS) {
        await sleep(getRetryDelayMs(attempt, null));
        continue;
      }
      break;
    }

    if (response.ok) return response;

    if (isRetryableGraphStatus(response.status) && attempt < GRAPH_FETCH_MAX_INTENTOS) {
      await sleep(getRetryDelayMs(attempt, response.headers.get("Retry-After")));
      continue;
    }

    const body = await response.text();
    if (response.status === 403) {
      throw new Error(`Graph API 403: ${body} ${graph403Hint()}`);
    }
    throw new Error(`Graph API ${response.status}: ${body}`);
  }

  throw new Error(
    `Graph API sin respuesta tras ${GRAPH_FETCH_MAX_INTENTOS} intentos: ${formatSyncError(lastError)}`
  );
}

async function fetchGraphJson<T>(url: string, token: string): Promise<T> {
  const response = await fetchGraphResponse(url, token);
  return (await response.json()) as T;
}

async function fetchGraphBlob(url: string, token: string) {
  const response = await fetchGraphResponse(url, token);
  return await response.blob();
}

function mapGraphMessage(message: GraphMessage, cuenta: CuentaRecepcion) {
  return {
    empresa: cuenta.empresa,
    cuentaRecepcionEmail: cuenta.email,
    graphMessageId: message.id ?? "",
    conversationId: message.conversationId,
    subject: message.subject ?? "(Sin asunto)",
    from: message.from?.emailAddress?.address ?? "desconocido",
    toRecipients:
      message.toRecipients?.map((recipient) => recipient.emailAddress?.address ?? "") ?? [],
    bodyPreview: message.bodyPreview ?? "",
    bodyContent: message.body?.content,
    receivedDateTime: message.receivedDateTime ?? "",
    isRead: message.isRead ?? false,
    hasAttachments: message.hasAttachments ?? false,
    importance: message.importance ?? "normal",
  };
}

function buildFacturaPayload(args: {
  empresa: number;
  parsed: ReturnType<typeof parseDianXml>;
  xmlStorageId: Id<"_storage">;
  pdfStorageId?: Id<"_storage">;
  soportesStorageId?: Id<"_storage">;
  soportesNombre?: string;
  emailId?: Id<"facturacionCorreos">;
  graphMessageId?: string;
  origen: "correo" | "carga_manual";
}) {
  const {
    empresa,
    parsed,
    xmlStorageId,
    pdfStorageId,
    soportesStorageId,
    soportesNombre,
    emailId,
    graphMessageId,
    origen,
  } = args;

  return {
    empresa,
    numeroFactura: parsed.numeroFactura,
    tipoDocumento: parsed.tipoDocumento,
    referenciaDocumento: parsed.referenciaDocumento,
    referenciaCufe: parsed.referenciaCufe,
    proveedorNit: parsed.proveedorNit,
    proveedorNombre: parsed.proveedorNombre,
    fechaEmision: parsed.fechaEmision,
    subtotal: parsed.subtotal,
    impuestos: parsed.impuestos,
    total: parsed.total,
    moneda: parsed.moneda,
    descripcion: parsed.descripcion,
    xmlStorageId,
    origen,
    ...(parsed.cufe ? { cufe: parsed.cufe } : {}),
    ...(parsed.proveedorDireccion ? { proveedorDireccion: parsed.proveedorDireccion } : {}),
    ...(parsed.proveedorTelefono ? { proveedorTelefono: parsed.proveedorTelefono } : {}),
    ...(parsed.proveedorEmail ? { proveedorEmail: parsed.proveedorEmail } : {}),
    ...(parsed.fechaVencimiento ? { fechaVencimiento: parsed.fechaVencimiento } : {}),
    ...(parsed.lineas.length > 0 ? { lineas: parsed.lineas } : {}),
    ...(pdfStorageId ? { pdfStorageId } : {}),
    ...(soportesStorageId ? { soportesStorageId } : {}),
    ...(soportesNombre ? { soportesNombre } : {}),
    ...(emailId ? { emailId } : {}),
    ...(graphMessageId ? { graphMessageId } : {}),
  };
}

async function getCuentasRecepcion(ctx: ActionCtx): Promise<{
  cuentas: CuentaRecepcion[];
  omitidas: CuentaRecepcionOmitida[];
}> {
  return await ctx.runQuery(internal.facturacionConfiguracion.listarCuentasRecepcionInterno, {});
}

type ImportAttachmentsResult = {
  imported: ImportedAttachment[];
  errores: string[];
};

async function importAttachmentsForEmail(
  ctx: ActionCtx,
  graphMessageId: string,
  accountEmail: string,
  token: string
): Promise<ImportAttachmentsResult> {
  const basePath = `users/${encodeURIComponent(accountEmail)}`;
  const listResponse = await fetchGraphJson<{ value?: GraphAttachment[] }>(
    `https://graph.microsoft.com/v1.0/${basePath}/messages/${encodeURIComponent(graphMessageId)}/attachments?$select=id,name,size,contentType,isInline`,
    token
  );

  const eligible = (listResponse.value ?? []).filter(isAllowedAttachment);

  if (eligible.length === 0) {
    await ctx.runMutation(internal.facturacionCorreos.setAdjuntos, {
      graphMessageId,
      attachments: [],
      attachmentImportStatus: "skipped",
    });
    return { imported: [], errores: [] };
  }

  const imported: ImportedAttachment[] = [];
  const erroresAdjuntos: string[] = [];

  for (const attachment of eligible) {
    try {
      const blob = await fetchGraphBlob(
        `https://graph.microsoft.com/v1.0/${basePath}/messages/${encodeURIComponent(graphMessageId)}/attachments/${encodeURIComponent(attachment.id!)}/$value`,
        token
      );

      const attachmentName = attachment.name ?? `attachment-${attachment.id}`;
      const ext = getExtension(attachmentName);

      if (ext === "zip") {
        const zipExtracted = await extractFilesFromZip(ctx, blob, attachmentName);
        imported.push(...zipExtracted);

        // También guardar el .zip original
        const storageId = await ctx.storage.store(blob);
        imported.push({
          graphAttachmentId: attachment.id!,
          storageId,
          name: attachmentName,
          contentType: attachment.contentType,
          size: attachment.size,
          isInline: false,
        });
      } else {
        const storageId = await ctx.storage.store(blob);
        imported.push({
          graphAttachmentId: attachment.id!,
          storageId,
          name: attachmentName,
          contentType: attachment.contentType,
          size: attachment.size,
          isInline: false,
        });
      }
    } catch (error) {
      console.error("[facturacionGraph] Error importando adjunto", error);
      erroresAdjuntos.push(`${attachment.name ?? attachment.id}: ${formatSyncError(error)}`);
    }
  }

  const attachmentImportStatus =
    erroresAdjuntos.length === 0 ? "complete" : imported.length > 0 ? "partial" : "failed";

  await ctx.runMutation(internal.facturacionCorreos.setAdjuntos, {
    graphMessageId,
    attachments: imported,
    attachmentImportStatus,
  });

  return { imported, errores: erroresAdjuntos };
}

async function processInvoiceFromCorreo(
  ctx: ActionCtx,
  graphMessageId: string,
  categoria: "tecnologia" | "administracion" | "otro" = "administracion"
): Promise<Id<"facturacionFacturas">[]> {
  const correo: Doc<"facturacionCorreos"> | null = await ctx.runQuery(
    internal.facturacionCorreos.getByGraphMessageId,
    { graphMessageId }
  );

  if (!correo || correo.procesado) return [];

  const attachments = correo.attachments ?? [];
  const xmlAttachments = attachments.filter((attachment) =>
    attachment.name.toLowerCase().endsWith(".xml")
  );

  if (xmlAttachments.length === 0) {
    // Sin XML no hay factura. Si la importación de adjuntos ya terminó de
    // forma definitiva, marcamos el correo como omitido para no reintentarlo
    // eternamente; si quedó incompleta, el reproceso volverá a intentarlo.
    if (
      correo.attachmentImportStatus === "complete" ||
      correo.attachmentImportStatus === "skipped"
    ) {
      await ctx.runMutation(internal.facturacionCorreos.marcarOmitido, {
        correoId: correo._id,
        motivo: "sin_xml",
      });
    }
    return [];
  }

  // Adjuntos que pertenecen a alguna factura (XML + su PDF): se excluyen de
  // los soportes.
  type AdjuntoCorreo = (typeof attachments)[number];
  const invoiceStorageIds = new Set<string>();
  const documentos: Array<{
    xml: AdjuntoCorreo;
    pdf: AdjuntoCorreo | undefined;
  }> = [];
  for (const xmlAttachment of xmlAttachments) {
    const pdfAttachment = pickPdfDeFactura(attachments, xmlAttachment);
    invoiceStorageIds.add(xmlAttachment.storageId as unknown as string);
    if (pdfAttachment) {
      invoiceStorageIds.add(pdfAttachment.storageId as unknown as string);
    }
    documentos.push({ xml: xmlAttachment, pdf: pdfAttachment });
  }

  const creadas: Id<"facturacionFacturas">[] = [];
  const erroresXml: string[] = [];
  let omitidasPorNit = 0;
  let soportesEmpaquetados: {
    storageId: Id<"_storage">;
    nombre: string;
  } | null = null;

  for (const documento of documentos) {
    try {
      const xmlBlob = await ctx.storage.get(documento.xml.storageId);
      if (!xmlBlob) {
        throw new Error(`No se pudo leer el XML almacenado (${documento.xml.name})`);
      }

      const parsed = parseDianXml(await xmlBlob.text());
      const empresa = getEmpresaByNit(parsed.clienteNit);
      if (!empresa) {
        console.warn(
          `[facturacionGraph] Factura ${parsed.numeroFactura} omitida: NIT cliente no reconocido (${parsed.clienteNit || "sin NIT"}).`
        );
        omitidasPorNit += 1;
        continue;
      }

      // Los soportes (adjuntos que no son factura) se empaquetan una sola vez
      // y se asocian a la primera factura creada del correo.
      if (creadas.length === 0 && !soportesEmpaquetados) {
        const soportes = buscarSoportesEnCorreo(attachments, invoiceStorageIds);
        soportesEmpaquetados = await empaquetarSoportes(ctx, soportes, parsed.numeroFactura);
      }

      const esPrimera = creadas.length === 0;
      const facturaId = await ctx.runMutation(
        internal.facturacionFacturas.crearDesdeXml,
        buildFacturaPayload({
          empresa,
          parsed,
          xmlStorageId: documento.xml.storageId,
          pdfStorageId: documento.pdf?.storageId,
          soportesStorageId: esPrimera ? soportesEmpaquetados?.storageId : undefined,
          soportesNombre: esPrimera ? soportesEmpaquetados?.nombre : undefined,
          emailId: correo._id,
          graphMessageId,
          origen: "correo",
        })
      );

      if (!isPeajesProveedorNit(parsed.proveedorNit)) {
        await ctx.runMutation(internal.facturacionTareas.crearDesdeFacturaInterno, {
          facturaId,
          empresa,
          categoria,
        });
      }

      creadas.push(facturaId);
    } catch (error) {
      erroresXml.push(`${documento.xml.name}: ${formatSyncError(error)}`);
    }
  }

  if (erroresXml.length > 0) {
    // Dejar el correo pendiente para que el reproceso lo reintente. Las
    // facturas ya creadas son idempotentes (crearDesdeXml deduplica).
    throw new Error(`XML con error: ${erroresXml.join("; ")}`);
  }

  if (creadas.length > 0) {
    await ctx.runMutation(internal.facturacionCorreos.marcarProcesado, {
      correoId: correo._id,
      facturaId: creadas[0],
      facturaIds: creadas,
    });
    return creadas;
  }

  if (omitidasPorNit === documentos.length) {
    await ctx.runMutation(internal.facturacionCorreos.marcarOmitido, {
      correoId: correo._id,
      motivo: "nit_desconocido",
    });
  }

  return [];
}

type GraphMessagesPage = {
  value?: GraphMessage[];
  "@odata.nextLink"?: string;
};

async function syncOneInboxImpl(
  ctx: ActionCtx,
  cuenta: CuentaRecepcion,
  maxMensajes: number,
  options: SyncOneInboxOptions = {}
): Promise<SyncOneInboxResult> {
  const accountEmail = cuenta.email;

  const lease: { ok: boolean; watermarkReceivedDateTime?: string } = await ctx.runMutation(
    internal.facturacionSync.tomarLease,
    {
      email: accountEmail,
      empresa: cuenta.empresa,
    }
  );

  if (!lease.ok) {
    return {
      synced: 0,
      processed: 0,
      failed: 0,
      total: 0,
      accountEmail,
      empresa: cuenta.empresa,
      leaseOcupado: true,
    };
  }

  let synced = 0;
  let processed = 0;
  let failed = 0;
  let total = 0;
  let watermark = lease.watermarkReceivedDateTime;
  // Si un correo no quedó persistido en la BD, el watermark no puede avanzar
  // más allá de él: se volvería invisible para siempre.
  let watermarkBloqueado = false;
  let hayMasTrabajo = false;
  let siguienteUrl: string | undefined;
  let errorCuenta: string | undefined;

  try {
    const token = await getFacturacionAccessToken(cuenta.empresa);
    const startIso =
      options.startIso ?? computeSyncStartIso(lease.watermarkReceivedDateTime, Date.now());
    let url: string | undefined =
      options.continuationUrl ?? buildInboxMessagesUrl(accountEmail, startIso, SYNC_PAGE_SIZE);

    while (url) {
      const page: GraphMessagesPage = await fetchGraphJson<GraphMessagesPage>(url, token);

      for (const message of page.value ?? []) {
        if (!message.id || message.isDraft) continue;
        total += 1;

        let existing: Doc<"facturacionCorreos"> | null = null;
        try {
          existing = await ctx.runQuery(internal.facturacionCorreos.getByGraphMessageId, {
            graphMessageId: message.id,
          });
          await ctx.runMutation(
            internal.facturacionCorreos.upsertCorreo,
            mapGraphMessage(message, cuenta)
          );
          synced += 1;
        } catch (error) {
          failed += 1;
          watermarkBloqueado = true;
          console.error("[facturacionGraph] Error persistiendo correo; watermark bloqueado", error);
          continue;
        }

        try {
          const intentos = existing?.intentosProcesamiento ?? 0;
          if (!existing?.procesado && intentos < SYNC_MAX_INTENTOS_CORREO) {
            let erroresAdjuntos: string[] = [];
            // Se listan adjuntos aunque Graph reporte hasAttachments=false
            // (a veces lo reporta mal); si no hay elegibles queda "skipped".
            if (necesitaImportarAdjuntos(existing?.attachmentImportStatus)) {
              const importResult = await importAttachmentsForEmail(
                ctx,
                message.id,
                accountEmail,
                token
              );
              erroresAdjuntos = importResult.errores;
            }

            const facturas = await processInvoiceFromCorreo(ctx, message.id);
            processed += facturas.length;

            if (erroresAdjuntos.length > 0) {
              failed += 1;
              await ctx.runMutation(internal.facturacionCorreos.registrarIntentoProcesamiento, {
                graphMessageId: message.id,
                error: `Adjuntos con error: ${erroresAdjuntos.join("; ")}`,
              });
            }
          }

          if (!watermarkBloqueado) {
            watermark = advanceWatermark(watermark, message.receivedDateTime);
          }
        } catch (error) {
          // El correo ya está persistido: el reproceso lo recupera, así que
          // el watermark sí puede avanzar.
          failed += 1;
          await ctx.runMutation(internal.facturacionCorreos.registrarIntentoProcesamiento, {
            graphMessageId: message.id,
            error: formatSyncError(error),
          });
          if (!watermarkBloqueado) {
            watermark = advanceWatermark(watermark, message.receivedDateTime);
          }
        }
      }

      const nextUrl = page["@odata.nextLink"];
      // Se completa la página actual antes de continuar para no saltar
      // mensajes cuando Graph entregue páginas de tamaño variable.
      if (total >= maxMensajes && nextUrl) {
        hayMasTrabajo = true;
        siguienteUrl = nextUrl;
        break;
      }
      url = nextUrl;
    }
  } catch (error) {
    errorCuenta = formatSyncError(error);
    failed += 1;
    console.error(
      `[facturacionGraph] Error sincronizando cuenta ${accountEmail} (empresa ${cuenta.empresa})`,
      error
    );
  } finally {
    await ctx.runMutation(internal.facturacionSync.liberarLease, {
      email: accountEmail,
      ...(watermark ? { watermarkReceivedDateTime: watermark } : {}),
      resultado: {
        synced,
        processed,
        failed,
        total,
        ...(errorCuenta ? { error: errorCuenta } : {}),
      },
    });
  }

  return {
    synced,
    processed,
    failed,
    total,
    accountEmail,
    empresa: cuenta.empresa,
    ...(errorCuenta ? { error: errorCuenta } : {}),
    ...(hayMasTrabajo ? { hayMasTrabajo: true } : {}),
    ...(siguienteUrl ? { siguienteUrl } : {}),
  };
}

async function syncInboxImpl(
  ctx: ActionCtx,
  origen: SyncOrigen,
  profundidad = 0,
  options: SyncInboxOptions = {}
): Promise<SyncInboxResult> {
  const inicioEn = Date.now();
  const { cuentas, omitidas } = await getCuentasRecepcion(ctx);
  const resultados: SyncOneInboxResult[] = [];
  const continuacionPorCorreo = new Map(
    (options.backfillContinuations ?? []).map((item) => [item.email.toLowerCase(), item])
  );
  const cuentasASincronizar = options.backfillContinuations
    ? cuentas.filter((cuenta) => continuacionPorCorreo.has(cuenta.email.toLowerCase()))
    : cuentas;

  for (const cuenta of cuentasASincronizar) {
    try {
      resultados.push(
        await syncOneInboxImpl(ctx, cuenta, SYNC_MAX_MENSAJES_POR_CORRIDA, {
          startIso: options.backfillStartIso,
          continuationUrl: continuacionPorCorreo.get(cuenta.email.toLowerCase())?.siguienteUrl,
        })
      );
    } catch (error) {
      console.error(
        `[facturacionGraph] Error sincronizando cuenta ${cuenta.email} (empresa ${cuenta.empresa})`,
        error
      );
      resultados.push({
        synced: 0,
        processed: 0,
        failed: 1,
        total: 0,
        accountEmail: cuenta.email,
        empresa: cuenta.empresa,
        error: formatSyncError(error),
      });
    }
  }

  await ctx.runMutation(internal.facturacionSync.registrarRun, {
    origen,
    inicioEn,
    cuentas: resultados.map((item) => ({
      email: item.accountEmail,
      empresa: item.empresa,
      synced: item.synced,
      processed: item.processed,
      failed: item.failed,
      total: item.total,
      ...(item.error ? { error: item.error } : {}),
      ...(item.hayMasTrabajo ? { hayMasTrabajo: true } : {}),
      ...(item.leaseOcupado ? { leaseOcupado: true } : {}),
    })),
  });

  const continuacionesBackfill: BackfillContinuation[] = resultados.flatMap((item) =>
    item.siguienteUrl
      ? [
          {
            email: item.accountEmail,
            empresa: item.empresa,
            siguienteUrl: item.siguienteUrl,
          },
        ]
      : []
  );

  // Si alguna cuenta alcanzó el tope de mensajes, continuar de inmediato en
  // otra corrida. El backfill conserva el nextLink de Graph para recorrer la
  // ventana fija completa sin reiniciar desde el comienzo ni modificar el
  // watermark normal. Al estar acotado a siete días, continúa hasta agotar la
  // paginación; la sincronización regular conserva su tope anti-loops.
  if (continuacionesBackfill.length > 0) {
    if (options.backfillStartIso) {
      await ctx.scheduler.runAfter(
        0,
        internal.facturacionGraph.sincronizarBandejaBackfillContinuacion,
        {
          profundidad: profundidad + 1,
          startIso: options.backfillStartIso,
          continuaciones: continuacionesBackfill,
        }
      );
    } else if (profundidad < SYNC_MAX_CONTINUACIONES) {
      await ctx.scheduler.runAfter(0, internal.facturacionGraph.sincronizarBandejaContinuacion, {
        profundidad: profundidad + 1,
      });
    }
  }

  return {
    synced: resultados.reduce((total, item) => total + item.synced, 0),
    processed: resultados.reduce((total, item) => total + item.processed, 0),
    failed: resultados.reduce((total, item) => total + item.failed, 0),
    total: resultados.reduce((total, item) => total + item.total, 0),
    accounts: resultados,
    skipped: omitidas.length,
    skippedAccounts: omitidas,
  };
}

export const sincronizarBandeja = action({
  // `limit` se conserva por compatibilidad con la UI; la sincronización ya no
  // usa una ventana fija sino watermark + paginación completa.
  args: { limit: v.optional(v.number()) },
  handler: async (ctx: ActionCtx): Promise<SyncInboxResult> => {
    await ctx.runQuery(internal.users.assertPermisoActor, {
      permisos: ["billing/emails", "billing/inbox", "billing/dashboard"],
    });
    return await syncInboxImpl(ctx, "manual");
  },
});

const graphDiagnosticoValidator = v.object({
  tokenOk: v.boolean(),
  tenantId: v.optional(v.string()),
  appId: v.optional(v.string()),
  roles: v.array(v.string()),
  delegatedScopes: v.array(v.string()),
  hasMailReadApplication: v.boolean(),
  cuentaRecepcion: v.optional(v.string()),
  userLookupStatus: v.optional(v.number()),
  userPrincipalName: v.optional(v.string()),
  mailboxLookupStatus: v.optional(v.number()),
  diagnosis: v.string(),
  rawError: v.optional(v.string()),
});

/** Internal only: exposes tenant/app IDs and token claims. Run from the Convex dashboard. */
export const diagnosticarConexionGraph = internalAction({
  args: { empresa: v.optional(v.number()) },
  returns: graphDiagnosticoValidator,
  handler: async (ctx: ActionCtx, args): Promise<{
    tokenOk: boolean;
    tenantId?: string;
    appId?: string;
    roles: string[];
    delegatedScopes: string[];
    hasMailReadApplication: boolean;
    cuentaRecepcion?: string;
    userLookupStatus?: number;
    userPrincipalName?: string;
    mailboxLookupStatus?: number;
    diagnosis: string;
    rawError?: string;
  }> => {
    const { cuentas } = await getCuentasRecepcion(ctx);
    const cuenta =
      args.empresa !== undefined
        ? cuentas.find((item) => item.empresa === args.empresa)
        : cuentas[0];

    if (!cuenta) {
      return {
        tokenOk: false,
        roles: [],
        delegatedScopes: [],
        hasMailReadApplication: false,
        diagnosis: "No hay cuenta_recepcion configurada para esa empresa.",
      };
    }

    try {
      const token = await getFacturacionAccessToken(cuenta.empresa);
      const claims = inspectGraphTokenClaims(token);
      const email = encodeURIComponent(cuenta.email);

      const userResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${email}?$select=id,userPrincipalName,mail`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const userBody: unknown = await userResponse.json().catch(() => null);
      const userPrincipalName =
        userBody &&
        typeof userBody === "object" &&
        "userPrincipalName" in userBody &&
        typeof userBody.userPrincipalName === "string"
          ? userBody.userPrincipalName
          : undefined;

      const mailboxResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${email}/mailFolders/Inbox?$select=id,displayName`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const diagnosis = diagnoseGraphAccess({
        hasMailReadApplication: claims.hasMailReadApplication,
        userLookupStatus: userResponse.status,
        mailboxLookupStatus: mailboxResponse.status,
      });

      return {
        tokenOk: true,
        tenantId: claims.tenantId,
        appId: claims.appId,
        roles: claims.roles,
        delegatedScopes: claims.delegatedScopes,
        hasMailReadApplication: claims.hasMailReadApplication,
        cuentaRecepcion: cuenta.email,
        userLookupStatus: userResponse.status,
        ...(userPrincipalName ? { userPrincipalName } : {}),
        mailboxLookupStatus: mailboxResponse.status,
        diagnosis,
        ...(mailboxResponse.status !== 200
          ? { rawError: (await mailboxResponse.text()).slice(0, 400) }
          : {}),
      };
    } catch (error) {
      return {
        tokenOk: false,
        roles: [],
        delegatedScopes: [],
        hasMailReadApplication: false,
        cuentaRecepcion: cuenta.email,
        diagnosis: "No se pudo obtener el token de Graph. Revisa MS_TENANT_ID, MS_CLIENT_ID y MS_CLIENT_SECRET.",
        rawError: formatSyncError(error),
      };
    }
  },
});

/**
 * Recupera correos de los últimos 7 días incluso si el watermark normal ya
 * avanzó. La importación es idempotente: el correo se identifica por Graph ID
 * y la factura por CUFE o empresa + número normalizado + NIT.
 */
export const sincronizarBandejaBackfill7Dias = internalAction({
  args: {},
  handler: async (ctx: ActionCtx): Promise<SyncInboxResult> => {
    return await syncInboxImpl(ctx, "backfill", 0, {
      backfillStartIso: computeSevenDayBackfillStartIso(Date.now()),
    });
  },
});

export const sincronizarBandejaProgramada = internalAction({
  args: {},
  handler: async (ctx: ActionCtx): Promise<SyncInboxResult> => {
    if (!backgroundJobsHabilitados()) {
      return {
        synced: 0,
        processed: 0,
        failed: 0,
        total: 0,
        accounts: [],
        skipped: 0,
        skippedAccounts: [],
      };
    }
    return await syncInboxImpl(ctx, "cron");
  },
});

export const sincronizarBandejaContinuacion = internalAction({
  args: { profundidad: v.number() },
  handler: async (ctx: ActionCtx, args: { profundidad: number }): Promise<SyncInboxResult> => {
    return await syncInboxImpl(ctx, "continuacion", args.profundidad);
  },
});

export const sincronizarBandejaBackfillContinuacion = internalAction({
  args: {
    profundidad: v.number(),
    startIso: v.string(),
    continuaciones: v.array(
      v.object({
        email: v.string(),
        empresa: v.number(),
        siguienteUrl: v.string(),
      })
    ),
  },
  handler: async (ctx: ActionCtx, args): Promise<SyncInboxResult> => {
    return await syncInboxImpl(ctx, "backfill", args.profundidad, {
      backfillStartIso: args.startIso,
      backfillContinuations: args.continuaciones,
    });
  },
});

type ReprocesoResult = { processed: number; failed: number; total: number };

async function reprocesarPendientesImpl(ctx: ActionCtx): Promise<ReprocesoResult> {
  const correos: Doc<"facturacionCorreos">[] = await ctx.runQuery(
    internal.facturacionCorreos.listarPendientesParaReproceso,
    { max: REPROCESO_BATCH, maxIntentos: SYNC_MAX_INTENTOS_CORREO }
  );

  const { cuentas } = await getCuentasRecepcion(ctx);
  const tokenPorEmpresa = new Map<number, string>();

  let processed = 0;
  let failed = 0;

  for (const correo of correos) {
    try {
      if (necesitaImportarAdjuntos(correo.attachmentImportStatus)) {
        const empresa = correo.empresa ?? 1;
        const accountEmail =
          correo.cuentaRecepcionEmail ??
          cuentas.find((cuenta) => cuenta.empresa === empresa)?.email;

        if (accountEmail) {
          let token = tokenPorEmpresa.get(empresa);
          if (!token) {
            token = await getFacturacionAccessToken(empresa);
            tokenPorEmpresa.set(empresa, token);
          }
          const importResult = await importAttachmentsForEmail(
            ctx,
            correo.graphMessageId,
            accountEmail,
            token
          );
          if (importResult.errores.length > 0) {
            throw new Error(`Adjuntos con error: ${importResult.errores.join("; ")}`);
          }
        }
      }

      const facturas = await processInvoiceFromCorreo(ctx, correo.graphMessageId);
      processed += facturas.length;

      if (facturas.length === 0) {
        // Sigue pendiente (sin factura ni omisión): contar el intento para no
        // reintentar indefinidamente.
        await ctx.runMutation(internal.facturacionCorreos.registrarIntentoProcesamiento, {
          graphMessageId: correo.graphMessageId,
        });
      }
    } catch (error) {
      failed += 1;
      console.error("[facturacionGraph] Error reprocesando correo", error);
      await ctx.runMutation(internal.facturacionCorreos.registrarIntentoProcesamiento, {
        graphMessageId: correo.graphMessageId,
        error: formatSyncError(error),
      });
    }
  }

  return { processed, failed, total: correos.length };
}

export const reprocesarPendientes = internalAction({
  args: {},
  handler: async (ctx: ActionCtx): Promise<ReprocesoResult> => {
    return await reprocesarPendientesImpl(ctx);
  },
});

export const reprocesarPendientesProgramada = internalAction({
  args: {},
  handler: async (ctx: ActionCtx): Promise<ReprocesoResult & { alertas: number }> => {
    if (!backgroundJobsHabilitados()) {
      return { processed: 0, failed: 0, total: 0, alertas: 0 };
    }
    const resultado = await reprocesarPendientesImpl(ctx);
    const alertas = await verificarSaludIngesta(ctx);
    return { ...resultado, alertas };
  },
});

/** Reintenta un correo puntual desde la UI (reinicia el contador de intentos). */
export const reprocesarCorreo = action({
  args: { correoId: v.id("facturacionCorreos") },
  handler: async (
    ctx: ActionCtx,
    args: { correoId: Id<"facturacionCorreos"> }
  ): Promise<{ ok: boolean; facturas: number; error?: string }> => {
    await ctx.runQuery(internal.users.assertPermisoActor, { permisos: ["billing/emails"] });
    const correo: Doc<"facturacionCorreos"> | null = await ctx.runQuery(
      internal.facturacionCorreos.getByIdInterno,
      { correoId: args.correoId }
    );
    if (!correo) return { ok: false, facturas: 0, error: "Correo no encontrado" };
    if (correo.procesado && correo.facturaId) {
      return { ok: true, facturas: 0 };
    }

    await ctx.runMutation(internal.facturacionCorreos.reiniciarIntentos, {
      correoId: args.correoId,
    });

    try {
      const empresa = correo.empresa ?? 1;
      const { cuentas } = await getCuentasRecepcion(ctx);
      const accountEmail =
        correo.cuentaRecepcionEmail ?? cuentas.find((cuenta) => cuenta.empresa === empresa)?.email;

      if (accountEmail && necesitaImportarAdjuntos(correo.attachmentImportStatus)) {
        const token = await getFacturacionAccessToken(empresa);
        const importResult = await importAttachmentsForEmail(
          ctx,
          correo.graphMessageId,
          accountEmail,
          token
        );
        if (importResult.errores.length > 0) {
          throw new Error(`Adjuntos con error: ${importResult.errores.join("; ")}`);
        }
      }

      const facturas = await processInvoiceFromCorreo(ctx, correo.graphMessageId);
      return { ok: true, facturas: facturas.length };
    } catch (error) {
      const mensaje = formatSyncError(error);
      await ctx.runMutation(internal.facturacionCorreos.registrarIntentoProcesamiento, {
        graphMessageId: correo.graphMessageId,
        error: mensaje,
      });
      return { ok: false, facturas: 0, error: mensaje };
    }
  },
});

/**
 * Alerta a los destinatarios de FACTURACION_GRAPH_MAILBOXES cuando hay correos
 * sin procesar con más de una hora de antigüedad.
 */
async function verificarSaludIngesta(ctx: ActionCtx): Promise<number> {
  const ahora = Date.now();
  const viejos: Doc<"facturacionCorreos">[] = await ctx.runQuery(
    internal.facturacionCorreos.listarPendientesViejos,
    { edadMinimaMs: ALERTA_EDAD_MINIMA_MS, ahora, max: 50 }
  );
  if (viejos.length === 0) return 0;

  const secret = process.env.FACTURACION_SLA_DIGEST_SECRET;
  const baseUrl = frontendUrl();
  if (!secret) {
    console.warn(
      "[facturacionGraph] FACTURACION_SLA_DIGEST_SECRET no configurado; alerta de ingesta omitida"
    );
    return 0;
  }
  const destinatarios = facturacionGraphMailboxes();
  if (destinatarios.length === 0) {
    console.warn(
      "[facturacionGraph] FACTURACION_GRAPH_MAILBOXES no configurado; alerta de ingesta omitida"
    );
    return 0;
  }

  const porCuenta = new Map<string, Doc<"facturacionCorreos">[]>();
  for (const correo of viejos) {
    const key = (correo.cuentaRecepcionEmail ?? "desconocida").toLowerCase();
    const grupo = porCuenta.get(key) ?? [];
    grupo.push(correo);
    porCuenta.set(key, grupo);
  }

  let alertas = 0;

  for (const [cuentaEmail, correos] of porCuenta) {
    const empresa = correos[0]?.empresa ?? 1;

    const cuentaSync: Doc<"facturacionSyncCuentas"> | null = await ctx.runQuery(
      internal.facturacionSync.getCuentaSync,
      {
        email: cuentaEmail,
      }
    );
    if (cuentaSync?.ultimaAlertaEn && ahora - cuentaSync.ultimaAlertaEn < ALERTA_COOLDOWN_MS) {
      continue;
    }

    try {
      const body = JSON.stringify({
        cuentaEmail,
        empresa,
        destinatarios,
        dashboardUrl: `${baseUrl}/billing/emails`,
        pendientes: correos.slice(0, 25).map((correo) => ({
          subject: correo.subject,
          from: correo.from,
          receivedDateTime: correo.receivedDateTime,
          intentos: correo.intentosProcesamiento ?? 0,
          ultimoError: correo.ultimoError ?? null,
        })),
        totalPendientes: correos.length,
      });
      const timestamp = String(Date.now());
      const signature = await firmarPayloadSync(body, timestamp, secret);
      const respuesta = await fetch(`${baseUrl}/api/notifications/billing/sync-alerta`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Facturacion-Timestamp": timestamp,
          "X-Facturacion-Signature": signature,
        },
        body,
      });
      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`);
      }
      await ctx.runMutation(internal.facturacionSync.marcarAlertaEnviada, {
        email: cuentaEmail,
        empresa,
      });
      alertas += 1;
    } catch (error) {
      console.error(`[facturacionGraph] Error enviando alerta de ingesta (${cuentaEmail})`, error);
    }
  }

  return alertas;
}

async function firmarPayloadSync(body: string, timestamp: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`)
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

export const reprocesarSoportesDeFactura = internalAction({
  args: { facturaId: v.id("facturacionFacturas") },
  handler: async (
    ctx: ActionCtx,
    args: { facturaId: Id<"facturacionFacturas"> }
  ): Promise<{
    ok: boolean;
    razon?: string;
    soportesNombre?: string;
    soportesArchivos?: string[];
  }> => {
    const factura: Doc<"facturacionFacturas"> | null = await ctx.runQuery(
      internal.facturacionFacturas.getByIdInterno,
      { facturaId: args.facturaId }
    );
    if (!factura) return { ok: false, razon: "Factura no encontrada" };
    if (!factura.emailId) {
      return { ok: false, razon: "Factura sin correo asociado" };
    }

    const correo: Doc<"facturacionCorreos"> | null = await ctx.runQuery(
      internal.facturacionCorreos.getByIdInterno,
      { correoId: factura.emailId }
    );
    if (!correo) return { ok: false, razon: "Correo no encontrado" };

    const attachments = correo.attachments ?? [];

    let pdfStorageIdCorrecto = factura.pdfStorageId;
    if (factura.xmlStorageId) {
      const xmlAttachment = attachments.find((a) => a.storageId === factura.xmlStorageId);
      if (xmlAttachment) {
        const pdfCorrecto = pickPdfDeFactura(attachments, xmlAttachment);
        if (pdfCorrecto && pdfCorrecto.storageId !== factura.pdfStorageId) {
          await ctx.runMutation(internal.facturacionFacturas.patchPdfStorageId, {
            facturaId: args.facturaId,
            pdfStorageId: pdfCorrecto.storageId,
          });
          pdfStorageIdCorrecto = pdfCorrecto.storageId;
        }
      }
    }

    const invoiceStorageIds = new Set<string>();
    if (factura.xmlStorageId) {
      invoiceStorageIds.add(factura.xmlStorageId as unknown as string);
    }
    if (pdfStorageIdCorrecto) {
      invoiceStorageIds.add(pdfStorageIdCorrecto as unknown as string);
    }

    const soportes = buscarSoportesEnCorreo(attachments, invoiceStorageIds);
    if (soportes.length === 0) {
      return {
        ok: false,
        razon: "El correo no tiene adjuntos clasificables como soportes",
      };
    }

    const empaquetado = await empaquetarSoportes(ctx, soportes, factura.numeroFactura);
    if (!empaquetado) {
      return {
        ok: false,
        razon: "No se pudieron leer los soportes desde storage",
      };
    }

    await ctx.runMutation(internal.facturacionFacturas.patchSoportes, {
      facturaId: args.facturaId,
      soportesStorageId: empaquetado.storageId,
      soportesNombre: empaquetado.nombre,
    });

    return {
      ok: true,
      soportesNombre: empaquetado.nombre,
      soportesArchivos: soportes.map((s) => s.name),
    };
  },
});

export const processUploadedXml = action({
  args: {
    xmlStorageId: v.id("_storage"),
    pdfStorageId: v.optional(v.id("_storage")),
    empresa: v.optional(v.number()),
    categoria: v.union(v.literal("tecnologia"), v.literal("administracion"), v.literal("otro")),
  },
  handler: async (
    ctx: ActionCtx,
    args: ProcessUploadedXmlArgs
  ): Promise<ProcessUploadedXmlResult> => {
    await ctx.runQuery(internal.users.assertPermisoActor, { permisos: ["billing/invoices"] });
    const xmlBlob = await ctx.storage.get(args.xmlStorageId);
    if (!xmlBlob) {
      throw new Error("No se pudo leer el XML cargado");
    }

    const parsed = parseDianXml(await xmlBlob.text());
    const empresa = getEmpresaByNit(parsed.clienteNit);
    if (!empresa) {
      throw new Error(
        `El XML no corresponde a una empresa configurada. NIT cliente: ${parsed.clienteNit || "sin NIT"}.`
      );
    }
    const facturaId: Id<"facturacionFacturas"> = await ctx.runMutation(
      internal.facturacionFacturas.crearDesdeXml,
      buildFacturaPayload({
        empresa,
        parsed,
        xmlStorageId: args.xmlStorageId,
        pdfStorageId: args.pdfStorageId,
        origen: "carga_manual",
      })
    );

    const esPeaje = isPeajesProveedorNit(parsed.proveedorNit);
    if (!esPeaje) {
      await ctx.runMutation(internal.facturacionTareas.crearDesdeFacturaInterno, {
        facturaId,
        empresa,
        categoria: args.categoria,
      });
    }

    return {
      facturaId,
      esPeaje,
      tareaCreada: !esPeaje,
      parsed: {
        numeroFactura: parsed.numeroFactura,
        clienteNit: parsed.clienteNit,
        proveedorNombre: parsed.proveedorNombre,
        proveedorNit: parsed.proveedorNit,
        total: parsed.total,
        moneda: parsed.moneda,
        fechaEmision: parsed.fechaEmision,
        descripcion: parsed.descripcion,
        lineasCount: parsed.lineas.length,
        referenciaDocumento: parsed.referenciaDocumento,
        referenciaCufe: parsed.referenciaCufe,
      },
    };
  },
});
