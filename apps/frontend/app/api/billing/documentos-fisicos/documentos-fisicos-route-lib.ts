import type { BillingSession as Session } from "@/lib/billing-session";

import type { Id } from "@/convex/_generated/dataModel";
import { hasGlobalEmpresaAccess } from "@/lib/empresas";

export type CrearDocumentoFisicoInput = {
  empresa: number;
  numeroFactura: string;
  proveedorNit: string;
  proveedorNombre: string;
  fechaEmision: string;
  fechaVencimiento?: string;
  subtotal: number;
  impuestos: number;
  total?: number;
  totalManual?: boolean;
  moneda: string;
  descripcion: string;
  categoria: "administracion" | "tecnologia" | "otro";
  soporteStorageId: Id<"_storage">;
  soporteNombre: string;
  soporteMimeType?: string;
  soporteSize?: number;
};

const FORBIDDEN_BODY_KEYS = [
  "secret",
  "actorUserId",
  "actorNombre",
  "actorEmail",
  "actorEsLiderProceso",
  "actorProcesoId",
  "actorProcesoNombre",
] as const;

const CATEGORIAS = new Set(["administracion", "tecnologia", "otro"]);

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  return false;
}

function parseString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function assertNoActorFields(body: Record<string, unknown>) {
  for (const key of FORBIDDEN_BODY_KEYS) {
    if (key in body && body[key] !== undefined) {
      throw new Error("No envíes datos de actor ni credenciales en el cuerpo.");
    }
  }
}

export function assertEmpresaAutorizada(session: Session, empresaId: number) {
  const canAll = hasGlobalEmpresaAccess(
    session.user?.id_rol ?? 0,
    session.user?.acceso_todas_empresas,
  );
  if (canAll) return;
  const empresas = session.user?.empresas ?? [];
  if (!empresas.includes(empresaId)) {
    throw new Error("Empresa no autorizada");
  }
}

export function parseCrearDocumentoFisicoBody(body: unknown): CrearDocumentoFisicoInput {
  if (!body || typeof body !== "object") {
    throw new Error("Cuerpo de solicitud inválido.");
  }

  const row = body as Record<string, unknown>;
  assertNoActorFields(row);

  const empresa = parseNumber(row.empresa);
  const subtotal = parseNumber(row.subtotal);
  const impuestos = parseNumber(row.impuestos);
  const totalManual = parseBoolean(row.totalManual);
  const total = row.total === undefined ? undefined : parseNumber(row.total);
  const categoria = parseString(row.categoria);
  const soporteStorageId = parseString(row.soporteStorageId);

  if (empresa === null) throw new Error("Selecciona una empresa válida.");
  if (subtotal === null || impuestos === null) {
    throw new Error("Ingresa subtotal e impuestos válidos.");
  }
  if (totalManual && total === null) {
    throw new Error("Ingresa un total válido.");
  }
  if (!CATEGORIAS.has(categoria)) {
    throw new Error("Selecciona una categoría válida.");
  }
  if (!soporteStorageId) {
    throw new Error("Adjunta el soporte del documento físico.");
  }

  const numeroFactura = parseString(row.numeroFactura);
  const proveedorNit = parseString(row.proveedorNit);
  const proveedorNombre = parseString(row.proveedorNombre);
  const fechaEmision = parseString(row.fechaEmision);
  const moneda = parseString(row.moneda) || "COP";
  const descripcion = parseString(row.descripcion);
  const soporteNombre = parseString(row.soporteNombre);

  if (!numeroFactura) throw new Error("Completa el número de factura.");
  if (!proveedorNit) throw new Error("Completa el NIT del proveedor.");
  if (!proveedorNombre) throw new Error("Completa el nombre del proveedor.");
  if (!fechaEmision) throw new Error("Selecciona la fecha de emisión.");
  if (!descripcion) throw new Error("Completa la descripción.");
  if (!soporteNombre) throw new Error("Indica el nombre del soporte.");

  const fechaVencimientoRaw = parseString(row.fechaVencimiento);
  const soporteMimeTypeRaw = parseString(row.soporteMimeType);
  const soporteSize = row.soporteSize === undefined ? undefined : parseNumber(row.soporteSize);

  return {
    empresa,
    numeroFactura,
    proveedorNit,
    proveedorNombre,
    fechaEmision,
    ...(fechaVencimientoRaw ? { fechaVencimiento: fechaVencimientoRaw } : {}),
    subtotal,
    impuestos,
    ...(totalManual && total !== null ? { total, totalManual: true } : {}),
    moneda,
    descripcion,
    categoria: categoria as CrearDocumentoFisicoInput["categoria"],
    soporteStorageId: soporteStorageId as Id<"_storage">,
    soporteNombre,
    ...(soporteMimeTypeRaw ? { soporteMimeType: soporteMimeTypeRaw } : {}),
    ...(soporteSize !== null && soporteSize !== undefined ? { soporteSize } : {}),
  };
}

export function resolveActorProceso(session: Session) {
  const actorProcesoId = session.user.id_proceso ?? session.user.proceso?.id ?? undefined;
  const actorProcesoNombre = session.user.proceso?.nombre?.trim() || undefined;
  return { actorProcesoId, actorProcesoNombre };
}
