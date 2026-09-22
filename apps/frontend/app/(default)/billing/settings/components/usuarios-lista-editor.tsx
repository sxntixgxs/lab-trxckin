import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FacturacionUserPicker } from "../../components/user-picker";
import type { FacturacionUsuario } from "../../hooks/use-facturacion-users";

export function UsuariosListaEditor({
  selectedIds,
  usuarios,
  placeholder,
  emptyLabel,
  onChange,
  onSave,
}: {
  selectedIds: string[];
  usuarios: FacturacionUsuario[];
  placeholder: string;
  emptyLabel: string;
  onChange: (ids: string[]) => void;
  onSave: () => void;
}) {
  const selectedUsers = usuarios.filter((usuario) =>
    selectedIds.includes(usuario.id),
  );

  return (
    <div className="space-y-3">
      <FacturacionUserPicker
        value={null}
        onChange={(next) => {
          if (!next || selectedIds.includes(next)) return;
          onChange([...selectedIds, next]);
        }}
        usuarios={usuarios}
        placeholder={placeholder}
      />

      <div className="space-y-2">
        {selectedUsers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500">
            {emptyLabel}
          </p>
        ) : (
          selectedUsers.map((usuario) => (
            <div
              key={usuario.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {usuario.nombre}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {usuario.email}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                onClick={() =>
                  onChange(selectedIds.filter((id) => id !== usuario.id))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <Button onClick={onSave} className="w-full rounded-xl">
        Guardar lista
      </Button>
    </div>
  );
}
