"use client";

import { useQuery } from "@tanstack/react-query";
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

export type VerificacionTercero = {
  /** A company and a document long enough to check (≥ 5 digits). */
  listo: boolean;
  erp: EstadoErp;
  /** Decided by the ERP catalog; null while checking or when the check is unavailable. */
  tipoSugerido: TipoSolicitud | null;
  reintentarErp: () => void;
};

/**
 * Checks, for the document typed in "Iniciar proceso", whether the tercero already exists in the
 * company's ERP catalog (INSCRIPCIÓN vs ACTUALIZACIÓN). The document is debounced, so typing, the
 * RUT extraction and the ACME fill all trigger it.
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
    tipoSugerido: erp.estado === "existe" ? "ACTUALIZACIÓN" : erp.estado === "no_existe" ? "INSCRIPCIÓN" : null,
    reintentarErp: () => void erpQuery.refetch(),
  };
}
