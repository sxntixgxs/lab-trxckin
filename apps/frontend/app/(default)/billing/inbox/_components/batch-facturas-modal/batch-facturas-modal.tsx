import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { BuzonTarea } from "../../../components/buzon-row";
import type { FacturacionUsuario } from "../../../hooks/use-facturacion-users";
import { resolveActiveAsignacion } from "../../../lib/active-asignacion";
import { EmpresaBadge } from "../../../lib/empresa-ui";
import { formatCurrency } from "../../../lib/utils";
import { normalizeNotaCreditoRelacion } from "../../../lib/nota-credito-relacion";
import { getFacturacionErrorMessage } from "../../../lib/user-facing-error";
import {
  getValorContable,
  getValorContableNuevoParaAccion,
  shouldPersistValorContableBeforeOpenCruce,
} from "../../../lib/valor-contable";
import { computeValorAPagarEstimado } from "../../../lib/valor-a-pagar";
import {
  explainTesoreriaBatchJointConflict,
  getPagosMonetariosAplicados,
} from "../../../lib/tesoreria-action-utils";
import { getActiveStage, STAGE_LABELS, type WorkflowAction } from "../../../lib/workflow-config";
import { getTaskKey } from "../helpers";
import { getLiderProcesoSnapshot, toUsuarioAsignacion } from "../shared";
import type { Actor } from "../types";
import { BatchActionPanel } from "./batch-action-panel";
import { BatchSelectionSidebar } from "./batch-selection-sidebar";
import { ConfirmActionsDialog } from "./confirm-actions-dialog";
import { FacturaReviewContent } from "./factura-review-content";
import { buildCajaMenorObservation, getDefaultCajaMenorDraft } from "./caja-menor-utils";
import {
  getDefaultPagoParcialDraft,
  getValorBasePagoTesoreria,
  MAX_PAGO_PARCIAL_FILE_BYTES,
  sumPagosParciales,
} from "./pago-parcial-utils";
import {
  createEmptyPhaseAssignment,
  getGerenciaPhaseAssignmentActionIfAllowed,
  type GerenciaPhasePools,
} from "./assign-phase-user-utils";
import type {
  BatchActionDraft,
  BatchMode,
  BatchPlan,
  CajaMenorMovementDraft,
  CausacionActionDraft,
  PagoParcialDraft,
  PhaseAssignmentDraft,
} from "./types";
import {
  getAvailableActionsForTask,
  getBatchPrimaryAction,
  getCommonEmpresa,
  getCommonStage,
  getGerenciaPeersForTask,
  getJefeDirectoAutoForTask,
  getSkipResultadoEsperado,
  isLegalizeFromAccountingSkip,
  getPrimaryActionForTask,
  getSelectedAssigneeForTask,
  getValorContablePayloadForPlan,
  validatePlan,
} from "./workflow-plan-utils";

type SpecialFlagKind = "anticipo" | "caja_menor";

type UnmarkTarget = {
  tarea: BuzonTarea;
  kind: SpecialFlagKind;
};

export function BatchFacturasModal({
  open,
  tareas,
  variant = "batch",
  actor,
  adjuntosActor,
  usuarios,
  usuariosById,
  lideres,
  lideresPorEmpresa,
  contadoresPorEmpresa,
  eventosDianPorEmpresa,
  analistasCausacionPorEmpresa,
  rechazosDianPorEmpresa,
  gerenciasPorEmpresa = {},
  recepcionPorEmpresa = {},
  tesoreriaPorEmpresa = {},
  onOpenChange,
  onRemove,
  onOpenLegalizacionAnticipo,
  onDone,
  canDeleteFactura = false,
}: {
  open: boolean;
  tareas: BuzonTarea[];
  variant?: "batch" | "single";
  actor: Actor;
  adjuntosActor: {
    userId?: string;
    nombre: string;
    email: string;
  };
  usuarios: FacturacionUsuario[];
  usuariosById: Map<string, FacturacionUsuario>;
  lideres: FacturacionUsuario[];
  lideresPorEmpresa?: Record<number, FacturacionUsuario[]>;
  contadoresPorEmpresa: Record<number, FacturacionUsuario[]>;
  eventosDianPorEmpresa: Record<number, FacturacionUsuario[]>;
  analistasCausacionPorEmpresa: Record<number, FacturacionUsuario[]>;
  rechazosDianPorEmpresa: Record<number, FacturacionUsuario[]>;
  gerenciasPorEmpresa?: Record<number, FacturacionUsuario[]>;
  recepcionPorEmpresa?: Record<number, FacturacionUsuario[]>;
  tesoreriaPorEmpresa?: Record<number, FacturacionUsuario[]>;
  onOpenChange: (open: boolean) => void;
  onRemove: (tarea: BuzonTarea) => void;
  onOpenLegalizacionAnticipo: (tarea: BuzonTarea) => void;
  onDone: () => void;
  canDeleteFactura?: boolean;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mode, setMode] = useState<BatchMode>("joint");
  const [comment, setComment] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<WorkflowAction | null>(null);
  const [pendingByKey, setPendingByKey] = useState<Record<string, BatchActionDraft>>({});
  const [causacionByFacturaId, setCausacionByFacturaId] = useState<
    Record<string, CausacionActionDraft | undefined>
  >({});
  const [individualAction, setIndividualAction] = useState<WorkflowAction | null>(null);
  const [individualComment, setIndividualComment] = useState("");
  const [individualSelectedIds, setIndividualSelectedIds] = useState<string[]>([]);
  const [cajaMenorDraft, setCajaMenorDraft] = useState<CajaMenorMovementDraft>(
    getDefaultCajaMenorDraft(null)
  );
  const [cajaMenorNamesById, setCajaMenorNamesById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [confirmBatchAction, setConfirmBatchAction] = useState<WorkflowAction | null>(null);
  const [individualValorContable, setIndividualValorContable] = useState<number | null>(null);
  const [pagoParcialDraft, setPagoParcialDraft] = useState<PagoParcialDraft>(
    getDefaultPagoParcialDraft()
  );
  const [individualPagoParcialDraft, setIndividualPagoParcialDraft] = useState<PagoParcialDraft>(
    getDefaultPagoParcialDraft()
  );
  const [jointPhaseAssignment, setJointPhaseAssignment] = useState<PhaseAssignmentDraft>(
    createEmptyPhaseAssignment()
  );
  const [individualPhaseAssignment, setIndividualPhaseAssignment] = useState<PhaseAssignmentDraft>(
    createEmptyPhaseAssignment()
  );
  const [uploadingPagoParcial, setUploadingPagoParcial] = useState(false);
  const [savingCruce, setSavingCruce] = useState(false);
  const [unmarkTarget, setUnmarkTarget] = useState<UnmarkTarget | null>(null);
  const [unmarkingSpecialFlag, setUnmarkingSpecialFlag] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deletingFactura, setDeletingFactura] = useState(false);
  const deleteConfirmInputRef = useRef<HTMLInputElement | null>(null);
  const [causacionDirty, setCausacionDirty] = useState(false);
  const [causacionDiscardOpen, setCausacionDiscardOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const valorContableEditorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCausacionDirty(false);
  }, [activeKey]);

  const asignarLideres = useMutation(api.facturacionTareas.asignarLideres);
  const completarRevisionLider = useMutation(api.facturacionTareas.completarRevisionLider);
  const asignarJefeDirecto = useMutation(api.facturacionTareas.asignarJefeDirecto);
  const completarJefeDirecto = useMutation(api.facturacionTareas.completarJefeDirecto);
  const completarCausacion = useMutation(api.facturacionTareas.completarCausacion);
  const reenviarAImpuestos = useMutation(api.facturacionTareas.reenviarAImpuestos);
  const completarRevisionImpuestos = useMutation(api.facturacionTareas.completarRevisionImpuestos);
  const enviarContadorAGerencia = useMutation(api.facturacionTareas.enviarContadorAGerencia);
  const completarEventosDian = useMutation(api.facturacionTareas.completarEventosDian);
  const avanzarFasesContablesConsecutivas = useMutation(
    api.facturacionTareas.avanzarFasesContablesConsecutivas
  );
  const aprobarGerencia = useMutation(api.facturacionTareas.aprobarGerencia);
  const registrarPagoAsignacion = useMutation(api.facturacionTareas.registrarPagoAsignacion);
  const registrarPagoParcialAsignacion = useMutation(
    api.facturacionTareas.registrarPagoParcialAsignacion
  );
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);
  const devolverAFase = useMutation(api.facturacionTareas.devolverAFase);
  const solicitarRechazoDianAsignacion = useMutation(
    api.facturacionTareas.solicitarRechazoDianAsignacion
  );
  const confirmarRechazoDianAsignacion = useMutation(
    api.facturacionTareas.confirmarRechazoDianAsignacion
  );
  const cerrarNotaCreditoAsignacion = useMutation(
    api.facturacionTareas.cerrarNotaCreditoAsignacion
  );
  const cerrarFacturaRecepcionAsignacion = useMutation(
    api.facturacionTareas.cerrarFacturaRecepcionAsignacion
  );
  const marcarEsLegalizacionAnticipo = useMutation(
    api.facturacionTareas.marcarEsLegalizacionAnticipo
  );
  const marcarEsLegalizacionCajaMenor = useMutation(
    api.facturacionTareas.marcarEsLegalizacionCajaMenor
  );
  const legalizarCajaMenorFactura = useMutation(api.facturacionTareas.legalizarCajaMenorFactura);
  const guardarValorContableFactura = useMutation(
    api.facturacionTareas.guardarValorContableFactura
  );
  const asignarOtroLider = useMutation(api.facturacionTareas.asignarOtroLider);
  const asignarPar = useMutation(api.facturacionTareas.asignarPar);
  const eliminarFacturaCompleta = useMutation(api.facturacionTareas.eliminarFacturaCompleta);

  const selectedActiveTarea =
    tareas.find((tarea) => getTaskKey(tarea) === activeKey) ?? tareas[0] ?? null;
  const data = useQuery(
    api.facturacionFacturas.getWithTarea,
    open && selectedActiveTarea?.facturaId ? { id: selectedActiveTarea.facturaId } : "skip"
  );
  const activeTarea = useMemo<BuzonTarea | null>(() => {
    if (!selectedActiveTarea || !data?.factura || !data.tarea) {
      return selectedActiveTarea;
    }
    const asignaciones: Doc<"facturacionAsignaciones">[] = data.asignaciones ?? [];
    const currentAsignacion = resolveActiveAsignacion({
      asignaciones,
      tarea: data.tarea,
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
      fallback: selectedActiveTarea.asignacion ?? null,
    });

    return {
      ...selectedActiveTarea,
      ...data.tarea,
      tareaIdReal: selectedActiveTarea.tareaIdReal,
      asignacionId: currentAsignacion?._id ?? selectedActiveTarea.asignacionId,
      asignacion: currentAsignacion,
      faseAsignacion: currentAsignacion?.fase ?? selectedActiveTarea.faseAsignacion,
      rolAsignacion: currentAsignacion?.rol ?? selectedActiveTarea.rolAsignacion,
      factura: data.factura,
      notaCreditoRelacion: normalizeNotaCreditoRelacion(
        data.notaCreditoRelacion ?? selectedActiveTarea.notaCreditoRelacion,
        data.factura
      ),
      adjuntosCount: selectedActiveTarea.adjuntosCount,
      pdfUrl: selectedActiveTarea.pdfUrl,
    };
  }, [actor.actorEmail, actor.actorUserId, data, selectedActiveTarea]);
  const modalTareas = useMemo(() => {
    if (!selectedActiveTarea || !activeTarea) return tareas;
    const activeTaskKey = getTaskKey(selectedActiveTarea);
    return tareas.map((tarea) => (getTaskKey(tarea) === activeTaskKey ? activeTarea : tarea));
  }, [activeTarea, selectedActiveTarea, tareas]);
  const cruceSummaries = useQuery(
    api.facturacionTareas.obtenerResumenCrucesAnticiposFacturas,
    open && tareas.length > 0 ? { facturaIds: tareas.map((tarea) => tarea.facturaId) } : "skip"
  );
  const cruceSummaryByFacturaId = useMemo(() => {
    const map = new Map<
      string,
      {
        legalizacionesCount: number;
        valorAplicado: number;
        valorLegalizable?: number;
        cubiertaTotal?: boolean;
      }
    >();
    for (const summary of cruceSummaries ?? []) {
      map.set(String(summary.facturaId), {
        legalizacionesCount: summary.legalizacionesCount,
        valorAplicado: summary.valorAplicado,
        valorLegalizable: summary.valorLegalizable,
        cubiertaTotal: summary.cubiertaTotal,
      });
    }
    return map;
  }, [cruceSummaries]);
  const cruceCoverageByFacturaId = useMemo(() => {
    const coverage: Record<string, { cubiertaTotal?: boolean; valorAplicado?: number }> = {};
    for (const [facturaId, summary] of cruceSummaryByFacturaId.entries()) {
      coverage[facturaId] = {
        cubiertaTotal: summary.cubiertaTotal,
        valorAplicado: summary.valorAplicado,
      };
    }
    return coverage;
  }, [cruceSummaryByFacturaId]);

  const rememberCajaMenorOptions = useCallback((options: Array<{ id: string; nombre: string }>) => {
    setCajaMenorNamesById((current) => {
      let changed = false;
      const next = { ...current };
      for (const option of options) {
        const nombre = option.nombre.trim();
        if (!option.id || !nombre || next[option.id] === nombre) continue;
        next[option.id] = nombre;
        changed = true;
      }
      return changed ? next : current;
    });
  }, []);

  const totalSeleccionado = modalTareas.reduce(
    (sum, tarea) => sum + (tarea.factura ? getValorContable(tarea.factura) : 0),
    0
  );
  const moneda = modalTareas[0]?.factura?.moneda ?? "COP";
  const commonStage = getCommonStage(modalTareas);
  const commonEmpresa = getCommonEmpresa(modalTareas);
  const activeStage = activeTarea ? String(getActiveStage(activeTarea)) : null;
  const activeEmpresa = activeTarea
    ? (activeTarea.empresa ?? activeTarea.factura?.empresa ?? 1)
    : commonEmpresa;

  const getLideresForEmpresa = useCallback(
    (empresa: number | null | undefined) => {
      if (empresa === null || empresa === undefined) return [];
      if (lideresPorEmpresa) return lideresPorEmpresa[empresa] ?? [];
      return lideres;
    },
    [lideres, lideresPorEmpresa]
  );
  const getLideresForTarea = useCallback(
    (tarea: BuzonTarea) => getLideresForEmpresa(tarea.empresa ?? tarea.factura?.empresa ?? 1),
    [getLideresForEmpresa]
  );
  const activeAprobaciones = data?.aprobaciones;
  const pagosByFacturaId = useMemo(() => {
    const map: Record<string, number> = {};
    if (activeTarea && activeAprobaciones) {
      map[String(activeTarea.facturaId)] = getPagosMonetariosAplicados(
        activeAprobaciones as Doc<"facturacionAprobaciones">[]
      );
    }
    return map;
  }, [activeTarea, activeAprobaciones]);
  const accountingActionContext = {
    contadoresPorEmpresa,
    eventosDianPorEmpresa,
    gerenciasPorEmpresa,
    cruceCoverageByFacturaId,
    pagosByFacturaId,
  };
  const primaryAction = commonStage
    ? getBatchPrimaryAction(modalTareas, accountingActionContext)
    : null;
  const activeAction = pendingAction ?? primaryAction;
  const activeDraft = activeTarea ? pendingByKey[getTaskKey(activeTarea)] : undefined;
  const pendingCount = modalTareas.filter((tarea) => pendingByKey[getTaskKey(tarea)]).length;
  const jointRecipientsCount = Math.max(0, modalTareas.length - pendingCount);
  const fallbackConfirmationAction = activeAction ?? Object.values(pendingByKey)[0]?.action ?? null;
  const individualDefaultAction = activeTarea
    ? getPrimaryActionForTask(activeTarea, accountingActionContext)
    : null;
  const panelAction =
    mode === "individual"
      ? (individualAction ?? activeDraft?.action ?? individualDefaultAction)
      : activeAction;
  const panelSelectedIds = mode === "individual" ? individualSelectedIds : selectedIds;
  const setPanelSelectedIds = mode === "individual" ? setIndividualSelectedIds : setSelectedIds;
  const panelComment = mode === "individual" ? individualComment : comment;
  const panelEmpresa = mode === "individual" ? activeEmpresa : commonEmpresa;
  const panelPools = {
    lideres: getLideresForEmpresa(panelEmpresa),
    contadores:
      panelEmpresa !== null && panelEmpresa !== undefined
        ? (contadoresPorEmpresa[panelEmpresa] ?? [])
        : [],
    eventosDian:
      panelEmpresa !== null && panelEmpresa !== undefined
        ? (eventosDianPorEmpresa[panelEmpresa] ?? [])
        : [],
    analistasCausacion:
      panelEmpresa !== null && panelEmpresa !== undefined
        ? (analistasCausacionPorEmpresa[panelEmpresa] ?? [])
        : [],
    rechazosDian:
      panelEmpresa !== null && panelEmpresa !== undefined
        ? (rechazosDianPorEmpresa[panelEmpresa] ?? [])
        : [],
    gerencias:
      panelEmpresa !== null &&
      panelEmpresa !== undefined &&
      activeTarea &&
      panelAction?.needsAssignee === "gerencia"
        ? getGerenciaPeersForTask(activeTarea, gerenciasPorEmpresa)
        : panelEmpresa !== null && panelEmpresa !== undefined
          ? (gerenciasPorEmpresa[panelEmpresa] ?? [])
          : [],
    usuarios,
  };
  const panelActions =
    mode === "individual"
      ? activeTarea
        ? getAvailableActionsForTask(activeTarea, accountingActionContext)
        : []
      : commonStage && modalTareas[0]
        ? getAvailableActionsForTask(modalTareas[0], accountingActionContext)
        : [];
  const gerenciaAction = getGerenciaPhaseAssignmentActionIfAllowed({
    actorUserId: actor.actorUserId,
    empresa: panelEmpresa,
    gerenciasPorEmpresa,
  });
  const gerenciaActions = gerenciaAction ? [gerenciaAction] : [];
  const phaseAssignmentPools: GerenciaPhasePools = {
    recepcionPorEmpresa,
    lideresPorEmpresa: lideresPorEmpresa ?? {},
    analistasCausacionPorEmpresa,
    contadoresPorEmpresa,
    eventosDianPorEmpresa,
    gerenciasPorEmpresa,
    tesoreriaPorEmpresa,
  };
  const panelPhaseAssignment =
    mode === "individual" ? individualPhaseAssignment : jointPhaseAssignment;
  const setPanelPhaseAssignment =
    mode === "individual" ? setIndividualPhaseAssignment : setJointPhaseAssignment;
  const automaticJefes = modalTareas
    .map((tarea) => getJefeDirectoAutoForTask(tarea, usuariosById))
    .filter((usuario): usuario is FacturacionUsuario => Boolean(usuario));
  const allHaveAutomaticJefe =
    modalTareas.length > 0 && automaticJefes.length === modalTareas.length;
  const activeJefeDirectoAuto = activeTarea
    ? getJefeDirectoAutoForTask(activeTarea, usuariosById)
    : null;
  const panelHasAutomaticJefe =
    mode === "individual" ? Boolean(activeJefeDirectoAuto) : allHaveAutomaticJefe;
  const isSingle = variant === "single";
  const headerEmpresa = isSingle ? activeEmpresa : commonEmpresa;
  const valorContableEditMode: BatchMode =
    isSingle || mode === "individual" ? "individual" : "joint";
  const activeFactura = activeTarea?.factura ?? null;
  const activeValorContableDisplay = activeFactura
    ? (individualValorContable ?? activeDraft?.valorContable ?? getValorContable(activeFactura))
    : undefined;
  const isSavedValorContableDraft =
    mode === "joint" &&
    activeDraft?.valorContable !== undefined &&
    activeFactura !== null &&
    activeDraft.valorContable !== activeFactura.total;
  const activeValorContableDraft =
    valorContableEditMode === "individual" ? activeValorContableDisplay : undefined;
  const activeValorAPagarEstimado = useMemo(() => {
    if (
      !activeFactura ||
      activeValorContableDisplay === undefined ||
      !data ||
      String(data.factura._id) !== String(activeFactura._id)
    ) {
      return undefined;
    }

    const legalizacionesAnticipos = data.legalizacionesAnticipos as Array<
      Pick<Doc<"facturacionAnticipoLegalizaciones">, "valorAplicado">
    >;
    const valorAnticiposAplicados = legalizacionesAnticipos.reduce(
      (total, legalizacion) => total + legalizacion.valorAplicado,
      0
    );
    const pagosAplicados = getPagosMonetariosAplicados(
      data.aprobaciones as Doc<"facturacionAprobaciones">[]
    );

    return computeValorAPagarEstimado({
      valorContable: activeValorContableDisplay,
      valorDocumentosInternos: activeFactura.valorCrucesDocumentosInternos ?? 0,
      valorAnticiposAplicados,
      pagosAplicados,
    });
  }, [activeFactura, activeValorContableDisplay, data]);
  const effectivePlans = confirmBatchAction ? getEffectivePlans(confirmBatchAction) : [];
  const panelPagoParcialDraft =
    mode === "individual" ? individualPagoParcialDraft : pagoParcialDraft;
  const setPanelPagoParcialDraft =
    mode === "individual" ? setIndividualPagoParcialDraft : setPagoParcialDraft;
  const totalPagadoParcial = sumPagosParciales(
    data?.aprobaciones as Doc<"facturacionAprobaciones">[] | undefined
  );
  const valorBasePagoParcial = activeFactura ? getValorBasePagoTesoreria(activeFactura) : 0;
  const jointLeaderActionBlocked =
    !isSingle &&
    mode === "joint" &&
    pendingCount < modalTareas.length &&
    activeAction?.needsAssignee === "lideres" &&
    commonEmpresa === null;
  const jointGerenciaActionBlocked =
    !isSingle &&
    mode === "joint" &&
    panelAction?.kind === "assign-phase-user" &&
    commonEmpresa === null;
  const canReviewPlans =
    (Boolean(activeAction) || pendingCount === modalTareas.length) &&
    !jointLeaderActionBlocked &&
    !jointGerenciaActionBlocked;

  function resetBatchState() {
    setMode("joint");
    setActiveKey(null);
    setComment("");
    setSelectedIds([]);
    setPendingAction(null);
    setPendingByKey({});
    setCausacionByFacturaId({});
    setIndividualAction(null);
    setIndividualComment("");
    setIndividualSelectedIds([]);
    setCajaMenorDraft(getDefaultCajaMenorDraft(null));
    setCajaMenorNamesById({});
    setConfirmBatchAction(null);
    setIndividualValorContable(null);
    setPagoParcialDraft(getDefaultPagoParcialDraft());
    setIndividualPagoParcialDraft(getDefaultPagoParcialDraft());
    setJointPhaseAssignment(createEmptyPhaseAssignment());
    setIndividualPhaseAssignment(createEmptyPhaseAssignment());
    setUploadingPagoParcial(false);
    setUnmarkTarget(null);
    setUnmarkingSpecialFlag(false);
    setCausacionDirty(false);
    setCausacionDiscardOpen(false);
    pendingNavigationRef.current = null;
  }

  function requestNavigation(action: () => void) {
    if (causacionDirty) {
      pendingNavigationRef.current = action;
      setCausacionDiscardOpen(true);
      return;
    }
    action();
  }

  function confirmDiscardCausacionDraft() {
    const action = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setCausacionDiscardOpen(false);
    setCausacionDirty(false);
    if (activeTarea?.facturaId) {
      setCausacionByFacturaId((current) => ({
        ...current,
        [String(activeTarea.facturaId)]: undefined,
      }));
    }
    action?.();
  }

  function preloadIndividualEditor(tarea: BuzonTarea | null) {
    if (!tarea) return;
    const draft = pendingByKey[getTaskKey(tarea)];
    setIndividualAction(draft?.action ?? getPrimaryActionForTask(tarea));
    setIndividualComment(draft?.observation ?? "");
    setIndividualSelectedIds(draft?.selectedIds ?? []);
    setIndividualValorContable(
      draft?.valorContable ?? (tarea.factura ? getValorContable(tarea.factura) : null)
    );
    setCajaMenorDraft(draft?.cajaMenor ?? getDefaultCajaMenorDraft(tarea));
    setIndividualPagoParcialDraft(draft?.pagoParcial ?? getDefaultPagoParcialDraft());
    setIndividualPhaseAssignment(
      draft?.phaseAssignment
        ? {
            targetStage: draft.phaseAssignment.targetStage,
            assigneeId: draft.phaseAssignment.assigneeId,
          }
        : createEmptyPhaseAssignment()
    );
  }

  async function handlePagoParcialUpload(files: FileList | null) {
    if (!files || files.length === 0 || !activeTarea?.facturaId) return;
    const file = files[0];
    if (file.size > MAX_PAGO_PARCIAL_FILE_BYTES) {
      toast.error(
        `${file.name} supera el límite de ${MAX_PAGO_PARCIAL_FILE_BYTES / (1024 * 1024)}MB`
      );
      return;
    }

    setUploadingPagoParcial(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Error al subir ${file.name}`);
      }
      const { storageId } = (await response.json()) as { storageId: string };
      setPanelPagoParcialDraft({
        ...panelPagoParcialDraft,
        storageId: storageId as Id<"_storage">,
        nombre: file.name,
        mimeType: file.type || undefined,
        size: file.size,
      });
      toast.success(`${file.name} listo para registrar.`);
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(error, "No se pudo subir el comprobante. Intenta nuevamente.")
      );
    } finally {
      setUploadingPagoParcial(false);
    }
  }

  function selectTarea(tarea: BuzonTarea) {
    setActiveKey(getTaskKey(tarea));
    if (mode === "individual") preloadIndividualEditor(tarea);
  }

  function selectTareaGuarded(tarea: BuzonTarea) {
    requestNavigation(() => selectTarea(tarea));
  }

  function enterIndividualMode() {
    preloadIndividualEditor(activeTarea);
    setMode("individual");
  }

  function detachTarea(tarea: BuzonTarea) {
    if (modalTareas.length <= 1) return;
    const key = getTaskKey(tarea);
    const index = modalTareas.findIndex((item) => getTaskKey(item) === key);
    const next = modalTareas[index + 1] ?? modalTareas[index - 1] ?? null;
    setPendingByKey((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[key];
      return nextDrafts;
    });
    if (activeTarea && getTaskKey(activeTarea) === key) {
      setActiveKey(next ? getTaskKey(next) : null);
      if (mode === "individual") preloadIndividualEditor(next);
    }
    onRemove(tarea);
  }

  function detachTareaGuarded(tarea: BuzonTarea) {
    requestNavigation(() => detachTarea(tarea));
  }

  const activeNumeroFactura = activeTarea?.factura?.numeroFactura?.trim() ?? "";
  const deleteConfirmMatches =
    activeNumeroFactura.length > 0 && deleteConfirmInput.trim() === activeNumeroFactura;

  useEffect(() => {
    if (!deleteDialogOpen) return;
    const timer = window.setTimeout(() => {
      deleteConfirmInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [deleteDialogOpen]);

  function openDeleteDialog() {
    if (!canDeleteFactura || !activeTarea?.facturaId) return;
    setDeleteConfirmInput("");
    setDeleteDialogOpen(true);
  }

  function finalizeDeleteRemoval(tarea: BuzonTarea) {
    const key = getTaskKey(tarea);
    setPendingByKey((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[key];
      return nextDrafts;
    });

    if (modalTareas.length <= 1) {
      onRemove(tarea);
      onDone();
      onOpenChange(false);
      return;
    }

    const index = modalTareas.findIndex((item) => getTaskKey(item) === key);
    const next = modalTareas[index + 1] ?? modalTareas[index - 1] ?? null;
    if (activeTarea && getTaskKey(activeTarea) === key) {
      setActiveKey(next ? getTaskKey(next) : null);
      if (mode === "individual") preloadIndividualEditor(next);
    }
    onRemove(tarea);
  }

  async function confirmDeleteFactura() {
    if (!canDeleteFactura || !activeTarea?.facturaId || !deleteConfirmMatches) {
      return;
    }

    setDeletingFactura(true);
    try {
      const result = await eliminarFacturaCompleta({
        facturaId: activeTarea.facturaId,
        confirmacionNumeroFactura: deleteConfirmInput.trim(),
      });
      toast.success(`Factura #${result.numeroFactura} eliminada definitivamente.`);
      setDeleteDialogOpen(false);
      setDeleteConfirmInput("");
      finalizeDeleteRemoval(activeTarea);
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(error, "No se pudo eliminar la factura. Intenta nuevamente.")
      );
    } finally {
      setDeletingFactura(false);
    }
  }

  async function runForwardActionForTask(
    tarea: BuzonTarea,
    action: WorkflowAction,
    observation: string,
    assigneeIds: string[],
    valorContableNuevo?: number,
    causacion?: CausacionActionDraft
  ) {
    if (!tarea.asignacionId) throw new Error("Hay una factura sin asignación activa.");
    const stage = String(getActiveStage(tarea));
    const selectedAssigneeForTask = getSelectedAssigneeForTask(action, assigneeIds, tarea, {
      lideres,
      lideresPorEmpresa,
      contadoresPorEmpresa,
      eventosDianPorEmpresa,
      analistasCausacionPorEmpresa,
      rechazosDianPorEmpresa,
      gerenciasPorEmpresa,
      usuarios,
    });

    switch (stage) {
      case "recepcion": {
        if (assigneeIds.length === 0) {
          throw new Error("Selecciona al menos un líder.");
        }
        const lideresSeleccionados = assigneeIds.map((id) => {
          const usuario = getLideresForTarea(tarea).find((item) => item.id === id);
          if (!usuario) throw new Error("Líder no encontrado.");
          return toUsuarioAsignacion(usuario);
        });
        await asignarLideres({
          asignacionId: tarea.asignacionId,
          lideres: lideresSeleccionados,
          ...actor,
          comentario: observation.trim(),
        });
        break;
      }
      case "revision_lider":
        await completarRevisionLider({
          asignacionId: tarea.asignacionId,
          decision: "aprobar",
          ...actor,
          comentario: observation.trim(),
        });
        break;
      case "jefe_directo":
        await completarJefeDirecto({
          asignacionId: tarea.asignacionId,
          decision: "aprobar",
          ...actor,
          comentario: observation.trim(),
        });
        break;
      case "causacion":
        if (tarea.contadorAsignadoAEmail) {
          await reenviarAImpuestos({
            asignacionId: tarea.asignacionId,
            ...actor,
            comentario: observation.trim(),
            ...(valorContableNuevo !== undefined ? { valorContableNuevo } : {}),
            ...(causacion ? { causacion } : {}),
          });
          break;
        }
        if (!selectedAssigneeForTask) throw new Error("Selecciona un responsable de contabilidad.");
        await completarCausacion({
          asignacionId: tarea.asignacionId,
          contador: toUsuarioAsignacion(selectedAssigneeForTask),
          ...actor,
          comentario: observation.trim(),
          ...(valorContableNuevo !== undefined ? { valorContableNuevo } : {}),
          ...(causacion ? { causacion } : {}),
        });
        break;
      case "revision_impuestos":
        if (action.targetStage === "gerencia") {
          await enviarContadorAGerencia({
            asignacionId: tarea.asignacionId,
            ...actor,
            comentario: observation.trim(),
            ...(valorContableNuevo !== undefined ? { valorContableNuevo } : {}),
            ...(causacion ? { causacion } : {}),
          });
          break;
        }
        if (!selectedAssigneeForTask) throw new Error("Selecciona un usuario de Eventos DIAN.");
        await completarRevisionImpuestos({
          asignacionId: tarea.asignacionId,
          decision: "aprobar",
          eventosDian: toUsuarioAsignacion(selectedAssigneeForTask),
          ...actor,
          comentario: observation.trim(),
          ...(valorContableNuevo !== undefined ? { valorContableNuevo } : {}),
          ...(causacion ? { causacion } : {}),
        });
        break;
      case "eventos_dian":
        if (tarea.factura?.esLegalizacionCajaMenor) {
          throw new Error("Eventos DIAN sólo puede legalizar o devolver facturas de Caja Menor.");
        }
        await completarEventosDian({
          asignacionId: tarea.asignacionId,
          decision: "gerencia",
          ...actor,
          comentario: observation.trim(),
          ...(valorContableNuevo !== undefined ? { valorContableNuevo } : {}),
          ...(causacion ? { causacion } : {}),
        });
        break;
      case "pendiente_rechazar_dian":
        await confirmarRechazoDianAsignacion({
          asignacionId: tarea.asignacionId,
          ...actor,
          comentario: observation.trim(),
        });
        break;
      case "gerencia":
        await aprobarGerencia({
          asignacionId: tarea.asignacionId,
          ...actor,
          comentario: observation.trim(),
        });
        break;
      case "revision_tesoreria":
        await registrarPagoAsignacion({
          asignacionId: tarea.asignacionId,
          sinDesembolso: action.kind === "confirm-no-disbursement",
          ...actor,
          comentario: observation.trim(),
        });
        break;
      default:
        throw new Error("La fase actual no tiene transición conjunta.");
    }
  }

  async function handleOpenCruce(tarea: BuzonTarea) {
    const fase = String(tarea.faseAsignacion ?? tarea.estado);
    const factura = tarea.factura;
    const isActiveTask = getTaskKey(tarea) === getTaskKey(activeTarea ?? tarea);
    const draft = isActiveTask
      ? activeValorContableDisplay
      : factura
        ? getValorContable(factura)
        : null;

    if (shouldPersistValorContableBeforeOpenCruce({ factura, fase, draft }) && tarea.asignacionId) {
      setSavingCruce(true);
      try {
        await guardarValorContableFactura({
          asignacionId: tarea.asignacionId,
          valorContableNuevo: draft!,
          actorUserId: actor.actorUserId,
          actorNombre: actor.actorNombre,
          actorEmail: actor.actorEmail,
          comentario: "Ajuste de valor contable previo al cruce de anticipos.",
        });
      } catch (error) {
        toast.error(
          getFacturacionErrorMessage(
            error,
            "No se pudo guardar el valor contable. Intenta nuevamente."
          )
        );
        return;
      } finally {
        setSavingCruce(false);
      }
    }

    onOpenLegalizacionAnticipo(tarea);
  }

  async function confirmUnmarkSpecialFlag() {
    if (!unmarkTarget) return;
    const { tarea, kind } = unmarkTarget;
    setUnmarkingSpecialFlag(true);
    try {
      if (kind === "anticipo") {
        await marcarEsLegalizacionAnticipo({
          tareaId: tarea._id,
          ...(tarea.asignacionId ? { asignacionId: tarea.asignacionId } : {}),
          esLegalizacionAnticipo: false,
          actorUserId: actor.actorUserId,
          actorNombre: actor.actorNombre,
          actorEmail: actor.actorEmail,
        });
      } else {
        await marcarEsLegalizacionCajaMenor({
          tareaId: tarea._id,
          ...(tarea.asignacionId ? { asignacionId: tarea.asignacionId } : {}),
          esLegalizacionCajaMenor: false,
          actorUserId: actor.actorUserId,
          actorNombre: actor.actorNombre,
          actorEmail: actor.actorEmail,
          comentario: "Desmarcada como legalización de Caja Menor desde buzón.",
        });
      }

      const taskKey = getTaskKey(tarea);
      setPendingByKey((current) => {
        const next = { ...current };
        delete next[taskKey];
        return next;
      });
      setPendingAction(null);
      setSelectedIds([]);
      setIndividualAction(null);
      setIndividualSelectedIds([]);
      setUnmarkTarget(null);
      toast.success(
        kind === "anticipo"
          ? "Factura desmarcada como anticipo."
          : "Factura desmarcada como Caja Menor."
      );
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(error, "No se pudo desmarcar la factura. Intenta nuevamente.")
      );
    } finally {
      setUnmarkingSpecialFlag(false);
    }
  }

  async function runAction(action: WorkflowAction | null) {
    if (!action) return;
    if (jointLeaderActionBlocked) {
      toast.error(
        "Las facturas son de empresas distintas. Usa modo Individual o arma lotes por empresa para asignar líderes."
      );
      return;
    }
    if (jointGerenciaActionBlocked) {
      toast.error(
        "Las facturas son de empresas distintas. Usa modo Individual o arma lotes por empresa para asignar fase y usuario."
      );
      return;
    }
    if (action.kind === "cross-anticipo") {
      toast.error("El cruce de anticipos se realiza factura por factura.");
      return;
    }
    const plans = getEffectivePlans(action);
    const validationError = validatePlans(plans);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setConfirmBatchAction(action);
  }

  async function executeAssignPhaseUserPlans(plans: BatchPlan[]) {
    const response = await fetch("/api/billing/buzon/asignar-fase-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignments: plans.map((plan) => ({
          assignmentId: plan.tarea.asignacionId,
          targetStage: plan.phaseAssignment?.targetStage,
          assigneeId: plan.phaseAssignment?.assigneeId,
          observation: plan.observation.trim(),
        })),
      }),
    });
    const payload = (await response.json()) as { error?: string; updated?: number };
    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo asignar fase y usuario.");
    }
  }

  async function executeConfirmedAction(action: WorkflowAction) {
    setLoading(true);
    try {
      if (action.kind === "assign-phase-user") {
        await executeAssignPhaseUserPlans(getEffectivePlans(action));
        toast.success("Fase y responsable actualizados.");
        resetBatchState();
        onDone();
        return;
      }

      for (const plan of getEffectivePlans(action)) {
        const { tarea, observation, selectedIds: planSelectedIds } = plan;
        if (!tarea.asignacionId) throw new Error("Hay una factura sin asignación activa.");
        if (plan.action.kind === "backward" && plan.action.targetStage) {
          const faseDestino = plan.action.targetStage;
          if (faseDestino === "pendiente_rechazar_dian" || faseDestino === "reembolso_caja_menor") {
            throw new Error("No se puede devolver una factura a esa fase.");
          }
          await devolverAFase({
            asignacionId: tarea.asignacionId,
            faseDestino,
            ...actor,
            comentario: observation.trim(),
            ...(plan.causacion ? { causacion: plan.causacion } : {}),
          });
        } else if (plan.action.kind === "assign-horizontal-lider") {
          if (plan.selectedIds.length === 0) {
            throw new Error("Selecciona al menos un líder.");
          }
          const lideresSeleccionados = plan.selectedIds.map((id) => {
            const usuario = getLideresForTarea(tarea).find((item) => item.id === id);
            if (!usuario) throw new Error("Líder no encontrado.");
            return toUsuarioAsignacion(usuario);
          });
          await asignarOtroLider({
            asignacionId: tarea.asignacionId,
            lideres: lideresSeleccionados,
            ...actor,
            comentario: observation.trim(),
          });
        } else if (plan.action.kind === "assign-horizontal-par") {
          const selectedPeer = getSelectedAssigneeForTask(plan.action, planSelectedIds, tarea, {
            lideres,
            lideresPorEmpresa,
            contadoresPorEmpresa,
            eventosDianPorEmpresa,
            analistasCausacionPorEmpresa,
            rechazosDianPorEmpresa,
            gerenciasPorEmpresa,
            usuarios,
          });
          if (!selectedPeer) {
            throw new Error("Selecciona el par responsable para continuar.");
          }
          await asignarPar({
            asignacionId: tarea.asignacionId,
            nuevoAsignado: toUsuarioAsignacion(selectedPeer),
            ...actor,
            comentario: observation.trim(),
            ...(plan.causacion ? { causacion: plan.causacion } : {}),
          });
        } else if (plan.action.kind === "assign-jefe") {
          const selectedJefe = getSelectedAssigneeForTask(plan.action, planSelectedIds, tarea, {
            lideres,
            lideresPorEmpresa,
            contadoresPorEmpresa,
            eventosDianPorEmpresa,
            analistasCausacionPorEmpresa,
            rechazosDianPorEmpresa,
            gerenciasPorEmpresa,
            usuarios,
          });
          const jefe = getJefeDirectoAutoForTask(tarea, usuariosById) ?? selectedJefe;
          if (!jefe) {
            throw new Error("Selecciona un jefe directo para continuar.");
          }
          await asignarJefeDirecto({
            asignacionId: tarea.asignacionId,
            jefeDirecto: toUsuarioAsignacion(jefe),
            ...actor,
            comentario: observation.trim(),
          });
        } else if (plan.action.kind === "mark-anticipo") {
          const proceso = getLiderProcesoSnapshot(tarea, usuariosById);
          await marcarEsLegalizacionAnticipo({
            tareaId: tarea._id,
            asignacionId: tarea.asignacionId,
            esLegalizacionAnticipo: true,
            anticipoProcesoId: proceso.procesoId,
            anticipoProcesoNombre: proceso.procesoNombre,
            actorUserId: actor.actorUserId,
            actorNombre: actor.actorNombre,
            actorEmail: actor.actorEmail,
          });
          if (String(getActiveStage(tarea)) === "revision_lider") {
            await completarRevisionLider({
              asignacionId: tarea.asignacionId,
              decision: "aprobar",
              ...actor,
              comentario: observation.trim(),
            });
          } else if (String(getActiveStage(tarea)) === "jefe_directo") {
            await completarJefeDirecto({
              asignacionId: tarea.asignacionId,
              decision: "aprobar",
              ...actor,
              comentario: observation.trim(),
            });
          }
        } else if (plan.action.kind === "mark-caja-menor") {
          const cajaMenorId = planSelectedIds[0] as Id<"cajasMenores"> | undefined;
          if (!cajaMenorId) {
            throw new Error("Selecciona la Caja Menor para continuar.");
          }
          const movimiento = plan.cajaMenor;
          if (!movimiento) {
            throw new Error("Completa los datos del movimiento de Caja Menor.");
          }
          await marcarEsLegalizacionCajaMenor({
            tareaId: tarea._id,
            asignacionId: tarea.asignacionId,
            esLegalizacionCajaMenor: true,
            cajaMenorId,
            nit: tarea.factura?.proveedorNit,
            nombreEmpresa: tarea.factura?.proveedorNombre,
            concepto: movimiento.concepto,
            fechaPago: movimiento.fechaPago,
            centroCostoCodigo: movimiento.centroCostoCodigo,
            centroCostoNombre: movimiento.centroCostoNombre,
            centrosCostoDistribucion: movimiento.centrosCostoDistribucion,
            observaciones: movimiento.observaciones,
            actorUserId: actor.actorUserId,
            actorNombre: actor.actorNombre,
            actorEmail: actor.actorEmail,
            comentario: observation.trim(),
          });
        } else if (plan.action.kind === "legalize") {
          if (isLegalizeFromAccountingSkip(plan.action)) {
            await clearUncommittedAnticipoBeforeForward(tarea, plan.action);
            const valorContableNuevo = getValorContablePayloadForPlan(plan);
            await avanzarFasesContablesConsecutivas({
              asignacionId: tarea.asignacionId,
              finalizarLegalizacionAnticipo: true,
              resultadoEsperado: "legalizada",
              ...actor,
              comentario: observation.trim(),
              ...(valorContableNuevo !== undefined ? { valorContableNuevo } : {}),
              ...(plan.causacion ? { causacion: plan.causacion } : {}),
            });
          } else {
            await completarEventosDian({
              asignacionId: tarea.asignacionId,
              decision: "legalizar",
              ...actor,
              comentario: observation.trim(),
              ...(getValorContablePayloadForPlan(plan) !== undefined
                ? { valorContableNuevo: getValorContablePayloadForPlan(plan) }
                : {}),
              ...(plan.causacion ? { causacion: plan.causacion } : {}),
            });
          }
        } else if (plan.action.kind === "legalize-caja-menor") {
          await legalizarCajaMenorFactura({
            asignacionId: tarea.asignacionId,
            ...actor,
            comentario: observation.trim(),
            ...(plan.causacion ? { causacion: plan.causacion } : {}),
          });
        } else if (plan.action.kind === "reject-dian") {
          await solicitarRechazoDianAsignacion({
            asignacionId: tarea.asignacionId,
            ...actor,
            comentario: observation.trim(),
            ...(plan.causacion ? { causacion: plan.causacion } : {}),
          });
        } else if (plan.action.kind === "confirm-reject-dian") {
          await confirmarRechazoDianAsignacion({
            asignacionId: tarea.asignacionId,
            ...actor,
            comentario: observation.trim(),
          });
        } else if (plan.action.kind === "close-nc") {
          await cerrarNotaCreditoAsignacion({
            asignacionId: tarea.asignacionId,
            ...actor,
            comentario: observation.trim(),
          });
        } else if (plan.action.kind === "close-invoice") {
          await cerrarFacturaRecepcionAsignacion({
            asignacionId: tarea.asignacionId,
            ...actor,
            comentario: observation.trim(),
          });
        } else if (plan.action.kind === "partial-payment") {
          const draft = plan.pagoParcial;
          if (!draft?.storageId || !draft.nombre || !draft.monto || draft.monto <= 0) {
            throw new Error("Completa el monto y el comprobante del pago parcial.");
          }
          await registrarPagoParcialAsignacion({
            asignacionId: tarea.asignacionId,
            monto: draft.monto,
            comprobanteStorageId: draft.storageId,
            comprobanteNombre: draft.nombre,
            ...(draft.mimeType ? { comprobanteMimeType: draft.mimeType } : {}),
            ...(typeof draft.size === "number" ? { comprobanteSize: draft.size } : {}),
            ...actor,
            comentario: observation.trim(),
          });
        } else if (plan.action.kind === "skip-accounting-chain") {
          await clearUncommittedAnticipoBeforeForward(tarea, plan.action);
          const valorContableNuevo = getValorContablePayloadForPlan(plan);
          const selectedEventosDian = getSelectedAssigneeForTask(
            plan.action,
            planSelectedIds,
            tarea,
            {
              lideres,
              lideresPorEmpresa,
              contadoresPorEmpresa,
              eventosDianPorEmpresa,
              analistasCausacionPorEmpresa,
              rechazosDianPorEmpresa,
              gerenciasPorEmpresa,
              usuarios,
            }
          );
          await avanzarFasesContablesConsecutivas({
            asignacionId: tarea.asignacionId,
            resultadoEsperado: getSkipResultadoEsperado(plan.action),
            ...(plan.action.needsAssignee === "eventos_dian" && selectedEventosDian
              ? { eventosDian: toUsuarioAsignacion(selectedEventosDian) }
              : {}),
            ...actor,
            comentario: observation.trim(),
            ...(valorContableNuevo !== undefined ? { valorContableNuevo } : {}),
            ...(plan.causacion ? { causacion: plan.causacion } : {}),
          });
        } else if (
          plan.action.kind === "forward" ||
          plan.action.kind === "confirm-paid" ||
          plan.action.kind === "confirm-no-disbursement"
        ) {
          await clearUncommittedAnticipoBeforeForward(tarea, plan.action);
          await runForwardActionForTask(
            tarea,
            plan.action,
            observation,
            planSelectedIds,
            getValorContablePayloadForPlan(plan),
            plan.causacion
          );
        }
      }

      const updatedCount = getEffectivePlans(action).length;
      toast.success(
        isSingle ? "Factura actualizada." : `${updatedCount} factura(s) actualizada(s).`
      );
      setComment("");
      setSelectedIds([]);
      setPendingAction(null);
      setPendingByKey({});
      setCausacionByFacturaId({});
      setCausacionDirty(false);
      setConfirmBatchAction(null);
      setIndividualValorContable(null);
      setPagoParcialDraft(getDefaultPagoParcialDraft());
      setIndividualPagoParcialDraft(getDefaultPagoParcialDraft());
      onDone();
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo actualizar la factura. Revisa la información e intenta nuevamente."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function getEffectivePlans(jointFallback: WorkflowAction): BatchPlan[] {
    const jointPhaseAssignmentPayload =
      jointFallback.kind === "assign-phase-user" &&
      jointPhaseAssignment.targetStage &&
      jointPhaseAssignment.assigneeId
        ? {
            targetStage: jointPhaseAssignment.targetStage,
            assigneeId: jointPhaseAssignment.assigneeId,
          }
        : undefined;

    return modalTareas.map((tarea) => {
      const draft = pendingByKey[getTaskKey(tarea)];
      const causacion = tarea.facturaId
        ? causacionByFacturaId[String(tarea.facturaId)]
        : undefined;
      if (draft) {
        return withSystemObservation({
          ...draft,
          ...(causacion ? { causacion } : {}),
          tarea,
          source: "individual",
        });
      }
      return withSystemObservation({
        tarea,
        source: "joint",
        action: jointFallback,
        observation: comment,
        selectedIds,
        phaseAssignment: jointPhaseAssignmentPayload,
        valorContable: isSingle ? (individualValorContable ?? undefined) : undefined,
        cajaMenorNombre:
          jointFallback.kind === "mark-caja-menor" ? getCajaMenorNombre(selectedIds[0]) : undefined,
        cajaMenor: jointFallback.kind === "mark-caja-menor" ? cajaMenorDraft : undefined,
        pagoParcial: jointFallback.kind === "partial-payment" ? pagoParcialDraft : undefined,
        ...(causacion ? { causacion } : {}),
      });
    });
  }

  function getTotalPagadoParcialForTarea(tarea: BuzonTarea) {
    if (!activeTarea || tarea.facturaId !== activeTarea.facturaId) {
      return 0;
    }
    return totalPagadoParcial;
  }

  function validatePlans(plans: BatchPlan[]) {
    const jointCajaMenor = plans.some(
      (plan) => plan.action.kind === "mark-caja-menor" && plan.source === "joint"
    );
    if (jointCajaMenor && plans.length > 1) {
      return "La Caja Menor se selecciona factura por factura. Usa acciones individuales para este lote.";
    }
    const jointPagoParcial = plans.some(
      (plan) => plan.action.kind === "partial-payment" && plan.source === "joint"
    );
    if (jointPagoParcial && !isSingle) {
      return "El pago parcial solo está disponible en la pestaña Individual. Cambia de modo e intenta de nuevo.";
    }
    if (
      plans.some((plan) => plan.action.kind === "assign-phase-user" && plan.source === "joint") &&
      plans.length > 1
    ) {
      const empresas = new Set(
        plans.map((plan) => plan.tarea.empresa ?? plan.tarea.factura?.empresa ?? 1)
      );
      if (empresas.size > 1) {
        return "Las facturas son de empresas distintas. Usa modo Individual o arma lotes por empresa.";
      }
    }
    const jointLeaderPlans = plans.filter(
      (plan) => plan.source === "joint" && plan.action.needsAssignee === "lideres"
    );
    if (jointLeaderPlans.length > 1) {
      const empresas = new Set(
        jointLeaderPlans.map((plan) => plan.tarea.empresa ?? plan.tarea.factura?.empresa ?? 1)
      );
      if (empresas.size > 1) {
        return "Las facturas son de empresas distintas. Usa modo Individual o arma lotes por empresa para asignar líderes.";
      }
    }
    const anticipoForwardPlans = plans.filter(requiresAnticipoSummaryForForward);
    if (anticipoForwardPlans.length > 0 && cruceSummaries === undefined) {
      return "Espera a que cargue el resumen de cruces de anticipos.";
    }
    const leaderAnticipoPlans = plans.filter(requiresLeaderAnticipoCruce);
    if (leaderAnticipoPlans.length > 0) {
      if (cruceSummaries === undefined) {
        return "Espera a que cargue el resumen de cruces de anticipos.";
      }
      for (const plan of leaderAnticipoPlans) {
        if (hasSavedAnticipoCruce(plan.tarea)) continue;
        if (plan.action.kind === "forward") continue;
        const label = plan.tarea.factura?.numeroFactura
          ? `Factura ${plan.tarea.factura.numeroFactura}`
          : "Una factura";
        return plans.length > 1
          ? `${label}: abre el cruce de anticipos en modo individual y guarda al menos un anticipo antes de enviar a causación.`
          : `${label}: abre el cruce de anticipos y guarda al menos un anticipo antes de enviar a causación.`;
      }
    }
    if (
      !isSingle &&
      mode === "joint" &&
      commonStage === "revision_tesoreria" &&
      plans.some((plan) => plan.source === "joint")
    ) {
      const conflict = explainTesoreriaBatchJointConflict(
        plans.map((plan) => plan.tarea),
        pagosByFacturaId
      );
      if (conflict) return conflict;
    }
    for (const plan of plans) {
      if (plan.causacion?.causado && !plan.causacion.numeroFp.trim()) {
        return `Factura ${plan.tarea.factura?.numeroFactura ?? "seleccionada"}: ingresa el número FP antes de aplicar la acción.`;
      }
      const error = validatePlan(plan, {
        lideres,
        lideresPorEmpresa,
        contadoresPorEmpresa,
        eventosDianPorEmpresa,
        analistasCausacionPorEmpresa,
        rechazosDianPorEmpresa,
        gerenciasPorEmpresa,
        recepcionPorEmpresa,
        tesoreriaPorEmpresa,
        cruceCoverageByFacturaId,
        pagosByFacturaId,
        usuarios,
        usuariosById,
        totalPagadoParcial: getTotalPagadoParcialForTarea(plan.tarea),
      });
      if (error) return error;
    }
    return null;
  }

  function requiresAnticipoSummaryForForward(plan: BatchPlan) {
    if (
      plan.action.kind !== "forward" &&
      plan.action.kind !== "skip-accounting-chain" &&
      !isLegalizeFromAccountingSkip(plan.action)
    ) {
      return false;
    }
    if (plan.tarea.factura?.esLegalizacionAnticipo !== true) return false;
    return [
      "revision_lider",
      "jefe_directo",
      "causacion",
      "revision_impuestos",
      "eventos_dian",
    ].includes(String(getActiveStage(plan.tarea)));
  }

  function requiresLeaderAnticipoCruce(plan: BatchPlan) {
    if (String(getActiveStage(plan.tarea)) !== "revision_lider") return false;
    return (
      plan.action.kind === "mark-anticipo" ||
      (plan.action.kind === "forward" && plan.tarea.factura?.esLegalizacionAnticipo === true)
    );
  }

  function hasSavedAnticipoCruce(tarea: BuzonTarea) {
    const summary = cruceSummaryByFacturaId.get(String(tarea.facturaId));
    return Boolean(summary && summary.legalizacionesCount > 0 && summary.valorAplicado > 0);
  }

  function shouldClearUncommittedAnticipoBeforeForward(tarea: BuzonTarea, action: WorkflowAction) {
    if (
      action.kind !== "forward" &&
      action.kind !== "skip-accounting-chain" &&
      !isLegalizeFromAccountingSkip(action)
    ) {
      return false;
    }
    if (!tarea.factura?.esLegalizacionAnticipo) return false;
    if (hasSavedAnticipoCruce(tarea)) return false;
    return ["revision_lider", "jefe_directo"].includes(String(getActiveStage(tarea)));
  }

  async function clearUncommittedAnticipoBeforeForward(tarea: BuzonTarea, action: WorkflowAction) {
    if (!shouldClearUncommittedAnticipoBeforeForward(tarea, action)) return;

    await marcarEsLegalizacionAnticipo({
      tareaId: tarea._id,
      ...(tarea.asignacionId ? { asignacionId: tarea.asignacionId } : {}),
      esLegalizacionAnticipo: false,
      actorUserId: actor.actorUserId,
      actorNombre: actor.actorNombre,
      actorEmail: actor.actorEmail,
    });
  }

  function getCajaMenorNombre(cajaMenorId?: string, fallback?: string) {
    return fallback ?? (cajaMenorId ? cajaMenorNamesById[cajaMenorId] : undefined);
  }

  function getObservationForAction(
    action: WorkflowAction,
    observation: string,
    selectedIdsForAction: string[],
    cajaMenorNombre?: string
  ) {
    if (action.kind !== "mark-caja-menor") return observation;
    return buildCajaMenorObservation(
      getCajaMenorNombre(selectedIdsForAction[0], cajaMenorNombre),
      selectedIdsForAction[0]
    );
  }

  function withSystemObservation(plan: BatchPlan): BatchPlan {
    if (plan.action.kind !== "mark-caja-menor") return plan;
    const cajaMenorNombre = getCajaMenorNombre(plan.selectedIds[0], plan.cajaMenorNombre);
    return {
      ...plan,
      cajaMenorNombre,
      observation: buildCajaMenorObservation(cajaMenorNombre, plan.selectedIds[0]),
    };
  }

  function saveIndividualAction() {
    if (!activeTarea || !panelAction) return;
    const cajaMenorNombre =
      panelAction.kind === "mark-caja-menor" ? getCajaMenorNombre(panelSelectedIds[0]) : undefined;
    const plan: BatchPlan = {
      tarea: activeTarea,
      source: "individual",
      action: panelAction,
      observation: getObservationForAction(
        panelAction,
        individualComment,
        individualSelectedIds,
        cajaMenorNombre
      ),
      selectedIds: individualSelectedIds,
      cajaMenorNombre,
      cajaMenor: panelAction.kind === "mark-caja-menor" ? cajaMenorDraft : undefined,
      valorContable: activeValorContableDisplay,
      pagoParcial: panelAction.kind === "partial-payment" ? individualPagoParcialDraft : undefined,
      phaseAssignment:
        panelAction.kind === "assign-phase-user" &&
        individualPhaseAssignment.targetStage &&
        individualPhaseAssignment.assigneeId
          ? {
              targetStage: individualPhaseAssignment.targetStage,
              assigneeId: individualPhaseAssignment.assigneeId,
            }
          : undefined,
    };
    const error = validatePlan(plan, {
      lideres,
      lideresPorEmpresa,
      contadoresPorEmpresa,
      eventosDianPorEmpresa,
      analistasCausacionPorEmpresa,
      rechazosDianPorEmpresa,
      gerenciasPorEmpresa,
      recepcionPorEmpresa,
      tesoreriaPorEmpresa,
      cruceCoverageByFacturaId,
      usuarios,
      usuariosById,
      totalPagadoParcial: getTotalPagadoParcialForTarea(activeTarea),
    });
    if (error) {
      toast.error(
        getFacturacionErrorMessage(error, "No se pudo validar la acción. Revisa los datos e intenta nuevamente.")
      );
      return;
    }
    setPendingByKey((current) => ({
      ...current,
      [getTaskKey(activeTarea)]: {
        action: panelAction,
        observation: getObservationForAction(
          panelAction,
          individualComment,
          individualSelectedIds,
          cajaMenorNombre
        ),
        selectedIds: individualSelectedIds,
        cajaMenorNombre,
        cajaMenor: panelAction.kind === "mark-caja-menor" ? cajaMenorDraft : undefined,
        valorContable: activeValorContableDisplay,
        pagoParcial:
          panelAction.kind === "partial-payment" ? individualPagoParcialDraft : undefined,
        phaseAssignment:
          panelAction.kind === "assign-phase-user" &&
          individualPhaseAssignment.targetStage &&
          individualPhaseAssignment.assigneeId
            ? {
                targetStage: individualPhaseAssignment.targetStage,
                assigneeId: individualPhaseAssignment.assigneeId,
              }
            : undefined,
      },
    }));
    toast.success("Acción individual guardada.");
    setIndividualComment("");
    setIndividualSelectedIds([]);
    setIndividualValorContable(null);
    setMode("joint");
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            requestNavigation(() => {
              resetBatchState();
              onOpenChange(false);
            });
            return;
          }
          onOpenChange(nextOpen);
        }}
      >
        <DialogContent
          className={`flex h-[92vh] w-[96vw] flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0 ${
            isSingle ? "max-w-[1320px]" : "max-w-[1500px]"
          }`}
        >
          <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
              <div>
                <DialogTitle className="text-lg font-semibold text-slate-950">
                  {isSingle ? "Revisión de factura" : "Revisión múltiple de facturas"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-500">
                  {isSingle
                    ? `${activeTarea?.factura?.numeroFactura ?? "Factura"} · ${formatCurrency(totalSeleccionado, moneda)}`
                    : `${modalTareas.length} seleccionada(s) · ${formatCurrency(totalSeleccionado, moneda)}`}
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeStage ? (
                  <Badge variant="outline" className="rounded-full bg-slate-50">
                    Fase: {STAGE_LABELS[activeStage] ?? activeStage}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="rounded-full border-amber-200 bg-amber-50 text-amber-700"
                  >
                    Fases mixtas
                  </Badge>
                )}
                {headerEmpresa !== null && headerEmpresa !== undefined ? (
                  <EmpresaBadge empresaId={headerEmpresa} />
                ) : (
                  <Badge
                    variant="outline"
                    className="rounded-full border-amber-200 bg-amber-50 text-amber-700"
                  >
                    Empresas mixtas
                  </Badge>
                )}
              </div>
            </div>
          </DialogHeader>

          <div
            className={`grid min-h-0 flex-1 overflow-hidden grid-cols-1 bg-slate-100/60 ${
              isSingle
                ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]"
                : "lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,360px)]"
            }`}
          >
            {!isSingle ? (
              <BatchSelectionSidebar
                tareas={modalTareas}
                activeTarea={activeTarea}
                pendingByKey={pendingByKey}
                pendingCount={pendingCount}
                selectTarea={selectTareaGuarded}
                detachTarea={detachTareaGuarded}
                setPendingByKey={setPendingByKey}
              />
            ) : null}

            <FacturaReviewContent
              activeTarea={activeTarea}
              data={data}
              isSingle={isSingle}
              tareas={modalTareas}
              detachTarea={detachTareaGuarded}
              valorContableEditMode={valorContableEditMode}
              activeValorContableDisplay={activeValorContableDisplay}
              activeValorAPagarEstimado={activeValorAPagarEstimado}
              isSavedValorContableDraft={isSavedValorContableDraft}
              valorContableEditorRef={valorContableEditorRef}
              adjuntosActor={adjuntosActor}
              onRequestUnmark={(tarea, kind) => setUnmarkTarget({ tarea, kind })}
              unmarkingSpecialFlag={unmarkingSpecialFlag}
              canDeleteFactura={canDeleteFactura}
              onRequestDelete={openDeleteDialog}
              deletingFactura={deletingFactura}
              causacionDraft={
                activeTarea?.facturaId
                  ? causacionByFacturaId[String(activeTarea.facturaId)]
                  : undefined
              }
              onCausacionDirtyChange={setCausacionDirty}
              onCausacionDraftChange={(draft) => {
                if (!activeTarea?.facturaId) return;
                setCausacionByFacturaId((current) => ({
                  ...current,
                  [String(activeTarea.facturaId)]: draft,
                }));
              }}
            />

            <BatchActionPanel
              isSingle={isSingle}
              mode={mode}
              setMode={setMode}
              enterIndividualMode={enterIndividualMode}
              tareas={modalTareas}
              activeTarea={activeTarea}
              activeDraft={activeDraft}
              commonStage={commonStage}
              pendingCount={pendingCount}
              jointRecipientsCount={jointRecipientsCount}
              savingCruce={savingCruce}
              handleOpenCruce={handleOpenCruce}
              actor={actor}
              activeStage={activeStage}
              panelAction={panelAction}
              panelActions={panelActions}
              gerenciaActions={gerenciaActions}
              phaseAssignment={panelPhaseAssignment}
              setPhaseAssignment={setPanelPhaseAssignment}
              phaseAssignmentPools={phaseAssignmentPools}
              jointGerenciaActionBlocked={jointGerenciaActionBlocked}
              panelSelectedIds={panelSelectedIds}
              setPanelSelectedIds={setPanelSelectedIds}
              panelComment={panelComment}
              panelPools={panelPools}
              panelHasAutomaticJefe={panelHasAutomaticJefe}
              usuariosById={usuariosById}
              setIndividualAction={setIndividualAction}
              setIndividualSelectedIds={setIndividualSelectedIds}
              setPendingAction={setPendingAction}
              setSelectedIds={setSelectedIds}
              setCajaMenorDraft={setCajaMenorDraft}
              rememberCajaMenorOptions={rememberCajaMenorOptions}
              cajaMenorDraft={cajaMenorDraft}
              valorContableEditMode={valorContableEditMode}
              activeValorContableDraft={activeValorContableDraft}
              valorContableEditorRef={valorContableEditorRef}
              setIndividualValorContable={setIndividualValorContable}
              setIndividualComment={setIndividualComment}
              setComment={setComment}
              loading={loading}
              canReviewPlans={canReviewPlans}
              jointLeaderActionBlocked={jointLeaderActionBlocked}
              fallbackConfirmationAction={fallbackConfirmationAction}
              runAction={runAction}
              saveIndividualAction={saveIndividualAction}
              panelPagoParcialDraft={panelPagoParcialDraft}
              setPanelPagoParcialDraft={setPanelPagoParcialDraft}
              uploadingPagoParcial={uploadingPagoParcial}
              onPagoParcialUpload={handlePagoParcialUpload}
              totalPagadoParcial={totalPagadoParcial}
              valorBasePagoParcial={valorBasePagoParcial}
              monedaPagoParcial={moneda}
              panelEmpresa={panelEmpresa}
            />
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmActionsDialog
        confirmBatchAction={confirmBatchAction}
        loading={loading}
        isSingle={isSingle}
        activeTarea={activeTarea}
        effectivePlans={effectivePlans}
        totalSeleccionado={totalSeleccionado}
        moneda={moneda}
        comment={comment}
        actor={actor}
        usuariosById={usuariosById}
        setConfirmBatchAction={setConfirmBatchAction}
        executeConfirmedAction={executeConfirmedAction}
        onOpenCruce={handleOpenCruce}
      />

      <AlertDialog
        open={causacionDiscardOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            pendingNavigationRef.current = null;
            setCausacionDiscardOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar cambios de causación</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar en la causación de esta factura. Si continúas, se
              perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={(event) => {
                event.preventDefault();
                confirmDiscardCausacionDraft();
              }}
            >
              Descartar cambios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(unmarkTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !unmarkingSpecialFlag) {
            setUnmarkTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {unmarkTarget?.kind === "anticipo" ? "Desmarcar anticipo" : "Desmarcar Caja Menor"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {unmarkTarget?.kind === "anticipo"
                ? "La factura dejará de tratarse como legalización de anticipo y podrá continuar por el flujo normal. Si ya tiene cruces guardados, se revertirán y se restaurarán los saldos de los anticipos."
                : "La factura dejará de tratarse como reembolso de Caja Menor. Se anularán los cruces o movimientos activos asociados y, si estaba en reembolso, volverá a causación."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unmarkingSpecialFlag}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={unmarkingSpecialFlag}
              onClick={(event) => {
                event.preventDefault();
                void confirmUnmarkSpecialFlag();
              }}
            >
              {unmarkingSpecialFlag ? "Desmarcando..." : "Desmarcar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(nextOpen) => {
          if (deletingFactura) return;
          setDeleteDialogOpen(nextOpen);
          if (!nextOpen) setDeleteConfirmInput("");
        }}
      >
        <DialogContent
          className="max-w-lg"
          onEscapeKeyDown={(event) => {
            if (deletingFactura) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (deletingFactura) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Eliminar factura definitivamente</DialogTitle>
            <DialogDescription>
              Esta acción es irreversible. Se eliminarán datos del documento, el flujo de trabajo,
              archivos, cruces y totales compartidos asociados a esta factura.
            </DialogDescription>
          </DialogHeader>

          {activeTarea?.factura ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-rose-950">
                <p>
                  <span className="font-semibold">Proveedor:</span>{" "}
                  {activeTarea.factura.proveedorNombre}
                </p>
                <p>
                  <span className="font-semibold">Factura:</span> #
                  {activeTarea.factura.numeroFactura}
                </p>
                <p>
                  <span className="font-semibold">Empresa:</span>{" "}
                  {activeTarea.empresa ?? activeTarea.factura.empresa ?? "-"}
                </p>
                <p>
                  <span className="font-semibold">Valor:</span>{" "}
                  {formatCurrency(activeTarea.factura.total, activeTarea.factura.moneda ?? "COP")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="delete-factura-confirm">
                  Escribe el número de factura{" "}
                  <span className="font-semibold">{activeTarea.factura.numeroFactura}</span> para
                  confirmar
                </Label>
                <Input
                  id="delete-factura-confirm"
                  ref={deleteConfirmInputRef}
                  value={deleteConfirmInput}
                  disabled={deletingFactura}
                  autoComplete="off"
                  onChange={(event) => setDeleteConfirmInput(event.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={deletingFactura}
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setDeleteConfirmInput("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!deleteConfirmMatches || deletingFactura}
                  onClick={() => void confirmDeleteFactura()}
                >
                  {deletingFactura ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Eliminando…
                    </>
                  ) : (
                    "Eliminar definitivamente"
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
