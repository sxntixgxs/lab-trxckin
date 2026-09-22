"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Building2, Loader2, Pencil, Plus, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DashboardHero } from "@/components/dashboard-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { DEEP_LINK_PARAMS, readDeepLinkParam } from "@/lib/command-palette/record-links";
import { EMPRESAS_LIST, getEmpresaNombre } from "@/lib/empresas";

type AppEmpresa = 1 | 2 | 3 | 4;
type CentroCostoRow = FunctionReturnType<typeof api.centrosCosto.listar>["page"][number];

const EMPRESAS = EMPRESAS_LIST.filter((empresa): empresa is (typeof EMPRESAS_LIST)[number] & { id: AppEmpresa } =>
  empresa.id === 1 || empresa.id === 2 || empresa.id === 3 || empresa.id === 4,
);

function isAppEmpresa(value: number): value is AppEmpresa {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function messageFrom(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "No se pudo guardar el centro de costo.";
}

export function CentroCostoClient() {
  return (
    <CentroCostoErrorBoundary>
      <CentroCostoPanel />
    </CentroCostoErrorBoundary>
  );
}

function CentroCostoPanel() {
  const [appEmpresa, setAppEmpresa] = useState<AppEmpresa>(1);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CentroCostoRow | null>(null);
  const [pendingId, setPendingId] = useState<Id<"centrosCosto"> | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  // Deep link from the command palette: ?empresa=<n>&q=<codigo> seeds the filters, then is dropped.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const empresaParam = readDeepLinkParam(searchParams, DEEP_LINK_PARAMS.empresa);
    const qParam = readDeepLinkParam(empresaParam.rest, DEEP_LINK_PARAMS.q);
    if (!empresaParam.value && !qParam.value) return;
    const empresa = Number(empresaParam.value);
    if (isAppEmpresa(empresa)) setAppEmpresa(empresa);
    if (qParam.value) setSearch(qParam.value);
    const qs = qParam.rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);
  const query = debouncedSearch.trim();

  const { results, status, loadMore } = usePaginatedQuery(
    api.centrosCosto.listar,
    {
      appEmpresa,
      ...(query.length >= 2 ? { q: query } : {}),
    },
    { initialNumItems: 50 },
  );
  const setActivo = useMutation(api.centrosCosto.setActivo);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (row: CentroCostoRow) => {
    setEditing(row);
    setDialogOpen(true);
  };

  const toggleActivo = async (row: CentroCostoRow) => {
    setPendingId(row._id);
    try {
      await setActivo({ id: row._id, activo: !row.activo });
      toast.success(row.activo ? "Centro de costo desactivado" : "Centro de costo activado");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 p-4 md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <DashboardHero
          title="Centros de costo"
          description="Administra el catálogo que se usa al distribuir el valor de un movimiento."
          icon={<Building2 className="h-10 w-10 text-white" />}
          actions={
            <Button
              type="button"
              variant="secondary"
              onClick={openCreate}
              className="rounded-xl bg-white/15 text-white hover:bg-white/25"
            >
              <Plus className="h-4 w-4" />
              Nuevo centro
            </Button>
          }
        />

        <Card>
          <CardContent className="space-y-4 p-4 md:p-6">
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="centro-costo-empresa">Empresa</Label>
                <Select
                  value={String(appEmpresa)}
                  onValueChange={(value) => {
                    const next = Number(value);
                    if (isAppEmpresa(next)) setAppEmpresa(next);
                  }}
                >
                  <SelectTrigger id="centro-costo-empresa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPRESAS.map((empresa) => (
                      <SelectItem key={empresa.id} value={String(empresa.id)}>
                        {empresa.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="centro-costo-buscar">Buscar</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="centro-costo-buscar"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Código o descripción"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Centro de operación</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status === "LoadingFirstPage" ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-slate-600">
                      Cargando centros de costo…
                    </TableCell>
                  </TableRow>
                ) : results.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-slate-600">
                      {query.length >= 2
                        ? `Sin resultados para “${query.trim()}” en ${getEmpresaNombre(appEmpresa)}.`
                        : `Todavía no hay centros de costo para ${getEmpresaNombre(appEmpresa)}.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  results.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="font-medium text-slate-950">{row.codigo}</TableCell>
                      <TableCell>{row.descripcion}</TableCell>
                      <TableCell className="text-slate-600">{row.centroOperacion ?? "—"}</TableCell>
                      <TableCell className="text-slate-600">{row.responsable ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={row.activo ? "success" : "secondary"}>
                          {row.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pendingId === row._id}
                            onClick={() => void toggleActivo(row)}
                          >
                            {pendingId === row._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            {row.activo ? "Desactivar" : "Activar"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {status === "CanLoadMore" || status === "LoadingMore" ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  disabled={status === "LoadingMore"}
                  onClick={() => loadMore(50)}
                >
                  {status === "LoadingMore" ? "Cargando…" : "Cargar más"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <CentroCostoDialog
        open={dialogOpen}
        appEmpresa={appEmpresa}
        editing={editing}
        onOpenChange={setDialogOpen}
        onCreated={(empresa) => setAppEmpresa(empresa)}
      />
    </div>
  );
}

function CentroCostoDialog({
  open,
  appEmpresa,
  editing,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  appEmpresa: AppEmpresa;
  editing: CentroCostoRow | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (empresa: AppEmpresa) => void;
}) {
  const crear = useMutation(api.centrosCosto.crear);
  const actualizar = useMutation(api.centrosCosto.actualizar);
  const [empresa, setEmpresa] = useState<AppEmpresa>(appEmpresa);
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [centroOperacion, setCentroOperacion] = useState("");
  const [responsable, setResponsable] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmpresa(editing?.appEmpresa ?? appEmpresa);
    setCodigo(editing?.codigo ?? "");
    setDescripcion(editing?.descripcion ?? "");
    setCentroOperacion(editing?.centroOperacion ?? "");
    setResponsable(editing?.responsable ?? "");
  }, [editing, open, appEmpresa]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (editing) {
        await actualizar({
          id: editing._id,
          descripcion,
          centroOperacion: centroOperacion.trim() ? centroOperacion : null,
          responsable: responsable.trim() ? responsable : null,
        });
        toast.success("Centro de costo actualizado");
      } else {
        await crear({
          appEmpresa: empresa,
          codigo,
          descripcion,
          ...(centroOperacion.trim() ? { centroOperacion: centroOperacion.trim() } : {}),
          ...(responsable.trim() ? { responsable: responsable.trim() } : {}),
        });
        onCreated(empresa);
        toast.success("Centro de costo creado");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar centro de costo" : "Nuevo centro de costo"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "El código queda fijo para que los movimientos ya guardados sigan apuntando al mismo centro."
              : "El código y la empresa forman el identificador que se guarda en cada movimiento."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="centro-costo-dialog-empresa">Empresa</Label>
            <Select
              value={String(empresa)}
              disabled={Boolean(editing)}
              onValueChange={(value) => {
                const next = Number(value);
                if (isAppEmpresa(next)) setEmpresa(next);
              }}
            >
              <SelectTrigger id="centro-costo-dialog-empresa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPRESAS.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="centro-costo-codigo">Código</Label>
            <Input
              id="centro-costo-codigo"
              value={codigo}
              disabled={Boolean(editing)}
              onChange={(event) => setCodigo(event.target.value)}
              placeholder="DTECNOL"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="centro-costo-descripcion">Descripción</Label>
            <Input
              id="centro-costo-descripcion"
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              placeholder="Tecnología"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="centro-costo-operacion">Centro de operación</Label>
            <Input
              id="centro-costo-operacion"
              value={centroOperacion}
              onChange={(event) => setCentroOperacion(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="centro-costo-responsable">Responsable</Label>
            <Input
              id="centro-costo-responsable"
              value={responsable}
              onChange={(event) => setResponsable(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Guardar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

class CentroCostoErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-sm text-slate-600">
          <p>No se pudo cargar el catálogo de centros de costo.</p>
          <p className="mt-2">{this.state.error.message}</p>
          <Button type="button" className="mt-4" variant="outline" onClick={() => this.setState({ error: null })}>
            Reintentar
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
