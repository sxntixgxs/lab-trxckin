import type { BillingSession as Session } from "@/lib/billing-session";
import type {
  CruceDocumentoInternoInput,
  CruceDocumentoInternoResumen,
  EditCruceDocumentoInternoInput,
  RetirarCruceDocumentoInternoInput,
} from "@/app/(default)/billing/lib/cruces-documentos-internos";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexServer } from "@/lib/convexServerClient";
import { hasGlobalEmpresaAccess } from "@/lib/empresas";

export function assertEmpresaAutorizada(session: Session, empresaId: number) {
  const canAll = hasGlobalEmpresaAccess(
    session.user.id_rol ?? 0,
    session.user.acceso_todas_empresas
  );
  if (canAll) return;
  const permitted = new Set(session.user.empresas ?? []);
  if (!permitted.has(empresaId)) {
    throw new Error("Empresa no autorizada");
  }
}

export function resolveActorFromSession(session: Session) {
  const actorUserId = session.user.id?.trim();
  const actorNombre = session.user.nombre?.trim() || "Usuario";
  const actorEmail = session.user.email?.trim().toLowerCase() || "";
  if (!actorUserId) {
    throw new Error("No se pudo identificar al usuario de la sesión.");
  }
  return { actorUserId, actorNombre, actorEmail };
}

export async function obtenerResumenCrucesInternosFactura(args: {
  secret: string;
  facturaId: Id<"facturacionFacturas">;
  actorUserId: string;
  actorEmail: string;
  asignacionId?: Id<"facturacionAsignaciones">;
  cursor?: string | null;
  limit?: number;
}) {
  return (await convexServer.query(
    api.facturacionCrucesDocumentosInternos.obtenerResumenCrucesInternosDesdeServidor,
    {
      secret: args.secret,
      facturaId: args.facturaId,
      actorUserId: args.actorUserId,
      actorEmail: args.actorEmail,
      ...(args.asignacionId ? { asignacionId: args.asignacionId } : {}),
      paginationOpts: {
        numItems: args.limit ?? 50,
        cursor: args.cursor ?? null,
      },
    }
  )) as CruceDocumentoInternoResumen & { empresa: number };
}

export async function agregarCruceDocumentoInternoFactura(args: {
  secret: string;
  facturaId: Id<"facturacionFacturas">;
  actorUserId: string;
  actorNombre: string;
  actorEmail: string;
  input: CruceDocumentoInternoInput;
}) {
  return await convexServer.mutation(
    api.facturacionCrucesDocumentosInternos.agregarCruceDocumentoInternoDesdeServidor,
    {
      secret: args.secret,
      facturaId: args.facturaId,
      asignacionId: args.input.asignacionId,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      numeroDocumento: args.input.numeroDocumento,
      valorAplicado: args.input.valorAplicado,
      comentario: args.input.comentario,
    }
  );
}

export async function editarCruceDocumentoInternoFactura(args: {
  secret: string;
  facturaId: Id<"facturacionFacturas">;
  actorUserId: string;
  actorNombre: string;
  actorEmail: string;
  input: EditCruceDocumentoInternoInput;
}) {
  return await convexServer.mutation(
    api.facturacionCrucesDocumentosInternos.editarCruceDocumentoInternoDesdeServidor,
    {
      secret: args.secret,
      facturaId: args.facturaId,
      asignacionId: args.input.asignacionId,
      cruceId: args.input.cruceId,
      expectedActualizadoEn: args.input.expectedActualizadoEn,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      numeroDocumento: args.input.numeroDocumento,
      valorAplicado: args.input.valorAplicado,
      comentario: args.input.comentario,
    }
  );
}

export async function retirarCruceDocumentoInternoFactura(args: {
  secret: string;
  facturaId: Id<"facturacionFacturas">;
  actorUserId: string;
  actorNombre: string;
  actorEmail: string;
  input: RetirarCruceDocumentoInternoInput;
}) {
  return await convexServer.mutation(
    api.facturacionCrucesDocumentosInternos.retirarCruceDocumentoInternoDesdeServidor,
    {
      secret: args.secret,
      facturaId: args.facturaId,
      asignacionId: args.input.asignacionId,
      cruceId: args.input.cruceId,
      expectedActualizadoEn: args.input.expectedActualizadoEn,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.input.comentario,
    }
  );
}

export function validateAgregarCruceDocumentoInternoInput(
  body: unknown
): CruceDocumentoInternoInput {
  if (!body || typeof body !== "object") {
    throw new Error("Cuerpo de solicitud inválido.");
  }
  const row = body as Record<string, unknown>;
  if (typeof row.asignacionId !== "string" || !row.asignacionId.trim()) {
    throw new Error("Indica la asignación activa.");
  }
  if (typeof row.numeroDocumento !== "string" || !row.numeroDocumento.trim()) {
    throw new Error("Indica el número de factura o cuenta de cobro.");
  }
  if (typeof row.valorAplicado !== "number" || !Number.isFinite(row.valorAplicado)) {
    throw new Error("Indica un valor aplicado válido.");
  }
  return {
    asignacionId: row.asignacionId as Id<"facturacionAsignaciones">,
    numeroDocumento: row.numeroDocumento,
    valorAplicado: row.valorAplicado,
    comentario: typeof row.comentario === "string" ? row.comentario : undefined,
  };
}

export function validateEditarCruceDocumentoInternoInput(
  body: unknown
): EditCruceDocumentoInternoInput {
  if (!body || typeof body !== "object") {
    throw new Error("Cuerpo de solicitud inválido.");
  }
  const row = body as Record<string, unknown>;
  if (typeof row.asignacionId !== "string" || !row.asignacionId.trim()) {
    throw new Error("Indica la asignación activa.");
  }
  if (typeof row.cruceId !== "string" || !row.cruceId.trim()) {
    throw new Error("Indica el documento interno a editar.");
  }
  if (typeof row.expectedActualizadoEn !== "number" || !Number.isFinite(row.expectedActualizadoEn)) {
    throw new Error("Indica la versión esperada del documento.");
  }
  if (typeof row.numeroDocumento !== "string" || !row.numeroDocumento.trim()) {
    throw new Error("Indica el número de factura o cuenta de cobro.");
  }
  if (typeof row.valorAplicado !== "number" || !Number.isFinite(row.valorAplicado)) {
    throw new Error("Indica un valor aplicado válido.");
  }
  return {
    asignacionId: row.asignacionId as Id<"facturacionAsignaciones">,
    cruceId: row.cruceId as Id<"facturacionCrucesDocumentosInternos">,
    expectedActualizadoEn: row.expectedActualizadoEn,
    numeroDocumento: row.numeroDocumento,
    valorAplicado: row.valorAplicado,
    comentario: typeof row.comentario === "string" ? row.comentario : undefined,
  };
}

export function validateRetirarCruceDocumentoInternoInput(
  body: unknown
): RetirarCruceDocumentoInternoInput {
  if (!body || typeof body !== "object") {
    throw new Error("Cuerpo de solicitud inválido.");
  }
  const row = body as Record<string, unknown>;
  if (typeof row.asignacionId !== "string" || !row.asignacionId.trim()) {
    throw new Error("Indica la asignación activa.");
  }
  if (typeof row.cruceId !== "string" || !row.cruceId.trim()) {
    throw new Error("Indica el documento interno a retirar.");
  }
  if (typeof row.expectedActualizadoEn !== "number" || !Number.isFinite(row.expectedActualizadoEn)) {
    throw new Error("Indica la versión esperada del documento.");
  }
  return {
    asignacionId: row.asignacionId as Id<"facturacionAsignaciones">,
    cruceId: row.cruceId as Id<"facturacionCrucesDocumentosInternos">,
    expectedActualizadoEn: row.expectedActualizadoEn,
    comentario: typeof row.comentario === "string" ? row.comentario : undefined,
  };
}
