import { CloudUpload, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";

export type NavCommand = {
  id: string;
  label: string;
  section: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  keywords: string[];
};

/** Spanish labels for the palette, keyed by `NavItem.id` (the sidebar keeps its own). */
export const NAV_LABELS_ES: Record<string, string> = {
  dashboard: "Dashboard",
  billing: "Facturación",
  "billing-dashboard": "Dashboard de facturación",
  "billing-inbox": "Buzón",
  "billing-invoices": "Facturas",
  "billing-emails": "Correos",
  "billing-tasks": "Tareas",
  "billing-reimbursement": "Reembolso de caja menor",
  "billing-settings": "Configuración de facturación",
  finance: "Finanzas",
  "finance-petty-cash": "Cajas menores",
  "finance-advances": "Anticipos",
  "finance-advances-request": "Solicitar anticipo",
  suppliers: "Proveedores",
  "suppliers-onboarding": "Onboarding de proveedores",
  customers: "Clientes",
  "customers-onboarding": "Onboarding de clientes",
  administracion: "Administración",
  usuarios: "Usuarios",
  accesos: "Accesos",
  "centro-costo": "Centros de costo",
  "terceros-erp": "Terceros ERP",
  perfil: "Perfil",
};

/** Routable pages that are not in the sidebar. Permissions mirror each page's guard. */
export const EXTRA_PAGES: NavCommand[] = [
  {
    id: "billing-upload",
    label: "Cargar facturas",
    section: "Facturación",
    href: "/billing/upload",
    icon: CloudUpload,
    permission: RUTAS_SISTEMA.FACTURACION_FACTURAS,
    keywords: ["upload", "subir", "carga"],
  },
  {
    id: "billing-validate-dian",
    label: "Validar facturas en la DIAN",
    section: "Facturación",
    href: "/billing/invoices/validate-dian",
    icon: ShieldCheck,
    permission: RUTAS_SISTEMA.FACTURACION_FACTURAS,
    keywords: ["dian", "validate", "validacion"],
  },
];

export function buildNavCommands(
  items: NavItem[],
  hasAccessTo: (permission?: string) => boolean,
  extras: NavCommand[] = EXTRA_PAGES,
): NavCommand[] {
  const commands: NavCommand[] = [];
  for (const item of items) {
    const section = NAV_LABELS_ES[item.id] ?? item.label;
    if (item.href) {
      commands.push({
        id: item.id,
        label: section,
        section: "General",
        href: item.href,
        icon: item.icon,
        permission: item.permission,
        keywords: [item.label],
      });
    }
    for (const child of item.children ?? []) {
      commands.push({
        id: child.id,
        label: NAV_LABELS_ES[child.id] ?? child.label,
        section,
        href: child.href,
        icon: item.icon,
        permission: child.permission,
        keywords: [child.label, item.label, section],
      });
    }
  }
  commands.push(...extras);

  const seen = new Set<string>();
  return commands.filter((command) => {
    if (seen.has(command.href) || !hasAccessTo(command.permission)) return false;
    seen.add(command.href);
    return true;
  });
}
