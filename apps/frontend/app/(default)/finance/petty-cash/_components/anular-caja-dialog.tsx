"use client";

import { Loader2, Trash2 } from "lucide-react";

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

import type { CajaRow } from "./types";

type AnularCajaDialogProps = {
  anularFor: CajaRow | null;
  isLoading: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function AnularCajaDialog({
  anularFor,
  isLoading,
  onConfirm,
  onOpenChange,
}: AnularCajaDialogProps) {
  return (
    <AlertDialog open={Boolean(anularFor)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Anular caja {anularFor?.nombre ? `"${anularFor.nombre}"` : ""}
          </AlertDialogTitle>
          <AlertDialogDescription>
            El historial se conservará y la caja dejará de aparecer en
            operaciones activas. Esta acción no elimina datos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-rose-600 hover:bg-rose-700"
            disabled={isLoading}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Anular caja
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
