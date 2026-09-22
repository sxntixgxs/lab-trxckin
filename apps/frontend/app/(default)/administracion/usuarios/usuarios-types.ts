export type RolOption = {
  id: number;
  slug: string;
  nombre: string;
  activo: boolean;
};

export type UsuarioDirectory = {
  id: string;
  workosUserId: string;
  email: string;
  nombre: string;
  activo: boolean;
  cargo?: string | null;
  id_rol: number;
  id_proceso?: number | null;
  id_jefe_directo?: string | null;
  lider_proceso?: boolean;
  acceso_todas_empresas?: boolean;
  empresas?: number[];
  created_at: string;
  updated_at: string;
  rol: RolOption;
  proceso?: { id: number; nombre: string } | null;
  jefeDirecto?: { id: string; nombre: string; email: string } | null;
};

export type ProcesoOption = {
  id: number;
  nombre: string;
  activo: boolean;
  lider_user_id?: string | null;
  lider?: { id: string; nombre: string; email: string } | null;
};

export type UsuarioWritePayload = {
  id_rol?: number;
  activo?: boolean;
  cargo?: string | null;
  id_proceso?: number | null;
  id_jefe_directo?: string | null;
  lider_proceso?: boolean;
  empresas?: number[];
  acceso_todas_empresas?: boolean;
};

export type CreateUsuarioPayload = {
  email: string;
  nombre: string;
} & UsuarioWritePayload;
