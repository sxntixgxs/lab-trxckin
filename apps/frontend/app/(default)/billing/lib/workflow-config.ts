import type { Doc } from "@/convex/_generated/dataModel";

export type FacturacionStage =
  | "recepcion"
  | "revision_lider"
  | "jefe_directo"
  | "causacion"
  | "revision_impuestos"
  | "eventos_dian"
  | "pendiente_rechazar_dian"
  | "reembolso_caja_menor"
  | "gerencia"
  | "revision_tesoreria";

export type FacturacionTerminal =
  | "pagada"
  | "legalizada"
  | "cerrada"
  | "rechazada"
  | "rechazada_dian"
  | "nota_credito_cerrada";

/** Phases where operators may close an invoice without completing the full workflow. */
export const CLOSE_INVOICE_PHASES = [
  "recepcion",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "gerencia",
] as const satisfies readonly FacturacionStage[];

export type CloseInvoicePhase = (typeof CLOSE_INVOICE_PHASES)[number];

export function isCloseInvoicePhase(stage: string): stage is CloseInvoicePhase {
  return (CLOSE_INVOICE_PHASES as readonly string[]).includes(stage);
}

export type WorkflowActionKind =
  | "forward"
  | "backward"
  | "assign-jefe"
  | "assign-horizontal-lider"
  | "assign-horizontal-par"
  | "mark-anticipo"
  | "mark-caja-menor"
  | "cross-anticipo"
  | "legalize"
  | "legalize-caja-menor"
  | "confirm-paid"
  | "confirm-no-disbursement"
  | "partial-payment"
  | "skip-accounting-chain"
  | "reject-dian"
  | "confirm-reject-dian"
  | "close-nc"
  | "close-invoice"
  | "assign-phase-user";

export type WorkflowAction = {
  kind: WorkflowActionKind;
  label: string;
  targetStage?: FacturacionStage;
  skippedStages?: FacturacionStage[];
  tone?: "default" | "warning" | "destructive";
  needsAssignee?:
    | "lideres"
    | "jefe_directo"
    | "contadores"
    | "analistas_causacion"
    | "eventos_dian"
    | "rechazos_dian"
    | "gerencia";
};

const CLOSE_INVOICE_ACTION: WorkflowAction = {
  kind: "close-invoice",
  label: "Cerrar factura",
};

export type WorkflowUserIdentity = {
  id?: string | null;
  usuarioId?: string | null;
  email?: string | null;
};

function normalizeWorkflowEmail(email?: string | null) {
  return (email ?? "").trim().toLowerCase();
}

function getWorkflowUserId(usuario?: WorkflowUserIdentity | null) {
  return (usuario?.usuarioId ?? usuario?.id ?? "").trim();
}

export function workflowUsersMatch(
  left?: WorkflowUserIdentity | null,
  right?: WorkflowUserIdentity | null,
) {
  const leftId = getWorkflowUserId(left);
  const rightId = getWorkflowUserId(right);
  if (leftId && rightId) return leftId === rightId;

  const leftEmail = normalizeWorkflowEmail(left?.email);
  const rightEmail = normalizeWorkflowEmail(right?.email);
  return Boolean(leftEmail && rightEmail && leftEmail === rightEmail);
}

/** Comparación estricta por usuarioId/id; nunca usa correo. */
export function workflowUsersMatchById(
  left?: WorkflowUserIdentity | null,
  right?: WorkflowUserIdentity | null,
) {
  const leftId = getWorkflowUserId(left);
  const rightId = getWorkflowUserId(right);
  if (!leftId || !rightId) return false;
  return leftId === rightId;
}

export function dedupeConfiguredUsers(usuarios: WorkflowUserIdentity[]) {
  const vistos = new Set<string>();
  return usuarios.filter((usuario) => {
    const id = getWorkflowUserId(usuario);
    if (id) {
      const key = `id:${id}`;
      if (vistos.has(key)) return false;
      vistos.add(key);
      return true;
    }
    const email = normalizeWorkflowEmail(usuario.email);
    if (!email) return false;
    const key = `email:${email}`;
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

function findConfiguredUserMatch(
  usuarios: WorkflowUserIdentity[],
  target: WorkflowUserIdentity,
) {
  return usuarios.find((usuario) => workflowUsersMatch(usuario, target)) ?? null;
}

function isMemberOfConfiguredList(
  usuario: WorkflowUserIdentity,
  lista: WorkflowUserIdentity[],
) {
  return Boolean(findConfiguredUserMatch(dedupeConfiguredUsers(lista), usuario));
}

function canSkipEventosDianFromContabilidad(
  currentUser: WorkflowUserIdentity,
  contadores: WorkflowUserIdentity[],
  eventosDian: WorkflowUserIdentity[],
) {
  return (
    isMemberOfConfiguredList(currentUser, contadores) &&
    isMemberOfConfiguredList(currentUser, eventosDian)
  );
}

export function needsEventosDianSelectionForSkip(
  action: WorkflowAction,
  eventosDian: WorkflowUserIdentity[],
  currentUser?: WorkflowUserIdentity | null,
) {
  if (
    action.kind !== "skip-accounting-chain" ||
    action.targetStage !== "eventos_dian" ||
    !currentUser
  ) {
    return false;
  }
  const candidatos = dedupeConfiguredUsers(eventosDian);
  return candidatos.length > 1;
}

const MONEY_TOLERANCE = 0.001;

export function anticipoCruceCubiertoTotalmente(
  valorAplicado: number,
  valorLegalizable: number,
) {
  return valorAplicado + MONEY_TOLERANCE >= valorLegalizable;
}

export function isLegalizeFromAccountingSkip(action: WorkflowAction) {
  return action.kind === "legalize" && Boolean(action.skippedStages?.length);
}

export function getAccountingSkipAction(
  stage: string,
  opts: {
    currentUser?: WorkflowUserIdentity | null;
    contadores: WorkflowUserIdentity[];
    eventosDian: WorkflowUserIdentity[];
    isCajaMenor?: boolean;
    isNotaCredito?: boolean;
    isAnticipo?: boolean;
    anticipoCubiertoTotal?: boolean;
  },
): WorkflowAction | null {
  return getAccountingPhaseActions(stage, opts)[0] ?? null;
}

function buildSkipToGerenciaAction(skippedStages: FacturacionStage[]): WorkflowAction {
  return {
    kind: "skip-accounting-chain",
    label: "Enviar a Gerencia",
    targetStage: "gerencia",
    skippedStages,
  };
}

function buildSkipToEventosDianAction(
  skippedStages: FacturacionStage[],
  eventosDian: WorkflowUserIdentity[],
): WorkflowAction {
  const action: WorkflowAction = {
    kind: "skip-accounting-chain",
    label: "Enviar a Eventos DIAN",
    targetStage: "eventos_dian",
    skippedStages,
  };
  if (dedupeConfiguredUsers(eventosDian).length > 1) {
    action.needsAssignee = "eventos_dian";
  }
  return action;
}

function buildLegalizeFromSkipAction(skippedStages: FacturacionStage[]): WorkflowAction {
  return {
    kind: "legalize",
    label: "Legalizar factura",
    skippedStages,
  };
}

export function getAccountingPhaseActions(
  stage: string,
  opts: {
    currentUser?: WorkflowUserIdentity | null;
    contadores: WorkflowUserIdentity[];
    eventosDian: WorkflowUserIdentity[];
    isCajaMenor?: boolean;
    isNotaCredito?: boolean;
    isAnticipo?: boolean;
    anticipoCubiertoTotal?: boolean;
    hasPreviousContador?: boolean;
  },
): WorkflowAction[] {
  const currentUser = opts.currentUser;
  if (!currentUser || opts.isCajaMenor) return [];

  const contadores = dedupeConfiguredUsers(opts.contadores);
  const eventosDian = dedupeConfiguredUsers(opts.eventosDian);
  const actions: WorkflowAction[] = [];

  if (stage === "causacion") {
    if (!isMemberOfConfiguredList(currentUser, contadores)) return [];

    const alsoEventosDian = isMemberOfConfiguredList(currentUser, eventosDian);
    if (alsoEventosDian) {
      const skippedStages: FacturacionStage[] = [
        "revision_impuestos",
        "eventos_dian",
      ];
      if (opts.isAnticipo && opts.anticipoCubiertoTotal) {
        actions.push(buildSkipToGerenciaAction(skippedStages));
        actions.push(buildLegalizeFromSkipAction(skippedStages));
      } else {
        actions.push(buildSkipToGerenciaAction(skippedStages));
      }
    } else if (eventosDian.length > 0) {
      actions.push(
        buildSkipToEventosDianAction(["revision_impuestos"], eventosDian),
      );
    }

    const normalForward = getPrimaryAction(stage, {
      hasPreviousContador: opts.hasPreviousContador,
    });
    if (normalForward) actions.push(normalForward);
    return actions;
  }

  if (stage === "revision_impuestos") {
    if (!canSkipEventosDianFromContabilidad(currentUser, contadores, eventosDian)) {
      return [];
    }

    const skippedStages: FacturacionStage[] = ["eventos_dian"];
    if (opts.isAnticipo && opts.anticipoCubiertoTotal) {
      actions.push(buildSkipToGerenciaAction(skippedStages));
      actions.push(buildLegalizeFromSkipAction(skippedStages));
    } else {
      actions.push(buildSkipToGerenciaAction(skippedStages));
    }

    const normalForward = getPrimaryAction(stage);
    if (normalForward) actions.push(normalForward);
    return actions;
  }

  return [];
}

export function shouldHideDirectGerenciaBypass(
  stage: string,
  skipEligible: boolean,
) {
  return stage === "revision_impuestos" && skipEligible;
}

export function isDuplicateGerenciaAction(
  action: WorkflowAction,
  skipEligible: boolean,
) {
  return (
    skipEligible &&
    action.kind === "forward" &&
    action.targetStage === "gerencia" &&
    action.label === "Asignar directo a Gerencia"
  );
}

/** Active workflow steps shown in progress bars and funnel (legacy jefe_directo excluded). */
export const STAGE_ORDER: FacturacionStage[] = [
  "recepcion",
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "pendiente_rechazar_dian",
  "gerencia",
  "revision_tesoreria",
];

/** Main chain used for backward (devolver) targets; excludes branch phases. */
export const DEVOLUCION_STAGE_ORDER: FacturacionStage[] = STAGE_ORDER.filter(
  (stage) => stage !== "pendiente_rechazar_dian",
);

function buildDevolverActions(stage: FacturacionStage): WorkflowAction[] {
  const currentIndex = DEVOLUCION_STAGE_ORDER.indexOf(stage);
  if (currentIndex <= 0) return [];

  return DEVOLUCION_STAGE_ORDER.slice(0, currentIndex)
    .reverse()
    .map((targetStage) => ({
      kind: "backward",
      label: `Devolver a ${STAGE_LABELS[targetStage] ?? targetStage}`,
      targetStage,
      tone: "warning" as const,
    }));
}

export const STAGE_LABELS: Record<string, string> = {
  recepcion: "Recepción",
  revision_lider: "Líder",
  jefe_directo: "Jefe directo",
  causacion: "Causación",
  revision_impuestos: "Contabilidad",
  eventos_dian: "Eventos DIAN",
  pendiente_rechazar_dian: "Rechazos DIAN",
  pendiente_nota_credito: "Pendiente NC (legacy)",
  nota_credito_cerrada: "Cerrada NC",
  reembolso_caja_menor: "Reembolso Caja Menor",
  gerencia: "Gerencia",
  revision_tesoreria: "Tesorería",
  pagada: "Pagada",
  legalizada: "Legalizada",
  cerrada: "Cerrada",
  rechazada: "Rechazada",
  rechazada_dian: "Rechazada DIAN",
};

export function getProgressStage(stage?: string | null) {
  if (stage === "jefe_directo") return "revision_lider";
  return stage ?? "recepcion";
}

export function isTerminalFacturacionStage(
  stage?: string | null,
): stage is FacturacionTerminal {
  return (
    stage === "pagada" ||
    stage === "legalizada" ||
    stage === "cerrada" ||
    stage === "rechazada" ||
    stage === "rechazada_dian" ||
    stage === "nota_credito_cerrada"
  );
}

export type TerminalTone = "success" | "closed" | "rejected";

export const TERMINAL_STAGE_META: Record<
  FacturacionTerminal,
  { label: string; tone: TerminalTone }
> = {
  pagada: { label: STAGE_LABELS.pagada, tone: "success" },
  legalizada: { label: STAGE_LABELS.legalizada, tone: "closed" },
  cerrada: { label: STAGE_LABELS.cerrada, tone: "closed" },
  nota_credito_cerrada: {
    label: STAGE_LABELS.nota_credito_cerrada,
    tone: "closed",
  },
  rechazada: { label: STAGE_LABELS.rechazada, tone: "rejected" },
  rechazada_dian: { label: STAGE_LABELS.rechazada_dian, tone: "rejected" },
};

export const TERMINAL_TONE_STYLES: Record<
  TerminalTone,
  { bar: string; chip: string; dot: string; text: string }
> = {
  success: {
    bar: "bg-emerald-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    text: "text-emerald-800",
  },
  closed: {
    bar: "bg-cyan-500",
    chip: "border-cyan-200 bg-cyan-50 text-cyan-800",
    dot: "bg-cyan-600",
    text: "text-cyan-800",
  },
  rejected: {
    bar: "bg-red-500",
    chip: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-red-500",
    text: "text-red-800",
  },
};

export type StageTransitionEvent = {
  estadoAnterior: string;
  estadoNuevo: string;
  creadoEn: number;
};

const TERMINAL_BRANCH_FALLBACK: Record<FacturacionTerminal, string> = {
  pagada: "revision_tesoreria",
  legalizada: "eventos_dian",
  cerrada: "recepcion",
  nota_credito_cerrada: "eventos_dian",
  rechazada_dian: "eventos_dian",
  rechazada: "recepcion",
};

export function getStageDisplayLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function getTerminalBranchStage(
  terminalStage: FacturacionTerminal,
  aprobaciones?: StageTransitionEvent[],
): string {
  const sorted = [...(aprobaciones ?? [])].sort((a, b) => b.creadoEn - a.creadoEn);
  const transition = sorted.find((event) => event.estadoNuevo === terminalStage);
  if (transition) {
    return getProgressStage(transition.estadoAnterior);
  }
  return TERMINAL_BRANCH_FALLBACK[terminalStage];
}

export function getStageIndexInOrder(
  stage: string,
  order: readonly string[] = STAGE_ORDER,
): number {
  const progressStage = getProgressStage(stage);
  if (progressStage === "pendiente_rechazar_dian") {
    const eventosIdx = order.indexOf("eventos_dian");
    return eventosIdx >= 0 ? eventosIdx : 0;
  }
  if (progressStage === "reembolso_caja_menor") {
    const causacionIdx = order.indexOf("causacion");
    return causacionIdx >= 0 ? causacionIdx : 0;
  }
  const idx = order.indexOf(progressStage);
  return idx >= 0 ? idx : 0;
}

export function getActiveStage(
  tarea: Pick<Doc<"facturacionTareas">, "estado"> & {
    faseAsignacion?: string;
  },
): FacturacionStage | FacturacionTerminal | string {
  return tarea.faseAsignacion ?? tarea.estado;
}

export function getPrimaryAction(
  stage: string,
  opts?: {
    hasPreviousContador?: boolean;
  },
): WorkflowAction | null {
  switch (stage) {
    case "recepcion":
      return {
        kind: "forward",
        label: "Asignar a Líder",
        targetStage: "revision_lider",
        needsAssignee: "lideres",
      };
    case "revision_lider":
      return {
        kind: "forward",
        label: "Asignar a Causación",
        targetStage: "causacion",
      };
    case "jefe_directo":
      return {
        kind: "forward",
        label: "Asignar a Causación",
        targetStage: "causacion",
      };
    case "causacion":
      return {
        kind: "forward",
        label: opts?.hasPreviousContador
          ? "Reenviar a Contabilidad"
          : "Asignar a Contabilidad",
        targetStage: "revision_impuestos",
        needsAssignee: opts?.hasPreviousContador ? undefined : "contadores",
      };
    case "revision_impuestos":
      return {
        kind: "forward",
        label: "Asignar a Eventos DIAN",
        targetStage: "eventos_dian",
        needsAssignee: "eventos_dian",
      };
    case "eventos_dian":
      return {
        kind: "forward",
        label: "Asignar a Gerencia",
        targetStage: "gerencia",
      };
    case "pendiente_rechazar_dian":
      return {
        kind: "confirm-reject-dian",
        label: "Confirmar rechazo DIAN",
        targetStage: "pendiente_rechazar_dian",
        tone: "destructive",
      };
    case "gerencia":
      return {
        kind: "forward",
        label: "Asignar a Tesorería",
        targetStage: "revision_tesoreria",
      };
    case "revision_tesoreria":
      return {
        kind: "confirm-paid",
        label: "Confirmar factura pagada",
        targetStage: "revision_tesoreria",
      };
    default:
      return null;
  }
}

export function getHorizontalActions(stage: string): WorkflowAction[] {
  switch (stage) {
    case "revision_lider":
      return [
        {
          kind: "assign-horizontal-lider",
          label: "Asignar a otro líder",
          needsAssignee: "lideres",
        },
      ];
    case "causacion":
      return [
        {
          kind: "assign-horizontal-par",
          label: "Asignar a otro par",
          needsAssignee: "analistas_causacion",
        },
      ];
    case "revision_impuestos":
      return [
        {
          kind: "assign-horizontal-par",
          label: "Asignar a otro par",
          needsAssignee: "contadores",
        },
      ];
    case "eventos_dian":
      return [
        {
          kind: "assign-horizontal-par",
          label: "Asignar a otro par",
          needsAssignee: "eventos_dian",
        },
      ];
    case "pendiente_rechazar_dian":
      return [
        {
          kind: "assign-horizontal-par",
          label: "Asignar a otro par",
          needsAssignee: "rechazos_dian",
        },
      ];
    case "gerencia":
      return [
        {
          kind: "assign-horizontal-par",
          label: "Asignar a otro par",
          needsAssignee: "gerencia",
        },
      ];
    default:
      return [];
  }
}

function appendCloseInvoiceAction(
  stage: string,
  actions: WorkflowAction[],
): WorkflowAction[] {
  if (!isCloseInvoicePhase(stage)) return actions;
  return [...actions, CLOSE_INVOICE_ACTION];
}

export function getSecondaryActions(stage: string): WorkflowAction[] {
  const rejectDian: WorkflowAction = {
    kind: "reject-dian",
    label: "Rechazar DIAN",
    tone: "destructive",
  };

  switch (stage) {
    case "revision_lider":
      return [
        ...getHorizontalActions(stage),
        {
          kind: "mark-caja-menor",
          label: "Marcar Caja Menor y enviar a Causación",
        },
        {
          kind: "mark-anticipo",
          label: "Marcar anticipo y enviar a Causación",
          targetStage: "causacion",
        },
        ...buildDevolverActions("revision_lider"),
        rejectDian,
      ];
    case "jefe_directo":
      return [
        {
          kind: "mark-anticipo",
          label: "Marcar anticipo y enviar a Causación",
          targetStage: "causacion",
        },
        {
          kind: "mark-caja-menor",
          label: "Marcar Caja Menor y enviar a Causación",
        },
        {
          kind: "backward",
          label: "Devolver a Líder",
          targetStage: "revision_lider",
          tone: "warning",
        },
        {
          kind: "close-nc",
          label: "Completar proceso y cerrar NC",
        },
        rejectDian,
      ];
    case "causacion":
      return appendCloseInvoiceAction(stage, [
        ...getHorizontalActions(stage),
        {
          kind: "cross-anticipo",
          label: "Cruzar anticipos",
        },
        ...buildDevolverActions("causacion"),
        {
          kind: "close-nc",
          label: "Completar proceso y cerrar NC",
        },
        rejectDian,
      ]);
    case "revision_impuestos":
      return appendCloseInvoiceAction(stage, [
        ...getHorizontalActions(stage),
        {
          kind: "legalize-caja-menor",
          label: "Completar y legalizar con Caja Menor",
        },
        {
          kind: "forward",
          label: "Asignar directo a Gerencia",
          targetStage: "gerencia",
        },
        ...buildDevolverActions("revision_impuestos"),
        {
          kind: "close-nc",
          label: "Completar proceso y cerrar NC",
        },
        rejectDian,
      ]);
    case "eventos_dian":
      return appendCloseInvoiceAction(stage, [
        ...getHorizontalActions(stage),
        {
          kind: "legalize",
          label: "Legalizar factura",
        },
        ...buildDevolverActions("eventos_dian"),
        {
          kind: "close-nc",
          label: "Completar proceso y cerrar NC",
        },
        rejectDian,
      ]);
    case "pendiente_rechazar_dian":
      return [...getHorizontalActions(stage)];
    case "gerencia":
      return appendCloseInvoiceAction(stage, [
        ...getHorizontalActions(stage),
        ...buildDevolverActions("gerencia"),
        {
          kind: "close-nc",
          label: "Completar proceso y cerrar NC",
        },
        rejectDian,
      ]);
    case "revision_tesoreria":
      return [
        {
          kind: "close-nc",
          label: "Completar proceso y cerrar NC",
        },
        {
          kind: "partial-payment",
          label: "Registrar pago parcial",
          targetStage: "revision_tesoreria",
        },
        ...buildDevolverActions("revision_tesoreria"),
        rejectDian,
      ];
    case "recepcion":
      return appendCloseInvoiceAction(stage, [rejectDian]);
    default:
      return [];
  }
}

export function getReturnMetadata(asignacion?: {
  metadata?: unknown;
} | null) {
  const metadata = asignacion?.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const row = metadata as Record<string, unknown>;
  if (row.origen !== "devolucion") return null;
  return {
    desde:
      typeof row.devueltaDesde === "string" ? row.devueltaDesde : undefined,
    hacia:
      typeof row.devueltaHacia === "string" ? row.devueltaHacia : undefined,
    motivo: typeof row.motivo === "string" ? row.motivo : undefined,
  };
}
