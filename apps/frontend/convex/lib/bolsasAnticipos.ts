import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeEmpresa } from "./normalize";

const SIN_PROCESO_KEY = "sin-proceso";
const SIN_PROCESO_NOMBRE = "Sin proceso";
const PEAJES_KEY = "peajes";
const PEAJES_NOMBRE = "PEAJES";

export type TipoBolsaAnticipo = "general" | "peajes";

export type BolsaProcesoInput = {
  tipoBolsa?: TipoBolsaAnticipo;
  procesoId?: number;
  procesoNombre?: string;
};

export type BolsaAnticipoKeyInput = BolsaProcesoInput & {
  empresa?: number;
};

export type BolsaAnticipoSnapshot = {
  empresa: number;
  tipoBolsa: TipoBolsaAnticipo;
  procesoKey: string;
  procesoId?: number;
  procesoNombre?: string;
};

type BolsaCtx = QueryCtx | MutationCtx;

export function normalizeEmpresaBolsa(empresa?: number) {
  return normalizeEmpresa(empresa);
}

export function sanitizeProcesoBolsaNombre(nombre?: string | null) {
  const trimmed = nombre?.trim().replace(/\s+/g, " ");
  return trimmed || undefined;
}

export function normalizeProcesoBolsaNombre(nombre?: string | null) {
  return sanitizeProcesoBolsaNombre(nombre)
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeTipoBolsa(tipoBolsa?: TipoBolsaAnticipo): TipoBolsaAnticipo {
  return tipoBolsa === "peajes" ? "peajes" : "general";
}

export function buildBolsaAnticipoSnapshot(
  input: BolsaAnticipoKeyInput
): BolsaAnticipoSnapshot {
  const empresa = normalizeEmpresaBolsa(input.empresa);
  const tipoBolsa = normalizeTipoBolsa(input.tipoBolsa);

  if (tipoBolsa === "peajes") {
    return {
      empresa,
      tipoBolsa,
      procesoKey: PEAJES_KEY,
      procesoNombre: PEAJES_NOMBRE,
    };
  }

  if (
    typeof input.procesoId === "number" &&
    Number.isFinite(input.procesoId)
  ) {
    return {
      empresa,
      tipoBolsa,
      procesoKey: `procesoId:${input.procesoId}`,
      procesoId: input.procesoId,
      procesoNombre: sanitizeProcesoBolsaNombre(input.procesoNombre),
    };
  }

  const procesoNombre = sanitizeProcesoBolsaNombre(input.procesoNombre);
  const nombreKey = normalizeProcesoBolsaNombre(procesoNombre);
  if (nombreKey) {
    return {
      empresa,
      tipoBolsa,
      procesoKey: `procesoNombre:${nombreKey}`,
      procesoNombre,
    };
  }

  return {
    empresa,
    tipoBolsa,
    procesoKey: SIN_PROCESO_KEY,
    procesoNombre: SIN_PROCESO_NOMBRE,
  };
}

export function buildBolsaSnapshotFromAnticipo(
  anticipo: Pick<
    Doc<"anticipos">,
    "empresa" | "empresa_id" | "tipoBolsa" | "procesoId" | "procesoNombre"
  >
) {
  return buildBolsaAnticipoSnapshot({
    empresa: anticipo.empresa_id ?? anticipo.empresa,
    tipoBolsa: anticipo.tipoBolsa,
    procesoId: anticipo.procesoId,
    procesoNombre: anticipo.procesoNombre,
  });
}

export function buildBolsaSnapshotFromFactura(
  factura: Pick<
    Doc<"facturacionFacturas">,
    | "empresa"
    | "esPeaje"
    | "rolOperacion"
    | "anticipoProcesoId"
    | "anticipoProcesoNombre"
  >
) {
  const isPeajes = factura.esPeaje === true || factura.rolOperacion === "PEAJES";
  return buildBolsaAnticipoSnapshot({
    empresa: factura.empresa,
    tipoBolsa: isPeajes ? "peajes" : "general",
    procesoId: factura.anticipoProcesoId,
    procesoNombre: factura.anticipoProcesoNombre,
  });
}

export async function getBolsaAnticipoBySnapshot(
  ctx: BolsaCtx,
  snapshot: BolsaAnticipoSnapshot
) {
  return await ctx.db
    .query("bolsasAnticipos")
    .withIndex("by_empresa_tipoBolsa_procesoKey", (q) =>
      q
        .eq("empresa", snapshot.empresa)
        .eq("tipoBolsa", snapshot.tipoBolsa)
        .eq("procesoKey", snapshot.procesoKey)
    )
    .first();
}

export async function ensureBolsaAnticipo(
  ctx: MutationCtx,
  input: BolsaAnticipoKeyInput,
  now = Date.now()
): Promise<Id<"bolsasAnticipos">> {
  const snapshot = buildBolsaAnticipoSnapshot(input);
  const existing = await getBolsaAnticipoBySnapshot(ctx, snapshot);
  if (existing) {
    const patch: Partial<Doc<"bolsasAnticipos">> = {};
    if (!existing.procesoNombre && snapshot.procesoNombre) {
      patch.procesoNombre = snapshot.procesoNombre;
    }
    if (existing.procesoId === undefined && snapshot.procesoId !== undefined) {
      patch.procesoId = snapshot.procesoId;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("bolsasAnticipos", existing._id, { ...patch, actualizadoEn: now });
    }
    return existing._id;
  }

  return await ctx.db.insert("bolsasAnticipos", {
    empresa: snapshot.empresa,
    tipoBolsa: snapshot.tipoBolsa,
    procesoKey: snapshot.procesoKey,
    procesoId: snapshot.procesoId,
    procesoNombre: snapshot.procesoNombre,
    estado: "activa",
    creadoEn: now,
    actualizadoEn: now,
  });
}

export async function resolveBolsaIdForAnticipo(
  ctx: BolsaCtx,
  anticipo: Pick<
    Doc<"anticipos">,
    | "bolsaId"
    | "empresa"
    | "empresa_id"
    | "tipoBolsa"
    | "procesoId"
    | "procesoNombre"
  >
) {
  if (anticipo.bolsaId) return anticipo.bolsaId;
  const bolsa = await getBolsaAnticipoBySnapshot(
    ctx,
    buildBolsaSnapshotFromAnticipo(anticipo)
  );
  return bolsa?._id;
}

export async function resolveBolsaIdForFactura(
  ctx: BolsaCtx,
  factura: Pick<
    Doc<"facturacionFacturas">,
    | "anticipoBolsaId"
    | "empresa"
    | "esPeaje"
    | "rolOperacion"
    | "anticipoProcesoId"
    | "anticipoProcesoNombre"
  >
) {
  if (factura.anticipoBolsaId) return factura.anticipoBolsaId;
  const bolsa = await getBolsaAnticipoBySnapshot(
    ctx,
    buildBolsaSnapshotFromFactura(factura)
  );
  return bolsa?._id;
}
