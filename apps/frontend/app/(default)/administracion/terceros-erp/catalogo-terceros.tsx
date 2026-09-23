"use client";

import { useEffect, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEmpresaNombre } from "@/lib/empresas";
import { listarCatalogoErp, type SucursalTerceroErp } from "@/lib/erp/terceros";
import { cn } from "@/lib/utils";
import {
  contarTerceros,
  documentoTercero,
  etiquetaTipoPersona,
  formatearFechaHora,
  formatearNumero,
  mensajeDeError,
  TAMANO_PAGINA,
  tercerosErpKeys,
  totalPaginas,
  type EntidadCatalogo,
  type PaginaCatalogoConsultada,
} from "./terceros-erp-utils";

const COLUMNAS = 6;

const TITULO_ENTIDAD: Record<EntidadCatalogo, string> = {
  proveedores: "Proveedores",
  clientes: "Clientes",
};

/**
 * One catalog (proveedores or clientes) of one company. Mounted per tab and keyed by company, so
 * switching either starts again at page 1 without showing the other catalog's rows meanwhile.
 */
export function CatalogoTerceros({ empresa, entidad, q }: { empresa: number; entidad: EntidadCatalogo; q: string }) {
  // The page belongs to one search term: a new term starts again at page 1.
  const [paginacion, setPaginacion] = useState({ q, pagina: 1 });
  const pagina = paginacion.q === q ? paginacion.pagina : 1;
  const irAPagina = (siguiente: number) => setPaginacion({ q, pagina: siguiente });

  const consulta = useQuery({
    queryKey: tercerosErpKeys.catalogo(empresa, entidad, q, pagina),
    queryFn: async ({ signal }): Promise<PaginaCatalogoConsultada> => {
      const respuesta = await listarCatalogoErp(entidad, { empresa, q, page: pagina, pageSize: TAMANO_PAGINA }, signal);
      return { ...respuesta, q };
    },
    placeholderData: keepPreviousData,
  });
  const datos = consulta.data;
  const esPlaceholder = consulta.isPlaceholderData;

  // A sync can shrink the catalog under the current page: fall back to its new last page.
  useEffect(() => {
    if (!datos || esPlaceholder) return;
    const ultima = totalPaginas(datos.total, datos.pageSize);
    if (datos.page > ultima) setPaginacion({ q: datos.q, pagina: ultima });
  }, [datos, esPlaceholder]);

  const nombreEmpresa = getEmpresaNombre(empresa);
  const titulo = TITULO_ENTIDAD[entidad];
  const paginas = datos ? totalPaginas(datos.total, datos.pageSize) : 1;

  let cuerpo: ReactNode;
  if (!datos && consulta.isError) {
    cuerpo = (
      <FilaMensaje>
        <div className="flex flex-col items-center gap-3" role="alert">
          <p>{mensajeDeError(consulta.error, "No se pudo cargar el catálogo.")}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      </FilaMensaje>
    );
  } else if (!datos) {
    cuerpo = (
      <FilaMensaje>
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando {titulo.toLowerCase()}…
        </span>
      </FilaMensaje>
    );
  } else if (datos.items.length === 0) {
    cuerpo = (
      <FilaMensaje>
        {datos.q
          ? `Sin resultados para “${datos.q}” en ${titulo.toLowerCase()} de ${nombreEmpresa}.`
          : `Todavía no hay ${titulo.toLowerCase()} de ${nombreEmpresa} en el catálogo local. Usa “Sincronizar ahora” para traerlos del ERP.`}
      </FilaMensaje>
    );
  } else {
    cuerpo = datos.items.map((tercero) => (
      <TableRow key={tercero.nit}>
        <TableCell className="font-medium text-slate-950">{tercero.razonSocial}</TableCell>
        <TableCell>
          <div className="whitespace-nowrap tabular-nums text-slate-900">{documentoTercero(tercero)}</div>
          <div className="text-xs text-slate-500">{tercero.tipoDocumento}</div>
        </TableCell>
        <TableCell className="text-slate-600">{etiquetaTipoPersona(tercero.tipoPersona)}</TableCell>
        <TableCell>
          <Badge variant={tercero.activo ? "success" : "secondary"}>{tercero.activo ? "Activo" : "Inactivo"}</Badge>
        </TableCell>
        <TableCell>
          <ListaSucursales sucursales={tercero.sucursales} />
        </TableCell>
        <TableCell className="whitespace-nowrap text-slate-600">{formatearFechaHora(tercero.sincronizadoEn)}</TableCell>
      </TableRow>
    ));
  }

  const desde = datos && datos.items.length > 0 ? (datos.page - 1) * datos.pageSize + 1 : 0;
  const hasta = datos ? desde + datos.items.length - 1 : 0;

  return (
    <div className="space-y-3">
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <p aria-live="polite">
          {datos
            ? datos.q
              ? `${contarTerceros(entidad, datos.total)} para “${datos.q}”`
              : `${contarTerceros(entidad, datos.total)} en ${nombreEmpresa}`
            : null}
        </p>
        {datos && consulta.isFetching ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Actualizando…
          </span>
        ) : null}
      </div>

      {datos && consulta.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <span>{mensajeDeError(consulta.error, "No se pudo actualizar el catálogo.")}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}

      <Table aria-busy={consulta.isFetching} className={cn("transition-opacity", esPlaceholder && "opacity-60")}>
        <TableCaption className="sr-only">
          {titulo} de {nombreEmpresa} en el catálogo local del ERP
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Razón social</TableHead>
            <TableHead scope="col">Documento</TableHead>
            <TableHead scope="col">Tipo de persona</TableHead>
            <TableHead scope="col">Estado</TableHead>
            <TableHead scope="col">Sucursales</TableHead>
            <TableHead scope="col">Sincronizado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{cuerpo}</TableBody>
      </Table>

      {datos && paginas > 1 ? (
        <nav
          aria-label={`Paginación de ${titulo.toLowerCase()}`}
          className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-slate-600">
            Página {formatearNumero(datos.page)} de {formatearNumero(paginas)}
            {desde > 0
              ? ` · ${formatearNumero(desde)}–${formatearNumero(hasta)} de ${formatearNumero(datos.total)}`
              : null}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Página anterior"
              disabled={pagina <= 1}
              onClick={() => irAPagina(pagina - 1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Página siguiente"
              disabled={esPlaceholder || pagina >= paginas}
              onClick={() => irAPagina(pagina + 1)}
            >
              Siguiente
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function FilaMensaje({ children }: { children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={COLUMNAS} className="py-10 text-center text-slate-600">
        {children}
      </TableCell>
    </TableRow>
  );
}

function ListaSucursales({ sucursales }: { sucursales: SucursalTerceroErp[] }) {
  if (sucursales.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <ul className="space-y-1 text-xs text-slate-600">
      {sucursales.map((sucursal) => (
        <li key={sucursal.sucursalId} className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="font-mono font-medium text-slate-900">{sucursal.sucursalId}</span>
          <span aria-hidden="true">·</span>
          <span>{sucursal.descripcion}</span>
          {sucursal.condicionPago ? (
            <>
              <span aria-hidden="true">·</span>
              <span>Cond. pago {sucursal.condicionPago}</span>
            </>
          ) : null}
          {sucursal.activo ? null : (
            <Badge
              variant="outline"
              className="border-slate-300 bg-slate-100 px-1.5 py-0 text-[10px] font-medium text-slate-600"
            >
              Inactiva
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
