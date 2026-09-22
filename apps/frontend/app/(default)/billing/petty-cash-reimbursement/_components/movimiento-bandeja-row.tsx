"use client";

import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCOP } from "@/lib/format";
import {
  deriveCausacionEstado,
  formatCausacionEstadoLabel,
  formatFpDisplay,
} from "@/lib/facturacion-causacion";

import type { MovimientoBandejaRow } from "./types";

export function MovimientoBandejaRow({
  row,
  checked,
  onCheckedChange,
  onDevolver,
  devolverLoading,
}: {
  row: MovimientoBandejaRow;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onDevolver: () => void;
  devolverLoading?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(Boolean(value))}
        aria-label={`Seleccionar ${row.numeroFactura}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-950">{row.proveedor}</p>
          <p className="text-sm text-slate-500">{row.numeroFactura}</p>
        </div>
        <p className="mt-1 text-sm text-slate-600">{row.concepto}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            {row.centroCostoCodigo} · {row.centroCostoNombre}
          </span>
          <span>{row.fechaPago}</span>
          <span className="font-medium text-slate-800">{formatCOP(row.valor)}</span>
          <span>
            {formatCausacionEstadoLabel(deriveCausacionEstado(row.causado ?? undefined))}
            {" · "}
            {formatFpDisplay(row.causado ?? null, row.numeroFp ?? null)}
          </span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" aria-label="Acciones">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={devolverLoading} onClick={onDevolver}>
            Devolver a Buzón
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
