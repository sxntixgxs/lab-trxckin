"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ProveedorManualAlert,
  ProveedorManualBadge,
} from "@/app/(default)/finance/advances/components/proveedor-manual-status";
import {
  buildSiesaProveedoresSearchParams,
  filterExactProveedoresSiesa,
  isNitConsultaReady,
  type ProveedorAnticipo,
  type ProveedorSiesaBusqueda,
  type ProveedoresSiesaBusquedaResponse,
} from "@/lib/siesa-proveedores";
import { cn } from "@/lib/utils";

type ConsultaEstado =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "choices"; opciones: ProveedorSiesaBusqueda[] }
  | { kind: "resolved" };

type ProveedorAnticipoFieldProps = {
  empresaId: number | null;
  value: ProveedorAnticipo | null;
  onChange: (value: ProveedorAnticipo | null) => void;
  disabled?: boolean;
};

function toSiesaProveedor(
  proveedor: ProveedorSiesaBusqueda
): ProveedorAnticipo {
  return {
    origen: "siesa",
    nit: proveedor.nit.trim(),
    razonSocial: proveedor.descripcionSucursal.trim(),
    siesaId: proveedor.id,
    siesaSucursalId: proveedor.sucursalId?.trim() || undefined,
  };
}

export function ProveedorAnticipoField({
  empresaId,
  value,
  onChange,
  disabled = false,
}: ProveedorAnticipoFieldProps) {
  const [nitInput, setNitInput] = useState(value?.nit ?? "");
  const [consulta, setConsulta] = useState<ConsultaEstado>({ kind: "idle" });
  const [manualHabilitado, setManualHabilitado] = useState(
    value?.origen === "manual_solicitud"
  );
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const empresaPrevRef = useRef(empresaId);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function invalidateResultado() {
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;
    setConsulta({ kind: "idle" });
    setManualHabilitado(false);
    onChange(null);
  }

  function handleNitChange(next: string) {
    setNitInput(next);
    invalidateResultado();
  }

  useEffect(() => {
    if (empresaPrevRef.current === empresaId) return;
    empresaPrevRef.current = empresaId;
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;
    setConsulta({ kind: "idle" });
    setManualHabilitado(false);
    onChange(null);
    // Keep typed NIT so the user can re-consult against the new company.
  }, [empresaId, onChange]);

  async function consultarProveedor() {
    if (disabled || consulta.kind === "loading") return;
    if (empresaId == null) return;
    if (!isNitConsultaReady(nitInput)) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setConsulta({ kind: "loading" });
    setManualHabilitado(false);
    onChange(null);

    try {
      const params = buildSiesaProveedoresSearchParams({
        nit: nitInput,
        empresa: empresaId,
      });
      const response = await fetch(
        `/api/proveedores/search?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error("No pudimos consultar SIESA. Reintenta para verificar el proveedor.");
      }

      const data = (await response.json()) as ProveedoresSiesaBusquedaResponse;
      if (requestId !== requestIdRef.current) return;

      const matches = filterExactProveedoresSiesa(
        data.proveedores ?? [],
        nitInput
      );

      if (matches.length === 0) {
        setConsulta({ kind: "empty" });
        return;
      }

      if (matches.length === 1) {
        const unico = matches[0]!;
        onChange(toSiesaProveedor(unico));
        setNitInput(unico.nit.trim());
        setConsulta({ kind: "resolved" });
        return;
      }

      setConsulta({ kind: "choices", opciones: matches });
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }
      setConsulta({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "No pudimos consultar SIESA. Reintenta para verificar el proveedor.",
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }

  function seleccionarSucursal(proveedor: ProveedorSiesaBusqueda) {
    onChange(toSiesaProveedor(proveedor));
    setNitInput(proveedor.nit.trim());
    setConsulta({ kind: "resolved" });
    setManualHabilitado(false);
  }

  function habilitarManual() {
    const nit = nitInput.trim();
    setManualHabilitado(true);
    setConsulta({ kind: "empty" });
    onChange({
      origen: "manual_solicitud",
      nit,
      razonSocial: "",
      manualConfirmado: false,
    });
  }

  const puedeConsultar =
    !disabled &&
    empresaId != null &&
    isNitConsultaReady(nitInput) &&
    consulta.kind !== "loading";

  const esSiesaResuelto = value?.origen === "siesa";
  const esManual = value?.origen === "manual_solicitud" || manualHabilitado;
  const razonSocialEditable = esManual && consulta.kind !== "loading";
  const razonSocialReadonly = esSiesaResuelto;

  return (
    <div className="space-y-4 md:col-span-2">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="proveedor-anticipo-nit">NIT del proveedor</Label>
          <div className="flex gap-2">
            <Input
              id="proveedor-anticipo-nit"
              value={nitInput}
              onChange={(event) => handleNitChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void consultarProveedor();
                }
              }}
              placeholder="900123456-7"
              disabled={disabled || consulta.kind === "loading"}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-1.5 bg-white"
              disabled={!puedeConsultar}
              onClick={() => void consultarProveedor()}
            >
              {consulta.kind === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Consultar
            </Button>
          </div>
          {empresaId == null ? (
            <p className="text-xs font-medium text-amber-700">
              Selecciona una empresa para consultar el proveedor en SIESA.
            </p>
          ) : (
            <p className="text-xs font-medium text-slate-500">
              Ingresa el NIT y pulsa Consultar o Enter. Mínimo 5 dígitos.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="proveedor-anticipo-razon">
              {esManual ? "Nombre del proveedor" : "Razón social"}
            </Label>
            {esManual ? <ProveedorManualBadge compact /> : null}
          </div>
          <Input
            id="proveedor-anticipo-razon"
            value={value?.razonSocial ?? ""}
            onChange={(event) => {
              if (!value || value.origen !== "manual_solicitud") return;
              onChange({
                ...value,
                razonSocial: event.target.value,
              });
            }}
            placeholder={
              razonSocialEditable
                ? "Nombre del proveedor para esta solicitud"
                : "Consulta el NIT para completar la razón social"
            }
            readOnly={!razonSocialEditable}
            disabled={disabled || (!razonSocialEditable && !razonSocialReadonly)}
            className={cn(
              razonSocialReadonly || !razonSocialEditable
                ? "bg-slate-50 font-semibold text-slate-900"
                : undefined
            )}
          />
        </div>
      </div>

      <div aria-live="polite" className="space-y-3">
        {consulta.kind === "loading" ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Consultando proveedor en SIESA…
          </p>
        ) : null}

        {consulta.kind === "error" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
            <p className="font-semibold">{consulta.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              disabled={disabled}
              onClick={() => void consultarProveedor()}
            >
              Reintentar
            </Button>
          </div>
        ) : null}

        {esSiesaResuelto && consulta.kind === "resolved" ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Proveedor encontrado en SIESA
          </p>
        ) : null}

        {consulta.kind === "choices" ? (
          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-black text-slate-900">
              Selecciona la sucursal del proveedor
            </p>
            <p className="text-xs font-medium text-slate-500">
              Encontramos varias sucursales para este NIT. Debes elegir una.
            </p>
            <ul className="space-y-1.5" role="listbox" aria-label="Sucursales SIESA">
              {consulta.opciones.map((opcion) => (
                <li key={`${opcion.id}-${opcion.sucursalId ?? "0"}`}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full flex-col rounded-md border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50"
                    onClick={() => seleccionarSucursal(opcion)}
                    disabled={disabled}
                  >
                    <span className="text-sm font-semibold text-slate-900">
                      {opcion.descripcionSucursal}
                    </span>
                    <span className="mt-0.5 text-xs font-medium text-slate-500">
                      NIT {opcion.nit}
                      {opcion.sucursalId
                        ? ` · Sucursal ${opcion.sucursalId}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {consulta.kind === "empty" && !manualHabilitado ? (
          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-sm font-semibold text-slate-800">
              No encontramos este NIT en SIESA
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              disabled={disabled}
              onClick={habilitarManual}
            >
              Ingresar proveedor manual para esta solicitud
            </Button>
          </div>
        ) : null}

        {esManual ? (
          <div className="space-y-3">
            <ProveedorManualAlert />
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-white px-3 py-2.5 text-sm font-semibold text-amber-950">
              <Checkbox
                checked={value?.origen === "manual_solicitud" && value.manualConfirmado}
                disabled={disabled || value?.origen !== "manual_solicitud"}
                onCheckedChange={(checked) => {
                  if (!value || value.origen !== "manual_solicitud") return;
                  onChange({
                    ...value,
                    manualConfirmado: checked === true,
                  });
                }}
                className="mt-0.5"
              />
              <span>
                Entiendo que este proveedor solo aplica a esta solicitud de
                anticipo.
              </span>
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
