"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { esProcesoGestionFinanciera } from "../../billing/hooks/use-facturacion-users";
import { createProceso, deleteProceso, patchProceso } from "./usuarios-api";
import type { ProcesoOption, UsuarioDirectory } from "./usuarios-types";

const SIN_LIDER = "__none__";

interface ProcesosPanelProps {
  procesos: ProcesoOption[];
  usuarios: UsuarioDirectory[];
  onChanged: () => void;
}

export default function ProcesosPanel({ procesos, usuarios, onChanged }: ProcesosPanelProps) {
  const [nombre, setNombre] = useState("");
  const [liderId, setLiderId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editLiderId, setEditLiderId] = useState(SIN_LIDER);

  const handleCreate = async () => {
    if (nombre.trim().length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }
    setSaving(true);
    const result = await createProceso({
      nombre: nombre.trim(),
      ...(liderId ? { lider_user_id: liderId } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setNombre("");
    setLiderId("");
    toast.success("Proceso creado");
    onChanged();
  };

  const startEdit = (proceso: ProcesoOption) => {
    setEditingId(proceso.id);
    setEditNombre(proceso.nombre);
    setEditLiderId(proceso.lider_user_id ?? proceso.lider?.id ?? SIN_LIDER);
  };

  const handleUpdate = async () => {
    if (editingId === null) {
      return;
    }
    if (editNombre.trim().length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }
    setSaving(true);
    const result = await patchProceso(editingId, {
      nombre: editNombre.trim(),
      lider_user_id: editLiderId === SIN_LIDER ? null : editLiderId,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setEditingId(null);
    toast.success("Proceso actualizado");
    onChanged();
  };

  const handleDelete = async (id: number) => {
    const result = await deleteProceso(id);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Proceso eliminado");
    onChanged();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Procesos / áreas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          El líder del proceso es quien aparece en Billing inbox y en anticipos. El proceso{" "}
          <strong>Gestión Financiera</strong> es el que convierte a un usuario en analista,
          tesorero o contador dentro de Billing → Settings.
        </p>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="proceso-nombre">Nombre</Label>
            <Input
              id="proceso-nombre"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Operaciones"
            />
          </div>
          <div className="space-y-1">
            <Label>Líder</Label>
            <Select value={liderId} onValueChange={setLiderId}>
              <SelectTrigger>
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                {usuarios.map((usuario) => (
                  <SelectItem key={usuario.id} value={usuario.id}>
                    {usuario.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={() => void handleCreate()} disabled={saving}>
              {saving && editingId === null ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Crear
            </Button>
          </div>
        </div>
        <div className="divide-y rounded-lg border">
          {procesos.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Aún no hay procesos.</p>
          ) : (
            procesos.map((proceso) => {
              const esFinanzas = esProcesoGestionFinanciera(proceso.nombre);
              const miembros = usuarios.filter((usuario) => usuario.id_proceso === proceso.id).length;
              if (editingId === proceso.id) {
                return (
                  <div key={proceso.id} className="space-y-3 bg-slate-50 p-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input value={editNombre} onChange={(event) => setEditNombre(event.target.value)} />
                      <Select value={editLiderId} onValueChange={setEditLiderId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin líder" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SIN_LIDER}>Sin líder</SelectItem>
                          {usuarios.map((usuario) => (
                            <SelectItem key={usuario.id} value={usuario.id}>
                              {usuario.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => void handleUpdate()} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Guardar
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        <X className="mr-1 h-4 w-4" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={proceso.id} className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{proceso.nombre}</p>
                      {esFinanzas ? (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Billing finanzas</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {proceso.lider?.nombre ?? "Sin líder"} · {miembros} usuario
                      {miembros === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => startEdit(proceso)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleDelete(proceso.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
