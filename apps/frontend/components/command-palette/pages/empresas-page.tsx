"use client";

import { Building2, Check } from "lucide-react";
import { toast } from "sonner";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { filterCommands } from "@/lib/command-palette/filter";

export function EmpresasPage({ query, close }: { query: string; close: () => void }) {
  const { empresaActiva, setEmpresaActiva, opcionesSelector } = useEmpresaFilter();
  const opciones = filterCommands(
    opcionesSelector.map((opcion) => ({ ...opcion, label: opcion.nombre })),
    query,
  );

  return (
    <CommandGroup heading="Cambiar empresa">
      {opciones.map((opcion) => (
        <CommandItem
          key={opcion.id ?? "todas"}
          value={`empresa:${opcion.id ?? "todas"}`}
          onSelect={() => {
            setEmpresaActiva(opcion.id);
            close();
            toast.success(`Empresa activa: ${opcion.nombre}`);
          }}
        >
          <Building2 className="mr-2 h-4 w-4 text-slate-400" aria-hidden />
          <span className="flex-1">{opcion.nombre}</span>
          {opcion.id === empresaActiva && <Check className="h-4 w-4 text-sky-600" aria-label="Activa" />}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
