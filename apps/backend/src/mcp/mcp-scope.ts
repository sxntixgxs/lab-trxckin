import { ForbiddenException } from "@nestjs/common";
import { EMPRESAS_APP } from "../auth/empresa-access";

/**
 * Companies the MCP server may read, from `MCP_EMPRESAS` ("1" or "1,2"). The scope lives in the
 * API's environment, not in the MCP client's, so an agent can't widen it. Unset or invalid → none.
 */
export function empresasMcp(valor: string | undefined = process.env.MCP_EMPRESAS): number[] {
  const ids = (valor ?? "")
    .split(",")
    .map((parte) => Number(parte.trim()))
    .filter((id) => (EMPRESAS_APP as readonly number[]).includes(id));
  return [...new Set(ids)];
}

export function assertEmpresaMcp(empresa: number, permitidas: number[] = empresasMcp()): void {
  if (!permitidas.includes(empresa)) {
    throw new ForbiddenException("Empresa fuera del alcance del servidor MCP");
  }
}
