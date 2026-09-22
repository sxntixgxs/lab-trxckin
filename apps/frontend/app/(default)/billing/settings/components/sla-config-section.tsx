"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { addBusinessDaysBogota } from "@/convex/lib/facturacionBusinessTime";
import { getFacturacionErrorMessage } from "../../lib/user-facing-error";
import { formatDateTime } from "../../lib/utils";
import { ConfigCard } from "./config-card";
import {
  SLA_PHASE_LABELS,
  SLA_PHASE_ORDER,
  type SlaConfigResponse,
  type SlaFaseConfig,
  type SlaOversightEmail,
  type SlaPhase,
} from "../lib/types";

type EditableFase = {
  fase: SlaPhase;
  label: string;
  umbralInput: string;
  habilitado: boolean;
  actualizadoEn: number | null;
  actualizadoPorNombre: string | null;
  actualizadoPorEmail: string | null;
};

function toEditable(fases: SlaFaseConfig[]): EditableFase[] {
  const byFase = new Map(fases.map((f) => [f.fase, f]));
  return SLA_PHASE_ORDER.map((fase) => {
    const row = byFase.get(fase);
    return {
      fase,
      label: SLA_PHASE_LABELS[fase],
      umbralInput: row?.umbralDiasLaborales != null ? String(row.umbralDiasLaborales) : "",
      habilitado: row?.habilitado ?? false,
      actualizadoEn: row?.actualizadoEn ?? null,
      actualizadoPorNombre: row?.actualizadoPorNombre ?? null,
      actualizadoPorEmail: row?.actualizadoPorEmail ?? null,
    };
  });
}

export function SlaConfigSection({ empresa }: { empresa: number }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SlaConfigResponse | null>(null);
  const [fases, setFases] = useState<EditableFase[]>([]);
  const [oversightEmails, setOversightEmails] = useState<SlaOversightEmail[]>([]);
  const [emailsHabilitados, setEmailsHabilitados] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newEmailNombre, setNewEmailNombre] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/billing/configuracion/sla?empresa=${empresa}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo cargar la configuración SLA.");
        }
        return res.json() as Promise<SlaConfigResponse>;
      })
      .then((data) => {
        setConfig(data);
        setFases(toEditable(data.fases));
        setOversightEmails(data.oversightEmails);
        setEmailsHabilitados(data.emailsHabilitados);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar la configuración SLA.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [empresa]);

  // Reference time for SLA previews, captured once (Date.now() is impure during render).
  const [now] = useState(() => Date.now());
  const previews = useMemo(() => {
    const map = new Map<SlaPhase, { alertaEn: number; venceEn: number } | null>();
    for (const row of fases) {
      const umbral = Number(row.umbralInput);
      if (!row.umbralInput || !Number.isFinite(umbral) || umbral <= 0) {
        map.set(row.fase, null);
        continue;
      }
      map.set(row.fase, {
        alertaEn: addBusinessDaysBogota(now, umbral * 0.8),
        venceEn: addBusinessDaysBogota(now, umbral),
      });
    }
    return map;
  }, [fases, now]);

  function updateFase(fase: SlaPhase, patch: Partial<EditableFase>) {
    setFases((prev) => prev.map((row) => (row.fase === fase ? { ...row, ...patch } : row)));
  }

  function addOversightEmail() {
    const email = newEmail.trim();
    if (!email || !email.includes("@")) {
      toast.error("Ingresa un correo válido.");
      return;
    }
    if (oversightEmails.some((e) => e.email.toLowerCase() === email.toLowerCase())) {
      toast.error("Ese correo ya está en la lista.");
      return;
    }
    setOversightEmails((prev) => [...prev, { email, nombre: newEmailNombre.trim() || null }]);
    setNewEmail("");
    setNewEmailNombre("");
  }

  function removeOversightEmail(email: string) {
    setOversightEmails((prev) => prev.filter((e) => e.email !== email));
  }

  async function handleSave() {
    for (const row of fases) {
      if (row.habilitado && !row.umbralInput) {
        toast.error(`Define un umbral antes de activar "${row.label}".`);
        return;
      }
      if (row.umbralInput) {
        const value = Number(row.umbralInput);
        if (!Number.isInteger(value) || value <= 0) {
          toast.error(`El umbral de "${row.label}" debe ser un entero positivo de días laborales.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const response = await fetch("/api/billing/configuracion/sla", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa,
          fases: fases.map((row) => ({
            fase: row.fase,
            umbralDiasLaborales: row.umbralInput ? Number(row.umbralInput) : undefined,
            habilitado: row.habilitado,
          })),
          oversightEmails: oversightEmails.map((e) => ({
            email: e.email,
            nombre: e.nombre ?? undefined,
          })),
          emailsHabilitados,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "No se pudo guardar la configuración SLA.");
      }

      const refreshed = await fetch(`/api/billing/configuracion/sla?empresa=${empresa}`, {
        cache: "no-store",
      });
      if (refreshed.ok) {
        const data = (await refreshed.json()) as SlaConfigResponse;
        setConfig(data);
        setFases(toEditable(data.fases));
      }
      toast.success("Configuración SLA guardada.");
    } catch (err) {
      toast.error(
        getFacturacionErrorMessage(
          err,
          "No se pudo guardar la configuración SLA. Intenta nuevamente.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="sla">
      <ConfigCard
        title="SLA por fase"
        description="Define umbrales de días laborales de Bogotá por fase. La alerta (80%) y el vencimiento (100%) se calculan automáticamente."
        action={
          loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando configuración SLA...
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.06em] text-slate-500">
                      <th className="py-2 pr-3">Fase</th>
                      <th className="py-2 pr-3">Umbral (días laborales)</th>
                      <th className="py-2 pr-3">Activo</th>
                      <th className="py-2 pr-3">Vista previa (hoy)</th>
                      <th className="py-2 pr-3">Última actualización</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fases.map((row) => {
                      const preview = previews.get(row.fase);
                      return (
                        <tr key={row.fase}>
                          <td className="py-2.5 pr-3 font-medium text-slate-900">{row.label}</td>
                          <td className="py-2.5 pr-3">
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              value={row.umbralInput}
                              onChange={(event) =>
                                updateFase(row.fase, { umbralInput: event.target.value })
                              }
                              placeholder="Sin umbral"
                              className="h-9 w-28"
                            />
                          </td>
                          <td className="py-2.5 pr-3">
                            <Checkbox
                              checked={row.habilitado}
                              onCheckedChange={(checked) =>
                                updateFase(row.fase, { habilitado: checked === true })
                              }
                              aria-label={`Activar SLA para ${row.label}`}
                            />
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-slate-600">
                            {preview ? (
                              <>
                                <p>Alerta: {formatDateTime(preview.alertaEn)}</p>
                                <p>Vence: {formatDateTime(preview.venceEn)}</p>
                              </>
                            ) : (
                              <span className="text-slate-400">Sin umbral configurado</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-slate-500">
                            {row.actualizadoEn ? (
                              <>
                                <p>{formatDateTime(row.actualizadoEn)}</p>
                                <p>{row.actualizadoPorNombre ?? row.actualizadoPorEmail ?? "—"}</p>
                              </>
                            ) : (
                              "Sin cambios registrados"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">Regla de advertencia</p>
                <p className="mt-1">
                  {config?.warningRule ??
                    "Se marca advertencia al 80% del umbral; el correo de vencimiento solo se envía al superar el 100%."}
                </p>
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-3">
                  <Checkbox
                    id="sla-emails-habilitados"
                    checked={emailsHabilitados}
                    onCheckedChange={(checked) => setEmailsHabilitados(checked === true)}
                    className="mt-0.5"
                  />
                  <div>
                    <label
                      htmlFor="sla-emails-habilitados"
                      className="text-sm font-medium text-slate-900"
                    >
                      Enviar resumen diario de vencidos por correo
                    </label>
                    <p className="text-xs leading-5 text-slate-500">
                      Se envía a cada responsable y, si una factura no tiene responsable válido, a
                      los correos de supervisión.
                    </p>
                  </div>
                </div>

                <p className="text-sm font-semibold text-slate-800">Correos de supervisión</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={newEmail}
                      onChange={(event) => setNewEmail(event.target.value)}
                      placeholder="correo@empresa.co"
                      className="pl-9"
                    />
                  </div>
                  <Input
                    value={newEmailNombre}
                    onChange={(event) => setNewEmailNombre(event.target.value)}
                    placeholder="Nombre (opcional)"
                    className="sm:w-56"
                  />
                  <Button type="button" variant="outline" onClick={addOversightEmail}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Agregar
                  </Button>
                </div>

                <div className="space-y-2">
                  {oversightEmails.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500">
                      No hay correos de supervisión configurados.
                    </p>
                  ) : (
                    oversightEmails.map((entry) => (
                      <div
                        key={entry.email}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {entry.nombre || entry.email}
                          </p>
                          {entry.nombre ? (
                            <p className="truncate text-xs text-slate-500">{entry.email}</p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => removeOversightEmail(entry.email)}
                          aria-label={`Eliminar ${entry.email}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <Button
                type="button"
                className="w-full rounded-xl"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? "Guardando..." : "Guardar configuración SLA"}
              </Button>
            </div>
          )
        }
      />
    </div>
  );
}
