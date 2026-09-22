import type { RolAnticipo, RolAnticipoSingle } from "../dashboard/types";

type SaveRolePayload =
  | {
      empresa: number;
      rol: RolAnticipoSingle;
      userId: string;
      nombre: string;
      email: string;
    }
  | {
      empresa: number;
      rol: "CONTABILIDAD";
      usuarios: Array<{ userId: string; nombre: string; email: string }>;
    };

export async function saveAnticiposRoleConfig(payload: SaveRolePayload) {
  const response = await fetch("/api/finance/advances/configuracion/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as { error?: string; configId?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "No se pudo guardar la configuración");
  }
  return data;
}

export async function saveAnticiposRolesConfig(args: {
  empresa: number;
  singleRoles: Partial<Record<RolAnticipoSingle, { userId: string; nombre: string; email: string }>>;
  contabilidad: Array<{ userId: string; nombre: string; email: string }>;
}) {
  for (const rol of ["GERENCIA", "TESORERO"] as const) {
    const value = args.singleRoles[rol];
    if (!value?.userId) continue;
    await saveAnticiposRoleConfig({
      empresa: args.empresa,
      rol,
      userId: value.userId,
      nombre: value.nombre,
      email: value.email,
    });
  }

  await saveAnticiposRoleConfig({
    empresa: args.empresa,
    rol: "CONTABILIDAD",
    usuarios: args.contabilidad,
  });
}
