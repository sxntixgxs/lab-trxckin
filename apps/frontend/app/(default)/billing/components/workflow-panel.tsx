"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useFacturacionUsers } from "../hooks/use-facturacion-users";
import { getFacturacionErrorMessage } from "../lib/user-facing-error";
import { FacturacionUserPicker } from "./user-picker";

export function FacturacionWorkflowPanel({
  tarea,
  currentUser,
}: {
  tarea: Doc<"facturacionTareas">;
  currentUser: {
    id?: string;
    nombre?: string;
    email?: string;
  };
}) {
  const { lideres, usuariosFinanzas } = useFacturacionUsers();
  const [comment, setComment] = useState("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [selectedReassignId, setSelectedReassignId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const accept = useMutation(api.facturacionTareas.aceptarFactura);
  const reject = useMutation(api.facturacionTareas.rechazarFactura);
  const sendToAnalysis = useMutation(api.facturacionTareas.enviarACausacion);
  const sendToTreasury = useMutation(api.facturacionTareas.enviarATesoreria);
  const markPaid = useMutation(api.facturacionTareas.registrarPago);
  const addComment = useMutation(api.facturacionTareas.agregarComentario);
  const reassign = useMutation(api.facturacionTareas.reasignar);
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);

  const actor = useMemo(
    () => ({
      actorUserId: currentUser.id,
      actorNombre: currentUser.nombre || currentUser.email || "Usuario",
      actorEmail: currentUser.email || "sin-correo@example.com",
    }),
    [currentUser.email, currentUser.id, currentUser.nombre],
  );

  const financeAssignee = usuariosFinanzas.find(
    (usuario) => usuario.id === selectedAssigneeId,
  );

  const reassignCandidates =
    tarea.estado === "revision_lider" ? lideres : usuariosFinanzas;
  const selectedReassignUser = reassignCandidates.find(
    (usuario) => usuario.id === selectedReassignId,
  );

  const isClosed =
    tarea.estado === "pagada" ||
    tarea.estado === "legalizada" ||
    tarea.estado === "cerrada" ||
    tarea.estado === "rechazada" ||
    tarea.estado === "rechazada_dian" ||
    tarea.estado === "nota_credito_cerrada";

  async function uploadProofIfNeeded() {
    if (!proofFile) return undefined;

    const uploadUrl = await generateUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": proofFile.type || "application/octet-stream",
      },
      body: proofFile,
    });

    const data = (await response.json()) as { storageId: string };
    return data.storageId;
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!comment.trim()) {
      toast.error("Registra un comentario para dejar trazabilidad.");
      return;
    }

    setLoading(true);
    try {
      await action();
      setComment("");
      setSelectedAssigneeId(null);
      setSelectedReassignId(null);
      setProofFile(null);
      toast.success(successMessage);
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo completar la operación. Revisa la información e intenta nuevamente.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
        Flujo operativo
      </h3>
      {isClosed ? (
        <p className="mt-4 text-sm text-slate-600">
          Esta factura ya cerró su ciclo. Solo queda disponible la trazabilidad.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Escribe el concepto, la decisión o la observación del flujo..."
            rows={4}
          />

          {tarea.estado === "aceptada" ? (
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900">
              La causación se asignará automáticamente según la distribución
              configurada en bloques de 10 facturas.
            </div>
          ) : null}

          {tarea.estado === "causacion" ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Asignar usuario de tesorería
              </p>
              <FacturacionUserPicker
                value={selectedAssigneeId}
                onChange={setSelectedAssigneeId}
                usuarios={usuariosFinanzas}
                placeholder="Buscar responsable de tesorería..."
              />
            </div>
          ) : null}

          {tarea.estado === "revision_tesoreria" ? (
            <div className="space-y-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Comprobante de pago
              </p>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <UploadCloud className="h-4 w-4 text-slate-500" />
                <span className="truncate">
                  {proofFile ? proofFile.name : "Seleccionar archivo soporte"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {tarea.estado === "revision_lider" ? (
              <>
                <Button
                  onClick={() =>
                    runAction(
                      async () => {
                        const args = {
                          tareaId: tarea._id,
                          ...actor,
                          comentario: comment.trim(),
                        };
                        await accept(args);
                        await sendToAnalysis(args);
                      },
                      "Factura aceptada y enviada a causación.",
                    )
                  }
                  disabled={loading}
                >
                  Aceptar y enviar a causación
                </Button>
                <Button variant="outline" onClick={() => runAction(() => reject({ tareaId: tarea._id, ...actor, comentario: comment.trim() }), "Factura rechazada.")} disabled={loading}>
                  Rechazar
                </Button>
              </>
            ) : null}

            {tarea.estado === "aceptada" ? (
              <Button
                onClick={() => {
                  void runAction(
                    () =>
                      sendToAnalysis({
                        tareaId: tarea._id,
                        ...actor,
                        comentario: comment.trim(),
                      }),
                    "Factura enviada a análisis financiero.",
                  );
                }}
                disabled={loading}
              >
                Enviar a análisis
              </Button>
            ) : null}

            {tarea.estado === "causacion" ? (
              <Button
                onClick={() => {
                  if (!financeAssignee) {
                    toast.error("Selecciona el usuario que recibirá tesorería.");
                    return;
                  }
                  void runAction(
                    () =>
                      sendToTreasury({
                        tareaId: tarea._id,
                        ...actor,
                        comentario: comment.trim(),
                        asignadoAUserId: financeAssignee.id,
                        asignadoANombre: financeAssignee.nombre,
                        asignadoAEmail: financeAssignee.email,
                      }),
                    "Factura enviada a tesorería.",
                  );
                }}
                disabled={loading}
              >
                Enviar a tesorería
              </Button>
            ) : null}

            {tarea.estado === "revision_tesoreria" ? (
              <Button
                onClick={() => {
                  void runAction(
                    async () => {
                      const storageId = await uploadProofIfNeeded();
                      await markPaid({
                        tareaId: tarea._id,
                        ...actor,
                        comentario: comment.trim(),
                        ...(storageId
                          ? {
                              comprobantePagoStorageId: storageId as Id<"_storage">,
                              comprobantePagoNombre: proofFile?.name,
                            }
                          : {}),
                      });
                    },
                    "Pago registrado.",
                  );
                }}
                disabled={loading}
              >
                Registrar pago
              </Button>
            ) : null}

            <Button
              variant="outline"
              onClick={() => runAction(() => addComment({ tareaId: tarea._id, ...actor, comentario: comment.trim() }), "Comentario guardado.")}
              disabled={loading}
            >
              Agregar comentario
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Reasignar tarea
            </p>
            <FacturacionUserPicker
              value={selectedReassignId}
              onChange={setSelectedReassignId}
              usuarios={reassignCandidates}
              placeholder={
                tarea.estado === "revision_lider"
                  ? "Buscar líder de proceso..."
                  : "Buscar usuario de Gestión Financiera..."
              }
            />
            <Button
              variant="outline"
              onClick={() => {
                if (!selectedReassignUser) {
                  toast.error("Selecciona el usuario al que deseas reasignar.");
                  return;
                }

                void runAction(
                  () =>
                    reassign({
                      tareaId: tarea._id,
                      ...actor,
                      comentario: comment.trim(),
                      nuevoAsignadoUserId: selectedReassignUser.id,
                      nuevoAsignadoNombre: selectedReassignUser.nombre,
                      nuevoAsignadoEmail: selectedReassignUser.email,
                      nuevoAsignadoProcesoId:
                        selectedReassignUser.id_proceso ?? undefined,
                      nuevoAsignadoProcesoNombre:
                        selectedReassignUser.proceso || undefined,
                    }),
                  "Tarea reasignada.",
                );
              }}
              disabled={loading}
            >
              Reasignar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
