import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { getSignInUrl } from '@workos-inc/authkit-nextjs';
import { safeReturnPath } from '@/lib/return-path';

// AuthKit 2.17.0 decodes a state without a custom part using atob() on base64url, which fails
// for some return paths and silently drops them. A constant custom state takes the branch that
// converts base64url back first.
const STATE = 'lab';

export async function GET(request: NextRequest) {
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get('returnTo'));
  const authorizationUrl = await getSignInUrl(returnTo ? { returnTo, state: STATE } : {});
  return redirect(authorizationUrl);
}
