import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware({
  eagerAuth: true,
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/sign-in",
      "/sign-up",
      "/callback",
      // Server-to-server email endpoints called by Convex. They have no WorkOS session
      // and authenticate with a shared secret / HMAC signature inside the route.
      "/api/notifications/:path*",
      // Public onboarding forms for suppliers/customers (token-guarded Convex functions).
      "/onboarding/:path*",
      // Resend delivery webhooks (Svix-signed inside the route).
      "/api/webhooks/:path*",
      // Container healthcheck (docker-compose.coolify.yml).
      "/api/health",
    ],
  },
  redirectUri:
    process.env.VERCEL_ENV === "preview"
      ? `https://${process.env.VERCEL_BRANCH_URL}/callback`
      : process.env.VERCEL_ENV === "production"
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/callback`
        : undefined,
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
