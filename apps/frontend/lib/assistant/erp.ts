import { z } from 'zod';
import { fetchBackend, userHasPermission, type CurrentUser } from '@/lib/fetch-backend';
import { assistantErpSchema, type AssistantToolResult, type AssistantErpInput } from './contracts';
import { AssistantHttpError } from './server-session';

const thirdPartySchema = z.object({
  erpTerceroId: z.string(),
  nit: z.string(),
  razonSocial: z.string(),
  activo: z.boolean(),
  sincronizadoEn: z.string(),
  sucursales: z.array(
    z.object({
      sucursalId: z.string(),
      descripcion: z.string(),
      activo: z.boolean(),
      condicionPago: z.string().nullable(),
    }),
  ),
});
const existenceSchema = z.object({
  existe: z.boolean(),
  tercero: thirdPartySchema.nullable(),
  catalogo: z.object({ sincronizado: z.boolean(), ultimaSincronizacion: z.string().nullable() }),
});
const catalogSchema = z.object({
  items: z.array(thirdPartySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
const supplierSearchSchema = z.object({
  proveedores: z.array(
    z.object({
      id: z.string(),
      nit: z.string(),
      razonSocial: z.string(),
      sucursalId: z.string(),
      descripcionSucursal: z.string(),
    }),
  ),
});

export function assistantErpPath(input: AssistantErpInput, user: CurrentUser, companyIds: number[]) {
  if (!companyIds.includes(input.companyId))
    throw new AssistantHttpError(403, 'La empresa no pertenece a esta conversación.');
  const global = user.hasFullAccess || user.acceso_todas_empresas === true;
  if (!global && !user.empresas?.includes(input.companyId)) throw new AssistantHttpError(403, 'Empresa no autorizada.');
  const segment = input.domain === 'suppliers' ? 'proveedores' : 'clientes';
  const query = new URLSearchParams({ empresa: String(input.companyId) });
  if (input.operation === 'document') {
    if (input.cursor) throw new AssistantHttpError(400, 'La consulta por documento no admite paginación.');
    const permission = `${input.domain}/onboarding`;
    if (!userHasPermission(user, permission))
      throw new AssistantHttpError(403, 'No tienes permiso para consultar ese catálogo.');
    query.set('documento', input.search);
    if (input.documentType) query.set('tipoDocumento', input.documentType);
    return { path: `/api/v1/${segment}/existe?${query}`, mode: 'document' as const, permission };
  }
  if (userHasPermission(user, 'administracion/terceros-erp')) {
    query.set('q', input.search);
    query.set('page', input.cursor ?? '1');
    query.set('pageSize', String(input.limit));
    return {
      path: `/api/v1/erp/catalogo/${segment}?${query}`,
      mode: 'catalog' as const,
      permission: 'administracion/terceros-erp',
    };
  }
  const permission = ['suppliers/onboarding', 'finance/advances/request', 'billing/settings'].find((p) =>
    userHasPermission(user, p),
  );
  if (input.domain !== 'suppliers' || !permission) {
    throw new AssistantHttpError(
      403,
      'La búsqueda por nombre de clientes requiere acceso al catálogo ERP. Puedes consultar un documento desde onboarding.',
    );
  }
  if (input.cursor)
    throw new AssistantHttpError(400, 'Esta búsqueda no permite avanzar de página. Acota el nombre o documento.');
  query.set('q', input.search);
  query.set('limit', String(input.limit));
  return { path: `/api/v1/proveedores/search?${query}`, mode: 'suppliers' as const, permission };
}

export async function executeAssistantErp(
  raw: unknown,
  user: CurrentUser,
  companyIds: number[],
  signal?: AbortSignal,
): Promise<AssistantToolResult> {
  const input = assistantErpSchema.parse(raw);
  const { path, mode, permission } = assistantErpPath(input, user, companyIds);
  const response = await fetchBackend(path, { signal });
  if (!response.ok)
    throw new AssistantHttpError(response.status, 'No se pudo consultar el catálogo ERP con tus permisos actuales.');
  const json: unknown = await response.json();
  const result: AssistantToolResult = {
    title: `${input.domain === 'suppliers' ? 'Proveedores' : 'Clientes'} · Catálogo ERP`,
    records: [],
    rows: [],
    sources: [{ domain: input.domain, kind: 'erp', companyId: input.companyId, erpMode: input.operation, permission }],
    metadata: {
      complete: false,
      returned: 0,
      scanned: 0,
      limit: input.limit,
      nextCursor: null,
      companyIds: [input.companyId],
      currency: null,
      from: null,
      to: null,
      asOf: Date.now(),
      notes: [],
    },
  };
  if (mode === 'suppliers') {
    const data = supplierSearchSchema.parse(json);
    result.rows = data.proveedores.slice(0, input.limit).map((row) => ({
      documento: row.nit,
      nombre: row.razonSocial,
      sucursal: row.descripcionSucursal,
      estado: 'Activo',
    }));
    result.metadata.complete = data.proveedores.length < input.limit;
    result.metadata.notes.push(
      'Solo proveedores activos. Este endpoint no publica la fecha de sincronización ni el total del catálogo.',
    );
  } else {
    let items: z.infer<typeof thirdPartySchema>[];
    if (mode === 'document') {
      const data = existenceSchema.parse(json);
      items = data.tercero ? [data.tercero] : [];
      result.metadata.complete = data.catalogo.sincronizado;
      result.metadata.notes.push(
        data.catalogo.sincronizado
          ? `Última sincronización completa: ${data.catalogo.ultimaSincronizacion ?? 'fecha no disponible'}.`
          : 'El catálogo no tiene una sincronización completa confirmada. La ausencia de un registro no demuestra que no exista en el ERP.',
      );
    } else {
      const data = catalogSchema.parse(json);
      items = data.items.slice(0, input.limit);
      const page = Number(input.cursor ?? '1');
      const hasMore = page * input.limit < data.total;
      result.metadata.complete = page === 1 && !hasMore;
      result.summary = { coincidenciasEnCatalogo: data.total };
      result.metadata.nextCursor = hasMore && page < 9999 ? String(page + 1) : null;
      result.metadata.notes.push(`Página ${page}; esta respuesta contiene solo los registros de esta página.`);
      result.metadata.notes.push(
        'Resultados del catálogo replicado; cada registro incluye su fecha de sincronización.',
      );
    }
    result.rows = items.map((row) => ({
      documento: row.nit,
      nombre: row.razonSocial,
      estado: row.activo ? 'Activo' : 'Inactivo',
      sucursales: row.sucursales.length,
      sincronizado: row.sincronizadoEn,
    }));
    if (userHasPermission(user, 'administracion/terceros-erp')) {
      result.records = items.map((row) => ({
        id: row.erpTerceroId,
        domain: input.domain,
        recordType: input.domain === 'suppliers' ? 'supplier' : 'customer',
        companyId: input.companyId,
        title: row.razonSocial,
        subtitle: `${row.nit} · ERP`,
        status: row.activo ? 'Activo' : 'Inactivo',
        date: row.sincronizadoEn,
        href: `/administracion/terceros-erp?empresa=${input.companyId}&entidad=${input.domain === 'suppliers' ? 'proveedores' : 'clientes'}&q=${encodeURIComponent(row.nit)}`,
      }));
    }
  }
  result.metadata.returned = result.rows.length;
  result.metadata.scanned = result.rows.length;
  if (!result.metadata.complete)
    result.metadata.notes.push('Resultado parcial; no representa un total completo del ERP.');
  return result;
}

export function assistantToolError(error: unknown, input: unknown): AssistantToolResult {
  const parsed = assistantErpSchema.safeParse(input);
  const message =
    error instanceof AssistantHttpError
      ? error.message
      : 'La consulta ERP no está disponible. No se han obtenido datos.';
  return {
    title: 'Consulta ERP no disponible',
    error: message,
    records: [],
    rows: [],
    sources: [],
    metadata: {
      complete: false,
      returned: 0,
      scanned: 0,
      limit: 0,
      nextCursor: null,
      companyIds: parsed.success ? [parsed.data.companyId] : [],
      currency: null,
      from: null,
      to: null,
      asOf: Date.now(),
      notes: [message],
    },
  };
}
