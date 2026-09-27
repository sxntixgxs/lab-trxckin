import { CUSTOMER_FASE_ROL } from '../../lib/onboarding/phases/customers';
import { SUPPLIER_FASE_ROL } from '../../lib/onboarding/phases/suppliers';

/** Curated from the checked-in module guides. Never describes an individual record. */
export const ASSISTANT_WORKFLOWS = {
  billing: {
    title: 'Facturación: de recepción a pago',
    sourcePaths: ['docs/billing.md', 'convex/lib/facturacionOwnership.ts', 'convex/lib/facturacionBusinessTime.ts'],
    steps: [
      'Recepción asigna los líderes del proceso. Todos los líderes asignados deben aprobar la recepción del bien o servicio.',
      'Causación registra el número FP, el valor contable y los cruces internos; después pasa a revisión de impuestos (Contabilidad).',
      'Contabilidad remite a Eventos DIAN o a Gerencia según el flujo. Gerencia aprueba el paso a Tesorería.',
      'Tesorería registra pagos parciales hasta saldar la factura (Pagada), o confirma sin desembolso cuando anticipos o cruces la cubren (Legalizada).',
      'El dueño actual puede devolver o solicitar rechazo DIAN según su fase. Las devoluciones y reasignaciones quedan en el historial.',
      'El SLA usa días hábiles de Colombia, zona America/Bogota, por empresa y fase. La alerta comienza al 80 % del umbral; sin configuración no se debe inventar una fecha límite.',
      'Anticipos y caja menor tienen cruces específicos. Una factura no puede ser ambas legalizaciones simultáneamente.',
    ],
  },
  suppliers: {
    title: 'Inscripción y actualización de proveedores',
    sourcePaths: ['docs/suppliers.md', 'docs/onboarding.md', 'lib/onboarding/phases/suppliers.ts'],
    phaseRoles: SUPPLIER_FASE_ROL,
    steps: [
      'El responsable registra datos y matriz de riesgo; el servidor calcula el riesgo y tipo de evaluación. La consulta por documento al ERP distingue inscripción de actualización y se verifican procesos previos.',
      'El proveedor completa formulario y documentos requeridos; luego firma el representante legal.',
      'Cumplimiento y Compras revisan sus documentos en paralelo. Los documentos rechazados se vuelven a cargar y revisar.',
      'El aprobador de Cumplimiento depende del tipo de evaluación y riesgo.',
      'Compras registra y confirma su evaluación; Contabilidad confirma la creación o actualización en el ERP para completar el proceso.',
      'Consultar un proceso completado no prueba por sí solo la existencia actual en el ERP: se debe usar la consulta de catálogo por documento.',
    ],
  },
  customers: {
    title: 'Inscripción y actualización de clientes',
    sourcePaths: ['docs/customers.md', 'docs/onboarding.md', 'lib/onboarding/phases/customers.ts'],
    phaseRoles: CUSTOMER_FASE_ROL,
    steps: [
      'El responsable comercial registra datos, riesgo y condiciones de pago. La consulta por documento al ERP determina inscripción o actualización y se verifican procesos previos.',
      'El cliente completa el formulario; los documentos pueden completarse después. Las condiciones de pago las define el equipo interno.',
      'El representante legal firma. Cumplimiento revisa los documentos y solicita correcciones cuando corresponde.',
      'Cumplimiento aprueba según el nivel de riesgo; Contabilidad confirma la creación o actualización para completar el proceso.',
      'Este flujo no incluye Compras ni evaluación de proveedores. La existencia actual en el ERP requiere una consulta de catálogo por documento.',
    ],
  },
  advances: {
    title: 'Anticipos y legalización',
    sourcePaths: ['docs/finance.md', 'convex/financiero/anticipos.ts', 'convex/lib/valorLegalizableAnticipo.ts'],
    steps: [
      'El solicitante registra proveedor, valor, forma de pago, fecha máxima de legalización y soportes; elige un aprobador o continúa sin esa fase según el origen del responsable.',
      'El jefe o líder seleccionado aprueba. Contabilidad interviene cuando el anticipo cubre el 100 % de la factura. Después aprueba Gerencia Financiera.',
      'Tesorería registra el desembolso; el anticipo queda pendiente de legalización.',
      'Facturación cruza la factura del proveedor con anticipos pendientes de la misma bolsa (empresa y proceso). Al cubrir el valor legalizable se completa la legalización.',
      'El saldo pendiente es el valor legalizable actual menos el saldo legalizado, con mínimo cero. El valor legalizable puede cambiar por ajustes auditados.',
      'Gerencia o Tesorería pueden registrar corrección, reintegro o cuadre. Se revierte el último ajuste; una reversión o cruce retirado puede reabrir la legalización.',
    ],
  },
  pettyCash: {
    title: 'Cajas menores y reembolsos',
    sourcePaths: ['docs/finance.md', 'convex/cajasMenores.ts', 'convex/lib/cajaMenorReembolsoPermisos.ts'],
    steps: [
      'Gerencia Financiera crea la caja y asigna custodios. Una recarga pendiente de confirmación bloquea el saldo disponible.',
      'El custodio registra gastos por factura del sistema o recibo físico. Contabilidad legaliza las facturas de caja menor en Facturación.',
      'El custodio selecciona movimientos pendientes y genera el reembolso GFN-F006; puede requerir aprobación de un líder.',
      'El recorrido es líder (opcional), revisor, Contabilidad/Impuestos, Eventos DIAN, Gerencia Financiera y Tesorería. Las devoluciones registran motivo y pueden conservar el retorno directo a Gerencia.',
      'Tesorería carga el comprobante: el reembolso queda recibido, los movimientos reembolsados y el saldo de la caja se restablece.',
      'Saldo actual = valor asignado + recargas confirmadas + reembolsos recibidos − movimientos no anulados − legalizaciones antiguas activas. El saldo disponible es cero si está cerrada o hay recarga pendiente.',
    ],
  },
} as const;
