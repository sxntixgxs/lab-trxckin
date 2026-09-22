"use client";

import Link from "next/link";
import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { AlertTriangle, Mail, Paperclip, RotateCw } from "lucide-react";
import { toast } from "sonner";
import Loading from "../../loading";
import NoAutorizado from "@/app/no-autorizado";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { DashboardHero } from "@/components/dashboard-hero";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { useFacturacionPage } from "../hooks/use-facturacion-page";
import { FacturacionSyncInboxButton } from "../components/sync-inbox-button";
import { getFacturacionErrorMessage } from "../lib/user-facing-error";
import { formatDateTime } from "../lib/utils";

const OMITIDO_LABELS: Record<string, string> = {
  sin_xml: "Sin XML de factura",
  nit_desconocido: "NIT no reconocido",
};

function RetryEmailButton({ correoId }: { correoId: Id<"facturacionCorreos"> }) {
  const [loading, setLoading] = useState(false);
  const reprocesar = useAction(api.facturacionGraph.reprocesarCorreo);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const result = await reprocesar({ correoId });
          if (result.ok) {
            toast.success(
              result.facturas > 0
                ? `Correo reprocesado: ${result.facturas} factura(s) creada(s).`
                : "Correo reprocesado sin facturas nuevas."
            );
          } else {
            toast.error(
              getFacturacionErrorMessage(
                result.error,
                "No fue posible reprocesar el correo. Intenta nuevamente.",
              ),
            );
          }
        } catch (error) {
          toast.error(
            getFacturacionErrorMessage(
              error,
              "No fue posible reprocesar el correo. Intenta nuevamente.",
            ),
          );
        } finally {
          setLoading(false);
        }
      }}
      className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      <RotateCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
      Reintentar
    </button>
  );
}

export default function FacturacionCorreosPage() {
  const { status, hasAccess } = useFacturacionPage(RUTAS_SISTEMA.FACTURACION_CORREOS);
  const { empresaActiva, empresaActivaInfo } = useEmpresaFilter();
  const [procesado, setProcesado] = useState<boolean | undefined>(undefined);

  const emails = useQuery(api.facturacionCorreos.listar, {
    limit: 100,
    ...(typeof empresaActiva === "number" ? { empresa: empresaActiva } : {}),
    ...(procesado !== undefined ? { procesado } : {}),
  });

  const emailsData = (emails ?? []) as Array<Doc<"facturacionCorreos">>;

  if (status === "loading") return <Loading />;
  if (!hasAccess) return <NoAutorizado />;

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <DashboardHero
        title="Correos capturados"
        description={
          empresaActivaInfo
            ? `Correos de recepción capturados para ${empresaActivaInfo.nombre}.`
            : "Bandejas monitoreadas por Microsoft Graph para generar facturas y soportes."
        }
        icon={<Mail className="h-8 w-8" />}
        gradientClassName="from-slate-950 via-emerald-950 to-slate-900"
      />

      <div className="flex flex-wrap items-center gap-3">
        <FacturacionSyncInboxButton />
        <div className="flex gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-xs">
          <button type="button" onClick={() => setProcesado(undefined)} className={`rounded-2xl px-4 py-2 text-sm ${procesado === undefined ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>Todos</button>
          <button type="button" onClick={() => setProcesado(false)} className={`rounded-2xl px-4 py-2 text-sm ${procesado === false ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>Pendientes</button>
          <button type="button" onClick={() => setProcesado(true)} className={`rounded-2xl px-4 py-2 text-sm ${procesado === true ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>Procesados</button>
        </div>
      </div>

      <div className="space-y-3">
        {emailsData.map((email: Doc<"facturacionCorreos">) => {
          const esOmitido = email.procesado && !email.facturaId;
          const facturaIds = email.facturaIds?.length
            ? email.facturaIds
            : email.facturaId
              ? [email.facturaId]
              : [];
          return (
            <div key={email._id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{email.subject}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${email.procesado ? (esOmitido ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700") : "bg-amber-50 text-amber-700"}`}>
                      {email.procesado ? (esOmitido ? "Omitido" : "Procesado") : "Pendiente"}
                    </span>
                    {esOmitido && email.omitidoMotivo ? (
                      <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-500">
                        {OMITIDO_LABELS[email.omitidoMotivo] ?? email.omitidoMotivo}
                      </span>
                    ) : null}
                    {!email.procesado && (email.intentosProcesamiento ?? 0) > 0 ? (
                      <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">
                        {email.intentosProcesamiento} intento(s)
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">De {email.from}</p>
                  <p className="mt-3 text-sm text-slate-600">{email.bodyPreview}</p>
                  {email.ultimoError && !email.procesado ? (
                    <div className="mt-3 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="break-all">{email.ultimoError}</span>
                    </div>
                  ) : null}
                  {email.attachments?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {email.attachments.map((attachment: NonNullable<Doc<"facturacionCorreos">["attachments"]>[number]) => (
                        <span key={attachment.graphAttachmentId} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                          <Paperclip className="h-3 w-3" />
                          {attachment.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                  <p className="text-xs text-slate-500">{formatDateTime(email.receivedDateTime)}</p>
                  {facturaIds.map((facturaId, index) => (
                    <Link key={facturaId} href={`/billing/invoices/${facturaId}`} className="text-sm font-medium text-slate-900 hover:underline">
                      {facturaIds.length > 1 ? `Ver factura ${index + 1}` : "Ver factura"}
                    </Link>
                  ))}
                  {!email.procesado || esOmitido ? (
                    <RetryEmailButton correoId={email._id} />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {emailsData.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
            No hay correos para este filtro.
          </div>
        ) : null}
      </div>
    </div>
  );
}
