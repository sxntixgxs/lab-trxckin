"use client";

import { FacturacionUserPicker } from "@/app/(default)/billing/components/user-picker";
import type { FacturacionUsuario } from "@/app/(default)/billing/hooks/use-facturacion-users";

export function MultiUserPicker({
  usuarios,
  selectedIds,
  onChange,
  placeholder,
}: {
  usuarios: FacturacionUsuario[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const selected = usuarios.filter((usuario) => selectedIds.includes(usuario.id));
  return (
    <div className="space-y-2">
      <FacturacionUserPicker
        value={null}
        onChange={(next) => {
          if (!next || selectedIds.includes(next)) return;
          onChange([...selectedIds, next]);
        }}
        usuarios={usuarios}
        placeholder={placeholder}
      />
      <div className="flex flex-wrap gap-2">
        {selected.map((usuario) => (
          <button
            key={usuario.id}
            type="button"
            onClick={() => onChange(selectedIds.filter((id) => id !== usuario.id))}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            {usuario.nombre}
            <span aria-hidden>x</span>
          </button>
        ))}
        {selected.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500">
            Sin usuarios seleccionados.
          </p>
        ) : null}
      </div>
    </div>
  );
}
