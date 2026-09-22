export const RUTAS_SISTEMA = {
  FACTURACION_DASHBOARD: "billing/dashboard",
  FACTURACION_BUZON: "billing/inbox",
  FACTURACION_FACTURAS: "billing/invoices",
  FACTURACION_CORREOS: "billing/emails",
  FACTURACION_TAREAS: "billing/tasks",
  FACTURACION_CONFIGURACION: "billing/settings",
  FACTURACION_REEMBOLSO_CAJA_MENOR: "billing/petty-cash-reimbursement",
  FINANZAS_CAJAS_MENORES: "finance/petty-cash",
  FINANZAS_ANTICIPOS_DASHBOARD: "finance/advances",
  FINANZAS_ANTICIPOS_SOLICITAR: "finance/advances/request",
  PROVEEDORES_ONBOARDING: "suppliers/onboarding",
  CLIENTES_ONBOARDING: "customers/onboarding",
} as const;

export type RutaSistema = (typeof RUTAS_SISTEMA)[keyof typeof RUTAS_SISTEMA];
