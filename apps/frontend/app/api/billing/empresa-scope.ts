import { NextResponse } from "next/server";
import { EMPRESAS_LIST, hasGlobalEmpresaAccess } from "@/lib/empresas";

export function parseEmpresasParam(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export function resolveEmpresasPermitidas(
  session: {
    user: {
      id_rol?: number;
      acceso_todas_empresas?: boolean;
      empresas?: number[];
    };
  },
  requested: number[] | null
): number[] | { error: NextResponse } {
  const canAll = hasGlobalEmpresaAccess(
    session.user.id_rol ?? 0,
    session.user.acceso_todas_empresas
  );
  const sessionEmpresas = session.user.empresas ?? [];
  const fallbackEmpresas = EMPRESAS_LIST.map((empresa) => empresa.id);
  const permitted = canAll
    ? null
    : new Set(sessionEmpresas.length > 0 ? sessionEmpresas : fallbackEmpresas);

  if (requested == null || requested.length === 0) {
    if (canAll) {
      return {
        error: NextResponse.json({ error: "Debe indicar al menos una empresa" }, { status: 400 }),
      };
    }
    return [...(permitted ?? [])];
  }

  if (canAll) return requested;

  for (const empresa of requested) {
    if (!permitted!.has(empresa)) {
      return {
        error: NextResponse.json({ error: "Empresa no autorizada" }, { status: 403 }),
      };
    }
  }
  return requested;
}
