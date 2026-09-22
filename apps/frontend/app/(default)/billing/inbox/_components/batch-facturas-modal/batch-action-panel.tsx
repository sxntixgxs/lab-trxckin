import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, User, Users } from "lucide-react";
import type { RefObject } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BuzonTarea } from "../../../components/buzon-row";
import { ValorContableEditorPanel } from "../../../components/valor-contable-ui";
import type { FacturacionUsuario } from "../../../hooks/use-facturacion-users";
import { getAnticipoLegalizacionPanelMode } from "../../../lib/anticipo-legalizacion";
import { EmpresaBadge } from "../../../lib/empresa-ui";
import { getValorContable } from "../../../lib/valor-contable";
import { getActiveStage, type WorkflowAction } from "../../../lib/workflow-config";
import { getTaskKey } from "../helpers";
import { AssigneeControl } from "../shared";
import type { Actor } from "../types";
import { ActionSelector } from "./action-ui";
import { AnticipoCruceQuickAccess } from "./anticipo-panels";
import { AssignPhaseUserPanel } from "./assign-phase-user-panel";
import type { GerenciaPhasePools } from "./assign-phase-user-utils";
import {
  CajaMenorActionPicker,
  CajaMenorMovementFields,
  CajaMenorQuickAccess,
} from "./caja-menor-panels";
import { getDefaultCajaMenorDraft } from "./caja-menor-utils";
import { CrucesDocumentosInternosPanel } from "./cruces-internos-panel";
import { PagoParcialActionFields } from "./pago-parcial-panel";
import { getDefaultPagoParcialDraft } from "./pago-parcial-utils";
import type {
  BatchActionDraft,
  BatchMode,
  CajaMenorMovementDraft,
  PagoParcialDraft,
  PhaseAssignmentDraft,
} from "./types";
import { getFacturaShortLabel, getJefeDirectoAutoForTask } from "./workflow-plan-utils";

export function BatchActionPanel({
  isSingle,
  mode,
  setMode,
  enterIndividualMode,
  tareas,
  activeTarea,
  activeDraft,
  commonStage,
  pendingCount,
  jointRecipientsCount,
  savingCruce,
  handleOpenCruce,
  actor,
  activeStage,
  panelAction,
  panelActions,
  gerenciaActions,
  phaseAssignment,
  setPhaseAssignment,
  phaseAssignmentPools,
  jointGerenciaActionBlocked,
  panelSelectedIds,
  setPanelSelectedIds,
  panelComment,
  panelPools,
  panelHasAutomaticJefe,
  usuariosById,
  setIndividualAction,
  setIndividualSelectedIds,
  setPendingAction,
  setSelectedIds,
  setCajaMenorDraft,
  rememberCajaMenorOptions,
  cajaMenorDraft,
  valorContableEditMode,
  activeValorContableDraft,
  valorContableEditorRef,
  setIndividualValorContable,
  setIndividualComment,
  setComment,
  loading,
  canReviewPlans,
  jointLeaderActionBlocked,
  fallbackConfirmationAction,
  runAction,
  saveIndividualAction,
  panelPagoParcialDraft,
  setPanelPagoParcialDraft,
  uploadingPagoParcial,
  onPagoParcialUpload,
  totalPagadoParcial,
  valorBasePagoParcial,
  monedaPagoParcial,
  panelEmpresa,
}: {
  isSingle: boolean;
  mode: BatchMode;
  setMode: (mode: BatchMode) => void;
  enterIndividualMode: () => void;
  tareas: BuzonTarea[];
  activeTarea: BuzonTarea | null;
  activeDraft?: BatchActionDraft;
  commonStage: string | null;
  pendingCount: number;
  jointRecipientsCount: number;
  savingCruce: boolean;
  handleOpenCruce: (tarea: BuzonTarea) => void | Promise<void>;
  actor: Actor;
  activeStage: string | null;
  panelAction: WorkflowAction | null;
  panelActions: WorkflowAction[];
  gerenciaActions: WorkflowAction[];
  phaseAssignment: PhaseAssignmentDraft;
  setPhaseAssignment: (next: PhaseAssignmentDraft) => void;
  phaseAssignmentPools: GerenciaPhasePools;
  jointGerenciaActionBlocked: boolean;
  panelSelectedIds: string[];
  setPanelSelectedIds: (next: string[]) => void;
  panelComment: string;
  panelPools: {
    lideres: FacturacionUsuario[];
    contadores: FacturacionUsuario[];
    analistasCausacion: FacturacionUsuario[];
    eventosDian: FacturacionUsuario[];
    rechazosDian: FacturacionUsuario[];
    gerencias: FacturacionUsuario[];
    usuarios: FacturacionUsuario[];
  };
  panelHasAutomaticJefe: boolean;
  usuariosById: Map<string, FacturacionUsuario>;
  setIndividualAction: (action: WorkflowAction | null) => void;
  setIndividualSelectedIds: (next: string[]) => void;
  setPendingAction: (action: WorkflowAction | null) => void;
  setSelectedIds: (next: string[]) => void;
  setCajaMenorDraft: (next: CajaMenorMovementDraft) => void;
  rememberCajaMenorOptions: (options: Array<{ id: string; nombre: string }>) => void;
  cajaMenorDraft: CajaMenorMovementDraft;
  valorContableEditMode: BatchMode;
  activeValorContableDraft?: number;
  valorContableEditorRef: RefObject<HTMLDivElement | null>;
  setIndividualValorContable: (next: number | null) => void;
  setIndividualComment: (next: string) => void;
  setComment: (next: string) => void;
  loading: boolean;
  canReviewPlans: boolean;
  jointLeaderActionBlocked: boolean;
  fallbackConfirmationAction: WorkflowAction | null;
  runAction: (action: WorkflowAction | null) => void;
  saveIndividualAction: () => void;
  panelPagoParcialDraft: PagoParcialDraft;
  setPanelPagoParcialDraft: (next: PagoParcialDraft) => void;
  uploadingPagoParcial: boolean;
  onPagoParcialUpload: (files: FileList | null) => void;
  totalPagadoParcial: number;
  valorBasePagoParcial: number;
  monedaPagoParcial: string;
  panelEmpresa: number | null;
}) {
  const anticipoPanelMode =
    (isSingle || mode === "individual") && activeTarea
      ? getAnticipoLegalizacionPanelMode(activeTarea, {
          actionKind: panelAction?.kind ?? null,
        })
      : null;

  return (
    <aside className="min-h-0 overflow-hidden border-t border-slate-200 bg-white lg:border-l lg:border-t-0">
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {!isSingle ? (
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100/60 p-1">
              <button
                type="button"
                aria-pressed={mode === "joint"}
                onClick={() => setMode("joint")}
                className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium transition ${
                  mode === "joint"
                    ? "bg-white text-slate-950 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Users className="h-4 w-4" />
                Conjunta
                <span className="rounded-full bg-slate-200 px-1.5 text-[10px] tabular-nums text-slate-600">
                  {tareas.length}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={mode === "individual"}
                onClick={enterIndividualMode}
                className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium transition ${
                  mode === "individual"
                    ? "bg-white text-slate-950 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <User className="h-4 w-4" />
                Individual
              </button>
            </div>
          ) : null}

          <div className={isSingle ? "mt-0" : "mt-5"}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-950">
                {isSingle
                  ? "Acci\u00f3n de revisi\u00f3n"
                  : mode === "joint"
                    ? "Acci\u00f3n conjunta"
                    : "Acci\u00f3n para esta factura"}
              </p>
              {panelEmpresa !== null ? (
                <EmpresaBadge empresaId={panelEmpresa} compact />
              ) : (
                <Badge
                  variant="outline"
                  className="rounded-full border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                >
                  Empresas mixtas
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {isSingle
                ? `La acción y observación se aplicarán a ${activeTarea?.factura?.proveedorNombre ?? "esta factura"}.`
                : mode === "joint"
                  ? `La acción y observación se aplicarán a ${jointRecipientsCount} factura(s) sin acción individual.`
                  : `Define una acción espec?fica para ${activeTarea?.factura?.proveedorNombre ?? "esta factura"}.`}
            </p>
          </div>

          {!isSingle ? (
            <BatchStatusBanner mode={mode} commonStage={commonStage} activeDraft={activeDraft} />
          ) : null}

          {(isSingle || mode === "individual") &&
          activeTarea &&
          ["causacion", "revision_impuestos", "eventos_dian"].includes(
            String(getActiveStage(activeTarea))
          ) &&
          activeTarea.factura?.esLegalizacionCajaMenor ? (
            <CajaMenorQuickAccess tarea={activeTarea} actorUserId={actor.actorUserId} />
          ) : null}

          <div className="mt-5 grid gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Acción principal
            </p>
            <ActionSelector
              action={panelAction}
              actions={panelActions}
              gerenciaActions={gerenciaActions}
              onSelect={(action) => {
                if (mode === "individual") {
                  setIndividualAction(action);
                  setIndividualSelectedIds([]);
                  setPhaseAssignment({ targetStage: "", assigneeId: "" });
                  setCajaMenorDraft(getDefaultCajaMenorDraft(activeTarea));
                  setPanelPagoParcialDraft(getDefaultPagoParcialDraft());
                } else {
                  setPendingAction(action);
                  setSelectedIds([]);
                  setPhaseAssignment({ targetStage: "", assigneeId: "" });
                  setCajaMenorDraft(getDefaultCajaMenorDraft(activeTarea));
                  setPanelPagoParcialDraft(getDefaultPagoParcialDraft());
                }
              }}
            />
          </div>

          <div className="mt-4">
            {jointGerenciaActionBlocked ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Las facturas seleccionadas pertenecen a empresas distintas. Usa modo Individual
                    o arma lotes por empresa para asignar fase y usuario.
                  </p>
                </div>
              </div>
            ) : jointLeaderActionBlocked ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Las facturas seleccionadas pertenecen a empresas distintas. Usa modo Individual
                    o arma lotes por empresa para asignar l?deres.
                  </p>
                </div>
              </div>
            ) : panelAction?.kind === "assign-phase-user" ? (
              <AssignPhaseUserPanel
                value={phaseAssignment}
                onChange={setPhaseAssignment}
                empresa={panelEmpresa}
                pools={phaseAssignmentPools}
              />
            ) : panelAction?.kind === "partial-payment" ? (
              <div className="space-y-3">
                {mode === "joint" && !isSingle && tareas.length > 1 ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                    El pago parcial se registra factura por factura. Usa el modo Individual para
                    este lote.
                  </div>
                ) : activeTarea ? (
                  <PagoParcialActionFields
                    draft={panelPagoParcialDraft}
                    onChange={setPanelPagoParcialDraft}
                    uploading={uploadingPagoParcial}
                    totalPagado={totalPagadoParcial}
                    valorBase={valorBasePagoParcial}
                    moneda={monedaPagoParcial}
                    factura={activeTarea.factura ?? null}
                    onUploadFiles={onPagoParcialUpload}
                  />
                ) : null}
              </div>
            ) : panelAction?.kind === "mark-caja-menor" ? (
              <div className="space-y-3">
                {mode === "joint" && !isSingle && tareas.length > 1 ? (
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
                    La Caja Menor se selecciona factura por factura. Usa modo individual para este
                    lote.
                  </div>
                ) : activeTarea ? (
                  <CajaMenorActionPicker
                    tarea={activeTarea}
                    actorUserId={actor.actorUserId}
                    selectedIds={panelSelectedIds}
                    onOptionsLoaded={rememberCajaMenorOptions}
                    onChange={(nextCajaIds, cajaNombre) => {
                      if (nextCajaIds[0] && cajaNombre) {
                        rememberCajaMenorOptions([{ id: nextCajaIds[0], nombre: cajaNombre }]);
                      }
                      const manualJefeIds =
                        panelAction.needsAssignee === "jefe_directo"
                          ? panelSelectedIds.slice(1)
                          : [];
                      setPanelSelectedIds([...nextCajaIds, ...manualJefeIds]);
                    }}
                  />
                ) : null}
                {activeTarea ? (
                  <CajaMenorMovementFields
                    value={cajaMenorDraft}
                    factura={activeTarea.factura}
                    empresa={activeTarea.empresa ?? activeTarea.factura?.empresa}
                    onChange={setCajaMenorDraft}
                  />
                ) : null}
                {panelAction.needsAssignee === "jefe_directo" ? (
                  <div className="space-y-2">
                    <JefeDirectoPreview
                      mode={mode}
                      tareas={tareas}
                      activeTarea={activeTarea}
                      usuariosById={usuariosById}
                    />
                    {!panelHasAutomaticJefe ? (
                      panelSelectedIds[0] ? (
                        <AssigneeControl
                          action={panelAction}
                          selectedIds={panelSelectedIds.slice(1)}
                          onChange={(nextJefeIds) => {
                            const cajaId = panelSelectedIds[0];
                            setPanelSelectedIds([cajaId, ...nextJefeIds]);
                          }}
                          lideres={panelPools.lideres}
                          contadores={panelPools.contadores}
                          analistasCausacion={panelPools.analistasCausacion}
                          eventosDian={panelPools.eventosDian}
                          rechazosDian={panelPools.rechazosDian}
                          gerencias={panelPools.gerencias}
                          usuarios={panelPools.usuarios}
                          jefeDirectoAuto={null}
                        />
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
                          Selecciona primero la Caja Menor para definir el jefe directo.
                        </div>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : panelAction?.needsAssignee === "jefe_directo" ? (
              <div className="space-y-2">
                <JefeDirectoPreview
                  mode={mode}
                  tareas={tareas}
                  activeTarea={activeTarea}
                  usuariosById={usuariosById}
                />
                {!panelHasAutomaticJefe ? (
                  <AssigneeControl
                    action={panelAction}
                    selectedIds={panelSelectedIds}
                    onChange={mode === "individual" ? setIndividualSelectedIds : setSelectedIds}
                    lideres={panelPools.lideres}
                    contadores={panelPools.contadores}
                    analistasCausacion={panelPools.analistasCausacion}
                    eventosDian={panelPools.eventosDian}
                    rechazosDian={panelPools.rechazosDian}
                    gerencias={panelPools.gerencias}
                    usuarios={panelPools.usuarios}
                    jefeDirectoAuto={null}
                  />
                ) : null}
              </div>
            ) : (
              <AssigneeControl
                action={panelAction}
                selectedIds={panelSelectedIds}
                onChange={mode === "individual" ? setIndividualSelectedIds : setSelectedIds}
                lideres={panelPools.lideres}
                contadores={panelPools.contadores}
                analistasCausacion={panelPools.analistasCausacion}
                eventosDian={panelPools.eventosDian}
                rechazosDian={panelPools.rechazosDian}
                gerencias={panelPools.gerencias}
                usuarios={panelPools.usuarios}
                jefeDirectoAuto={null}
              />
            )}
          </div>

          {anticipoPanelMode && activeTarea ? (
            <AnticipoCruceQuickAccess
              tarea={activeTarea}
              panelMode={anticipoPanelMode}
              isSaving={savingCruce}
              onOpen={() => void handleOpenCruce(activeTarea)}
              onMarkAndOpen={() => void handleOpenCruce(activeTarea)}
            />
          ) : null}

          <ValorContableEditorPanel
            factura={activeTarea?.factura}
            fase={activeStage ?? ""}
            mode={valorContableEditMode}
            value={
              activeValorContableDraft ??
              (activeTarea?.factura ? getValorContable(activeTarea.factura) : 0)
            }
            onChange={(next) => setIndividualValorContable(next)}
            editorRef={valorContableEditorRef}
            persistBeforeCruce={Boolean(anticipoPanelMode)}
          />

          {(isSingle || mode === "individual") && activeTarea ? (
            <CrucesDocumentosInternosPanel
              tarea={activeTarea}
              enabled
              valorContableDraft={activeValorContableDraft}
            />
          ) : null}

          {panelAction?.kind !== "mark-caja-menor" ? (
            <div className="mt-5 grid gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Observación
              </p>
              <Textarea
                value={panelComment}
                maxLength={500}
                onChange={(event) => {
                  if (mode === "individual") {
                    setIndividualComment(event.target.value);
                  } else {
                    setComment(event.target.value);
                  }
                }}
                placeholder={
                  isSingle
                    ? "Observación para la trazabilidad de la factura..."
                    : "Observación para la trazabilidad del lote..."
                }
                rows={5}
                className="min-h-[120px] resize-none rounded-xl"
              />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Se registrará en el historial.</span>
                <span className="tabular-nums">{panelComment.length}/500</span>
              </div>
            </div>
          ) : null}

          {!isSingle && mode === "joint" && pendingCount > 0 ? (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Resumen del lote
              </p>
              <div className="mt-3 grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Con acción individual</span>
                  <span className="font-semibold tabular-nums">{pendingCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Recibir?n acción conjunta</span>
                  <span className="font-semibold tabular-nums">{jointRecipientsCount}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="border-t border-slate-200 p-4">
          {!isSingle && mode === "individual" ? (
            <div className="grid grid-cols-[1fr_1.2fr] gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => setMode("joint")}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl bg-slate-900"
                disabled={loading || !panelAction}
                onClick={saveIndividualAction}
              >
                Guardar acción
              </Button>
            </div>
          ) : (
            <Button
              className="h-11 w-full rounded-xl bg-slate-900"
              disabled={loading || !canReviewPlans}
              onClick={() => void runAction(fallbackConfirmationAction)}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              {isSingle
                ? "Aplicar acción"
                : pendingCount > 0
                  ? `Revisar ${tareas.length} acciones`
                  : `Aplicar a ${tareas.length}`}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}

function JefeDirectoPreview({
  mode,
  tareas,
  activeTarea,
  usuariosById,
}: {
  mode: BatchMode;
  tareas: BuzonTarea[];
  activeTarea: BuzonTarea | null;
  usuariosById: Map<string, FacturacionUsuario>;
}) {
  const previewTareas = mode === "individual" ? (activeTarea ? [activeTarea] : []) : tareas;
  const rows = previewTareas.map((tarea) => ({
    key: getTaskKey(tarea),
    tarea,
    jefe: getJefeDirectoAutoForTask(tarea, usuariosById),
  }));
  const missing = rows.filter((row) => !row.jefe);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-slate-900">Jefe directo configurado</p>
        <Badge variant={missing.length > 0 ? "outline" : "secondary"}>
          {rows.length - missing.length}/{rows.length}
        </Badge>
      </div>

      <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
        {rows.map(({ key, tarea, jefe }) => (
          <div key={key} className="rounded-lg border border-white bg-white px-2.5 py-2 shadow-xs">
            <p className="truncate text-xs font-semibold text-slate-500">
              {getFacturaShortLabel(tarea)}
            </p>
            {jefe ? (
              <>
                <p className="mt-0.5 truncate font-semibold text-slate-900">{jefe.nombre}</p>
                <p className="truncate text-xs text-slate-500">{jefe.email}</p>
              </>
            ) : (
              <p className="mt-0.5 text-xs font-semibold text-amber-700">
                Sin jefe directo configurado para el l?der actual.
              </p>
            )}
          </div>
        ))}
      </div>

      {missing.length > 0 ? (
        <p className="mt-2 text-xs text-amber-700">
          Las facturas sin jefe configurado usar?n el responsable que selecciones manualmente abajo.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Al aplicar, cada factura se enviar? al jefe directo mostrado aqu?.
        </p>
      )}
    </div>
  );
}

function BatchStatusBanner({
  mode,
  commonStage,
  activeDraft,
}: {
  mode: BatchMode;
  commonStage: string | null;
  activeDraft?: BatchActionDraft;
}) {
  if (mode === "individual" && activeDraft) {
    return (
      <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        <div className="flex gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Ya tiene acción definida: {activeDraft.action.label}. Guarda de nuevo para
            sobreescribir.
          </p>
        </div>
      </div>
    );
  }
  if (mode === "joint" && commonStage) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <div className="flex gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Las facturas comparten fase y pueden procesarse juntas.</p>
        </div>
      </div>
    );
  }
  if (mode === "joint") {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Las facturas est?n en fases distintas. Usa modo individual.</p>
        </div>
      </div>
    );
  }
  return null;
}
