"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { FacturacionUsuario } from "../hooks/use-facturacion-users";

export function FacturacionUserPicker({
  value,
  onChange,
  usuarios,
  placeholder,
  disabled,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  usuarios: FacturacionUsuario[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => usuarios.find((usuario) => usuario.id === value) ?? null,
    [usuarios, value],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return usuarios;

    return usuarios.filter((usuario) => {
      return [usuario.nombre, usuario.email, usuario.cedula, usuario.cargo]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [query, usuarios]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">
            {selected ? `${selected.nombre} · ${selected.email}` : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre, correo o cédula..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No se encontraron usuarios.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                Limpiar selección
              </CommandItem>
              {filtered.map((usuario) => (
                <CommandItem
                  key={usuario.id}
                  value={usuario.id}
                  onSelect={() => {
                    onChange(usuario.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === usuario.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{usuario.nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {usuario.email}
                      {usuario.cargo ? ` · ${usuario.cargo}` : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
