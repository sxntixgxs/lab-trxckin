import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { EMPRESAS_MAP } from "@/lib/empresas";
import { getAppUrl } from "@/lib/app-env";
import { formatCOP } from "@/lib/format";

export type AnticipoEmailEvento =
  | "I_SOLICITUD"
  | "II_APROBACION_JEFE_DIRECTO"
  | "III_REVISION_CONTABILIDAD"
  | "IV_APROBACION_GERENCIA"
  | "IV_DESEMBOLSO_TESORERIA"
  | "V_PENDIENTE_LEGALIZACION"
  | "VI_LEGALIZADO"
  | "DEVUELTO"
  | "RECHAZADO"
  | "ANULADO"
  | "AJUSTE_APLICADO"
  | "AJUSTE_REVERSADO";

type AnticipoNotificationEmailProps = {
  userName: string;
  evento: AnticipoEmailEvento;
  consecutivo: number;
  empresa?: number;
  razonSocial: string;
  nit: string;
  valor: number;
  saldoPendiente: number;
  maxLegalizacionDate: number;
  faseActual: string;
  comentario?: string;
  faseDestino?: string;
  link: string;
};

const EVENT_COPY: Record<
  AnticipoEmailEvento,
  { subject: string; headline: string; message: string; cta: string }
> = {
  I_SOLICITUD: {
    subject: "Solicitud creada",
    headline: "Tu solicitud de anticipo fue registrada",
    message:
      "El anticipo quedó creado correctamente y comenzó su ruta de aprobación. Puedes consultar su fase y trazabilidad en Trxckin.",
    cta: "Ver mi solicitud",
  },
  II_APROBACION_JEFE_DIRECTO: {
    subject: "Pendiente de aprobación de jefe directo",
    headline: "Tienes un anticipo por aprobar",
    message:
      "Fuiste seleccionado para realizar la primera aprobación de esta solicitud. Revisa los soportes y registra tu decisión.",
    cta: "Revisar anticipo",
  },
  III_REVISION_CONTABILIDAD: {
    subject: "Pendiente de revisión contable",
    headline: "Hay un anticipo para Contabilidad",
    message: "La solicitud requiere validación contable antes de continuar a Gerencia Financiera.",
    cta: "Abrir buzón",
  },
  IV_APROBACION_GERENCIA: {
    subject: "Pendiente de aprobación de Gerencia",
    headline: "Hay un anticipo para aprobación de Gerencia",
    message:
      "La solicitud completó sus revisiones anteriores y requiere la decisión de Gerencia Financiera.",
    cta: "Revisar aprobación",
  },
  IV_DESEMBOLSO_TESORERIA: {
    subject: "Pendiente de desembolso",
    headline: "Hay un anticipo aprobado para Tesorería",
    message:
      "Gerencia aprobó la solicitud. Tesorería debe registrar el desembolso y sus soportes para continuar.",
    cta: "Registrar desembolso",
  },
  V_PENDIENTE_LEGALIZACION: {
    subject: "Pendiente de legalización",
    headline: "El anticipo está pendiente de legalización",
    message:
      "El anticipo tiene saldo pendiente de legalización. Recibes este aviso como solicitante o aprobador seleccionado.",
    cta: "Consultar anticipo",
  },
  VI_LEGALIZADO: {
    subject: "Anticipo legalizado",
    headline: "El anticipo fue legalizado completamente",
    message:
      "Los cruces registrados desde Facturación consumieron todo el saldo del anticipo y el flujo quedó completado.",
    cta: "Ver trazabilidad",
  },
  DEVUELTO: {
    subject: "Anticipo devuelto",
    headline: "La solicitud fue devuelta a una fase anterior",
    message:
      "El anticipo requiere ajustes antes de continuar. Revisa la observación y la nueva fase asignada.",
    cta: "Revisar anticipo",
  },
  RECHAZADO: {
    subject: "Anticipo rechazado",
    headline: "La solicitud de anticipo fue rechazada",
    message:
      "El flujo quedó cerrado por rechazo. Consulta la observación registrada para conocer el motivo.",
    cta: "Ver trazabilidad",
  },
  ANULADO: {
    subject: "Anticipo anulado",
    headline: "La solicitud de anticipo fue anulada",
    message:
      "El flujo quedó cerrado por anulación. Consulta la trazabilidad para conocer el motivo registrado.",
    cta: "Ver trazabilidad",
  },
  AJUSTE_APLICADO: {
    subject: "Ajuste registrado",
    headline: "Se registró un ajuste al valor legalizable",
    message:
      "Gerencia o Tesorería aplicó una reducción auditada al valor legalizable del anticipo.",
    cta: "Ver trazabilidad",
  },
  AJUSTE_REVERSADO: {
    subject: "Ajuste reversado",
    headline: "Se reversó el último ajuste del anticipo",
    message:
      "El valor legalizable fue restaurado mediante un reverso auditado. Revisa si el anticipo quedó reabierto.",
    cta: "Ver trazabilidad",
  },
};

const PHASE_LABELS: Record<string, string> = {
  I_SOLICITUD: "Solicitud",
  II_APROBACION_JEFE_DIRECTO: "Aprobación de jefe directo",
  III_REVISION_CONTABILIDAD: "Revisión de Contabilidad",
  IV_APROBACION_GERENCIA: "Aprobación de Gerencia",
  IV_DESEMBOLSO_TESORERIA: "Desembolso de Tesorería",
  V_PENDIENTE_LEGALIZACION: "Pendiente de legalización",
  VI_LEGALIZADO: "Legalizado",
  COMPLETADO: "Completado",
  RECHAZADO: "Rechazado",
  ANULADO: "Anulado",
};

export function getAnticipoEmailSubject(evento: AnticipoEmailEvento, consecutivo: number) {
  return `[Anticipos] ${EVENT_COPY[evento].subject} #${consecutivo}`;
}

export default function AnticipoNotificationEmail({
  userName,
  evento,
  consecutivo,
  empresa,
  razonSocial,
  nit,
  valor,
  saldoPendiente,
  maxLegalizacionDate,
  faseActual,
  comentario,
  faseDestino,
  link,
}: AnticipoNotificationEmailProps) {
  const baseUrl = getAppUrl();
  const company = EMPRESAS_MAP[empresa ?? 1] ?? EMPRESAS_MAP[1];
  const copy = EVENT_COPY[evento];

  return (
    <Html>
      <Head />
      <Preview>{`${copy.subject}: anticipo #${consecutivo} de ${razonSocial}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoContainer}>
            <Img
              src={`${baseUrl}${company.logo}`}
              width="180"
              height="auto"
              alt={`${company.nombre} Logo`}
              style={logo}
            />
          </Section>

          <Section style={content}>
            <Text style={{ ...eyebrow, color: company.color }}>
              Anticipos Trxckin · {company.nombre}
            </Text>
            <Heading style={heading}>{copy.headline}</Heading>
            <Text style={text}>Hola {userName || "equipo"},</Text>
            <Text style={text}>{copy.message}</Text>

            <Section style={detailCard}>
              <Text style={cardLabel}>Anticipo</Text>
              <Text style={advanceNumber}>#{consecutivo}</Text>
              <Text style={supplier}>{razonSocial}</Text>
              <Text style={muted}>NIT {nit}</Text>
              <Hr style={divider} />
              <InfoRow label="Valor" value={formatCOP(valor)} />
              <InfoRow label="Saldo pendiente" value={formatCOP(saldoPendiente)} />
              <InfoRow label="Fecha máxima" value={formatDate(maxLegalizacionDate)} />
              <InfoRow label="Fase actual" value={PHASE_LABELS[faseActual] ?? faseActual} />
              {faseDestino ? (
                <InfoRow label="Fase destino" value={PHASE_LABELS[faseDestino] ?? faseDestino} />
              ) : null}
            </Section>

            {comentario ? (
              <Section style={commentBox}>
                <Text style={cardLabel}>Observación</Text>
                <Text style={commentText}>{comentario}</Text>
              </Section>
            ) : null}

            <Section style={buttonContainer}>
              <Link style={{ ...button, backgroundColor: company.color }} href={link}>
                {copy.cta}
              </Link>
            </Section>

            <Hr style={divider} />
            <Text style={footer}>
              Recibes este correo porque estás asociado al flujo de Anticipos en Trxckin. Si no
              reconoces esta notificación, contacta al área de Sistemas.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Section style={infoRow}>
      <Text style={infoLabel}>{label}</Text>
      <Text style={infoValue}>{value}</Text>
    </Section>
  );
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

const main = {
  backgroundColor: "#f4f4f7",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};
const container = { margin: "0 auto", padding: "20px 0 48px", maxWidth: "580px" };
const logoContainer = { padding: "32px", textAlign: "center" as const };
const logo = { margin: "0 auto" };
const content = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "40px",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
};
const eyebrow = {
  fontSize: "12px",
  fontWeight: "700",
  letterSpacing: "0.5px",
  margin: "0 0 10px",
  textTransform: "uppercase" as const,
};
const heading = {
  color: "#111827",
  fontSize: "24px",
  fontWeight: "700",
  lineHeight: "1.25",
  margin: "0 0 20px",
};
const text = { color: "#475569", fontSize: "16px", lineHeight: "26px", margin: "0 0 16px" };
const detailCard = {
  backgroundColor: "#f8fafc",
  borderRadius: "10px",
  padding: "22px",
  margin: "24px 0",
  border: "1px solid #e2e8f0",
};
const cardLabel = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: "700",
  letterSpacing: "0.5px",
  margin: "0 0 8px",
  textTransform: "uppercase" as const,
};
const advanceNumber = { color: "#111827", fontSize: "22px", fontWeight: "700", margin: "0 0 6px" };
const supplier = { color: "#334155", fontSize: "15px", fontWeight: "600", margin: "0" };
const muted = { color: "#64748b", fontSize: "13px", margin: "4px 0 0" };
const infoRow = { display: "flex", justifyContent: "space-between", gap: "16px" };
const infoLabel = { color: "#64748b", fontSize: "13px", margin: "4px 0" };
const infoValue = {
  color: "#111827",
  fontSize: "13px",
  fontWeight: "700",
  margin: "4px 0",
  textAlign: "right" as const,
};
const divider = { borderColor: "#e2e8f0", margin: "18px 0" };
const commentBox = {
  backgroundColor: "#fefce8",
  borderRadius: "8px",
  padding: "16px",
  margin: "20px 0",
};
const commentText = { color: "#713f12", fontSize: "14px", lineHeight: "22px", margin: "0" };
const buttonContainer = { textAlign: "center" as const, margin: "28px 0" };
const button = {
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "700",
  padding: "12px 22px",
  textDecoration: "none",
};
const footer = { color: "#94a3b8", fontSize: "12px", lineHeight: "18px", margin: "0" };
