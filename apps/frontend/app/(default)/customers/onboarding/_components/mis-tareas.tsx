"use client";

import { useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FaseDialogs, type FaseDialogKey, faseDialogFor } from "./fase-dialogs";
import { FASE_CONFIG, TipoSolicitudChip } from "./ui-config";

type Tarea = Doc<"onboardingClientesFases"> & { inscripcion: Doc<"onboardingClientes"> };

export default function MisTareas({ tareas }: { tareas: Tarea[] | undefined }) {
  const [dialog, setDialog] = useState<FaseDialogKey | null>(null);
  const [selectedId, setSelectedId] = useState<Id<"onboardingClientes"> | null>(null);

  function abrirGestion(fase: string, inscripcionId: Id<"onboardingClientes">) {
    const key = faseDialogFor(fase);
    if (!key) return;
    setSelectedId(inscripcionId);
    setDialog(key);
  }

  const isLoading = tareas === undefined;

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <header className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
          <ClipboardList className="h-5 w-5 text-slate-500" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Mis Tareas</h2>
            <p className="text-sm text-slate-500">Inscripciones de clientes asignadas a ti que requieren acción.</p>
          </div>
          {!isLoading && (
            <span className="ml-auto text-sm text-slate-500">
              {tareas.length} {tareas.length === 1 ? "tarea" : "tareas"}
            </span>
          )}
        </header>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
          </div>
        ) : tareas.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">No tienes tareas pendientes.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tareas.map((tarea) => {
              const ins = tarea.inscripcion;
              const conf = FASE_CONFIG[tarea.fase];
              return (
                <div key={tarea._id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{ins.datos_generales_01.razonSocial ?? "—"}</p>
                    <p className="text-xs text-slate-500">
                      {ins.datos_generales_01.tipoDocumento} {ins.datos_generales_01.numeroDocumento}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={conf ? `${conf.bg} ${conf.color} ${conf.border}` : ""}>
                        {conf ? `${conf.short} · ${conf.label}` : tarea.fase}
                      </Badge>
                      <TipoSolicitudChip tipoSolicitud={ins.datos_generales_01.tipoSolicitud} />
                      {tarea.fechaInicio && (
                        <span className="text-xs text-slate-400">Desde {format(new Date(tarea.fechaInicio), "dd MMM yyyy", { locale: es })}</span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => abrirGestion(tarea.fase, tarea.inscripcionId)} disabled={!faseDialogFor(tarea.fase)}>
                    Gestionar
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <FaseDialogs
        inscripcionId={selectedId}
        dialog={dialog}
        onClose={() => {
          setDialog(null);
          setSelectedId(null);
        }}
      />
    </>
  );
}
