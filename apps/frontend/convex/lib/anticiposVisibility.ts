import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type AnticiposScope = "buzon" | "mine" | "visible";

export type CompanyVisibility = {
  canSeeAll: boolean;
  isAccounting: boolean;
};

function roleIncludesUser(config: Doc<"anticiposRolesConfig">, userId: string) {
  if (config.rol === "CONTABILIDAD") {
    const ids =
      config.usuarios?.map((usuario) => usuario.userId) ?? (config.userId ? [config.userId] : []);
    return ids.includes(userId);
  }
  return config.userId === userId;
}

export async function getCompanyVisibility(
  ctx: QueryCtx,
  empresa: number,
  viewerUserId: string
): Promise<CompanyVisibility> {
  const configs = await ctx.db
    .query("anticiposRolesConfig")
    .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
    .take(10);
  const legacy = await ctx.db.query("anticiposRolesConfig").withIndex("by_rol").take(20);
  const applicable = [...configs, ...legacy.filter((config) => config.empresa === undefined)];
  return {
    canSeeAll: applicable.some((config) => roleIncludesUser(config, viewerUserId)),
    isAccounting: applicable.some(
      (config) => config.rol === "CONTABILIDAD" && roleIncludesUser(config, viewerUserId)
    ),
  };
}

export function matchesVisibility(
  item: Doc<"anticiposDashboardItems">,
  viewerUserId: string,
  visibility: CompanyVisibility,
  scope: AnticiposScope
) {
  if (scope === "mine") return item.createdById === viewerUserId;
  if (scope === "buzon") {
    return (
      item.esActiva &&
      (item.asignadoA === viewerUserId ||
        item.ownerUserIds?.includes(viewerUserId) ||
        (visibility.isAccounting && item.faseActual === "III_REVISION_CONTABILIDAD"))
    );
  }
  return (
    visibility.canSeeAll ||
    item.createdById === viewerUserId ||
    item.responsableUserId === viewerUserId ||
    item.asignadoA === viewerUserId
  );
}
