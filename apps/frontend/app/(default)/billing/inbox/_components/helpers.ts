import { useMemo } from "react";

import { FACTURACION_STATUS_LABELS } from "../../components/status-badge";
import type { BuzonTarea } from "../../components/buzon-row";
import type { FacturacionUsuario } from "../../hooks/use-facturacion-users";
import type { ConfigUsuario, FilterKey } from "./types";

const BUZON_ESTADO_VALUES = [
  "recepcion",
  "revision_lider",
  "jefe_directo",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "pendiente_rechazar_dian",
  "reembolso_caja_menor",
  "gerencia",
  "revision_tesoreria",
] as const;

export const BUZON_ESTADO_OPCIONES = BUZON_ESTADO_VALUES.map((value) => ({
  value,
  label: FACTURACION_STATUS_LABELS[value] ?? value,
}));

export const FILTER_LABELS: Record<FilterKey, string> = {
  todas: "Mi buzón",
  por_vencer: "Por vencer",
  anticipos: "Anticipos",
  cajas_menores: "Cajas Menores",
  devueltas: "Devueltas",
};

export function useConfiguredUsers(
  config: Record<string, ConfigUsuario[]> | undefined,
  byId: Map<string, FacturacionUsuario>,
) {
  return useMemo(() => {
    const result: Record<number, FacturacionUsuario[]> = {};
    for (const [empresa, lista] of Object.entries(config ?? {})) {
      result[Number(empresa)] = lista.map((usuario) => {
        const found = byId.get(usuario.usuarioId);
        return (
          found ?? {
            id: usuario.usuarioId,
            nombre: usuario.nombre,
            email: usuario.email.trim().toLowerCase(),
            cedula: "",
            cargo: "",
            telf: "",
            id_proceso: null,
            proceso: "",
            lider_proceso: false,
            activo: true,
          }
        );
      });
    }
    return result;
  }, [byId, config]);
}

export function getTaskKey(tarea: BuzonTarea) {
  return String(tarea.asignacionId ?? tarea._id);
}

export function getDueLabel(fecha?: string) {
  if (!fecha) {
    return { label: "Sin vencimiento", className: "text-xs text-slate-500", overdue: false };
  }
  const due = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(due.getTime())) {
    return { label: "Vencimiento inválido", className: "text-xs text-slate-500", overdue: false };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) {
    return {
      label: `Vencida hace ${Math.abs(diff)} días`,
      className: "text-xs font-medium text-rose-600",
      overdue: true,
    };
  }
  if (diff === 0) {
    return {
      label: "Vence hoy",
      className: "text-xs font-medium text-amber-700",
      overdue: false,
    };
  }
  return {
    label: `Vence en ${diff} días`,
    className: diff <= 7 ? "text-xs font-medium text-amber-700" : "text-xs text-slate-500",
    overdue: false,
  };
}

export function isDueSoon(fecha?: string) {
  if (!fecha) return false;
  const due = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  return diff <= 7;
}

export function toDateKey(ms: number) {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDateInRange(
  dateKey: string | undefined,
  desde?: string,
  hasta?: string,
) {
  if (!dateKey) return false;
  if (desde && dateKey < desde) return false;
  if (hasta && dateKey > hasta) return false;
  return true;
}
