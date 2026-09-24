import { NextResponse, type NextRequest } from "next/server";

/** `?error=` value the entry page reads after a failed sign-in. */
export const SIGN_IN_ERROR = "sign-in";

/**
 * `handleAuth` onError: logs what WorkOS or the code exchange reported and sends the person back
 * to the entry page instead of AuthKit's raw JSON 500. It builds the URL the way AuthKit's own
 * success redirect does (from `request.nextUrl`), and it must be a NextResponse because AuthKit
 * sets no-cache headers on the returned response afterwards.
 */
export function signInErrorResponse({ error, request }: { error?: unknown; request: NextRequest }): NextResponse {
  const params = request.nextUrl.searchParams;
  console.error("[auth] sign-in failed", {
    error: params.get("error") ?? undefined,
    description: params.get("error_description") ?? undefined,
    cause: error instanceof Error ? error.message : error,
  });

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = `?error=${SIGN_IN_ERROR}`;
  return NextResponse.redirect(url);
}

/** Fixed text for the entry page; the query value only selects it and is never shown. */
export function signInErrorMessage(value: unknown): string | null {
  return value === SIGN_IN_ERROR
    ? "Sign-in didn't finish. Try again, or create an account if you don't have one."
    : null;
}
