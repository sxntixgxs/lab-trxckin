import { Document, Page, View, Text, StyleSheet, Image, Link } from "@react-pdf/renderer";
import { SUPPLIER_DECLARACIONES, type EmpresaDeclaraciones } from "@/lib/onboarding/declaraciones/suppliers";

const RED = "#D60000";
const SLATE = "#64748b";
const BORDER = "#e2e8f0";
const BORDER_MED = "#94a3b8";
const BLACK = "#0f172a";
const WHITE = "#ffffff";

const DOC = {
  codigo: "PRV-F001",
  version: "01",
  fecha: "2026-01-15",
  titulo: "INSCRIPCIÓN Y ACTUALIZACIÓN DE PROVEEDORES Y CONTRATISTAS",
} as const;

// Header height: wrap padding-top(14) + table(~58) + accentBar margin+height(8) ≈ 80
const HEADER_H = 90;
const FOOTER_H = 30;

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: BLACK, paddingTop: HEADER_H, paddingBottom: FOOTER_H, paddingHorizontal: 20 },
  fixedHeader: { position: "absolute", top: 0, left: 0, right: 0 },
  headerWrap: { padding: "10 20 0 20" },
  headerTable: { flexDirection: "row", border: `1.5 solid ${BORDER_MED}` },
  headerLogoCell: { width: "22%", borderRight: `1.5 solid ${BORDER_MED}`, padding: "6 10", justifyContent: "center", alignItems: "center" },
  headerLogoImg: { width: 88, height: 30, objectFit: "contain" },
  headerLogoText: { fontSize: 13, fontFamily: "Helvetica-Bold", color: RED, letterSpacing: 1 },
  headerCenterCell: { flex: 1, borderRight: `1.5 solid ${BORDER_MED}`, padding: "8 12", justifyContent: "center", alignItems: "center", minHeight: 52 },
  headerCenterTitleOnly: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: BLACK, textTransform: "uppercase", textAlign: "center", lineHeight: 1.35 },
  headerRightCell: { width: "25%" },
  headerRightRow: { borderBottom: `1 solid ${BORDER_MED}`, padding: "4 8", flexDirection: "row", gap: 4, alignItems: "baseline" },
  headerRightRowLast: { padding: "4 8", flexDirection: "row", gap: 4, alignItems: "baseline" },
  headerRightLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: BLACK },
  headerRightValue: { fontSize: 7, color: BLACK },
  accentBar: { height: 3, backgroundColor: RED, marginHorizontal: 20, marginTop: 4 },
  fixedFooter: { position: "absolute", bottom: 0, left: 0, right: 0, borderTop: `1.5 solid ${RED}`, padding: "5 20", flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: WHITE },
  footerText: { fontSize: 7, color: SLATE },
  pageNumber: { fontSize: 7, color: SLATE },
  metaBar: { backgroundColor: "#fafafa", borderBottom: `1 solid ${BORDER}`, flexDirection: "row", padding: "6 0", gap: 20, marginBottom: 10 },
  metaItem: { gap: 1 },
  metaLabel: { fontSize: 7, color: SLATE, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, textTransform: "uppercase" },
  metaValue: { fontSize: 8.5, color: BLACK, fontFamily: "Helvetica-Bold" },
  section: { gap: 4, marginBottom: 10 },
  sectionHeader: { backgroundColor: RED, padding: "3 8", borderRadius: 2 },
  sectionTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: WHITE, letterSpacing: 0.8, textTransform: "uppercase" },
  subHeader: { backgroundColor: "#f1f5f9", borderLeft: `3 solid ${RED}`, padding: "3 8", marginTop: 4 },
  subTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: BLACK, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", gap: 4 },
  cell: { border: `1 solid ${BORDER}`, borderRadius: 2, padding: "4 7", flex: 1 },
  cellLabel: { fontSize: 6.5, color: SLATE, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  cellValue: { fontSize: 8.5, color: BLACK },
  cellValueBold: { fontSize: 8.5, color: BLACK, fontFamily: "Helvetica-Bold" },
  boolRow: { flexDirection: "row", justifyContent: "space-between", borderBottom: `1 solid ${BORDER}`, padding: "3 8" },
  boolLabel: { fontSize: 8, color: BLACK, flex: 4 },
  boolBadge: { borderRadius: 3, padding: "1 6", flex: 1, alignItems: "center" },
  boolBadgeYes: { backgroundColor: "#fee2e2" },
  boolBadgeNo: { backgroundColor: "#dcfce7" },
  boolTextYes: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#991b1b" },
  boolTextNo: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#166534" },
  tableRow: { flexDirection: "row", borderTop: `1 solid ${BORDER}`, padding: "4 8" },
  tableRowAlt: { flexDirection: "row", borderTop: `1 solid ${BORDER}`, padding: "4 8", backgroundColor: "#f8fafc" },
  tableHead: { flexDirection: "row", backgroundColor: "#f1f5f9", padding: "3 8" },
  tableHeadText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase" },
  tableCell: { fontSize: 7.5, color: BLACK },
  badgeYes: { backgroundColor: "#fee2e2", borderRadius: 3, padding: "1 5" },
  badgeNo: { backgroundColor: "#dcfce7", borderRadius: 3, padding: "1 5" },
  badgeYesText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#991b1b" },
  badgeNoText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#166534" },
  badgePep: { backgroundColor: "#fff1f2", borderRadius: 3, padding: "1 5", borderLeft: `2 solid ${RED}` },
  badgePepText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: RED },
  acCard: { border: `1 solid ${BORDER}`, borderRadius: 2, marginBottom: 6, overflow: "hidden" },
  acCardHeader: { backgroundColor: "#f8fafc", padding: "4 8", flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: `1 solid ${BORDER}` },
  acCardBody: { padding: "4 8", gap: 4 },
  acName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BLACK },
  // Signature keeps the capture canvas aspect (~480×200) so it never gets clipped vertically.
  firmaImageWrap: { alignItems: "center", justifyContent: "center", marginBottom: 10 },
  firmaImage: { width: 240, height: 100, objectFit: "contain" },
});

function Cell({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.cell}>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={bold ? s.cellValueBold : s.cellValue}>{value || "—"}</Text>
    </View>
  );
}

/** Data URI expected by @react-pdf `Image` (PNG signature captured from the canvas). */
function normalizeFirmaForPdf(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.startsWith("data:image/") ? t : undefined;
}

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <View style={s.boolRow}>
      <Text style={s.boolLabel}>{label}</Text>
      <View style={[s.boolBadge, value ? s.boolBadgeYes : s.boolBadgeNo]}>
        <Text style={value ? s.boolTextYes : s.boolTextNo}>{value ? "SÍ" : "NO"}</Text>
      </View>
    </View>
  );
}

export interface FormularioAccionista {
  nombre: string;
  tipoDocumento: string;
  numeroDocumento: string;
  porcentajeParticipacion: number;
  nacionalidad: string;
  isPep?: {
    ejerceActualmente: boolean;
    cargo: string;
    fechaInicio: number;
    fechaFin?: number;
    dataCercanos: string;
    cuentasExtranjero: boolean;
    fideicomisos: { nombre: string; tipoDocumento: string; numeroDocumento: string }[];
  };
  ifNatural?: { isAccionista: boolean; nombreEmpresa: string; nitEmpresa: string };
}

export interface FormularioPdfData {
  inscripcionRef: string;
  fechaEnvio: string;
  logoUrl?: string;
  primaryColor?: string;
  empresaNombre: string;
  empresaParaDeclaraciones: EmpresaDeclaraciones;
  // 01 — Datos generales
  razonSocial: string;
  tipoDocumento: string;
  numeroDocumento: string;
  tipoPersona: string;
  tipoSolicitud?: string;
  contactoNombre: string;
  contactoEmail: string;
  contactoCelular: string;
  telefono?: string;
  celular?: string;
  email?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  website?: string;
  representanteLegal?: {
    nombre?: string;
    tipoDocumento?: string;
    numeroDocumento?: string;
    email?: string;
    telefono?: string;
    celular?: string;
    nombreContacto?: string;
    nacionalidad?: string;
  };
  tesorero?: { nombre?: string; email?: string; telefono?: string };
  contador?: { nombre?: string; email?: string; telefono?: string };
  // 02 — Actividad económica
  actividadPrincipal?: {
    codigoCiiu?: string;
    actividadEconomica?: string;
    checklist?: string[];
    descripcionServicio?: string;
    cuentasExtranjero?: string;
    transaccionesVirtuales?: string;
  };
  actividadSecundaria?: { codigoCiiu: string; actividadEconomica: string };
  // 03 — Conflicto de intereses (claves neutrales)
  conflicto?: {
    representanteLegalXColaborador: boolean;
    funcionariosExEmpresa: boolean;
    gerentesXEmpresa: boolean;
    sociosXProveedorEmpresa: boolean;
    profesionalesVinculadosXEmpresa: boolean;
    accionistasRelacionadosXEmpresa: boolean;
  };
  // 04 — Info tributaria
  infoTributaria?: {
    aiu?: number;
    aiuA?: number;
    aiuI?: number;
    aiuU?: number;
    origenFondos?: string;
    actividadesEconomicasExtranjeras?: string;
    tipoReteFuenteIfPersonaNatural?: string;
    tarifaReteFuente?: number;
    tarifaReteIvaRST?: number;
    impuestoRenta?: {
      contribuyente?: boolean;
      calidadContribuyente?: "ORDINARIO" | "ESPECIAL_SIN_ANIMO_LUCRO" | "RST" | "NO_CONTRIBUYENTE";
      regimenOrdinario?: boolean;
      regimenEspecial?: boolean;
      regimenSimple?: boolean;
      granContribuyente?: boolean;
      autorretenedorRenta?: boolean;
      resolucion?: string;
      fechaResolucion?: number;
      resolucionAutorretenedor?: string;
    };
    impuestoVentas?: { responsableIva?: boolean; retencionIva?: boolean };
    impuestoIndustriaYComercio?: {
      responsableImpuesto?: boolean;
      municipiosIcaResponsable?: string[];
      granContribuyenteBogota?: { es?: boolean; resolucion?: string; fechaResolucion?: number };
    };
    sujetoReteIca?: { es?: boolean; municipios?: string[]; tarifa?: number };
    autorretenedorIca?: { es?: boolean; municipios?: string[] };
  };
  // 05 — Composición accionaria
  compoAccionaria?: FormularioAccionista[];
  // 09 — Contactos adicionales
  contactosAdicionales?: { nombre: string; area: string; cargo: string; email: string; celular: string }[];
  // 10 — Info bancaria
  infoBancaria?: {
    tipoCuenta?: string;
    entidad?: string;
    numeroCuenta?: string;
    titular?: string;
    tipoDocumento?: string;
    numeroDocumento?: string;
    email?: string;
  };
  // 11 — Referencias
  referencias?: { nombre: string; ciudad: string; telefono: string; personaContacto: string; tiempoProveedor: string }[];
  // 12 — Condiciones de pago
  condicionesPago?: { formaPago?: string; plazo?: string };
  // 13 — Adicionales
  adicionales?: {
    aniosExperiencia?: number;
    serviciosXGarantias?: string;
    certificaciones?: { nombre: string; alcance: string }[];
  };
  // 16 — Firma (PNG data URL)
  firmaDataUrl?: string;
  /** Grey caption under the signature, e.g. "Firmado a las 14:30 06/04/2026" */
  firmadoALas?: string;
  fechaFirma?: string;
  /** Fase VI (Contabilidad): text + links to files in storage */
  notasContabilidad?: { justificacion?: string; archivos: { nombre: string; url: string }[] };
}

export default function FormularioPdf({ data }: { data: FormularioPdfData }) {
  const primaryColor = data.primaryColor ?? RED;
  const empDec = SUPPLIER_DECLARACIONES(data.empresaParaDeclaraciones);
  const footerNombre = data.empresaNombre;
  const firmaSrc = normalizeFirmaForPdf(data.firmaDataUrl);
  const empresaCorta = data.empresaParaDeclaraciones.nombre;

  return (
    <Document title={`Formulario de Inscripción — ${data.razonSocial}`} author={footerNombre}>
      <Page size="A4" style={s.page}>
        {/* Fixed header (repeats on every page) */}
        <View style={s.fixedHeader} fixed>
          <View style={s.headerWrap}>
            <View style={s.headerTable}>
              <View style={s.headerLogoCell}>
                {data.logoUrl ? (
                  <Image src={data.logoUrl} style={s.headerLogoImg} />
                ) : (
                  <Text style={[s.headerLogoText, { color: primaryColor }]}>{empresaCorta}</Text>
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
        </View>

        {/* Fixed footer */}
        <View style={[s.fixedFooter, { borderTop: `1.5 solid ${primaryColor}` }]} fixed>
          <Text style={s.footerText}>{footerNombre} — Formulario Inscripción Proveedores. Confidencial. · Ref: {data.inscripcionRef}</Text>
          <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

        {/* Meta bar */}
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
            <Text style={s.metaLabel}>Tipo solicitud</Text>
            <Text style={s.metaValue}>{data.tipoSolicitud ?? "INSCRIPCIÓN"}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Fecha de envío</Text>
            <Text style={s.metaValue}>{data.fechaEnvio}</Text>
          </View>
        </View>

        {/* 1. DATOS GENERALES */}
        <View style={s.section}>
          <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}><Text style={s.sectionTitle}>1. Datos Generales</Text></View>
          <View style={s.row}>
            <View style={s.cell}>
              <Text style={s.cellLabel}>Razón social / Nombre</Text>
              <Text style={s.cellValueBold}>{data.razonSocial}</Text>
            </View>
          </View>
          <View style={s.row}>
            <Cell label="Tipo de persona" value={data.tipoPersona === "PERSONA_JURIDICA" ? "Persona Jurídica" : "Persona Natural"} />
            <Cell label="Tipo de documento" value={data.tipoDocumento} />
            <Cell label="Número de documento" value={data.numeroDocumento} />
          </View>
          <View style={s.row}>
            <Cell label="Nombre de contacto" value={data.contactoNombre} />
            <Cell label="Email de contacto" value={data.contactoEmail} />
            <Cell label="Celular contacto" value={data.contactoCelular} />
          </View>
          {(data.telefono || data.celular || data.email) && (
            <View style={s.row}>
              {data.telefono && <Cell label="Teléfono" value={data.telefono} />}
              {data.celular && <Cell label="Celular empresa" value={data.celular} />}
              {data.email && <Cell label="Correo empresa" value={data.email} />}
            </View>
          )}
          {(data.direccion || data.ciudad || data.website) && (
            <View style={s.row}>
              {data.direccion && <Cell label="Dirección" value={data.direccion} />}
              {data.ciudad && (
                <Cell label="Ciudad / Departamento" value={`${data.ciudad}${data.departamento ? ` — ${data.departamento}` : ""}`} />
              )}
              {data.website && <Cell label="Sitio web" value={data.website} />}
            </View>
          )}

          {data.representanteLegal?.nombre && (
            <>
              <View style={[s.subHeader, { borderLeft: `3 solid ${primaryColor}` }]}><Text style={s.subTitle}>Representante legal / firmante autorizado</Text></View>
              <View style={s.row}>
                <Cell label="Nombre" value={data.representanteLegal.nombre} bold />
                <Cell label="Tipo doc." value={data.representanteLegal.tipoDocumento ?? "—"} />
                <Cell label="Nro. documento" value={data.representanteLegal.numeroDocumento ?? "—"} />
              </View>
              {data.representanteLegal.email && (
                <View style={s.row}>
                  <Cell label="Email" value={data.representanteLegal.email} />
                </View>
              )}
              {(data.representanteLegal.telefono || data.representanteLegal.celular) && (
                <View style={s.row}>
                  {data.representanteLegal.telefono ? <Cell label="Teléfono" value={data.representanteLegal.telefono} /> : null}
                  {data.representanteLegal.celular ? <Cell label="Celular" value={data.representanteLegal.celular} /> : null}
                </View>
              )}
              {(data.representanteLegal.nombreContacto || data.representanteLegal.nacionalidad) && (
                <View style={s.row}>
                  {data.representanteLegal.nombreContacto ? <Cell label="Nombre de contacto" value={data.representanteLegal.nombreContacto} /> : null}
                  {data.representanteLegal.nacionalidad ? <Cell label="Nacionalidad" value={data.representanteLegal.nacionalidad} /> : null}
                </View>
              )}
            </>
          )}

          {data.tesorero?.nombre && (
            <>
              <View style={[s.subHeader, { borderLeft: `3 solid ${primaryColor}` }]}><Text style={s.subTitle}>Tesorero</Text></View>
              <View style={s.row}>
                <Cell label="Nombre" value={data.tesorero.nombre} bold />
                <Cell label="Email" value={data.tesorero.email ?? "—"} />
                {data.tesorero.telefono ? <Cell label="Teléfono" value={data.tesorero.telefono} /> : null}
              </View>
            </>
          )}

          {data.contador?.nombre && (
            <>
              <View style={[s.subHeader, { borderLeft: `3 solid ${primaryColor}` }]}><Text style={s.subTitle}>Contador</Text></View>
              <View style={s.row}>
                <Cell label="Nombre" value={data.contador.nombre} bold />
                <Cell label="Email" value={data.contador.email ?? "—"} />
                {data.contador.telefono ? <Cell label="Teléfono" value={data.contador.telefono} /> : null}
              </View>
            </>
          )}
        </View>

        {/* 2. ACTIVIDAD ECONÓMICA */}
        {(data.actividadPrincipal || data.actividadSecundaria) && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}><Text style={s.sectionTitle}>2. Actividad Económica</Text></View>
            {data.actividadPrincipal ? (
              <>
                <View style={[s.subHeader, { borderLeft: `3 solid ${primaryColor}` }]}><Text style={s.subTitle}>CIIU principal</Text></View>
                <View style={s.row}>
                  <Cell label="Código CIIU" value={data.actividadPrincipal.codigoCiiu ?? "—"} />
                  <Cell label="Actividad económica" value={data.actividadPrincipal.actividadEconomica ?? "—"} />
                </View>
              </>
            ) : null}
            {data.actividadSecundaria ? (
              <>
                <View style={[s.subHeader, { borderLeft: `3 solid ${primaryColor}` }]}><Text style={s.subTitle}>CIIU secundario</Text></View>
                <View style={s.row}>
                  <Cell label="Código CIIU" value={data.actividadSecundaria.codigoCiiu} />
                  <Cell label="Actividad económica" value={data.actividadSecundaria.actividadEconomica} />
                </View>
              </>
            ) : null}
            {data.actividadPrincipal?.descripcionServicio && (
              <View style={s.row}>
                <View style={s.cell}>
                  <Text style={s.cellLabel}>Descripción del servicio / producto</Text>
                  <Text style={s.cellValue}>{data.actividadPrincipal.descripcionServicio}</Text>
                </View>
              </View>
            )}
            {(data.actividadPrincipal?.cuentasExtranjero || data.actividadPrincipal?.transaccionesVirtuales) && (
              <View style={s.row}>
                {data.actividadPrincipal?.cuentasExtranjero && <Cell label="Cuentas en el extranjero" value={data.actividadPrincipal.cuentasExtranjero} />}
                {data.actividadPrincipal?.transaccionesVirtuales && <Cell label="Transacciones virtuales" value={data.actividadPrincipal.transaccionesVirtuales} />}
              </View>
            )}
            {data.actividadPrincipal?.checklist && data.actividadPrincipal.checklist.length > 0 && (
              <View style={s.row}>
                <View style={s.cell}>
                  <Text style={s.cellLabel}>Actividades / checklist</Text>
                  {data.actividadPrincipal.checklist.map((item, i) => (
                    <Text key={i} style={s.cellValue}>• {item}</Text>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* 3. CONFLICTO DE INTERESES */}
        {data.conflicto && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}><Text style={s.sectionTitle}>3. Conflicto de Intereses</Text></View>
            <View style={{ border: `1 solid ${BORDER}`, borderRadius: 2, overflow: "hidden" }}>
              <BoolRow label={`¿El representante legal es colaborador de ${empresaCorta}?`} value={data.conflicto.representanteLegalXColaborador} />
              <BoolRow label={`¿Algún funcionario de ${empresaCorta} fue colaborador de la empresa?`} value={data.conflicto.funcionariosExEmpresa} />
              <BoolRow label={`¿Algún gerente de ${empresaCorta} tiene participación en la empresa?`} value={data.conflicto.gerentesXEmpresa} />
              <BoolRow label={`¿Algún socio proveedor tiene relación con ${empresaCorta}?`} value={data.conflicto.sociosXProveedorEmpresa} />
              <BoolRow label={`¿Profesionales vinculados son colaboradores de ${empresaCorta}?`} value={data.conflicto.profesionalesVinculadosXEmpresa} />
              <BoolRow label={`¿Accionistas relacionados tienen vínculo con ${empresaCorta}?`} value={data.conflicto.accionistasRelacionadosXEmpresa} />
            </View>
          </View>
        )}

        {/* 4. INFORMACIÓN TRIBUTARIA */}
        {data.infoTributaria &&
          (() => {
            const it = data.infoTributaria;
            const iyc = it.impuestoIndustriaYComercio;
            const municipiosIyC = iyc?.municipiosIcaResponsable?.length ? iyc.municipiosIcaResponsable.join(", ") : "";
            const aiuActivo = it.aiu !== undefined || it.aiuA !== undefined || it.aiuI !== undefined || it.aiuU !== undefined;
            return (
              <View style={s.section}>
                <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}><Text style={s.sectionTitle}>4. Información Tributaria</Text></View>

                {it.impuestoRenta && (
                  <>
                    <View style={s.row}>
                      <Cell label="Contribuyente" value={it.impuestoRenta.contribuyente ? "Sí" : "No"} />
                      <Cell
                        label="Régimen"
                        value={
                          !it.impuestoRenta.contribuyente
                            ? "No contribuyente"
                            : it.impuestoRenta.calidadContribuyente === "ESPECIAL_SIN_ANIMO_LUCRO"
                              ? "Régimen especial (ESAL)"
                              : it.impuestoRenta.calidadContribuyente === "RST"
                                ? "Régimen simple de tributación"
                                : it.impuestoRenta.calidadContribuyente === "ORDINARIO"
                                  ? "Régimen ordinario"
                                  : "No contribuyente"
                        }
                      />
                      <Cell label="Gran contribuyente DIAN" value={it.impuestoRenta.granContribuyente ? "Sí" : "No"} />
                      <Cell label="Autorretenedor de renta" value={it.impuestoRenta.autorretenedorRenta ? "Sí" : "No"} />
                    </View>
                    {(it.impuestoRenta.regimenOrdinario !== undefined ||
                      it.impuestoRenta.regimenEspecial !== undefined ||
                      it.impuestoRenta.regimenSimple !== undefined) && (
                      <View style={s.row}>
                        <Cell
                          label="Declaración régimen (flags)"
                          value={
                            [
                              it.impuestoRenta.regimenOrdinario ? "Ordinario" : null,
                              it.impuestoRenta.regimenEspecial ? "Especial" : null,
                              it.impuestoRenta.regimenSimple ? "RST" : null,
                            ]
                              .filter(Boolean)
                              .join(", ") || "—"
                          }
                        />
                      </View>
                    )}
                    {(it.impuestoRenta.resolucion || it.impuestoRenta.fechaResolucion) && (
                      <View style={s.row}>
                        {it.impuestoRenta.resolucion && <Cell label="Resolución (gran contribuyente)" value={it.impuestoRenta.resolucion} />}
                        {!!it.impuestoRenta.fechaResolucion && (
                          <Cell label="Fecha resolución (GC)" value={new Date(it.impuestoRenta.fechaResolucion).toLocaleDateString("es-CO")} />
                        )}
                      </View>
                    )}
                    {it.impuestoRenta.resolucionAutorretenedor ? (
                      <View style={s.row}>
                        <Cell label="Resolución (autorretenedor)" value={it.impuestoRenta.resolucionAutorretenedor} />
                      </View>
                    ) : null}
                    {((it.tarifaReteIvaRST ?? 0) > 0 || (it.tarifaReteFuente ?? 0) > 0 || it.tipoReteFuenteIfPersonaNatural) && (
                      <View style={s.row}>
                        {(it.tarifaReteIvaRST ?? 0) > 0 && <Cell label="Tarifa Rte IVA (RST) (%)" value={String(it.tarifaReteIvaRST)} />}
                        {(it.tarifaReteFuente ?? 0) > 0 && <Cell label="Tarifa Rte Fte (%)" value={String(it.tarifaReteFuente)} />}
                        {it.tipoReteFuenteIfPersonaNatural && (
                          <Cell
                            label="Persona natural"
                            value={
                              it.tipoReteFuenteIfPersonaNatural === "ART_383"
                                ? "Art. 383 del E.T."
                                : it.tipoReteFuenteIfPersonaNatural === "TARIFA_GENERAL"
                                  ? "Tarifa general"
                                  : it.tipoReteFuenteIfPersonaNatural
                            }
                          />
                        )}
                      </View>
                    )}
                  </>
                )}

                {aiuActivo && (
                  <View style={s.row}>
                    <Cell label="Maneja AIU" value="Sí" />
                    {it.aiuA !== undefined && <Cell label="A (%)" value={String(it.aiuA)} />}
                    {it.aiuI !== undefined && <Cell label="I (%)" value={String(it.aiuI)} />}
                    {it.aiuU !== undefined && <Cell label="U (%)" value={String(it.aiuU)} />}
                    {it.aiu !== undefined && it.aiuA === undefined && it.aiuI === undefined && it.aiuU === undefined && (
                      <Cell label="AIU total (%)" value={String(it.aiu)} />
                    )}
                  </View>
                )}

                {it.impuestoVentas && (
                  <View style={s.row}>
                    <Cell
                      label="IVA"
                      value={it.impuestoVentas.responsableIva ? "Responsable de IVA (régimen común)" : "No responsable de IVA (régimen simplificado)"}
                    />
                    <Cell label="Practica retención IVA" value={it.impuestoVentas.retencionIva ? "Sí" : "No"} />
                  </View>
                )}

                {iyc && (
                  <>
                    <View style={s.row}>
                      <Cell label="Responsable Industria y Comercio" value={iyc.responsableImpuesto ? "Sí" : "No"} />
                      {municipiosIyC && <Cell label="Municipios responsable Industria y Comercio" value={municipiosIyC} />}
                    </View>
                    {!iyc.responsableImpuesto && iyc.granContribuyenteBogota?.es && (
                      <View style={s.row}>
                        <Cell label="Gran contribuyente Bogotá" value="Sí" />
                        {iyc.granContribuyenteBogota.resolucion && <Cell label="Resolución (GC Bogotá)" value={iyc.granContribuyenteBogota.resolucion} />}
                        {!!iyc.granContribuyenteBogota.fechaResolucion && (
                          <Cell label="Fecha resolución" value={new Date(iyc.granContribuyenteBogota.fechaResolucion).toLocaleDateString("es-CO")} />
                        )}
                      </View>
                    )}
                  </>
                )}

                {it.sujetoReteIca && (
                  <View style={s.row}>
                    <Cell label="Sujeto Rte ICA" value={it.sujetoReteIca.es ? "Sí" : "No"} />
                    {it.sujetoReteIca.es && it.sujetoReteIca.municipios && it.sujetoReteIca.municipios.length > 0 && (
                      <Cell label="Municipios Rte ICA" value={it.sujetoReteIca.municipios.join(", ")} />
                    )}
                    {it.sujetoReteIca.es && it.sujetoReteIca.tarifa !== undefined && <Cell label="Tarifa Rte ICA (%)" value={String(it.sujetoReteIca.tarifa)} />}
                  </View>
                )}

                {it.autorretenedorIca?.es && (
                  <View style={s.row}>
                    <Cell label="Autorretenedor ICA" value="Sí" />
                    {it.autorretenedorIca.municipios && it.autorretenedorIca.municipios.length > 0 && (
                      <Cell label="Municipios autorret. ICA" value={it.autorretenedorIca.municipios.join(", ")} />
                    )}
                  </View>
                )}

                <View style={s.row}>
                  <Cell label="Origen de fondos" value={it.origenFondos ?? "—"} />
                  <Cell label="Act. económicas en el extranjero" value={it.actividadesEconomicasExtranjeras || "—"} />
                </View>
              </View>
            );
          })()}

        {/* 5. COMPOSICIÓN ACCIONARIA */}
        {data.compoAccionaria && data.compoAccionaria.length > 0 && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}><Text style={s.sectionTitle}>5. Composición Accionaria</Text></View>
            {data.compoAccionaria.map((ac, i) => {
              const pep = ac.isPep ?? {
                ejerceActualmente: false,
                cargo: "",
                fechaInicio: 0,
                fechaFin: undefined as number | undefined,
                dataCercanos: "",
                cuentasExtranjero: false,
                fideicomisos: [] as { nombre: string; tipoDocumento: string; numeroDocumento: string }[],
              };
              const ifNat = ac.ifNatural ?? { isAccionista: false, nombreEmpresa: "", nitEmpresa: "" };
              const fideicomisos = pep.fideicomisos ?? [];
              const showPepBlock =
                pep.ejerceActualmente ||
                !!pep.cargo?.trim() ||
                !!pep.dataCercanos?.trim() ||
                (pep.fechaInicio ?? 0) > 0 ||
                (pep.fechaFin ?? 0) > 0 ||
                pep.cuentasExtranjero ||
                fideicomisos.length > 0;
              return (
                <View key={i} style={s.acCard}>
                  <View style={s.acCardHeader}>
                    <Text style={s.acName}>{i + 1}. {ac.nombre}</Text>
                    {pep.ejerceActualmente && (
                      <View style={[s.badgePep, { borderLeft: `2 solid ${primaryColor}` }]}>
                        <Text style={[s.badgePepText, { color: primaryColor }]}>PEP</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.acCardBody}>
                    <View style={s.row}>
                      <Cell label="Tipo documento" value={ac.tipoDocumento} />
                      <Cell label="Número documento" value={ac.numeroDocumento} />
                      <Cell label="Participación" value={`${ac.porcentajeParticipacion}%`} />
                      <Cell label="Nacionalidad" value={ac.nacionalidad} />
                    </View>
                    {ifNat.isAccionista && (
                      <View style={s.row}>
                        <Cell label="Empresa (accionista en)" value={ifNat.nombreEmpresa} />
                        <Cell label="NIT empresa" value={ifNat.nitEmpresa} />
                      </View>
                    )}
                    {showPepBlock && (
                      <>
                        <View style={[s.subHeader, { borderLeft: `3 solid ${primaryColor}` }]}><Text style={s.subTitle}>Datos PEP / vinculación</Text></View>
                        <View style={s.row}>
                          <Cell label="Ejerce actualmente como PEP" value={pep.ejerceActualmente ? "Sí" : "No"} />
                          <Cell label="Cargo PEP" value={pep.cargo || "—"} />
                          {(pep.fechaInicio ?? 0) > 0 ? (
                            <Cell label="Fecha inicio" value={new Date(pep.fechaInicio).toLocaleDateString("es-CO")} />
                          ) : (
                            <Cell label="Fecha inicio" value="—" />
                          )}
                          {pep.fechaFin && (pep.fechaFin ?? 0) > 0 ? (
                            <Cell label="Fecha fin" value={new Date(pep.fechaFin).toLocaleDateString("es-CO")} />
                          ) : null}
                        </View>
                        <View style={s.row}>
                          <View style={s.cell}>
                            <Text style={s.cellLabel}>Datos de cercanos</Text>
                            <Text style={s.cellValue}>{pep.dataCercanos || "—"}</Text>
                          </View>
                          <View style={s.cell}>
                            <Text style={s.cellLabel}>Cuentas en el extranjero</Text>
                            <View style={pep.cuentasExtranjero ? s.badgeYes : s.badgeNo}>
                              <Text style={pep.cuentasExtranjero ? s.badgeYesText : s.badgeNoText}>{pep.cuentasExtranjero ? "SÍ" : "NO"}</Text>
                            </View>
                          </View>
                        </View>
                        {fideicomisos.length > 0 && (
                          <View style={s.row}>
                            <View style={s.cell}>
                              <Text style={s.cellLabel}>Fideicomisos</Text>
                              {fideicomisos.map((f, fi) => (
                                <Text key={fi} style={s.cellValue}>• {f.nombre} — {f.tipoDocumento} {f.numeroDocumento}</Text>
                              ))}
                            </View>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 6. INFORMACIÓN BANCARIA */}
        {data.infoBancaria && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}><Text style={s.sectionTitle}>6. Información Bancaria</Text></View>
            <View style={s.row}>
              <Cell label="Tipo de cuenta" value={data.infoBancaria.tipoCuenta ?? "—"} />
              <Cell label="Entidad bancaria" value={data.infoBancaria.entidad ?? "—"} bold />
              <Cell label="Número de cuenta" value={data.infoBancaria.numeroCuenta ?? "—"} />
            </View>
            <View style={s.row}>
              <Cell label="Titular" value={data.infoBancaria.titular ?? "—"} />
              <Cell label="Documento titular" value={`${data.infoBancaria.tipoDocumento ?? ""} ${data.infoBancaria.numeroDocumento ?? ""}`.trim()} />
              <Cell label="Email banco" value={data.infoBancaria.email ?? "—"} />
            </View>
          </View>
        )}

        {/* 7. CONTACTOS ADICIONALES */}
        {data.contactosAdicionales && data.contactosAdicionales.length > 0 && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}><Text style={s.sectionTitle}>7. Contactos Adicionales</Text></View>
            <View style={{ border: `1 solid ${BORDER}`, borderRadius: 2, overflow: "hidden" }}>
              <View style={s.tableHead}>
                <Text style={[s.tableHeadText, { flex: 2 }]}>Nombre</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Área</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Cargo</Text>
                <Text style={[s.tableHeadText, { flex: 2 }]}>Email</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Celular</Text>
              </View>
              {data.contactosAdicionales.map((c, i) => (
                <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                  <Text style={[s.tableCell, { flex: 2 }]}>{c.nombre || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{c.area || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{c.cargo || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 2 }]}>{c.email || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{c.celular || "—"}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 8. REFERENCIAS COMERCIALES */}
        {data.referencias && data.referencias.length > 0 && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}><Text style={s.sectionTitle}>8. Referencias Comerciales</Text></View>
            <View style={{ border: `1 solid ${BORDER}`, borderRadius: 2, overflow: "hidden" }}>
              <View style={s.tableHead}>
                <Text style={[s.tableHeadText, { flex: 2 }]}>Empresa</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Ciudad</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Teléfono</Text>
                <Text style={[s.tableHeadText, { flex: 2 }]}>Contacto</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Tiempo</Text>
              </View>
              {data.referencias.map((r, i) => (
                <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                  <Text style={[s.tableCell, { flex: 2 }]}>{r.nombre || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{r.ciudad || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{r.telefono || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 2 }]}>{r.personaContacto || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{r.tiempoProveedor || "—"}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 9. CONDICIONES DE PAGO */}
        {data.condicionesPago && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}><Text style={s.sectionTitle}>9. Condiciones de Pago</Text></View>
            <View style={s.row}>
              <Cell label="Forma de pago" value={data.condicionesPago.formaPago ?? "—"} />
              <Cell label="Plazo" value={data.condicionesPago.plazo ?? "—"} />
            </View>
          </View>
        )}

        {/* 10. INFORMACIÓN ADICIONAL */}
        {data.adicionales && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primaryColor }]}><Text style={s.sectionTitle}>10. Información Adicional</Text></View>
            <View style={s.row}>
              <Cell label="Años de experiencia" value={String(data.adicionales.aniosExperiencia ?? "—")} />
            </View>
            {data.adicionales.serviciosXGarantias && (
              <View style={s.row}>
                <View style={s.cell}>
                  <Text style={s.cellLabel}>Servicios y garantías</Text>
                  <Text style={s.cellValue}>{data.adicionales.serviciosXGarantias}</Text>
                </View>
              </View>
            )}
            {data.adicionales.certificaciones && data.adicionales.certificaciones.length > 0 && (
              <View style={s.row}>
                <View style={s.cell}>
                  <Text style={s.cellLabel}>Certificaciones</Text>
                  {data.adicionales.certificaciones.map((c, i) => (
                    <Text key={i} style={s.cellValue}>• {c.nombre} — {c.alcance}</Text>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* DECLARACIONES */}
        <View style={{ gap: 8, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: BLACK }}>{empDec.ORIGEN_FONDOS.titulo}</Text>
            <View style={{ flex: 1, height: 1.5, backgroundColor: primaryColor }} />
          </View>
          <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: SLATE, marginBottom: 2 }}>{empDec.ORIGEN_FONDOS.subtitulo}</Text>
          {empDec.ORIGEN_FONDOS.puntos.map((p, i) => (
            <Text key={i} style={{ fontSize: 7, color: BLACK, lineHeight: 1.45, marginBottom: 1 }}>{i + 1}. {p}</Text>
          ))}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: BLACK }}>{empDec.ACTUALIZACION.titulo}</Text>
            <View style={{ flex: 1, height: 1.5, backgroundColor: primaryColor }} />
          </View>
          <Text style={{ fontSize: 7, color: BLACK, lineHeight: 1.45 }}>{empDec.ACTUALIZACION.texto}</Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: BLACK }}>{empDec.TRATAMIENTO_DATOS.titulo}</Text>
            <View style={{ flex: 1, height: 1.5, backgroundColor: primaryColor }} />
          </View>
          <Text style={{ fontSize: 7, color: BLACK, lineHeight: 1.45, marginBottom: 2 }}>{empDec.TRATAMIENTO_DATOS.declaracion}</Text>
          <Text style={{ fontSize: 7, color: BLACK, lineHeight: 1.45, marginBottom: 2 }}>{empDec.TRATAMIENTO_DATOS.consentimiento}</Text>
          {empDec.TRATAMIENTO_DATOS.finalidades.map((f, i) => (
            <Text key={i} style={{ fontSize: 6.5, color: BLACK, lineHeight: 1.4, marginBottom: 1 }}>{i + 1}. {f}</Text>
          ))}
          <Text style={{ fontSize: 7, color: BLACK, lineHeight: 1.45, marginTop: 2 }}>{empDec.TRATAMIENTO_DATOS.derechos}</Text>
        </View>

        {/* FIRMA */}
        <View style={{ border: `1 solid ${BORDER}`, borderRadius: 2, padding: "12 14", backgroundColor: "#fafafa" }}>
          <Text style={{ fontSize: 7.5, color: SLATE, lineHeight: 1.5, marginBottom: 12 }}>
            El suscrito declara que la información suministrada en el presente formulario es verídica y completa,
            ha leído las declaraciones de origen de fondos, actualización de información y tratamiento de datos
            contenidas en este documento, y autoriza a {footerNombre} para realizar las verificaciones que estime
            convenientes. Asimismo, acepta las condiciones establecidas en el proceso de inscripción de proveedores
            y contratistas.
          </Text>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            {firmaSrc ? (
              <View style={s.firmaImageWrap}>
                <Image src={firmaSrc} style={s.firmaImage} />
                {data.firmadoALas ? (
                  <Text style={{ fontSize: 7, color: "#94a3b8", marginTop: 6, fontFamily: "Helvetica" }}>{data.firmadoALas}</Text>
                ) : null}
              </View>
            ) : null}
            <View style={{ borderTop: `1.5 solid ${BLACK}`, paddingTop: 8, minWidth: 200, alignItems: "center" }}>
              <Text style={{ fontSize: 7, color: SLATE }}>Nombre del representante legal</Text>
              <Text style={{ fontSize: 8.5, color: BLACK, fontFamily: "Helvetica-Bold", marginTop: 2 }}>{data.representanteLegal?.nombre ?? data.razonSocial}</Text>
              <Text style={{ fontSize: 7, color: SLATE, marginTop: 4, textAlign: "center" }}>
                C.C. / NIT  {data.representanteLegal?.numeroDocumento ?? data.numeroDocumento}
                {firmaSrc ? null : <>  ·  Fecha  {data.fechaFirma ?? data.fechaEnvio}</>}
              </Text>
            </View>
          </View>
        </View>

        {data.notasContabilidad && (data.notasContabilidad.justificacion || data.notasContabilidad.archivos.length > 0) && (
          <View style={{ marginTop: 12, border: `1 solid ${BORDER}`, borderRadius: 2, padding: "10 12", backgroundColor: "#f8fafc" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BLACK }}>
                Notas de Contabilidad (Fase VI — creación en el sistema contable)
              </Text>
              <View style={{ flex: 1, height: 1.5, backgroundColor: primaryColor }} />
            </View>
            <Text style={{ fontSize: 6.8, color: SLATE, lineHeight: 1.45, marginBottom: 8 }}>
              Si al registrar el tercero en el sistema contable los datos efectivos difieren del formulario de inscripción, Contabilidad deja constancia del motivo
              y del soporte documental. Esta sección no reemplaza el formulario firmado; documenta ajustes posteriores conocidos al cierre del proceso.
            </Text>
            {data.notasContabilidad.justificacion ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, marginBottom: 3 }}>Motivo o justificación de los cambios</Text>
                <Text style={{ fontSize: 8, color: BLACK, lineHeight: 1.45 }}>{data.notasContabilidad.justificacion}</Text>
              </View>
            ) : null}
            {data.notasContabilidad.archivos.length > 0 ? (
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE }}>Archivos de soporte (enlace al documento)</Text>
                {data.notasContabilidad.archivos.map((f, i) => (
                  <View key={i} style={{ marginBottom: 2 }}>
                    <Text style={{ fontSize: 7.5, color: BLACK, fontFamily: "Helvetica-Bold" }}>{f.nombre}</Text>
                    <Link src={f.url} style={{ fontSize: 6.5, color: "#0369a1", textDecoration: "underline" }}>
                      <Text>{f.url}</Text>
                    </Link>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </Page>
    </Document>
  );
}
