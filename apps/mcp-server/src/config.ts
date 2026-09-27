/** Server configuration, read once from the environment. */
export type Config = {
  convexUrl: string;
  convexSecret: string;
  /** NestJS API for the supplier catalog; search_suppliers is only registered when set. */
  api: { url: string; key: string } | null;
};

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const faltantes = ["LAB_CONVEX_URL", "LAB_MCP_SECRET"].filter((nombre) => !env[nombre]?.trim());
  if (faltantes.length > 0) {
    throw new Error(`Missing environment variables: ${faltantes.join(", ")} (see apps/mcp-server/.env.example).`);
  }
  const apiUrl = env.LAB_API_URL?.trim();
  const apiKey = env.LAB_MCP_API_KEY?.trim();
  return {
    convexUrl: env.LAB_CONVEX_URL!.trim(),
    convexSecret: env.LAB_MCP_SECRET!.trim(),
    api: apiUrl && apiKey ? { url: apiUrl.replace(/\/+$/, ""), key: apiKey } : null,
  };
}
