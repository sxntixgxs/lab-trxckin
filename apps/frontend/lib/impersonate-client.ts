export const IMPERSONATION_CHANGED_EVENT = "impersonation-changed";

export function notifyImpersonationChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(IMPERSONATION_CHANGED_EVENT));
}

const SESSION_FLASH_KEY = "session-change-flash";
const SESSION_CHANNEL = "session-change";

/** Full reload so every client cache (React Query, Convex subs, state) re-reads as the new identity. */
export function reloadAfterSessionChange(message?: string) {
  if (typeof window === "undefined") return;
  try {
    if (message) window.sessionStorage.setItem(SESSION_FLASH_KEY, message);
  } catch {}
  try {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage("changed");
    channel.close();
  } catch {}
  window.location.reload();
}

export function consumeSessionFlash(): string | null {
  try {
    const message = window.sessionStorage.getItem(SESSION_FLASH_KEY);
    if (message !== null) window.sessionStorage.removeItem(SESSION_FLASH_KEY);
    return message;
  } catch {
    return null;
  }
}

export function subscribeSessionChangeFromOtherTabs(onChange: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  channel.onmessage = () => onChange();
  return () => channel.close();
}

export function canUseImpersonationBanner(args: {
  isAdmin: boolean;
  isImpersonating: boolean;
}): boolean {
  return args.isAdmin || args.isImpersonating;
}

export function isImpersonateShortcut(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  key: string;
}): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "u";
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

export function isAdminUser(user: { hasFullAccess?: boolean; rol?: { slug?: string } } | null): boolean {
  return user?.hasFullAccess === true || user?.rol?.slug === "admin";
}

export async function startImpersonation(targetUserId: string): Promise<{
  ok: true;
  nombre: string;
} | { ok: false; message: string }> {
  const response = await fetch("/api/auth/impersonate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "No se pudo cambiar de usuario";
    return { ok: false, message };
  }
  const nombre =
    body &&
    typeof body === "object" &&
    "user" in body &&
    body.user &&
    typeof body.user === "object" &&
    "nombre" in body.user &&
    typeof body.user.nombre === "string"
      ? body.user.nombre
      : "usuario";
  notifyImpersonationChanged();
  return { ok: true, nombre };
}

export async function restoreImpersonation(): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch("/api/auth/restore-account", { method: "POST" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "No se pudo restaurar la cuenta";
    return { ok: false, message };
  }
  notifyImpersonationChanged();
  return { ok: true };
}
