export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getEmailFrom } from "../../../../../lib/app-env";
import { NextResponse } from "next/server";
import { Resend } from "resend";

type PendienteItem = {
  subject: string;
  from: string;
  receivedDateTime: string;
  intentos: number;
  ultimoError: string | null;
};

type Payload = {
  cuentaEmail: string;
  empresa: number;
  destinatarios: string[];
  dashboardUrl: string;
  pendientes: PendienteItem[];
  totalPendientes: number;
};

const MAX_SIGNATURE_AGE_MS = 5 * 60_000;
const MAX_ITEMS = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function isEmail(email: string) {
  return EMAIL_PATTERN.test(email.trim().toLowerCase());
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character
  );
}

function isSafeDashboardUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const configured = process.env.NEXT_PUBLIC_APP_URL;
    if (!configured) return url.protocol === "https:";
    return url.origin === new URL(configured).origin;
  } catch {
    return false;
  }
}

function isPendienteItem(value: unknown): value is PendienteItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PendienteItem>;
  return (
    typeof item.subject === "string" &&
    typeof item.from === "string" &&
    typeof item.receivedDateTime === "string" &&
    typeof item.intentos === "number" &&
    (typeof item.ultimoError === "string" || item.ultimoError === null)
  );
}

export function validateAlertaPayload(value: unknown): Payload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<Payload>;
  if (
    typeof payload.cuentaEmail !== "string" ||
    !Number.isFinite(payload.empresa) ||
    !Array.isArray(payload.destinatarios) ||
    payload.destinatarios.length === 0 ||
    !payload.destinatarios.every((email) => typeof email === "string" && isEmail(email)) ||
    typeof payload.dashboardUrl !== "string" ||
    !isSafeDashboardUrl(payload.dashboardUrl) ||
    !Array.isArray(payload.pendientes) ||
    payload.pendientes.length === 0 ||
    payload.pendientes.length > MAX_ITEMS ||
    !payload.pendientes.every(isPendienteItem) ||
    typeof payload.totalPendientes !== "number"
  ) {
    return null;
  }
  return {
    cuentaEmail: payload.cuentaEmail,
    empresa: payload.empresa as number,
    destinatarios: payload.destinatarios.map((email) => email.trim().toLowerCase()),
    dashboardUrl: payload.dashboardUrl,
    pendientes: payload.pendientes as PendienteItem[],
    totalPendientes: payload.totalPendientes,
  };
}

export function validateAlertaSignature(args: {
  body: string;
  timestamp: string | null;
  signature: string | null;
  secret: string | undefined;
  nowMs?: number;
}): boolean {
  if (!args.secret || !args.timestamp || !args.signature) return false;
  const timestampMs = Number(args.timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs((args.nowMs ?? Date.now()) - timestampMs) > MAX_SIGNATURE_AGE_MS
  )
    return false;
  const expected = createHmac("sha256", args.secret)
    .update(`${args.timestamp}.${args.body}`)
    .digest("hex");
  const supplied = Buffer.from(args.signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return supplied.length === expectedBuffer.length && timingSafeEqual(supplied, expectedBuffer);
}

function buildHtml(payload: Payload): string {
  const rows = payload.pendientes
    .map(
      (item) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">
        ${escapeHtml(item.subject)}<br/>
        <span style="color:#6b7280;font-size:12px;">De ${escapeHtml(item.from)}</span>
      </td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.receivedDateTime)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${item.intentos}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#b91c1c;font-size:12px;">${escapeHtml(item.ultimoError ?? "—")}</td>
    </tr>`
    )
    .join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;">
    <h1 style="font-size:18px;">Correos de facturación sin procesar</h1>
    <p>
      La bandeja <strong>${escapeHtml(payload.cuentaEmail)}</strong> (empresa ${payload.empresa})
      tiene <strong>${payload.totalPendientes}</strong> correo(s) sin procesar con más de una hora de antigüedad.
      Revisa el detalle en <a href="${escapeHtml(payload.dashboardUrl)}">Trxckin — Correos capturados</a>.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="text-align:left;background:#f9fafb;">
      <th style="padding:8px;">Correo</th><th style="padding:8px;">Recibido</th><th style="padding:8px;">Intentos</th><th style="padding:8px;">Último error</th>
    </tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signatureValid = validateAlertaSignature({
    body,
    timestamp: request.headers.get("X-Facturacion-Timestamp"),
    signature: request.headers.get("X-Facturacion-Signature"),
    secret: process.env.FACTURACION_SLA_DIGEST_SECRET,
  });
  if (!signatureValid) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  try {
    const payload = validateAlertaPayload(JSON.parse(body));
    if (!payload) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    if (!resend)
      return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 503 });

    const destinatarios = [...new Set(payload.destinatarios)];
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: destinatarios,
      subject: `Alerta — ${payload.totalPendientes} correo(s) de facturación sin procesar (${payload.cuentaEmail})`,
      html: buildHtml(payload),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("sync-alerta", error);
    return NextResponse.json({ error: "Error enviando alerta" }, { status: 500 });
  }
}
