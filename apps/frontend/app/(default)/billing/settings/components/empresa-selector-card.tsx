import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmpresaMark } from "./empresa-mark";

type EmpresaOpcion = {
  id: number | null;
  nombre: string;
};

export function EmpresaSelectorCard({
  empresaActiva,
  opciones,
  onSelect,
}: {
  empresaActiva: number | null;
  opciones: EmpresaOpcion[];
  onSelect: (id: number | null) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        {empresaActiva !== null ? (
          <EmpresaMark
            empresaId={empresaActiva}
            nombre={opciones.find((opcion) => opcion.id === empresaActiva)?.nombre ?? ""}
            className="h-10 w-10 shrink-0"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Building2 className="h-4 w-4" />
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Empresa de configuración
          </h2>
          <p className="text-xs text-slate-500">
            Cada empresa mantiene su propia recepción, distribución y aprobadores.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {opciones
            .filter((opcion) => opcion.id !== null)
            .map((opcion) => (
              <Button
                key={opcion.id}
                type="button"
                variant={empresaActiva === opcion.id ? "default" : "outline"}
                size="sm"
                className="gap-2 rounded-xl pl-1.5"
                onClick={() => onSelect(opcion.id)}
              >
                <EmpresaMark
                  empresaId={opcion.id as number}
                  nombre={opcion.nombre}
                  className="h-5 w-5 shrink-0"
                />
                {opcion.nombre}
              </Button>
            ))}
        </div>
      </div>
    </section>
  );
}
