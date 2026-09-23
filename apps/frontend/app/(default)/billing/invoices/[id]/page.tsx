"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowLeft, Receipt } from "lucide-react";

import Loading from "../../../loading";
import NoAutorizado from "@/app/no-autorizado";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { useFacturacionPage } from "../../hooks/use-facturacion-page";
import { FacturacionApprovalTimeline } from "../../components/approval-timeline";
import { formatCurrency } from "../../lib/utils";
import {
  getValorContable,
  valorContableDiffiereDelTotal,
} from "../../lib/valor-contable";
import { FacturaAnticipoOwnerSection } from "./_components/factura-anticipo-owner-section";
import { FacturaDocuments } from "./_components/factura-documents";
import { FacturaFlowProgress } from "./_components/factura-flow-progress";
import { FacturaHero } from "./_components/factura-hero";
import { FacturaInfoGrid } from "./_components/factura-info-grid";
import {
  AnticiposLegalizacionSection,
  AsignacionesSection,
  CajaMenorLegalizacionSection,
  CajaMenorReembolsoSection,
  CrucesDocumentosInternosSection,
  NotaCreditoRelacionSection,
  PaymentReceiptCard,
  PeajesNotasCreditoSection,
} from "./_components/sections";
import { FacturaCausacionPanel } from "@/components/facturacion/factura-causacion-panel";
import { isPdfLikeAdjunto, MoneyCard } from "./_components/shared-ui";
import type {
  FacturaAdjuntoConUrl,
  FacturaWithTareaData,
  LegalizacionAnticipoDetalle,
  LegalizacionCajaMenorDetalle,
  MovimientoCajaMenorDetalle,
} from "./_components/types";

function normalizeFacturaData(data: Record<string, unknown>): FacturaWithTareaData {
  const extended = data as FacturaWithTareaData & {
    rechazoDianRelacion?: FacturaWithTareaData["notaCreditoRelacion"];
  };

  return {
    factura: extended.factura,
    tarea: extended.tarea,
    aprobaciones: extended.aprobaciones ?? [],
    asignaciones: extended.asignaciones ?? [],
    legalizacionesAnticipos: [...(extended.legalizacionesAnticipos ?? [])].sort(
      (a, b) => a.creadoEn - b.creadoEn,
    ),
    legalizacionesCajaMenor: [...(extended.legalizacionesCajaMenor ?? [])].sort(
      (a, b) => a.creadoEn - b.creadoEn,
    ),
    movimientosCajaMenor: [...(extended.movimientosCajaMenor ?? [])].sort(
      (a, b) => a.creadoEn - b.creadoEn,
    ),
    peajesCruceDetalle: extended.peajesCruceDetalle ?? null,
    notaCreditoRelacion:
      extended.notaCreditoRelacion ?? extended.rechazoDianRelacion ?? null,
    estadoResuelto: extended.estadoResuelto ?? null,
    cajaMenorProceso: extended.cajaMenorProceso ?? null,
  };
}

export default function FacturacionDetallePage() {
  const params = useParams<{ id: string }>();
  const { status, hasAccess, session } = useFacturacionPage(
    RUTAS_SISTEMA.FACTURACION_FACTURAS,
  );
  const rawData = useQuery(api.facturacionFacturas.getWithTarea, {
    id: params.id as Id<"facturacionFacturas">,
  });

  // File URLs are only served for ids that belong to this invoice.
  const contextoArchivos = rawData?.factura?._id
    ? { tipo: "factura" as const, facturaId: rawData.factura._id as Id<"facturacionFacturas"> }
    : null;
  const xmlUrl = useQuery(
    api.facturacionStorage.getUrl,
    contextoArchivos && rawData?.factura?.xmlStorageId
      ? { storageId: rawData.factura.xmlStorageId, contexto: contextoArchivos }
      : "skip",
  );
  const pdfUrl = useQuery(
    api.facturacionStorage.getUrl,
    contextoArchivos && rawData?.factura?.pdfStorageId
      ? { storageId: rawData.factura.pdfStorageId, contexto: contextoArchivos }
      : "skip",
  );
  const soportesUrl = useQuery(
    api.facturacionStorage.getUrl,
    contextoArchivos && rawData?.factura?.soportesStorageId
      ? { storageId: rawData.factura.soportesStorageId, contexto: contextoArchivos }
      : "skip",
  );
  const comprobanteUrl = useQuery(
    api.facturacionStorage.getUrl,
    contextoArchivos && rawData?.tarea?.comprobantePagoStorageId
      ? { storageId: rawData.tarea.comprobantePagoStorageId, contexto: contextoArchivos }
      : "skip",
  );
  const adjuntosFactura = useQuery(
    api.facturacionAdjuntos.listarPorFactura,
    rawData?.factura?._id ? { facturaId: rawData.factura._id } : "skip",
  );

  if (status === "loading" || rawData === undefined) return <Loading />;
  if (!hasAccess) return <NoAutorizado />;
  if (!rawData) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-10 text-sm text-slate-500">
        No se encontró la factura solicitada.
      </div>
    );
  }

  const data = normalizeFacturaData(rawData as Record<string, unknown>);
  const {
    factura,
    tarea,
    aprobaciones,
    asignaciones,
    legalizacionesAnticipos,
    legalizacionesCajaMenor,
    movimientosCajaMenor,
    peajesCruceDetalle,
    notaCreditoRelacion,
    estadoResuelto,
    cajaMenorProceso,
  } = data;

  const storageIdsPrincipales = new Set(
    [factura.pdfStorageId, factura.soportesStorageId]
      .filter(Boolean)
      .map((storageId) => String(storageId)),
  );
  const adjuntosFacturaVisibles = ((adjuntosFactura ?? []) as FacturaAdjuntoConUrl[])
    .filter(
      (adjunto) =>
        Boolean(adjunto.url) && !storageIdsPrincipales.has(String(adjunto.storageId)),
    );
  const adjuntoPrincipalFactura = !factura.pdfStorageId
    ? adjuntosFacturaVisibles.find(isPdfLikeAdjunto) ??
      adjuntosFacturaVisibles[0] ??
      null
    : null;
  const adjuntosFacturaExtra = adjuntosFacturaVisibles.filter(
    (adjunto) => adjunto._id !== adjuntoPrincipalFactura?._id,
  );

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <Link
        href="/billing/invoices"
        className="inline-flex items-center gap-2 text-sm text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al listado
      </Link>

      <FacturaHero
        factura={factura}
        tarea={tarea}
        tareaEstado={tarea?.estado}
        estadoResuelto={estadoResuelto}
      />

      <FacturaFlowProgress
        factura={factura}
        tarea={tarea}
        aprobaciones={aprobaciones}
        peajesCruceDetalle={peajesCruceDetalle}
        estadoResuelto={estadoResuelto}
        cajaMenorProceso={cajaMenorProceso}
      />

      <FacturaAnticipoOwnerSection factura={factura} tarea={tarea} />

      {movimientosCajaMenor.length > 0 ? (
        <CajaMenorReembolsoSection
          movimientos={movimientosCajaMenor as MovimientoCajaMenorDetalle[]}
          moneda={factura.moneda}
        />
      ) : null}

      {asignaciones.length > 0 || (cajaMenorProceso?.intervalos.length ?? 0) > 0 ? (
        <AsignacionesSection
          asignaciones={asignaciones}
          intervalosCajaMenor={cajaMenorProceso?.intervalos ?? []}
        />
      ) : null}

      <FacturaDocuments
        factura={factura}
        tarea={tarea}
        xmlUrl={xmlUrl}
        pdfUrl={pdfUrl}
        soportesUrl={soportesUrl}
        comprobanteUrl={comprobanteUrl}
        adjuntoPrincipal={adjuntoPrincipalFactura}
        adjuntosExtra={adjuntosFacturaExtra}
      />

      {tarea?.estado === "pagada" ? (
        <PaymentReceiptCard
          url={typeof comprobanteUrl === "string" ? comprobanteUrl : null}
          nombre={tarea.comprobantePagoNombre ?? null}
          fechaPago={tarea.actualizadoEn}
        />
      ) : null}

      {peajesCruceDetalle ? (
        <PeajesNotasCreditoSection
          detalle={peajesCruceDetalle}
          moneda={factura.moneda}
        />
      ) : null}

      {notaCreditoRelacion ? (
        <NotaCreditoRelacionSection
          detalle={notaCreditoRelacion}
          facturaActualId={factura._id}
          moneda={factura.moneda}
          facturaActual={factura}
        />
      ) : null}

      {legalizacionesAnticipos.length > 0 ? (
        <AnticiposLegalizacionSection
          legalizaciones={legalizacionesAnticipos as LegalizacionAnticipoDetalle[]}
          moneda={factura.moneda}
          peajesCruceDetalle={peajesCruceDetalle}
        />
      ) : null}

      <CrucesDocumentosInternosSection facturaId={factura._id} factura={factura} />

      {legalizacionesCajaMenor.length > 0 ? (
        <CajaMenorLegalizacionSection
          legalizaciones={legalizacionesCajaMenor as LegalizacionCajaMenorDetalle[]}
          moneda={factura.moneda}
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <MoneyCard
          label="Subtotal"
          value={formatCurrency(factura.subtotal, factura.moneda)}
        />
        <MoneyCard
          label="Impuestos"
          value={formatCurrency(factura.impuestos, factura.moneda)}
        />
        <MoneyCard
          label="Total factura"
          value={formatCurrency(factura.total, factura.moneda)}
          highlight
        />
      </section>

      {valorContableDiffiereDelTotal(factura) ? (
        <section className="grid gap-4 md:grid-cols-3">
          <MoneyCard
            label="Valor contable"
            value={formatCurrency(getValorContable(factura), factura.moneda)}
            highlight
          />
        </section>
      ) : null}

      <FacturaInfoGrid
        factura={factura}
        tarea={tarea}
        asignacionesCount={asignaciones.length}
        sessionUser={session?.user ?? {}}
        estadoResuelto={estadoResuelto}
      />

      <FacturaCausacionPanel
        facturaId={factura._id}
        numeroFactura={factura.numeroFactura}
        contexto={{ tipo: "flujo_factura" }}
        readonly
      />

      {factura.lineas?.length ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
            <Receipt className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Líneas del XML
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-6 py-3">Descripción</th>
                  <th className="px-6 py-3 text-right">Cantidad</th>
                  <th className="px-6 py-3 text-right">P. unitario</th>
                  <th className="px-6 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {factura.lineas.map(
                  (
                    linea: NonNullable<
                      Doc<"facturacionFacturas">["lineas"]
                    >[number],
                    index: number,
                  ) => (
                  <tr
                    key={`${linea.descripcion}-${index}`}
                    className="border-t border-slate-100 transition hover:bg-slate-50/60"
                  >
                    <td className="px-6 py-3 text-slate-700">{linea.descripcion}</td>
                    <td className="px-6 py-3 text-right text-slate-500">
                      {linea.cantidad}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-500">
                      {formatCurrency(linea.precioUnitario, factura.moneda)}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(linea.total, factura.moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {aprobaciones.length > 0 ? (
        <FacturacionApprovalTimeline
          aprobaciones={aprobaciones}
          facturaCreadoEn={factura.creadoEn}
        />
      ) : null}
    </div>
  );
}
