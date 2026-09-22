import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FacturacionUserPicker } from "../../components/user-picker";
import type { FacturacionUsuario } from "../../hooks/use-facturacion-users";

export function GerenciasListaEditor({
  selectedIds,
  defaultId,
  usuarios,
  placeholder,
  emptyLabel,
  onChange,
  onDefaultChange,
  onSave,
}: {
  selectedIds: string[];
  defaultId: string | null;
  usuarios: FacturacionUsuario[];
  placeholder: string;
  emptyLabel: string;
  onChange: (ids: string[]) => void;
  onDefaultChange: (id: string | null) => void;
  onSave: () => void;
}) {
  const selectedUsers = selectedIds
    .map((id) => usuarios.find((usuario) => usuario.id === id))
    .filter((usuario): usuario is FacturacionUsuario => Boolean(usuario));
  const effectiveDefaultId =
    selectedIds.length === 1
      ? selectedIds[0]
      : defaultId && selectedIds.includes(defaultId)
        ? defaultId
        : selectedIds[0] ?? null;

  function removeUser(id: string) {
    const nextIds = selectedIds.filter((item) => item !== id);
    onChange(nextIds);
    if (nextIds.length === 0) {
      onDefaultChange(null);
      return;
    }
    if (effectiveDefaultId === id) {
      onDefaultChange(nextIds[0] ?? null);
    }
  }

  return (
    <div className="space-y-3">
      <FacturacionUserPicker
        value={null}
        onChange={(next) => {
          if (!next || selectedIds.includes(next)) return;
          const nextIds = [...selectedIds, next];
          onChange(nextIds);
          if (nextIds.length === 1) {
            onDefaultChange(next);
          }
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
          selectedUsers.map((usuario) => {
            const isDefault = effectiveDefaultId === usuario.id;
            const canChangeDefault = selectedUsers.length > 1;

            return (
              <div
                key={usuario.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {usuario.nombre}
                    </p>
                    {isDefault ? (
                      <Badge variant="secondary" className="rounded-md text-[10px]">
                        Default
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-slate-500">{usuario.email}</p>
                </div>
                {canChangeDefault ? (
                  <Button
                    type="button"
                    variant={isDefault ? "secondary" : "outline"}
                    size="sm"
                    className="h-8 rounded-lg text-xs"
                    onClick={() => onDefaultChange(usuario.id)}
                  >
                    {isDefault ? "Default" : "Marcar default"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => removeUser(usuario.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      <Button onClick={onSave} className="w-full rounded-xl">
        Guardar gerencias
      </Button>
    </div>
  );
}
