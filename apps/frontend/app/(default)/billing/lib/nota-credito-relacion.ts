import type { Doc, Id } from "@/convex/_generated/dataModel";

export type NotaCreditoRelacionResumen = {
  tipo: "factura" | "nota_credito";
  cantidadNotasCredito: number;
  valorNotasCredito: number;
  notasCredito: Array<{
    facturaId: Id<"facturacionFacturas">;
    numeroFactura: string;
    total: number;
    moneda: string;
  }>;
  facturaOrigen?: {
    facturaId: Id<"facturacionFacturas">;
    numeroFactura: string;
    total: number;
    moneda: string;
  };
};

type NotaCreditoRelacionDetalle = {
  esPeajes?: boolean;
  facturaOrigen: Doc<"facturacionFacturas"> | null;
  notasCredito: Array<Doc<"facturacionFacturas">>;
  origenRelacion?: "dian" | "manual" | "sin_relacion";
};

function toNotaCreditoRelacionItem(factura: Doc<"facturacionFacturas">) {
  return {
    facturaId: factura._id,
    numeroFactura: factura.numeroFactura,
    total: factura.total,
    moneda: factura.moneda,
  };
}

function isNotaCreditoRelacionResumen(
  relacion: unknown,
): relacion is NotaCreditoRelacionResumen {
  return (
    typeof relacion === "object" &&
    relacion !== null &&
    "valorNotasCredito" in relacion &&
    typeof (relacion as NotaCreditoRelacionResumen).valorNotasCredito ===
      "number"
  );
}

function isNotaCreditoDocumento(factura: Doc<"facturacionFacturas"> | null) {
  if (!factura) return false;
  const tipo = factura.tipoDocumentoNormalizado ?? factura.tipoDocumento;
  return factura.documentoClase === "nota_credito" || tipo === "91";
}

export function normalizeNotaCreditoRelacion(
  relacion: NotaCreditoRelacionResumen | NotaCreditoRelacionDetalle | null | undefined,
  factura: Doc<"facturacionFacturas"> | null | undefined,
): NotaCreditoRelacionResumen | null {
  if (!relacion) return null;
  if (isNotaCreditoRelacionResumen(relacion)) return relacion;

  if (
    typeof relacion !== "object" ||
    !("facturaOrigen" in relacion) ||
    !("notasCredito" in relacion) ||
    !Array.isArray(relacion.notasCredito)
  ) {
    return null;
  }

  const detalle = relacion as NotaCreditoRelacionDetalle;
  if (detalle.esPeajes) return null;

  const notasCredito = detalle.notasCredito.map(toNotaCreditoRelacionItem);
  if (notasCredito.length === 0) return null;

  const facturaOrigen = detalle.facturaOrigen
    ? toNotaCreditoRelacionItem(detalle.facturaOrigen)
    : undefined;
  const valorNotasCredito = notasCredito.reduce(
    (total, nota) => total + nota.total,
    0,
  );

  if (isNotaCreditoDocumento(factura ?? null)) {
    return {
      tipo: "nota_credito",
      cantidadNotasCredito: notasCredito.length,
      valorNotasCredito,
      notasCredito,
      ...(facturaOrigen ? { facturaOrigen } : {}),
    };
  }

  return {
    tipo: "factura",
    cantidadNotasCredito: notasCredito.length,
    valorNotasCredito,
    notasCredito,
    ...(facturaOrigen ? { facturaOrigen } : {}),
  };
}
