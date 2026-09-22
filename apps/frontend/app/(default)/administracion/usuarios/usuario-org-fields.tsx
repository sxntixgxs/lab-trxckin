"use client";

import { EMPRESAS_LIST } from "@/lib/empresas";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { esProcesoGestionFinanciera } from "../../billing/hooks/use-facturacion-users";
import type { ProcesoOption, UsuarioDirectory } from "./usuarios-types";

export const SIN_PROCESO = "__none__";
export const SIN_JEFE = "__none__";

export const CARGOS_SUGERIDOS = [
  "Analista de causación",
  "Contador",
  "Revisor de impuestos",
  "Tesorero",
  "Recepcionista de facturas",
  "Gerente financiero",
  "Líder de proceso",
  "Analista DIAN",
  "Revisor de caja menor",
];

export type UsuarioOrgValues = {
  cargo: string;
  idProceso: string;
  liderProceso: boolean;
  idJefe: string;
  accesoTodasEmpresas: boolean;
  empresas: number[];
};

export function uniqueCargos(usuarios: UsuarioDirectory[], extra: string[] = []): string[] {
  const values = new Set<string>();
  for (const cargo of extra) {
    if (cargo.trim()) values.add(cargo.trim());
  }
  for (const usuario of usuarios) {
    if (usuario.cargo?.trim()) values.add(usuario.cargo.trim());
  }
  return [...values].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

export function UsuarioOrgFields({
  values,
  onChange,
  procesos,
  usuarios,
  cargos,
  excludeUserId,
  showJefe = true,
}: {
  values: UsuarioOrgValues;
  onChange: (patch: Partial<UsuarioOrgValues>) => void;
  procesos: ProcesoOption[];
  usuarios: UsuarioDirectory[];
  cargos: string[];
  excludeUserId?: string;
  showJefe?: boolean;
}) {
  const selectedProceso = procesos.find((proceso) => String(proceso.id) === values.idProceso);
  const esFinanzas = esProcesoGestionFinanciera(selectedProceso?.nombre);

  const toggleEmpresa = (empresaId: number, checked: boolean) => {
    const next = checked
      ? [...new Set([...values.empresas, empresaId])]
      : values.empresas.filter((id) => id !== empresaId);
    onChange({ empresas: next });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="usuario-cargo">Cargo</Label>
        <Input
          id="usuario-cargo"
          list="cargos-sugeridos"
          value={values.cargo}
          onChange={(event) => onChange({ cargo: event.target.value })}
          placeholder="Analista de causación"
        />
        <datalist id="cargos-sugeridos">
          {cargos.map((cargo) => (
            <option key={cargo} value={cargo} />
          ))}
        </datalist>
        <p className="text-xs text-slate-500">
          Billing y anticipos muestran este cargo al asignar responsables.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Proceso</Label>
        <Select
          value={values.idProceso}
          onValueChange={(idProceso) =>
            onChange({
              idProceso,
              liderProceso: idProceso === SIN_PROCESO ? false : values.liderProceso,
            })
          }
        >
          <SelectTrigger className="border-slate-200 bg-white">
            <SelectValue placeholder="Sin proceso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_PROCESO}>Sin proceso</SelectItem>
            {procesos.map((proceso) => (
              <SelectItem key={proceso.id} value={String(proceso.id)}>
                {proceso.nombre}
                {esProcesoGestionFinanciera(proceso.nombre) ? " · Finanzas" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {esFinanzas ? (
          <p className="text-xs text-amber-700">
            Este usuario aparecerá en Billing → Settings como usuario de Gestión Financiera
            (analistas, tesorería, contabilidad, avisos).
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Asigna Gestión Financiera para que el usuario salga en las listas de finanzas de
            facturación.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <Label htmlFor="usuario-lider">Líder de proceso</Label>
          <p className="text-xs text-slate-500">
            Los líderes aparecen en el inbox de billing y en la solicitud de anticipos.
          </p>
        </div>
        <Switch
          id="usuario-lider"
          checked={values.liderProceso}
          disabled={values.idProceso === SIN_PROCESO}
          onCheckedChange={(liderProceso) => onChange({ liderProceso })}
        />
      </div>

      {showJefe ? (
        <div className="space-y-2">
          <Label>Jefe directo</Label>
          <Select value={values.idJefe} onValueChange={(idJefe) => onChange({ idJefe })}>
            <SelectTrigger className="border-slate-200 bg-white">
              <SelectValue placeholder="Sin jefe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_JEFE}>Sin jefe</SelectItem>
              {usuarios
                .filter((item) => item.id !== excludeUserId)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="usuario-todas-empresas">Todas las empresas</Label>
            <p className="text-xs text-slate-500">
              Si está activo, el usuario aparece en la configuración de billing de cualquier
              empresa.
            </p>
          </div>
          <Switch
            id="usuario-todas-empresas"
            checked={values.accesoTodasEmpresas}
            onCheckedChange={(accesoTodasEmpresas) => onChange({ accesoTodasEmpresas })}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {EMPRESAS_LIST.map((empresa) => {
            const checked = values.accesoTodasEmpresas || values.empresas.includes(empresa.id);
            return (
              <label
                key={empresa.id}
                className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  disabled={values.accesoTodasEmpresas}
                  onCheckedChange={(next) => toggleEmpresa(empresa.id, next === true)}
                />
                <span>{empresa.nombreCorto}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
