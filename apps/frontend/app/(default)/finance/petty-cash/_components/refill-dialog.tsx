"use client";

import { Coins, Loader2, NotebookPen, Receipt, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseMoneyInput } from "@/lib/cajas-menores";
import { formatCOP } from "@/lib/format";
import { FacturacionUserPicker } from "@/app/(default)/billing/components/user-picker";
import type { FacturacionUsuario } from "@/app/(default)/billing/hooks/use-facturacion-users";

import { Field } from "./field";
import type { CajaRow } from "./types";

type RefillDialogProps = {
  refillFor: CajaRow | null;
  refillValue: string;
  onRefillValueChange: (value: string) => void;
  refillToUserId: string | null;
  onRefillToUserIdChange: (userId: string | null) => void;
  refillObservations: string;
  onRefillObservationsChange: (value: string) => void;
  usuarios: FacturacionUsuario[];
  saving: boolean;
  onSubmit: () => void;
  onClose: () => void;
};

export function RefillDialog({
  refillFor,
  refillValue,
  onRefillValueChange,
  refillToUserId,
  onRefillToUserIdChange,
  refillObservations,
  onRefillObservationsChange,
  usuarios,
  saving,
  onSubmit,
  onClose,
}: RefillDialogProps) {
  return (
    <Dialog open={Boolean(refillFor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 bg-slate-50/60 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base">
                Crear refill {refillFor ? `· ${refillFor.nombre}` : ""}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                El saldo aumenta al guardar, pero la caja queda bloqueada hasta
                confirmar el recibo del custodio.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-5 px-6 py-5">
          <Field label="Valor del refill" icon={<Coins className="h-3.5 w-3.5" />}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                $
              </span>
              <Input
                value={refillValue}
                onChange={(event) => onRefillValueChange(event.target.value)}
                inputMode="numeric"
                placeholder="0"
                className="pl-7 text-right tabular-nums"
              />
            </div>
            {parseMoneyInput(refillValue) > 0 ? (
              <p className="text-right text-sm font-bold text-teal-700">
                {formatCOP(parseMoneyInput(refillValue))}
              </p>
            ) : null}
          </Field>

          <Field label="Custodio que recibe" icon={<UsersRound className="h-3.5 w-3.5" />}>
            <FacturacionUserPicker
              value={refillToUserId}
              onChange={onRefillToUserIdChange}
              usuarios={usuarios.filter((usuario) =>
                refillFor?.assignedUsersIds.includes(usuario.id),
              )}
              placeholder="Usuario que recibe"
            />
          </Field>

          <Field
            label="Observaciones"
            icon={<NotebookPen className="h-3.5 w-3.5" />}
            optional
          >
            <Textarea
              value={refillObservations}
              onChange={(event) => onRefillObservationsChange(event.target.value)}
              placeholder="Motivo o detalle del refill..."
              className="resize-none"
              rows={3}
            />
          </Field>
        </div>

        <DialogFooter className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={saving || !refillToUserId || parseMoneyInput(refillValue) <= 0}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Crear refill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
