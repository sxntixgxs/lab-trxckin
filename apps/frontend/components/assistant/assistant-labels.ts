import { STAGE_LABELS } from '@/app/(default)/billing/lib/workflow-config';
import { faseLabels as ADVANCE_LABELS } from '@/app/(default)/finance/advances/dashboard/constants';
import { MOVIMIENTO_ESTADO_LABELS, REEMBOLSO_ESTADO_LABELS } from '@/lib/cajas-menores';
import { EMPRESAS_MAP } from '@/lib/empresas';
import { CUSTOMER_FASE_LABELS } from '@/lib/onboarding/phases/customers';
import { SUPPLIER_FASE_LABELS } from '@/lib/onboarding/phases/suppliers';
import type { AssistantCell, AssistantDomain } from '@/lib/assistant/contracts';
import { formatAmount } from './assistant-helpers';

const FIELD_LABELS: Record<string, string> = {
  id: 'Identificador',
  empresa: 'Empresa',
  factura: 'Factura',
  proveedor: 'Proveedor',
  nit: 'NIT',
  estado: 'Estado',
  fecha: 'Fecha',
  totalFactura: 'Total de factura',
  valorContable: 'Valor contable',
  valorAPagar: 'Valor a pagar',
  moneda: 'Moneda',
  responsable: 'Responsable',
  responsableId: 'Identificador del responsable',
  sla: 'Plazo de atención',
  venceSla: 'Vencimiento del plazo',
  diasHabilesEnFase: 'Días hábiles en la etapa',
  consecutivo: 'Consecutivo',
  valorSolicitado: 'Valor solicitado',
  valorLegalizable: 'Valor legalizable',
  saldoLegalizado: 'Saldo legalizado',
  saldoPendiente: 'Saldo pendiente',
  fechaMaximaLegalizacion: 'Fecha límite de legalización',
  vencido: 'Vencido',
  proceso: 'Proceso',
  razonSocial: 'Razón social',
  riesgo: 'Riesgo',
  tipoSolicitud: 'Tipo de solicitud',
  registroErpEnProceso: 'Registro ERP en proceso',
  caja: 'Caja menor',
  valorAsignado: 'Valor asignado',
  saldoActual: 'Saldo actual',
  saldoDisponible: 'Saldo disponible',
  recargaPendiente: 'Recarga pendiente',
  reembolso: 'Reembolso',
  valor: 'Valor',
  registros: 'Registros',
  concepto: 'Concepto',
  valorAplicado: 'Valor aplicado',
  documento: 'Documento',
  nombre: 'Nombre',
  sucursal: 'Sucursal',
  sucursales: 'Sucursales',
  sincronizado: 'Última sincronización',
  coincidenciasEnCatalogo: 'Coincidencias en el catálogo',
};
const MONEY_FIELDS = new Set([
  'totalFactura',
  'valorContable',
  'valorAPagar',
  'valorSolicitado',
  'valorLegalizable',
  'saldoLegalizado',
  'saldoPendiente',
  'valorAsignado',
  'saldoActual',
  'saldoDisponible',
  'recargaPendiente',
  'valor',
  'valorAplicado',
]);
const STATUS_LABELS: Record<AssistantDomain, Record<string, string>> = {
  billing: STAGE_LABELS,
  suppliers: SUPPLIER_FASE_LABELS,
  customers: CUSTOMER_FASE_LABELS,
  advances: ADVANCE_LABELS,
  pettyCash: {
    ...MOVIMIENTO_ESTADO_LABELS,
    ...REEMBOLSO_ESTADO_LABELS,
    activa: 'Activa',
    inactiva: 'Inactiva',
    cerrada: 'Cerrada',
  },
};

function humanize(value: string) {
  const words = value
    .replace(/([a-záéíóúñ])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLocaleLowerCase('es');
  return words.charAt(0).toLocaleUpperCase('es') + words.slice(1);
}

export function assistantFieldLabel(key: string): string {
  const currency = key.match(/^(.*)_(COP|USD|EUR|GBP|sin_moneda)$/);
  if (currency)
    return `${assistantFieldLabel(currency[1])} (${currency[2] === 'sin_moneda' ? 'sin moneda' : currency[2]})`;
  return FIELD_LABELS[key] ?? humanize(key);
}

export function assistantStatusLabel(value: string, domain?: AssistantDomain) {
  if (domain && STATUS_LABELS[domain][value]) return STATUS_LABELS[domain][value];
  if (value === 'sin_tarea') return 'Sin tarea asignada';
  return humanize(value);
}

export function knownAssistantStatusLabel(value: string, domain?: AssistantDomain): string | undefined {
  if (domain) return STATUS_LABELS[domain][value];
  const labels = new Set(
    Object.values(STATUS_LABELS)
      .map((statuses) => statuses[value])
      .filter(Boolean),
  );
  return labels.size === 1 ? [...labels][0] : undefined;
}

export function assistantCellLabel(
  key: string,
  value: AssistantCell | undefined,
  domain?: AssistantDomain,
  currency?: string | null,
): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') {
    if (key === 'empresa') return EMPRESAS_MAP[value]?.nombreCorto ?? `Empresa ${value}`;
    if (MONEY_FIELDS.has(key) && currency) return formatAmount(value, currency);
    return new Intl.NumberFormat('es-CO').format(value);
  }
  if (['estado', 'fase', 'faseActual'].includes(key)) return assistantStatusLabel(value, domain);
  if (key === 'sla') return humanize(value);
  return value;
}

export function assistantSummaryLabel(key: string, value: number) {
  const currency = key.match(/^(.*)_(COP|USD|EUR|GBP)$/);
  return currency && MONEY_FIELDS.has(currency[1])
    ? formatAmount(value, currency[2])
    : new Intl.NumberFormat('es-CO').format(value);
}

const COMPLETENESS_NOTES: Array<[string, string]> = [
  [
    'Resultados parciales; continúa con nextCursor si está presente.',
    'Resultados parciales. Puedes pedir la siguiente página cuando haya más resultados disponibles.',
  ],
  [
    'Listado basado en la proyección de facturación; las filas sin proyección requieren consulta por ID.',
    'El listado puede omitir facturas que aún no aparecen en el resumen del módulo. Verifica los registros que falten desde su detalle en Facturación.',
  ],
  [
    'Listado basado en la proyección de anticipos; las filas sin proyección requieren consulta por ID.',
    'El listado puede omitir anticipos que aún no aparecen en el resumen del módulo. Verifica los registros que falten desde su detalle en Anticipos.',
  ],
  [
    'Cobertura de la proyección operativa del módulo; registros antiguos sin proyección no están incluidos.',
    'El resumen incluye la información disponible en el listado del módulo y puede omitir registros antiguos. Verifica su detalle antes de tomarlo como un total completo.',
  ],
  [
    'Los reembolsos antiguos sin empresa proyectada requieren consulta por ID.',
    'El listado puede omitir reembolsos antiguos cuya empresa no está identificada. Verifica esos reembolsos desde su detalle en el módulo.',
  ],
  [
    'Historial de responsables truncado; no se puede confirmar que todos estén incluidos.',
    'El historial de responsables está incompleto; puede haber otros responsables que no aparezcan aquí.',
  ],
  [
    'Solo proveedores activos. Este endpoint no publica la fecha de sincronización ni el total del catálogo.',
    'Solo se muestran proveedores activos. Esta consulta no informa la fecha de actualización ni el total del catálogo.',
  ],
  [
    'Resultados del catálogo replicado; cada registro incluye su fecha de sincronización.',
    'Se muestran los datos del ERP disponibles tras su sincronización; cada registro incluye su fecha de actualización.',
  ],
];

/** Presentation only: saved evidence keeps its original coverage metadata. */
export function assistantCompletenessNote(note: string) {
  let copy = note;
  for (const [technical, business] of COMPLETENESS_NOTES) copy = copy.replaceAll(technical, business);
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    if (/[A-Z_]/.test(key))
      copy = copy.replace(new RegExp(`\\b${key}\\b`, 'g'), label.charAt(0).toLocaleLowerCase('es') + label.slice(1));
  }
  return copy
    .replace(/\bnextCursor\b/g, 'la siguiente página')
    .replace(/\bcursor\b/gi, 'paginación')
    .replace(/\bproyecci[oó]n(?: operativa)?\b/gi, 'listado disponible')
    .replace(/\bempresa proyectada\b/gi, 'empresa identificada en el listado')
    .replace(/\bconsulta por ID\b|\bquery-by-ID\b/gi, 'consulta del registro concreto')
    .replace(/\bquery\b/gi, 'consulta')
    .replace(/\bendpoint\b/gi, 'servicio de consulta')
    .replaceAll('America/Bogota', 'hora de Colombia');
}
