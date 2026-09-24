import { collectHrefs } from "@/lib/nav";

/** Where people land after sign-in when no valid return path was asked for. */
export const DEFAULT_RETURN_PATH = "/dashboard";

/** Pages a return path may point to: every nav page and anything below it. */
export const RETURN_PATHS: readonly string[] = collectHrefs();

const MAX_LENGTH = 512;
const PRINTABLE_ASCII = /^[\x21-\x7E]+$/;
const BASE = "https://return-path.invalid";

/** Starts with exactly one "/" and holds no backslash, whitespace or control character. */
function isPlainPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !/[\\\s\p{Cc}]/u.test(path);
}

/**
 * A same-site path to send someone to after sign-in (`/?next=`, `/sign-in?returnTo=`), or null.
 *
 * Only printable-ASCII paths under a known app page pass. Anything a browser or `redirect()` could
 * read as another origin is rejected, including encoded, double-encoded and dot-segment forms
 * such as `/%2F%2Fevil.com` or `/.//evil.com`. Returns the normalized pathname and query,
 * without the hash.
 */
export function safeReturnPath(value: unknown, allowed: readonly string[] = RETURN_PATHS): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return null;
  if (!PRINTABLE_ASCII.test(value) || value.includes("\\")) return null;

  // The path part must stay a plain path through up to three rounds of decoding.
  let form = value.split(/[?#]/, 1)[0];
  for (let decodes = 0; ; decodes++) {
    if (!isPlainPath(form)) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(form);
    } catch {
      return null;
    }
    if (decoded === form) break;
    if (decodes === 3) return null;
    form = decoded;
  }

  // Dot segments can still collapse into "//host" once normalized, so check the result too.
  const url = new URL(value, BASE);
  if (url.origin !== BASE) return null;
  const { pathname, search } = url;
  if (pathname.includes("//") || /%2f|%5c/i.test(pathname)) return null;
  if (!allowed.some((href) => pathname === href || pathname.startsWith(`${href}/`))) return null;

  return pathname + search;
}

/** Link to the sign-in route, carrying a return path that already passed `safeReturnPath`. */
export function signInHref(returnTo: string | null): string {
  return returnTo ? `/sign-in?${new URLSearchParams({ returnTo })}` : "/sign-in";
}
