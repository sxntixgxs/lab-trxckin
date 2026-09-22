import type { BillingSession as Session } from "@/lib/billing-session";

import { hasGlobalEmpresaAccess } from "@/lib/empresas";

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

export function resolveActorFromSession(session: Session) {
  return {
    actorUserId: session.user.id ? String(session.user.id) : undefined,
    actorNombre: session.user.nombre ?? session.user.email ?? "Usuario",
    actorEmail: session.user.email || "sin-correo@example.com",
  };
}

export function resolveRelacionErrorStatus(message: string) {
  if (message === "No autenticado" || message === "No autorizado") return 401;
  if (message === "Empresa no autorizada" || message === "Sin permiso") return 403;
  if (message.includes("no encontrado") || message.includes("no es una nota")) {
    return 404;
  }
  if (message.startsWith("CONFLICTO_RELACION")) return 409;
  if (
    message.startsWith("BLOQUEADO:") ||
    message.startsWith("VALIDACION_PEAJES:") ||
    message.includes("PEAJES solo se pueden")
  ) {
    return 422;
  }
  if (
    message.includes("obligatorio") ||
    message.includes("caracteres") ||
    message.includes("búsqueda") ||
    message.includes("motivo")
  ) {
    return 400;
  }
  return 500;
}
