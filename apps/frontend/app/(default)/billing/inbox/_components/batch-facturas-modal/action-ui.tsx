import {
  ArrowRight,
  Ban,
  ChevronDown,
  Coins,
  CornerUpLeft,
  FileCheck2,
  Flame,
  Lock,
  Sparkles,
  User,
  WalletCards,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STAGE_LABELS, type WorkflowAction } from "../../../lib/workflow-config";
import { getWorkflowActionKey } from "./workflow-plan-utils";

export function ActionSelector({
  action,
  actions,
  gerenciaActions = [],
  onSelect,
}: {
  action: WorkflowAction | null;
  actions: WorkflowAction[];
  gerenciaActions?: WorkflowAction[];
  onSelect: (action: WorkflowAction) => void;
}) {
  const advanceActions = actions.filter((item) =>
    ["forward", "confirm-paid", "confirm-no-disbursement", "skip-accounting-chain"].includes(item.kind) ||
    (item.kind === "legalize" && Boolean(item.skippedStages?.length)),
  );
  const horizontalActions = actions.filter((item) =>
    ["assign-horizontal-lider", "assign-horizontal-par"].includes(item.kind),
  );
  const otherActions = actions.filter((item) =>
    [
      "mark-anticipo",
      "mark-caja-menor",
      "legalize",
      "legalize-caja-menor",
      "partial-payment",
      "confirm-reject-dian",
      "close-nc",
      "close-invoice",
    ].includes(item.kind),
  );
  const returnActions = actions.filter((item) =>
    ["backward", "reject-dian"].includes(item.kind),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-between rounded-xl bg-white px-3"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            {action ? <ActionIcon action={action} /> : null}
            <span className="truncate">{action?.label ?? "Sin acción disponible"}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-medium text-slate-500">
          Avanzar a fase
        </DropdownMenuLabel>
        {advanceActions.length > 0 ? (
          advanceActions.map((item) => (
            <DropdownMenuItem key={getWorkflowActionKey(item)} onSelect={() => onSelect(item)}>
              <ActionIcon action={item} />
              {item.label}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>Sin avances disponibles</DropdownMenuItem>
        )}
        {horizontalActions.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-slate-500">
              Movimiento horizontal
            </DropdownMenuLabel>
            {horizontalActions.map((item) => (
              <DropdownMenuItem key={getWorkflowActionKey(item)} onSelect={() => onSelect(item)}>
                <ActionIcon action={item} />
                {item.label}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-slate-500">
          Otras
        </DropdownMenuLabel>
        {otherActions.length > 0 ? (
          otherActions.map((item) => (
            <DropdownMenuItem key={getWorkflowActionKey(item)} onSelect={() => onSelect(item)}>
              <ActionIcon action={item} />
              {item.label}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>Sin otras acciones</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-slate-500">
          Regresar o rechazar
        </DropdownMenuLabel>
        {returnActions.length > 0 ? (
          returnActions.map((item) => (
            <DropdownMenuItem
              key={getWorkflowActionKey(item)}
              className={
                item.kind === "reject-dian"
                  ? "text-rose-600 focus:text-rose-700"
                  : item.kind === "backward"
                    ? "text-amber-700 focus:text-amber-800"
                    : ""
              }
              onSelect={() => onSelect(item)}
            >
              <ActionIcon action={item} />
              {item.label}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>Sin devoluciones disponibles</DropdownMenuItem>
        )}
        {gerenciaActions.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-slate-500">
              Gestión de Gerencia
            </DropdownMenuLabel>
            {gerenciaActions.map((item) => (
              <DropdownMenuItem key={getWorkflowActionKey(item)} onSelect={() => onSelect(item)}>
                <Flame className="h-4 w-4 text-red-600" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ActionChip({ action }: { action: WorkflowAction | null }) {
  if (!action) {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500">
        Sin acción
      </span>
    );
  }
  return (
    <span className={`inline-flex max-w-[150px] items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${getActionToneClasses(action)}`}>
      <ActionIcon action={action} className="h-3 w-3" />
      <span className="truncate">{action.label}</span>
    </span>
  );
}

export function ActionIcon({
  action,
  className = "h-4 w-4",
}: {
  action: WorkflowAction;
  className?: string;
}) {
  const category = getActionCategory(action);
  if (category === "reject") return <Ban className={`${className} text-rose-600`} />;
  if (category === "return") return <CornerUpLeft className={`${className} text-amber-600`} />;
  if (category === "horizontal") return <User className={`${className} text-violet-600`} />;
  if (category === "anticipo") return <Sparkles className={`${className} text-blue-600`} />;
  if (category === "caja") return <WalletCards className={`${className} text-teal-600`} />;
  if (category === "partial") return <Coins className={`${className} text-sky-600`} />;
  if (category === "close-nc") return <FileCheck2 className={`${className} text-cyan-600`} />;
  if (category === "close-invoice") return <Lock className={`${className} text-cyan-600`} />;
  if (category === "gerencia-management") {
    return <Flame className={`${className} text-red-600`} />;
  }
  return <ArrowRight className={`${className} text-emerald-600`} />;
}

function getActionToneClasses(action: WorkflowAction) {
  const category = getActionCategory(action);
  if (category === "reject") return "border-rose-200 bg-rose-50 text-rose-700";
  if (category === "return") return "border-amber-200 bg-amber-50 text-amber-700";
  if (category === "horizontal") return "border-violet-200 bg-violet-50 text-violet-700";
  if (category === "anticipo") return "border-blue-200 bg-blue-50 text-blue-700";
  if (category === "caja") return "border-teal-200 bg-teal-50 text-teal-700";
  if (category === "partial") return "border-sky-200 bg-sky-50 text-sky-700";
  if (category === "close-nc") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (category === "close-invoice") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getActionCategory(action: WorkflowAction) {
  if (action.kind === "reject-dian" || action.kind === "confirm-reject-dian") {
    return "reject";
  }
  if (action.kind === "backward") return "return";
  if (
    action.kind === "assign-horizontal-lider" ||
    action.kind === "assign-horizontal-par"
  ) {
    return "horizontal";
  }
  if (action.kind === "mark-anticipo" || action.kind === "cross-anticipo") {
    return "anticipo";
  }
  if (action.kind === "mark-caja-menor" || action.kind === "legalize-caja-menor") {
    return "caja";
  }
  if (action.kind === "partial-payment") {
    return "partial";
  }
  if (action.kind === "close-nc") {
    return "close-nc";
  }
  if (action.kind === "close-invoice") {
    return "close-invoice";
  }
  if (action.kind === "assign-phase-user") {
    return "gerencia-management";
  }
  return "advance";
}

export function getActionResultLabel(action: WorkflowAction) {
  if (action.kind === "backward" && action.targetStage) {
    return `Devuelve a ${STAGE_LABELS[action.targetStage] ?? action.targetStage}`;
  }
  if (action.kind === "assign-jefe") {
    return "Asigna a Jefe directo";
  }
  if (action.kind === "assign-horizontal-lider") {
    return "Completa tu revisión y asigna a otro(s) líder(es)";
  }
  if (action.kind === "assign-horizontal-par") {
    return "Transfiere la factura a otro par en la misma fase";
  }
  if (action.kind === "mark-anticipo") {
    return "Marca como anticipo y avanza a Causación";
  }
  if (action.kind === "mark-caja-menor") {
    return "Marca Caja Menor y avanza a Causación";
  }
  if (action.kind === "legalize") {
    if (action.skippedStages?.length) {
      return "Estado terminal: Legalizada (salto contable)";
    }
    return "Estado terminal: Legalizada";
  }
  if (action.kind === "legalize-caja-menor") {
    return "Estado terminal: Legalizada con Caja Menor";
  }
  if (action.kind === "confirm-paid") {
    return "Estado terminal: Pagada";
  }
  if (action.kind === "confirm-no-disbursement") {
    return "Estado terminal: Legalizada";
  }
  if (action.kind === "partial-payment") {
    return "Registra un pago parcial y permanece en Tesorería";
  }
  if (action.kind === "skip-accounting-chain" && action.targetStage) {
    return `Completa fases contables y avanza a ${
      STAGE_LABELS[action.targetStage] ?? action.targetStage
    }`;
  }
  if (action.kind === "reject-dian") {
    return "Envía a la cola de Rechazos DIAN";
  }
  if (action.kind === "confirm-reject-dian") {
    return "Estado terminal: Rechazada DIAN";
  }
  if (action.kind === "close-nc") {
    return "Estado terminal: Cerrada NC";
  }
  if (action.kind === "close-invoice") {
    return "Estado terminal: Cerrada";
  }
  if (action.kind === "assign-phase-user") {
    return "Reasigna fase y responsable desde Gerencia";
  }
  if (action.targetStage) {
    return `Avanza a ${STAGE_LABELS[action.targetStage] ?? action.targetStage}`;
  }
  return action.label;
}
