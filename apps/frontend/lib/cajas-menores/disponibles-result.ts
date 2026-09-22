export type CajasMenoresDisponiblesContract = "v2" | "legacy" | "invalid";

export type CajasMenoresDisponiblesResult<T> = {
  cajas: T[];
  permitirSaldoNegativo: boolean;
  contract: CajasMenoresDisponiblesContract;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeCajasMenoresDisponibles<T>(
  value: unknown
): CajasMenoresDisponiblesResult<T> {
  if (Array.isArray(value)) {
    return {
      cajas: value as T[],
      permitirSaldoNegativo: false,
      contract: "legacy",
    };
  }

  if (
    isRecord(value) &&
    Array.isArray(value.cajas) &&
    typeof value.permitirSaldoNegativo === "boolean"
  ) {
    return {
      cajas: value.cajas as T[],
      permitirSaldoNegativo: value.permitirSaldoNegativo,
      contract: "v2",
    };
  }

  return {
    cajas: [],
    permitirSaldoNegativo: false,
    contract: "invalid",
  };
}
