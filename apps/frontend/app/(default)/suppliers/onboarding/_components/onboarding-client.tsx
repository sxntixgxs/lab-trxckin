"use client";

import { useCallback, useState } from "react";
import { useQuery } from "convex/react";
import { BarChart3, ClipboardList, FileSpreadsheet, ListChecks, Plus, Settings2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import ConfigRoles from "./config-roles";
import ConfigTiposProveedor from "./config-tipos-proveedor";
import ExportarEvaluacionesExcel from "./exportar-evaluaciones-excel";
import MisTareas from "./mis-tareas";
import ModalIniciarProceso from "./modal-iniciar-proceso";
import ReportesContainer from "./reportes/reportes-container";
import TableSeguimiento, { type ExportRow } from "./table-seguimiento";

type Tab = "seguimiento" | "mis-tareas" | "reportes" | "configuracion";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "seguimiento", label: "Seguimiento", icon: ClipboardList },
  { id: "mis-tareas", label: "Mis Tareas", icon: ListChecks },
  { id: "reportes", label: "Reportes", icon: BarChart3 },
  { id: "configuracion", label: "Configuración", icon: Settings2 },
];

const EXCEL_HEADERS = [
  "Tipo solicitud",
  "Razón Social",
  "Tipo Persona",
  "Tipo Documento",
  "Nro. Documento",
  "Email Contacto",
  "Riesgo",
  "Servicio Suministrado",
  "Monto Anual",
  "Fase Actual",
  "Responsable",
  "Proceso",
  "Fecha Inicio Proceso",
  "Fecha Inicio Última Fase",
];

function rowToArray(r: ExportRow): string[] {
  return [
    r.tipoSolicitud ?? "",
    r.razonSocial ?? "",
    r.tipoPersona,
    r.tipoDocumento,
    r.numeroDocumento,
    r.contactoEmail,
    r.riesgo,
    r.servicioSuministrado,
    r.montoAnual,
    r.faseActual,
    r.responsableNombre,
    r.responsableProceso,
    r.fechaInicioProceso,
    r.fechaUltimaFase,
  ];
}

async function downloadExcel(rows: ExportRow[], filename: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, ...rows.map(rowToArray)]);
  ws["!cols"] = EXCEL_HEADERS.map((_, i) => ({
    wch: Math.max(EXCEL_HEADERS[i].length, ...rows.map((r) => (rowToArray(r)[i] ?? "").length)) + 2,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inscripciones");
  XLSX.writeFile(wb, filename);
}

export default function OnboardingClient() {
  const { empresaActiva } = useEmpresaFilter();

  // The server derives the access level from the identity; the UI only adapts what it shows.
  const seguimiento = useQuery(api.onboarding.suppliers.obtenerInscripcionesConUltimaFase, {
    empresa: empresaActiva ?? undefined,
  });
  const nivel = seguimiento?.access.nivel;
  const esSoloResponsable = nivel === "responsable";
  const esSoloConsulta = nivel === "solo_lectura";
  const esConsultaCreacion = nivel === "consulta_creacion";
  const esFull = nivel === "full";

  const tareas = useQuery(api.onboarding.suppliers.obtenerMisTareas, {});
  const tareasPendientes = tareas?.length ?? 0;

  const [tab, setTab] = useState<Tab>("seguimiento");
  const [modalOpen, setModalOpen] = useState(false);

  const [allRows, setAllRows] = useState<ExportRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<ExportRow[]>([]);
  const handleDataChange = useCallback((all: ExportRow[], filtered: ExportRow[]) => {
    setAllRows(all);
    setFilteredRows(filtered);
  }, []);

  const tabsVisibles = esSoloResponsable
    ? TABS.filter((t) => t.id === "seguimiento" || t.id === "configuracion")
    : esSoloConsulta || esConsultaCreacion
      ? TABS.filter((t) => t.id === "seguimiento")
      : TABS;
  const tabActual = tabsVisibles.some((t) => t.id === tab) ? tab : "seguimiento";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Inscripción de Proveedores y Contratistas
          </h1>
          <p className="mt-1 text-sm text-slate-500">Gestión del ciclo completo de inscripción y actualización.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {esFull && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg"
                disabled={filteredRows.length === 0}
                onClick={() => downloadExcel(filteredRows, `inscripciones-filtradas-${Date.now()}.xlsx`)}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
                Exportar filtrado
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg"
                disabled={allRows.length === 0}
                onClick={() => downloadExcel(allRows, `inscripciones-todas-${Date.now()}.xlsx`)}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
                Exportar todo
              </Button>
              <ExportarEvaluacionesExcel />
            </>
          )}
          {nivel !== undefined && !esSoloConsulta && (
            <Button size="sm" className="h-9 rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={() => setModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Iniciar Proceso
            </Button>
          )}
        </div>
      </div>

      <ModalIniciarProceso open={modalOpen} onOpenChange={setModalOpen} />

      <div className="mb-6">
        <div className="border-b border-slate-200">
          <div className="flex gap-0">
            {tabsVisibles.map(({ id, label, icon: Icon }) => {
              const active = tabActual === id;
              const showBadge = id === "mis-tareas" && tareasPendientes > 0;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-hidden ${
                    active ? "text-blue-600" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {showBadge && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">
                      {tareasPendientes}
                    </span>
                  )}
                  {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          {tabActual === "seguimiento" && <TableSeguimiento data={seguimiento} onDataChange={handleDataChange} />}

          {tabActual === "mis-tareas" && <MisTareas tareas={tareas} />}

          {tabActual === "reportes" && esFull && <ReportesContainer />}

          {tabActual === "configuracion" &&
            (esSoloResponsable ? (
              <ConfigTiposProveedor soloCrear />
            ) : (
              <div className="space-y-6">
                <ConfigRoles canEdit={seguimiento?.access.isAdmin === true} />
                <ConfigTiposProveedor soloCrear={seguimiento?.access.isAdmin !== true} />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
