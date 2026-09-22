export type FilterKey =
  | "todas"
  | "por_vencer"
  | "anticipos"
  | "cajas_menores"
  | "devueltas";

export type Actor = {
  actorUserId?: string;
  actorNombre: string;
  actorEmail: string;
};

export type UsuarioAsignacion = {
  usuarioId?: string;
  nombre: string;
  email: string;
  procesoId?: number;
  procesoNombre?: string;
};

export type ConfigUsuario = {
  usuarioId: string;
  nombre: string;
  email: string;
};
