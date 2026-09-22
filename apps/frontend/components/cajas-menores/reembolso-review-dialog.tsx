"use client";

import { useMutation, useQuery } from "convex/react";
import { Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCOP } from "@/lib/format";
import type { CentroCostoDistribucionRow } from "@/lib/cajas-menores/centros-costo-distribucion";
import { getEmpresaNombre } from "@/lib/empresas";

import { EstadoBadge } from "./estado-badge";
import { downloadReembolsoFormatoPdf } from "./reembolso-formato-pdf";
import type { PersistentStageAttachment } from "./reembolso-stage-attachments";
import {
  type ContadorOption,
  type DecisionFase,
  type DestinoAprobacionRevision,
  type DestinoAprobacionImpuestos,
  type DestinoDevolucionGerencia,
  type RetornoGerenciaPendienteEn,
  getFaseDestinoLabel,
  usaRutaSaltoFasesRevisionEnReembolso,
  normalizeInvoiceItem,
  ReembolsoAttachmentOverlay,
  type ReembolsoConfirmAction,
  ReembolsoConfirmDialog,
  ReembolsoDecisionPanel,
  type ReembolsoDocument,
  ReembolsoDocumentViewer,
  type ReembolsoInvoiceItem,
  ReembolsoInvoiceNavigator,
  ReembolsoReadonlyPanel,
  ReembolsoValorContablePanel,
  ReembolsoWorkspaceShell,
  buildAjustesValorContablePayload,
  computeReembolsoTotalConBorradores,
  countInvalidValorContableDrafts,
  getConfirmacionAjustesResumen,
  hasValorContableDraftChanges,
  initializeValorContableDrafts,
  puedeEditarValorContableReembolso,
  requiresComentarioForAjustes,
  type ValorContableDraft,
} from "./reembolso-workspace";

export type ReembolsoModalTarget = {
  _id: string;
  estado?: string;
};

type DetalleMovimiento = {
  _id: string;
  facturaId: string;
  factura?: {
    numeroFactura?: string;
    proveedorNombre?: string;
    total?: number;
    valorContable?: number;
    moneda?: string;
    esReciboFisicoCajaMenor?: boolean;
    pdfStorageId?: Id<"_storage">;
    soportesStorageId?: Id<"_storage">;
    soportesNombre?: string;
  } | null;
  nombreEmpresa: string;
  concepto: string;
  observaciones?: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion?: CentroCostoDistribucionRow[];
  valor: number;
};

type CausacionMovimientoDraft = {
  causado: boolean;
  numeroFp: string;
  expectedVersion?: number;
};

type FaseKey =
  | "pendiente_aprobacion_lider"
  | "pendiente_revision"
  | "pendiente_revision_impuestos"
  | "pendiente_eventos_dian"
  | "pendiente_aprobacion"
  | "pendiente_pago_tesoreria"
  | "solo_lectura";

const FASE_TITLE: Record<FaseKey, string> = {
  pendiente_aprobacion_lider: "Aprobación líder",
  pendiente_revision: "Revisión Revisor Caja Menor",
  pendiente_revision_impuestos: "Impuestos/Contabilidad",
  pendiente_eventos_dian: "Eventos DIAN",
  pendiente_aprobacion: "Aprobación Gerencia Financiera",
  pendiente_pago_tesoreria: "Pago Tesorería",
  solo_lectura: "Detalle del reembolso",
};

export function ReembolsoReviewDialog({
  reembolso,
  mode = "action",
  loading,
  actor,
  onOpenChange,
  onSuccess,
}: {
  reembolso: ReembolsoModalTarget | null;
  mode?: "action" | "readonly";
  loading?: boolean;
  actor: {
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
    actorRol?: number;
  };
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const reembolsoId = reembolso?._id as Id<"cajasMenoresReembolsos"> | undefined;

  const detalle = useQuery(
    api.cajasMenores.obtenerDetalleReembolsoCajaMenor,
    reembolsoId ? { reembolsoId, actorUserId: actor.actorUserId, actorRol: actor.actorRol } : "skip"
  );

  const facturaIds = useMemo<Array<Id<"facturacionFacturas">>>(() => {
    if (!detalle?.movimientos) return [];
    const seen = new Set<string>();
    const ids: Array<Id<"facturacionFacturas">> = [];
    for (const movimiento of detalle.movimientos as DetalleMovimiento[]) {
      const facturaId = String(movimiento.facturaId);
      if (seen.has(facturaId)) continue;
      seen.add(facturaId);
      ids.push(movimiento.facturaId as Id<"facturacionFacturas">);
    }
    return ids;
  }, [detalle]);

  const facturaStorageIds = useMemo<Array<Id<"_storage">>>(() => {
    if (!detalle?.movimientos) return [];
    const seen = new Set<string>();
    const storageIds: Array<Id<"_storage">> = [];
    for (const movimiento of detalle.movimientos as DetalleMovimiento[]) {
      for (const storageId of [
        movimiento.factura?.pdfStorageId,
        movimiento.factura?.soportesStorageId,
      ]) {
        if (!storageId || seen.has(String(storageId))) continue;
        seen.add(String(storageId));
        storageIds.push(storageId);
      }
    }
    return storageIds;
  }, [detalle]);

  const adjuntosPorFacturas = useQuery(
    api.facturacionAdjuntos.listarPorFacturas,
    facturaIds.length > 0 ? { facturaIds } : "skip"
  );

  const facturaStorageUrls = useQuery(
    api.facturacionStorage.getUrls,
    facturaStorageIds.length > 0 ? { storageIds: facturaStorageIds } : "skip"
  );

  const adjuntosLoading = facturaIds.length > 0 && adjuntosPorFacturas === undefined;
  const storageUrlsLoading = facturaStorageIds.length > 0 && facturaStorageUrls === undefined;
  const adjuntosDataLoading = adjuntosLoading || storageUrlsLoading;

  const invoices = useMemo<ReembolsoInvoiceItem[]>(() => {
    const urlByStorageId = new Map<string, string>();
    for (const item of facturaStorageUrls ?? []) {
      if (item.url) urlByStorageId.set(String(item.storageId), item.url);
    }
    for (const group of adjuntosPorFacturas ?? []) {
      for (const adjunto of group.adjuntos) {
        if (adjunto.url) {
          urlByStorageId.set(String(adjunto.storageId), adjunto.url);
        }
      }
    }

    const adjuntosByFacturaId = new Map<
      string,
      NonNullable<Parameters<typeof normalizeInvoiceItem>[0]["adjuntos"]>
    >();
    for (const group of adjuntosPorFacturas ?? []) {
      adjuntosByFacturaId.set(String(group.facturaId), group.adjuntos);
    }

    const seenFacturas = new Set<string>();
    const items: ReembolsoInvoiceItem[] = [];
    for (const movimiento of (detalle?.movimientos ?? []) as DetalleMovimiento[]) {
      const facturaId = String(movimiento.facturaId);
      if (seenFacturas.has(facturaId)) continue;
      seenFacturas.add(facturaId);
      items.push(
        normalizeInvoiceItem(
          {
            key: String(movimiento._id),
            movimientoId: String(movimiento._id),
            facturaId,
            numeroFactura: movimiento.factura?.numeroFactura,
            proveedorNombre: movimiento.factura?.proveedorNombre ?? movimiento.nombreEmpresa,
            concepto: movimiento.concepto,
            observaciones: movimiento.observaciones,
            valor: movimiento.valor,
            totalFactura: movimiento.factura?.total ?? movimiento.valor,
            valorContable:
              movimiento.factura?.valorContable ??
              movimiento.factura?.total ??
              movimiento.valor,
            moneda: movimiento.factura?.moneda ?? "COP",
            esReciboFisicoCajaMenor: movimiento.factura?.esReciboFisicoCajaMenor,
            centroCostoCodigo: movimiento.centroCostoCodigo,
            centroCostoNombre: movimiento.centroCostoNombre,
            centrosCostoDistribucion: movimiento.centrosCostoDistribucion,
            pdfStorageId: movimiento.factura?.pdfStorageId,
            soportesStorageId: movimiento.factura?.soportesStorageId,
            soportesNombre: movimiento.factura?.soportesNombre,
            adjuntos: adjuntosByFacturaId.get(facturaId) ?? [],
          },
          urlByStorageId
        )
      );
    }
    return items;
  }, [adjuntosPorFacturas, detalle, facturaStorageUrls]);

  const revisarReembolso = useMutation(api.cajasMenores.revisarReembolsoCajaMenor);
  const decidirAprobacionLider = useMutation(
    api.cajasMenores.decidirAprobacionLiderReembolsoCajaMenor
  );
  const decidirRevisionImpuestos = useMutation(
    api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor
  );
  const decidirEventosDian = useMutation(
    api.cajasMenores.decidirEventosDianReembolsoCajaMenor
  );
  const avanzarFasesConsecutivas = useMutation(
    api.cajasMenores.avanzarFasesConsecutivasReembolsoCajaMenor
  );
  const decidirReembolso = useMutation(api.cajasMenores.decidirReembolsoCajaMenor);
  const cargarComprobante = useMutation(api.cajasMenores.cargarComprobantePagoReembolsoCajaMenor);

  const faseModal = (detalle?.faseModal ?? "solo_lectura") as FaseKey;
  const empresaIdParaContadores = detalle?.caja?.empresa_id;

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [comentario, setComentario] = useState("");
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [overlayAttachmentId, setOverlayAttachmentId] =
    useState<Id<"cajasMenoresReembolsoAdjuntos"> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ReembolsoConfirmAction | null>(null);
  const [pendingDecision, setPendingDecision] = useState<
    "aprobar" | "rechazar" | "devolver" | "pago" | null
  >(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [causacionDirty, setCausacionDirty] = useState(false);
  const [causacionByMovimientoId, setCausacionByMovimientoId] = useState<
    Record<string, CausacionMovimientoDraft | undefined>
  >({});
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const [contadorUserId, setContadorUserId] = useState("");
  const [destinoDevolucionGerencia, setDestinoDevolucionGerencia] = useState<
    DestinoDevolucionGerencia | ""
  >("");
  const [responsableDestinoUserId, setResponsableDestinoUserId] = useState("");
  const [destinoAprobacionRevision, setDestinoAprobacionRevision] =
    useState<DestinoAprobacionRevision>("contabilidad");
  const [destinoAprobacionImpuestos, setDestinoAprobacionImpuestos] =
    useState<DestinoAprobacionImpuestos>("eventos_dian");
  const [eventosDianUserId, setEventosDianUserId] = useState("");
  const [devolverContadorUserId, setDevolverContadorUserId] = useState("");
  const [usaSaltoFases, setUsaSaltoFases] = useState(true);
  const [valorContableDrafts, setValorContableDrafts] = useState<
    Record<string, ValorContableDraft | undefined>
  >({});

  const contadoresQuery = useQuery(
    api.cajasMenores.listarContadoresImpuestosConfigurados,
    faseModal === "pendiente_revision" ||
      faseModal === "pendiente_aprobacion" ||
      faseModal === "pendiente_eventos_dian"
      ? empresaIdParaContadores !== undefined
        ? { empresa: empresaIdParaContadores }
        : "skip"
      : "skip"
  );
  const eventosDianQuery = useQuery(
    api.cajasMenores.listarEventosDianConfigurados,
    faseModal === "pendiente_revision" ||
      faseModal === "pendiente_revision_impuestos" ||
      faseModal === "pendiente_aprobacion"
      ? empresaIdParaContadores !== undefined
        ? { empresa: empresaIdParaContadores }
        : "skip"
      : "skip"
  );
  const revisoresQuery = useQuery(
    api.cajasMenores.listarRevisoresCajaMenorConfigurados,
    faseModal === "pendiente_aprobacion"
      ? empresaIdParaContadores !== undefined
        ? { empresa: empresaIdParaContadores }
        : "skip"
      : "skip"
  );
  const contadores = contadoresQuery ?? [];
  const eventosDianUsuarios = eventosDianQuery ?? [];
  const revisores = revisoresQuery ?? [];

   
  useEffect(() => {
    if (!reembolsoId) return;
    setActiveKey(null);
    setListCollapsed(false);
    setFocusMode(false);
    setComentario("");
    setAttachmentsBusy(false);
    setOverlayAttachmentId(null);
    setSubmitting(false);
    setConfirmAction(null);
    setPendingDecision(null);
    setDiscardConfirmOpen(false);
    setCausacionDirty(false);
    setCausacionByMovimientoId({});
    setContadorUserId("");
    setDestinoDevolucionGerencia("");
    setResponsableDestinoUserId("");
    setDestinoAprobacionRevision("contabilidad");
    setDestinoAprobacionImpuestos("eventos_dian");
    setEventosDianUserId("");
    setDevolverContadorUserId("");
    setUsaSaltoFases(true);
    setValorContableDrafts({});
  }, [reembolsoId]);
   

  const contadorPrevioDisponible = detalle?.contadorPrevioDisponible ?? null;
  const revisorPrevioDisponible = detalle?.revisorPrevioDisponible ?? null;
  const eventosDianPrevioDisponible = detalle?.eventosDianPrevioDisponible ?? null;
  const retornoGerenciaPendienteEn = detalle?.retornoGerenciaPendienteEn as
    | RetornoGerenciaPendienteEn
    | undefined;
  const permiteReenvioDirectoGerencia = Boolean(detalle?.permiteReenvioDirectoGerencia);
  const saltoFasesConsecutivas = detalle?.saltoFasesConsecutivas ?? null;

   
  useEffect(() => {
    if (faseModal !== "pendiente_revision") return;
    if (permiteReenvioDirectoGerencia) {
      setDestinoAprobacionRevision("gerencia");
    }
  }, [faseModal, permiteReenvioDirectoGerencia, reembolsoId]);
   

  const responsablesDestinoGerencia: ContadorOption[] =
    destinoDevolucionGerencia === "contabilidad"
      ? contadores
      : destinoDevolucionGerencia === "eventos_dian"
        ? eventosDianUsuarios
        : destinoDevolucionGerencia === "revision"
          ? revisores
          : [];
  const responsableDestinoNombre = responsablesDestinoGerencia.find(
    (persona) => persona.usuarioId === responsableDestinoUserId
  )?.nombre;
  const responsablesDestinoGerenciaLoading =
    faseModal === "pendiente_aprobacion" &&
    empresaIdParaContadores !== undefined &&
    ((destinoDevolucionGerencia === "contabilidad" && contadoresQuery === undefined) ||
      (destinoDevolucionGerencia === "eventos_dian" && eventosDianQuery === undefined) ||
      (destinoDevolucionGerencia === "revision" && revisoresQuery === undefined));

   
  useEffect(() => {
    if (faseModal !== "pendiente_revision") return;
    if (contadorUserId) return;
    if (contadorPrevioDisponible && destinoAprobacionRevision === "contabilidad") {
      setContadorUserId(contadorPrevioDisponible.usuarioId);
    }
  }, [faseModal, contadorPrevioDisponible, contadorUserId, destinoAprobacionRevision]);
   

   
  useEffect(() => {
    if (faseModal !== "pendiente_aprobacion") return;
    if (!destinoDevolucionGerencia) {
      setResponsableDestinoUserId("");
      return;
    }
    if (destinoDevolucionGerencia === "contabilidad" && contadorPrevioDisponible) {
      setResponsableDestinoUserId(contadorPrevioDisponible.usuarioId);
      return;
    }
    if (destinoDevolucionGerencia === "eventos_dian" && eventosDianPrevioDisponible) {
      setResponsableDestinoUserId(eventosDianPrevioDisponible.usuarioId);
      return;
    }
    if (destinoDevolucionGerencia === "revision" && revisorPrevioDisponible) {
      setResponsableDestinoUserId(revisorPrevioDisponible.usuarioId);
      return;
    }
    setResponsableDestinoUserId("");
  }, [
    faseModal,
    destinoDevolucionGerencia,
    contadorPrevioDisponible,
    eventosDianPrevioDisponible,
    revisorPrevioDisponible,
  ]);
   

   
  useEffect(() => {
    if (faseModal !== "pendiente_eventos_dian") return;
    if (devolverContadorUserId) return;
    if (contadorPrevioDisponible) {
      setDevolverContadorUserId(contadorPrevioDisponible.usuarioId);
    }
  }, [faseModal, contadorPrevioDisponible, devolverContadorUserId]);
   

  useEffect(() => {
    if (!activeKey && invoices.length > 0) {
      setActiveKey(invoices[0]!.key);
    }
  }, [activeKey, invoices]);

  useEffect(() => {
    setCausacionDirty(false);
  }, [activeKey]);

  useEffect(() => {
    if (invoices.length === 0) return;
    setValorContableDrafts((current) => {
      const next = initializeValorContableDrafts(invoices);
      for (const invoice of invoices) {
        if (current[invoice.movimientoId]) {
          next[invoice.movimientoId] = current[invoice.movimientoId];
        }
      }
      return next;
    });
  }, [invoices]);

  const fase = mode === "readonly" ? "solo_lectura" : faseModal;
  const puedeActuar = detalle?.puedeActuar ?? false;
  const isActionPhase = mode === "action" && faseModal !== "solo_lectura" && puedeActuar;
  const puedeEditarValorContable =
    isActionPhase && puedeEditarValorContableReembolso(faseModal);
  const invalidValorContableDrafts = puedeEditarValorContable
    ? countInvalidValorContableDrafts(invoices, valorContableDrafts)
    : 0;
  const hasAjustesValorContable = hasValorContableDraftChanges(
    invoices,
    valorContableDrafts,
  );
  const valorTotalEfectivo = computeReembolsoTotalConBorradores(
    invoices,
    valorContableDrafts,
  );
  const confirmacionAjustes = getConfirmacionAjustesResumen({
    valorTotalOriginal: detalle?.reembolso?.valorTotal ?? 0,
    invoices,
    drafts: valorContableDrafts,
  });
  const ajustesPayload = buildAjustesValorContablePayload(
    invoices,
    valorContableDrafts,
  );
  const isBusy =
    submitting ||
    Boolean(loading) ||
    attachmentsBusy ||
    invalidValorContableDrafts > 0;
  const hasUnsavedChanges =
    isActionPhase &&
    (Boolean(comentario.trim()) || hasAjustesValorContable || causacionDirty);

  const requestNavigation = useCallback(
    (action: () => void) => {
      if (hasUnsavedChanges) {
        pendingNavigationRef.current = action;
        setDiscardConfirmOpen(true);
        return;
      }
      action();
    },
    [hasUnsavedChanges]
  );

  const esReenvioContabilidad = Boolean(detalle?.reembolso?.contadorAsignadoUserId);
  const enviaAContabilidad =
    !permiteReenvioDirectoGerencia || destinoAprobacionRevision === "contabilidad";
  const requiereContador =
    faseModal === "pendiente_revision" && enviaAContabilidad && !contadorPrevioDisponible;
  const contadorPrevioNombre = contadorPrevioDisponible?.nombre;
  const enviaAEventosDian =
    retornoGerenciaPendienteEn !== "contabilidad" || destinoAprobacionImpuestos === "eventos_dian";
  const requiereEventosDian =
    (faseModal === "pendiente_revision_impuestos" && enviaAEventosDian) ||
    (usaSaltoFases &&
      Boolean(saltoFasesConsecutivas?.requiereSeleccionEventosDian) &&
      (faseModal === "pendiente_revision" || faseModal === "pendiente_revision_impuestos"));
  const requiereContadorDevolucionEventosDian =
    faseModal === "pendiente_eventos_dian" && !contadorPrevioDisponible;
  const contadorPrevioNombreDevolucion = contadorPrevioDisponible?.nombre;
  const usaRutaSaltoRevision = usaRutaSaltoFasesRevisionEnReembolso({
    usaSaltoFases,
    saltoFasesConsecutivas,
    permiteReenvioDirectoGerencia,
  });

  const requestClose = useCallback(() => {
    if (attachmentsBusy) {
      toast.error("Espera a que termine la carga o eliminación de archivos.");
      return;
    }
    if (hasUnsavedChanges) {
      setDiscardConfirmOpen(true);
      return;
    }
    onOpenChange(false);
  }, [attachmentsBusy, hasUnsavedChanges, onOpenChange]);

  const phaseAttachments = useMemo<PersistentStageAttachment[]>(() => {
    const borradores = (detalle?.adjuntosBorradorFaseActual ?? []) as PersistentStageAttachment[];
    return borradores.map((adjunto) => ({
      _id: adjunto._id,
      storageId: adjunto.storageId,
      nombre: adjunto.nombre,
      mimeType: adjunto.mimeType,
      url: adjunto.url,
      actorNombre: adjunto.actorNombre,
      creadoEn: adjunto.creadoEn,
      puedeEliminar: adjunto.puedeEliminar,
    }));
  }, [detalle?.adjuntosBorradorFaseActual]);

  const overlayDocuments = useMemo<ReembolsoDocument[]>(() => {
    return phaseAttachments.map((adjunto) => ({
      id: `fase-adjunto:${adjunto._id}`,
      facturaId: "fase",
      kind: "soporte" as const,
      nombre: adjunto.nombre,
      url: adjunto.url,
      storageId: adjunto.storageId,
      mimeType: adjunto.mimeType,
      creadoEn: adjunto.creadoEn,
      previewable: Boolean(adjunto.url),
    }));
  }, [phaseAttachments]);

  const overlayInitialId = overlayAttachmentId ? `fase-adjunto:${overlayAttachmentId}` : null;

  const activeInvoice = invoices.find((invoice) => invoice.key === activeKey) ?? null;

  const selectInvoice = useCallback(
    (key: string) => {
      requestNavigation(() => setActiveKey(key));
    },
    [requestNavigation]
  );

  const goRelative = useCallback(
    (delta: number) => {
      if (!activeKey || invoices.length === 0) return;
      const index = invoices.findIndex((invoice) => invoice.key === activeKey);
      const next = invoices[index + delta];
      if (!next) return;
      requestNavigation(() => setActiveKey(next.key));
    },
    [activeKey, invoices, requestNavigation]
  );

  useEffect(() => {
    if (!reembolsoId) return;
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (event.key === "Escape") {
        if (overlayAttachmentId) return;
        if (focusMode) return;
        event.preventDefault();
        requestClose();
        return;
      }
      if (overlayAttachmentId || focusMode) return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        goRelative(-1);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        goRelative(1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusMode, goRelative, overlayAttachmentId, reembolsoId, requestClose]);

  async function executeDecision(action: "aprobar" | "rechazar" | "devolver" | "pago") {
    if (!reembolsoId || !detalle) return;
    if (attachmentsBusy) {
      toast.error("Espera a que termine la carga o eliminación de archivos.");
      return;
    }
    if (invalidValorContableDrafts > 0) {
      toast.error("Corrige los valores o distribuciones inválidas antes de continuar.");
      return;
    }
    if (requiresComentarioForAjustes(invoices, valorContableDrafts, comentario)) {
      toast.error("Debes registrar un comentario cuando ajustas el valor contable.");
      return;
    }

    const causaciones = Object.entries(causacionByMovimientoId).flatMap(
      ([movimientoId, draft]) =>
        draft
          ? [{
              movimientoId: movimientoId as Id<"facturacionCajaMenorMovimientos">,
              causado: draft.causado,
              ...(draft.expectedVersion !== undefined
                ? { expectedVersion: draft.expectedVersion }
                : {}),
              ...(draft.causado ? { numeroFp: draft.numeroFp.trim() } : {}),
            }]
          : []
    );
    if (causaciones.some((item) => item.causado && !item.numeroFp?.trim())) {
      toast.error("Ingresa el número FP antes de aplicar la acción.");
      return;
    }
    const causacionesArgs = causaciones.length > 0 ? { causaciones } : {};

    const ajustesArgs =
      ajustesPayload.length > 0
        ? {
            ajustesValorContable: ajustesPayload.map((ajuste) => ({
              ...ajuste,
              movimientoId: ajuste.movimientoId as Id<"facturacionCajaMenorMovimientos">,
            })),
          }
        : {};

    if ((action === "rechazar" || action === "devolver") && !comentario.trim()) {
      toast.error(
        action === "devolver"
          ? "Indica el motivo de la devolución."
          : "Indica el motivo del rechazo."
      );
      return;
    }
    if (action === "pago" && phaseAttachments.length === 0) {
      toast.error("Debes cargar al menos un comprobante de pago.");
      return;
    }

    const effectiveDecision = action === "pago" ? "aprobar" : action;

    if (faseModal === "pendiente_aprobacion_lider") {
      const decision = effectiveDecision as "aprobar" | "rechazar";
      setSubmitting(true);
      try {
        await decidirAprobacionLider({
          reembolsoId,
          decision,
          ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
          ...actor,
        });
        toast.success(
          decision === "aprobar"
            ? "Solicitud aprobada y enviada a Revisor Caja Menor."
            : "Solicitud rechazada."
        );
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo decidir.");
      } finally {
        setSubmitting(false);
        setConfirmAction(null);
        setPendingDecision(null);
      }
      return;
    }

    if (faseModal === "pendiente_revision") {
      const decision = effectiveDecision as "aprobar" | "rechazar";
      setSubmitting(true);
      try {
        if (
          decision === "aprobar" &&
          usaSaltoFases &&
          saltoFasesConsecutivas &&
          !permiteReenvioDirectoGerencia
        ) {
          if (
            saltoFasesConsecutivas.requiereSeleccionEventosDian &&
            !eventosDianUserId
          ) {
            throw new Error("Selecciona el responsable de Eventos DIAN.");
          }
          await avanzarFasesConsecutivas({
            reembolsoId,
            destinoEsperado: saltoFasesConsecutivas.destino,
            ...(eventosDianUserId ? { eventosDianUserId } : {}),
            ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
            ...ajustesArgs,
            ...causacionesArgs,
            ...actor,
          });
          toast.success(
            saltoFasesConsecutivas.destino === "gerencia"
              ? "Solicitud enviada a Gerencia Financiera."
              : "Solicitud enviada a Eventos DIAN.",
          );
        } else {
          await revisarReembolso({
            reembolsoId,
            decision,
            ...(decision === "aprobar" && enviaAContabilidad && contadorUserId
              ? { contadorUserId }
              : {}),
            ...(decision === "aprobar" && permiteReenvioDirectoGerencia
              ? { destinoAprobacion: destinoAprobacionRevision }
              : {}),
            ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
            ...ajustesArgs,
            ...causacionesArgs,
            ...actor,
          });
          toast.success(
            decision === "aprobar"
              ? destinoAprobacionRevision === "gerencia" && permiteReenvioDirectoGerencia
                ? "Solicitud enviada a Gerencia Financiera."
                : "Solicitud aprobada y enviada a Contabilidad."
              : "Solicitud rechazada.",
          );
        }
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo revisar.");
      } finally {
        setSubmitting(false);
        setConfirmAction(null);
        setPendingDecision(null);
      }
      return;
    }

    if (faseModal === "pendiente_revision_impuestos") {
      if (effectiveDecision === "aprobar") {
        if (enviaAEventosDian && requiereEventosDian && !eventosDianUserId) {
          toast.error("Selecciona el responsable de Eventos DIAN.");
          return;
        }
      }
      setSubmitting(true);
      try {
        if (
          effectiveDecision === "aprobar" &&
          usaSaltoFases &&
          saltoFasesConsecutivas &&
          retornoGerenciaPendienteEn !== "contabilidad"
        ) {
          await avanzarFasesConsecutivas({
            reembolsoId,
            destinoEsperado: saltoFasesConsecutivas.destino,
            ...(eventosDianUserId ? { eventosDianUserId } : {}),
            ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
            ...ajustesArgs,
            ...causacionesArgs,
            ...actor,
          });
          toast.success("Solicitud enviada a Gerencia Financiera.");
        } else {
          await decidirRevisionImpuestos({
            reembolsoId,
            decision: effectiveDecision,
            ...(effectiveDecision === "aprobar" && retornoGerenciaPendienteEn === "contabilidad"
              ? { destinoAprobacion: destinoAprobacionImpuestos }
              : {}),
            ...(effectiveDecision === "aprobar" &&
            enviaAEventosDian &&
            eventosDianUserId
              ? { eventosDianUserId }
              : {}),
            ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
            ...ajustesArgs,
            ...causacionesArgs,
            ...actor,
          });
          toast.success(
            effectiveDecision === "aprobar"
              ? destinoAprobacionImpuestos === "gerencia" &&
                retornoGerenciaPendienteEn === "contabilidad"
                ? "Solicitud reenviada a Gerencia Financiera."
                : "Solicitud enviada a Eventos DIAN."
              : effectiveDecision === "devolver"
                ? "Solicitud devuelta a Revisor Caja Menor."
                : "Solicitud rechazada.",
          );
        }
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo decidir.");
      } finally {
        setSubmitting(false);
        setConfirmAction(null);
        setPendingDecision(null);
      }
      return;
    }

    if (faseModal === "pendiente_eventos_dian") {
      if (effectiveDecision === "devolver" && requiereContadorDevolucionEventosDian && !devolverContadorUserId) {
        toast.error("Selecciona el contador de Impuestos/Contabilidad.");
        return;
      }
      setSubmitting(true);
      try {
        await decidirEventosDian({
          reembolsoId,
          decision: effectiveDecision,
          ...(effectiveDecision === "devolver" && devolverContadorUserId
            ? { contadorUserId: devolverContadorUserId }
            : {}),
          ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
          ...ajustesArgs,
          ...actor,
        });
        toast.success(
          effectiveDecision === "aprobar"
            ? "Solicitud aprobada y enviada a Gerencia Financiera."
            : effectiveDecision === "devolver"
              ? "Solicitud devuelta a Impuestos/Contabilidad."
              : "Solicitud rechazada."
        );
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo decidir.");
      } finally {
        setSubmitting(false);
        setConfirmAction(null);
        setPendingDecision(null);
      }
      return;
    }

    if (faseModal === "pendiente_aprobacion") {
      if (effectiveDecision === "devolver") {
        if (!destinoDevolucionGerencia) {
          toast.error("Selecciona el destino de la devolución.");
          return;
        }
        if (!responsableDestinoUserId) {
          toast.error("Selecciona el responsable del destino.");
          return;
        }
      }
      const decision = effectiveDecision as "aprobar" | "rechazar" | "devolver";
      setSubmitting(true);
      try {
        await decidirReembolso({
          reembolsoId,
          decision,
          ...(decision === "devolver"
            ? {
                destinoDevolucion: destinoDevolucionGerencia as DestinoDevolucionGerencia,
                responsableDestinoUserId,
              }
            : {}),
          ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
          ...actor,
        });
        toast.success(
          decision === "aprobar"
            ? "Reembolso aprobado y enviado a Tesorería."
            : decision === "devolver"
              ? destinoDevolucionGerencia === "contabilidad"
                ? "Reembolso devuelto a Impuestos/Contabilidad."
                : destinoDevolucionGerencia === "eventos_dian"
                  ? "Reembolso devuelto a Eventos DIAN."
                  : "Reembolso devuelto a Revisor Caja Menor."
              : "Reembolso rechazado."
        );
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo decidir.");
      } finally {
        setSubmitting(false);
        setConfirmAction(null);
        setPendingDecision(null);
      }
      return;
    }

    if (faseModal === "pendiente_pago_tesoreria") {
      const comprobante = phaseAttachments[0];
      if (!comprobante) return;
      setSubmitting(true);
      try {
        await cargarComprobante({
          reembolsoId,
          adjuntoId: comprobante._id,
          ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
          ...actor,
        });
        toast.success("Comprobante cargado. Reembolso completado.");
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo cargar.");
      } finally {
        setSubmitting(false);
        setConfirmAction(null);
        setPendingDecision(null);
      }
    }
  }

  function handleApproveClick() {
    if (isBusy) return;
    if (requiresComentarioForAjustes(invoices, valorContableDrafts, comentario)) {
      toast.error("Debes registrar un comentario cuando ajustas el valor contable.");
      return;
    }
    if (faseModal === "pendiente_pago_tesoreria") {
      if (phaseAttachments.length === 0) {
        toast.error("Debes cargar al menos un comprobante de pago.");
        return;
      }
      setPendingDecision("pago");
      setConfirmAction("pago");
      return;
    }
    if (
      faseModal === "pendiente_revision" &&
      !usaRutaSaltoRevision &&
      enviaAContabilidad &&
      requiereContador &&
      !contadorUserId
    ) {
      toast.error("Selecciona el contador de Impuestos/Contabilidad.");
      return;
    }
    if (
      (faseModal === "pendiente_revision" || faseModal === "pendiente_revision_impuestos") &&
      usaSaltoFases &&
      saltoFasesConsecutivas?.requiereSeleccionEventosDian &&
      !eventosDianUserId
    ) {
      toast.error("Selecciona el responsable de Eventos DIAN.");
      return;
    }
    if (
      faseModal === "pendiente_revision_impuestos" &&
      !usaSaltoFases &&
      enviaAEventosDian &&
      requiereEventosDian &&
      !eventosDianUserId
    ) {
      toast.error("Selecciona el responsable de Eventos DIAN.");
      return;
    }
    setPendingDecision("aprobar");
    setConfirmAction("aprobar");
  }

  function handleRejectClick() {
    if (isBusy) return;
    if (requiresComentarioForAjustes(invoices, valorContableDrafts, comentario)) {
      toast.error("Debes registrar un comentario cuando ajustas el valor contable.");
      return;
    }
    if (!comentario.trim()) {
      toast.error("Indica el motivo del rechazo.");
      return;
    }
    setPendingDecision("rechazar");
    setConfirmAction("rechazar");
  }

  function handleDevolverClick() {
    if (isBusy) return;
    if (requiresComentarioForAjustes(invoices, valorContableDrafts, comentario)) {
      toast.error("Debes registrar un comentario cuando ajustas el valor contable.");
      return;
    }
    if (!comentario.trim()) {
      toast.error("Indica el motivo de la devolución.");
      return;
    }
    if (faseModal === "pendiente_aprobacion") {
      if (!destinoDevolucionGerencia) {
        toast.error("Selecciona el destino de la devolución.");
        return;
      }
      if (!responsableDestinoUserId) {
        toast.error("Selecciona el responsable del destino.");
        return;
      }
    }
    if (
      faseModal === "pendiente_eventos_dian" &&
      requiereContadorDevolucionEventosDian &&
      !devolverContadorUserId
    ) {
      toast.error("Selecciona el contador de Impuestos/Contabilidad.");
      return;
    }
    setPendingDecision("devolver");
    setConfirmAction("devolver");
  }

  function handleDownloadFormato() {
    const snapshot = detalle?.reembolso?.formatoSnapshot;
    if (!snapshot) {
      toast.error("Este reembolso no tiene formato generado.");
      return;
    }
    void downloadReembolsoFormatoPdf(snapshot);
  }

  const empresaNombre =
    detalle?.caja?.empresa_id !== undefined ? getEmpresaNombre(detalle.caja.empresa_id) : null;

  const decisionFase = faseModal !== "solo_lectura" ? (faseModal as DecisionFase) : null;

  const header =
    detalle === undefined || detalle === null ? null : (
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold leading-tight text-slate-950">
            {FASE_TITLE[fase]}
          </h2>
          <EstadoBadge kind="reembolso" estado={detalle.reembolso.estado} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">
            {detalle.caja?.nombre ?? "Caja Menor"}
          </span>
          {empresaNombre ? (
            <>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span>{empresaNombre}</span>
            </>
          ) : null}
          {detalle.reembolso.numeroReembolso ? (
            <>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span className="font-medium text-teal-700">{detalle.reembolso.numeroReembolso}</span>
            </>
          ) : null}
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <span>Custodio: {detalle.reembolso.custodioNombre}</span>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <span className="font-semibold tabular-nums text-slate-900">
            {confirmacionAjustes.incluyeAjustes
              ? `${formatCOP(confirmacionAjustes.valorAnterior)} → ${formatCOP(valorTotalEfectivo)}`
              : formatCOP(valorTotalEfectivo)}
          </span>
          {detalle.reembolso.formatoSnapshot ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-lg px-2 text-teal-700 hover:bg-teal-100/50"
              onClick={handleDownloadFormato}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              GFN-F006
            </Button>
          ) : null}
        </div>
      </div>
    );

  return (
    <>
      <ReembolsoWorkspaceShell
        open={Boolean(reembolso)}
        title={FASE_TITLE[fase]}
        description="Workspace de revisión de reembolso de caja menor"
        onOpenChange={onOpenChange}
        onRequestClose={requestClose}
        listCollapsed={listCollapsed}
        onToggleList={() => setListCollapsed((current) => !current)}
        mobileBlocked={isActionPhase}
        allowNarrowActions={isActionPhase}
        header={
          detalle === undefined ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Cargando detalle…
            </div>
          ) : detalle === null ? (
            <p className="text-sm text-slate-500">
              No se encontró el reembolso o no está disponible.
            </p>
          ) : (
            header
          )
        }
        list={
          <ReembolsoInvoiceNavigator
            invoices={invoices}
            activeKey={activeKey}
            onSelect={selectInvoice}
            onPrev={() => goRelative(-1)}
            onNext={() => goRelative(1)}
            compactOnNarrow={isActionPhase}
            valorContableDrafts={
              puedeEditarValorContable ? valorContableDrafts : undefined
            }
          />
        }
        viewer={
          detalle ? (
            <ReembolsoDocumentViewer
              invoice={activeInvoice}
              documentsLoading={adjuntosDataLoading}
              onFocusModeChange={setFocusMode}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <VisuallyHidden>
                <DialogTitle>Cargando</DialogTitle>
              </VisuallyHidden>
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
            </div>
          )
        }
        panel={
          detalle && isActionPhase && decisionFase && reembolsoId ? (
            <div
              className={
                puedeEditarValorContable
                  ? "min-h-min"
                  : "flex h-full min-h-0 flex-col"
              }
            >
              {puedeEditarValorContable ? (
                <ReembolsoValorContablePanel
                  invoice={activeInvoice}
                  draft={
                    activeInvoice
                      ? valorContableDrafts[activeInvoice.movimientoId]
                      : undefined
                  }
                  empresaId={detalle.caja?.empresa_id}
                  onDraftChange={(draft) => {
                    if (!activeInvoice) return;
                    setValorContableDrafts((current) => ({
                      ...current,
                      [activeInvoice.movimientoId]: draft,
                    }));
                  }}
                  onRestore={() => {
                    if (!activeInvoice) return;
                    setValorContableDrafts((current) => ({
                      ...current,
                      [activeInvoice.movimientoId]: undefined,
                    }));
                  }}
                />
              ) : null}
              <ReembolsoDecisionPanel
                key={reembolsoId}
                stacked={puedeEditarValorContable}
                fase={decisionFase}
                reembolsoId={reembolsoId}
                actor={actor}
                facturaCount={invoices.length}
                valorTotal={valorTotalEfectivo}
                timeline={detalle.timeline}
                comentario={comentario}
                onComentarioChange={setComentario}
                adjuntos={phaseAttachments}
                onAttachmentsBusyChange={setAttachmentsBusy}
                onViewAttachment={(attachmentId) => setOverlayAttachmentId(attachmentId)}
                busy={isBusy}
                onApprove={handleApproveClick}
                onReject={handleRejectClick}
                onDevolver={
                  decisionFase === "pendiente_revision_impuestos" ||
                  decisionFase === "pendiente_eventos_dian" ||
                  decisionFase === "pendiente_aprobacion"
                    ? handleDevolverClick
                    : undefined
                }
                onCancel={requestClose}
                esReenvioContabilidad={esReenvioContabilidad}
                contadores={contadores}
                contadorUserId={contadorUserId}
                onContadorChange={setContadorUserId}
                requiereContador={requiereContador}
                contadorPrevioNombre={contadorPrevioNombre}
                destinoDevolucionGerencia={destinoDevolucionGerencia || undefined}
                onDestinoDevolucionGerenciaChange={(destino) =>
                  setDestinoDevolucionGerencia(destino)
                }
                responsablesDestino={responsablesDestinoGerencia}
                responsablesLoading={responsablesDestinoGerenciaLoading}
                responsableDestinoUserId={responsableDestinoUserId || undefined}
                onResponsableDestinoChange={setResponsableDestinoUserId}
                responsableDestinoLabel={
                  destinoDevolucionGerencia === "contabilidad"
                    ? "Contador Impuestos/Contabilidad"
                    : destinoDevolucionGerencia === "eventos_dian"
                      ? "Responsable Eventos DIAN"
                      : destinoDevolucionGerencia === "revision"
                        ? "Revisor Caja Menor"
                        : undefined
                }
                destinoAprobacionRevision={destinoAprobacionRevision}
                onDestinoAprobacionRevisionChange={setDestinoAprobacionRevision}
                permiteReenvioDirectoGerencia={permiteReenvioDirectoGerencia}
                retornoGerenciaPendienteEn={retornoGerenciaPendienteEn}
                destinoAprobacionImpuestos={destinoAprobacionImpuestos}
                onDestinoAprobacionImpuestosChange={setDestinoAprobacionImpuestos}
                eventosDian={eventosDianUsuarios}
                eventosDianUserId={eventosDianUserId}
                onEventosDianChange={setEventosDianUserId}
                requiereEventosDian={requiereEventosDian}
                devolverContadorUserId={devolverContadorUserId}
                onDevolverContadorChange={setDevolverContadorUserId}
                requiereContadorDevolucion={requiereContadorDevolucionEventosDian}
                contadorPrevioNombreDevolucion={contadorPrevioNombreDevolucion}
                saltoFasesConsecutivas={saltoFasesConsecutivas}
                usaSaltoFases={usaSaltoFases}
                onUsaSaltoFasesChange={setUsaSaltoFases}
                causacionFacturaId={
                  activeInvoice?.facturaId
                    ? (activeInvoice.facturaId as Id<"facturacionFacturas">)
                    : undefined
                }
                causacionMovimientoId={
                  activeInvoice?.movimientoId
                    ? (activeInvoice.movimientoId as Id<"facturacionCajaMenorMovimientos">)
                    : undefined
                }
                causacionNumeroFactura={activeInvoice?.numeroFactura}
                causacionDraft={
                  activeInvoice
                    ? causacionByMovimientoId[activeInvoice.movimientoId]
                    : undefined
                }
                onCausacionDraftChange={(draft) => {
                  if (!activeInvoice) return;
                  setCausacionByMovimientoId((current) => ({
                    ...current,
                    [activeInvoice.movimientoId]: draft,
                  }));
                }}
                onCausacionDirtyChange={setCausacionDirty}
              />
            </div>
          ) : detalle ? (
            <ReembolsoReadonlyPanel
              facturaCount={invoices.length}
              valorTotal={detalle.reembolso.valorTotal}
              timeline={detalle.timeline}
              reembolsoId={reembolsoId}
              facturaId={
                activeInvoice?.facturaId
                  ? (activeInvoice.facturaId as Id<"facturacionFacturas">)
                  : undefined
              }
              movimientoId={
                activeInvoice?.movimientoId
                  ? (activeInvoice.movimientoId as Id<"facturacionCajaMenorMovimientos">)
                  : undefined
              }
              numeroFactura={activeInvoice?.numeroFactura}
              onClose={requestClose}
            />
          ) : (
            <div className="p-4 text-sm text-slate-500">Cargando…</div>
          )
        }
      />

      <ReembolsoAttachmentOverlay
        open={Boolean(overlayAttachmentId)}
        documents={overlayDocuments}
        initialDocumentId={overlayInitialId}
        onClose={() => setOverlayAttachmentId(null)}
      />

      <ReembolsoConfirmDialog
        open={Boolean(confirmAction)}
        action={confirmAction}
        faseDestino={
          decisionFase
            ? getFaseDestinoLabel(decisionFase, {
                esReenvioContabilidad,
                destinoAprobacionRevision,
                destinoAprobacionImpuestos,
                retornoGerenciaPendienteEn,
                permiteReenvioDirectoGerencia,
                usaSaltoFases,
                saltoFasesConsecutivas,
              })
            : undefined
        }
        devolverDestinoLabel={
          confirmAction === "devolver" && destinoDevolucionGerencia
            ? destinoDevolucionGerencia === "contabilidad"
              ? "Impuestos/Contabilidad"
              : destinoDevolucionGerencia === "eventos_dian"
                ? "Eventos DIAN"
                : "Revisor Caja Menor"
            : confirmAction === "devolver" && faseModal === "pendiente_eventos_dian"
              ? "Impuestos/Contabilidad"
              : undefined
        }
        responsableNombre={responsableDestinoNombre}
        facturaCount={invoices.length}
        valorTotal={valorTotalEfectivo}
        valorTotalAnterior={confirmacionAjustes.valorAnterior}
        facturasAjustadas={confirmacionAjustes.facturasAjustadas}
        incluyeAjustesContables={confirmacionAjustes.incluyeAjustes}
        comentario={comentario}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setPendingDecision(null);
          }
        }}
        onConfirm={() => {
          if (pendingDecision) {
            void executeDecision(pendingDecision);
          }
        }}
      />

      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar cambios</AlertDialogTitle>
            <AlertDialogDescription>
              Hay cambios sin guardar
              {hasAjustesValorContable ? ", incluidos ajustes contables," : ""}
              {causacionDirty ? ", incluida la causación de la factura activa," : ""}{" "}
              {comentario.trim() ? "y un comentario" : ""} sin enviar. Si continúas, se
              descartarán. Los archivos ya guardados permanecen en el reembolso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardConfirmOpen(false);
                setCausacionDirty(false);
                if (activeInvoice) {
                  setCausacionByMovimientoId((current) => ({
                    ...current,
                    [activeInvoice.movimientoId]: undefined,
                  }));
                }
                const pending = pendingNavigationRef.current;
                pendingNavigationRef.current = null;
                if (pending) {
                  pending();
                  return;
                }
                onOpenChange(false);
              }}
            >
              Descartar cambios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
