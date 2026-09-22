"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TablaReporteProcesos from "../tabla-reporte-procesos";
import TablaMatrizRiesgo from "./tabla-matriz-riesgo";

type ReporteSubvista = "tiempos" | "matriz";

export default function ReportesContainer() {
  const [subvista, setSubvista] = useState<ReporteSubvista>("tiempos");

  return (
    <div className="space-y-4">
      <Tabs value={subvista} onValueChange={(value) => setSubvista(value as ReporteSubvista)}>
        <TabsList className="h-10 rounded-lg bg-slate-100 p-1">
          <TabsTrigger value="tiempos" className="rounded-md px-4 text-sm">
            Tiempos del proceso
          </TabsTrigger>
          <TabsTrigger value="matriz" className="rounded-md px-4 text-sm">
            Matriz de riesgo
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {subvista === "tiempos" ? <TablaReporteProcesos /> : <TablaMatrizRiesgo />}
    </div>
  );
}
