import { v } from "convex/values";
import {
  isCentroCostoSiesaIdInScope,
  parseCentroCostoSiesaId,
  resolveCentroCostoCatalogScope,
} from "../../lib/centro-costo-catalog-scope";

export const MAX_CENTROS_COSTO_DISTRIBUCION = 20;

export const centroCostoDistribucionRowValidator = v.object({
  centroCostoId: v.optional(v.string()),
  centroCostoCodigo: v.string(),
  centroCostoNombre: v.string(),
  valor: v.number(),
});

export const centrosCostoDistribucionValidator = v.array(centroCostoDistribucionRowValidator);

export type CentroCostoDistribucionRow = {
  centroCostoId?: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  valor: number;
};

type CentroCostoIdentity = Pick<
  CentroCostoDistribucionRow,
  "centroCostoId" | "centroCostoCodigo" | "centroCostoNombre"
>;

function centroCostoIdentityKey(row: CentroCostoIdentity) {
  return `${row.centroCostoCodigo.trim()}\u0000${row.centroCostoNombre.trim()}`;
}

function assertKnownCentroCostoScope(appEmpresa: number) {
  if (!resolveCentroCostoCatalogScope(appEmpresa)) {
    throw new Error(
      `La empresa ${appEmpresa} no tiene una fuente de centros de costo configurada.`
    );
  }
}

function assertCanonicalCentroCostoIdentity(row: CentroCostoIdentity, appEmpresa: number) {
  const centroCostoId = row.centroCostoId?.trim();
  if (!centroCostoId) {
    throw new Error("Selecciona nuevamente el centro de costo para guardar su ID canónico.");
  }

  const parsed = parseCentroCostoSiesaId(centroCostoId);
  if (
    !parsed ||
    !isCentroCostoSiesaIdInScope(centroCostoId, appEmpresa) ||
    parsed.codigo !== row.centroCostoCodigo.trim()
  ) {
    throw new Error(
      "El ID del centro de costo no corresponde a la empresa, compañía o código seleccionado."
    );
  }
}

export function assertCentrosCostoIdentityTransitionForEmpresa(args: {
  previous: CentroCostoIdentity[];
  next: CentroCostoDistribucionRow[];
  appEmpresa: number;
}) {
  assertKnownCentroCostoScope(args.appEmpresa);

  const legacyIdentityCounts = new Map<string, number>();
  for (const row of args.previous) {
    if (row.centroCostoId?.trim()) continue;
    const key = centroCostoIdentityKey(row);
    legacyIdentityCounts.set(key, (legacyIdentityCounts.get(key) ?? 0) + 1);
  }

  for (const row of args.next) {
    if (row.centroCostoId?.trim()) {
      assertCanonicalCentroCostoIdentity(row, args.appEmpresa);
      continue;
    }

    const key = centroCostoIdentityKey(row);
    const remaining = legacyIdentityCounts.get(key) ?? 0;
    if (remaining === 0) {
      throw new Error("Un centro de costo nuevo o modificado debe incluir un ID canónico válido.");
    }
    legacyIdentityCounts.set(key, remaining - 1);
  }
}

export function roundCOP(amount: number) {
  return Math.round(amount);
}

export function validateCentrosCostoDistribucion(
  distribucion: CentroCostoDistribucionRow[],
  totalEsperado: number
): CentroCostoDistribucionRow[] {
  if (distribucion.length === 0) {
    throw new Error("La distribución de centros de costo es obligatoria.");
  }
  if (distribucion.length > MAX_CENTROS_COSTO_DISTRIBUCION) {
    throw new Error("Máximo 20 centros de costo por movimiento.");
  }

  let sum = 0;
  const normalized: CentroCostoDistribucionRow[] = [];

  for (const row of distribucion) {
    const centroCostoCodigo = row.centroCostoCodigo.trim();
    const centroCostoNombre = row.centroCostoNombre.trim();
    const valor = roundCOP(row.valor);

    if (!centroCostoCodigo || !centroCostoNombre) {
      throw new Error("Cada fila debe tener centro de costo.");
    }
    if (valor <= 0) {
      throw new Error("Cada monto debe ser mayor a cero.");
    }

    sum += valor;
    normalized.push({
      centroCostoId: row.centroCostoId?.trim() || undefined,
      centroCostoCodigo,
      centroCostoNombre,
      valor,
    });
  }

  const totalEsperadoRedondeado = roundCOP(totalEsperado);
  if (sum !== totalEsperadoRedondeado) {
    throw new Error(
      `La distribución debe sumar ${totalEsperadoRedondeado.toLocaleString("es-CO")} COP. Suma actual: ${sum.toLocaleString("es-CO")} COP.`
    );
  }

  return normalized;
}

export function resolveCentrosCostoFromInput(args: {
  centroCostoCodigo?: string;
  centroCostoNombre?: string;
  centroCostoId?: string;
  centrosCostoDistribucion?: CentroCostoDistribucionRow[];
  valorTotal: number;
}): {
  centrosCostoDistribucion: CentroCostoDistribucionRow[];
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centroCostoId?: string;
} {
  if (args.centrosCostoDistribucion?.length) {
    const centrosCostoDistribucion = validateCentrosCostoDistribucion(
      args.centrosCostoDistribucion,
      args.valorTotal
    );
    const first = centrosCostoDistribucion[0]!;
    return {
      centrosCostoDistribucion,
      centroCostoCodigo: first.centroCostoCodigo,
      centroCostoNombre: first.centroCostoNombre,
      centroCostoId: first.centroCostoId,
    };
  }

  const centroCostoCodigo = args.centroCostoCodigo?.trim() ?? "";
  const centroCostoNombre = args.centroCostoNombre?.trim() ?? "";
  if (!centroCostoCodigo || !centroCostoNombre) {
    throw new Error("Selecciona un centro de costo.");
  }

  return {
    centrosCostoDistribucion: [
      {
        centroCostoId: args.centroCostoId?.trim() || undefined,
        centroCostoCodigo,
        centroCostoNombre,
        valor: roundCOP(args.valorTotal),
      },
    ],
    centroCostoCodigo,
    centroCostoNombre,
    centroCostoId: args.centroCostoId?.trim() || undefined,
  };
}
