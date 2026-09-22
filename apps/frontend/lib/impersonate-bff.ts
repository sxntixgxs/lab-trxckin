import { isAdminUser } from "./impersonate-client";

export type ImpersonateActor = {
  id: string;
  nombre: string;
  email: string;
  hasFullAccess?: boolean;
  rol?: { slug?: string };
};

export type ImpersonateCookieWrite = {
  actorUserId: string;
  targetUserId: string;
};

export type ImpersonateBffFailure = {
  ok: false;
  status: number;
  error: string;
  clearCookie?: boolean;
};

export function prepareImpersonateCookie(args: {
  actor: ImpersonateActor | null;
  existing: { actorUserId: string } | null;
  targetUserId: unknown;
}): { ok: true; cookie: ImpersonateCookieWrite } | ImpersonateBffFailure {
  if (!args.actor) {
    return { ok: false, status: 401, error: "No autorizado" };
  }
  if (!isAdminUser(args.actor)) {
    return { ok: false, status: 403, error: "Solo disponible para administradores" };
  }
  if (args.existing && args.existing.actorUserId !== args.actor.id) {
    return {
      ok: false,
      status: 403,
      error: "Sesión de impersonación inválida",
      clearCookie: true,
    };
  }
  if (typeof args.targetUserId !== "string" || args.targetUserId.trim().length === 0) {
    return { ok: false, status: 400, error: "ID de usuario objetivo requerido" };
  }
  return {
    ok: true,
    cookie: {
      actorUserId: args.actor.id,
      targetUserId: args.targetUserId.trim(),
    },
  };
}

export function prepareRestoreCookie(args: {
  actor: { id: string } | null;
  existing: { actorUserId: string } | null;
}): { ok: true } | ImpersonateBffFailure {
  if (!args.actor) {
    return { ok: false, status: 401, error: "No autorizado" };
  }
  if (!args.existing) {
    return { ok: false, status: 400, error: "No estás impersonando ningún usuario" };
  }
  if (args.existing.actorUserId !== args.actor.id) {
    return {
      ok: false,
      status: 403,
      error: "Sesión de impersonación inválida",
      clearCookie: true,
    };
  }
  return { ok: true };
}
