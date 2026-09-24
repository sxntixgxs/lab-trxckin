import { handleAuth } from '@workos-inc/authkit-nextjs';
import { DEFAULT_RETURN_PATH } from '@/lib/return-path';
import { signInErrorResponse } from '@/lib/sign-in-error';

export const GET = handleAuth({ returnPathname: DEFAULT_RETURN_PATH, onError: signInErrorResponse });
