export const MAX_CENTROS_COSTO_DISTRIBUCION = 20;

export type CentroCostoDistribucionRow = {
  centroCostoId?: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  valor: number;
};

export function roundCOP(amount: number) {
  return Math.round(amount);
}

export function sumDistribucion(distribucion: CentroCostoDistribucionRow[]) {
  return roundCOP(
    distribucion.reduce((total, row) => total + roundCOP(row.valor || 0), 0),
  );
}

export function getDistribucionBalance(totalEsperado: number, distribucion: CentroCostoDistribucionRow[]) {
  const assigned = sumDistribucion(distribucion);
  const expected = roundCOP(totalEsperado);
  return {
    assigned,
    expected,
    remaining: expected - assigned,
  };
}

export function isDistribucionBalanced(
  totalEsperado: number,
  distribucion: CentroCostoDistribucionRow[],
) {
  const { remaining } = getDistribucionBalance(totalEsperado, distribucion);
  return remaining === 0;
}

export function isDistribucionRowComplete(row: CentroCostoDistribucionRow) {
  return (
    Boolean(row.centroCostoCodigo.trim()) &&
    Boolean(row.centroCostoNombre.trim()) &&
    roundCOP(row.valor) > 0
  );
}

export function isDistribucionValid(
  totalEsperado: number,
  distribucion: CentroCostoDistribucionRow[],
) {
  if (distribucion.length === 0 || distribucion.length > MAX_CENTROS_COSTO_DISTRIBUCION) {
    return false;
  }
  if (!isDistribucionBalanced(totalEsperado, distribucion)) {
    return false;
  }
  return distribucion.every(isDistribucionRowComplete);
}

export function getDistribucionPercent(valor: number, total: number) {
  if (total <= 0) return 0;
  return (roundCOP(valor) / roundCOP(total)) * 100;
}

export function createDefaultDistribucion(
  total: number,
  source?: {
    centroCostoCodigo?: string;
    centroCostoNombre?: string;
    centrosCostoDistribucion?: CentroCostoDistribucionRow[];
  },
): CentroCostoDistribucionRow[] {
  if (source?.centrosCostoDistribucion?.length) {
    return source.centrosCostoDistribucion.map((row) => ({
      centroCostoId: row.centroCostoId,
      centroCostoCodigo: row.centroCostoCodigo ?? "",
      centroCostoNombre: row.centroCostoNombre ?? "",
      valor: roundCOP(row.valor),
    }));
  }

  const centroCostoCodigo = source?.centroCostoCodigo?.trim() ?? "";
  const centroCostoNombre = source?.centroCostoNombre?.trim() ?? "";
  if (centroCostoCodigo && centroCostoNombre) {
    return [
      {
        centroCostoCodigo,
        centroCostoNombre,
        valor: roundCOP(total),
      },
    ];
  }

  return [
    {
      centroCostoCodigo: "",
      centroCostoNombre: "",
      valor: roundCOP(total),
    },
  ];
}

export function toLegacyCentroCosto(distribucion: CentroCostoDistribucionRow[]) {
  const first = distribucion[0];
  return {
    centroCostoCodigo: first?.centroCostoCodigo ?? "",
    centroCostoNombre: first?.centroCostoNombre ?? "",
    centroCostoId: first?.centroCostoId,
  };
}
