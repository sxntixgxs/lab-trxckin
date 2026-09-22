import { cookies } from "next/headers";
import {
  decodeImpersonateCookie,
  encodeImpersonateCookie,
  IMPERSONATE_COOKIE_NAME,
  impersonateCookieOptions,
  type ImpersonateCookiePayload,
} from "./impersonate-cookie-codec";

export {
  decodeImpersonateCookie,
  encodeImpersonateCookie,
  IMPERSONATE_COOKIE_NAME,
  IMPERSONATE_HEADER,
  IMPERSONATE_TTL_MS,
  impersonateCookieOptions,
  impersonateCookieSecret,
  type ImpersonateCookiePayload,
} from "./impersonate-cookie-codec";

export async function readImpersonateCookie(): Promise<ImpersonateCookiePayload | null> {
  const store = await cookies();
  return decodeImpersonateCookie(store.get(IMPERSONATE_COOKIE_NAME)?.value);
}

export async function writeImpersonateCookie(payload: Omit<ImpersonateCookiePayload, "exp">) {
  const store = await cookies();
  store.set(IMPERSONATE_COOKIE_NAME, encodeImpersonateCookie(payload), impersonateCookieOptions());
}

export async function clearImpersonateCookie() {
  const store = await cookies();
  store.delete(IMPERSONATE_COOKIE_NAME);
}
