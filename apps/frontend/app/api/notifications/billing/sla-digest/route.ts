export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getEmailFrom } from "../../../../../lib/app-env";
import { NextResponse } from "next/server";
import { Resend } from "resend";

type DigestItem = {
  facturaId: string;
  numeroFactura: string;
  proveedorNombre: string;
  fase: string;
  phaseAgeMs: number;
  assignmentAgeMs: number;
  slaOverageMs: number | null;
  slaEstado: string;
  dashboardUrl: string;
};

type Payload = {
  destinatario: { email: string; nombre?: string | null; usuarioId?: string | null };
  cc?: Array<{ email: string; nombre?: string }>;
  empresa: number;
  fechaLocal: string;
  items: DigestItem[];
};

const MAX_SIGNATURE_AGE_MS = 5 * 60_000;
const MAX_DIGEST_ITEMS = 250;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isEmail(email: string) {
  return EMAIL_PATTERN.test(normalizeEmail(email));
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

function formatAge(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return days <= 0 ? `${hours}h` : `${days}d ${hours}h`;
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

function isDigestItem(value: unknown): value is DigestItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DigestItem>;
  return (
    typeof item.facturaId === "string" &&
    typeof item.numeroFactura === "string" &&
    typeof item.proveedorNombre === "string" &&
    typeof item.fase === "string" &&
    typeof item.phaseAgeMs === "number" &&
    typeof item.assignmentAgeMs === "number" &&
    (typeof item.slaOverageMs === "number" || item.slaOverageMs === null) &&
    typeof item.slaEstado === "string" &&
    typeof item.dashboardUrl === "string" &&
    isSafeDashboardUrl(item.dashboardUrl)
  );
}

export function validateDigestPayload(value: unknown): Payload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<Payload>;
  if (
    !payload.destinatario ||
    !isEmail(payload.destinatario.email ?? "") ||
    !Number.isFinite(payload.empresa) ||
    typeof payload.fechaLocal !== "string" ||
    !Array.isArray(payload.items) ||
    payload.items.length === 0 ||
    payload.items.length > MAX_DIGEST_ITEMS ||
    !payload.items.every(isDigestItem)
  ) {
    return null;
  }
  const cc = (payload.cc ?? []).filter(
    (recipient): recipient is { email: string; nombre?: string } =>
      Boolean(recipient) && isEmail(recipient.email ?? "")
  );
  return {
    destinatario: {
      email: normalizeEmail(payload.destinatario.email),
      ...(payload.destinatario.nombre ? { nombre: payload.destinatario.nombre } : {}),
      ...(payload.destinatario.usuarioId ? { usuarioId: payload.destinatario.usuarioId } : {}),
    },
    cc: cc.map((recipient) => ({
      email: normalizeEmail(recipient.email),
      ...(recipient.nombre ? { nombre: recipient.nombre } : {}),
    })),
    empresa: payload.empresa as number,
    fechaLocal: payload.fechaLocal as string,
    items: payload.items as DigestItem[],
  };
}

export function validateDigestSignature(args: {
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
  const rows = payload.items
    .map(
      (item) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">
        <a href="${escapeHtml(item.dashboardUrl)}">${escapeHtml(item.numeroFactura)}</a><br/>
        <span style="color:#6b7280;font-size:12px;">${escapeHtml(item.proveedorNombre)}</span>
      </td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.fase)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${formatAge(item.phaseAgeMs)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${formatAge(item.assignmentAgeMs)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${item.slaOverageMs != null ? formatAge(item.slaOverageMs) : "—"}</td>
    </tr>`
    )
    .join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;">
    <h1 style="font-size:18px;">Digest SLA Facturación — ${escapeHtml(payload.fechaLocal)}</h1>
    <p>Empresa ${payload.empresa}. Facturas con SLA vencido asignadas a ti.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="text-align:left;background:#f9fafb;">
      <th style="padding:8px;">Factura</th><th style="padding:8px;">Fase</th><th style="padding:8px;">Edad fase</th><th style="padding:8px;">Edad asignación</th><th style="padding:8px;">Exceso SLA</th>
    </tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signatureValid = validateDigestSignature({
    body,
    timestamp: request.headers.get("X-Facturacion-Timestamp"),
    signature: request.headers.get("X-Facturacion-Signature"),
    secret: process.env.FACTURACION_SLA_DIGEST_SECRET,
  });
  if (!signatureValid) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  try {
    const payload = validateDigestPayload(JSON.parse(body));
    if (!payload) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    if (!resend)
      return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 503 });

    const cc = [...new Set((payload.cc ?? []).map((recipient) => recipient.email))].filter(
      (email) => email !== payload.destinatario.email
    );
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: [payload.destinatario.email],
      ...(cc.length > 0 ? { cc } : {}),
      subject: `SLA vencido — Facturación (${payload.fechaLocal})`,
      html: buildHtml(payload),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("sla-digest", error);
    return NextResponse.json({ error: "Error enviando digest" }, { status: 500 });
  }
}
