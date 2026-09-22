import type { Request } from "express";
import type { Rol, Usuario } from "@prisma/client";

export type AuthenticatedUser = Usuario & {
  rol: Rol;
  proceso?: { id: number; nombre: string; lider_user_id?: string | null } | null;
  jefeDirecto?: { id: string; nombre: string; email: string } | null;
  procesosLider?: Array<{ id: number }>;
  empresas?: Array<{ id_empresa: number }>;
  permisos: string[];
  hasFullAccess: boolean;
};

export type AuthedRequest = Request & {
  user?: AuthenticatedUser;
  impersonator?: AuthenticatedUser;
};

export const ADMIN_ROLE_SLUG = "admin";
