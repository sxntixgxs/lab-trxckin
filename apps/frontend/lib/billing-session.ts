import type { CurrentUser } from "@/lib/fetch-backend";

export type BillingSessionUser = {
  id: string;
  nombre: string;
  email: string;
  id_rol: number;
  id_proceso?: number | null;
  empresas?: number[];
  acceso_todas_empresas?: boolean;
  lider_proceso?: boolean;
  proceso?: { id: number; nombre: string } | null;
};

export type BillingSession = {
  user: BillingSessionUser;
};

export function toBillingSession(user: CurrentUser): BillingSession {
  return {
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      id_rol: user.rol.id,
      id_proceso: user.id_proceso ?? user.proceso?.id ?? null,
      empresas: user.empresas ?? [],
      acceso_todas_empresas: user.acceso_todas_empresas === true || user.hasFullAccess,
      lider_proceso: user.lider_proceso === true,
      proceso: user.proceso ?? null,
    },
  };
}
