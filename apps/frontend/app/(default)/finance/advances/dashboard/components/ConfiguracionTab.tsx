"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { roleLabels, rolesAnticipo } from "../constants";
import type {
  AnticiposConfigDraft,
  RolAnticipo,
  UsuarioInfo,
} from "../types";

type ConfiguracionTabProps = {
  empresaConfigId: number | null;
  empresaConfigNombre: string;
  configDraft: AnticiposConfigDraft;
  onConfigDraftChange: (
    rol: RolAnticipo,
    value: string | string[]
  ) => void;
  usuariosOrdenados: UsuarioInfo[];
  isLoadingUsuarios: boolean;
  onSaveConfig: () => void;
  isSavingConfig: boolean;
  onCleanAnticipos: (confirmacion: string) => Promise<void>;
  isCleaningAnticipos: boolean;
};

const roleDescriptions: Record<RolAnticipo, string> = {
  GERENCIA: "Aprobación de Gerencia",
  TESORERO: "Registro de desembolso",
  CONTABILIDAD: "Revisión contable",
};

function normalizeSearch(value?: string | number | null) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function UsuarioResponsableCombobox({
  value,
  usuarios,
  disabled,
  onChange,
}: {
  value: string;
  usuarios: UsuarioInfo[];
  disabled: boolean;
  onChange: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = useMemo(
    () => usuarios.find((usuario) => usuario.id === value),
    [usuarios, value]
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim());
    if (!q) return usuarios.slice(0, 80);
    return usuarios
      .filter((usuario) => {
        const haystack = normalizeSearch(
          [
            usuario.nombre,
            usuario.email,
            usuario.cargo,
            usuario.id,
            usuario.id_empresa,
          ].join(" ")
        );
        return haystack.includes(q);
      })
      .slice(0, 80);
  }, [search, usuarios]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-10 w-full justify-between bg-white px-3 font-normal"
        >
          <span className="min-w-0 truncate text-left">
            {selected ? (
              selected.nombre ?? selected.email ?? selected.id
            ) : (
              <span className="text-muted-foreground">Buscar usuario</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por nombre, email, cargo o id..."
          />
          <CommandList className="max-h-[min(320px,var(--radix-popover-content-available-height))]">
            <CommandEmpty>No se encontró ningún usuario.</CommandEmpty>
            <CommandGroup>
              {filtered.map((usuario) => (
                <CommandItem
                  key={usuario.id}
                  value={usuario.id}
                  onSelect={() => {
                    onChange(usuario.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === usuario.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {usuario.nombre ?? usuario.id}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[usuario.email, usuario.cargo].filter(Boolean).join(" · ") ||
                        usuario.id}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Search className="h-3.5 w-3.5" />
              {filtered.length} de {usuarios.length}
            </div>
            {usuarios.length > filtered.length && (
              <span className="text-xs text-slate-400">
                Afina la búsqueda para ver más
              </span>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function UsuariosResponsablesMultiCombobox({
  value,
  usuarios,
  disabled,
  onChange,
}: {
  value: string[];
  usuarios: UsuarioInfo[];
  disabled: boolean;
  onChange: (userIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedIds = useMemo(() => new Set(value), [value]);
  const selected = useMemo(
    () =>
      value
        .map((id) => usuarios.find((usuario) => usuario.id === id))
        .filter(Boolean) as UsuarioInfo[],
    [usuarios, value]
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim());
    if (!q) return usuarios.slice(0, 80);
    return usuarios
      .filter((usuario) => {
        const haystack = normalizeSearch(
          [
            usuario.nombre,
            usuario.email,
            usuario.cargo,
            usuario.id,
            usuario.id_empresa,
          ].join(" ")
        );
        return haystack.includes(q);
      })
      .slice(0, 80);
  }, [search, usuarios]);

  function toggleUser(userId: string) {
    if (selectedIds.has(userId)) {
      onChange(value.filter((id) => id !== userId));
      return;
    }
    onChange([...value, userId]);
  }

  function removeUser(userId: string) {
    onChange(value.filter((id) => id !== userId));
  }

  return (
    <div className="space-y-3">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-10 w-full justify-between bg-white px-3 font-normal"
          >
            <span className="min-w-0 truncate text-left">
              {value.length > 0 ? (
                `${value.length} usuarios seleccionados`
              ) : (
                <span className="text-muted-foreground">
                  Buscar usuarios de contabilidad
                </span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Buscar por nombre, email, cargo o id..."
            />
            <CommandList className="max-h-[min(320px,var(--radix-popover-content-available-height))]">
              <CommandEmpty>No se encontró ningún usuario.</CommandEmpty>
              <CommandGroup>
                {filtered.map((usuario) => {
                  const checked = selectedIds.has(usuario.id);
                  return (
                    <CommandItem
                      key={usuario.id}
                      value={usuario.id}
                      onSelect={() => toggleUser(usuario.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          checked ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium">
                          {usuario.nombre ?? usuario.id}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[usuario.email, usuario.cargo]
                            .filter(Boolean)
                            .join(" · ") || usuario.id}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Search className="h-3.5 w-3.5" />
                {filtered.length} de {usuarios.length}
              </div>
              <span className="text-xs text-slate-400">
                {value.length} seleccionados
              </span>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((usuario) => (
            <span
              key={usuario.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
            >
              <span className="max-w-[220px] truncate">
                {usuario.nombre ?? usuario.email ?? usuario.id}
              </span>
              <button
                type="button"
                className="rounded-xs p-0.5 text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-950"
                onClick={() => removeUser(usuario.id)}
                aria-label={`Quitar ${usuario.nombre ?? usuario.id}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
          Sin usuarios de contabilidad asignados.
        </p>
      )}
    </div>
  );
}

export function ConfiguracionTab({
  empresaConfigId,
  empresaConfigNombre,
  configDraft,
  onConfigDraftChange,
  usuariosOrdenados,
  isLoadingUsuarios,
  onSaveConfig,
  isSavingConfig,
  onCleanAnticipos,
  isCleaningAnticipos,
}: ConfiguracionTabProps) {
  const [cleanDialogOpen, setCleanDialogOpen] = useState(false);
  const [cleanConfirmation, setCleanConfirmation] = useState("");

  if (empresaConfigId === null) {
    return (
      <Card className="rounded-md border-slate-200 shadow-xs">
        <CardContent className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-slate-950">
              Selecciona una empresa
            </h2>
            <p className="max-w-md text-sm font-medium leading-relaxed text-slate-600">
              La configuración de responsables depende del selector principal de
              empresa.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-md border-slate-200 shadow-xs">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5 text-emerald-600" />
              Configuración de responsables
            </CardTitle>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Roles activos para el flujo de anticipos de la empresa
              seleccionada.
            </p>
          </div>
          <Badge
            variant="outline"
            className="w-fit border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            {empresaConfigNombre}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-emerald-700 shadow-xs">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Empresa activa
              </p>
              <p className="truncate text-base font-black text-slate-950">
                {empresaConfigNombre}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="w-fit border-slate-200 bg-white text-slate-600"
          >
            ID {empresaConfigId}
          </Badge>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          {rolesAnticipo.map((rol) => {
            const isContabilidad = rol === "CONTABILIDAD";
            const selectedUserId = isContabilidad ? "" : configDraft[rol];
            const selectedUser =
              !isContabilidad && selectedUserId
                ? usuariosOrdenados.find((u) => u.id === selectedUserId) ?? null
                : null;
            const contabilidadCount = configDraft.CONTABILIDAD.length;
            return (
              <div
                key={rol}
                className={cn(
                  "grid gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(280px,1fr)_minmax(360px,520px)] lg:items-start",
                  isContabilidad && "bg-slate-50/50"
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                    {isContabilidad ? (
                      <UsersRound className="h-5 w-5" />
                    ) : (
                      <ShieldCheck className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-950">
                      {roleLabels[rol]}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500">
                      {roleDescriptions[rol]}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "w-fit bg-white text-[10px]",
                          isContabilidad
                            ? contabilidadCount > 0
                              ? "border-emerald-200 text-emerald-700"
                              : "border-slate-200 text-slate-500"
                            : selectedUser
                              ? "border-emerald-200 text-emerald-700"
                              : "border-slate-200 text-slate-500"
                        )}
                      >
                        {isContabilidad
                          ? `${contabilidadCount} ${contabilidadCount === 1 ? "usuario" : "usuarios"}`
                          : selectedUser
                            ? "Asignado"
                            : "Sin asignar"}
                      </Badge>
                      {!isContabilidad && selectedUser?.email && (
                        <span className="max-w-[320px] truncate text-xs font-medium text-slate-500">
                          {selectedUser.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-wider text-slate-500">
                    {isContabilidad ? "Responsables" : "Responsable"}
                  </Label>
                  {isContabilidad ? (
                    <UsuariosResponsablesMultiCombobox
                      value={configDraft.CONTABILIDAD}
                      usuarios={usuariosOrdenados}
                      disabled={isLoadingUsuarios}
                      onChange={(value) => onConfigDraftChange(rol, value)}
                    />
                  ) : (
                    <UsuarioResponsableCombobox
                      value={configDraft[rol]}
                      usuarios={usuariosOrdenados}
                      disabled={isLoadingUsuarios}
                      onChange={(value) => onConfigDraftChange(rol, value)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-black text-slate-950">Responsables del flujo</p>
            <p className="text-sm font-medium text-slate-600">
              Los cambios se aplican a las próximas asignaciones del flujo.
            </p>
          </div>
          <Button
            className="gap-2"
            onClick={onSaveConfig}
            disabled={isSavingConfig || isLoadingUsuarios}
          >
            {isSavingConfig ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar responsables
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-rose-700 shadow-xs">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-black text-rose-950">Limpiar anticipos</p>
              <p className="text-sm font-medium text-rose-800">
                Elimina solicitudes, fases, responsables, cruces de facturación
                y referencias de peajes relacionadas con anticipos.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="gap-2"
            onClick={() => {
              setCleanConfirmation("");
              setCleanDialogOpen(true);
            }}
            disabled={isCleaningAnticipos}
          >
            {isCleaningAnticipos ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Limpiar todo
          </Button>
        </div>

        <Dialog open={cleanDialogOpen} onOpenChange={setCleanDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Limpiar datos de anticipos</DialogTitle>
              <DialogDescription>
                Esta acción borra los datos del módulo y limpia sus referencias
                en facturación. Para confirmar escribe LIMPIAR_ANTICIPOS.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Confirmación</Label>
              <Input
                value={cleanConfirmation}
                onChange={(event) => setCleanConfirmation(event.target.value)}
                placeholder="LIMPIAR_ANTICIPOS"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCleanDialogOpen(false)}
                disabled={isCleaningAnticipos}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="gap-2"
                onClick={async () => {
                  await onCleanAnticipos(cleanConfirmation);
                  setCleanDialogOpen(false);
                  setCleanConfirmation("");
                }}
                disabled={
                  isCleaningAnticipos ||
                  cleanConfirmation !== "LIMPIAR_ANTICIPOS"
                }
              >
                {isCleaningAnticipos ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Ejecutar limpieza
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
