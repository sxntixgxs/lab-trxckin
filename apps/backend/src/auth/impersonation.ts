export const IMPERSONATE_HEADER = "x-impersonate-user-id";

export type ImpersonationFailure = {
  ok: false;
  status: 400 | 403;
  message: string;
};

export type ImpersonationSuccess = { ok: true };

export type ImpersonationDecision = ImpersonationSuccess | ImpersonationFailure;

export function evaluateImpersonation(args: {
  actorIsAdmin: boolean;
  actorId: string;
  target: { id: string; activo: boolean } | null;
}): ImpersonationDecision {
  if (!args.actorIsAdmin) {
    return { ok: false, status: 403, message: "Solo los administradores pueden impersonar" };
  }
  if (!args.target) {
    return { ok: false, status: 400, message: "El usuario objetivo no está disponible" };
  }
  if (args.target.id === args.actorId) {
    return { ok: false, status: 400, message: "No puedes impersonarte a ti mismo" };
  }
  if (!args.target.activo) {
    return { ok: false, status: 400, message: "El usuario objetivo no está disponible" };
  }
  return { ok: true };
}

export function shouldApplyImpersonationHeader(actorIsAdmin: boolean, header: string | undefined): boolean {
  return actorIsAdmin && Boolean(header?.trim());
}
