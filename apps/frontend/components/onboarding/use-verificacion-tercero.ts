"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueries, type RequestForQueries } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { consultarExistenciaErp, type ExistenciaTerceroErp, type ModuloOnboarding } from "@/lib/erp/terceros";
import type { TIPO_DOCUMENTO_OPTIONS } from "@/lib/onboarding/risk/shared";
import { isNitConsultaReady } from "@/lib/siesa-proveedores";

export type TipoSolicitud = "INSCRIPCIÓN" | "ACTUALIZACIÓN";
type TipoDocumento = (typeof TIPO_DOCUMENTO_OPTIONS)[number];

/** Result of the ERP catalog check for the typed document. */
export type EstadoErp =
  | { estado: "idle" }
  | { estado: "verificando" }
  | { estado: "existe"; existencia: ExistenciaTerceroErp }
  | { estado: "no_existe"; existencia: ExistenciaTerceroErp }
  /** The check could not run (backend down) or the catalog was never synced: pick by hand. */
  | { estado: "no_disponible"; motivo: string };

/** One onboarding process of the same company and document (convex/lib/onboarding/procesosPorDocumento.ts). */
export type ProcesoExistente = {
  /** null when the user cannot open it (another responsable's process). */
  inscripcionId: string | null;
  faseActual: string;
  desde: number;
  creadoEn: number;
  tipoSolicitud: TipoSolicitud;
  razonSocial: string | null;
  responsableNombre: string | null;
  visible: boolean;
};

export type ProcesosPorDocumento = { enCurso: ProcesoExistente[]; finalizados: ProcesoExistente[] };

export type VerificacionTercero = {
  /** A company and a document long enough to check (≥ 5 digits). */
  listo: boolean;
  erp: EstadoErp;
  procesos: ProcesosPorDocumento | null;
  /** The process lookup failed; creation still refuses duplicates server-side. */
  errorProcesos: string | null;
  cargandoProcesos: boolean;
  /** An in-progress process of this document and company blocks a new one. */
  bloqueado: boolean;
  /** Decided by the ERP catalog; null while checking or when the check is unavailable. */
  tipoSugerido: TipoSolicitud | null;
  reintentarErp: () => void;
};

/**
 * Checks, for the document typed in "Iniciar proceso", whether the tercero already exists in the
 * company's ERP catalog (INSCRIPCIÓN vs ACTUALIZACIÓN) and which onboarding processes already exist
 * for it. The document is debounced, so typing, the RUT extraction and the ACME fill all trigger it.
 */
export function useVerificacionTercero(params: {
  modulo: ModuloOnboarding;
  empresa: number | null;
  numeroDocumento: string;
  tipoDocumento: TipoDocumento;
  habilitado: boolean;
}): VerificacionTercero {
  const documentoActual = params.numeroDocumento.trim();
  const documento = useDebouncedValue(documentoActual, 500);
  const escribiendo = documento !== documentoActual;
  const listo = params.habilitado && params.empresa !== null && isNitConsultaReady(documento);
  const empresa = params.empresa ?? 0;

  const erpQuery = useQuery({
    queryKey: ["erp-existencia", params.modulo, empresa, documento, params.tipoDocumento],
    queryFn: ({ signal }) =>
      consultarExistenciaErp(params.modulo, { empresa, documento, tipoDocumento: params.tipoDocumento }, signal),
    enabled: listo,
    retry: 1,
    staleTime: 30_000,
  });

  // useQueries reports a failed query as an Error value instead of throwing during render.
  const consultas = useMemo((): RequestForQueries => {
    if (!listo) return {};
    const args = { empresa, numeroDocumento: documento, tipoDocumento: params.tipoDocumento };
    return {
      procesos: {
        query:
          params.modulo === "supplier"
            ? api.onboarding.suppliers.obtenerProcesosPorDocumento
            : api.onboarding.customers.obtenerProcesosPorDocumento,
        args,
      },
    };
  }, [listo, empresa, documento, params.tipoDocumento, params.modulo]);
  const resultado = useQueries(consultas).procesos as ProcesosPorDocumento | Error | undefined;
  const procesos = resultado instanceof Error || resultado === undefined ? null : resultado;

  let erp: EstadoErp;
  if (!listo) erp = escribiendo && isNitConsultaReady(documentoActual) ? { estado: "verificando" } : { estado: "idle" };
  else if (escribiendo || erpQuery.isPending) erp = { estado: "verificando" };
  else if (erpQuery.isError) erp = { estado: "no_disponible", motivo: erpQuery.error.message };
  else if (!erpQuery.data.catalogo.sincronizado) {
    erp = { estado: "no_disponible", motivo: "El catálogo del ERP aún no se ha sincronizado para esta empresa." };
  } else {
    erp = erpQuery.data.existe
      ? { estado: "existe", existencia: erpQuery.data }
      : { estado: "no_existe", existencia: erpQuery.data };
  }

  return {
    listo,
    erp,
    procesos: escribiendo ? null : procesos,
    errorProcesos: resultado instanceof Error ? resultado.message : null,
    cargandoProcesos: listo && (escribiendo || resultado === undefined),
    bloqueado: !escribiendo && (procesos?.enCurso.length ?? 0) > 0,
    tipoSugerido: erp.estado === "existe" ? "ACTUALIZACIÓN" : erp.estado === "no_existe" ? "INSCRIPCIÓN" : null,
    reintentarErp: () => void erpQuery.refetch(),
  };
}
