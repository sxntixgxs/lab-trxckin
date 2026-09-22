import { formatterDate } from "./constants";
import type { FlujoAction, UsuarioInfo } from "./types";
import {
  anticipoCubreFacturaCompleta,
  anticipoRequiereAprobacionJefe,
  getApplicableProgressPhases,
} from "../lib/anticipo-routing";

export type AnticipoProgressInput = {
  faseActual: string;
  cubreFacturaCompleta?: boolean;
  tipoBolsa?: "general" | "peajes";
  responsableOrigen?: "jefe_directo" | "manual" | "solicitante";
};

export function formatDate(timestamp?: number | null) {
  if (!timestamp) return "-";
  return formatterDate.format(new Date(timestamp));
}

export function getEstadoClass(faseActual: string) {
  if (faseActual === "COMPLETADO" || faseActual === "VI_LEGALIZADO") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (faseActual === "RECHAZADO" || faseActual === "ANULADO") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (faseActual === "IV_DESEMBOLSO_TESORERIA") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (faseActual === "V_PENDIENTE_LEGALIZACION") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (faseActual === "DEVUELTO") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-slate-200 bg-white text-slate-700";
}

export function normalizeFaseActual(faseActual: string) {
  return faseActual === "VI_LEGALIZADO" ? "COMPLETADO" : faseActual;
}

export function matchesFaseFilter(faseActual: string, faseFiltro: string) {
  if (faseFiltro === "TODOS") return true;
  return normalizeFaseActual(faseActual) === faseFiltro;
}

export function getPhaseProgress(anticipo: AnticipoProgressInput) {
  const faseActual = anticipo.faseActual;
  const faseNormalizada = normalizeFaseActual(faseActual);
  const isRejected = faseNormalizada === "RECHAZADO";
  const isCanceled = faseNormalizada === "ANULADO";
  const applicablePhases = getApplicableProgressPhases(anticipo);
  const total = applicablePhases.length;
  const currentIdx = applicablePhases.indexOf(faseNormalizada);

  if (isRejected || isCanceled) {
    return {
      currentIdx: -1,
      done: 0,
      total,
      progress: 0,
      isTerminal: true,
    };
  }

  const done =
    faseNormalizada === "COMPLETADO"
      ? total
      : currentIdx >= 0
        ? currentIdx + 1
        : 0;

  return {
    currentIdx,
    done,
    total,
    progress: total > 0 ? Math.round((done / total) * 100) : 0,
    isTerminal: faseNormalizada === "COMPLETADO",
  };
}

export function getPrincipalAction(faseActual: string): FlujoAction | null {
  if (faseActual === "II_APROBACION_JEFE_DIRECTO") return "jefe_directo";
  if (faseActual === "III_REVISION_CONTABILIDAD") return "contabilidad";
  if (faseActual === "IV_APROBACION_GERENCIA") return "gerencia";
  if (faseActual === "IV_DESEMBOLSO_TESORERIA") return "desembolso";
  return null;
}

export function getPrincipalBulkAction(
  faseActual: string
): Extract<
  FlujoAction,
  "jefe_directo" | "contabilidad" | "gerencia"
> | null {
  if (faseActual === "II_APROBACION_JEFE_DIRECTO") return "jefe_directo";
  if (faseActual === "III_REVISION_CONTABILIDAD") return "contabilidad";
  if (faseActual === "IV_APROBACION_GERENCIA") return "gerencia";
  return null;
}

export function getActionLabel(action: FlujoAction) {
  if (action === "jefe_directo") return "Revisar como jefe directo";
  if (action === "contabilidad") return "Revisar contabilidad";
  if (action === "gerencia") return "Revisar gerencia";
  if (action === "desembolso") return "Registrar desembolso";
  return "Gestionar";
}

export function getDefaultReturnTarget(
  faseActual: string,
  responsableOrigen?: string,
  cubreFacturaCompleta?: boolean,
  tipoBolsa?: "general" | "peajes"
) {
  if (
    faseActual === "III_REVISION_CONTABILIDAD" &&
    (responsableOrigen === "jefe_directo" || responsableOrigen === "manual")
  ) {
    return "II_APROBACION_JEFE_DIRECTO";
  }
  if (faseActual === "IV_APROBACION_GERENCIA") {
    if (
      anticipoCubreFacturaCompleta({
        cubreFacturaCompleta,
        tipoBolsa,
        responsableOrigen: responsableOrigen as
          | "jefe_directo"
          | "manual"
          | "solicitante"
          | undefined,
      })
    ) {
      return "III_REVISION_CONTABILIDAD";
    }
    if (
      anticipoRequiereAprobacionJefe({
        responsableOrigen: responsableOrigen as
          | "jefe_directo"
          | "manual"
          | "solicitante"
          | undefined,
      })
    ) {
      return "II_APROBACION_JEFE_DIRECTO";
    }
    return null;
  }
  if (faseActual === "IV_DESEMBOLSO_TESORERIA") {
    return "IV_APROBACION_GERENCIA";
  }
  return null;
}

export function isClosed(faseActual: string) {
  const faseNormalizada = normalizeFaseActual(faseActual);
  return (
    faseNormalizada === "COMPLETADO" ||
    faseNormalizada === "RECHAZADO" ||
    faseNormalizada === "ANULADO"
  );
}

export async function fetchUsuarios(): Promise<UsuarioInfo[]> {
  const response = await fetch("/api/usuarios/directorio", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("No se pudo cargar el directorio de usuarios");
  }
  return (await response.json()) as UsuarioInfo[];
}

export function getUsuarioNombre(usuario?: UsuarioInfo, fallback = "Usuario") {
  return usuario?.nombre?.trim() || fallback;
}

export function getUsuarioProceso(usuario?: UsuarioInfo) {
  return (
    usuario?.procesoUsuario?.nombre?.trim() ||
    usuario?.proceso?.trim() ||
    "Sin proceso"
  );
}

export function getUsuarioCargo(usuario?: UsuarioInfo) {
  return usuario?.cargo?.trim() || "Sin cargo";
}
