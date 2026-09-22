type RolRef = {
  id: number;
  slug: string;
  nombre: string;
  activo: boolean;
};

type ProcesoRef = {
  id: number;
  nombre: string;
  lider_user_id?: string | null;
};

type JefeRef = {
  id: string;
  nombre: string;
  email: string;
};

export type UsuarioRecord = {
  id: string;
  workosUserId?: string;
  email: string;
  nombre: string;
  activo: boolean;
  cargo?: string | null;
  id_rol: number;
  id_proceso?: number | null;
  id_jefe_directo?: string | null;
  acceso_todas_empresas?: boolean;
  created_at?: Date;
  updated_at?: Date;
  rol?: RolRef | null;
  proceso?: ProcesoRef | null;
  jefeDirecto?: JefeRef | null;
  procesosLider?: Array<{ id: number }>;
  empresas?: Array<{ id_empresa: number }>;
};

export function isLiderProceso(usuario: UsuarioRecord): boolean {
  if ((usuario.procesosLider?.length ?? 0) > 0) {
    return true;
  }
  return usuario.proceso?.lider_user_id === usuario.id;
}

export function empresaIds(usuario: UsuarioRecord): number[] {
  return (usuario.empresas ?? []).map((item) => item.id_empresa);
}

export function toAdminUsuario(usuario: UsuarioRecord) {
  return {
    id: usuario.id,
    workosUserId: usuario.workosUserId,
    email: usuario.email,
    nombre: usuario.nombre,
    activo: usuario.activo,
    cargo: usuario.cargo ?? null,
    id_rol: usuario.id_rol,
    id_proceso: usuario.id_proceso ?? null,
    id_jefe_directo: usuario.id_jefe_directo ?? null,
    acceso_todas_empresas: usuario.acceso_todas_empresas ?? true,
    empresas: empresaIds(usuario),
    lider_proceso: isLiderProceso(usuario),
    created_at: usuario.created_at,
    updated_at: usuario.updated_at,
    rol: usuario.rol ?? null,
    proceso: usuario.proceso
      ? { id: usuario.proceso.id, nombre: usuario.proceso.nombre }
      : null,
    jefeDirecto: usuario.jefeDirecto ?? null,
  };
}

/**
 * Projection served to every authenticated member (pickers for leaders,
 * approvers and finance users). Keep it to what those flows need; role,
 * WorkOS id and the boss's e-mail are admin-only (see toAdminUsuario).
 */
export function toDirectoryUsuario(usuario: UsuarioRecord) {
  const procesoNombre = usuario.proceso?.nombre ?? "";
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    cargo: usuario.cargo ?? "",
    cedula: "",
    telf: "",
    activo: usuario.activo,
    id_proceso: usuario.id_proceso ?? null,
    proceso: procesoNombre,
    procesoUsuario: usuario.proceso
      ? { id: usuario.proceso.id, nombre: usuario.proceso.nombre }
      : null,
    lider_proceso: isLiderProceso(usuario),
    id_jefe_directo: usuario.id_jefe_directo ?? null,
    acceso_todas_empresas: usuario.acceso_todas_empresas ?? true,
    empresas: empresaIds(usuario),
    id_empresa: empresaIds(usuario)[0] ?? null,
  };
}
