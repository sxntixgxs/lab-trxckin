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
import * as React from "react";
import { getAppUrl } from "@/lib/app-env";

import { EMPRESAS_MAP } from "@/lib/empresas";

export type FacturacionEmailFase =
  | "recepcion"
  | "revision_lider"
  | "jefe_directo"
  | "causacion"
  | "revision_impuestos"
  | "eventos_dian"
  | "gerencia"
  | "revision_tesoreria"
  | "pagada"
  | "legalizada"
  | "cerrada"
  | "rechazada_dian";

type FacturacionFaseNotificationEmailProps = {
  userName: string;
  fase: FacturacionEmailFase;
  facturaNumero: string;
  proveedorNombre: string;
  proveedorNit?: string;
  total: number;
  moneda: string;
  fechaEmision: string;
  fechaVencimiento?: string;
  link: string;
  comentario?: string;
  empresa?: number;
};

const PHASE_COPY: Record<
  FacturacionEmailFase,
  { subject: string; headline: string; message: string; cta: string }
> = {
  recepcion: {
    subject: "Factura recibida para recepción",
    headline: "Has recibido una factura para revisión",
    message:
      "La factura fue capturada en Trxckin y quedó en tu buzón para validación inicial y asignación de líderes.",
    cta: "Abrir buzón",
  },
  revision_lider: {
    subject: "Factura asignada a líder de proceso",
    headline: "Tienes una factura para revisión como líder",
    message:
      "Revisa la factura, valida si corresponde al proceso y define si debe avanzar a causación o asignarse a otro líder.",
    cta: "Revisar factura",
  },
  jefe_directo: {
    subject: "Factura asignada a jefe directo",
    headline: "Tienes una factura pendiente como jefe directo",
    message:
      "La factura fue enviada por el líder de proceso y requiere tu revisión para continuar.",
    cta: "Revisar en buzón",
  },
  causacion: {
    subject: "Factura en causación",
    headline: "Tienes una factura para causación",
    message:
      "La factura fue aprobada por el proceso y está lista para análisis de causación.",
    cta: "Abrir buzón",
  },
  revision_impuestos: {
    subject: "Factura para revisión de impuestos",
    headline: "Tienes una factura para revisión contable",
    message:
      "La factura fue causada y requiere revisión de impuestos antes de continuar con Eventos DIAN.",
    cta: "Revisar factura",
  },
  eventos_dian: {
    subject: "Factura para Eventos DIAN",
    headline: "Tienes una factura para validación DIAN",
    message:
      "La factura fue revisada por contabilidad y requiere registro o validación de eventos DIAN.",
    cta: "Abrir buzón",
  },
  gerencia: {
    subject: "Factura pendiente de gerencia",
    headline: "Tienes una factura para aprobación de gerencia",
    message:
      "La factura llegó a gerencia y requiere aprobación para avanzar a tesorería.",
    cta: "Revisar aprobación",
  },
  revision_tesoreria: {
    subject: "Factura para tesorería",
    headline: "Tienes una factura para revisión de pago",
    message:
      "La factura fue aprobada por gerencia y requiere revisión final o soporte de pago.",
    cta: "Abrir buzón",
  },
  pagada: {
    subject: "Factura marcada como pagada",
    headline: "Una factura fue pagada",
    message:
      "La factura cerró su flujo como pagada. Recibes este aviso porque haces parte del rol de notificación de pagadas.",
    cta: "Ver factura",
  },
  legalizada: {
    subject: "Factura legalizada",
    headline: "Una factura fue legalizada",
    message:
      "La factura cerró como legalizada. Recibes este aviso porque haces parte del rol de notificación de legalizadas.",
    cta: "Ver factura",
  },
  cerrada: {
    subject: "Factura cerrada en recepción",
    headline: "Una factura fue cerrada",
    message:
      "La factura se cerró desde recepción sin continuar el flujo. Recibes este aviso porque haces parte del rol de notificación de legalizadas.",
    cta: "Ver factura",
  },
  rechazada_dian: {
    subject: "Factura rechazada en DIAN",
    headline: "Una factura fue enviada a rechazo DIAN",
    message:
      "La factura quedó marcada para rechazo DIAN. Recibes este aviso por tu rol de seguimiento.",
    cta: "Ver factura",
  },
};

export function getFacturacionFaseEmailSubject(
  fase: FacturacionEmailFase,
  facturaNumero: string,
) {
  return `[Facturación] ${PHASE_COPY[fase].subject} #${facturaNumero}`;
}

export default function FacturacionFaseNotificationEmail({
  userName,
  fase,
  facturaNumero,
  proveedorNombre,
  proveedorNit,
  total,
  moneda,
  fechaEmision,
  fechaVencimiento,
  link,
  comentario,
  empresa,
}: FacturacionFaseNotificationEmailProps) {
  const baseUrl = getAppUrl();
  const copy = PHASE_COPY[fase];
  const empresaInfo = EMPRESAS_MAP[empresa ?? 1] ?? EMPRESAS_MAP[1];

  return (
    <Html>
      <Head />
      <Preview>
        {copy.subject}: factura #{facturaNumero} de {proveedorNombre}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoContainer}>
            <Img
              src={`${baseUrl}${empresaInfo.logo}`}
              width="180"
              height="auto"
              alt={`${empresaInfo.nombre} Logo`}
              style={logo}
            />
          </Section>

          <Section style={content}>
            <Text style={{ ...eyebrow, color: empresaInfo.color }}>
              Facturación Trxckin - {empresaInfo.nombre}
            </Text>
            <Heading style={h1}>{copy.headline}</Heading>
            <Text style={text}>Hola {userName || "equipo"},</Text>
            <Text style={text}>{copy.message}</Text>

            <Section style={card}>
              <Text style={cardLabel}>Factura</Text>
              <Text style={invoiceNumber}>#{facturaNumero}</Text>
              <Text style={supplier}>{proveedorNombre}</Text>
              {proveedorNit ? <Text style={muted}>NIT {proveedorNit}</Text> : null}
              <Hr style={hr} />
              <InfoRow label="Valor" value={formatCurrency(total, moneda)} />
              <InfoRow label="Emisión" value={formatDate(fechaEmision)} />
              {fechaVencimiento ? (
                <InfoRow label="Vencimiento" value={formatDate(fechaVencimiento)} />
              ) : null}
            </Section>

            {comentario ? (
              <Section style={commentBox}>
                <Text style={cardLabel}>Observación</Text>
                <Text style={commentText}>{comentario}</Text>
              </Section>
            ) : null}

            <Section style={buttonContainer}>
              <Link
                style={{ ...button, backgroundColor: empresaInfo.color }}
                href={link}
              >
                {copy.cta}
              </Link>
            </Section>

            <Hr style={hr} />
            <Text style={footer}>
              Recibes este correo porque estás asociado al flujo de facturación
              en Trxckin. Si no reconoces esta notificación, contacta al área de
              Sistemas.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRow}>
      <Text style={infoLabel}>{label}</Text>
      <Text style={infoValue}>{value}</Text>
    </div>
  );
}

function formatCurrency(value: number, currency = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "COP" ? 0 : 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(parseCalendarDate(value));
}

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(value);
}

const main = {
  backgroundColor: "#f4f4f7",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "580px",
};

const logoContainer = {
  padding: "32px",
  textAlign: "center" as const,
};

const logo = {
  margin: "0 auto",
};

const content = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "40px",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
};

const eyebrow = {
  color: "#0f766e",
  fontSize: "12px",
  fontWeight: "700",
  letterSpacing: "0.5px",
  margin: "0 0 10px",
  textTransform: "uppercase" as const,
};

const h1 = {
  color: "#111827",
  fontSize: "24px",
  fontWeight: "700",
  lineHeight: "1.2",
  margin: "0 0 20px",
};

const text = {
  color: "#475569",
  fontSize: "16px",
  lineHeight: "26px",
  margin: "0 0 16px",
};

const card = {
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

const invoiceNumber = {
  color: "#111827",
  fontSize: "22px",
  fontWeight: "700",
  margin: "0 0 6px",
};

const supplier = {
  color: "#334155",
  fontSize: "15px",
  fontWeight: "600",
  margin: "0",
};

const muted = {
  color: "#64748b",
  fontSize: "13px",
  margin: "4px 0 0",
};

const infoRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
};

const infoLabel = {
  color: "#64748b",
  fontSize: "13px",
  margin: "4px 0",
};

const infoValue = {
  color: "#111827",
  fontSize: "13px",
  fontWeight: "700",
  margin: "4px 0",
  textAlign: "right" as const,
};

const commentBox = {
  backgroundColor: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: "10px",
  padding: "18px",
  marginBottom: "24px",
};

const commentText = {
  color: "#78350f",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "30px 0",
};

const button = {
  backgroundColor: "#0f172a",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "700",
  padding: "13px 22px",
  textDecoration: "none",
};

const hr = {
  borderColor: "#e2e8f0",
  margin: "18px 0",
};

const footer = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: "20px",
  margin: "0",
};
