import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import * as React from "react";
import { getFormBranding } from "@/lib/onboarding/branding";
import {
  buildMensaje,
  ctaLabel,
  emailTipoConfig,
  esTipoInterno,
  type OnboardingEmailProps,
} from "@/lib/onboarding/email-types";

const MODULO_LABEL = { supplier: "Inscripción de Proveedores", customer: "Inscripción de Clientes" } as const;

export const OnboardingEmail = (props: OnboardingEmailProps) => {
  const { modulo, tipo, destinatarioNombre, ctaUrl, destinatarioTipo, empresa } = props;
  const branding = getFormBranding(empresa);
  const config = emailTipoConfig(modulo, tipo);
  const mensaje = buildMensaje(props);
  const isRechazo = tipo === "DOC_RECHAZADO" || tipo === "FASE_IV_RECHAZADA" || tipo === "FASE_V_RECHAZADA";
  const isAccionTercero = isRechazo || tipo === "EVALUACION_CUMPLIMIENTO_CAMBIADA";
  const isInterno = destinatarioTipo === "interno" || esTipoInterno(modulo, tipo);
  const label = ctaLabel(modulo, tipo, isInterno ? "interno" : "tercero");
  const preLine = tipo === "EVALUACION_CUMPLIMIENTO_CAMBIADA";

  return (
    <Html lang="es">
      <Head />
      <Preview>
        {config.asunto} — {branding.nombre}
      </Preview>
      <Body style={body}>
        <Container style={card}>
          <Section style={{ ...header, backgroundColor: branding.color }}>
            <Text style={headerCompanyName}>{branding.nombre}</Text>
          </Section>

          <Section style={labelRow}>
            <Text style={{ ...moduleLabel, color: branding.color }}>
              {MODULO_LABEL[modulo]} · {branding.nombreCorto}
            </Text>
          </Section>

          <Section style={titleRow}>
            <Heading style={titleText}>{config.titulo}</Heading>
          </Section>

          <Hr style={divider} />

          <Section style={contentRow}>
            <Text style={greeting}>
              Hola <strong>{destinatarioNombre}</strong>,
            </Text>
            {props.tipoTramite && (
              <Text style={{ ...message, marginBottom: 10, fontWeight: 600 }}>
                {props.tipoTramite === "ACTUALIZACIÓN" ? "Actualización de datos" : "Inscripción nueva"}
              </Text>
            )}
            <Text style={preLine ? { ...message, whiteSpace: "pre-line" } : message}>{mensaje}</Text>

            {tipo === "INSCRIPCION_COMPLETADA" && props.tieneFormularioPdf && (
              <Section style={{ ...callout, borderLeftColor: branding.color }}>
                <Text style={calloutText}>Adjunto: formulario de inscripción (PDF).</Text>
              </Section>
            )}
            {tipo === "INSCRIPCION_COMPLETADA" && props.tieneReporteTiemposPdf && (
              <Section style={{ ...callout, borderLeftColor: branding.color }}>
                <Text style={calloutText}>Adjunto para Financiero: reporte de tiempos por fase (PDF).</Text>
              </Section>
            )}

            {isAccionTercero && (
              <Section style={{ ...callout, borderLeftColor: branding.color }}>
                <Text style={calloutText}>Se requiere su acción para continuar con el proceso de inscripción.</Text>
              </Section>
            )}

            {ctaUrl && (
              <Section style={ctaRow}>
                <Button href={ctaUrl} style={{ ...ctaBtn, backgroundColor: branding.color }}>
                  {label}
                </Button>
              </Section>
            )}
          </Section>

          <Hr style={footerDivider} />
          <Section style={footerRow}>
            <Text style={footerText}>Mensaje automático — no responda este correo.</Text>
            {branding.web && (
              <Text style={footerText}>
                Más información:{" "}
                <a href={branding.web} style={{ color: "#94a3b8" }}>
                  {branding.web.replace(/^https?:\/\//, "")}
                </a>
              </Text>
            )}
            <Text style={footerCopy}>
              © {new Date().getFullYear()} {branding.nombre}. Todos los derechos reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default OnboardingEmail;

const body: React.CSSProperties = {
  backgroundColor: "#f1f5f9",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
};
const card: React.CSSProperties = {
  margin: "0 auto",
  padding: 0,
  maxWidth: "560px",
  backgroundColor: "#ffffff",
  borderRadius: "10px",
  overflow: "hidden",
  boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  marginTop: "40px",
  marginBottom: "60px",
};
const header: React.CSSProperties = { padding: "36px 48px", textAlign: "center" };
const headerCompanyName: React.CSSProperties = {
  margin: 0,
  color: "#ffffff",
  fontSize: "20px",
  fontWeight: 700,
  textAlign: "center",
  letterSpacing: "-0.3px",
};
const labelRow: React.CSSProperties = { padding: "20px 48px 0" };
const moduleLabel: React.CSSProperties = {
  margin: 0,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.8px",
  textTransform: "uppercase",
};
const titleRow: React.CSSProperties = { padding: "10px 48px 0" };
const titleText: React.CSSProperties = { margin: 0, fontSize: "24px", fontWeight: 700, color: "#0f172a", lineHeight: "1.25" };
const divider: React.CSSProperties = { borderColor: "#e2e8f0", margin: "24px 48px" };
const contentRow: React.CSSProperties = { padding: "0 48px" };
const greeting: React.CSSProperties = { margin: "0 0 12px", fontSize: "15px", color: "#334155", lineHeight: "1.6" };
const message: React.CSSProperties = { margin: "0 0 28px", fontSize: "15px", color: "#475569", lineHeight: "1.75" };
const callout: React.CSSProperties = {
  borderLeft: "3px solid",
  backgroundColor: "#f8fafc",
  padding: "12px 16px",
  borderRadius: "4px",
  marginBottom: "24px",
};
const calloutText: React.CSSProperties = { margin: 0, fontSize: "14px", color: "#334155", lineHeight: "1.5" };
const ctaRow: React.CSSProperties = { textAlign: "center", paddingBottom: "12px" };
const ctaBtn: React.CSSProperties = {
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  textAlign: "center",
  display: "inline-block",
  padding: "13px 32px",
};
const footerDivider: React.CSSProperties = { borderColor: "#e2e8f0", margin: "28px 48px 0" };
const footerRow: React.CSSProperties = { padding: "20px 48px 32px", textAlign: "center" };
const footerText: React.CSSProperties = { margin: "0 0 4px", fontSize: "12px", color: "#94a3b8", textAlign: "center" };
const footerCopy: React.CSSProperties = { margin: 0, fontSize: "11px", color: "#cbd5e1", textAlign: "center" };
