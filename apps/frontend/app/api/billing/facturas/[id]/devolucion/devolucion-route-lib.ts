import type { BillingSession as Session } from "@/lib/billing-session";
import { env } from "process";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexServer } from "@/lib/convexServerClient";
import { hasGlobalEmpresaAccess } from "@/lib/empresas";

type DevolucionUsuario = {
  usuarioId?: string;
  nombre: string;
  email: string;
  procesoId?: number;
  procesoNombre?: string;
};

type DevolucionDestinoContexto = {
  fase: string;
  label: string;
  responsableHistorico?: DevolucionUsuario | null;
  candidatos?: DevolucionUsuario[];
  requiereSeleccionResponsable: boolean;
};

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseBooleanFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

function getUsuarioEmpresaIds(row: Record<string, unknown>) {
  const ids = new Set<number>();
  const primary =
    parseNumber(row.id_empresa) ??
    parseNumber(row.idEmpresa) ??
    parseNumber(row.empresaId) ??
    parseNumber(
      typeof row.empresa === "object" && row.empresa
        ? (row.empresa as Record<string, unknown>).id
        : null
    );
  if (primary !== null) ids.add(primary);

  const links = Array.isArray(row.empresas)
    ? row.empresas
    : Array.isArray(row.usuarioEmpresas)
      ? row.usuarioEmpresas
      : [];
  for (const link of links) {
    if (typeof link === "number" || typeof link === "string") {
      const id = parseNumber(link);
      if (id !== null) ids.add(id);
      continue;
    }
    if (!link || typeof link !== "object") continue;
    const linkRow = link as Record<string, unknown>;
    const id =
      parseNumber(linkRow.id_empresa) ??
      parseNumber(linkRow.idEmpresa) ??
      parseNumber(
        typeof linkRow.empresa === "object" && linkRow.empresa
          ? (linkRow.empresa as Record<string, unknown>).id
          : null
      );
    if (id !== null) ids.add(id);
  }

  return [...ids];
}

function usuarioAsignableParaEmpresa(row: Record<string, unknown>, empresaId: number) {
  if (parseBooleanFlag(row.acceso_todas_empresas ?? row.accesoTodasEmpresas)) {
    return true;
  }
  return getUsuarioEmpresaIds(row).includes(empresaId);
}

function normalizeUsuarioFacturacion(row: Record<string, unknown>): DevolucionUsuario | null {
  const nombre = typeof row.nombre === "string" ? row.nombre.trim() : "";
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  const rawUsuarioId = row.id ?? row.idUsuario ?? row.usuarioId;
  const usuarioId =
    (typeof rawUsuarioId === "string" || typeof rawUsuarioId === "number") &&
    String(rawUsuarioId).trim()
      ? String(rawUsuarioId).trim()
      : undefined;
  if (!nombre || !email) return null;
  const procesoUsuario =
    row.procesoUsuario && typeof row.procesoUsuario === "object"
      ? (row.procesoUsuario as Record<string, unknown>)
      : null;
  const procesoId = parseNumber(row.id_proceso ?? row.procesoId ?? procesoUsuario?.id);
  const procesoNombre =
    typeof row.proceso === "string"
      ? row.proceso
      : typeof row.procesoNombre === "string"
        ? row.procesoNombre
        : typeof procesoUsuario?.nombre === "string"
          ? procesoUsuario.nombre
          : undefined;
  return {
    usuarioId,
    nombre,
    email,
    ...(procesoId !== null ? { procesoId } : {}),
    ...(procesoNombre ? { procesoNombre } : {}),
  };
}

async function fetchBackendJson(path: string, authorization?: string) {
  const backendUrl = env.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("BACKEND_URL no configurado");
  }

  const response = await fetch(`${backendUrl}${path}`, {
    headers: authorization ? { Authorization: authorization } : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Error al consultar usuarios (${response.status})`);
  }
  return (await response.json()) as unknown;
}

export async function fetchLideresActivosParaEmpresa(args: {
  empresaId: number;
  authorization?: string;
}) {
  const raw = await fetchBackendJson("/api/v1/usuarios/directorio", args.authorization);
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { usuarios?: unknown[] }).usuarios)
      ? ((raw as { usuarios: unknown[] }).usuarios ?? [])
      : Array.isArray((raw as { data?: unknown[] }).data)
        ? ((raw as { data: unknown[] }).data ?? [])
        : [];

  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .filter(
      (row) => row.activo === undefined || row.activo === null || parseBooleanFlag(row.activo)
    )
    .filter((row) => parseBooleanFlag(row.lider_proceso ?? row.liderProceso))
    .filter((row) => usuarioAsignableParaEmpresa(row, args.empresaId))
    .map(normalizeUsuarioFacturacion)
    .filter((row): row is DevolucionUsuario => row !== null)
    .sort((left, right) => left.nombre.localeCompare(right.nombre, "es", { sensitivity: "base" }));
}

export async function resolveResponsableDevolucion(args: {
  responsableId: string;
  faseDestino: string;
  empresaId: number;
  authorization?: string;
}) {
  const raw = await fetchBackendJson(
    `/api/v1/usuarios/${encodeURIComponent(args.responsableId)}`,
    args.authorization
  );
  if (!raw || typeof raw !== "object") {
    throw new Error("Responsable no encontrado.");
  }
  const row = raw as Record<string, unknown>;
  if (parseBooleanFlag(row.activo) === false) {
    throw new Error("El responsable seleccionado no está activo.");
  }
  if (!usuarioAsignableParaEmpresa(row, args.empresaId)) {
    throw new Error("El responsable no está habilitado para esta empresa.");
  }
  const usuario = normalizeUsuarioFacturacion(row);
  if (!usuario?.usuarioId) {
    throw new Error("Responsable no válido.");
  }
  if (
    args.faseDestino === "revision_lider" &&
    !parseBooleanFlag(row.lider_proceso ?? row.liderProceso)
  ) {
    throw new Error("Selecciona un líder activo para esta devolución.");
  }
  return usuario;
}

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

export async function obtenerContextoDevolucionFactura(args: {
  secret: string;
  facturaId: Id<"facturacionFacturas">;
  authorization?: string;
}) {
  const contexto = await convexServer.query(
    api.facturacionTareas.obtenerContextoDevolucionDesdeServidor,
    {
      secret: args.secret,
      facturaId: args.facturaId,
    }
  );

  if (!contexto.puedeDevolver) {
    return contexto;
  }

  const lideres = await fetchLideresActivosParaEmpresa({
    empresaId: contexto.empresa,
    authorization: args.authorization,
  });

  const destinos = contexto.destinos.map((destino: DevolucionDestinoContexto) => {
    if (destino.fase !== "revision_lider" || destino.responsableHistorico) {
      return destino;
    }
    return {
      ...destino,
      candidatos: lideres,
      requiereSeleccionResponsable: lideres.length > 0,
    };
  });

  return {
    ...contexto,
    destinos,
  };
}
