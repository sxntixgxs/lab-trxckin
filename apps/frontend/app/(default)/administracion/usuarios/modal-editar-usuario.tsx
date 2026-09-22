"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { patchUsuario } from "./usuarios-api";
import {
  CARGOS_SUGERIDOS,
  SIN_JEFE,
  SIN_PROCESO,
  uniqueCargos,
  UsuarioOrgFields,
  type UsuarioOrgValues,
} from "./usuario-org-fields";
import type { ProcesoOption, RolOption, UsuarioDirectory } from "./usuarios-types";

interface ModalEditarUsuarioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: UsuarioDirectory | null;
  roles: RolOption[];
  procesos: ProcesoOption[];
  usuarios: UsuarioDirectory[];
  currentUserId: string;
  onSaved: () => void;
}

export default function ModalEditarUsuario({
  open,
  onOpenChange,
  usuario,
  roles,
  procesos,
  usuarios,
  currentUserId,
  onSaved,
}: ModalEditarUsuarioProps) {
  const [idRol, setIdRol] = useState<string>("");
  const [activo, setActivo] = useState(true);
  const [org, setOrg] = useState<UsuarioOrgValues>({
    cargo: "",
    idProceso: SIN_PROCESO,
    liderProceso: false,
    idJefe: SIN_JEFE,
    accesoTodasEmpresas: true,
    empresas: [],
  });
  const [saving, setSaving] = useState(false);

  const cargos = useMemo(() => uniqueCargos(usuarios, CARGOS_SUGERIDOS), [usuarios]);

  useEffect(() => {
    if (!usuario) {
      return;
    }
    setIdRol(String(usuario.id_rol));
    setActivo(usuario.activo);
    setOrg({
      cargo: usuario.cargo ?? "",
      idProceso: usuario.id_proceso != null ? String(usuario.id_proceso) : SIN_PROCESO,
      liderProceso: usuario.lider_proceso === true,
      idJefe: usuario.id_jefe_directo ?? SIN_JEFE,
      accesoTodasEmpresas: usuario.acceso_todas_empresas !== false,
      empresas: usuario.empresas ?? [],
    });
  }, [usuario]);

  if (!usuario) {
    return null;
  }

  const isSelf = usuario.id === currentUserId;
  const isSelfAdmin = isSelf && usuario.rol.slug === "admin";

  const handleSave = async () => {
    const nextRol = Number(idRol);
    if (!Number.isInteger(nextRol)) {
      toast.error("Rol inválido");
      return;
    }

    setSaving(true);
    const result = await patchUsuario(usuario.id, {
      id_rol: nextRol,
      activo,
      cargo: org.cargo.trim() || null,
      id_proceso: org.idProceso === SIN_PROCESO ? null : Number(org.idProceso),
      id_jefe_directo: org.idJefe === SIN_JEFE ? null : org.idJefe,
      lider_proceso: org.liderProceso,
      acceso_todas_empresas: org.accesoTodasEmpresas,
      empresas: org.empresas,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success("Usuario actualizado");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            El nombre y el correo vienen de AuthKit. Rol, cargo, proceso y empresas alimentan
            Billing y Finanzas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" value={usuario.nombre} readOnly className="bg-slate-50" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" value={usuario.email} readOnly className="bg-slate-50" />
          </div>
          <div className="space-y-2">
            <Label>Rol</Label>
            <Select value={idRol} onValueChange={setIdRol} disabled={isSelfAdmin}>
              <SelectTrigger className="border-slate-200 bg-white">
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((rol) => (
                  <SelectItem key={rol.id} value={String(rol.id)}>
                    {rol.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSelfAdmin ? (
              <p className="text-xs text-slate-500">No puedes quitarte el rol de administrador.</p>
            ) : (
              <p className="text-xs text-slate-500">
                Las rutas de billing se configuran en Administración → Accesos.
              </p>
            )}
          </div>

          <UsuarioOrgFields
            values={org}
            onChange={(patch) => setOrg((current) => ({ ...current, ...patch }))}
            procesos={procesos}
            usuarios={usuarios}
            cargos={cargos}
            excludeUserId={usuario.id}
          />

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <Label htmlFor="activo">Activo</Label>
              {isSelf ? (
                <p className="text-xs text-slate-500">No puedes desactivar tu propia cuenta.</p>
              ) : null}
            </div>
            <Switch
              id="activo"
              checked={activo}
              disabled={isSelf}
              onCheckedChange={setActivo}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
