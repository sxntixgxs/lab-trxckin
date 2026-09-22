import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { reconciliarEstadoLegalizacionAnticipo } from "./anticiposLegalizacionReconciliacion";
import { getValorContable } from "./valorContable";
import {
  getSaldoLegalizadoAnticipo,
  getValorLegalizableAnticipo,
} from "./valorLegalizableAnticipo";

const MONEY_TOLERANCE = 0.001;

type AnticipoLegalizacionItem = NonNullable<Doc<"anticipos">["legalizacion"]>[number];

function actualizarLegalizacionFacturaEnAnticipo(
  anticipo: Doc<"anticipos">,
  facturaId: Id<"facturacionFacturas">,
  valorLegalizado: number
) {
  const legalizaciones: AnticipoLegalizacionItem[] = anticipo.legalizacion ?? [];
  return legalizaciones.map((item) =>
    String(item.facturaId) === String(facturaId) ? { ...item, valorLegalizado } : item
  );
}

async function listarLegalizacionesActivasFactura(
  ctx: MutationCtx,
  facturaId: Id<"facturacionFacturas">
) {
  return await ctx.db
    .query("facturacionAnticipoLegalizaciones")
    .withIndex("by_facturaId_estado", (q) =>
      q.eq("facturaId", facturaId).eq("estado", "activa")
    )
    .collect();
}

/**
 * When internal documents increase and base for anticipo cross drops below applied
 * anticipos, reduce excess starting from the most recent active cross.
 */
export async function reducirAnticiposPorExcesoBase(
  ctx: MutationCtx,
  args: {
    factura: Doc<"facturacionFacturas">;
    baseCruceAnticipos: number;
    actorUserId: string;
    now: number;
    comentario?: string;
  }
): Promise<{
  legalizacionesAjustadas: Id<"facturacionAnticipoLegalizaciones">[];
  valorReducido: number;
}> {
  const legalizaciones = await listarLegalizacionesActivasFactura(ctx, args.factura._id);
  if (legalizaciones.length === 0) {
    return { legalizacionesAjustadas: [], valorReducido: 0 };
  }

  const valorAplicadoActual = legalizaciones.reduce(
    (total, row) => total + row.valorAplicado,
    0
  );
  if (valorAplicadoActual <= args.baseCruceAnticipos + MONEY_TOLERANCE) {
    for (const row of legalizaciones) {
      const anticipo = await ctx.db.get("anticipos", row.anticipoId);
      if (!anticipo) continue;
      await ctx.db.patch("facturacionAnticipoLegalizaciones", row._id, {
        valorContableFactura: getValorContable(args.factura),
        valorContableAnticipo: getValorLegalizableAnticipo(anticipo),
        actualizadoEn: args.now,
      });
    }
    return { legalizacionesAjustadas: [], valorReducido: 0 };
  }

  let exceso = valorAplicadoActual - args.baseCruceAnticipos;
  let valorReducido = 0;
  const legalizacionesAjustadas: Id<"facturacionAnticipoLegalizaciones">[] = [];
  const sorted = [...legalizaciones].sort((a, b) => {
    if (b.creadoEn !== a.creadoEn) return b.creadoEn - a.creadoEn;
    return b._creationTime - a._creationTime;
  });

  for (const row of sorted) {
    if (exceso <= MONEY_TOLERANCE) break;
    const reduccion = Math.min(exceso, row.valorAplicado);
    if (reduccion <= MONEY_TOLERANCE) continue;

    const anticipo = await ctx.db.get("anticipos", row.anticipoId);
    if (!anticipo) continue;

    const saldoAntes = getSaldoLegalizadoAnticipo(anticipo);
    const saldoDespues = Math.max(0, saldoAntes - reduccion);
    const nuevoValorAplicado = row.valorAplicado - reduccion;
    const legalizacionAnticipo = actualizarLegalizacionFacturaEnAnticipo(
      anticipo,
      args.factura._id,
      nuevoValorAplicado
    );

    await reconciliarEstadoLegalizacionAnticipo(
      ctx,
      anticipo,
      saldoDespues,
      args.actorUserId,
      args.now,
      {
        legalizacion: legalizacionAnticipo,
        observaciones: args.comentario,
      }
    );

    if (nuevoValorAplicado <= MONEY_TOLERANCE) {
      await ctx.db.patch("facturacionAnticipoLegalizaciones", row._id, {
        estado: "reemplazada",
        actualizadoEn: args.now,
      });
    } else {
      await ctx.db.patch("facturacionAnticipoLegalizaciones", row._id, {
        valorAplicado: nuevoValorAplicado,
        saldoDespues,
        valorContableFactura: getValorContable(args.factura),
        valorContableAnticipo: getValorLegalizableAnticipo(anticipo),
        actualizadoEn: args.now,
      });
    }

    legalizacionesAjustadas.push(row._id);
    valorReducido += reduccion;
    exceso -= reduccion;
  }

  return { legalizacionesAjustadas, valorReducido };
}
