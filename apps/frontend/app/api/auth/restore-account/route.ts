import { NextResponse } from "next/server";
import { getCurrentBackendUser } from "@/lib/fetch-backend";
import { prepareRestoreCookie } from "@/lib/impersonate-bff";
import { clearImpersonateCookie, readImpersonateCookie } from "@/lib/impersonate-cookie";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST() {
  const actor = await getCurrentBackendUser({ skipImpersonation: true });
  const existing = await readImpersonateCookie();
  const decision = prepareRestoreCookie({ actor, existing });
  if (!decision.ok) {
    if (decision.clearCookie) {
      await clearImpersonateCookie();
    }
    return NextResponse.json({ error: decision.error }, { status: decision.status, headers: NO_STORE });
  }

  await clearImpersonateCookie();
  return NextResponse.json(
    { ok: true, isImpersonating: false, user: actor },
    { headers: NO_STORE },
  );
}
