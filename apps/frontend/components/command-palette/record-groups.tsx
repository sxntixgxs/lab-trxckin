"use client";

import { Building, FileText, Handshake, Landmark, Truck, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import type { RecentEntry } from "@/lib/command-palette/recents";
import { recordHref, type RecordKind } from "@/lib/command-palette/record-links";
import { EMPRESAS_MAP } from "@/lib/empresas";
import { CUSTOMER_FASE_LABELS_CORTOS } from "@/lib/onboarding/phases/customers";
import { SUPPLIER_FASE_LABELS_CORTOS } from "@/lib/onboarding/phases/suppliers";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import type { GlobalSearchState } from "./use-global-search";

/** "III_REVISION_CONTABILIDAD" -> "Revision contabilidad". */
function humanizeFase(fase: string): string {
  const text = fase.replace(/^[IVX]+[A-Z]?_/, "").replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type RecordRow = {
  kind: RecordKind;
  id: string;
  label: string;
  sublabel: string;
  empresa: number;
  href: string;
  /** Omitted when the target page does its own check (advances accept two permissions). */
  permission?: string;
  /** Onboarding boards only show the active company's rows: switch to the record's company. */
  switchEmpresa: boolean;
};

type Group = { heading: string; icon: LucideIcon; rows: RecordRow[] };

function buildGroups(data: NonNullable<GlobalSearchState["data"]>): Group[] {
  return [
    {
      heading: "Facturas",
      icon: FileText,
      rows: data.facturas.map((f) => ({
        kind: "factura",
        id: f.id,
        label: `${f.numeroFactura} · ${f.proveedorNombre}`,
        sublabel: [`NIT ${f.proveedorNit}`, humanizeFase(f.faseActual)].join(" · "),
        empresa: f.empresa,
        href: recordHref("factura", { id: f.id }),
        permission: RUTAS_SISTEMA.FACTURACION_FACTURAS,
        switchEmpresa: false,
      })),
    },
    {
      heading: "Anticipos",
      icon: Wallet,
      rows: data.anticipos.map((a) => ({
        kind: "anticipo",
        id: a.id,
        label: `Anticipo #${a.consecutivo} · ${a.razonSocial}`,
        sublabel: [`NIT ${a.nit}`, humanizeFase(a.faseActual)].join(" · "),
        empresa: a.empresa,
        href: recordHref("anticipo", { id: a.id }),
        switchEmpresa: false,
      })),
    },
    {
      heading: "Proveedores (onboarding)",
      icon: Truck,
      rows: data.proveedores.map((p) => ({
        kind: "proveedor",
        id: p.id,
        label: p.razonSocial || `NIT ${p.nit}`,
        sublabel: [`NIT ${p.nit}`, SUPPLIER_FASE_LABELS_CORTOS[p.faseActual] ?? humanizeFase(p.faseActual)].join(" · "),
        empresa: p.empresa,
        href: recordHref("proveedor", { id: p.id }),
        permission: RUTAS_SISTEMA.PROVEEDORES_ONBOARDING,
        switchEmpresa: true,
      })),
    },
    {
      heading: "Clientes (onboarding)",
      icon: Handshake,
      rows: data.clientes.map((c) => ({
        kind: "cliente",
        id: c.id,
        label: c.razonSocial || `NIT ${c.nit}`,
        sublabel: [`NIT ${c.nit}`, CUSTOMER_FASE_LABELS_CORTOS[c.faseActual] ?? humanizeFase(c.faseActual)].join(" · "),
        empresa: c.empresa,
        href: recordHref("cliente", { id: c.id }),
        permission: RUTAS_SISTEMA.CLIENTES_ONBOARDING,
        switchEmpresa: true,
      })),
    },
    {
      heading: "Centros de costo",
      icon: Landmark,
      rows: data.centrosCosto.map((c) => ({
        kind: "centroCosto",
        id: c.id,
        label: `${c.codigo} · ${c.descripcion}`,
        sublabel: "Centro de costo",
        empresa: c.appEmpresa,
        href: recordHref("centroCosto", { id: c.id, empresa: c.appEmpresa, codigo: c.codigo }),
        permission: "administracion/centro-costo",
        switchEmpresa: false,
      })),
    },
  ];
}

export function RecordGroups({
  search,
  close,
  addRecent,
}: {
  search: GlobalSearchState;
  close: () => void;
  addRecent: (entry: Omit<RecentEntry, "at">) => void;
}) {
  const router = useRouter();
  const { empresaActiva, setEmpresaActiva } = useEmpresaFilter();
  if (!search.data) return null;

  const open = (row: RecordRow) => {
    addRecent({
      kind: row.kind,
      id: row.id,
      label: row.label,
      sublabel: row.sublabel,
      href: row.href,
      permission: row.permission,
      empresa: row.empresa,
    });
    if (row.switchEmpresa && empresaActiva !== null && empresaActiva !== row.empresa) {
      setEmpresaActiva(row.empresa);
    }
    close();
    router.push(row.href);
  };

  return (
    <>
      {buildGroups(search.data)
        .filter((group) => group.rows.length > 0)
        .map((group) => {
          const Icon = group.icon;
          return (
            <CommandGroup key={group.heading} heading={group.heading}>
              {group.rows.map((row) => (
                <CommandItem key={`${row.kind}:${row.id}`} value={`${row.kind}:${row.id}`} onSelect={() => open(row)}>
                  <Icon className="mr-2 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{row.label}</div>
                    <div className="truncate text-xs text-slate-400">{row.sublabel}</div>
                  </div>
                  {search.multiEmpresa && (
                    <span className="ml-2 flex shrink-0 items-center gap-1 text-[11px] text-slate-400">
                      <Building className="h-3 w-3" aria-hidden />
                      {EMPRESAS_MAP[row.empresa]?.nombreCorto ?? `Empresa ${row.empresa}`}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
    </>
  );
}
