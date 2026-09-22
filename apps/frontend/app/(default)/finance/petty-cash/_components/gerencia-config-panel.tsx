"use client";

import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getEmpresaNombre } from "@/lib/empresas";
import type { FacturacionUsuario } from "@/app/(default)/billing/hooks/use-facturacion-users";

import { MultiUserPicker } from "./multi-user-picker";

type GerenciaConfigPanelProps = {
  empresaConfig: number | null;
  usuarios: FacturacionUsuario[];
  configIds: string[];
  onChange: (ids: string[]) => void;
  saving: boolean;
  onSave: () => void;
};

export function GerenciaConfigPanel({
  empresaConfig,
  usuarios,
  configIds,
  onChange,
  saving,
  onSave,
}: GerenciaConfigPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            GERENCIA FINANCIERA
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Usuarios que pueden administrar Cajas Menores de{" "}
            {empresaConfig ? getEmpresaNombre(empresaConfig) : "la empresa seleccionada"}.
          </p>
        </div>
        <Button
          type="button"
          className="rounded-xl"
          disabled={saving || empresaConfig === null}
          onClick={onSave}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
      <div className="mt-4 max-w-xl space-y-3">
        <MultiUserPicker
          usuarios={usuarios}
          selectedIds={configIds}
          onChange={onChange}
          placeholder="Agregar usuario de Gerencia Financiera..."
        />
      </div>
    </section>
  );
}
