"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, ChevronsUpDown, Eye, Loader2, Settings, User, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { SUPPLIER_ROL_CONFIG, WHITELIST_PERMISO_CONFIG, type PermisoWhitelist } from "@/lib/onboarding/roles";
import { SUPPLIER_ROLES, type SupplierRol } from "@/lib/onboarding/phases/suppliers";
import { fetchUsuariosAsignables, matchesUsuario, type UsuarioAsignable } from "@/lib/onboarding/usuarios-asignables";
import { cn } from "@/lib/utils";
import { getOnboardingErrorMessage, SUPPLIER_MODULO } from "./ui-config";

function UsuarioPicker({
  usuarios,
  value,
  onChange,
  className,
}: {
  usuarios: UsuarioAsignable[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const selected = usuarios.find((u) => u.id === value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={cn("justify-between font-normal", !value && "text-muted-foreground", className)}>
          {selected ? `${selected.nombre} — ${selected.email}` : "Seleccionar usuario..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const usuario = usuarios.find((u) => u.id === itemValue);
            if (!usuario) return 0;
            return matchesUsuario(usuario, search) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar por nombre o correo..." />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {usuarios.map((u) => (
                <CommandItem key={u.id} value={u.id} onSelect={() => onChange(u.id)}>
                  <span className="truncate">
                    {u.nombre} — {u.email}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ConfigRoles({ canEdit }: { canEdit: boolean }) {
  const { empresaActiva, empresaActivaInfo } = useEmpresaFilter();
  const roles = useQuery(
    api.onboarding.roles.obtenerRolesConfig,
    empresaActiva !== null ? { modulo: SUPPLIER_MODULO, empresa: empresaActiva } : "skip",
  );
  const whitelist = useQuery(
    api.onboarding.roles.obtenerWhitelist,
    empresaActiva !== null ? { modulo: SUPPLIER_MODULO, empresa: empresaActiva } : "skip",
  );
  const configurarRol = useMutation(api.onboarding.roles.configurarRol);
  const agregarWhitelist = useMutation(api.onboarding.roles.agregarWhitelist);
  const quitarWhitelist = useMutation(api.onboarding.roles.quitarWhitelist);

  const [usuarios, setUsuarios] = useState<UsuarioAsignable[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [editando, setEditando] = useState<SupplierRol | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [agregandoWhitelist, setAgregandoWhitelist] = useState(false);
  const [whitelistUserId, setWhitelistUserId] = useState("");
  const [whitelistPermiso, setWhitelistPermiso] = useState<PermisoWhitelist>("CONSULTA");
  const [guardandoWhitelist, setGuardandoWhitelist] = useState(false);

  useEffect(() => {
    if ((!editando && !agregandoWhitelist) || empresaActiva === null) {
      setUsuarios([]);
      return;
    }
    let cancelled = false;
    setLoadingUsuarios(true);
    fetchUsuariosAsignables(empresaActiva)
      .then((list) => {
        if (!cancelled) setUsuarios(list);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsuarios(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editando, agregandoWhitelist, empresaActiva]);

  async function handleGuardar(rol: SupplierRol) {
    if (empresaActiva === null) return;
    const user = usuarios.find((u) => u.id === selectedUserId);
    if (!user) {
      toast.error("Selecciona un usuario");
      return;
    }
    setSaving(true);
    try {
      const result = await configurarRol({
        modulo: SUPPLIER_MODULO,
        empresa: empresaActiva,
        rol,
        userId: user.id,
        nombre: user.nombre,
        email: user.email,
      });
      toast.success(
        result.fasesReasignadas > 0
          ? `Rol ${SUPPLIER_ROL_CONFIG[rol].label} actualizado (${result.fasesReasignadas} fase(s) reasignadas).`
          : `Rol ${SUPPLIER_ROL_CONFIG[rol].label} actualizado`,
      );
      setEditando(null);
      setSelectedUserId("");
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al guardar"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAgregarWhitelist() {
    if (empresaActiva === null) return;
    const user = usuarios.find((u) => u.id === whitelistUserId);
    if (!user) {
      toast.error("Selecciona un usuario");
      return;
    }
    setGuardandoWhitelist(true);
    try {
      await agregarWhitelist({
        modulo: SUPPLIER_MODULO,
        empresa: empresaActiva,
        userId: user.id,
        nombre: user.nombre,
        email: user.email,
        permiso: whitelistPermiso,
      });
      toast.success(`Usuario agregado a ${WHITELIST_PERMISO_CONFIG[whitelistPermiso].label}`);
      setAgregandoWhitelist(false);
      setWhitelistUserId("");
      setWhitelistPermiso("CONSULTA");
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al agregar"));
    } finally {
      setGuardandoWhitelist(false);
    }
  }

  async function handleQuitarWhitelist(userId: string) {
    if (empresaActiva === null) return;
    try {
      await quitarWhitelist({ modulo: SUPPLIER_MODULO, empresa: empresaActiva, userId });
      toast.success("Usuario quitado del rol de consulta");
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al quitar"));
    }
  }

  const isLoading = empresaActiva !== null && (roles === undefined || whitelist === undefined);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
        <Settings className="h-5 w-5 text-slate-500" />
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-900">Configuración de Roles</h2>
          <p className="text-sm text-slate-500">
            Asigna los usuarios responsables de cada etapa y notificación del proceso.
            {empresaActivaInfo && <span className="ml-1.5 font-medium text-blue-600">{empresaActivaInfo.nombre}</span>}
          </p>
        </div>
      </header>

      <div className="space-y-4 p-6">
        {empresaActiva === null ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Building2 className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Selecciona una empresa para ver su configuración de roles.</p>
          </div>
        ) : isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {!canEdit && (
              <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Solo los administradores pueden modificar roles y la lista de consulta.
              </p>
            )}
            {SUPPLIER_ROLES.map((rol) => {
              const config = SUPPLIER_ROL_CONFIG[rol];
              const actual = roles?.find((r) => r.rol === rol);
              const isEditandoThis = editando === rol;
              return (
                <div key={rol} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-semibold">
                          {config.label}
                        </Badge>
                      </div>
                      <p className="mb-2 text-xs text-slate-500">{config.descripcion}</p>
                      {actual ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="text-sm font-medium text-slate-700">{actual.nombre}</span>
                          <span className="text-xs text-slate-400">({actual.email})</span>
                        </div>
                      ) : (
                        <p className="text-sm italic text-amber-600">Sin asignar</p>
                      )}
                    </div>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditando(isEditandoThis ? null : rol);
                          setSelectedUserId(actual?.userId ?? "");
                        }}
                      >
                        {isEditandoThis ? "Cancelar" : "Cambiar"}
                      </Button>
                    )}
                  </div>

                  {isEditandoThis && (
                    <div className="mt-3 flex items-center gap-2">
                      {loadingUsuarios ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : (
                        <>
                          <UsuarioPicker usuarios={usuarios} value={selectedUserId} onChange={setSelectedUserId} className="flex-1" />
                          <Button size="sm" onClick={() => handleGuardar(rol)} disabled={saving || !selectedUserId}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Eye className="h-4 w-4 shrink-0 text-slate-400" />
                    <Badge variant="secondary" className="text-xs font-semibold">
                      Consulta
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Usuarios con vista amplia de inscripciones y detalle desde Acciones. Consulta y Creación también
                    permite iniciar procesos. No pueden gestionar fases, anular ni exportar. Si además tienen un rol de
                    etapa, aplican las acciones de ese rol.
                  </p>
                </div>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAgregandoWhitelist(!agregandoWhitelist);
                      setWhitelistUserId("");
                      setWhitelistPermiso("CONSULTA");
                    }}
                  >
                    {agregandoWhitelist ? "Cancelar" : "Agregar usuario"}
                  </Button>
                )}
              </div>

              {agregandoWhitelist && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {loadingUsuarios ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <>
                      <UsuarioPicker usuarios={usuarios} value={whitelistUserId} onChange={setWhitelistUserId} className="min-w-[220px] flex-1" />
                      <Select value={whitelistPermiso} onValueChange={(value) => setWhitelistPermiso(value as PermisoWhitelist)}>
                        <SelectTrigger className="h-9 min-w-[210px]">
                          <SelectValue placeholder="Tipo de permiso" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(WHITELIST_PERMISO_CONFIG) as PermisoWhitelist[]).map((permiso) => (
                            <SelectItem key={permiso} value={permiso}>
                              {WHITELIST_PERMISO_CONFIG[permiso].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={handleAgregarWhitelist} disabled={guardandoWhitelist || !whitelistUserId}>
                        {guardandoWhitelist ? <Loader2 className="h-4 w-4 animate-spin" /> : "Añadir a la lista"}
                      </Button>
                    </>
                  )}
                </div>
              )}

              {(whitelist ?? []).length > 0 ? (
                <ul className="space-y-2">
                  {(whitelist ?? []).map((w) => (
                    <li key={w._id} className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <User className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate text-sm font-medium text-slate-700">{w.nombre}</span>
                        <span className="truncate text-xs text-slate-400">({w.email})</span>
                        <Badge variant={w.permiso === "CONSULTA_CREACION" ? "default" : "outline"} className="shrink-0 text-[10px]">
                          {WHITELIST_PERMISO_CONFIG[w.permiso].label}
                        </Badge>
                      </div>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600"
                          title="Quitar de la lista"
                          onClick={() => handleQuitarWhitelist(w.userId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : !agregandoWhitelist ? (
                <p className="text-sm italic text-slate-400">Nadie asignado al rol de consulta.</p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
