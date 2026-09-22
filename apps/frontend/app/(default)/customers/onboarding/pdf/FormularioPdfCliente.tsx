import { Document, Page, View, Text, StyleSheet, Image, Link } from "@react-pdf/renderer";
import { CUSTOMER_DECLARACIONES } from "@/lib/onboarding/declaraciones/customers";
import type { EmpresaDeclaraciones } from "@/lib/onboarding/declaraciones/suppliers";

const RED = "#D60000";
const SLATE = "#64748b";
const BORDER = "#e2e8f0";
const BORDER_MED = "#94a3b8";
const BLACK = "#0f172a";
const WHITE = "#ffffff";

const DOC = {
  codigo: "CLI-F001",
  version: "01",
  fecha: "2026-03-13",
  titulo: "INSCRIPCIÓN Y ACTUALIZACIÓN DE CLIENTES",
} as const;

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
  headerCenterCell: { flex: 1, borderRight: `1.5 solid ${BORDER_MED}` },
  headerCenterTop: { borderBottom: `1 solid ${BORDER_MED}`, padding: "4 10", alignItems: "center", justifyContent: "center" },
  headerCenterTopText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BLACK, textTransform: "uppercase", letterSpacing: 0.6 },
  headerCenterBottom: { padding: "4 10", alignItems: "center", justifyContent: "center" },
  headerCenterBottomText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: BLACK, textTransform: "uppercase", textAlign: "center", lineHeight: 1.3 },
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
  boxed: { border: `1 solid ${BORDER}`, borderRadius: 2, overflow: "hidden" },
  acCard: { border: `1 solid ${BORDER}`, borderRadius: 2, marginBottom: 6, overflow: "hidden" },
  acCardHeader: { backgroundColor: "#f8fafc", padding: "4 8", flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: `1 solid ${BORDER}` },
  acCardBody: { padding: "4 8", gap: 4 },
  acName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BLACK },
  badgePep: { backgroundColor: "#fff1f2", borderRadius: 3, padding: "1 5", borderLeft: `2 solid ${RED}` },
  badgePepText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: RED },
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

/** Data URI expected by @react-pdf `Image` (PNG signature captured from the canvas). */
function normalizeFirmaForPdf(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.startsWith("data:image/") ? t : undefined;
}

export interface FormularioClienteInfoTributaria {
  impuestoRenta?: {
    contribuyente?: boolean;
    calidadContribuyente?: string;
    regimenOrdinario?: boolean;
    regimenEspecial?: boolean;
    regimenSimple?: boolean;
    granContribuyente?: boolean;
    autorretenedorRenta?: boolean;
    resolucion?: string;
    fechaResolucion?: number;
    resolucionAutorretenedor?: string;
    tarifaRetencionFuente?: string;
    baseRetencionFuente?: string;
  };
  impuestoVentas?: { responsableIva?: boolean; retencionIva?: boolean; tarifaRetencionIva?: string };
  impuestoIndustriaYComercio?: {
    responsableImpuesto?: boolean;
    municipios?: string[];
    esGranContribuyenteIcaBogota?: boolean;
    resolucionGranContribuyenteIca?: string;
  };
  basesReteFuente?: {
    practicaReteFuente?: boolean;
    cualBase?: string;
    practicaReteIca?: boolean;
    whichBase?: string;
    municipiosRetIca?: string[];
    tarifaRetencionIca?: string;
  };
  correoFacturacionElectronica?: string;
  contactoCertificadosRetencion?: { nombre?: string; correo?: string; telefono?: string };
}

export interface FormularioClientePdfData {
  inscripcionRef: string;
  fechaEnvio: string;
  logoUrl?: string;
  primaryColor?: string;
  empresaNombre: string;
  empresaParaDeclaraciones: EmpresaDeclaraciones;
  /** Optional corporate links (ethics code, SAGRILAFT, PTEE); omitted when the company has none. */
  enlacesCumplimiento?: { etica?: string; sagrilaft?: string; ptee?: string };
  razonSocial: string;
  tipoDocumento: string;
  numeroDocumento: string;
  tipoPersona: string;
  tipoSolicitud?: string;
  celular?: string;
  email?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  web?: string;
  representanteLegal?: { nombre?: string; tipoDocumento?: string; numeroDocumento?: string; email?: string; nacionalidad?: string };
  tesorero?: { nombre?: string; email?: string; telefono?: string };
  contador?: { nombre?: string; email?: string; telefono?: string };
  actividadEconomica?: {
    codigoCiiu?: string;
    actividadEconomica?: string;
    codigoCiiuSecundario?: string;
    actividadEconomicaSecundaria?: string;
    descripcionServicio?: string;
    cuentasExtranjero?: string;
    transaccionesVirtuales?: string;
  };
  conflicto?: {
    representanteLegalXColaborador: boolean;
    funcionariosExEmpresa: boolean;
    gerentesXEmpresa: boolean;
    sociosXProveedorEmpresa: boolean;
    profesionalesVinculadosXEmpresa: boolean;
    accionistasRelacionadosXEmpresa: boolean;
  };
  compoAccionaria?: Array<{
    nombre: string;
    tipoDocumento: string;
    numeroDocumento: string;
    porcentajeParticipacion: number;
    nacionalidad: string;
    isPep?: { ejerceActualmente: boolean; cargo: string };
  }>;
  contactos?: { nombre: string; area: string; cargo: string; email: string; celular: string }[];
  radicacionFactura?: { direccion?: string; correoFacturacion?: string; fechaMaximaRadicacion?: number };
  datosCuentasPagos?: { tipoCuenta?: string; entidad?: string; numeroCuenta?: string; titular?: string; ciudad?: string; departamento?: string }[];
  infoTributaria?: FormularioClienteInfoTributaria;
  referenciasComerciales?: { nombre: string; ciudad: string; telefono: string; personaContacto: string; tiempoProveedor: string }[];
  adicionales?: { aniosExperiencia?: number; certificaciones?: { nombre: string; alcance: string }[]; serviciosXGarantias?: string };
  condicionesPago?: { formaPago?: string; plazo?: string };
  /** Notes written by Contabilidad when closing Fase IV; rendered at the end of the document. */
  notasCierreContabilidad?: string;
  firmaDataUrl?: string;
  firmadoALas?: string;
  fechaFirma?: string;
}

function calidadContribuyente(ir: NonNullable<FormularioClienteInfoTributaria["impuestoRenta"]>): string {
  const m: Record<string, string> = {
    ORDINARIO: "Régimen ordinario",
    ESPECIAL_SIN_ANIMO_LUCRO: "Régimen especial (entidades sin ánimo de lucro)",
    RST: "Régimen simple de tributación (RST)",
    NO_CONTRIBUYENTE: "No contribuyente",
  };
  if (ir.calidadContribuyente && m[ir.calidadContribuyente]) return m[ir.calidadContribuyente];
  if (ir.contribuyente === false) return m.NO_CONTRIBUYENTE;
  if (ir.contribuyente === true) return m.ORDINARIO;
  return "—";
}

export default function FormularioPdfCliente({ data }: { data: FormularioClientePdfData }) {
  const primary = data.primaryColor ?? RED;
  const empDec = CUSTOMER_DECLARACIONES(data.empresaParaDeclaraciones);
  const legal = data.empresaNombre;
  const firmaSrc = normalizeFirmaForPdf(data.firmaDataUrl);
  const links = data.enlacesCumplimiento;
  const tieneLinks = Boolean(links && (links.etica || links.sagrilaft || links.ptee));
  const it = data.infoTributaria;

  return (
    <Document title={`Formulario Inscripción Cliente — ${data.razonSocial}`} author={legal}>
      <Page size="A4" style={s.page}>
        <View style={s.fixedHeader} fixed>
          <View style={s.headerWrap}>
            <View style={s.headerTable}>
              <View style={s.headerLogoCell}>
                {data.logoUrl ? <Image src={data.logoUrl} style={s.headerLogoImg} /> : <Text style={[s.headerLogoText, { color: primary }]}>{data.empresaParaDeclaraciones.nombre}</Text>}
              </View>
              <View style={s.headerCenterCell}>
                <View style={s.headerCenterTop}>
                  <Text style={s.headerCenterTopText}>Área Comercial / Cumplimiento</Text>
                </View>
                <View style={s.headerCenterBottom}>
                  <Text style={s.headerCenterBottomText}>{DOC.titulo}</Text>
                </View>
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
          <View style={[s.accentBar, { backgroundColor: primary }]} />
        </View>

        <View style={[s.fixedFooter, { borderTop: `1.5 solid ${primary}` }]} fixed>
          <Text style={s.footerText}>{legal} — Formulario Inscripción Clientes. Confidencial. · Ref: {data.inscripcionRef}</Text>
          <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

        <View style={s.metaBar}>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Cliente</Text>
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

        {/* 1. Datos generales */}
        <View style={s.section}>
          <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>1. Datos generales</Text></View>
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
            <Cell label="Celular" value={data.celular ?? "—"} />
            <Cell label="Email" value={data.email ?? "—"} />
          </View>
          {(data.direccion || data.ciudad || data.web) && (
            <View style={s.row}>
              {data.direccion && <Cell label="Dirección" value={data.direccion} />}
              {data.ciudad && <Cell label="Ciudad / Departamento" value={`${data.ciudad}${data.departamento ? ` — ${data.departamento}` : ""}`} />}
              {data.web && <Cell label="Sitio web" value={data.web} />}
            </View>
          )}
          {data.representanteLegal?.nombre && (
            <>
              <View style={[s.subHeader, { borderLeft: `3 solid ${primary}` }]}><Text style={s.subTitle}>Representante Legal</Text></View>
              <View style={s.row}>
                <Cell label="Nombre" value={data.representanteLegal.nombre} bold />
                <Cell label="Tipo doc." value={data.representanteLegal.tipoDocumento ?? "—"} />
                <Cell label="Nro. documento" value={data.representanteLegal.numeroDocumento ?? "—"} />
              </View>
              <View style={s.row}>
                <Cell label="Email" value={data.representanteLegal.email ?? "—"} />
                <Cell label="Nacionalidad" value={data.representanteLegal.nacionalidad ?? "—"} />
              </View>
            </>
          )}
          {data.tesorero?.nombre && (
            <>
              <View style={[s.subHeader, { borderLeft: `3 solid ${primary}` }]}><Text style={s.subTitle}>Tesorero</Text></View>
              <View style={s.row}>
                <Cell label="Nombre" value={data.tesorero.nombre} bold />
                <Cell label="Email" value={data.tesorero.email ?? "—"} />
                <Cell label="Teléfono" value={data.tesorero.telefono ?? "—"} />
              </View>
            </>
          )}
          {data.contador?.nombre && (
            <>
              <View style={[s.subHeader, { borderLeft: `3 solid ${primary}` }]}><Text style={s.subTitle}>Contador</Text></View>
              <View style={s.row}>
                <Cell label="Nombre" value={data.contador.nombre} bold />
                <Cell label="Email" value={data.contador.email ?? "—"} />
                <Cell label="Teléfono" value={data.contador.telefono ?? "—"} />
              </View>
            </>
          )}
        </View>

        {/* 2. Actividad económica */}
        {data.actividadEconomica && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>2. Actividad económica</Text></View>
            <View style={[s.subHeader, { borderLeft: `3 solid ${primary}` }]}><Text style={s.subTitle}>CIIU principal</Text></View>
            <View style={s.row}>
              <Cell label="Código CIIU" value={data.actividadEconomica.codigoCiiu ?? "—"} />
              <Cell label="Actividad económica" value={data.actividadEconomica.actividadEconomica ?? "—"} />
            </View>
            {(data.actividadEconomica.codigoCiiuSecundario?.trim() || data.actividadEconomica.actividadEconomicaSecundaria?.trim()) && (
              <>
                <View style={[s.subHeader, { borderLeft: `3 solid ${primary}` }]}><Text style={s.subTitle}>CIIU secundario</Text></View>
                <View style={s.row}>
                  <Cell label="Código CIIU" value={data.actividadEconomica.codigoCiiuSecundario ?? "—"} />
                  <Cell label="Actividad económica" value={data.actividadEconomica.actividadEconomicaSecundaria ?? "—"} />
                </View>
              </>
            )}
            {data.actividadEconomica.descripcionServicio && (
              <View style={s.row}>
                <View style={s.cell}>
                  <Text style={s.cellLabel}>Descripción actividad / servicio</Text>
                  <Text style={s.cellValue}>{data.actividadEconomica.descripcionServicio}</Text>
                </View>
              </View>
            )}
            {(data.actividadEconomica.cuentasExtranjero || data.actividadEconomica.transaccionesVirtuales) && (
              <View style={s.row}>
                {data.actividadEconomica.cuentasExtranjero && <Cell label="Cuentas en el extranjero" value={data.actividadEconomica.cuentasExtranjero} />}
                {data.actividadEconomica.transaccionesVirtuales && <Cell label="Transacciones virtuales" value={data.actividadEconomica.transaccionesVirtuales} />}
              </View>
            )}
          </View>
        )}

        {/* 3. Conflicto de intereses */}
        {data.conflicto && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>3. Conflicto de intereses</Text></View>
            <View style={s.boxed}>
              <BoolRow label={`Los representantes legales de su organización tienen relación de parentesco con un colaborador de ${legal} o pertenecen a una organización que sea proveedor de ${legal}`} value={data.conflicto.representanteLegalXColaborador} />
              <BoolRow label={`Alguno de los funcionarios de su compañía es ex-funcionario de ${legal}`} value={data.conflicto.funcionariosExEmpresa} />
              <BoolRow label={`Usted o los funcionarios de nivel gerencial de su organización tienen vínculos de parentesco, cónyuge o compañero permanente, hasta el tercer grado de consanguinidad o de afinidad, con algún colaborador de ${legal}`} value={data.conflicto.gerentesXEmpresa} />
              <BoolRow label={`Alguno de los socios o administradores de su organización es socio o administrador de otra empresa que preste servicios a ${legal}`} value={data.conflicto.sociosXProveedorEmpresa} />
              <BoolRow label={`Existe algún profesional vinculado a su empresa que haya tenido vínculo laboral o comercial con ${legal}`} value={data.conflicto.profesionalesVinculadosXEmpresa} />
              <BoolRow label={`Existe algún accionista, miembro de la gerencia, directivo, asesor o miembro de la junta directiva de su organización que tenga relación con algún empleado de ${legal}`} value={data.conflicto.accionistasRelacionadosXEmpresa} />
            </View>
          </View>
        )}

        {/* 4. Información tributaria */}
        {it && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>4. Información tributaria</Text></View>
            {it.impuestoRenta && (
              <>
                <View style={[s.subHeader, { borderLeft: `3 solid ${primary}` }]}><Text style={s.subTitle}>Calidad del contribuyente</Text></View>
                <View style={s.row}>
                  <Cell label="Régimen" value={calidadContribuyente(it.impuestoRenta)} />
                </View>
                <View style={s.boxed}>
                  <BoolRow label="¿Es contribuyente?" value={it.impuestoRenta.contribuyente ?? false} />
                  <BoolRow label="¿Régimen ordinario?" value={it.impuestoRenta.regimenOrdinario ?? false} />
                  <BoolRow label="¿Régimen especial (entidades sin ánimo de lucro)?" value={it.impuestoRenta.regimenEspecial ?? false} />
                  <BoolRow label="¿Régimen simple de tributación?" value={it.impuestoRenta.regimenSimple ?? false} />
                  <BoolRow label="¿Es gran contribuyente DIAN?" value={it.impuestoRenta.granContribuyente ?? false} />
                  {it.impuestoRenta.granContribuyente ? (
                    <View style={s.row}>
                      {it.impuestoRenta.resolucion ? <Cell label="Resolución (gran contribuyente DIAN)" value={it.impuestoRenta.resolucion} /> : null}
                      {it.impuestoVentas?.tarifaRetencionIva ? <Cell label="Tarifa Rte IVA" value={it.impuestoVentas.tarifaRetencionIva} /> : null}
                    </View>
                  ) : null}
                  <BoolRow label="¿Es autorretenedor DIAN?" value={it.impuestoRenta.autorretenedorRenta ?? false} />
                  {it.impuestoRenta.resolucionAutorretenedor || it.impuestoRenta.tarifaRetencionFuente || it.impuestoRenta.baseRetencionFuente ? (
                    <View style={s.row}>
                      {it.impuestoRenta.autorretenedorRenta && it.impuestoRenta.resolucionAutorretenedor ? <Cell label="Resolución (autorretenedor DIAN)" value={it.impuestoRenta.resolucionAutorretenedor} /> : null}
                      {it.impuestoRenta.tarifaRetencionFuente ? <Cell label="Tarifa Rte Fte" value={it.impuestoRenta.tarifaRetencionFuente} /> : null}
                      {it.impuestoRenta.baseRetencionFuente ? <Cell label="Base retención" value={it.impuestoRenta.baseRetencionFuente} /> : null}
                    </View>
                  ) : null}
                </View>
              </>
            )}
            {it.impuestoVentas && (
              <>
                <View style={[s.subHeader, { borderLeft: `3 solid ${primary}` }]}><Text style={s.subTitle}>Impuesto a las ventas (IVA)</Text></View>
                <View style={s.row}>
                  <Cell label="¿Responsable IVA?" value={it.impuestoVentas.responsableIva ? "Sí" : "No"} />
                  <Cell label="Practica retención IVA" value={it.impuestoVentas.retencionIva ? "Sí" : "No"} />
                  {it.impuestoVentas.tarifaRetencionIva ? <Cell label="Tarifa retención IVA" value={it.impuestoVentas.tarifaRetencionIva} /> : null}
                </View>
              </>
            )}
            <View style={[s.subHeader, { borderLeft: `3 solid ${primary}` }]}><Text style={s.subTitle}>Industria y Comercio</Text></View>
            <View style={s.boxed}>
              <BoolRow label="¿Es responsable de industria y comercio?" value={it.impuestoIndustriaYComercio?.responsableImpuesto ?? false} />
              {it.impuestoIndustriaYComercio?.responsableImpuesto ? (
                <>
                  <View style={s.row}>
                    <Cell label="Ciudad y/o municipio" value={it.impuestoIndustriaYComercio.municipios?.length ? it.impuestoIndustriaYComercio.municipios.join(", ") : "—"} />
                  </View>
                  <BoolRow label="¿Es gran contribuyente ICA Bogotá?" value={it.impuestoIndustriaYComercio.esGranContribuyenteIcaBogota ?? false} />
                  {it.impuestoIndustriaYComercio.esGranContribuyenteIcaBogota && it.impuestoIndustriaYComercio.resolucionGranContribuyenteIca ? (
                    <View style={s.row}>
                      <Cell label="Resolución (gran contribuyente ICA Bogotá)" value={it.impuestoIndustriaYComercio.resolucionGranContribuyenteIca} />
                    </View>
                  ) : null}
                </>
              ) : null}
              <BoolRow label="¿Practica retención de ICA?" value={it.basesReteFuente?.practicaReteIca ?? false} />
              {it.basesReteFuente?.practicaReteIca ? (
                <>
                  <View style={s.row}>
                    <Cell label="Ciudad y/o municipio" value={it.basesReteFuente.municipiosRetIca?.length ? it.basesReteFuente.municipiosRetIca.join(", ") : "—"} />
                    {it.basesReteFuente.tarifaRetencionIca ? <Cell label="Tarifa Rte ICA" value={it.basesReteFuente.tarifaRetencionIca} /> : null}
                  </View>
                  {it.basesReteFuente.whichBase ? (
                    <View style={s.row}>
                      <Cell label="Base retención ICA" value={it.basesReteFuente.whichBase} />
                    </View>
                  ) : null}
                </>
              ) : null}
              <BoolRow label="¿Practica retención en la fuente?" value={it.basesReteFuente?.practicaReteFuente ?? false} />
              {it.basesReteFuente?.practicaReteFuente && it.basesReteFuente.cualBase ? (
                <View style={s.row}>
                  <Cell label="Base retención en la fuente" value={it.basesReteFuente.cualBase} />
                </View>
              ) : null}
            </View>
            <View style={[s.subHeader, { borderLeft: `3 solid ${primary}` }]}><Text style={s.subTitle}>Contactos</Text></View>
            <View style={s.row}>
              <Cell label="Correo único para facturación electrónica" value={it.correoFacturacionElectronica ?? "—"} />
            </View>
            {it.contactoCertificadosRetencion ? (
              <View style={s.row}>
                <Cell label="Contacto certificados retención" value={it.contactoCertificadosRetencion.nombre || "—"} />
                <Cell label="Correo" value={it.contactoCertificadosRetencion.correo || "—"} />
                <Cell label="Teléfono" value={it.contactoCertificadosRetencion.telefono || "—"} />
              </View>
            ) : null}
          </View>
        )}

        {/* 5. Composición accionaria */}
        {data.compoAccionaria && data.compoAccionaria.length > 0 && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>5. Composición accionaria</Text></View>
            {data.compoAccionaria.map((ac, i) => (
              <View key={i} style={s.acCard}>
                <View style={s.acCardHeader}>
                  <Text style={s.acName}>{i + 1}. {ac.nombre}</Text>
                  {ac.isPep?.ejerceActualmente ? (
                    <View style={[s.badgePep, { borderLeft: `2 solid ${primary}` }]}>
                      <Text style={[s.badgePepText, { color: primary }]}>PEP</Text>
                    </View>
                  ) : null}
                </View>
                <View style={s.acCardBody}>
                  <View style={s.row}>
                    <Cell label="Tipo documento" value={ac.tipoDocumento} />
                    <Cell label="Número documento" value={ac.numeroDocumento} />
                    <Cell label="Participación" value={`${ac.porcentajeParticipacion}%`} />
                    <Cell label="Nacionalidad" value={ac.nacionalidad} />
                  </View>
                  {ac.isPep?.ejerceActualmente && ac.isPep.cargo ? (
                    <View style={s.row}>
                      <Cell label="Cargo PEP" value={ac.isPep.cargo} />
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 6. Contactos adicionales */}
        <View style={s.section}>
          <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>6. Contactos adicionales</Text></View>
          {data.contactos && data.contactos.length > 0 ? (
            <View style={s.boxed}>
              <View style={s.tableHead}>
                <Text style={[s.tableHeadText, { flex: 2 }]}>Nombre</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Área</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Cargo</Text>
                <Text style={[s.tableHeadText, { flex: 2 }]}>Email</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Celular</Text>
              </View>
              {data.contactos.map((c, i) => (
                <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                  <Text style={[s.tableCell, { flex: 2 }]}>{c.nombre || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{c.area || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{c.cargo || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 2 }]}>{c.email || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{c.celular || "—"}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={s.row}><Cell label="Contactos" value="—" /></View>
          )}
        </View>

        {/* 7. Radicación de factura */}
        <View style={s.section}>
          <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>7. Radicación de factura</Text></View>
          <View style={s.row}>
            <Cell label="Dirección" value={data.radicacionFactura?.direccion ?? "—"} />
            <Cell label="Correo facturación" value={data.radicacionFactura?.correoFacturacion ?? "—"} />
            <Cell label="Fecha máx. radicación" value={data.radicacionFactura?.fechaMaximaRadicacion ? new Date(data.radicacionFactura.fechaMaximaRadicacion).toLocaleDateString("es-CO") : "—"} />
          </View>
        </View>

        {/* 8. Información bancaria */}
        <View style={s.section}>
          <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>8. Información bancaria</Text></View>
          {data.datosCuentasPagos && data.datosCuentasPagos.length > 0 ? (
            data.datosCuentasPagos.map((cuenta, i) => (
              <View key={i} style={[s.row, { marginBottom: 4 }]}>
                <Cell label="Tipo cuenta" value={cuenta.tipoCuenta ?? "—"} />
                <Cell label="Entidad" value={cuenta.entidad ?? "—"} />
                <Cell label="Número cuenta" value={cuenta.numeroCuenta ?? "—"} />
                <Cell label="Titular" value={cuenta.titular ?? "—"} />
                <Cell label="Ciudad/Depto" value={`${cuenta.ciudad ?? ""} ${cuenta.departamento ?? ""}`.trim() || "—"} />
              </View>
            ))
          ) : (
            <View style={s.row}><Cell label="Cuenta" value="—" /></View>
          )}
        </View>

        {/* 9. Referencias comerciales */}
        {data.referenciasComerciales && data.referenciasComerciales.length > 0 && (
          <View style={s.section}>
            <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>9. Referencias comerciales</Text></View>
            <View style={s.boxed}>
              <View style={s.tableHead}>
                <Text style={[s.tableHeadText, { flex: 2 }]}>Nombre</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Ciudad</Text>
                <Text style={[s.tableHeadText, { flex: 1.5 }]}>Teléfono</Text>
                <Text style={[s.tableHeadText, { flex: 2 }]}>Persona de contacto</Text>
                <Text style={[s.tableHeadText, { flex: 1 }]}>Tiempo</Text>
              </View>
              {data.referenciasComerciales.map((r, i) => (
                <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                  <Text style={[s.tableCell, { flex: 2 }]}>{r.nombre || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{r.ciudad || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1.5 }]}>{r.telefono || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 2 }]}>{r.personaContacto || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{r.tiempoProveedor || "—"}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 10. Información adicional */}
        <View style={s.section}>
          <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>10. Información adicional</Text></View>
          <View style={s.row}>
            <Cell label="Años de experiencia" value={data.adicionales?.aniosExperiencia != null ? String(data.adicionales.aniosExperiencia) : "—"} />
          </View>
          {data.adicionales?.serviciosXGarantias ? (
            <View style={s.row}>
              <View style={s.cell}>
                <Text style={s.cellLabel}>Servicios y garantías</Text>
                <Text style={s.cellValue}>{data.adicionales.serviciosXGarantias}</Text>
              </View>
            </View>
          ) : null}
          {data.adicionales?.certificaciones && data.adicionales.certificaciones.length > 0 ? (
            <View style={[s.boxed, { marginTop: 4 }]}>
              <View style={s.tableHead}>
                <Text style={[s.tableHeadText, { flex: 2 }]}>Certificación</Text>
                <Text style={[s.tableHeadText, { flex: 3 }]}>Alcance</Text>
              </View>
              {data.adicionales.certificaciones.map((c, i) => (
                <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                  <Text style={[s.tableCell, { flex: 2 }]}>{c.nombre || "—"}</Text>
                  <Text style={[s.tableCell, { flex: 3 }]}>{c.alcance || "—"}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* 11. Condiciones de pago */}
        <View style={s.section}>
          <View style={[s.sectionHeader, { backgroundColor: primary }]}><Text style={s.sectionTitle}>11. Condiciones de pago</Text></View>
          <View style={s.row}>
            <Cell label="Forma de pago" value={data.condicionesPago?.formaPago ?? "—"} />
            <Cell label="Plazo" value={data.condicionesPago?.plazo ?? "—"} />
          </View>
        </View>

        {/* Declaraciones */}
        <View style={{ gap: 8, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: BLACK }}>{empDec.ORIGEN_FONDOS.titulo}</Text>
            <View style={{ flex: 1, height: 1.5, backgroundColor: primary }} />
          </View>
          <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: SLATE, marginBottom: 2 }}>{empDec.ORIGEN_FONDOS.subtitulo}</Text>
          {empDec.ORIGEN_FONDOS.puntos.map((p, i) => (
            <Text key={i} style={{ fontSize: 7, color: BLACK, lineHeight: 1.45, marginBottom: 1 }}>{i + 1}. {p}</Text>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: BLACK }}>{empDec.ACTUALIZACION.titulo}</Text>
            <View style={{ flex: 1, height: 1.5, backgroundColor: primary }} />
          </View>
          <Text style={{ fontSize: 7, color: BLACK, lineHeight: 1.45 }}>{empDec.ACTUALIZACION.texto}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: BLACK }}>{empDec.TRATAMIENTO_DATOS.titulo}</Text>
            <View style={{ flex: 1, height: 1.5, backgroundColor: primary }} />
          </View>
          <Text style={{ fontSize: 7, color: BLACK, lineHeight: 1.45, marginBottom: 2 }}>{empDec.TRATAMIENTO_DATOS.declaracion}</Text>
          <Text style={{ fontSize: 7, color: BLACK, lineHeight: 1.45, marginBottom: 2 }}>{empDec.TRATAMIENTO_DATOS.consentimiento}</Text>
          {empDec.TRATAMIENTO_DATOS.finalidades.map((f, i) => (
            <Text key={i} style={{ fontSize: 6.5, color: BLACK, lineHeight: 1.4, marginBottom: 1 }}>{i + 1}. {f}</Text>
          ))}
          <Text style={{ fontSize: 7, color: BLACK, lineHeight: 1.45, marginTop: 2 }}>{empDec.TRATAMIENTO_DATOS.derechos}</Text>
        </View>

        {/* Firma */}
        <View style={{ border: `1 solid ${BORDER}`, borderRadius: 2, padding: "12 14", backgroundColor: "#fafafa" }}>
          {tieneLinks && links ? (
            <Text style={{ fontSize: 7.5, color: SLATE, lineHeight: 1.5, marginBottom: 8 }}>
              Al enviar este formulario, confirma que ha leído las declaraciones anteriores y que ha leído y acepta
              {links.etica ? (
                <>
                  {" el "}
                  <Link src={links.etica} style={{ color: primary }}>código de ética</Link>
                </>
              ) : null}
              {links.sagrilaft ? (
                <>
                  {links.etica ? ", el " : " el "}
                  <Link src={links.sagrilaft} style={{ color: primary }}>manual SAGRILAFT</Link>
                </>
              ) : null}
              {links.ptee ? (
                <>
                  {links.etica || links.sagrilaft ? " y el " : " el "}
                  <Link src={links.ptee} style={{ color: primary }}>manual PTEE</Link>
                </>
              ) : null}
              {" de la empresa, y que la información suministrada es veraz y completa."}
            </Text>
          ) : null}
          <Text style={{ fontSize: 7.5, color: SLATE, lineHeight: 1.5, marginBottom: 12 }}>
            {`El suscrito declara que la información suministrada en el presente formulario es verídica y completa, ha leído las declaraciones de origen de fondos, actualización de información y tratamiento de datos contenidas en este documento, y autoriza a ${legal} para realizar las verificaciones que estime convenientes. Asimismo, acepta las condiciones establecidas en el proceso de inscripción de clientes. Se reconoce que las firmas electrónicas plasmadas en el presente documento son vinculantes y tienen la misma validez que la firma manuscrita.`}
          </Text>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            {firmaSrc ? (
              <View style={s.firmaImageWrap}>
                <Image src={firmaSrc} style={s.firmaImage} />
                {data.firmadoALas ? <Text style={{ fontSize: 7, color: "#94a3b8", marginTop: 6 }}>{data.firmadoALas}</Text> : null}
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

        {data.notasCierreContabilidad ? (
          <View style={{ marginTop: 12, border: `1 solid ${BORDER}`, borderRadius: 2, padding: "10 12", backgroundColor: "#f8fafc" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BLACK }}>Notas de cierre — Contabilidad (Fase IV)</Text>
              <View style={{ flex: 1, height: 1.5, backgroundColor: primary }} />
            </View>
            <Text style={{ fontSize: 7.5, color: BLACK, lineHeight: 1.45 }}>{data.notasCierreContabilidad}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
