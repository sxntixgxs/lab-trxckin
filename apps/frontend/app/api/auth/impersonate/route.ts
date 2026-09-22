import { NextResponse } from "next/server";
import { fetchBackend, getCurrentBackendUser } from "@/lib/fetch-backend";
import { prepareImpersonateCookie } from "@/lib/impersonate-bff";
import {
  clearImpersonateCookie,
  readImpersonateCookie,
  writeImpersonateCookie,
} from "@/lib/impersonate-cookie";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const actor = await getCurrentBackendUser({ skipImpersonation: true });
  const existing = await readImpersonateCookie();
  const payload: unknown = await request.json().catch(() => null);
  const targetUserId =
    payload && typeof payload === "object" && "targetUserId" in payload
      ? payload.targetUserId
      : undefined;

  const decision = prepareImpersonateCookie({ actor, existing, targetUserId });
  if (!decision.ok) {
    if (decision.clearCookie) {
      await clearImpersonateCookie();
    }
    return json({ error: decision.error }, decision.status);
  }

  const response = await fetchBackend("/api/v1/auth/impersonate", {
    method: "POST",
    body: JSON.stringify({ targetUserId: decision.cookie.targetUserId }),
    skipImpersonation: true,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : "No se pudo cambiar de usuario";
    return json({ error: message }, response.status);
  }

  await writeImpersonateCookie(decision.cookie);

  return json({
    user: body,
    isImpersonating: true,
    originalUser: actor
      ? { id: actor.id, nombre: actor.nombre, email: actor.email }
      : null,
  });
}
