"use client";

import { Coins, Loader2, NotebookPen, Tag, UsersRound, WalletCards } from "lucide-react";

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
import type { FacturacionUsuario } from "@/app/(default)/billing/hooks/use-facturacion-users";

import { Field } from "./field";
import { MultiUserPicker } from "./multi-user-picker";
import type { CajaFormState, CajaRow } from "./types";

type CajaFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CajaRow | null;
  form: CajaFormState;
  onFormChange: (form: CajaFormState) => void;
  usuarios: FacturacionUsuario[];
  saving: boolean;
  onSubmit: () => void;
};

export function CajaFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  usuarios,
  saving,
  onSubmit,
}: CajaFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 bg-slate-50/60 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <WalletCards className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base">
                {editing ? "Editar Caja Menor" : "Nueva Caja Menor"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                Define custodios y valor inicial. Los incrementos posteriores se
                registran como refills.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-5 px-6 py-5">
          <Field
            label="Nombre o código"
            icon={<Tag className="h-3.5 w-3.5" />}
            hint="Identifica la caja, p. ej. CX-2104-EQUIPOS."
          >
            <Input
              value={form.nombre}
              onChange={(event) =>
                onFormChange({ ...form, nombre: event.target.value })
              }
              placeholder="CX-0000-AREA"
            />
          </Field>

          <Field
            label="Valor asignado inicial"
            icon={<Coins className="h-3.5 w-3.5" />}
            hint={
              editing
                ? "El valor base no se edita; usa refills para incrementarlo."
                : "Monto base de la caja. Los refills se registran aparte."
            }
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                $
              </span>
              <Input
                value={form.assignedValue}
                onChange={(event) =>
                  onFormChange({ ...form, assignedValue: event.target.value })
                }
                inputMode="numeric"
                placeholder="0"
                className="pl-7 text-right tabular-nums"
                disabled={Boolean(editing)}
              />
            </div>
            {!editing && parseMoneyInput(form.assignedValue) > 0 ? (
              <p className="text-right text-sm font-bold text-emerald-700">
                {formatCOP(parseMoneyInput(form.assignedValue))}
              </p>
            ) : null}
          </Field>

          <Field
            label="Custodios"
            icon={<UsersRound className="h-3.5 w-3.5" />}
            hint="Usuarios que reciben y usan el efectivo de la caja."
          >
            <MultiUserPicker
              usuarios={usuarios}
              selectedIds={form.assignedUsersIds}
              onChange={(ids) => onFormChange({ ...form, assignedUsersIds: ids })}
              placeholder="Agregar custodio..."
            />
          </Field>

          <Field
            label="Observaciones"
            icon={<NotebookPen className="h-3.5 w-3.5" />}
            optional
          >
            <Textarea
              value={form.observations}
              onChange={(event) =>
                onFormChange({ ...form, observations: event.target.value })
              }
              placeholder="Notas internas sobre el uso de la caja..."
              className="resize-none"
              rows={3}
            />
          </Field>
        </div>

        <DialogFooter className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={saving || !form.nombre.trim() || form.assignedUsersIds.length === 0}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {editing ? "Guardar cambios" : "Crear caja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
