import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { SUPPLIER_FASE_LABELS, SUPPLIER_FASES_ORDEN_REPORTE } from "@/lib/onboarding/phases/suppliers";

const SLATE = "#64748b";
const BORDER = "#e2e8f0";
const BLACK = "#0f172a";
const WHITE = "#ffffff";
const GREEN = "#15803d";
const GREEN_BG = "#dcfce7";
const RED = "#b91c1c";
const RED_BG = "#fee2e2";

export type ReporteTiempoFase = {
  fase: string;
  estado: string;
  fechaInicio: number | null;
  fechaCompletado: number | null;
};

export type ReporteTiempoFasesData = {
  empresaNombre: string;
  inscripcionRef: string;
  generadoEn: number;
  tipoSolicitud: string;
  tipoDocumento: string;
  numeroDocumento: string;
  razonSocial: string;
  riesgo: string;
  estadoFinal: "COMPLETADO" | "RECHAZADO" | "ANULADA";
  fechaInicioProceso: number;
  fechaCierre: number | null;
  fases: ReporteTiempoFase[];
};

function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function diffDays(from: number | null | undefined, to: number | null | undefined): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.round(((to - from) / (1000 * 60 * 60 * 24)) * 100) / 100);
}

function formatDuration(days: number | null): string {
  if (days == null) return "-";
  if (days < 1) return `${Math.round(days * 24)} h`;
  return `${days.toFixed(days < 10 ? 2 : 1)} d`;
}

function estadoLabel(estado: string): string {
  const labels: Record<string, string> = {
    PENDIENTE: "Pendiente",
    EN_PROGRESO: "En progreso",
    COMPLETADO: "Completado",
    RECHAZADO: "Rechazado",
    ANULADA: "Anulada",
  };
  return labels[estado] ?? estado;
}

function faseSort(a: ReporteTiempoFase, b: ReporteTiempoFase): number {
  const ia = SUPPLIER_FASES_ORDEN_REPORTE.indexOf(a.fase);
  const ib = SUPPLIER_FASES_ORDEN_REPORTE.indexOf(b.fase);
  if (ia === -1 && ib === -1) return (a.fechaInicio ?? 0) - (b.fechaInicio ?? 0);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

const s = StyleSheet.create({
  page: { padding: 24, fontFamily: "Helvetica", fontSize: 9, color: BLACK, backgroundColor: "#f8fafc" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: BLACK, marginBottom: 4 },
  subtitle: { fontSize: 8, color: SLATE, marginBottom: 12 },
  panel: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: BORDER,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  metaGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
  metaCell: {
    flex: 1,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: BORDER,
    borderRadius: 6,
    padding: "7 9",
  },
  metaLabel: { fontSize: 6.5, color: SLATE, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  metaValue: { fontSize: 8.5, color: BLACK, fontFamily: "Helvetica-Bold" },
  tableHeader: { flexDirection: "row", backgroundColor: "#f1f5f9", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: BORDER },
  row: { flexDirection: "row", backgroundColor: WHITE, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: BORDER },
  rowLast: { flexDirection: "row", backgroundColor: WHITE },
  th: { padding: "8 9", fontSize: 7, color: SLATE, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  td: { padding: "8 9", fontSize: 8.5, color: "#334155" },
  tdStrong: { padding: "8 9", fontSize: 8.5, color: BLACK, fontFamily: "Helvetica-Bold" },
  badge: { alignSelf: "flex-start", borderRadius: 10, padding: "3 7" },
  badgeText: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  footer: { position: "absolute", bottom: 12, left: 24, right: 24, flexDirection: "row", justifyContent: "space-between", color: SLATE, fontSize: 7 },
});

function EstadoBadge({ estado }: { estado: string }) {
  const completado = estado === "COMPLETADO";
  const rechazado = estado === "RECHAZADO" || estado === "ANULADA";
  const bg = completado ? GREEN_BG : rechazado ? RED_BG : "#e0f2fe";
  const color = completado ? GREEN : rechazado ? RED : "#0369a1";
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color }]}>{estadoLabel(estado)}</Text>
    </View>
  );
}

export default function ReporteTiempoFasesPdf({ data }: { data: ReporteTiempoFasesData }) {
  const fases = data.fases.slice().sort(faseSort);
  const diasTotales = diffDays(data.fechaInicioProceso, data.fechaCierre);

  return (
    <Document title={`Reporte tiempos proveedor ${data.inscripcionRef}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>Reporte de tiempos por fase</Text>
        <Text style={s.subtitle}>
          {data.empresaNombre} · Ref. {data.inscripcionRef} · Generado {formatDateTime(data.generadoEn)}
        </Text>

        <View style={s.metaGrid}>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Tipo solicitud</Text>
            <Text style={s.metaValue}>{data.tipoSolicitud}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Documento</Text>
            <Text style={s.metaValue}>{data.tipoDocumento} {data.numeroDocumento}</Text>
          </View>
          <View style={[s.metaCell, { flex: 1.7 }]}>
            <Text style={s.metaLabel}>Razón social</Text>
            <Text style={s.metaValue}>{data.razonSocial}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Riesgo</Text>
            <Text style={s.metaValue}>{data.riesgo}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Días totales</Text>
            <Text style={s.metaValue}>{formatDuration(diasTotales)}</Text>
          </View>
        </View>

        <View style={s.panel}>
          <View style={s.tableHeader}>
            <Text style={[s.th, { flex: 1.1 }]}>Tipo solicitud</Text>
            <Text style={[s.th, { flex: 1.3 }]}>Documento</Text>
            <Text style={[s.th, { flex: 2 }]}>Razón social</Text>
            <Text style={[s.th, { flex: 1 }]}>Riesgo</Text>
            <Text style={[s.th, { flex: 1.2 }]}>Estado final</Text>
            <Text style={[s.th, { flex: 1.4 }]}>Inicio</Text>
            <Text style={[s.th, { flex: 1.4 }]}>Cierre</Text>
            <Text style={[s.th, s.right, { flex: 0.8 }]}>Días</Text>
          </View>
          <View style={s.rowLast}>
            <Text style={[s.tdStrong, { flex: 1.1 }]}>{data.tipoSolicitud}</Text>
            <Text style={[s.td, { flex: 1.3 }]}>{data.tipoDocumento} {data.numeroDocumento}</Text>
            <Text style={[s.tdStrong, { flex: 2 }]}>{data.razonSocial}</Text>
            <Text style={[s.tdStrong, { flex: 1, color: data.riesgo === "SUPERIOR" ? RED : BLACK }]}>{data.riesgo}</Text>
            <View style={[s.td, { flex: 1.2 }]}>
              <EstadoBadge estado={data.estadoFinal} />
            </View>
            <Text style={[s.td, { flex: 1.4 }]}>{formatDateTime(data.fechaInicioProceso)}</Text>
            <Text style={[s.td, { flex: 1.4 }]}>{formatDateTime(data.fechaCierre)}</Text>
            <Text style={[s.tdStrong, s.right, { flex: 0.8 }]}>{formatDuration(diasTotales)}</Text>
          </View>
        </View>

        <View style={s.panel}>
          <View style={s.tableHeader}>
            <Text style={[s.th, { flex: 2.2 }]}>Fase</Text>
            <Text style={[s.th, { flex: 1.1 }]}>Estado</Text>
            <Text style={[s.th, { flex: 1.7 }]}>Inicio</Text>
            <Text style={[s.th, { flex: 1.7 }]}>Fin</Text>
            <Text style={[s.th, s.right, { flex: 0.7 }]}>Días</Text>
          </View>
          {fases.map((fase, index) => {
            const duracion = diffDays(fase.fechaInicio, fase.fechaCompletado);
            const rowStyle = index === fases.length - 1 ? s.rowLast : s.row;
            return (
              <View key={`${fase.fase}-${index}`} style={rowStyle}>
                <Text style={[s.tdStrong, { flex: 2.2 }]}>{SUPPLIER_FASE_LABELS[fase.fase] ?? fase.fase}</Text>
                <Text style={[s.td, { flex: 1.1 }]}>{estadoLabel(fase.estado)}</Text>
                <Text style={[s.td, { flex: 1.7 }]}>{formatDateTime(fase.fechaInicio)}</Text>
                <Text style={[s.td, { flex: 1.7 }]}>{formatDateTime(fase.fechaCompletado)}</Text>
                <Text style={[s.tdStrong, s.right, { flex: 0.7 }]}>{formatDuration(duracion)}</Text>
              </View>
            );
          })}
          {fases.length === 0 ? (
            <View style={s.rowLast}>
              <Text style={[s.td, { flex: 1 }]}>Sin fases registradas.</Text>
            </View>
          ) : null}
        </View>

        <View style={s.footer}>
          <Text>Reporte automático de inscripción de proveedores</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
