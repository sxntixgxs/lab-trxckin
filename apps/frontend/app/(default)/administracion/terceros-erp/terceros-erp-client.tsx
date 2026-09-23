"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { DatabaseZap, Handshake, Loader2, RefreshCw, Search, Truck } from "lucide-react";
import { toast } from "sonner";
import { DashboardHero } from "@/components/dashboard-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { getEmpresaNombre } from "@/lib/empresas";
import { iniciarSincronizacion, listarSincronizaciones, type CorridaSincronizacion } from "@/lib/erp/terceros";
import { CatalogoTerceros } from "./catalogo-terceros";
import { SincronizacionesRecientes } from "./sincronizaciones-recientes";
import {
  BUSQUEDA_MINIMA,
  corridaEnCurso,
  esEntidadCatalogo,
  etiquetaEntidadErp,
  etiquetaEstado,
  formatearFechaHora,
  INTERVALO_SONDEO_MS,
  LIMITE_CORRIDAS,
  mensajeDeError,
  tercerosErpKeys,
  type EntidadCatalogo,
} from "./terceros-erp-utils";

const ID_ESTADO_SINCRONIZACION = "terceros-erp-estado-sincronizacion";
const ID_AYUDA_BUSQUEDA = "terceros-erp-buscar-ayuda";

export function TercerosErpClient() {
  return (
    <TercerosErpErrorBoundary>
      <TercerosErpPanel />
    </TercerosErpErrorBoundary>
  );
}

function TercerosErpPanel() {
  const { empresaActiva, empresasDisponibles, initialized } = useEmpresaFilter();
  // Only used with "Todas las empresas": the catalog is per company, so one is picked here.
  const [empresaElegida, setEmpresaElegida] = useState<number | null>(null);

  // Until the store knows the user's companies, render the same placeholder as the server did.
  if (!initialized) {
    return (
      <Marco>
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Cargando empresas…
          </CardContent>
        </Card>
      </Marco>
    );
  }

  const empresa =
    empresaActiva ??
    (empresaElegida !== null && empresasDisponibles.includes(empresaElegida)
      ? empresaElegida
      : (empresasDisponibles[0] ?? null));

  if (empresa === null) {
    return (
      <Marco>
        <Card>
          <CardContent className="p-6 text-sm text-slate-600">
            No tienes empresas asignadas. Pide a un administrador acceso a una empresa para consultar su catálogo.
          </CardContent>
        </Card>
      </Marco>
    );
  }

  return (
    <TercerosErpEmpresa
      empresa={empresa}
      opcionesEmpresa={empresaActiva === null ? empresasDisponibles : null}
      onEmpresaChange={setEmpresaElegida}
    />
  );
}

function TercerosErpEmpresa({
  empresa,
  opcionesEmpresa,
  onEmpresaChange,
}: {
  empresa: number;
  /** Companies to pick from, or null when the app already has an active company. */
  opcionesEmpresa: number[] | null;
  onEmpresaChange: (empresa: number) => void;
}) {
  const [entidad, setEntidad] = useState<EntidadCatalogo>("proveedores");
  const [busqueda, setBusqueda] = useState("");
  const termino = useDebouncedValue(busqueda, 300).trim();
  const q = termino.length >= BUSQUEDA_MINIMA ? termino : "";
  const busquedaCorta = busqueda.trim().length > 0 && busqueda.trim().length < BUSQUEDA_MINIMA;

  const { corridas, activas, sincronizar } = useSincronizacionesErp(empresa);
  const nombreEmpresa = getEmpresaNombre(empresa);
  const ocupado = sincronizar.isPending || activas.length > 0;

  return (
    <Marco
      acciones={
        <Button
          type="button"
          variant="secondary"
          onClick={() => sincronizar.mutate(empresa)}
          disabled={ocupado}
          aria-describedby={ID_ESTADO_SINCRONIZACION}
          title={`Trae del ERP los proveedores y clientes de ${nombreEmpresa}`}
          className="rounded-xl bg-white/15 text-white hover:bg-white/25"
        >
          {ocupado ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {ocupado ? "Sincronizando…" : "Sincronizar ahora"}
        </Button>
      }
    >
      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(0,280px)_1fr] md:p-6">
          {opcionesEmpresa ? (
            <div className="space-y-1.5">
              <Label htmlFor="terceros-erp-empresa">Empresa</Label>
              <Select
                value={String(empresa)}
                onValueChange={(valor) => {
                  const id = Number(valor);
                  if (opcionesEmpresa.includes(id)) onEmpresaChange(id);
                }}
              >
                <SelectTrigger id="terceros-erp-empresa">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opcionesEmpresa.map((id) => (
                    <SelectItem key={id} value={String(id)}>
                      {getEmpresaNombre(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">El catálogo es por empresa: elige cuál consultar.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm font-medium leading-none text-slate-900">Empresa</p>
              <p className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900">
                {nombreEmpresa}
              </p>
              <p className="text-xs text-slate-500">Empresa activa en la aplicación.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-sm font-medium leading-none text-slate-900">Sincronización</p>
            <p
              id={ID_ESTADO_SINCRONIZACION}
              role="status"
              aria-live="polite"
              className="flex min-h-10 items-center gap-2 text-sm text-slate-600"
            >
              {ocupado ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" aria-hidden="true" /> : null}
              <span>{mensajeEstado(sincronizar.isPending, activas, corridas)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 md:p-6">
          <Tabs
            value={entidad}
            onValueChange={(valor) => {
              if (esEntidadCatalogo(valor)) setEntidad(valor);
            }}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <TabsList aria-label="Catálogo" className="h-10 w-full rounded-lg bg-slate-100 p-1 md:w-auto">
                <TabsTrigger value="proveedores" className="flex-1 gap-2 rounded-md px-4 md:flex-none">
                  <Truck className="h-4 w-4" aria-hidden="true" />
                  Proveedores
                </TabsTrigger>
                <TabsTrigger value="clientes" className="flex-1 gap-2 rounded-md px-4 md:flex-none">
                  <Handshake className="h-4 w-4" aria-hidden="true" />
                  Clientes
                </TabsTrigger>
              </TabsList>
              <div className="w-full space-y-1.5 md:max-w-sm">
                <Label htmlFor="terceros-erp-buscar">Buscar</Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <Input
                    id="terceros-erp-buscar"
                    type="search"
                    value={busqueda}
                    onChange={(event) => setBusqueda(event.target.value)}
                    placeholder="Razón social, NIT o sucursal"
                    maxLength={100}
                    autoComplete="off"
                    aria-describedby={busquedaCorta ? ID_AYUDA_BUSQUEDA : undefined}
                    className="pl-9"
                  />
                </div>
                {busquedaCorta ? (
                  <p id={ID_AYUDA_BUSQUEDA} className="text-xs text-slate-500">
                    Escribe al menos {BUSQUEDA_MINIMA} caracteres para buscar.
                  </p>
                ) : null}
              </div>
            </div>
            <TabsContent value="proveedores" className="mt-4">
              <CatalogoTerceros key={empresa} empresa={empresa} entidad="proveedores" q={q} />
            </TabsContent>
            <TabsContent value="clientes" className="mt-4">
              <CatalogoTerceros key={empresa} empresa={empresa} entidad="clientes" q={q} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <SincronizacionesRecientes consulta={corridas} nombreEmpresa={nombreEmpresa} />
    </Marco>
  );
}

/**
 * Recent runs of one company, "Sincronizar ahora", and the polling that follows the runs: every
 * 2 s while one is EN_CURSO. When a run this page was waiting on finishes, the company's catalog
 * is refetched.
 */
function useSincronizacionesErp(empresa: number) {
  const queryClient = useQueryClient();
  // Per company: the run ids "Sincronizar ahora" returned plus every run seen EN_CURSO. The ids
  // from the POST cover runs that finish before the list is refetched.
  const pendientesRef = useRef(new Map<number, Set<string>>());

  const corridas = useQuery({
    queryKey: tercerosErpKeys.sincronizaciones(empresa),
    queryFn: () => listarSincronizaciones({ empresa, limit: LIMITE_CORRIDAS }),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((corrida) => corridaEnCurso(corrida, query.state.dataUpdatedAt))
        ? INTERVALO_SONDEO_MS
        : false,
  });

  const lista = corridas.data;
  useEffect(() => {
    if (!lista) return;
    const pendientes = pendientesDe(pendientesRef.current, empresa);
    let terminoAlguna = false;
    for (const corrida of lista) {
      if (corrida.estado === "EN_CURSO") pendientes.add(corrida.id);
      else if (pendientes.delete(corrida.id)) terminoAlguna = true;
    }
    if (terminoAlguna) {
      void queryClient.invalidateQueries({ queryKey: tercerosErpKeys.catalogoEmpresa(empresa) });
    }
  }, [lista, empresa, queryClient]);

  const sincronizar = useMutation({
    mutationFn: (empresaSincronizar: number) => iniciarSincronizacion({ empresa: empresaSincronizar }),
    onSuccess: async (respuesta, empresaSincronizar) => {
      const pendientes = pendientesDe(pendientesRef.current, empresaSincronizar);
      for (const id of respuesta.corridas) pendientes.add(id);
      toast.success("Sincronización iniciada", {
        description: `Actualizando proveedores y clientes de ${getEmpresaNombre(empresaSincronizar)}.`,
      });
      // Awaited so the button stays busy until the list shows the new runs and polling takes over.
      await queryClient.invalidateQueries({ queryKey: tercerosErpKeys.sincronizaciones(empresaSincronizar) });
    },
    onError: (error) => {
      toast.error(mensajeDeError(error, "No se pudo iniciar la sincronización."));
    },
  });

  const activas = (lista ?? []).filter((corrida) => corridaEnCurso(corrida, corridas.dataUpdatedAt));
  return { corridas, activas, sincronizar };
}

function pendientesDe(pendientesPorEmpresa: Map<number, Set<string>>, empresa: number): Set<string> {
  let pendientes = pendientesPorEmpresa.get(empresa);
  if (!pendientes) {
    pendientes = new Set();
    pendientesPorEmpresa.set(empresa, pendientes);
  }
  return pendientes;
}

function mensajeEstado(
  iniciando: boolean,
  activas: CorridaSincronizacion[],
  corridas: UseQueryResult<CorridaSincronizacion[], Error>,
): string {
  if (iniciando) return "Iniciando la sincronización…";
  if (activas.length > 0) {
    const catalogos = Array.from(new Set(activas.map((corrida) => etiquetaEntidadErp(corrida.entidad).toLowerCase())));
    return `Sincronización en curso (${catalogos.join(" y ")}). El catálogo se actualizará al terminar.`;
  }
  if (corridas.data === undefined) {
    return corridas.isError
      ? "No se pudo consultar el estado de la sincronización."
      : "Consultando el estado de la sincronización…";
  }
  const ultima = corridas.data.find((corrida) => corrida.alcance === "COMPLETA" && corrida.estado !== "EN_CURSO");
  if (!ultima) return "Todavía no hay una sincronización completa reciente de esta empresa.";
  return `Última sincronización completa: ${formatearFechaHora(ultima.finalizadaEn ?? ultima.iniciadaEn)} (${etiquetaEntidadErp(
    ultima.entidad,
  ).toLowerCase()}, ${etiquetaEstado(ultima.estado).toLowerCase()}).`;
}

function Marco({ acciones, children }: { acciones?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 p-4 md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <DashboardHero
          title="Terceros ERP"
          description="Réplica local de los clientes y proveedores del ERP (SIESA simulado). Se sincroniza a diario y bajo demanda."
          icon={<DatabaseZap className="h-10 w-10 text-white" />}
          actions={acciones}
        />
        {children}
      </div>
    </div>
  );
}

class TercerosErpErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-sm text-slate-600">
          <p>No se pudo cargar el catálogo de terceros del ERP.</p>
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
