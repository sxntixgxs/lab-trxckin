"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronLeft,
  LayoutGrid,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { DashboardHero } from "@/components/dashboard-hero";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { collectPermissionSections, type NavPermissionSection } from "@/lib/nav";
import { createRol, deleteRol, savePermisosRol, updateRol } from "./accesos-api";
import { isFullAccessRole, isSystemRoleSlug, type RolConPermisos } from "./accesos-types";

const SECCIONES = collectPermissionSections();

interface AccesosClientContentProps {
  roles: RolConPermisos[];
}

export default function AccesosClientContent({ roles }: AccesosClientContentProps) {
  const router = useRouter();
  const [rolesState, setRolesState] = useState(roles);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRolId, setSelectedRolId] = useState<number | null>(null);
  const [permisosModificados, setPermisosModificados] = useState<Record<number, Set<string>>>({});
  const [savingPermisos, setSavingPermisos] = useState(false);
  const [savingRol, setSavingRol] = useState(false);

  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [renameRol, setRenameRol] = useState<RolConPermisos | null>(null);
  const [renameNombre, setRenameNombre] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RolConPermisos | null>(null);

  useEffect(() => {
    setRolesState(roles);
  }, [roles]);

  const rolesFiltrados = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return rolesState;
    }
    return rolesState.filter(
      (rol) =>
        rol.nombre.toLowerCase().includes(term) || rol.slug.toLowerCase().includes(term),
    );
  }, [rolesState, searchTerm]);

  const selectedRol = rolesState.find((rol) => rol.id === selectedRolId) ?? null;
  const esAccesoTotal = selectedRol ? isFullAccessRole(selectedRol.slug) : false;

  const getPermisosRol = (rolId: number): Set<string> => {
    const dirty = permisosModificados[rolId];
    if (dirty) {
      return dirty;
    }
    const rol = rolesState.find((item) => item.id === rolId);
    return new Set(rol?.permisos ?? []);
  };

  const togglePermiso = (rolId: number, ruta: string) => {
    setPermisosModificados((prev) => {
      const actuales = prev[rolId] ?? getPermisosRol(rolId);
      const siguientes = new Set(actuales);
      if (siguientes.has(ruta)) {
        siguientes.delete(ruta);
      } else {
        siguientes.add(ruta);
      }
      return { ...prev, [rolId]: siguientes };
    });
  };

  const toggleSeccion = (rolId: number, seccion: NavPermissionSection) => {
    setPermisosModificados((prev) => {
      const actuales = prev[rolId] ?? getPermisosRol(rolId);
      const siguientes = new Set(actuales);
      const rutas = seccion.rutas.map((ruta) => ruta.id);
      const todas = rutas.every((ruta) => actuales.has(ruta));
      if (todas) {
        rutas.forEach((ruta) => siguientes.delete(ruta));
      } else {
        rutas.forEach((ruta) => siguientes.add(ruta));
      }
      return { ...prev, [rolId]: siguientes };
    });
  };

  const seccionCompleta = (rolId: number, seccion: NavPermissionSection) => {
    const permisos = getPermisosRol(rolId);
    return seccion.rutas.every((ruta) => permisos.has(ruta.id));
  };

  const handleGuardar = async (rolId: number) => {
    setSavingPermisos(true);
    const result = await savePermisosRol(rolId, Array.from(getPermisosRol(rolId)));
    setSavingPermisos(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setPermisosModificados((prev) => {
      const siguiente = { ...prev };
      delete siguiente[rolId];
      return siguiente;
    });
    setRolesState((prev) =>
      prev.map((rol) => (rol.id === rolId ? { ...rol, permisos: result.rol.permisos } : rol)),
    );
    toast.success("Permisos actualizados");
    router.refresh();
  };

  const handleRevertir = (rolId: number) => {
    setPermisosModificados((prev) => {
      const siguiente = { ...prev };
      delete siguiente[rolId];
      return siguiente;
    });
    toast.success("Cambios revertidos");
  };

  const handleCrearRol = async () => {
    const nombre = nuevoNombre.trim();
    if (nombre.length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }
    setSavingRol(true);
    const result = await createRol(nombre);
    setSavingRol(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setNuevoOpen(false);
    setNuevoNombre("");
    setRolesState((prev) => [...prev, result.rol]);
    setSelectedRolId(result.rol.id);
    toast.success("Rol creado. Asigna rutas y guarda.");
    router.refresh();
  };

  const handleRenombrar = async () => {
    if (!renameRol) {
      return;
    }
    const nombre = renameNombre.trim();
    if (nombre.length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }
    setSavingRol(true);
    const result = await updateRol(renameRol.id, { nombre });
    setSavingRol(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setRenameRol(null);
    setRolesState((prev) =>
      prev.map((rol) => (rol.id === result.rol.id ? { ...rol, ...result.rol, permisos: rol.permisos } : rol)),
    );
    toast.success("Rol actualizado");
    router.refresh();
  };

  const handleEliminar = async () => {
    if (!deleteTarget) {
      return;
    }
    setSavingRol(true);
    const result = await deleteRol(deleteTarget.id);
    setSavingRol(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (selectedRolId === deleteTarget.id) {
      setSelectedRolId(null);
    }
    setRolesState((prev) => prev.filter((rol) => rol.id !== deleteTarget.id));
    setPermisosModificados((prev) => {
      const siguiente = { ...prev };
      delete siguiente[deleteTarget.id];
      return siguiente;
    });
    setDeleteTarget(null);
    toast.success("Rol eliminado");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 p-4 md:p-10">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <DashboardHero
          title="Accesos"
          description="Define qué rutas del menú ve cada rol. Admin siempre tiene acceso total."
          icon={<ShieldCheck className="h-10 w-10 text-white" />}
        />

        <div className="flex min-h-[calc(100vh-14rem)] flex-col gap-6 overflow-hidden md:flex-row">
          <div
            className={cn(
              "flex h-full w-full shrink-0 flex-col gap-4 md:w-80 lg:w-96",
              selectedRolId ? "hidden md:flex" : "flex",
            )}
          >
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar roles..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="button" size="sm" onClick={() => setNuevoOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Nuevo rol
              </Button>
            </div>

            <ScrollArea className="flex-1 pr-3">
              <div className="flex flex-col gap-2 pb-4">
                {rolesFiltrados.map((rol) => {
                  const isAdmin = isFullAccessRole(rol.slug);
                  const hasChanges = Boolean(permisosModificados[rol.id]);
                  const isActive = selectedRolId === rol.id;
                  const permisosCount = getPermisosRol(rol.id).size;
                  const systemRole = isSystemRoleSlug(rol.slug);

                  return (
                    <div key={rol.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => setSelectedRolId(rol.id)}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left transition-all duration-200",
                          isActive
                            ? "border-primary bg-primary/5 shadow-md"
                            : "border-transparent hover:border-border hover:bg-muted",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className={cn("font-medium", isActive ? "text-primary" : "text-foreground")}>
                            {rol.nombre}
                          </span>
                          {isAdmin ? (
                            <Lock className="h-3 w-3 text-amber-500" />
                          ) : (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              {permisosCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{rol.activo ? "Activo" : "Inactivo"}</span>
                          {hasChanges ? (
                            <span className="flex items-center gap-1 font-medium text-amber-600">
                              <AlertCircle className="h-3 w-3" />
                              Sin guardar
                            </span>
                          ) : null}
                        </div>
                      </button>
                      {!systemRole ? (
                        <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 bg-background/90"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedRolId(rol.id);
                              setRenameNombre(rol.nombre);
                              setRenameRol(rol);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only">Renombrar</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 bg-background/90 text-destructive hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget(rol);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="sr-only">Eliminar</span>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {rolesFiltrados.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No se encontraron roles.</div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <div
            className={cn(
              "relative flex h-full flex-1 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/30 shadow-inner",
              !selectedRolId ? "hidden md:flex" : "flex",
            )}
          >
            {!selectedRol ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <div className="mb-4 rounded-full bg-background p-4 shadow-xs">
                  <LayoutGrid className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="mb-1 text-lg font-medium text-foreground">Ningún rol seleccionado</h3>
                <p className="max-w-sm">
                  Selecciona un rol de la lista para ver y editar sus permisos de acceso.
                </p>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="z-10 shrink-0 border-b bg-background p-4 md:p-6">
                  <div className="mb-2 flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedRolId(null)}
                      className="h-8 w-8 shrink-0 md:hidden"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold md:text-xl">{selectedRol.nombre}</h2>
                        {esAccesoTotal ? (
                          <Badge
                            variant="secondary"
                            className="border-amber-200 bg-amber-100 text-xs text-amber-800 hover:bg-amber-100"
                          >
                            Acceso Total
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Personalizado
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                        {esAccesoTotal
                          ? "Este rol tiene acceso irrestricto a todo el sistema."
                          : "Configura las secciones visibles para este rol."}
                      </p>
                    </div>
                  </div>

                  {!esAccesoTotal ? (
                    <div className="mt-3 flex items-center justify-end gap-2">
                      {permisosModificados[selectedRol.id] ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevertir(selectedRol.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="h-4 w-4 md:mr-2" />
                          <span className="hidden md:inline">Deshacer</span>
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => void handleGuardar(selectedRol.id)}
                        disabled={!permisosModificados[selectedRol.id] || savingPermisos}
                        size="sm"
                        className={cn(
                          "transition-all",
                          permisosModificados[selectedRol.id] ? "shadow-md" : "opacity-50",
                        )}
                      >
                        {savingPermisos ? (
                          <span className="flex items-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            <span className="hidden md:inline">Guardando</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Save className="h-4 w-4" />
                            <span className="hidden md:inline">Guardar Cambios</span>
                            <span className="md:hidden">Guardar</span>
                          </span>
                        )}
                      </Button>
                    </div>
                  ) : null}
                </div>

                <ScrollArea className="flex-1 p-4 md:p-6">
                  {esAccesoTotal ? (
                    <div className="flex h-full items-center justify-center p-8">
                      <Card className="w-full max-w-md border-amber-200 bg-amber-50">
                        <CardHeader className="pb-2 text-center">
                          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                            <Shield className="h-6 w-6 text-amber-600" />
                          </div>
                          <CardTitle className="text-amber-900">Acceso Administrativo Completo</CardTitle>
                        </CardHeader>
                        <CardContent className="text-center text-amber-800/80">
                          <p>
                            Los usuarios con el rol <strong>{selectedRol.nombre}</strong> tienen acceso
                            automático a todas las funcionalidades presentes y futuras del sistema. No es
                            necesario configurar permisos individuales.
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 pb-10 xl:grid-cols-2">
                      {SECCIONES.map((seccion) => {
                        const Icon = seccion.icon;
                        const permisos = getPermisosRol(selectedRol.id);
                        const todasActivas = seccionCompleta(selectedRol.id, seccion);
                        const activasCount = seccion.rutas.filter((ruta) => permisos.has(ruta.id)).length;

                        return (
                          <Card
                            key={seccion.id}
                            className="overflow-hidden border-border/60 shadow-xs transition-shadow duration-200 hover:shadow-md"
                          >
                            <div className="flex items-center justify-between border-b bg-muted/30 p-3">
                              <div className="flex items-center gap-2">
                                <div className="rounded-md border bg-background p-1.5 shadow-xs">
                                  <Icon className="h-4 w-4 text-primary" />
                                </div>
                                <span className="font-semibold">{seccion.label}</span>
                                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px] font-normal">
                                  {activasCount} / {seccion.rutas.length}
                                </Badge>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleSeccion(selectedRol.id, seccion)}
                                className={cn(
                                  "h-7 text-xs hover:bg-background",
                                  todasActivas ? "font-medium text-primary" : "text-muted-foreground",
                                )}
                              >
                                {todasActivas ? "Desmarcar todas" : "Marcar todas"}
                              </Button>
                            </div>
                            <div className="p-1">
                              {seccion.rutas.map((ruta) => {
                                const activo = permisos.has(ruta.id);
                                return (
                                  <div
                                    key={ruta.id}
                                    className={cn(
                                      "group flex cursor-pointer items-center justify-between rounded-md p-3 transition-colors",
                                      activo ? "bg-primary/5" : "hover:bg-muted/50",
                                    )}
                                    onClick={() => togglePermiso(selectedRol.id, ruta.id)}
                                  >
                                    <div className="flex flex-col gap-0.5">
                                      <Label
                                        htmlFor={`${selectedRol.id}-${ruta.id}`}
                                        className="cursor-pointer text-sm font-medium text-foreground/90 transition-colors group-hover:text-primary"
                                      >
                                        {ruta.label}
                                      </Label>
                                      <span className="font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                                        {ruta.id}
                                      </span>
                                    </div>
                                    <Switch
                                      id={`${selectedRol.id}-${ruta.id}`}
                                      checked={activo}
                                      onClick={(event) => event.stopPropagation()}
                                      onCheckedChange={() => togglePermiso(selectedRol.id, ruta.id)}
                                      className="data-[state=checked]:bg-primary"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo rol</DialogTitle>
            <DialogDescription>
              Empieza sin permisos. Luego marca las rutas y pulsa Guardar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nuevo-rol-nombre">Nombre</Label>
            <Input
              id="nuevo-rol-nombre"
              value={nuevoNombre}
              onChange={(event) => setNuevoNombre(event.target.value)}
              placeholder="Operador"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNuevoOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleCrearRol()} disabled={savingRol}>
              {savingRol ? "Creando..." : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameRol)} onOpenChange={(open) => !open && setRenameRol(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar rol</DialogTitle>
            <DialogDescription>El identificador interno se actualiza a partir del nombre.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-rol-nombre">Nombre</Label>
            <Input
              id="rename-rol-nombre"
              value={renameNombre}
              onChange={(event) => setRenameNombre(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameRol(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleRenombrar()} disabled={savingRol}>
              {savingRol ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar rol</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Se eliminará “${deleteTarget.nombre}”. No puedes hacerlo si todavía hay usuarios con este rol.`
                : "Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingRol}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={savingRol}
              onClick={(event) => {
                event.preventDefault();
                void handleEliminar();
              }}
            >
              {savingRol ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
