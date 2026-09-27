import { withAuth } from '@workos-inc/authkit-nextjs';
import { ConvexError } from 'convex/values';
import { fetchBackend, getCurrentBackendUser } from '@/lib/fetch-backend';
import { readImpersonateCookie } from '@/lib/impersonate-cookie';
import { EMPRESAS_MAP } from '@/lib/empresas';
import type { DirectoryUser, TrustedActor, WorkforceCommand } from './types';

export class WorkforceHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireWorkforceActor(companyId: number) {
  const auth = await withAuth();
  if (!auth.user || !auth.accessToken) throw new WorkforceHttpError(401, 'Inicia sesión para continuar.');
  if (await readImpersonateCookie())
    throw new WorkforceHttpError(403, 'Sal de la suplantación para operar el módulo de trabajadores.');
  const user = await getCurrentBackendUser({ skipImpersonation: true });
  if (!user?.activo || user.workosUserId !== auth.user.id)
    throw new WorkforceHttpError(403, 'La cuenta no está activa o no corresponde a la sesión.');
  const admin = user.hasFullAccess || user.permisos.includes('*');
  if (!EMPRESAS_MAP[companyId] || (!admin && !user.acceso_todas_empresas && !user.empresas?.includes(companyId)))
    throw new WorkforceHttpError(403, 'Empresa no autorizada.');
  if (!admin && !user.permisos.some((p) => p.startsWith('workforce/')))
    throw new WorkforceHttpError(403, 'No tienes acceso a Talento humano.');
  const actor: TrustedActor = {
    userId: user.id,
    workosUserId: auth.user.id,
    name: user.nombre,
    permissions: user.permisos,
    companyIds: user.empresas ?? [],
    allCompanies: admin || user.acceso_todas_empresas === true,
    admin,
  };
  const secret = process.env.CONVEX_SERVER_SECRET;
  if (!secret) throw new WorkforceHttpError(503, 'El servicio de trabajadores no está configurado.');
  return { actor, secret, token: auth.accessToken };
}

type DirectoryRecord = {
  id: string;
  nombre: string;
  email: string;
  activo?: boolean;
  empresas?: number[];
  acceso_todas_empresas?: boolean;
};
async function directory(companyId: number): Promise<DirectoryRecord[]> {
  const response = await fetchBackend(`/api/v1/usuarios/directorio?empresaId=${companyId}&includeGlobalAccess=true`, {
    skipImpersonation: true,
  });
  if (!response.ok) throw new WorkforceHttpError(503, 'No se pudo consultar el directorio. Reintenta.');
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new WorkforceHttpError(503, 'El directorio devolvió una respuesta inválida.');
  return body.filter((value): value is DirectoryRecord => {
    if (!value || typeof value !== 'object') return false;
    const row = value as DirectoryRecord;
    return (
      typeof row.id === 'string' &&
      typeof row.nombre === 'string' &&
      typeof row.email === 'string' &&
      row.activo === true &&
      (row.acceso_todas_empresas === true || row.empresas?.includes(companyId) === true)
    );
  });
}

export async function workforceDirectory(companyId: number): Promise<DirectoryUser[]> {
  return (await directory(companyId)).map((user) => ({ id: user.id, name: user.nombre, email: user.email }));
}

/** Do not let catalog IDs turn an unrelated or disabled account into a worker/manager. */
export async function validateLinkedAccounts(companyId: number, command: WorkforceCommand) {
  const ids =
    command.type === 'saveEmployee'
      ? [command.employee.linkedUserId].filter((id): id is string => Boolean(id))
      : command.type === 'saveGroup'
        ? command.group.managerIds
        : command.type === 'saveSettings'
          ? command.hrUserIds
          : [];
  if (!ids.length) return;
  const allowed = new Set((await directory(companyId)).map((user) => user.id));
  if (ids.some((id) => !allowed.has(id)))
    throw new WorkforceHttpError(400, 'Selecciona cuentas activas con acceso a esta empresa.');
}

export function workforceError(error: unknown): { status: number; message: string } {
  if (error instanceof WorkforceHttpError) return { status: error.status, message: error.message };
  // Transport failures may occur after commit. Preserve the request ID by marking
  // their outcome uncertain instead of treating them as a rejected operation.
  const raw = error instanceof Error ? error.message : '';
  const domain =
    error instanceof ConvexError && typeof error.data === 'string'
      ? error.data
      : raw.match(/Uncaught (?:Error|ConvexError): ([\s\S]*)/)?.[1];
  if (!domain)
    return {
      status: 503,
      message: 'No se recibió confirmación del servicio. Reintenta la misma solicitud para recuperar el resultado.',
    };
  // Convex adds transport frames; return only the domain message, never a stack.
  const message = domain.split(/\n\s+at /)[0].trim();
  const status = /no autorizad|sin permiso|acceso|suplant|autenticad/i.test(message)
    ? 403
    : /revisi[oó]n|conflicto|actualiz|concurr|cerrad/i.test(message)
      ? 409
      : 400;
  return {
    status,
    message: message.length > 500 ? 'No se pudo completar la operación. Actualiza y reintenta.' : message,
  };
}
