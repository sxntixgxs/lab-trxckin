"use client";

import { Database, Loader2, RefreshCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toDateTimeStr } from "@/app/(default)/suppliers/onboarding/_components/ui-config";
import { cn } from "@/lib/utils";
import type { EstadoErp, VerificacionTercero } from "./use-verificacion-tercero";

type Props = {
  verificacion: VerificacionTercero;
  /** "proveedor" | "cliente", for the texts. */
  entidad: string;
  /** Razón social typed in the form, to flag a different name in the ERP. */
  razonSocialFormulario: string;
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function ErpEstado({ erp, entidad, razonSocialFormulario, onReintentar }: {
  erp: EstadoErp;
  entidad: string;
  razonSocialFormulario: string;
  onReintentar: () => void;
}) {
  if (erp.estado === "idle") return null;
  if (erp.estado === "verificando") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando el catálogo del ERP…
      </div>
    );
  }
  if (erp.estado === "no_disponible") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-700">No se pudo verificar en el ERP</p>
          <p>{erp.motivo} Elige el tipo de solicitud manualmente.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={onReintentar}>
          <RefreshCw className="h-3 w-3" /> Reintentar
        </Button>
      </div>
    );
  }

  const { existencia } = erp;
  const sincronizado = existencia.catalogo.ultimaSincronizacion
    ? `Catálogo sincronizado el ${toDateTimeStr(Date.parse(existencia.catalogo.ultimaSincronizacion))}.`
    : null;

  if (erp.estado === "no_existe") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
        <SearchX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <p className="font-semibold">No existe en el ERP como {entidad}: será una INSCRIPCIÓN.</p>
          {sincronizado && <p className="text-green-700/80">{sincronizado}</p>}
        </div>
      </div>
    );
  }

  const tercero = existencia.tercero;
  const inactivo = tercero ? !tercero.activo : false;
  const nombreDistinto =
    tercero !== null && razonSocialFormulario.trim() !== "" && normalizar(tercero.razonSocial) !== normalizar(razonSocialFormulario);
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
        inactivo ? "border-slate-300 bg-slate-100 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-semibold">
          Existe en el ERP como {entidad}: será una ACTUALIZACIÓN.
          {inactivo && (
            <span className="ml-2 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
              Inactivo en ERP
            </span>
          )}
        </p>
        {tercero && (
          <p>
            {tercero.razonSocial} · NIT {tercero.nit}
            {tercero.dv ? `-${tercero.dv}` : ""} · {tercero.sucursales.length}{" "}
            {tercero.sucursales.length === 1 ? "sucursal" : "sucursales"}
          </p>
        )}
        {nombreDistinto && tercero && (
          <p className="font-medium">Revisa la razón social: en el ERP figura como «{tercero.razonSocial}».</p>
        )}
        {sincronizado && <p className="opacity-80">{sincronizado}</p>}
      </div>
    </div>
  );
}

/** "Iniciar proceso": ERP catalog result for the typed document. */
export function VerificacionTerceroPanel({ verificacion, entidad, razonSocialFormulario }: Props) {
  if (!verificacion.listo && verificacion.erp.estado === "idle") return null;

  return (
    <div className="space-y-2" aria-live="polite">
      <ErpEstado
        erp={verificacion.erp}
        entidad={entidad}
        razonSocialFormulario={razonSocialFormulario}
        onReintentar={verificacion.reintentarErp}
      />
    </div>
  );
}
