"use client";

import { useMemo, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
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
import { createUsuario } from "./usuarios-api";
import {
  CARGOS_SUGERIDOS,
  SIN_JEFE,
  SIN_PROCESO,
  uniqueCargos,
  UsuarioOrgFields,
  type UsuarioOrgValues,
} from "./usuario-org-fields";
import type { ProcesoOption, RolOption, UsuarioDirectory } from "./usuarios-types";

interface CrearUsuarioPanelProps {
  roles: RolOption[];
  procesos: ProcesoOption[];
  usuarios: UsuarioDirectory[];
  onCreated: () => void;
}

export default function CrearUsuarioPanel({
  roles,
  procesos,
  usuarios,
  onCreated,
}: CrearUsuarioPanelProps) {
  const memberRole = roles.find((rol) => rol.slug === "member");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [idRol, setIdRol] = useState(memberRole ? String(memberRole.id) : "");
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

  const handleCreate = async () => {
    if (nombre.trim().length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }
    if (!email.includes("@")) {
      toast.error("Ingresa un correo válido");
      return;
    }
    const nextRol = Number(idRol);
    setSaving(true);
    const result = await createUsuario({
      nombre: nombre.trim(),
      email: email.trim(),
      ...(Number.isInteger(nextRol) ? { id_rol: nextRol } : {}),
      cargo: org.cargo.trim() || undefined,
      id_proceso: org.idProceso === SIN_PROCESO ? undefined : Number(org.idProceso),
      id_jefe_directo: org.idJefe === SIN_JEFE ? undefined : org.idJefe,
      lider_proceso: org.liderProceso,
      acceso_todas_empresas: org.accesoTodasEmpresas,
      empresas: org.empresas,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setNombre("");
    setEmail("");
    setIdRol(memberRole ? String(memberRole.id) : idRol);
    setOrg({
      cargo: "",
      idProceso: SIN_PROCESO,
      liderProceso: false,
      idJefe: SIN_JEFE,
      accesoTodasEmpresas: true,
      empresas: [],
    });
    toast.success("Usuario creado. Ya debe aparecer en la lista y en Billing.");
    onCreated();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Crear usuario
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Crea la cuenta en WorkOS y la fila del directorio. Cargo, proceso y empresas son lo que
          Billing usa para líderes, finanzas y alcance por compañía.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="nuevo-usuario-nombre">Nombre</Label>
            <Input
              id="nuevo-usuario-nombre"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ana Pérez"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nuevo-usuario-email">Correo</Label>
            <Input
              id="nuevo-usuario-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ana@empresa.com"
            />
          </div>
        </div>
        <div className="max-w-xs space-y-1">
          <Label>Rol</Label>
          <Select value={idRol} onValueChange={setIdRol}>
            <SelectTrigger>
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((rol) => (
                <SelectItem key={rol.id} value={String(rol.id)}>
                  {rol.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <UsuarioOrgFields
          values={org}
          onChange={(patch) => setOrg((current) => ({ ...current, ...patch }))}
          procesos={procesos}
          usuarios={usuarios}
          cargos={cargos}
        />
        <Button type="button" onClick={() => void handleCreate()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
          Crear usuario
        </Button>
      </CardContent>
    </Card>
  );
}
