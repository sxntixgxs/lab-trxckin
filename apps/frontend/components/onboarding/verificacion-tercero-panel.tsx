"use client";

import { AlertTriangle, CheckCircle2, Database, Eye, History, Loader2, RefreshCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TipoSolicitudChip, toDateStr, toDateTimeStr } from "@/app/(default)/suppliers/onboarding/_components/ui-config";
import { cn } from "@/lib/utils";
import type { EstadoErp, ProcesoExistente, VerificacionTercero } from "./use-verificacion-tercero";

type FaseVisual = { label: string; color: string; bg: string; border: string };

type Props = {
  verificacion: VerificacionTercero;
  /** "proveedor" | "cliente", for the texts. */
  entidad: string;
  /** Module phase presentation (FASE_CONFIG of the supplier or customer board). */
  faseConfig: Record<string, FaseVisual>;
  /** Razón social typed in the form, to flag a different name in the ERP. */
  razonSocialFormulario: string;
  onVerDetalle: (inscripcionId: string) => void;
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

function FilaProceso({ proceso, faseConfig, onVerDetalle }: {
  proceso: ProcesoExistente;
  faseConfig: Record<string, FaseVisual>;
  onVerDetalle: (inscripcionId: string) => void;
}) {
  const fase = faseConfig[proceso.faseActual];
  const fecha =
    proceso.faseActual === "COMPLETADO"
      ? `Inscrito el ${toDateStr(proceso.desde)}`
      : proceso.faseActual === "RECHAZADO"
        ? `Rechazado el ${toDateStr(proceso.desde)}`
        : `Iniciado el ${toDateStr(proceso.creadoEn)}`;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-white/70 px-2.5 py-1.5">
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
          fase ? `${fase.bg} ${fase.color} ${fase.border}` : "border-slate-200 bg-slate-50 text-slate-600",
        )}
      >
        {fase?.label ?? proceso.faseActual}
      </span>
      <TipoSolicitudChip tipoSolicitud={proceso.tipoSolicitud} />
      <span className="text-slate-600">{fecha}</span>
      {proceso.responsableNombre && <span className="text-slate-500">· a cargo de {proceso.responsableNombre}</span>}
      <span className="ml-auto">
        {proceso.inscripcionId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => onVerDetalle(proceso.inscripcionId as string)}
          >
            <Eye className="h-3 w-3" /> Ver detalle
          </Button>
        ) : (
          <span className="text-[11px] text-slate-400">Sin acceso al detalle</span>
        )}
      </span>
      {proceso.faseActual === "RECHAZADO" && proceso.inscripcionId && (
        <p className="w-full text-[11px] text-slate-500">
          Puedes reabrirlo desde su detalle (Devolver fase) en lugar de iniciar un proceso nuevo.
        </p>
      )}
    </li>
  );
}

/**
 * "Iniciar proceso": ERP catalog result for the typed document and the onboarding processes that
 * already exist for it (in progress ones block a new process).
 */
export function VerificacionTerceroPanel({ verificacion, entidad, faseConfig, razonSocialFormulario, onVerDetalle }: Props) {
  if (!verificacion.listo && verificacion.erp.estado === "idle") return null;
  const { procesos } = verificacion;

  return (
    <div className="space-y-2" aria-live="polite">
      <ErpEstado
        erp={verificacion.erp}
        entidad={entidad}
        razonSocialFormulario={razonSocialFormulario}
        onReintentar={verificacion.reintentarErp}
      />

      {verificacion.cargandoProcesos && (
        <div className="flex items-center gap-2 px-1 text-xs text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Buscando procesos existentes…
        </div>
      )}
      {verificacion.errorProcesos && (
        <p className="px-1 text-xs text-slate-500">No se pudieron consultar los procesos existentes: {verificacion.errorProcesos}</p>
      )}

      {procesos && procesos.enCurso.length > 0 && (
        <div role="alert" className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" /> Ya hay un proceso en curso para este documento
          </p>
          <p>No puedes iniciar otro hasta que ese termine o se anule.</p>
          <ul className="space-y-1">
            {procesos.enCurso.map((proceso, i) => (
              <FilaProceso key={proceso.inscripcionId ?? `en-curso-${i}`} proceso={proceso} faseConfig={faseConfig} onVerDetalle={onVerDetalle} />
            ))}
          </ul>
        </div>
      )}

      {procesos && procesos.finalizados.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p className="flex items-center gap-1.5 font-semibold">
            <History className="h-3.5 w-3.5" /> Procesos anteriores de este documento
          </p>
          <ul className="space-y-1">
            {procesos.finalizados.map((proceso, i) => (
              <FilaProceso key={proceso.inscripcionId ?? `cerrado-${i}`} proceso={proceso} faseConfig={faseConfig} onVerDetalle={onVerDetalle} />
            ))}
          </ul>
        </div>
      )}

      {procesos && procesos.enCurso.length === 0 && procesos.finalizados.length === 0 && verificacion.erp.estado !== "verificando" && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-slate-500">
          <CheckCircle2 className="h-3 w-3 text-green-600" /> Sin procesos previos para este documento en la empresa.
        </p>
      )}
    </div>
  );
}
