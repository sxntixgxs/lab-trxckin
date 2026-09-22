export type UsuarioAnticipo = {
  id: string;
  nombre?: string;
  email?: string;
  cedula?: string;
  cargo?: string;
  id_empresa?: number | null;
  empresas?: number[];
  acceso_todas_empresas?: boolean;
  id_proceso?: number | null;
  proceso?: string;
  lider_proceso?: boolean;
  id_jefe_directo?: string | null;
  activo?: boolean;
};

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseBooleanFlag(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

function getEmpresaId(row: Record<string, unknown>) {
  return (
    parseNumber(row.id_empresa) ??
    parseNumber(row.idEmpresa) ??
    parseNumber(row.empresaId) ??
    parseNumber(
      typeof row.empresa === "object" && row.empresa
        ? (row.empresa as Record<string, unknown>).id
        : null
    )
  );
}

function getEmpresaIds(row: Record<string, unknown>) {
  const ids = new Set<number>();
  const primary = getEmpresaId(row);
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

export function normalizarUsuarioAnticipo(raw: unknown): UsuarioAnticipo | null {
  if (!raw || typeof raw !== "object") return null;

  const row = raw as Record<string, unknown>;
  const id = row.id != null ? String(row.id).trim() : "";
  if (!id) return null;

  const procesoRow =
    typeof row.procesoUsuario === "object" && row.procesoUsuario
      ? (row.procesoUsuario as Record<string, unknown>)
      : null;

  return {
    id,
    nombre: typeof row.nombre === "string" ? row.nombre : undefined,
    email: typeof row.email === "string" ? row.email : undefined,
    cedula: row.cedula != null ? String(row.cedula) : undefined,
    cargo: typeof row.cargo === "string" ? row.cargo : undefined,
    id_empresa: getEmpresaId(row),
    empresas: getEmpresaIds(row),
    acceso_todas_empresas: parseBooleanFlag(row.acceso_todas_empresas ?? row.accesoTodasEmpresas),
    id_proceso: parseNumber(row.id_proceso) ?? parseNumber(procesoRow?.id),
    proceso:
      typeof row.proceso === "string"
        ? row.proceso
        : typeof row.proceso === "object" &&
            row.proceso &&
            typeof (row.proceso as { nombre?: unknown }).nombre === "string"
          ? (row.proceso as { nombre: string }).nombre
          : typeof procesoRow?.nombre === "string"
            ? procesoRow.nombre
            : undefined,
    lider_proceso: parseBooleanFlag(row.lider_proceso),
    id_jefe_directo:
      row.id_jefe_directo != null && String(row.id_jefe_directo).trim() !== ""
        ? String(row.id_jefe_directo)
        : null,
    activo: parseBooleanFlag(row.activo, true),
  };
}

export function normalizarUsuariosAnticiposPayload(data: unknown) {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { usuarios?: unknown }).usuarios)
      ? ((data as { usuarios: unknown[] }).usuarios ?? [])
      : data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)
        ? ((data as { data: unknown[] }).data ?? [])
        : [];

  return rows
    .map(normalizarUsuarioAnticipo)
    .filter((usuario): usuario is UsuarioAnticipo => usuario !== null);
}

export function getLideresDisponibles(
  usuarios: UsuarioAnticipo[],
  empresaId: number | null,
  jefeDirecto?: UsuarioAnticipo
) {
  const byId = new Map<string, UsuarioAnticipo>();

  if (empresaId !== null) {
    for (const usuario of usuarios) {
      const perteneceAEmpresa =
        usuario.id_empresa === empresaId || usuario.empresas?.includes(empresaId) === true;
      const tieneAlcanceGlobal = usuario.acceso_todas_empresas === true;

      if (
        usuario.activo !== false &&
        usuario.lider_proceso === true &&
        (perteneceAEmpresa || tieneAlcanceGlobal)
      ) {
        byId.set(usuario.id, usuario);
      }
    }
  }

  // El jefe configurado sigue siendo una sugerencia válida aunque no tenga
  // lider_proceso, tal como exige el flujo de solicitud de Anticipos.
  if (jefeDirecto) byId.set(jefeDirecto.id, jefeDirecto);

  return [...byId.values()].sort((a, b) =>
    (a.nombre ?? a.email ?? a.id).localeCompare(b.nombre ?? b.email ?? b.id, "es", {
      sensitivity: "base",
    })
  );
}

function normalizarBusqueda(value?: string | number | null) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function filtrarLideres(usuarios: UsuarioAnticipo[], search: string, limit = 60) {
  const query = normalizarBusqueda(search.trim());
  if (!query) return usuarios.slice(0, limit);

  return usuarios
    .filter((usuario) =>
      normalizarBusqueda(
        [
          usuario.nombre,
          usuario.email,
          usuario.cedula,
          usuario.cargo,
          usuario.proceso,
          usuario.id,
        ].join(" ")
      ).includes(query)
    )
    .slice(0, limit);
}
