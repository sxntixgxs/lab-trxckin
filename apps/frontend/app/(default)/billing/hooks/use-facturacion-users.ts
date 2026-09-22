"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

export type FacturacionUsuario = {
  id: string;
  nombre: string;
  email: string;
  cedula: string;
  cargo: string;
  telf: string;
  id_proceso: number | null;
  proceso: string;
  lider_proceso: boolean;
  id_jefe_directo?: string | null;
  id_jefe_supremo?: string | null;
  activo: boolean;
  id_empresa?: number | null;
  empresas?: number[];
  acceso_todas_empresas?: boolean;
};

const PROCESO_GESTION_FINANCIERA_ID = 42;
const FACTURACION_USERS_STALE_TIME = 60_000;

export function normalizeProcesoNombre(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function esProcesoGestionFinanciera(nombre?: string | null) {
  return normalizeProcesoNombre(nombre ?? "").includes("GESTION FINANCIERA");
}

function readNombre(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "nombre" in value) {
    const nombre = (value as { nombre?: unknown }).nombre;
    return typeof nombre === "string" ? nombre : "";
  }
  return "";
}

type UseFacturacionUsersOptions = {
  empresaId?: number | null;
  includeGlobalAccess?: boolean;
  enabled?: boolean;
};

function parseProcesoId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

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

function getUsuarioEmpresaId(row: Record<string, unknown>) {
  return (
    parseNumber(row.id_empresa) ??
    parseNumber(row.idEmpresa) ??
    parseNumber(row.empresaId) ??
    parseNumber(
      typeof row.empresa === "object" && row.empresa
        ? (row.empresa as Record<string, unknown>).id
        : null,
    )
  );
}

function getUsuarioEmpresaIds(row: Record<string, unknown>) {
  const ids = new Set<number>();
  const primary = getUsuarioEmpresaId(row);
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
          : null,
      );
    if (id !== null) ids.add(id);
  }

  return [...ids];
}

function normalizeUsuariosPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const row = data as Record<string, unknown>;
  if (Array.isArray(row.usuarios)) return row.usuarios;
  if (Array.isArray(row.data)) return row.data;
  return [];
}

export function normalizarUsuario(raw: unknown): FacturacionUsuario | null {
  if (!raw || typeof raw !== "object") return null;

  const row = raw as Record<string, unknown>;
  const id = row.id != null ? String(row.id) : "";
  const nombre = typeof row.nombre === "string" ? row.nombre : "";
  const email = typeof row.email === "string" ? row.email.toLowerCase() : "";

  if (!id || !nombre || !email) return null;

  const procesoNombre =
    readNombre(row.proceso) ||
    readNombre(row.procesoUsuario);

  return {
    id,
    nombre,
    email,
    cedula: row.cedula != null ? String(row.cedula) : "",
    cargo: typeof row.cargo === "string" ? row.cargo : "",
    telf: typeof row.telf === "string" ? row.telf : "",
    id_proceso:
      parseProcesoId(row.id_proceso) ??
      parseProcesoId(
        typeof row.procesoUsuario === "object" && row.procesoUsuario
          ? (row.procesoUsuario as Record<string, unknown>).id
          : null,
      ),
    proceso: procesoNombre,
    lider_proceso: parseBooleanFlag(row.lider_proceso),
    id_jefe_directo:
      row.id_jefe_directo != null && String(row.id_jefe_directo).trim() !== ""
        ? String(row.id_jefe_directo)
        : null,
    id_jefe_supremo:
      row.id_jefe_supremo != null && String(row.id_jefe_supremo).trim() !== ""
        ? String(row.id_jefe_supremo)
        : null,
    activo:
      row.activo === undefined || row.activo === null
        ? true
        : parseBooleanFlag(row.activo),
    id_empresa: getUsuarioEmpresaId(row),
    empresas: getUsuarioEmpresaIds(row),
    acceso_todas_empresas: parseBooleanFlag(
      row.acceso_todas_empresas ?? row.accesoTodasEmpresas,
    ),
  };
}

export function mergeFacturacionUsuarios(
  ...groups: Array<FacturacionUsuario[] | undefined>
) {
  const byKey = new Map<string, FacturacionUsuario>();

  for (const group of groups) {
    for (const usuario of group ?? []) {
      const key = usuario.id || usuario.email.trim().toLowerCase();
      if (!key || byKey.has(key)) continue;
      byKey.set(key, usuario);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
  );
}

function getFacturacionUsersQueryKey(options: UseFacturacionUsersOptions = {}) {
  const empresaId =
    typeof options.empresaId === "number" && Number.isFinite(options.empresaId)
      ? options.empresaId
      : null;
  return [
    "facturacion-users",
    {
      empresaId,
      includeGlobalAccess: options.includeGlobalAccess === true,
    },
  ] as const;
}

export function buildFacturacionUsersSearchParams(
  options: UseFacturacionUsersOptions = {},
) {
  const params = new URLSearchParams({ limit: "5000" });
  if (
    typeof options.empresaId === "number" &&
    Number.isFinite(options.empresaId)
  ) {
    params.set("empresaId", String(options.empresaId));
  }
  if (options.includeGlobalAccess) {
    params.set("includeGlobalAccess", "true");
  }
  return params;
}

async function fetchFacturacionUsers(options: UseFacturacionUsersOptions = {}) {
  const params = buildFacturacionUsersSearchParams(options);

  const response = await fetch(`/api/usuarios/directorio?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("No se pudo cargar el directorio de usuarios");
  }
  const data: unknown = await response.json();
  return normalizeUsuariosPayload(data)
    .map(normalizarUsuario)
    .filter((usuario): usuario is FacturacionUsuario => usuario !== null);
}

export function esUsuarioFinanzas(usuario: FacturacionUsuario) {
  return (
    usuario.activo &&
    (usuario.id_proceso === PROCESO_GESTION_FINANCIERA_ID ||
      esProcesoGestionFinanciera(usuario.proceso))
  );
}

export function useFacturacionUsers(options: UseFacturacionUsersOptions = {}) {
  const empresaId =
    typeof options.empresaId === "number" && Number.isFinite(options.empresaId)
      ? options.empresaId
      : null;
  const enabled =
    options.enabled !== false && (!options.includeGlobalAccess || empresaId !== null);
  const query = useQuery({
    queryKey: getFacturacionUsersQueryKey({ ...options, empresaId }),
    queryFn: () => fetchFacturacionUsers({ ...options, empresaId }),
    enabled,
    staleTime: FACTURACION_USERS_STALE_TIME,
  });

  const usuarios = useMemo(
    () =>
      [...(query.data ?? [])].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
      ),
    [query.data],
  );

  const lideres = useMemo(
    () => usuarios.filter((usuario) => usuario.activo && usuario.lider_proceso),
    [usuarios],
  );

  const usuariosFinanzas = useMemo(
    () => usuarios.filter(esUsuarioFinanzas),
    [usuarios],
  );

  return {
    usuarios,
    lideres,
    usuariosFinanzas,
    isLoading: query.isLoading,
  };
}

export function useFacturacionUsersByEmpresa(
  empresas: number[],
  options: Pick<UseFacturacionUsersOptions, "includeGlobalAccess" | "enabled"> = {},
) {
  const empresasNormalizadas = useMemo(
    () =>
      Array.from(
        new Set(
          empresas.filter((empresa) => Number.isFinite(empresa) && empresa > 0),
        ),
      ).sort((a, b) => a - b),
    [empresas],
  );
  const enabled = options.enabled !== false;
  const queries = useQueries({
    queries: empresasNormalizadas.map((empresaId) => ({
      queryKey: getFacturacionUsersQueryKey({
        empresaId,
        includeGlobalAccess: options.includeGlobalAccess,
      }),
      queryFn: () =>
        fetchFacturacionUsers({
          empresaId,
          includeGlobalAccess: options.includeGlobalAccess,
        }),
      enabled,
      staleTime: FACTURACION_USERS_STALE_TIME,
    })),
  });

  const usuariosPorEmpresa = useMemo(() => {
    const out: Record<number, FacturacionUsuario[]> = {};
    empresasNormalizadas.forEach((empresaId, index) => {
      out[empresaId] = mergeFacturacionUsuarios(queries[index]?.data ?? []);
    });
    return out;
  }, [empresasNormalizadas, queries]);

  return {
    usuariosPorEmpresa,
    isLoading: queries.some((query) => query.isLoading),
  };
}
