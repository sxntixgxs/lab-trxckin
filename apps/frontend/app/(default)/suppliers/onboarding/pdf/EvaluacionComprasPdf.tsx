import { Document, Page, View, Text, StyleSheet, Image } from "@react-pdf/renderer";

const RED = "#D60000";
const RED_DARK = "#a10000";
const RED_LIGHT = "#fff5f5";
const SLATE = "#64748b";
const BORDER = "#e2e8f0";
const BORDER_MED = "#94a3b8";
const BLACK = "#0f172a";
const GRAY_BG = "#f8fafc";
const WHITE = "#ffffff";

const DOC = {
  codigo: "PRV-F002",
  version: "01",
  fecha: "2026-01-15",
  titulo: "EVALUACIÓN PARA INSCRIPCIÓN Y ACTUALIZACIÓN DE PROVEEDORES Y CONTRATISTAS",
} as const;

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: BLACK, paddingBottom: 52 },
  headerWrap: { padding: "14 20 0 20" },
  headerTable: { flexDirection: "row", border: `1.5 solid ${BORDER_MED}` },
  headerLogoCell: { width: "22%", borderRight: `1.5 solid ${BORDER_MED}`, padding: "8 10", justifyContent: "center", alignItems: "center" },
  headerLogoImg: { width: 88, height: 32, objectFit: "contain" },
  headerLogoText: { fontSize: 14, fontFamily: "Helvetica-Bold", color: RED, letterSpacing: 1 },
  headerCenterCell: { flex: 1, borderRight: `1.5 solid ${BORDER_MED}`, padding: "10 12", justifyContent: "center", alignItems: "center", minHeight: 56 },
  headerCenterTitleOnly: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BLACK, textTransform: "uppercase", textAlign: "center", lineHeight: 1.35 },
  headerRightCell: { width: "25%" },
  headerRightRow: { borderBottom: `1 solid ${BORDER_MED}`, padding: "5 8", flexDirection: "row", gap: 3, alignItems: "baseline" },
  headerRightRowLast: { padding: "5 8", flexDirection: "row", gap: 3, alignItems: "baseline" },
  headerRightLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: BLACK },
  headerRightValue: { fontSize: 7.5, color: BLACK },
  accentBar: { height: 3, backgroundColor: RED, marginHorizontal: 20, marginTop: 5 },
  metaBar: { backgroundColor: "#fafafa", borderBottom: `1 solid ${BORDER}`, flexDirection: "row", flexWrap: "wrap", padding: "7 20", gap: 18 },
  metaItem: { gap: 1 },
  metaLabel: { fontSize: 7, color: SLATE, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, textTransform: "uppercase" },
  metaValue: { fontSize: 8.5, color: BLACK, fontFamily: "Helvetica-Bold" },
  body: { padding: "14 20", gap: 13 },
  section: { gap: 5 },
  sectionHeader: { backgroundColor: RED, padding: "4 10", borderRadius: 2 },
  sectionTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: WHITE, letterSpacing: 0.8, textTransform: "uppercase" },
  table: { border: `1 solid ${BORDER}`, overflow: "hidden" },
  tableHead: { flexDirection: "row", backgroundColor: "#f1f5f9" },
  tableRow: { flexDirection: "row", borderTop: `1 solid ${BORDER}` },
  tableRowAlt: { flexDirection: "row", borderTop: `1 solid ${BORDER}`, backgroundColor: GRAY_BG },
  cellCriteria: { flex: 3, padding: "5 8" },
  cellOption: { flex: 2, padding: "5 8", borderLeft: `1 solid ${BORDER}` },
  cellScore: { flex: 1, padding: "5 8", borderLeft: `1 solid ${BORDER}`, alignItems: "center" },
  cellText: { fontSize: 8, color: BLACK },
  cellTextBold: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BLACK },
  cellLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.3 },
  resultBox: { border: `1.5 solid ${RED}`, borderRadius: 3, padding: "10 14", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultMetric: { alignItems: "center", gap: 2 },
  resultMetricLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.4 },
  resultMetricValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: BLACK },
  resultMetricSub: { fontSize: 7, color: SLATE },
  statusBadge: { borderRadius: 3, padding: "5 12" },
  statusText: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  alertBox: { borderRadius: 2, padding: "7 10", border: `1 solid #fca5a5`, backgroundColor: RED_LIGHT },
  alertText: { fontSize: 7.5, color: RED_DARK },
  evalBox: { flexDirection: "row", gap: 0, border: `1 solid ${BORDER_MED}`, borderRadius: 2, overflow: "hidden" },
  evalLeft: { flex: 2, backgroundColor: RED, padding: "8 12", justifyContent: "center" },
  evalLeftLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#fca5a5", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 },
  evalLeftName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: WHITE },
  evalRight: { flex: 1, backgroundColor: GRAY_BG, padding: "8 12", justifyContent: "center", borderLeft: `1 solid ${BORDER_MED}` },
  evalRightLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 },
  evalRightDate: { fontSize: 10, fontFamily: "Helvetica-Bold", color: BLACK },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, borderTop: `1.5 solid ${RED}`, padding: "6 20", flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: WHITE },
  footerText: { fontSize: 7, color: SLATE },
});

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  ACEPTABLE: { bg: "#dcfce7", text: "#166534" },
  "PROVEEDOR EN RESERVA": { bg: "#fef9c3", text: "#854d0e" },
  "NO ACEPTABLE": { bg: "#fee2e2", text: "#991b1b" },
};

export interface CriterioRow {
  label: string;
  opcion: string;
  puntos: number | null;
  max: number | null;
}

export interface EvaluacionComprasPdfData {
  logoUrl?: string;
  primaryColor?: string;
  empresaNombre: string;
  razonSocial: string;
  tipoDocumento: string;
  numeroDocumento: string;
  tipoEvaluacion: string;
  servicioSuministrado: string;
  criterios: CriterioRow[];
  sumaPuntos: number;
  maximoPosible: number;
  porcentaje: number;
  calificacion: number;
  proveedorStatus: string;
  evaluadoPor: string;
  fechaEvaluacion: string;
  inscripcionRef: string;
}

export default function EvaluacionComprasPdf({ data }: { data: EvaluacionComprasPdfData }) {
  const sc = STATUS_COLOR[data.proveedorStatus] ?? { bg: "#f1f5f9", text: "#475569" };
  const primaryColor = data.primaryColor ?? RED;

  return (
    <Document title={`${DOC.titulo} — ${data.razonSocial}`} author={data.empresaNombre}>
      <Page size="A4" style={s.page}>
        <View style={s.headerWrap}>
          <View style={s.headerTable}>
            <View style={s.headerLogoCell}>
              {data.logoUrl ? (
                <Image src={data.logoUrl} style={s.headerLogoImg} />
              ) : (
                <Text style={[s.headerLogoText, { color: primaryColor }]}>{data.empresaNombre}</Text>
              )}
            </View>
            <View style={s.headerCenterCell}>
              <Text style={s.headerCenterTitleOnly}>{DOC.titulo}</Text>
            </View>
            <View style={s.headerRightCell}>
              <View style={s.headerRightRow}>
                <Text style={s.headerRightLabel}>Código:</Text>
                <Text style={s.headerRightValue}>{DOC.codigo}</Text>
              </View>
              <View style={s.headerRightRow}>
                <Text style={s.headerRightLabel}>Fecha:</Text>
                <Text style={s.headerRightValue}>{DOC.fecha}</Text>
              </View>
              <View style={s.headerRightRowLast}>
                <Text style={s.headerRightLabel}>Versión:</Text>
                <Text style={s.headerRightValue}>{DOC.version}</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={[s.accentBar, { backgroundColor: primaryColor }]} />

        <View style={s.metaBar}>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Proveedor / Contratista</Text>
            <Text style={s.metaValue}>{data.razonSocial}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Documento</Text>
            <Text style={s.metaValue}>{data.tipoDocumento} {data.numeroDocumento}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Tipo de evaluación</Text>
            <Text style={s.metaValue}>{data.tipoEvaluacion}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Servicio / Suministro</Text>
            <Text style={s.metaValue}>{data.servicioSuministrado}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Ref. inscripción</Text>
            <Text style={s.metaValue}>{data.inscripcionRef}</Text>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}>
              <Text style={s.sectionTitle}>1. Rúbrica de Evaluación</Text>
            </View>
            <View style={s.table}>
              <View style={s.tableHead}>
                <View style={s.cellCriteria}><Text style={s.cellLabel}>Criterio</Text></View>
                <View style={s.cellOption}><Text style={s.cellLabel}>Opción seleccionada</Text></View>
                <View style={s.cellScore}><Text style={s.cellLabel}>Puntaje</Text></View>
                <View style={s.cellScore}><Text style={s.cellLabel}>Máximo</Text></View>
              </View>
              {data.criterios.map((c, i) => (
                <View key={c.label} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                  <View style={s.cellCriteria}><Text style={s.cellTextBold}>{c.label}</Text></View>
                  <View style={s.cellOption}><Text style={s.cellText}>{c.opcion}</Text></View>
                  <View style={s.cellScore}>
                    <Text style={[s.cellTextBold, { color: c.puntos === null ? SLATE : c.puntos === 0 ? "#dc2626" : "#166534" }]}>
                      {c.puntos ?? "—"}
                    </Text>
                  </View>
                  <View style={s.cellScore}><Text style={{ ...s.cellText, color: SLATE }}>{c.max ?? "—"}</Text></View>
                </View>
              ))}
              <View style={[s.tableRow, { backgroundColor: primaryColor }]}>
                <View style={s.cellCriteria}><Text style={[s.cellTextBold, { color: WHITE }]}>TOTAL</Text></View>
                <View style={s.cellOption}><Text style={{ ...s.cellText, color: WHITE }}> </Text></View>
                <View style={s.cellScore}><Text style={[s.cellTextBold, { color: WHITE }]}>{data.sumaPuntos}</Text></View>
                <View style={s.cellScore}><Text style={{ ...s.cellText, color: "#fecaca" }}>{data.maximoPosible}</Text></View>
              </View>
            </View>
          </View>

          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}>
              <Text style={s.sectionTitle}>2. Resultado de la Evaluación</Text>
            </View>
            <View style={[s.resultBox, { borderColor: primaryColor }]}>
              <View style={s.resultMetric}>
                <Text style={s.resultMetricLabel}>Calificación</Text>
                <Text style={s.resultMetricValue}>{data.calificacion.toFixed(2)}</Text>
                <Text style={s.resultMetricSub}>escala 0 – 5</Text>
              </View>
              <View style={s.resultMetric}>
                <Text style={s.resultMetricLabel}>Porcentaje</Text>
                <Text style={s.resultMetricValue}>{data.porcentaje}%</Text>
                <Text style={s.resultMetricSub}>de 100%</Text>
              </View>
              <View style={s.resultMetric}>
                <Text style={s.resultMetricLabel}>Puntos totales</Text>
                <Text style={s.resultMetricValue}>{data.sumaPuntos}</Text>
                <Text style={s.resultMetricSub}>de {data.maximoPosible}</Text>
              </View>
              <View style={{ alignItems: "center", gap: 4 }}>
                <Text style={s.resultMetricLabel}>El proveedor es</Text>
                <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                  <Text style={[s.statusText, { color: sc.text }]}>{data.proveedorStatus}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={s.alertBox}>
            <Text style={s.alertText}>
              NOTA: Un puntaje de 0 en cualquier criterio aplicable califica al proveedor como PROVEEDOR EN RESERVA
              cuando se trate de proveedores críticos o considerados urgentes para ejecución. Los criterios NO APLICA
              se excluyen del cálculo y de esta regla.
            </Text>
          </View>

          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}>
              <Text style={s.sectionTitle}>3. Responsable de la Evaluación</Text>
            </View>
            <View style={s.evalBox}>
              <View style={[s.evalLeft, { backgroundColor: primaryColor }]}>
                <Text style={s.evalLeftLabel}>Evaluado por — COMPRAS</Text>
                <Text style={s.evalLeftName}>{data.evaluadoPor}</Text>
              </View>
              <View style={s.evalRight}>
                <Text style={s.evalRightLabel}>Fecha de evaluación</Text>
                <Text style={s.evalRightDate}>{data.fechaEvaluacion}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[s.footer, { borderTopColor: primaryColor }]} fixed>
          <Text style={s.footerText}>{data.empresaNombre} — Documento confidencial</Text>
          <Text style={s.footerText}>{DOC.codigo} v{DOC.version} · Ref: {data.inscripcionRef} · {data.fechaEvaluacion}</Text>
        </View>
      </Page>
    </Document>
  );
}
