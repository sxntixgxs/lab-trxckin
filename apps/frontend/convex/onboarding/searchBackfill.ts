// Backfill de `searchText` para inscripciones creadas antes del índice `search_text`.
// Uso: npx convex run onboarding/searchBackfill:backfillSearchText '{"tabla":"onboardingProveedores"}'
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { buildOnboardingSearchText } from "../lib/onboarding/searchText";

const BATCH_SIZE = 200;

export const backfillSearchText = internalMutation({
  args: {
    tabla: v.union(v.literal("onboardingProveedores"), v.literal("onboardingClientes")),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ actualizados: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query(args.tabla)
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });

    let actualizados = 0;
    for (const ins of page.page) {
      const searchText = buildOnboardingSearchText({
        NIT: ins.NIT,
        razonSocial: ins.datos_generales_01.razonSocial,
      });
      if (ins.searchText === searchText) continue;
      await ctx.db.patch(args.tabla, ins._id, { searchText });
      actualizados += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.onboarding.searchBackfill.backfillSearchText, {
        tabla: args.tabla,
        cursor: page.continueCursor,
      });
    }
    return { actualizados, isDone: page.isDone };
  },
});
