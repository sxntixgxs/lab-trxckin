"use client";

import type { ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { cn } from "@/lib/utils";

export function ReembolsoWorkspaceShell({
  open,
  title,
  description,
  onOpenChange,
  onRequestClose,
  header,
  list,
  viewer,
  panel,
  listCollapsed,
  onToggleList,
  mobileBlocked = false,
  allowNarrowActions = false,
  className,
}: {
  open: boolean;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  onRequestClose?: () => void;
  header: ReactNode;
  list: ReactNode;
  viewer: ReactNode;
  panel: ReactNode;
  listCollapsed?: boolean;
  onToggleList?: () => void;
  mobileBlocked?: boolean;
  /** When true, actionable review works at 640–1023px with three stacked panes. */
  allowNarrowActions?: boolean;
  className?: string;
}) {
  const blockedCopy = allowNarrowActions
    ? {
        title: "Revisión requiere una ventana más amplia",
        body: "Aquí puedes consultar facturas y abrir/descargar documentos. Usa una ventana de al menos 640 px para aprobar o rechazar.",
      }
    : {
        title: "Generación y decisión requieren escritorio",
        body: "Aquí puedes consultar facturas y abrir/descargar documentos. Usa una pantalla ≥ 1024 px para aprobar, rechazar o generar.",
      };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && onRequestClose) {
          onRequestClose();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={cn(
          "flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1600px] flex-col gap-0 overflow-hidden p-0 [&>button]:hidden",
          className,
        )}
      >
        <VisuallyHidden>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </VisuallyHidden>

        <div
          className={cn(
            "flex shrink-0 items-start gap-3 border-b border-slate-200 bg-white px-4 py-3 pr-12",
            allowNarrowActions && "sm:max-lg:px-3 sm:max-lg:py-2 sm:max-lg:pr-11",
          )}
        >
          <div className="min-w-0 flex-1">{header}</div>
          <div className="flex shrink-0 items-center gap-1">
            {onToggleList ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden h-8 rounded-lg lg:inline-flex xl:hidden"
                onClick={onToggleList}
              >
                <Menu className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Facturas
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-lg p-0"
              onClick={() => {
                if (onRequestClose) onRequestClose();
                else onOpenChange(false);
              }}
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        {allowNarrowActions ? (
          <>
            {/* Phone (<640px): consultation only */}
            <div className="flex min-h-0 flex-1 flex-col sm:hidden">
              {mobileBlocked ? (
                <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-950">
                  <p className="font-semibold">{blockedCopy.title}</p>
                  <p className="mt-0.5 text-amber-900">{blockedCopy.body}</p>
                </div>
              ) : null}
              <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,32%)_minmax(0,1fr)]">
                <div className="min-h-0 overflow-hidden border-b border-slate-200">
                  {list}
                </div>
                <div className="min-h-0 overflow-hidden bg-slate-100">
                  {viewer}
                </div>
              </div>
              {!mobileBlocked ? (
                <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-slate-200">
                  {panel}
                </div>
              ) : null}
            </div>

            {/* Half-screen (640–1023px): three bounded panes */}
            <div className="hidden min-h-0 flex-1 grid-rows-[24%_38%_38%] sm:grid lg:hidden">
              <div className="min-h-0 overflow-hidden border-b border-slate-200">
                {list}
              </div>
              <div className="min-h-0 overflow-hidden border-b border-slate-200 bg-slate-100">
                {viewer}
              </div>
              <div className="min-h-0 overflow-y-auto">{panel}</div>
            </div>
          </>
        ) : (
          /* Mobile / tablet (<1024px): basic consultation */
          <div className="flex min-h-0 flex-1 flex-col lg:hidden">
            {mobileBlocked ? (
              <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-950">
                <p className="font-semibold">{blockedCopy.title}</p>
                <p className="mt-0.5 text-amber-900">{blockedCopy.body}</p>
              </div>
            ) : null}
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,32%)_minmax(0,1fr)]">
              <div className="min-h-0 overflow-hidden border-b border-slate-200">
                {list}
              </div>
              <div className="min-h-0 overflow-hidden bg-slate-100">{viewer}</div>
            </div>
            {!mobileBlocked ? (
              <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-slate-200">
                {panel}
              </div>
            ) : null}
          </div>
        )}

        {/* Desktop workspace (≥1024px) */}
        <div
          className={cn(
            "hidden min-h-0 flex-1 lg:grid",
            listCollapsed
              ? "grid-cols-[0_minmax(0,1fr)_minmax(340px,380px)]"
              : "grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(340px,380px)]",
          )}
        >
          <aside
            className={cn(
              "min-h-0 overflow-hidden border-r border-slate-200 bg-slate-50/60 transition-[width]",
              listCollapsed && "pointer-events-none w-0 border-r-0 opacity-0",
            )}
          >
            {list}
          </aside>
          <main className="min-h-0 min-w-0 overflow-hidden bg-slate-100">
            {viewer}
          </main>
          <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white">
            {panel}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
