"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Loader2, Package, Pencil, Plus, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { getOnboardingErrorMessage } from "./ui-config";

type RevisorRol = "COMPRAS" | "CUMPLIMIENTO_LOW_RISK";

const REVISOR_LABELS: Record<RevisorRol, string> = {
  COMPRAS: "Compras",
  CUMPLIMIENTO_LOW_RISK: "Cumplimiento",
};

interface ExtraDoc {
  docKey: string;
  docLabel: string;
  revisorRol: RevisorRol;
}

interface FormState {
  key: string;
  label: string;
  extraDocs: ExtraDoc[];
}

const EMPTY_FORM: FormState = { key: "", label: "", extraDocs: [] };
const EMPTY_DOC: ExtraDoc = { docKey: "", docLabel: "", revisorRol: "COMPRAS" };

function slugify(str: string) {
  return str
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function docKeyFromLabel(label: string) {
  return slugify(label)
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Supplier types per company with their extra required documents.
 * `soloCrear`: responsables may add types but not edit, disable or delete them.
 */
export default function ConfigTiposProveedor({ soloCrear = false }: { soloCrear?: boolean }) {
  const { empresaActiva, empresaActivaInfo } = useEmpresaFilter();
  const tipos = useQuery(api.onboarding.suppliersTipos.obtenerTiposProveedor, empresaActiva !== null ? { empresa: empresaActiva } : "skip");
  const crearTipo = useMutation(api.onboarding.suppliersTipos.crearTipoProveedor);
  const actualizarTipo = useMutation(api.onboarding.suppliersTipos.actualizarTipoProveedor);
  const eliminarTipo = useMutation(api.onboarding.suppliersTipos.eliminarTipoProveedor);
  const toggleActivo = useMutation(api.onboarding.suppliersTipos.toggleActivoTipoProveedor);
  const inicializarGeneral = useMutation(api.onboarding.suppliersTipos.inicializarTipoGeneral);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<Id<"onboardingProveedoresTipos"> | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"onboardingProveedoresTipos"> | null>(null);
  const [togglingId, setTogglingId] = useState<Id<"onboardingProveedoresTipos"> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<"onboardingProveedoresTipos"> | null>(null);

  const isLoading = empresaActiva !== null && tipos === undefined;

  // Seed the GENERAL type once per company (never during render).
  useEffect(() => {
    if (empresaActiva === null || tipos === undefined || tipos.length > 0) return;
    inicializarGeneral({ empresa: empresaActiva }).catch(() => {});
  }, [empresaActiva, tipos, inicializarGeneral]);

  function openCrear() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEditar(tipo: NonNullable<typeof tipos>[number]) {
    setEditId(tipo._id);
    setForm({ key: tipo.key, label: tipo.label, extraDocs: tipo.extraDocs as ExtraDoc[] });
    setDialogOpen(true);
  }

  function setLabel(label: string) {
    setForm((f) => ({ ...f, label, key: editId ? f.key : slugify(label) }));
  }

  function addDoc() {
    setForm((f) => ({ ...f, extraDocs: [...f.extraDocs, { ...EMPTY_DOC }] }));
  }

  function removeDoc(i: number) {
    setForm((f) => ({ ...f, extraDocs: f.extraDocs.filter((_, idx) => idx !== i) }));
  }

  function updateDoc(i: number, field: keyof ExtraDoc, value: string) {
    setForm((f) => {
      const docs = [...f.extraDocs];
      docs[i] = { ...docs[i], [field]: value };
      if (field === "docLabel" && !editId) docs[i].docKey = docKeyFromLabel(value);
      return { ...f, extraDocs: docs };
    });
  }

  async function handleGuardar() {
    if (soloCrear && editId) {
      toast.error("No tienes permiso para editar tipos de proveedor.");
      return;
    }
    if (empresaActiva === null) return;
    if (!form.label.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    if (!form.key.trim()) {
      toast.error("La clave es requerida");
      return;
    }
    for (const doc of form.extraDocs) {
      if (!doc.docKey.trim() || !doc.docLabel.trim()) {
        toast.error("Todos los documentos deben tener clave y nombre");
        return;
      }
    }
    setSaving(true);
    try {
      if (editId) {
        await actualizarTipo({ id: editId, label: form.label, extraDocs: form.extraDocs });
        toast.success("Tipo actualizado");
      } else {
        await crearTipo({ empresa: empresaActiva, key: form.key, label: form.label, extraDocs: form.extraDocs });
        toast.success("Tipo creado");
      }
      setDialogOpen(false);
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al guardar"));
    } finally {
      setSaving(false);
    }
  }

  async function handleEliminar(id: Id<"onboardingProveedoresTipos">) {
    setDeletingId(id);
    try {
      await eliminarTipo({ id });
      toast.success("Tipo eliminado");
      setConfirmDeleteId(null);
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al eliminar"));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(id: Id<"onboardingProveedoresTipos">) {
    setTogglingId(id);
    try {
      await toggleActivo({ id });
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error"));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-slate-500" />
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900">Tipos de Proveedor</h2>
              <p className="text-sm text-slate-500">
                {soloCrear
                  ? "Solo puedes crear nuevos tipos; no está permitido editar, desactivar ni eliminar."
                  : "Define los tipos de proveedor y los documentos adicionales que cada uno requiere."}
                {empresaActivaInfo && <span className="ml-1.5 font-medium text-blue-600">{empresaActivaInfo.nombre}</span>}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={openCrear} disabled={empresaActiva === null}>
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo tipo
          </Button>
        </header>

        <div className="space-y-3 p-6">
          {empresaActiva === null ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Building2 className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">Selecciona una empresa para ver sus tipos de proveedor.</p>
            </div>
          ) : isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : tipos!.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No hay tipos configurados.</p>
          ) : (
            tipos!.map((tipo) => {
              const isConfirmingDelete = confirmDeleteId === tipo._id;
              return (
                <div
                  key={tipo._id}
                  className={`rounded-lg border p-4 transition-colors ${tipo.activo ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-slate-50/40 opacity-60"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">{tipo.label}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {tipo.key}
                        </Badge>
                        {!tipo.activo && (
                          <Badge variant="outline" className="text-[10px] text-slate-400">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                      {tipo.extraDocs.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tipo.extraDocs.map((d) => (
                            <span
                              key={d.docKey}
                              className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700"
                            >
                              {d.docLabel}
                              <span className="text-indigo-400">· {REVISOR_LABELS[d.revisorRol as RevisorRol] ?? d.revisorRol}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-slate-400">Sin documentos adicionales (usa el conjunto base)</p>
                      )}
                    </div>

                    {!soloCrear && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          title={tipo.activo ? "Desactivar" : "Activar"}
                          onClick={() => handleToggle(tipo._id)}
                          disabled={togglingId === tipo._id}
                          className="rounded-xs p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                        >
                          {togglingId === tipo._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : tipo.activo ? (
                            <ToggleRight className="h-4 w-4 text-green-500" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditar(tipo)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {tipo.key !== "GENERAL" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                            onClick={() => setConfirmDeleteId(tipo._id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {!soloCrear && isConfirmingDelete && (
                    <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <span className="flex-1 text-xs text-red-700">¿Eliminar este tipo? Solo es posible si ninguna inscripción lo utiliza.</span>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-xs px-2 py-1 text-xs text-slate-500 hover:bg-white">
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEliminar(tipo._id)}
                        disabled={deletingId === tipo._id}
                        className="flex items-center gap-1 rounded-xs bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingId === tipo._id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Sí, eliminar
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!saving) setDialogOpen(o);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar tipo de proveedor" : "Nuevo tipo de proveedor"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input placeholder="ej: Construcción" value={form.label} onChange={(e) => setLabel(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Clave interna</Label>
              <Input
                placeholder="ej: CONSTRUCCION"
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: slugify(e.target.value) }))}
                disabled={!!editId}
                className={editId ? "bg-slate-50 text-slate-400" : ""}
              />
              <p className="text-[11px] text-slate-400">Identificador único. Se genera automáticamente desde el nombre y no puede cambiarse después.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Documentos adicionales</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addDoc}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Agregar doc
                </Button>
              </div>

              {form.extraDocs.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">
                  Sin documentos adicionales. Este tipo usará solo el conjunto base según el nivel de riesgo.
                </p>
              )}

              {form.extraDocs.map((doc, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-slate-400">Nombre del documento</Label>
                    <Input placeholder="ej: Póliza todo riesgo" value={doc.docLabel} onChange={(e) => updateDoc(i, "docLabel", e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-slate-400">Revisor</Label>
                    <Select value={doc.revisorRol} onValueChange={(v) => updateDoc(i, "revisorRol", v)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(REVISOR_LABELS) as RevisorRol[]).map((r) => (
                          <SelectItem key={r} value={r}>
                            {REVISOR_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <button type="button" onClick={() => removeDoc(i)} className="mt-5 rounded-xs p-1 text-slate-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                  <div className="col-span-3 -mt-1">
                    <Label className="text-[10px] uppercase tracking-wide text-slate-400">Clave interna del documento</Label>
                    <Input placeholder="clave_documento" value={doc.docKey} onChange={(e) => updateDoc(i, "docKey", e.target.value)} className="h-7 font-mono text-[11px]" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleGuardar} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editId ? "Guardar cambios" : "Crear tipo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
