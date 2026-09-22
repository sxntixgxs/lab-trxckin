"use client";

import { useState } from "react";
import { AlertCircle, FileText, Search } from "lucide-react";
import { TIPO_DOCUMENTO_OPTIONS, type TipoDocumento } from "@/lib/onboarding/risk/shared";
import type { FormBranding } from "@/lib/onboarding/branding";
import type { DocumentoVerificado } from "./use-public-link";

function soloDigitos(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Gate shown before the third party can edit or upload: they must type the document the
 * company registered. The server re-checks the same pair on every mutation.
 */
export function DocumentoVerificacion({
  branding,
  titulo,
  descripcion,
  esperado,
  onVerificado,
}: {
  branding: FormBranding;
  titulo: string;
  descripcion: string;
  esperado: { tipoDocumento: TipoDocumento; numeroDocumento: string };
  onVerificado: (value: DocumentoVerificado) => void;
}) {
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(esperado.tipoDocumento);
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = numeroDocumento.trim();
    if (!num) return;
    if (tipoDocumento !== esperado.tipoDocumento || soloDigitos(num) !== soloDigitos(esperado.numeroDocumento)) {
      setError("El documento no coincide con el registrado para este enlace. Verifique el tipo y el número.");
      return;
    }
    setError(null);
    onVerificado({ tipoDocumento, numeroDocumento: num });
  }

  return (
    <div className="w-full max-w-md">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
        <div className="bg-primary px-8 py-8 text-primary-foreground">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-foreground/20 ring-1 ring-primary-foreground/30">
            <FileText className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-primary-foreground">{titulo}</h1>
          <p className="mt-1 text-sm text-primary-foreground/60">{descripcion}</p>
        </div>
        <div className="px-8 py-7">
          <p className="mb-5 text-sm text-slate-600">Para continuar, confirme el tipo y número de documento con el que {branding.nombre} lo registró.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="verif-tipo" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tipo de documento
              </label>
              <select
                id="verif-tipo"
                value={tipoDocumento}
                onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/10"
              >
                {TIPO_DOCUMENTO_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="verif-numero" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Número de documento
              </label>
              <input
                id="verif-numero"
                type="text"
                required
                autoFocus
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value)}
                placeholder="Ej: 900123456"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/10"
              />
            </div>
            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Search className="h-4 w-4" />
              Continuar
            </button>
          </form>
          {branding.contactEmail && (
            <p className="mt-5 text-center text-xs text-slate-400">
              ¿Dudas con su registro?{" "}
              <a href={`mailto:${branding.contactEmail}`} className="text-primary hover:underline">
                Contacte a {branding.nombre}.
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
