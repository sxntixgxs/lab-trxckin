import { NextResponse } from 'next/server';
import { requireWorkforceActor, workforceDirectory, workforceError } from '@/lib/workforce/server';

export async function GET(request: Request) {
  const companyId = Number(new URL(request.url).searchParams.get('companyId'));
  if (!Number.isInteger(companyId) || companyId < 1)
    return NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 });
  try {
    const { actor } = await requireWorkforceActor(companyId);
    if (
      !actor.admin &&
      !actor.permissions.some((p) => ['workforce/employees', 'workforce/settings', 'workforce/scheduling'].includes(p))
    )
      return NextResponse.json({ error: 'No tienes acceso al directorio.' }, { status: 403 });
    return NextResponse.json(await workforceDirectory(companyId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const { message, status } = workforceError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
