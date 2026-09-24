import { handleAuth } from '@workos-inc/authkit-nextjs';
import { DEFAULT_RETURN_PATH } from '@/lib/return-path';
import { signInErrorResponse } from '@/lib/sign-in-error';

// In the Docker image Next builds request URLs from the bind address (0.0.0.0:3000), not the
// public host, so the post-login redirect uses the app URL instead. Unset locally: unchanged.
export const GET = handleAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  returnPathname: DEFAULT_RETURN_PATH,
  onError: signInErrorResponse,
});
