import { NextResponse } from 'next/server';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import { commandEnvelopeSchema, snapshotQuerySchema } from '@/lib/workforce/schemas';
import { requireWorkforceActor, validateLinkedAccounts, workforceError } from '@/lib/workforce/server';

export async function GET(request: Request) {
  const parsed = snapshotQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Consulta inválida.' }, { status: 400 });
  try {
    const { actor, secret, token } = await requireWorkforceActor(parsed.data.companyId);
    const data = await fetchQuery(
      api.workforce.api.snapshot,
      { ...parsed.data, actor, secret, now: Date.now() },
      { token },
    );
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const { message, status } = workforceError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  // Reject cross-origin browser writes; authenticated same-origin JSON remains supported.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403 });
  if (!request.headers.get('content-type')?.includes('application/json'))
    return NextResponse.json({ error: 'Envía una solicitud JSON.' }, { status: 415 });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 1_000_000) return NextResponse.json({ error: 'La operación es demasiado grande.' }, { status: 413 });
  const parsed = commandEnvelopeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Operación inválida.' }, { status: 400 });
  try {
    const { actor, secret, token } = await requireWorkforceActor(parsed.data.companyId);
    await validateLinkedAccounts(parsed.data.companyId, parsed.data.command);
    const data = await fetchMutation(api.workforce.api.execute, { ...parsed.data, actor, secret }, { token });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const { message, status } = workforceError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
