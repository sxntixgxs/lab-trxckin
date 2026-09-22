import { Document, Page, View, Text, StyleSheet, Image } from "@react-pdf/renderer";
import { computeSupplierFactorRisks } from "@/lib/onboarding/risk/supplier-matrix";
import { computeCustomerFactorRisks } from "@/lib/onboarding/risk/customer-matrix";
import type { FactorRisk } from "@/lib/onboarding/risk/compute";

const RED = "#D60000";
const RED_BG = "#fff5f5";
const SLATE = "#64748b";
const BORDER = "#e2e8f0";
const BORDER_MED = "#94a3b8";
const BLACK = "#0f172a";
const GRAY_BG = "#f8fafc";
const WHITE = "#ffffff";

export type MatrizRiesgoModulo = "supplier" | "customer";

const DOCS: Record<MatrizRiesgoModulo, { codigo: string; version: string; fecha: string; titulo: string; tercero: string; seccion: string }> = {
  supplier: {
    codigo: "CUM-F001",
    version: "01",
    fecha: "2026-01-15",
    titulo: "MATRIZ DE EVALUACIÓN DE TERCEROS - PROVEEDORES Y/O CONTRATISTAS",
    tercero: "Proveedor / Contratista",
    seccion: "1. Datos del Proveedor",
  },
  customer: {
    codigo: "CUM-F002",
    version: "01",
    fecha: "2026-03-27",
    titulo: "MATRIZ DE EVALUACIÓN DE TERCEROS — CLIENTES",
    tercero: "Cliente",
    seccion: "1. Datos del Cliente",
  },
};

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
  metaBar: { backgroundColor: GRAY_BG, borderBottom: `1 solid ${BORDER}`, flexDirection: "row", padding: "7 20", gap: 24 },
  metaItem: { gap: 1 },
  metaLabel: { fontSize: 7, color: SLATE, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, textTransform: "uppercase" },
  metaValue: { fontSize: 8.5, color: BLACK, fontFamily: "Helvetica-Bold" },
  body: { padding: "14 20", gap: 14 },
  section: { gap: 6 },
  sectionHeader: { backgroundColor: RED, padding: "5 10", borderRadius: 2, flexDirection: "row", alignItems: "center" },
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: WHITE, letterSpacing: 0.8, textTransform: "uppercase" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  gridItem: { border: `1 solid ${BORDER}`, borderLeftWidth: 3, borderLeftColor: "#e2e8f0", borderRadius: 2, padding: "5 8", minWidth: "47%", flex: 1, backgroundColor: WHITE },
  gridItemAccent: { border: `1 solid ${BORDER}`, borderLeftWidth: 3, borderLeftColor: RED, borderRadius: 2, padding: "5 8", minWidth: "47%", flex: 1, backgroundColor: WHITE },
  gridLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2, gap: 4 },
  gridLabel: { fontSize: 7, color: SLATE, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4 },
  gridValue: { fontSize: 9, color: BLACK },
  gridValueBold: { fontSize: 9, color: BLACK, fontFamily: "Helvetica-Bold" },
  factorBadge: { borderRadius: 8, paddingVertical: 1, paddingHorizontal: 5, flexDirection: "row", alignItems: "center", gap: 3 },
  factorBadgeScore: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  factorBadgeLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.3, textTransform: "uppercase" },
  riskBox: { border: `1.5 solid ${RED}`, borderRadius: 3, backgroundColor: RED_BG, overflow: "hidden" },
  riskBoxHeader: { backgroundColor: RED, padding: "4 12" },
  riskBoxHeaderText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: WHITE, textTransform: "uppercase", letterSpacing: 0.6 },
  riskBoxBody: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", padding: "12 14" },
  riskBoxDivider: { width: 1, backgroundColor: BORDER, alignSelf: "stretch" },
  riskBoxItem: { alignItems: "center", gap: 5 },
  riskBoxItemLabel: { fontSize: 7.5, color: SLATE, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4 },
  riskBadge: { borderRadius: 3, padding: "5 16" },
  riskBadgeText: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  badgeYes: { backgroundColor: "#fee2e2", borderRadius: 3, padding: "2 6" },
  badgeNo: { backgroundColor: "#dcfce7", borderRadius: 3, padding: "2 6" },
  badgeYesText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#991b1b" },
  badgeNoText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#166534" },
  reviewerBox: { border: `1.5 solid ${BORDER_MED}`, borderRadius: 2, overflow: "hidden" },
  reviewerHeader: { backgroundColor: "#1e293b", padding: "5 10", flexDirection: "row", alignItems: "center", gap: 6 },
  reviewerHeaderAccent: { width: 3, height: 12, backgroundColor: RED, borderRadius: 1 },
  reviewerHeaderText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: WHITE, letterSpacing: 1, textTransform: "uppercase" },
  reviewerBody: { flexDirection: "row" },
  reviewerCol: { flex: 1, padding: "9 12", gap: 3 },
  reviewerColDivider: { width: 1, backgroundColor: BORDER },
  reviewerColLabel: { fontSize: 7, color: SLATE, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4 },
  reviewerColValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: BLACK },
  reviewerColValuePending: { fontSize: 9, color: SLATE, fontStyle: "italic" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, borderTop: `2 solid ${RED}`, padding: "6 20", flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: WHITE },
  footerLeft: { fontSize: 7, color: SLATE },
  footerRight: { fontSize: 7, color: SLATE },
});

const RIESGO_COLOR: Record<string, { bg: string; text: string }> = {
  BAJO: { bg: "#dcfce7", text: "#166534" },
  MEDIO: { bg: "#fef9c3", text: "#854d0e" },
  ALTO: { bg: "#ffedd5", text: "#9a3412" },
  SUPERIOR: { bg: "#fee2e2", text: "#991b1b" },
  "SOLO LISTAS": { bg: "#dcfce7", text: "#166534" },
  SIMPLIFICADA: { bg: "#fef9c3", text: "#854d0e" },
  COMPLETA: { bg: "#ffedd5", text: "#9a3412" },
  INTENSIFICADA: { bg: "#fee2e2", text: "#991b1b" },
  INDEFINIDO: { bg: "#f1f5f9", text: "#475569" },
};

function FactorRiskBadge({ factor }: { factor: FactorRisk }) {
  const color = RIESGO_COLOR[factor.nivel] ?? RIESGO_COLOR.INDEFINIDO;
  const scoreLabel = factor.score > 0 ? String(factor.score) : "—";
  return (
    <View style={[s.factorBadge, { backgroundColor: color.bg }]}>
      <Text style={[s.factorBadgeScore, { color: color.text }]}>{scoreLabel}</Text>
      <Text style={[s.factorBadgeLabel, { color: color.text }]}>· {factor.nivel}</Text>
    </View>
  );
}

export interface MatrizRiesgoPdfData {
  /** Módulo que define el encabezado del documento y la matriz de factores (proveedores por defecto). */
  modulo?: MatrizRiesgoModulo;
  tipoSolicitud?: string;
  razonSocial: string;
  tipoDocumento: string;
  numeroDocumento: string;
  tipoPersona: string;
  servicioSuministrado: string;
  montoAnual: string;
  sectorEconomico: string;
  actividadEconomicaPrincipal: string;
  codigoCiiu: string;
  codigoCiiuSecundario?: string;
  actividadEconomicaSecundaria?: string;
  jurisdiccionNacional: string;
  jurisdiccionInternacional: string;
  isPep: boolean;
  listas: string;
  riesgo: string;
  tipoEvaluacion: string;
  createdAt: string;
  inscripcionRef: string;
  logoUrl?: string;
  primaryColor?: string;
  empresaNombre: string;
  revisadoPorNombre?: string;
  fechaRevisionCumplimiento?: string;
}

export default function MatrizRiesgoPdf({ data }: { data: MatrizRiesgoPdfData }) {
  const primaryColor = data.primaryColor ?? RED;
  const riskColor = RIESGO_COLOR[data.riesgo] ?? RIESGO_COLOR.INDEFINIDO;
  const evalColor = RIESGO_COLOR[data.tipoEvaluacion] ?? RIESGO_COLOR.INDEFINIDO;
  const reviewed = !!data.revisadoPorNombre;
  const modulo: MatrizRiesgoModulo = data.modulo ?? "supplier";
  const DOC = DOCS[modulo];
  const computeFactors = modulo === "customer" ? computeCustomerFactorRisks : computeSupplierFactorRisks;

  const factors = computeFactors({
    montoAnual: data.montoAnual,
    sectorEconomico: data.sectorEconomico,
    jurisdiccionNacional: data.jurisdiccionNacional,
    jurisdiccionInternacional: data.jurisdiccionInternacional,
    isPep: data.isPep,
    listas: data.listas,
  });

  return (
    <Document title={`Matriz de Riesgo — ${data.razonSocial}`} author={data.empresaNombre}>
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
            <Text style={s.metaLabel}>Tipo solicitud</Text>
            <Text style={s.metaValue}>{data.tipoSolicitud ?? "INSCRIPCIÓN"}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>{DOC.tercero}</Text>
            <Text style={s.metaValue}>{data.razonSocial}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Documento</Text>
            <Text style={s.metaValue}>{data.tipoDocumento} {data.numeroDocumento}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Fecha de emisión</Text>
            <Text style={s.metaValue}>{data.createdAt}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Referencia</Text>
            <Text style={s.metaValue}>{data.inscripcionRef}</Text>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}>
              <Text style={s.sectionTitle}>{DOC.seccion}</Text>
            </View>
            <View style={s.grid}>
              <View style={[s.gridItemAccent, { minWidth: "97%", borderLeftColor: primaryColor }]}>
                <Text style={s.gridLabel}>Razón social / Nombre</Text>
                <Text style={s.gridValueBold}>{data.razonSocial}</Text>
              </View>
              <View style={s.gridItem}>
                <Text style={s.gridLabel}>Tipo de persona</Text>
                <Text style={s.gridValue}>{data.tipoPersona === "PERSONA_JURIDICA" ? "Persona Jurídica" : "Persona Natural"}</Text>
              </View>
              <View style={s.gridItem}>
                <Text style={s.gridLabel}>Tipo de documento</Text>
                <Text style={s.gridValue}>{data.tipoDocumento}</Text>
              </View>
              <View style={s.gridItem}>
                <Text style={s.gridLabel}>Número de documento</Text>
                <Text style={s.gridValueBold}>{data.numeroDocumento}</Text>
              </View>
            </View>
          </View>

          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}>
              <Text style={s.sectionTitle}>2. Análisis de Riesgo</Text>
            </View>
            <Text style={{ fontSize: 7, color: SLATE, fontStyle: "italic" }}>
              Cada factor se puntúa de 1 a 4 (1 = Bajo, 2 = Medio, 3 = Alto, 4 = Superior). El nivel de riesgo del
              tercero corresponde al máximo puntaje obtenido.
            </Text>
            <View style={s.grid}>
              <View style={[s.gridItem, { minWidth: "97%" }]}>
                <Text style={s.gridLabel}>Servicio / Producto suministrado</Text>
                <Text style={s.gridValue}>{data.servicioSuministrado}</Text>
              </View>
              <View style={s.gridItem}>
                <View style={s.gridLabelRow}>
                  <Text style={s.gridLabel}>Monto anual estimado</Text>
                  <FactorRiskBadge factor={factors.montoAnual} />
                </View>
                <Text style={s.gridValue}>{data.montoAnual}</Text>
              </View>
              <View style={s.gridItem}>
                <View style={s.gridLabelRow}>
                  <Text style={s.gridLabel}>Sector económico</Text>
                  <FactorRiskBadge factor={factors.sectorEconomico} />
                </View>
                <Text style={s.gridValue}>{data.sectorEconomico}</Text>
              </View>
              <View style={s.gridItem}>
                <Text style={s.gridLabel}>CIIU principal — código</Text>
                <Text style={s.gridValue}>{data.codigoCiiu || "—"}</Text>
              </View>
              <View style={s.gridItem}>
                <Text style={s.gridLabel}>Actividad económica principal</Text>
                <Text style={s.gridValue}>{data.actividadEconomicaPrincipal || "—"}</Text>
              </View>
              <View style={s.gridItem}>
                <Text style={s.gridLabel}>CIIU secundario — código</Text>
                <Text style={s.gridValue}>{data.codigoCiiuSecundario?.trim() || "—"}</Text>
              </View>
              <View style={s.gridItem}>
                <Text style={s.gridLabel}>Actividad económica secundaria</Text>
                <Text style={s.gridValue}>{data.actividadEconomicaSecundaria?.trim() || "—"}</Text>
              </View>
              <View style={s.gridItem}>
                <View style={s.gridLabelRow}>
                  <Text style={s.gridLabel}>Jurisdicción nacional</Text>
                  <FactorRiskBadge factor={factors.jurisdiccionNacional} />
                </View>
                <Text style={s.gridValue}>{data.jurisdiccionNacional || "—"}</Text>
              </View>
              <View style={s.gridItem}>
                <View style={s.gridLabelRow}>
                  <Text style={s.gridLabel}>Jurisdicción internacional</Text>
                  <FactorRiskBadge factor={factors.jurisdiccionInternacional} />
                </View>
                <Text style={s.gridValue}>{data.jurisdiccionInternacional || "—"}</Text>
              </View>
              <View style={s.gridItem}>
                <View style={s.gridLabelRow}>
                  <Text style={s.gridLabel}>¿Es PEP?</Text>
                  <FactorRiskBadge factor={factors.isPep} />
                </View>
                <View style={data.isPep ? s.badgeYes : s.badgeNo}>
                  <Text style={data.isPep ? s.badgeYesText : s.badgeNoText}>
                    {data.isPep ? "SÍ — Persona Expuesta Políticamente" : "NO"}
                  </Text>
                </View>
              </View>
              <View style={s.gridItem}>
                <View style={s.gridLabelRow}>
                  <Text style={s.gridLabel}>Consulta de listas restrictivas</Text>
                  <FactorRiskBadge factor={factors.listas} />
                </View>
                <Text style={s.gridValue}>{data.listas || "—"}</Text>
              </View>
            </View>
          </View>

          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}>
              <Text style={s.sectionTitle}>3. Resultado de Evaluación</Text>
            </View>
            <View style={[s.riskBox, { borderColor: primaryColor }]}>
              <View style={[s.riskBoxHeader, { backgroundColor: primaryColor }]}>
                <Text style={s.riskBoxHeaderText}>Clasificación de riesgo del tercero</Text>
              </View>
              <View style={s.riskBoxBody}>
                <View style={s.riskBoxItem}>
                  <Text style={s.riskBoxItemLabel}>Nivel de riesgo calculado</Text>
                  <View style={[s.riskBadge, { backgroundColor: riskColor.bg }]}>
                    <Text style={[s.riskBadgeText, { color: riskColor.text }]}>{data.riesgo}</Text>
                  </View>
                </View>
                <View style={s.riskBoxDivider} />
                <View style={s.riskBoxItem}>
                  <Text style={s.riskBoxItemLabel}>Tipo de evaluación requerida</Text>
                  <View style={[s.riskBadge, { backgroundColor: evalColor.bg }]}>
                    <Text style={[s.riskBadgeText, { color: evalColor.text }]}>{data.tipoEvaluacion}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}>
              <Text style={s.sectionTitle}>4. Control de Revisión</Text>
            </View>
            <View style={s.reviewerBox}>
              <View style={s.reviewerHeader}>
                <View style={[s.reviewerHeaderAccent, { backgroundColor: primaryColor }]} />
                <Text style={s.reviewerHeaderText}>Revisado por — Área de Cumplimiento</Text>
              </View>
              <View style={s.reviewerBody}>
                <View style={s.reviewerCol}>
                  <Text style={s.reviewerColLabel}>Responsable de revisión</Text>
                  {reviewed ? (
                    <Text style={s.reviewerColValue}>{data.revisadoPorNombre}</Text>
                  ) : (
                    <Text style={s.reviewerColValuePending}>Pendiente de revisión</Text>
                  )}
                </View>
                <View style={s.reviewerColDivider} />
                <View style={s.reviewerCol}>
                  <Text style={s.reviewerColLabel}>Fecha y hora de revisión</Text>
                  {data.fechaRevisionCumplimiento ? (
                    <Text style={s.reviewerColValue}>{data.fechaRevisionCumplimiento}</Text>
                  ) : (
                    <Text style={s.reviewerColValuePending}>—</Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={[s.footer, { borderTopColor: primaryColor }]} fixed>
          <Text style={s.footerLeft}>{data.empresaNombre} — Documento de uso interno. Confidencial.</Text>
          <Text style={s.footerRight}>
            {DOC.codigo} v{DOC.version} · Ref: {data.inscripcionRef} · {data.createdAt}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
