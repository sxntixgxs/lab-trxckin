"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TipoDocumento } from "@/lib/onboarding/risk/shared";

export type PublicLinkParams = { id: string; token: string } | null;

/** Reads `?id=<inscripcionId>&t=<token>` from the URL (null when incomplete). */
export function usePublicLink(): PublicLinkParams {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const id = searchParams.get("id")?.trim();
    const token = searchParams.get("t")?.trim();
    if (!id || !token) return null;
    return { id, token };
  }, [searchParams]);
}

export type DocumentoVerificado = { tipoDocumento: TipoDocumento; numeroDocumento: string };

const STORAGE_PREFIX = "onboarding:verificacion:";

/**
 * Secondary check for public mutations: the third party confirms the document type and number
 * the company registered. Kept per inscription in sessionStorage so a reload does not re-ask.
 */
export function useDocumentoVerificado(inscripcionId: string | null) {
  const key = inscripcionId ? `${STORAGE_PREFIX}${inscripcionId}` : null;
  const [verificado, setVerificadoState] = useState<DocumentoVerificado | null>(null);

  useEffect(() => {
    if (!key) return;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as DocumentoVerificado;
        if (parsed?.tipoDocumento && parsed?.numeroDocumento) setVerificadoState(parsed);
      }
    } catch {
      /* storage blocked */
    }
  }, [key]);

  const setVerificado = (value: DocumentoVerificado | null) => {
    setVerificadoState(value);
    if (!key) return;
    try {
      if (value) sessionStorage.setItem(key, JSON.stringify(value));
      else sessionStorage.removeItem(key);
    } catch {
      /* storage blocked */
    }
  };

  return { verificado, setVerificado };
}

/** Extracts the human message from a Convex error thrown by a public mutation. */
export function getPublicErrorMessage(error: unknown, fallback = "No se pudo completar la acción."): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message;
  const uncaught = message.match(/Uncaught Error:\s*([^]*?)(?:\. at handler|$)/);
  if (uncaught?.[1]) return uncaught[1].trim();
  return (
    message
      .replace(/^\[CONVEX[^\]]*\]\s*/g, "")
      .replace(/\[Request ID:[^\]]+\]\s*/g, "")
      .replace(/Server Error\s*/g, "")
      .trim() || fallback
  );
}
