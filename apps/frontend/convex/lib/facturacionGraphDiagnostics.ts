/** Inspección del JWT de Graph (app-only) y textos de diagnóstico. Sin I/O. */

export type GraphTokenClaims = {
  tenantId?: string;
  appId?: string;
  roles: string[];
  delegatedScopes: string[];
  hasMailReadApplication: boolean;
};

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json = atob(padded + pad);
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function inspectGraphTokenClaims(token: string): GraphTokenClaims {
  const payload = decodeJwtPayload(token);
  const roles = Array.isArray(payload?.roles)
    ? payload.roles.filter((role): role is string => typeof role === "string")
    : [];
  const delegatedScopes =
    typeof payload?.scp === "string" ? payload.scp.split(" ").filter(Boolean) : [];
  const tenantId = typeof payload?.tid === "string" ? payload.tid : undefined;
  const appId =
    typeof payload?.appid === "string"
      ? payload.appid
      : typeof payload?.azp === "string"
        ? payload.azp
        : undefined;

  return {
    tenantId,
    appId,
    roles,
    delegatedScopes,
    hasMailReadApplication: roles.includes("Mail.Read") || roles.includes("Mail.ReadWrite"),
  };
}

export function diagnoseGraphAccess(args: {
  hasMailReadApplication: boolean;
  userLookupStatus?: number;
  mailboxLookupStatus?: number;
}): string {
  if (!args.hasMailReadApplication) {
    return [
      "El token no incluye el permiso de aplicación Mail.Read.",
      "En Entra ID → App registrations → tu app → API permissions:",
      "Microsoft Graph → Application permissions (no Delegated) → Mail.Read → Grant admin consent.",
      "Delegated Mail.Read no sirve: el sync usa client credentials.",
    ].join(" ");
  }

  if (args.userLookupStatus === 404) {
    return [
      "Mail.Read está en el token, pero Graph no encuentra el usuario.",
      "cuenta_recepcion debe ser un buzón Exchange Online del mismo tenant que MS_TENANT_ID",
      "(UPN exacto, p. ej. facturas@example.com).",
    ].join(" ");
  }

  if (args.mailboxLookupStatus === 404) {
    return [
      "El usuario existe en Entra, pero no tiene buzón Exchange Online listo.",
      "Asigna Microsoft 365 Business Basic (o superior) a esa cuenta y espera a que Exchange provisione el mailbox.",
    ].join(" ");
  }

  if (args.mailboxLookupStatus === 403 || args.userLookupStatus === 403) {
    return [
      "Mail.Read está en el token, pero Exchange negó el buzón.",
      "Revisa Application Access Policy (Get-ApplicationAccessPolicy) y que el mailbox esté en el grupo permitido.",
      "Quita la policy o incluye facturas@example.com.",
    ].join(" ");
  }

  if (args.mailboxLookupStatus === 200) {
    return "Graph puede leer el Inbox. La sincronización debería funcionar.";
  }

  return "No se pudo completar el diagnóstico. Revisa tenant, secret y que el mailbox exista.";
}

export function graph403Hint(): string {
  return [
    "Este sync usa app-only (client credentials).",
    "En Entra ID la app necesita Microsoft Graph → Application → Mail.Read + Grant admin consent.",
    "Delegated Mail.Read no sirve.",
    "Si ya está concedido, revisa Application Access Policy en Exchange.",
  ].join(" ");
}
