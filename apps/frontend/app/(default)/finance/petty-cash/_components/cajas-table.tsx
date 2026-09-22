"use client";

import { Eye, Receipt, Trash2, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getSaldoDisponibleTextClass } from "@/lib/cajas-menores";
import { formatCOP } from "@/lib/format";
import { getEmpresaNombre } from "@/lib/empresas";
import type { FacturacionUsuario } from "@/app/(default)/billing/hooks/use-facturacion-users";

import { CajaStatus } from "./caja-status";
import type { CajaRow } from "./types";

type CajasTableProps = {
  rows: CajaRow[];
  totalCount: number;
  mostrarAnuladas: boolean;
  onToggleAnuladas: () => void;
  usuariosById: Map<string, FacturacionUsuario>;
  onDetail: (row: CajaRow) => void;
  onRefill: (row: CajaRow) => void;
  onEdit: (row: CajaRow) => void;
  onAnular: (row: CajaRow) => void;
  showPermitirSaldoNegativo?: boolean;
  permitirSaldoNegativo?: boolean;
  onRequestTogglePermitirSaldoNegativo?: () => void;
};

export function CajasTable({
  rows,
  totalCount,
  mostrarAnuladas,
  onToggleAnuladas,
  usuariosById,
  onDetail,
  onRefill,
  onEdit,
  onAnular,
  showPermitirSaldoNegativo = false,
  permitirSaldoNegativo = false,
  onRequestTogglePermitirSaldoNegativo,
}: CajasTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <WalletCards className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-950">Cajas Menores</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {totalCount} caja(s) en el alcance actual.
          </p>
        </div>
        {showPermitirSaldoNegativo ? (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Checkbox
              checked={permitirSaldoNegativo}
              onCheckedChange={() => onRequestTogglePermitirSaldoNegativo?.()}
            />
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
              Permitir saldos negativos
            </span>
          </label>
        ) : null}
        <Button
          type="button"
          variant={mostrarAnuladas ? "default" : "outline"}
          size="sm"
          className="rounded-xl"
          onClick={onToggleAnuladas}
        >
          {mostrarAnuladas ? "Ocultar anuladas" : "Mostrar anuladas"}
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <WalletCards className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-slate-700">
            No hay cajas en el alcance actual
          </p>
          <p className="text-xs text-slate-500">
            Crea una nueva caja menor para empezar a gestionar reembolsos.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Caja</th>
                <th className="px-5 py-3 font-semibold">Custodios</th>
                <th className="px-5 py-3 text-right font-semibold">Asignado</th>
                <th className="px-5 py-3 text-right font-semibold">Legalizado</th>
                <th className="px-5 py-3 text-right font-semibold">Disponible</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const asignadoTotal = row.assignedValue + row.totalRefills;
                const custodios = row.assignedUsersIds;
                return (
                  <tr key={row._id} className="group transition hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                          <WalletCards className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{row.nombre}</p>
                          <p className="text-xs text-slate-500">
                            {getEmpresaNombre(row.empresa_id)}
                            {row.observations ? ` · ${row.observations}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex max-w-[240px] flex-wrap items-center gap-1">
                        {custodios.slice(0, 2).map((id) => (
                          <Badge
                            key={id}
                            variant="outline"
                            className="rounded-full bg-white font-medium"
                          >
                            {usuariosById.get(id)?.nombre ?? id}
                          </Badge>
                        ))}
                        {custodios.length > 2 ? (
                          <Badge
                            variant="outline"
                            className="rounded-full bg-slate-50 font-semibold text-slate-500"
                          >
                            +{custodios.length - 2}
                          </Badge>
                        ) : null}
                        {custodios.length === 0 ? (
                          <span className="text-xs text-slate-400">Sin custodios</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-700">
                      {formatCOP(asignadoTotal)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-500">
                      {formatCOP(row.totalLegalizado)}
                    </td>
                    <td
                      className={`px-5 py-4 text-right ${getSaldoDisponibleTextClass(row.saldoDisponible)}`}
                    >
                      {formatCOP(row.saldoDisponible)}
                    </td>
                    <td className="px-5 py-4">
                      <CajaStatus row={row} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-lg"
                          title="Ver detalle"
                          onClick={() => onDetail(row)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {row.canManage && row.estado !== "anulado" ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg bg-white"
                              onClick={() => onRefill(row)}
                            >
                              <Receipt className="mr-1 h-3.5 w-3.5" />
                              Refill
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg bg-white"
                              onClick={() => onEdit(row)}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                              title="Anular caja"
                              onClick={() => onAnular(row)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
