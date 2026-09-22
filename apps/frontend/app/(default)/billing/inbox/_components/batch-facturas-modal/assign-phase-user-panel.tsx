import { Flame } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FacturacionUsuario } from "../../../hooks/use-facturacion-users";
import { FacturacionUserPicker } from "../../../components/user-picker";
import {
  GERENCIA_PHASE_TARGETS,
  getUsersForGerenciaTargetStage,
  type GerenciaPhasePools,
} from "./assign-phase-user-utils";
import type { PhaseAssignmentDraft } from "./types";

export function AssignPhaseUserPanel({
  value,
  onChange,
  empresa,
  pools,
}: {
  value: PhaseAssignmentDraft;
  onChange: (next: PhaseAssignmentDraft) => void;
  empresa: number | null;
  pools: GerenciaPhasePools;
}) {
  const users = getUsersForGerenciaTargetStage(value.targetStage, empresa, pools);
  const usersEnabled = Boolean(value.targetStage) && users.length > 0;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
        <Flame className="h-4 w-4 text-red-600" />
        Asignar fase y usuario
      </div>

      <div className="grid gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Fase destino
        </p>
        <Select
          value={value.targetStage || undefined}
          onValueChange={(targetStage) =>
            onChange({ targetStage: targetStage as PhaseAssignmentDraft["targetStage"], assigneeId: "" })
          }
        >
          <SelectTrigger className="h-10 rounded-xl bg-white">
            <SelectValue placeholder="Selecciona una fase" />
          </SelectTrigger>
          <SelectContent>
            {GERENCIA_PHASE_TARGETS.map((target) => {
              const pool = getUsersForGerenciaTargetStage(target.stage, empresa, pools);
              const disabled = pool.length === 0;
              return (
                <SelectItem key={target.stage} value={target.stage} disabled={disabled}>
                  {disabled ? `${target.label} · Sin usuarios configurados` : target.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Usuario responsable
        </p>
        {!value.targetStage ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
            Selecciona primero la fase destino.
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
            Sin usuarios configurados para esta fase.
          </div>
        ) : (
          <FacturacionUserPicker
            usuarios={users}
            value={value.assigneeId || null}
            onChange={(next) =>
              onChange({
                ...value,
                assigneeId: next ?? "",
              })
            }
            placeholder="Selecciona un responsable"
            disabled={!usersEnabled}
          />
        )}
      </div>
    </div>
  );
}
