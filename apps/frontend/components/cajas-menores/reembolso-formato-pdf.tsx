import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { formatCOP } from "@/lib/format";
import {
  getDistribucionPercent,
  type CentroCostoDistribucionRow,
} from "@/lib/cajas-menores/centros-costo-distribucion";

export type ReembolsoFormatoSnapshot = {
  numeroReembolso: string;
  empresaNombre: string;
  cajaNombre: string;
  custodioNombre: string;
  custodioEmail: string;
  generadoEn: number;
  valorTotal: number;
  solicitudComentario?: string;
  movimientos: Array<{
    numeroFactura: string;
    proveedorNombre: string;
    proveedorNit?: string;
    concepto: string;
    fechaPago: string;
    centroCostoCodigo: string;
    centroCostoNombre: string;
    centrosCostoDistribucion?: CentroCostoDistribucionRow[];
    valor: number;
  }>;
};

function formatCentroCostoCell(movimiento: ReembolsoFormatoSnapshot["movimientos"][number]) {
  const rows =
    movimiento.centrosCostoDistribucion && movimiento.centrosCostoDistribucion.length > 0
      ? movimiento.centrosCostoDistribucion
      : [
          {
            centroCostoCodigo: movimiento.centroCostoCodigo,
            centroCostoNombre: movimiento.centroCostoNombre,
            valor: movimiento.valor,
          },
        ];

  return rows
    .map((row) => {
      const percent = getDistribucionPercent(row.valor, movimiento.valor).toFixed(1);
      return `${row.centroCostoCodigo} · ${row.centroCostoNombre} · ${formatCOP(row.valor)} (${percent}%)`;
    })
    .join("\n");
}

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: "#475569",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  metaBlock: {
    width: "48%",
  },
  label: {
    fontSize: 8,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
    marginBottom: 6,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  colFactura: { width: "12%" },
  colProveedor: { width: "22%" },
  colConcepto: { width: "24%" },
  colCentro: { width: "18%" },
  colFecha: { width: "12%" },
  colValor: { width: "12%", textAlign: "right" },
  totalRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: 700,
    marginRight: 8,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: 700,
  },
  footer: {
    marginTop: 18,
    fontSize: 9,
    color: "#64748b",
  },
});

function formatFecha(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function ReembolsoFormatoPdf({
  snapshot,
}: {
  snapshot: ReembolsoFormatoSnapshot;
}) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>GFN-F006 · Solicitud de reembolso Caja Menor</Text>
          <Text style={styles.subtitle}>
            {snapshot.numeroReembolso} · {snapshot.empresaNombre}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Caja menor</Text>
            <Text style={styles.value}>{snapshot.cajaNombre}</Text>
            <Text style={styles.label}>Custodio</Text>
            <Text style={styles.value}>
              {snapshot.custodioNombre} · {snapshot.custodioEmail}
            </Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Fecha solicitud</Text>
            <Text style={styles.value}>{formatFecha(snapshot.generadoEn)}</Text>
            {snapshot.solicitudComentario ? (
              <>
                <Text style={styles.label}>Comentario</Text>
                <Text style={styles.value}>{snapshot.solicitudComentario}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colFactura}>Factura</Text>
          <Text style={styles.colProveedor}>Proveedor</Text>
          <Text style={styles.colConcepto}>Concepto</Text>
          <Text style={styles.colCentro}>Centro costo</Text>
          <Text style={styles.colFecha}>Fecha pago</Text>
          <Text style={styles.colValor}>Valor</Text>
        </View>

        {snapshot.movimientos.map((movimiento, index) => (
          <View key={`${movimiento.numeroFactura}-${index}`} style={styles.tableRow}>
            <Text style={styles.colFactura}>{movimiento.numeroFactura}</Text>
            <Text style={styles.colProveedor}>
              {movimiento.proveedorNombre}
              {movimiento.proveedorNit ? `\nNIT ${movimiento.proveedorNit}` : ""}
            </Text>
            <Text style={styles.colConcepto}>{movimiento.concepto}</Text>
            <Text style={styles.colCentro}>
              {formatCentroCostoCell(movimiento)}
            </Text>
            <Text style={styles.colFecha}>{movimiento.fechaPago}</Text>
            <Text style={styles.colValor}>{formatCOP(movimiento.valor)}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total a reembolsar</Text>
          <Text style={styles.totalValue}>{formatCOP(snapshot.valorTotal)}</Text>
        </View>

        <Text style={styles.footer}>
          Formato generado automáticamente desde la solicitud de reembolso de Caja Menor.
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadReembolsoFormatoPdf(
  snapshot: ReembolsoFormatoSnapshot,
  filename?: string,
) {
  const { pdf } = await import("@react-pdf/renderer");
  const blob = await pdf(<ReembolsoFormatoPdf snapshot={snapshot} />).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? `${snapshot.numeroReembolso}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
