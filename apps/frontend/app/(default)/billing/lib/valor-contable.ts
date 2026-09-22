import type { Doc } from "@/convex/_generated/dataModel";

export const FASES_EDICION_VALOR_CONTABLE = [
  "causacion",
  "revision_impuestos",
  "eventos_dian",
] as const;

export const FASES_EDICION_VALOR_CONTABLE_LEGALIZACION_ANTICIPO = [
  "causacion",
  "revision_impuestos",
] as const;

function inferDocumentoClase(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "documentoClase" | "tipoDocumento" | "tipoDocumentoNormalizado"
  >
) {
  if (factura.documentoClase) return factura.documentoClase;
  const tipo = (
    factura.tipoDocumentoNormalizado ??
    factura.tipoDocumento ??
    ""
  ).trim();
  if (tipo === "01" || tipo === "1") return "factura";
  if (tipo === "91") return "nota_credito";
  if (tipo === "92") return "nota_debito";
  return "otro";
}

const DOCUMENTO_LABELS: Record<
  ReturnType<typeof inferDocumentoClase>,
  string
> = {
  factura: "Factura",
  nota_credito: "Nota crédito",
  nota_debito: "Nota débito",
  otro: "Otro",
};

export function getDocumentoLabel(
  factura:
    | Pick<
        Doc<"facturacionFacturas">,
        "documentoClase" | "tipoDocumento" | "tipoDocumentoNormalizado"
      >
    | null
    | undefined
) {
  if (!factura) return "Documento";
  return DOCUMENTO_LABELS[inferDocumentoClase(factura)];
}

export function getValorContable(
  factura: Pick<Doc<"facturacionFacturas">, "valorContable" | "total">
) {
  return factura.valorContable ?? factura.total;
}

export function isFacturaNormalParaValorContable(
  factura: Doc<"facturacionFacturas">
) {
  return (
    inferDocumentoClase(factura) === "factura" &&
    !factura.esLegalizacionAnticipo &&
    !factura.esLegalizacionCajaMenor &&
    !factura.esPeaje &&
    factura.rolOperacion !== "PEAJES"
  );
}

export function isFacturaLegalizacionAnticipoParaValorContable(
  factura: Doc<"facturacionFacturas">
) {
  return (
    factura.esLegalizacionAnticipo === true &&
    !factura.esLegalizacionCajaMenor &&
    !factura.esPeaje &&
    factura.rolOperacion !== "PEAJES"
  );
}

export function puedeEditarValorContable(
  fase: string,
  factura: Doc<"facturacionFacturas"> | null | undefined
) {
  if (!factura) return false;
  if (isFacturaLegalizacionAnticipoParaValorContable(factura)) {
    return (
      FASES_EDICION_VALOR_CONTABLE_LEGALIZACION_ANTICIPO as readonly string[]
    ).includes(fase);
  }
  return (
    (FASES_EDICION_VALOR_CONTABLE as readonly string[]).includes(fase) &&
    isFacturaNormalParaValorContable(factura)
  );
}

export function valorContableDiffiereDelTotal(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "valorContable" | "total"
  > | null | undefined
) {
  if (!factura) return false;
  return getValorContable(factura) !== factura.total;
}

export function getValorContableNuevoParaAccion(args: {
  factura: Doc<"facturacionFacturas"> | null | undefined;
  fase: string;
  draft?: number;
}) {
  if (!args.factura || !puedeEditarValorContable(args.fase, args.factura)) {
    return undefined;
  }
  const actual = getValorContable(args.factura);
  const draft = args.draft ?? actual;
  if (!Number.isFinite(draft) || draft < 0) {
    throw new Error("El valor contable debe ser un número válido mayor o igual a cero.");
  }
  if (draft === actual) return undefined;
  return draft;
}

export function parseValorContableInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function shouldPersistValorContableBeforeOpenCruce(args: {
  factura: Pick<Doc<"facturacionFacturas">, "valorContable" | "total"> | null | undefined;
  fase: string;
  draft?: number | null;
}) {
  if (args.draft === null || args.draft === undefined || !args.factura) return false;
  if (!puedeEditarValorContable(args.fase, args.factura as Doc<"facturacionFacturas">)) {
    return false;
  }
  return args.draft !== getValorContable(args.factura);
}

export function formatValorContableInput(value: number, currency = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "COP" ? 0 : 2,
  }).format(Math.round(value));
}
