import { createHmac, timingSafeEqual } from "node:crypto";

export const IMPERSONATE_COOKIE_NAME = "lab_impersonate";
export const IMPERSONATE_HEADER = "x-impersonate-user-id";
export const IMPERSONATE_TTL_MS = 8 * 60 * 60 * 1000;

export type ImpersonateCookiePayload = {
  actorUserId: string;
  targetUserId: string;
  exp: number;
};

export function impersonateCookieSecret(): string {
  // Dedicated key: never reuse NEST_INTERNAL_KEY (a leak of one must not forge the other).
  const value = process.env.IMPERSONATE_COOKIE_SECRET;
  if (!value) {
    throw new Error("IMPERSONATE_COOKIE_SECRET is not configured");
  }
  return value;
}

export function encodeImpersonateCookie(
  payload: Omit<ImpersonateCookiePayload, "exp">,
  nowMs = Date.now(),
  secret = impersonateCookieSecret(),
): string {
  const body: ImpersonateCookiePayload = {
    ...payload,
    exp: nowMs + IMPERSONATE_TTL_MS,
  };
  const json = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", secret).update(json).digest("base64url");
  return `${json}.${sig}`;
}

export function decodeImpersonateCookie(
  raw: string | undefined,
  nowMs = Date.now(),
  secret = impersonateCookieSecret(),
): ImpersonateCookiePayload | null {
  if (!raw) return null;
  const [json, sig] = raw.split(".");
  if (!json || !sig) return null;

  const expected = createHmac("sha256", secret).update(json).digest("base64url");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as ImpersonateCookiePayload;
    if (!parsed.actorUserId || !parsed.targetUserId || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp <= nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function impersonateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(IMPERSONATE_TTL_MS / 1000),
  };
}
