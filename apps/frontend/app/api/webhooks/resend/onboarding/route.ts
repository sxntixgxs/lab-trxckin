import { NextResponse } from "next/server";
import { Resend } from "resend";
import { api } from "@/convex/_generated/api";
import { convexServer, getConvexServerSecret } from "@/lib/convexServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ResendWebhookTags = Record<string, string> | Array<{ name: string; value: string }>;

export type ResendWebhookEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    tags?: ResendWebhookTags;
    bounce?: { message?: string };
    failed?: { reason?: string };
  };
};

export function tagsToRecord(tags: ResendWebhookTags | undefined): Record<string, string> | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return Object.fromEntries(tags.map((tag) => [tag.name, tag.value]));
  return tags;
}

export function parseProviderTimestamp(event: ResendWebhookEvent, now = Date.now()): number {
  const raw = event.created_at ?? event.data?.created_at;
  if (!raw) return now;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? now : parsed;
}

/** Webhook de Resend (firmado con Svix). Un solo endpoint para proveedores y clientes. */
export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Webhook no configurado" }, { status: 500 });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Resend no configurado" }, { status: 500 });

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Encabezados Svix faltantes" }, { status: 400 });
  }

  const payload = await request.text();
  let event: ResendWebhookEvent;
  try {
    event = new Resend(apiKey).webhooks.verify({
      payload,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    }) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const tags = tagsToRecord(event.data?.tags);
  if (tags?.workflow !== "onboarding") {
    return NextResponse.json({ ok: true, ignored: true, reason: "unrelated_event" });
  }
  const resendEmailId = event.data?.email_id;
  if (!resendEmailId) return NextResponse.json({ ok: true, ignored: true, reason: "missing_email_id" });

  const result = await convexServer.mutation(api.onboarding.correos.aplicarEventoWebhookResend, {
    secret: getConvexServerSecret(),
    resendEmailId,
    svixId,
    tipoEvento: event.type ?? "unknown",
    eventoProveedorEn: parseProviderTimestamp(event),
    detalleFallo: event.data?.bounce?.message ?? event.data?.failed?.reason ?? undefined,
  });
  return NextResponse.json(result);
}
