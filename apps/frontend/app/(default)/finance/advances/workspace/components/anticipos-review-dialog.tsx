"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  CornerUpLeft,
  ExternalLink,
  Loader2,
  Paperclip,
  ReceiptText,
  RotateCcw,
  Send,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useSession } from "@/hooks/useCurrentUser";
import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  DesembolsoAdjuntosDropzone,
  FileDropzone,
} from "../../dashboard/components/AnticipoActionDialog";
import { faseLabels, formatterCOP } from "../../dashboard/constants";
import type { AnticipoFase, AnticipoRow, UsuarioInfo } from "../../dashboard/types";
import {
  formatDate,
  getDefaultReturnTarget,
  getEstadoClass,
  normalizeFaseActual,
} from "../../dashboard/utils";
import { getValorContableAnticipo } from "../../lib/valor-contable-anticipo";

import { normalizeAnticipoDocuments } from "../anticipos-document-model";
import {
  applyReviewPlansToDrafts,
  buildEffectiveReviewPlans,
  buildReviewConfirmationGroups,
  getReviewValidationError,
  hasMixedReviewPhases,
  nextReviewPhaseLabel,
} from "../review-utils";
import type {
  AnticipoBatchResult,
  AnticipoReviewDecision,
  AnticipoReviewDraft,
  AnticipoReviewEditorMode,
  AnticipoReviewMode,
} from "../types";
import { resolveUserDisplayName } from "../workspace-utils";
import { AnticiposDocumentViewer } from "./anticipos-document-viewer";

export type ReviewDialogMode = AnticipoReviewMode;

type ReviewDialogProps = {
  open: boolean;
  items: AnticipoRow[];
  mode?: ReviewDialogMode;
  usersById: ReadonlyMap<string, UsuarioInfo>;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
};

type ContentPanel = "documents" | "detail" | "decision";

function createDraft(anticipo: AnticipoRow): AnticipoReviewDraft {
  return {
    anticipo,
    observedPhase: anticipo.faseActual,
    observation: "",
    accountingValue: getValorContableAnticipo(anticipo),
    files: [],
    status: "draft",
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DecisionButton({
  decision,
  active,
  onClick,
}: {
  decision: AnticipoReviewDecision;
  active: boolean;
  onClick: () => void;
}) {
  const approve = decision === "APROBADO";
  const Icon = approve ? Check : X;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600",
        active && approve && "border-emerald-600 bg-emerald-600 text-white",
        active && !approve && "border-rose-600 bg-rose-600 text-white",
        !active && "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {approve ? "Aprobar" : "Rechazar"}
    </button>
  );
}

function ReviewDetails({
  anticipo,
  phases,
  usersById,
}: {
  anticipo: AnticipoRow;
  phases: AnticipoFase[] | undefined;
  usersById: ReadonlyMap<string, UsuarioInfo>;
}) {
  const legalizations = anticipo.legalizacionesFacturacion ?? [];
  const accountingValue = getValorContableAnticipo(anticipo);
  const legalized = anticipo.saldoLegalizado ?? 0;
  const responsibleName = resolveUserDisplayName(
    anticipo.responsableUserId,
    usersById,
    anticipo.responsableNombre,
    "Sin responsable"
  );

  return (
    <div className="space-y-6 px-5 py-5 sm:px-6">
      <section aria-labelledby="review-summary-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="review-summary-title" className="text-base font-semibold text-slate-950">
              Detalle del anticipo
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Datos de la solicitud, legalizaciones e historial del flujo.
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn("rounded-full", getEstadoClass(anticipo.faseActual))}
          >
            {faseLabels[normalizeFaseActual(anticipo.faseActual)] ?? anticipo.faseActual}
          </Badge>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-4 border-y border-slate-200 py-4 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-slate-500">Tercero</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-900">
              {anticipo.razonSocial}
            </dd>
            <dd className="text-xs text-slate-500">NIT {anticipo.nit}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Valor solicitado</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
              {formatterCOP.format(anticipo.valorNumerico)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Valor contable</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
              {formatterCOP.format(accountingValue)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Responsable</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{responsibleName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Fecha máxima</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {formatDate(anticipo.maxLegalizacionDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Cobertura</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {anticipo.cubreFacturaCompleta === false ? "Cobertura parcial" : "Factura completa"}
            </dd>
          </div>
        </dl>
      </section>

      {anticipo.observaciones ? (
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ReceiptText className="h-4 w-4 text-slate-500" aria-hidden />
            Observaciones de la solicitud
          </h3>
          <p className="mt-2 max-w-[72ch] whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {anticipo.observaciones}
          </p>
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
            Legalización en Facturación
          </h3>
          <span className="text-xs font-medium tabular-nums text-slate-500">
            {formatterCOP.format(legalized)} de {formatterCOP.format(accountingValue)}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div
            className="h-full rounded-full bg-emerald-600 transition-[width] motion-reduce:transition-none"
            style={{
              width: `${accountingValue > 0 ? Math.min(100, (legalized / accountingValue) * 100) : 0}%`,
            }}
          />
        </div>
        {legalizations.length ? (
          <div className="mt-3 divide-y divide-slate-100 border-y border-slate-200">
            {legalizations.map((row) => (
              <a
                key={String(row._id)}
                href={`/billing/invoices/${row.facturaId}`}
                className="flex min-h-12 items-center gap-3 py-2 text-sm text-slate-700 hover:text-emerald-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <ReceiptText className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    Factura #{row.factura?.numeroFactura ?? row.facturaId}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {row.factura?.proveedorNombre ?? "Factura relacionada"}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatterCOP.format(row.valorAplicado)}
                </span>
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Los cruces se crean y modifican únicamente desde Facturación.
          </div>
        )}
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Clock3 className="h-4 w-4 text-slate-500" aria-hidden />
          Historial
        </h3>
        {phases === undefined ? (
          <div className="mt-3 space-y-2" aria-label="Cargando historial">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : (
          <ol className="mt-3 divide-y divide-slate-100 border-y border-slate-200">
            {phases.map((phase) => (
              <li key={String(phase._id)} className="flex gap-3 py-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {faseLabels[phase.fase] ?? phase.fase}
                    </p>
                    <span className="text-xs text-slate-500">{phase.estado}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {phase.asignadoA
                      ? `Asignado a ${resolveUserDisplayName(phase.asignadoA, usersById, null, faseLabels[phase.fase] ?? "Usuario no disponible")}`
                      : "Sin asignación"}
                    {phase.fechaInicio ? ` · ${formatDate(phase.fechaInicio)}` : ""}
                  </p>
                  {phase.observaciones ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                      {phase.observaciones}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export function AnticiposReviewDialog({
  open,
  items,
  mode = "review",
  usersById,
  onOpenChange,
  onComplete,
}: ReviewDialogProps) {
  const { data: session } = useSession();
  const convex = useConvex();
  const [drafts, setDrafts] = useState<Record<string, AnticipoReviewDraft>>({});
  const [activeId, setActiveId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [treasuryBusy, setTreasuryBusy] = useState(false);
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [contentPanel, setContentPanel] = useState<ContentPanel>("documents");
  const [editorMode, setEditorMode] = useState<AnticipoReviewEditorMode>("joint");
  const [jointDecision, setJointDecision] = useState<AnticipoReviewDecision>();
  const [jointObservation, setJointObservation] = useState("");
  const [individualDecision, setIndividualDecision] = useState<AnticipoReviewDecision>();
  const [individualObservation, setIndividualObservation] = useState("");

  const generateUploadUrl = useMutation(api.financiero.anticipos.generateUploadUrl);
  const approveBoss = useMutation(api.financiero.anticipos.aprobarJefeDirecto);
  const approveAccounting = useMutation(api.financiero.anticipos.aprobarContabilidad);
  const approveManagement = useMutation(api.financiero.anticipos.aprobarGerencia);
  const rejectAdvance = useMutation(api.financiero.anticipos.rechazarAnticipo);
  const registerDisbursement = useMutation(
    api.financiero.anticipos.registrarDesembolsoTesoreria
  );
  const returnAdvance = useMutation(api.financiero.anticipos.devolverAnticipo);
  const annulAdvance = useMutation(api.financiero.anticipos.anularAnticipo);

  const isBatch = items.length > 1;

  useEffect(() => {
    if (!open) return;
    setDrafts(Object.fromEntries(items.map((item) => [String(item._id), createDraft(item)])));
    setActiveId(items[0] ? String(items[0]._id) : "");
    setConfirmOpen(false);
    setContentPanel("documents");
    setEditorMode(items.length > 1 && !hasMixedReviewPhases(items) ? "joint" : "individual");
    setJointDecision(undefined);
    setJointObservation("");
    setIndividualDecision(undefined);
    setIndividualObservation("");
  }, [items, open]);

  const orderedDrafts = useMemo(
    () => items.map((item) => drafts[String(item._id)]).filter(Boolean),
    [drafts, items]
  );
  const samePhase = !hasMixedReviewPhases(orderedDrafts.map((draft) => draft.anticipo));
  const activeDraft = drafts[activeId] ?? orderedDrafts[0];
  const activeIdValue = activeDraft ? String(activeDraft.anticipo._id) : "";
  const activeAnticipo = activeDraft?.anticipo;
  const phases = useQuery(
    api.financiero.anticipos.obtenerFasesDeAnticipo,
    activeDraft ? { anticipoId: activeDraft.anticipo._id } : "skip"
  ) as AnticipoFase[] | undefined;
  const documents = useMemo(
    () => (activeAnticipo ? normalizeAnticipoDocuments(activeAnticipo, phases) : []),
    [activeAnticipo, phases]
  );

  useEffect(() => {
    if (!activeDraft || editorMode !== "individual" || !isBatch) return;
    setIndividualDecision(activeDraft.hasIndividualOverride ? activeDraft.decision : undefined);
    setIndividualObservation(activeDraft.hasIndividualOverride ? activeDraft.observation : "");
  }, [activeDraft, editorMode, isBatch]);

  useEffect(() => {
    if (!samePhase && editorMode === "joint") setEditorMode("individual");
  }, [editorMode, samePhase]);

  const plans = useMemo(
    () => buildEffectiveReviewPlans(orderedDrafts, jointDecision, jointObservation),
    [jointDecision, jointObservation, orderedDrafts]
  );
  const effectiveDrafts = useMemo(
    () => (mode === "review" ? applyReviewPlansToDrafts(orderedDrafts, plans) : orderedDrafts),
    [mode, orderedDrafts, plans]
  );
  const planById = useMemo(() => new Map(plans.map((plan) => [plan.anticipoId, plan])), [plans]);
  const confirmationGroups = useMemo(
    () => buildReviewConfirmationGroups(effectiveDrafts, mode),
    [effectiveDrafts, mode]
  );

  function updateDraft(id: string, patch: Partial<AnticipoReviewDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id]!,
        ...patch,
        status: patch.status ?? "draft",
        error: patch.status === "error" ? patch.error : undefined,
      },
    }));
  }

  function saveIndividualOverride() {
    if (!individualDecision) {
      toast.error(`Define la decisión del anticipo #${activeDraft.anticipo.consecutivo}.`);
      return;
    }
    if (individualDecision === "RECHAZADO" && !individualObservation.trim()) {
      toast.error(`Registra el motivo del anticipo #${activeDraft.anticipo.consecutivo}.`);
      return;
    }
    updateDraft(activeIdValue, {
      decision: individualDecision,
      observation: individualObservation,
      hasIndividualOverride: true,
    });
    if (samePhase) {
      setEditorMode("joint");
      return;
    }
    const currentIndex = orderedDrafts.findIndex(
      (draft) => String(draft.anticipo._id) === activeIdValue
    );
    const next = orderedDrafts
      .slice(currentIndex + 1)
      .find((draft) => !draft.hasIndividualOverride);
    if (next) setActiveId(String(next.anticipo._id));
  }

  function removeIndividualOverride() {
    updateDraft(activeIdValue, {
      decision: undefined,
      observation: "",
      hasIndividualOverride: false,
    });
    setIndividualDecision(undefined);
    setIndividualObservation("");
  }

  function validationError() {
    return getReviewValidationError(effectiveDrafts, mode);
  }

  function requestConfirmation() {
    const error = validationError();
    if (error) {
      toast.error(error);
      return;
    }
    setConfirmOpen(true);
  }

  async function uploadFiles(files: File[]) {
    const uploaded: Array<{ storageId: Id<"_storage">; nombre: string }> = [];
    for (const file of files) {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error(`No se pudo subir ${file.name}`);
      const data = (await response.json()) as { storageId?: Id<"_storage"> };
      if (!data.storageId) throw new Error(`No se recibió storageId para ${file.name}`);
      uploaded.push({ storageId: data.storageId, nombre: file.name });
    }
    return uploaded;
  }

  async function executeDraft(draft: AnticipoReviewDraft) {
    const userId = session?.user?.id;
    if (!userId) throw new Error("Debes iniciar sesión para continuar.");
    const attachments = draft.files.length ? await uploadFiles(draft.files) : undefined;
    const observation = draft.observation.trim() || undefined;

    if (mode === "readonly") return;
    if (mode === "desembolso") {
      await registerDisbursement({
        anticipoId: draft.anticipo._id,
        tesoreroUserId: userId,
        observaciones: observation,
      });
      return;
    }
    if (mode === "devolver") {
      const target = getDefaultReturnTarget(
        draft.anticipo.faseActual,
        draft.anticipo.responsableOrigen,
        draft.anticipo.cubreFacturaCompleta,
        draft.anticipo.tipoBolsa
      );
      if (!target) throw new Error("Esta fase no tiene una devolución disponible.");
      await returnAdvance({
        anticipoId: draft.anticipo._id,
        actorUserId: userId,
        faseDestino: target,
        motivo: draft.observation.trim(),
        adjuntos: attachments,
      });
      return;
    }
    if (mode === "anular") {
      await annulAdvance({
        anticipoId: draft.anticipo._id,
        anuladoPorUserId: userId,
        motivo: draft.observation.trim(),
        adjuntos: attachments,
      });
      return;
    }
    if (draft.decision === "RECHAZADO") {
      await rejectAdvance({
        anticipoId: draft.anticipo._id,
        rechazadoPorUserId: userId,
        motivo: draft.observation.trim(),
        adjuntos: attachments,
      });
      return;
    }
    if (draft.anticipo.faseActual === "II_APROBACION_JEFE_DIRECTO") {
      await approveBoss({
        anticipoId: draft.anticipo._id,
        jefeDirectoUserId: userId,
        decision: "APROBADO",
        observaciones: observation,
        adjuntos: attachments,
      });
      return;
    }
    if (draft.anticipo.faseActual === "III_REVISION_CONTABILIDAD") {
      const current = getValorContableAnticipo(draft.anticipo);
      await approveAccounting({
        anticipoId: draft.anticipo._id,
        contadorUserId: userId,
        decision: "APROBADO",
        observaciones: observation,
        adjuntos: attachments,
        ...(draft.accountingValue !== current ? { valorContableNuevo: draft.accountingValue } : {}),
      });
      return;
    }
    if (draft.anticipo.faseActual === "IV_APROBACION_GERENCIA") {
      await approveManagement({
        anticipoId: draft.anticipo._id,
        gerenteUserId: userId,
        decision: "APROBADO",
        observaciones: observation,
        adjuntos: attachments,
      });
      return;
    }
    throw new Error("La fase cambió y ya no admite esta decisión.");
  }

  async function submit() {
    setSubmitting(true);
    const results: AnticipoBatchResult[] = [];
    for (const draft of effectiveDrafts) {
      if (draft.status === "success") continue;
      const id = String(draft.anticipo._id);
      updateDraft(id, { status: "submitting" });
      try {
        await executeDraft(draft);
        setDrafts((current) => ({
          ...current,
          [id]: { ...current[id]!, status: "success", error: undefined },
        }));
        results.push({ anticipoId: id, status: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo procesar.";
        const latest = await convex
          .query(api.financiero.anticipos.obtenerAnticipoPorId, { id: draft.anticipo._id })
          .catch(() => null);
        const phaseChanged = Boolean(latest && latest.faseActual !== draft.observedPhase);
        setDrafts((current) => ({
          ...current,
          [id]: {
            ...current[id]!,
            ...(latest
              ? {
                  anticipo: { ...current[id]!.anticipo, ...latest },
                  observedPhase: latest.faseActual,
                }
              : {}),
            status: "error",
            error: phaseChanged
              ? `${message} La fase cambió a ${faseLabels[latest!.faseActual] ?? latest!.faseActual}; revisa la decisión antes de reintentar.`
              : message,
          },
        }));
        results.push({ anticipoId: id, status: "error", error: message });
      }
    }
    setSubmitting(false);
    const failures = results.filter((result) => result.status === "error");
    if (failures.length) {
      toast.error(
        `${results.length - failures.length} decisiones completadas; ${failures.length} requieren revisión.`
      );
      if (failures[0]) setActiveId(failures[0].anticipoId);
      onComplete();
      return;
    }
    toast.success(
      items.length === 1 ? "Anticipo actualizado" : `${items.length} anticipos actualizados`
    );
    onComplete();
    onOpenChange(false);
  }

  if (!activeDraft) return null;
  const activePlan = planById.get(activeIdValue);
  const effectiveActiveDecision = activePlan?.decision;
  const editorDecision =
    mode !== "review"
      ? activeDraft.decision
      : isBatch && editorMode === "individual"
        ? individualDecision
        : isBatch
          ? jointDecision
          : effectiveActiveDecision;
  const activeObservation =
    mode !== "review"
      ? activeDraft.observation
      : isBatch && editorMode === "individual"
        ? individualObservation
        : isBatch
          ? jointObservation
          : activeDraft.observation;
  const activeAccounting = activeDraft.anticipo.faseActual === "III_REVISION_CONTABILIDAD";
  const modeTitle =
    mode === "desembolso"
      ? "Registrar desembolso"
      : mode === "devolver"
        ? "Devolver anticipo"
        : mode === "anular"
          ? "Anular anticipo"
          : mode === "readonly"
            ? "Consultar anticipo"
            : isBatch
              ? "Revisar anticipos"
              : "Revisar anticipo";

  function setReviewDecision(decision: AnticipoReviewDecision) {
    if (!isBatch) {
      updateDraft(activeIdValue, { decision, hasIndividualOverride: true });
    } else if (editorMode === "individual") {
      setIndividualDecision(decision);
    } else {
      setJointDecision(decision);
    }
  }

  function setReviewObservation(value: string) {
    if (!isBatch) {
      updateDraft(activeIdValue, { observation: value, hasIndividualOverride: true });
    } else if (editorMode === "individual") {
      setIndividualObservation(value);
    } else {
      setJointObservation(value);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!submitting && !treasuryBusy) onOpenChange(next);
        }}
      >
        <DialogContent className="flex h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 grid-rows-none sm:h-[92vh] sm:w-[calc(100vw-2rem)] sm:max-w-[1500px] sm:rounded-xl">
          <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4 pr-12 sm:px-6">
            <DialogTitle className="text-lg font-semibold text-slate-950">{modeTitle}</DialogTitle>
            <DialogDescription>
              Anticipo #{activeDraft.anticipo.consecutivo} · {activeDraft.anticipo.razonSocial}
              {isBatch && !samePhase ? " · las fases mixtas requieren decisiones individuales" : ""}
            </DialogDescription>
            {isBatch ? (
              <label className="mt-2 block text-left lg:hidden">
                <span className="sr-only">Anticipo activo</span>
                <select
                  value={activeIdValue}
                  onChange={(event) => setActiveId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
                >
                  {orderedDrafts.map((draft) => (
                    <option key={String(draft.anticipo._id)} value={String(draft.anticipo._id)}>
                      #{draft.anticipo.consecutivo} · {draft.anticipo.razonSocial}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div
              className={cn(
                "mt-2 grid rounded-lg bg-slate-100 p-1 lg:hidden",
                mode === "readonly" ? "grid-cols-2" : "grid-cols-3"
              )}
              role="tablist"
              aria-label="Contenido del diálogo"
            >
              {[
                { value: "documents", label: "Soportes" },
                { value: "detail", label: "Detalle" },
                ...(mode === "readonly" ? [] : [{ value: "decision", label: "Decisión" }]),
              ].map((panel) => (
                <button
                  key={panel.value}
                  type="button"
                  role="tab"
                  aria-selected={contentPanel === panel.value}
                  onClick={() => setContentPanel(panel.value as ContentPanel)}
                  className={cn(
                    "min-h-9 rounded-md px-2 text-xs font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600",
                    contentPanel === panel.value
                      ? "bg-white text-slate-950 shadow-xs"
                      : "text-slate-600"
                  )}
                >
                  {panel.label}
                </button>
              ))}
            </div>
          </DialogHeader>

          <div
            className={cn(
              "grid min-h-0 flex-1 shrink overflow-hidden",
              isBatch
                ? "lg:grid-cols-[250px_minmax(0,1fr)_370px]"
                : mode === "readonly"
                  ? "lg:grid-cols-[minmax(0,1fr)]"
                  : "lg:grid-cols-[minmax(0,1fr)_370px]"
            )}
          >
            {isBatch ? (
              <aside className="hidden min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-50 lg:block">
                <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-700">Anticipos seleccionados</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {plans.filter((plan) => plan.decision).length} de {plans.length} con decisión
                  </p>
                </div>
                <div className="divide-y divide-slate-200">
                  {orderedDrafts.map((draft) => {
                    const id = String(draft.anticipo._id);
                    const plan = planById.get(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setActiveId(id)}
                        className={cn(
                          "w-full border-l-2 px-4 py-3 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600",
                          id === activeIdValue
                            ? "border-l-emerald-600 bg-white"
                            : "border-l-transparent hover:bg-white/70"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            #{draft.anticipo.consecutivo}
                          </span>
                          {draft.status === "success" ? (
                            <CheckCircle2
                              className="h-4 w-4 text-emerald-600"
                              aria-label="Procesado"
                            />
                          ) : draft.status === "error" ? (
                            <AlertTriangle className="h-4 w-4 text-rose-600" aria-label="Falló" />
                          ) : plan?.decision === "APROBADO" ? (
                            <Check className="h-4 w-4 text-emerald-600" aria-label="Aprobar" />
                          ) : plan?.decision === "RECHAZADO" ? (
                            <X className="h-4 w-4 text-rose-600" aria-label="Rechazar" />
                          ) : (
                            <span
                              className="h-2 w-2 rounded-full bg-slate-300"
                              aria-label="Pendiente"
                            />
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-600">
                          {draft.anticipo.razonSocial}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="truncate">
                            {faseLabels[draft.anticipo.faseActual] ?? draft.anticipo.faseActual}
                          </span>
                          {plan?.decision ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-5 rounded-full px-1.5 text-[9px]",
                                plan.source === "individual"
                                  ? "border-blue-200 bg-blue-50 text-blue-700"
                                  : "border-slate-200 bg-white text-slate-600"
                              )}
                            >
                              {plan.source === "individual" ? "Individual" : "Conjunta"}
                            </Badge>
                          ) : null}
                        </div>
                        {draft.error ? (
                          <p className="mt-2 text-xs leading-4 text-rose-700">{draft.error}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </aside>
            ) : null}

            <main
              className={cn(
                "min-h-0 overflow-hidden border-r border-slate-200",
                contentPanel === "decision" && "hidden lg:block"
              )}
            >
              <div className="flex h-full min-h-0 flex-col">
                <div
                  className="hidden shrink-0 border-b border-slate-200 bg-white px-3 py-2 lg:flex"
                  role="tablist"
                  aria-label="Información del anticipo"
                >
                  {[
                    { value: "documents", label: "Soportes" },
                    { value: "detail", label: "Detalle, legalizaciones e historial" },
                  ].map((panel) => (
                    <button
                      key={panel.value}
                      type="button"
                      role="tab"
                      aria-selected={contentPanel === panel.value}
                      onClick={() => setContentPanel(panel.value as ContentPanel)}
                      className={cn(
                        "min-h-9 rounded-lg px-3 text-xs font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600",
                        contentPanel === panel.value
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {panel.label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  {contentPanel === "detail" ? (
                    <div className="h-full overflow-y-auto">
                      <ReviewDetails
                        anticipo={activeDraft.anticipo}
                        phases={phases}
                        usersById={usersById}
                      />
                    </div>
                  ) : (
                    <AnticiposDocumentViewer
                      key={activeIdValue}
                      documents={documents}
                      loading={phases === undefined}
                    />
                  )}
                </div>
              </div>
            </main>

            {mode !== "readonly" ? (
              <aside
                className={cn(
                  "min-h-0 overflow-y-auto bg-slate-50 px-5 py-5 sm:px-6",
                  contentPanel !== "decision" && "hidden lg:block"
                )}
              >
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      Anticipo #{activeDraft.anticipo.consecutivo}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {faseLabels[activeDraft.anticipo.faseActual] ??
                        activeDraft.anticipo.faseActual}
                    </p>
                  </div>

                  {mode === "review" && isBatch ? (
                    <div
                      className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1"
                      role="group"
                      aria-label="Modo de decisión"
                    >
                      <button
                        type="button"
                        disabled={!samePhase}
                        onClick={() => setEditorMode("joint")}
                        className={cn(
                          "min-h-9 rounded-lg px-3 text-xs font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-45",
                          editorMode === "joint" && "bg-slate-900 text-white"
                        )}
                      >
                        Conjunta
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditorMode("individual")}
                        className={cn(
                          "min-h-9 rounded-lg px-3 text-xs font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600",
                          editorMode === "individual" && "bg-slate-900 text-white"
                        )}
                      >
                        Individual
                      </button>
                    </div>
                  ) : null}

                  {mode === "review" ? (
                    <section>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-slate-700">Decisión</label>
                        {isBatch ? (
                          <span className="text-[11px] text-slate-500">
                            {editorMode === "joint"
                              ? "Respaldo del lote"
                              : `Solo #${activeDraft.anticipo.consecutivo}`}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <DecisionButton
                          decision="APROBADO"
                          active={editorDecision === "APROBADO"}
                          onClick={() => setReviewDecision("APROBADO")}
                        />
                        <DecisionButton
                          decision="RECHAZADO"
                          active={editorDecision === "RECHAZADO"}
                          onClick={() => setReviewDecision("RECHAZADO")}
                        />
                      </div>
                    </section>
                  ) : null}

                  {mode === "devolver" ? (
                    <div className="rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-900">
                      <div className="flex items-center gap-2 font-semibold">
                        <CornerUpLeft className="h-4 w-4" />
                        Devolver a
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span>{faseLabels[activeDraft.anticipo.faseActual]}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                        <span className="font-semibold">
                          {faseLabels[
                            getDefaultReturnTarget(
                              activeDraft.anticipo.faseActual,
                              activeDraft.anticipo.responsableOrigen,
                              activeDraft.anticipo.cubreFacturaCompleta,
                              activeDraft.anticipo.tipoBolsa
                            ) ?? ""
                          ] ?? "Sin destino disponible"}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <section>
                    <label
                      htmlFor="review-observation"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {editorDecision === "RECHAZADO" || mode === "devolver" || mode === "anular"
                        ? "Motivo"
                        : "Observaciones"}
                    </label>
                    <Textarea
                      id="review-observation"
                      value={mode === "review" ? activeObservation : activeDraft.observation}
                      onChange={(event) =>
                        mode === "review"
                          ? setReviewObservation(event.target.value)
                          : updateDraft(activeIdValue, { observation: event.target.value })
                      }
                      placeholder={
                        editorDecision === "RECHAZADO" || mode === "devolver" || mode === "anular"
                          ? "Describe el motivo para dejar trazabilidad."
                          : "Comentario opcional para el historial."
                      }
                      className="mt-2 min-h-24 resize-y bg-white"
                      disabled={submitting || activeDraft.status === "success"}
                    />
                  </section>

                  {mode === "review" && isBatch && editorMode === "individual" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={saveIndividualOverride}>
                        Guardar acción individual
                      </Button>
                      {activeDraft.hasIndividualOverride ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2 text-slate-600"
                          onClick={removeIndividualOverride}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Quitar sobrescritura
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {mode === "review" &&
                  activeAccounting &&
                  effectiveActiveDecision !== "RECHAZADO" ? (
                    <section>
                      <label
                        htmlFor="review-accounting-value"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Valor contable de este anticipo
                      </label>
                      <div className="relative mt-2">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                          $
                        </span>
                        <Input
                          id="review-accounting-value"
                          inputMode="numeric"
                          value={String(activeDraft.accountingValue ?? 0)}
                          onChange={(event) => {
                            const value = Number(event.target.value.replace(/\D/g, ""));
                            updateDraft(activeIdValue, {
                              accountingValue: Number.isFinite(value) ? value : 0,
                            });
                          }}
                          className="h-11 bg-white pl-7 tabular-nums"
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">
                        Solicitado: {formatterCOP.format(activeDraft.anticipo.valorNumerico)}
                      </p>
                    </section>
                  ) : null}

                  <section>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <Paperclip className="h-3.5 w-3.5" aria-hidden />
                      Soportes de este anticipo
                    </p>
                    {mode === "desembolso" ? (
                      <DesembolsoAdjuntosDropzone
                        anticipoId={activeDraft.anticipo._id}
                        disabled={submitting}
                        onBusyChange={setTreasuryBusy}
                        onLoadingChange={setTreasuryLoading}
                      />
                    ) : (
                      <FileDropzone
                        files={activeDraft.files}
                        onFilesChange={(files) => updateDraft(activeIdValue, { files })}
                        disabled={submitting || activeDraft.status === "success"}
                      />
                    )}
                    {activeDraft.files.length ? (
                      <p className="mt-2 text-xs text-slate-500">
                        {activeDraft.files.length} archivo(s) ·{" "}
                        {formatFileSize(
                          activeDraft.files.reduce((sum, file) => sum + file.size, 0)
                        )}
                      </p>
                    ) : null}
                  </section>

                  {activeDraft.error ? (
                    <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{activeDraft.error}</span>
                      </div>
                    </div>
                  ) : null}

                  {mode === "review" && editorDecision ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">Efecto de la decisión</p>
                      <p className="mt-1 text-xs leading-5">
                        {editorDecision === "RECHAZADO"
                          ? "El anticipo quedará cerrado como rechazado."
                          : `El anticipo avanzará a ${nextReviewPhaseLabel(activeDraft.anticipo)}.`}
                      </p>
                    </div>
                  ) : null}
                </div>
              </aside>
            ) : null}
          </div>

          <footer className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="text-xs text-slate-500">
              {mode === "readonly"
                ? "La legalización se modifica únicamente desde Facturación."
                : mode === "review"
                  ? `${plans.filter((plan) => plan.decision === "APROBADO").length} aprobaciones · ${plans.filter((plan) => plan.decision === "RECHAZADO").length} rechazos`
                  : "La acción se aplicará únicamente a este anticipo."}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting || treasuryBusy}
              >
                {mode === "readonly" ? "Cerrar" : "Cancelar"}
              </Button>
              {mode !== "readonly" ? (
                <Button
                  type="button"
                  onClick={requestConfirmation}
                  disabled={submitting || treasuryBusy || treasuryLoading}
                  className={cn(
                    "min-w-36 gap-2",
                    mode === "anular" && "bg-rose-600 hover:bg-rose-700",
                    mode === "devolver" && "bg-orange-600 hover:bg-orange-700"
                  )}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Revisar y confirmar
                </Button>
              ) : null}
            </div>
          </footer>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {mode === "anular" ? (
                <Ban className="h-5 w-5 text-rose-600" />
              ) : mode === "devolver" ? (
                <RotateCcw className="h-5 w-5 text-orange-600" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              )}
              Confirmar acciones
            </AlertDialogTitle>
            <AlertDialogDescription>
              Las decisiones se procesarán una por una. Los errores no revertirán las acciones ya
              completadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {confirmationGroups.map((group) => (
              <div
                key={group.key}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{group.action}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Siguiente: {group.nextPhase}</p>
                  </div>
                  <Badge variant="outline" className="rounded-full bg-white">
                    {group.count}
                  </Badge>
                </div>
                <p className="mt-2 text-sm font-semibold tabular-nums text-slate-700">
                  {formatterCOP.format(group.amount)}
                </p>
              </div>
            ))}
          </div>
          <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto border-y border-slate-200">
            {effectiveDrafts
              .filter((draft) => draft.status !== "success")
              .map((draft) => (
                <div
                  key={String(draft.anticipo._id)}
                  className="flex items-center gap-3 py-3 text-sm"
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      draft.decision === "RECHAZADO" || mode === "anular"
                        ? "bg-rose-50 text-rose-700"
                        : mode === "devolver"
                          ? "bg-orange-50 text-orange-700"
                          : "bg-emerald-50 text-emerald-700"
                    )}
                  >
                    {draft.decision === "RECHAZADO" || mode === "anular" ? (
                      <XCircle className="h-4 w-4" />
                    ) : mode === "devolver" ? (
                      <CornerUpLeft className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">
                      #{draft.anticipo.consecutivo} · {draft.anticipo.razonSocial}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {mode === "review"
                        ? draft.decision === "RECHAZADO"
                          ? "Rechazar y cerrar"
                          : `Aprobar → ${nextReviewPhaseLabel(draft.anticipo)}`
                        : modeTitle}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                    {formatterCOP.format(getValorContableAnticipo(draft.anticipo))}
                  </span>
                </div>
              ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                setConfirmOpen(false);
                void submit();
              }}
              className={cn(
                mode === "anular" && "bg-rose-600 hover:bg-rose-700",
                mode === "devolver" && "bg-orange-600 hover:bg-orange-700"
              )}
            >
              Ejecutar acciones
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
