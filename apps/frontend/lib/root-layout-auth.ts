import { headers } from "next/headers";
import { withAuth } from "@workos-inc/authkit-nextjs";

/** Set by the AuthKit proxy on every request it handled; `withAuth` throws without it. */
const AUTHKIT_PROXY_HEADER = "x-workos-middleware";

/**
 * The session's access token for the root layout, or undefined when signed out.
 *
 * The proxy skips file-like paths (the matcher in proxy.ts), yet a missing file such as
 * /favicon.ico still renders the root layout for its 404. `withAuth` threw there, so browsers and
 * crawlers asking for those files got a 500. Such requests never carry a session, so they render
 * signed out; on paths the proxy handled, the error is rethrown.
 */
export async function rootLayoutAccessToken(): Promise<string | undefined> {
  try {
    return (await withAuth()).accessToken;
  } catch (error) {
    if ((await headers()).has(AUTHKIT_PROXY_HEADER)) throw error;
    return undefined;
  }
}
