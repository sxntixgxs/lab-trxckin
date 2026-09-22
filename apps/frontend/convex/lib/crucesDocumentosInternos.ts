import { MONEY_TOLERANCE, normalizeMoney } from "./valorAPagar";

export const MAX_NUMERO_DOCUMENTO = 120;

export type ResumenContableCruce = {
  valorContable: number;
  valorDocumentosInternos: number;
  pagosAplicados: number;
  baseCruceAnticipos: number;
  valorAnticiposAplicados: number;
  valorAPagar: number;
  moneda: string;
};

export function normalizeNumeroDocumentoInterno(numero: string): string {
  return numero
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function hasAtMostTwoDecimals(value: number): boolean {
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) <= MONEY_TOLERANCE;
}

export function validateValorAplicadoDocumentoInterno(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("El valor aplicado debe ser un número finito.");
  }
  if (value <= 0) {
    throw new Error("El valor aplicado debe ser mayor que cero.");
  }
  if (!hasAtMostTwoDecimals(value)) {
    throw new Error("El valor aplicado admite como máximo dos decimales.");
  }
  return normalizeMoney(value);
}

export function validateNumeroDocumentoInterno(numero: string): {
  numeroDocumento: string;
  numeroDocumentoNormalizado: string;
} {
  const trimmed = numero.trim();
  if (!trimmed) {
    throw new Error("El número de factura o cuenta de cobro es obligatorio.");
  }
  if (trimmed.length > MAX_NUMERO_DOCUMENTO) {
    throw new Error(
      `El número de documento no puede superar ${MAX_NUMERO_DOCUMENTO} caracteres.`
    );
  }
  const numeroDocumentoNormalizado = normalizeNumeroDocumentoInterno(trimmed);
  if (!numeroDocumentoNormalizado) {
    throw new Error("El número de factura o cuenta de cobro es obligatorio.");
  }
  return { numeroDocumento: trimmed, numeroDocumentoNormalizado };
}

export function computeBaseCruceAnticipos(args: {
  valorContable: number;
  valorDocumentosInternos: number;
  pagosAplicados: number;
}): number {
  return normalizeMoney(
    Math.max(
      0,
      args.valorContable - args.valorDocumentosInternos - args.pagosAplicados
    )
  );
}

export function computeValorAPagarConCruces(args: {
  valorContable: number;
  valorDocumentosInternos: number;
  valorAnticiposAplicados: number;
  pagosAplicados: number;
}): number {
  return normalizeMoney(
    Math.max(
      0,
      args.valorContable -
        args.valorDocumentosInternos -
        args.valorAnticiposAplicados -
        args.pagosAplicados
    )
  );
}

export function assertDocumentosInternosYCruces(args: {
  valorContable: number;
  valorDocumentosInternos: number;
  pagosAplicados: number;
}) {
  const exceso =
    args.valorDocumentosInternos + args.pagosAplicados - args.valorContable;
  if (exceso > MONEY_TOLERANCE) {
    throw new Error(
      "La suma de documentos internos y pagos no puede superar el valor contable."
    );
  }
}

export function buildResumenContableCruce(args: {
  valorContable: number;
  valorDocumentosInternos: number;
  pagosAplicados: number;
  valorAnticiposAplicados: number;
  moneda: string;
}): ResumenContableCruce {
  const baseCruceAnticipos = computeBaseCruceAnticipos({
    valorContable: args.valorContable,
    valorDocumentosInternos: args.valorDocumentosInternos,
    pagosAplicados: args.pagosAplicados,
  });
  const valorAPagar = computeValorAPagarConCruces({
    valorContable: args.valorContable,
    valorDocumentosInternos: args.valorDocumentosInternos,
    valorAnticiposAplicados: args.valorAnticiposAplicados,
    pagosAplicados: args.pagosAplicados,
  });
  return {
    valorContable: normalizeMoney(args.valorContable),
    valorDocumentosInternos: normalizeMoney(args.valorDocumentosInternos),
    pagosAplicados: normalizeMoney(args.pagosAplicados),
    baseCruceAnticipos,
    valorAnticiposAplicados: normalizeMoney(args.valorAnticiposAplicados),
    valorAPagar,
    moneda: args.moneda,
  };
}

export function buildComentarioAutomaticoCruceDocumentoInterno(args: {
  operacion: "agregar" | "editar" | "retirar";
  numeroDocumento: string;
  valorAplicado?: number;
  valorAnterior?: number;
}): string {
  const numero = args.numeroDocumento.trim();
  if (args.operacion === "agregar") {
    return `Documento interno ${numero} agregado por ${formatMoney(args.valorAplicado ?? 0)}.`;
  }
  if (args.operacion === "retirar") {
    return `Documento interno ${numero} retirado (valor aplicado ${formatMoney(args.valorAnterior ?? args.valorAplicado ?? 0)}).`;
  }
  return `Documento interno ${numero} actualizado de ${formatMoney(args.valorAnterior ?? 0)} a ${formatMoney(args.valorAplicado ?? 0)}.`;
}

function formatMoney(value: number) {
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export const FASES_CRUCE_DOCUMENTO_INTERNO = [
  "recepcion",
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "gerencia",
  "revision_tesoreria",
] as const;

export type FaseCruceDocumentoInterno = (typeof FASES_CRUCE_DOCUMENTO_INTERNO)[number];

export function fasePermiteCruceDocumentoInterno(fase: string): fase is FaseCruceDocumentoInterno {
  return (FASES_CRUCE_DOCUMENTO_INTERNO as readonly string[]).includes(fase);
}
