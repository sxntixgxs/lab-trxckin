const REQUIRED_ENV = ["ERP_SIM_DATABASE_URL", "ERP_SIM_CONNI_KEY", "ERP_SIM_CONNI_TOKEN"] as const;

export function findMissingEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return REQUIRED_ENV.filter((name) => !env[name]?.trim());
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = findMissingEnv(env);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. See apps/erp-simulator/.env.example.`,
    );
  }
}
