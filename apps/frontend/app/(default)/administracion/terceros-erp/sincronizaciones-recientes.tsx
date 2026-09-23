"use client";

import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CorridaSincronizacion } from "@/lib/erp/terceros";
import { cn } from "@/lib/utils";
import {
  corridaHuerfana,
  etiquetaAlcance,
  etiquetaEntidadErp,
  etiquetaEstado,
  etiquetaOrigen,
  formatearDuracion,
  formatearFechaHora,
  formatearNumero,
  LIMITE_CORRIDAS,
  mensajeDeError,
} from "./terceros-erp-utils";

const CELDA = "px-3 py-2";

const ENCABEZADOS: Array<{ label: string; numerico?: boolean }> = [
  { label: "Inicio" },
  { label: "Catálogo" },
  { label: "Alcance" },
  { label: "Origen" },
  { label: "Estado" },
  { label: "Leídas", numerico: true },
  { label: "Creadas", numerico: true },
  { label: "Actualizadas", numerico: true },
  { label: "Eliminadas", numerico: true },
  { label: "Duración", numerico: true },
  { label: "Usuario" },
  { label: "Error" },
];

const ESTILO_ESTADO: Record<string, string> = {
  EN_CURSO: "border-blue-200 bg-blue-50 text-blue-700",
  EXITOSA: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FALLIDA: "border-red-200 bg-red-50 text-red-700",
  OMITIDA: "border-slate-300 bg-slate-100 text-slate-600",
};

export function SincronizacionesRecientes({
  consulta,
  nombreEmpresa,
}: {
  consulta: UseQueryResult<CorridaSincronizacion[], Error>;
  nombreEmpresa: string;
}) {
  // Orphaned runs are judged against the time the list was fetched, not the render time.
  const referencia = consulta.dataUpdatedAt;

  let cuerpo: ReactNode;
  if (consulta.data === undefined && consulta.isError) {
    cuerpo = (
      <FilaMensaje>
        <div className="flex flex-col items-center gap-3" role="alert">
          <p>{mensajeDeError(consulta.error, "No se pudieron cargar las sincronizaciones.")}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      </FilaMensaje>
    );
  } else if (consulta.data === undefined) {
    cuerpo = (
      <FilaMensaje>
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando sincronizaciones…
        </span>
      </FilaMensaje>
    );
  } else if (consulta.data.length === 0) {
    cuerpo = (
      <FilaMensaje>
        Todavía no hay sincronizaciones de {nombreEmpresa}. Usa “Sincronizar ahora” para ejecutar la primera.
      </FilaMensaje>
    );
  } else {
    cuerpo = consulta.data.map((corrida) => {
      const enCurso = corrida.estado === "EN_CURSO";
      // The counters are written when the run closes; while it runs they are still 0.
      const contador = (valor: number) => (enCurso ? "—" : formatearNumero(valor));
      return (
        <TableRow key={corrida.id}>
          <TableCell className={cn(CELDA, "whitespace-nowrap text-slate-900")}>
            {formatearFechaHora(corrida.iniciadaEn, { segundos: true })}
          </TableCell>
          <TableCell className={CELDA}>{etiquetaEntidadErp(corrida.entidad)}</TableCell>
          <TableCell className={cn(CELDA, "whitespace-nowrap")}>{etiquetaAlcance(corrida)}</TableCell>
          <TableCell className={cn(CELDA, "whitespace-nowrap")}>{etiquetaOrigen(corrida.origen)}</TableCell>
          <TableCell className={CELDA}>
            <EstadoCorridaBadge estado={corrida.estado} huerfana={corridaHuerfana(corrida, referencia)} />
          </TableCell>
          <TableCell className={cn(CELDA, "text-right tabular-nums")}>{contador(corrida.filasLeidas)}</TableCell>
          <TableCell className={cn(CELDA, "text-right tabular-nums")}>{contador(corrida.creadas)}</TableCell>
          <TableCell className={cn(CELDA, "text-right tabular-nums")}>{contador(corrida.actualizadas)}</TableCell>
          <TableCell className={cn(CELDA, "text-right tabular-nums")}>{contador(corrida.eliminadas)}</TableCell>
          <TableCell className={cn(CELDA, "whitespace-nowrap text-right tabular-nums")}>
            {formatearDuracion(corrida.iniciadaEn, corrida.finalizadaEn)}
          </TableCell>
          <TableCell className={cn(CELDA, "text-slate-600")}>{corrida.usuario ?? "—"}</TableCell>
          <TableCell className={CELDA}>
            {corrida.error ? (
              <span
                className={cn(
                  "block max-w-[16rem] truncate",
                  corrida.estado === "FALLIDA" ? "text-red-700" : "text-slate-600",
                )}
                title={corrida.error}
              >
                {corrida.error}
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </TableCell>
        </TableRow>
      );
    });
  }

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5 text-slate-500" aria-hidden="true" />
          Sincronizaciones recientes
        </CardTitle>
        <CardDescription>
          Últimas {LIMITE_CORRIDAS} ejecuciones de {nombreEmpresa}, de la más reciente a la más antigua.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
        <Table className="text-xs">
          <TableCaption className="sr-only">Últimas sincronizaciones del ERP de {nombreEmpresa}</TableCaption>
          <TableHeader>
            <TableRow>
              {ENCABEZADOS.map((encabezado) => (
                <TableHead
                  key={encabezado.label}
                  scope="col"
                  className={cn("h-10 whitespace-nowrap px-3", encabezado.numerico && "text-right")}
                >
                  {encabezado.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>{cuerpo}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EstadoCorridaBadge({ estado, huerfana }: { estado: string; huerfana: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 whitespace-nowrap font-medium", ESTILO_ESTADO[estado] ?? ESTILO_ESTADO.OMITIDA)}
      title={
        huerfana
          ? "Sin avance desde hace más de 30 minutos: la próxima sincronización la cerrará como fallida."
          : undefined
      }
    >
      {estado === "EN_CURSO" && !huerfana ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
      {etiquetaEstado(estado)}
    </Badge>
  );
}

function FilaMensaje({ children }: { children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={ENCABEZADOS.length} className="py-10 text-center text-sm text-slate-600">
        {children}
      </TableCell>
    </TableRow>
  );
}
