import { env } from "../_generated/server";
import { EMPRESAS_MAP } from "../../lib/empresas";
import { constantTimeEqual } from "./auth";

/**
 * Read-only MCP server access (apps/mcp-server → convex/mcp/lectura.ts).
 *
 * The caller proves itself with `MCP_READ_SECRET`, which is separate from
 * `CONVEX_SERVER_SECRET` and opens nothing but the MCP queries. The companies it may read
 * come from `MCP_EMPRESAS` in the Convex deployment, never from the caller, so a leaked or
 * edited MCP config cannot widen the scope.
 */
export function requireMcpSecret(secret: string): void {
  const expected = env.MCP_READ_SECRET;
  if (!expected || !secret || !constantTimeEqual(secret, expected)) {
    throw new Error("No autorizado");
  }
}

/** Companies in `MCP_EMPRESAS` ("1" or "1,2") that exist in the app. Unset → none. */
export function empresasMcp(valor: string | undefined = env.MCP_EMPRESAS): number[] {
  const ids = (valor ?? "")
    .split(",")
    .map((parte) => Number(parte.trim()))
    .filter((id) => Number.isInteger(id) && id in EMPRESAS_MAP);
  return [...new Set(ids)];
}

/**
 * Resolves the company a call reads: the one asked for, if in scope, or the only one in
 * scope when the caller does not say.
 */
export function resolverEmpresaMcp(empresa: number | undefined, permitidas = empresasMcp()): number {
  if (empresa === undefined) {
    if (permitidas.length === 1) return permitidas[0];
    throw new Error(
      permitidas.length === 0
        ? "El servidor MCP no tiene empresas habilitadas (MCP_EMPRESAS)."
        : `Indica la empresa: ${permitidas.join(", ")}.`
    );
  }
  if (!permitidas.includes(empresa)) {
    throw new Error("Empresa fuera del alcance del servidor MCP.");
  }
  return empresa;
}
