import { FileText, Handshake, LayoutDashboard, Settings, Shield, Truck, UserRound, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  permission?: string;
  children?: Array<{
    id: string;
    label: string;
    href: string;
    permission?: string;
  }>;
};

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    permission: "dashboard",
  },
  {
    id: "billing",
    label: "Billing",
    icon: FileText,
    children: [
      { id: "billing-dashboard", label: "Dashboard", href: "/billing", permission: "billing/dashboard" },
      { id: "billing-inbox", label: "Inbox", href: "/billing/inbox", permission: "billing/inbox" },
      { id: "billing-invoices", label: "Invoices", href: "/billing/invoices", permission: "billing/invoices" },
      { id: "billing-emails", label: "Emails", href: "/billing/emails", permission: "billing/emails" },
      { id: "billing-tasks", label: "Tasks", href: "/billing/tasks", permission: "billing/tasks" },
      {
        id: "billing-reimbursement",
        label: "Petty cash reimbursement",
        href: "/billing/petty-cash-reimbursement",
        permission: "billing/petty-cash-reimbursement",
      },
      { id: "billing-settings", label: "Settings", href: "/billing/settings", permission: "billing/settings" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    children: [
      { id: "finance-petty-cash", label: "Petty cash", href: "/finance/petty-cash", permission: "finance/petty-cash" },
      { id: "finance-advances", label: "Advances", href: "/finance/advances", permission: "finance/advances" },
      {
        id: "finance-advances-request",
        label: "Request advance",
        href: "/finance/advances/request",
        permission: "finance/advances/request",
      },
    ],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    icon: Truck,
    children: [
      {
        id: "suppliers-onboarding",
        label: "Onboarding",
        href: "/suppliers/onboarding",
        permission: "suppliers/onboarding",
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: Handshake,
    children: [
      {
        id: "customers-onboarding",
        label: "Onboarding",
        href: "/customers/onboarding",
        permission: "customers/onboarding",
      },
    ],
  },
  {
    id: "administracion",
    label: "Administración",
    icon: Settings,
    children: [
      {
        id: "usuarios",
        label: "Usuarios",
        href: "/administracion/usuarios",
        permission: "administracion/usuarios",
      },
      {
        id: "accesos",
        label: "Accesos",
        href: "/administracion/accesos",
        permission: "administracion/accesos",
      },
      {
        id: "centro-costo",
        label: "Centros de costo",
        href: "/administracion/centro-costo",
        permission: "administracion/centro-costo",
      },
    ],
  },
  {
    id: "perfil",
    label: "Perfil",
    href: "/perfil",
    icon: UserRound,
    permission: "perfil",
  },
];

export const ADMIN_SECTION_ICON = Shield;

export type NavPermissionSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  rutas: Array<{ id: string; label: string }>;
};

export function collectPermissions(items: NavItem[] = NAV_ITEMS): string[] {
  const permissions: string[] = [];
  for (const item of items) {
    if (item.permission) permissions.push(item.permission);
    for (const child of item.children ?? []) {
      if (child.permission) permissions.push(child.permission);
    }
  }
  return permissions;
}

export function collectPermissionSections(items: NavItem[] = NAV_ITEMS): NavPermissionSection[] {
  return items
    .map((item) => {
      const childRutas = (item.children ?? []).flatMap((child) =>
        child.permission ? [{ id: child.permission, label: child.label }] : [],
      );
      const rutas =
        childRutas.length > 0
          ? childRutas
          : item.permission
            ? [{ id: item.permission, label: item.label }]
            : [];
      return {
        id: item.id,
        label: item.label,
        icon: item.icon,
        rutas,
      };
    })
    .filter((section) => section.rutas.length > 0);
}
