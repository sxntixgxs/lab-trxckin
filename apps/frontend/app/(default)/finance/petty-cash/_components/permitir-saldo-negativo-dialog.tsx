"use client";

import { Loader2 } from "lucide-react";

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

type PermitirSaldoNegativoDialogProps = {
  open: boolean;
  activating: boolean;
  isLoading: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function PermitirSaldoNegativoDialog({
  open,
  activating,
  isLoading,
  onConfirm,
  onOpenChange,
}: PermitirSaldoNegativoDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {activating
              ? "Activar permitir saldos negativos"
              : "Desactivar permitir saldos negativos"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {activating ? (
              <>
                Los movimientos y legalizaciones podrán superar el saldo
                disponible de las cajas menores de esta empresa. El disponible
                puede quedar en valores negativos hasta que se haga un refill o
                reembolso.
              </>
            ) : (
              <>
                Los nuevos movimientos volverán a validar el saldo disponible.
                Las cajas que ya tengan saldo negativo seguirán mostrando el
                valor real, pero no podrás registrar más movimientos que excedan
                el disponible.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={activating ? "bg-amber-600 hover:bg-amber-700" : undefined}
            disabled={isLoading}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {activating ? "Activar" : "Desactivar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
