import { redirect } from 'next/navigation';
import { getSignUpUrl } from '@workos-inc/authkit-nextjs';
import { DEFAULT_RETURN_PATH } from '@/lib/return-path';

// A new account starts without modules, so it lands on the dashboard rather than on a module
// that would answer "No autorizado".
export async function GET() {
  const authorizationUrl = await getSignUpUrl({ returnTo: DEFAULT_RETURN_PATH });
  return redirect(authorizationUrl);
}
