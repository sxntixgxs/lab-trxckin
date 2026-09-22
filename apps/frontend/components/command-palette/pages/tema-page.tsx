"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { filterCommands } from "@/lib/command-palette/filter";

const TEMAS = [
  { id: "light", label: "Claro", icon: Sun, keywords: ["light"] },
  { id: "dark", label: "Oscuro", icon: Moon, keywords: ["dark"] },
  { id: "system", label: "Sistema", icon: Monitor, keywords: ["system", "automatico"] },
];

export function TemaPage({ query, close }: { query: string; close: () => void }) {
  const { theme, setTheme } = useTheme();

  return (
    <CommandGroup heading="Cambiar tema">
      {filterCommands(TEMAS, query).map(({ id, label, icon: Icon }) => (
        <CommandItem
          key={id}
          value={`tema:${id}`}
          onSelect={() => {
            setTheme(id);
            close();
          }}
        >
          <Icon className="mr-2 h-4 w-4 text-slate-400" aria-hidden />
          <span className="flex-1">{label}</span>
          {theme === id && <Check className="h-4 w-4 text-sky-600" aria-label="Activo" />}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
