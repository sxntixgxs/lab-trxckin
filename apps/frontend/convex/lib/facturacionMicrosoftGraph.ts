"use node";

import { ClientSecretCredential } from "@azure/identity";

const ENV_PREFIX_BY_EMPRESA: Record<number, string> = {
  2: "MS_SECONDARY",
};
const DEFAULT_PREFIX = "MS";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} es requerido para conectar Microsoft Graph`);
  }
  return value;
}

function getCredential(empresa?: number) {
  const prefix =
    (empresa !== undefined && ENV_PREFIX_BY_EMPRESA[empresa]) || DEFAULT_PREFIX;

  return new ClientSecretCredential(
    getRequiredEnv(`${prefix}_TENANT_ID`),
    getRequiredEnv(`${prefix}_CLIENT_ID`),
    getRequiredEnv(`${prefix}_CLIENT_SECRET`),
  );
}

export async function getFacturacionAccessToken(
  empresa?: number,
): Promise<string> {
  const token = await getCredential(empresa).getToken(
    "https://graph.microsoft.com/.default",
  );

  if (!token?.token) {
    throw new Error("No fue posible obtener un token de Microsoft Graph");
  }

  return token.token;
}
