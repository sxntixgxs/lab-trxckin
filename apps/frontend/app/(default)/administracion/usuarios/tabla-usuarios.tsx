"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Edit,
  Filter,
  Loader2,
  Search,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { esProcesoGestionFinanciera } from "../../billing/hooks/use-facturacion-users";
import { patchUsuario } from "./usuarios-api";
import type { ProcesoOption, RolOption, UsuarioDirectory } from "./usuarios-types";

const COLORES_ROL = [
  "bg-red-100 text-red-800",
  "bg-orange-100 text-orange-800",
  "bg-yellow-100 text-yellow-800",
  "bg-green-100 text-green-800",
  "bg-blue-100 text-blue-800",
  "bg-purple-100 text-purple-800",
];

type SortKey = "nombre" | "id_rol";
type SortConfig = { key: SortKey; direction: "asc" | "desc" };

interface TablaUsuariosProps {
  usuarios: UsuarioDirectory[];
  roles: RolOption[];
  procesos: ProcesoOption[];
  currentUserId: string;
  canImpersonate?: boolean;
  impersonatingId?: string | null;
  onEdit: (usuario: UsuarioDirectory) => void;
  onChanged: () => void;
  onImpersonate?: (usuario: UsuarioDirectory) => void;
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getInitials(nombre: string): string {
  return (
    nombre
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U"
  );
}

export default function TablaUsuarios({
  usuarios,
  roles,
  procesos,
  currentUserId,
  canImpersonate = false,
  impersonatingId = null,
  onEdit,
  onChanged,
  onImpersonate,
}: TablaUsuariosProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRol, setFilterRol] = useState("todos");
  const [filterProceso, setFilterProceso] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [dialogConfirmacion, setDialogConfirmacion] = useState<{
    abierto: boolean;
    accion: "desactivar" | "activar";
    usuario: UsuarioDirectory | null;
  }>({ abierto: false, accion: "desactivar", usuario: null });

  const rolesConColor = useMemo(
    () =>
      roles.map((rol, index) => ({
        ...rol,
        color: COLORES_ROL[index % COLORES_ROL.length],
      })),
    [roles],
  );

  const getRolInfo = (idRol: number) => {
    const rol = rolesConColor.find((item) => item.id === idRol);
    return rol ?? { nombre: "Desconocido", color: "bg-gray-100 text-gray-800" };
  };

  const filteredUsuarios = useMemo(() => {
    const tokens = normalizeSearchValue(searchTerm).split(" ").filter(Boolean);
    const filtered = usuarios.filter((usuario) => {
      const searchIndex = normalizeSearchValue(
        `${usuario.nombre} ${usuario.email} ${usuario.cargo ?? ""} ${usuario.proceso?.nombre ?? ""}`,
      );
      const matchesSearch = tokens.length === 0 || tokens.every((token) => searchIndex.includes(token));
      const matchesRol = filterRol === "todos" || String(usuario.id_rol) === filterRol;
      const matchesProceso =
        filterProceso === "todos" ||
        (filterProceso === "sin" && usuario.id_proceso == null) ||
        String(usuario.id_proceso) === filterProceso;
      const matchesEstado =
        filterEstado === "todos" ||
        (filterEstado === "activo" && usuario.activo) ||
        (filterEstado === "inactivo" && !usuario.activo);
      return matchesSearch && matchesRol && matchesProceso && matchesEstado;
    });

    if (sortConfig) {
      filtered.sort((a, b) => {
        const aValue = sortConfig.key === "nombre" ? a.nombre : a.id_rol;
        const bValue = sortConfig.key === "nombre" ? b.nombre : b.id_rol;
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [usuarios, searchTerm, filterRol, filterProceso, filterEstado, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filteredUsuarios.length / rowsPerPage));
  const paginatedUsuarios = filteredUsuarios.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  const handleSort = (key: SortKey) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const getSortIcon = (key: SortKey) => {
    if (sortConfig?.key !== key) {
      return <ArrowUpDown className="ml-1 h-4 w-4" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="ml-1 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-1 h-4 w-4" />
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterRol("todos");
    setFilterProceso("todos");
    setFilterEstado("todos");
    setSortConfig(null);
    setCurrentPage(1);
  };

  const handleToggleUsuario = (usuario: UsuarioDirectory) => {
    if (usuario.id === currentUserId && usuario.activo) {
      toast.error("No puedes desactivar tu propia cuenta");
      return;
    }
    setDialogConfirmacion({
      abierto: true,
      accion: usuario.activo ? "desactivar" : "activar",
      usuario,
    });
  };

  const confirmarToggleUsuario = async () => {
    const usuario = dialogConfirmacion.usuario;
    if (!usuario) {
      return;
    }
    const nextActivo = dialogConfirmacion.accion === "activar";
    setPendingIds((current) => new Set(current).add(usuario.id));
    const result = await patchUsuario(usuario.id, { activo: nextActivo });
    setPendingIds((current) => {
      const next = new Set(current);
      next.delete(usuario.id);
      return next;
    });
    setDialogConfirmacion((prev) => ({ ...prev, abierto: false }));
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(nextActivo ? "Usuario reactivado" : "Usuario desactivado");
    onChanged();
  };

  return (
    <Card className="w-full border-slate-200 shadow-lg">
      <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-slate-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <div className="rounded-lg bg-blue-100 p-2">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            Lista de Usuarios
          </CardTitle>
          <Badge variant="outline" className="w-fit text-sm font-normal">
            {filteredUsuarios.length} usuario{filteredUsuarios.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nombre o correo..."
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
              className="h-11 border-slate-200 pl-10 focus:border-blue-400 focus:ring-blue-400"
            />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Filtrar:</span>
            </div>
            <Select
              value={filterRol}
              onValueChange={(value) => {
                setFilterRol(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[160px]">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los roles</SelectItem>
                {rolesConColor.map((rol) => (
                  <SelectItem key={rol.id} value={String(rol.id)}>
                    {rol.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterProceso}
              onValueChange={(value) => {
                setFilterProceso(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[180px]">
                <SelectValue placeholder="Proceso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los procesos</SelectItem>
                <SelectItem value="sin">Sin proceso</SelectItem>
                {procesos.map((proceso) => (
                  <SelectItem key={proceso.id} value={String(proceso.id)}>
                    {proceso.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterEstado}
              onValueChange={(value) => {
                setFilterEstado(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[140px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="inactivo">Inactivos</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="w-full border-slate-200 hover:bg-slate-100 sm:ml-auto sm:w-auto"
            >
              Limpiar
            </Button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-slate-600">
              {paginatedUsuarios.length} de {filteredUsuarios.length} resultado
              {filteredUsuarios.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Por página:</span>
              <Select
                value={String(rowsPerPage)}
                onValueChange={(value) => {
                  setRowsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-20 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <AlertDialog
          open={dialogConfirmacion.abierto}
          onOpenChange={(abierto) => setDialogConfirmacion((prev) => ({ ...prev, abierto }))}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {dialogConfirmacion.accion === "desactivar" ? "Desactivar Usuario" : "Reactivar Usuario"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {dialogConfirmacion.accion === "desactivar"
                  ? `¿Estás seguro de que deseas desactivar al usuario "${dialogConfirmacion.usuario?.nombre}"? El usuario no podrá acceder al sistema hasta que sea reactivado.`
                  : `¿Estás seguro de que deseas reactivar al usuario "${dialogConfirmacion.usuario?.nombre}"? El usuario podrá acceder al sistema nuevamente.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void confirmarToggleUsuario()}
                className={
                  dialogConfirmacion.accion === "desactivar"
                    ? "bg-red-600 hover:bg-red-700 focus:ring-red-600"
                    : "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600"
                }
              >
                {dialogConfirmacion.accion === "desactivar" ? "Desactivar" : "Reactivar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="hidden overflow-x-auto rounded-lg border border-slate-200 shadow-xs xl:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="bg-slate-50 font-semibold text-slate-700">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("nombre")}
                    className="h-auto p-0 font-semibold hover:text-blue-600"
                  >
                    Usuario
                    {getSortIcon("nombre")}
                  </Button>
                </TableHead>
                <TableHead className="bg-slate-50 font-semibold text-slate-700">Cargo / Proceso</TableHead>
                <TableHead className="bg-slate-50 font-semibold text-slate-700">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("id_rol")}
                    className="h-auto p-0 font-semibold hover:text-blue-600"
                  >
                    Rol / Estado
                    {getSortIcon("id_rol")}
                  </Button>
                </TableHead>
                <TableHead className="sticky right-0 z-10 w-[120px] bg-slate-50 text-center font-semibold text-slate-700">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedUsuarios.length > 0 ? (
                paginatedUsuarios.map((usuario) => {
                  const rolInfo = getRolInfo(usuario.id_rol);
                  const isSelf = usuario.id === currentUserId;
                  const isPending = pendingIds.has(usuario.id);
                  return (
                    <TableRow
                      key={usuario.id}
                      className="group border-b border-slate-100 bg-white transition-colors hover:bg-blue-50/50"
                    >
                      <TableCell className="max-w-[260px] py-3">
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-8 w-8 shrink-0 border-2 border-slate-200">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-xs font-semibold text-white">
                              {getInitials(usuario.nombre)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {usuario.nombre}
                            </div>
                            <div className="truncate text-xs text-slate-500">{usuario.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[240px] py-3">
                        <div className="space-y-1">
                          <div className="truncate text-sm text-slate-700">
                            {usuario.cargo?.trim() || "Sin cargo"}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="truncate text-xs text-slate-500">
                              {usuario.proceso?.nombre ?? "Sin proceso"}
                            </span>
                            {usuario.lider_proceso ? (
                              <Badge variant="outline" className="text-[10px]">
                                Líder
                              </Badge>
                            ) : null}
                            {esProcesoGestionFinanciera(usuario.proceso?.nombre) ? (
                              <Badge className="bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">
                                Finanzas
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge className={`${rolInfo.color} font-medium`}>{rolInfo.nombre}</Badge>
                          <Badge variant={usuario.activo ? "default" : "destructive"} className="font-medium">
                            {usuario.activo ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="sticky right-0 z-10 w-[120px] bg-white py-3 group-hover:bg-blue-50/95">
                        <div className="flex items-center justify-center gap-1">
                          {canImpersonate && usuario.activo && !isSelf ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onImpersonate?.(usuario)}
                              disabled={impersonatingId === usuario.id}
                              className="h-8 w-8 p-0 hover:bg-sky-50 hover:text-sky-700"
                              title="Actuar como"
                            >
                              {impersonatingId === usuario.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ArrowLeftRight className="h-4 w-4" />
                              )}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(usuario)}
                            className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {usuario.activo ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleUsuario(usuario)}
                              disabled={isPending || isSelf}
                              className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                              title={isSelf ? "No puedes desactivar tu cuenta" : "Desactivar"}
                            >
                              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleUsuario(usuario)}
                              disabled={isPending}
                              className="h-8 w-8 p-0 hover:bg-green-50 hover:text-green-600"
                              title="Activar"
                            >
                              {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <UserCheck className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="rounded-full bg-slate-100 p-3">
                        <Users className="h-8 w-8 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">No se encontraron usuarios</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {searchTerm ||
                          filterRol !== "todos" ||
                          filterProceso !== "todos" ||
                          filterEstado !== "todos"
                            ? "Intenta ajustar los filtros de búsqueda"
                            : "Nadie ha iniciado sesión con AuthKit todavía"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:hidden">
          {paginatedUsuarios.length > 0 ? (
            paginatedUsuarios.map((usuario) => {
              const rolInfo = getRolInfo(usuario.id_rol);
              const isSelf = usuario.id === currentUserId;
              const isPending = pendingIds.has(usuario.id);
              return (
                <Card key={usuario.id} className="overflow-hidden border-slate-200 shadow-xs">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center space-x-3">
                        <Avatar className="h-12 w-12 shrink-0 border-2 border-slate-200">
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-sm font-semibold text-white">
                            {getInitials(usuario.nombre)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">{usuario.nombre}</div>
                          <div className="truncate text-sm text-slate-500">{usuario.email}</div>
                        </div>
                      </div>
                      <Badge variant={usuario.activo ? "default" : "destructive"}>
                        {usuario.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge className={`${rolInfo.color} font-medium`}>{rolInfo.nombre}</Badge>
                      {usuario.lider_proceso ? <Badge variant="outline">Líder</Badge> : null}
                      {esProcesoGestionFinanciera(usuario.proceso?.nombre) ? (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Finanzas</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500">
                      {[usuario.cargo, usuario.proceso?.nombre].filter(Boolean).join(" · ") ||
                        "Sin cargo ni proceso"}
                    </p>
                    <div className="flex gap-2">
                      {canImpersonate && usuario.activo && !isSelf ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onImpersonate?.(usuario)}
                          disabled={impersonatingId === usuario.id}
                          className="flex-1"
                        >
                          {impersonatingId === usuario.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowLeftRight className="mr-2 h-4 w-4" />
                          )}
                          Actuar como
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => onEdit(usuario)} className="flex-1">
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleUsuario(usuario)}
                        disabled={isPending || (isSelf && usuario.activo)}
                        className="flex-1"
                      >
                        {isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : usuario.activo ? (
                          <UserX className="mr-2 h-4 w-4" />
                        ) : (
                          <UserCheck className="mr-2 h-4 w-4" />
                        )}
                        {usuario.activo ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card className="border-slate-200 md:col-span-2">
              <CardContent className="p-8 text-center text-slate-500">
                No se encontraron usuarios
              </CardContent>
            </Card>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-slate-600">
              Página {currentPage} de {totalPages}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                disabled={currentPage === 1}
                className="border-slate-200"
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="border-slate-200"
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
