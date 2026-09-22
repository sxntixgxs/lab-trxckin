/**
 * Fails fast at boot when required configuration is missing, instead of
 * surfacing it later as a 500 on the first request that needs it.
 */
const REQUIRED_ENV = ["DATABASE_URL", "WORKOS_CLIENT_ID", "WORKOS_API_KEY", "NEST_INTERNAL_KEY"] as const;

export type RequiredEnvName = (typeof REQUIRED_ENV)[number];

export function findMissingEnv(env: NodeJS.ProcessEnv = process.env): RequiredEnvName[] {
  return REQUIRED_ENV.filter((name) => !env[name]?.trim());
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = findMissingEnv(env);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. See apps/backend/.env.example.`,
    );
  }
}
