import { AlertTriangle, Plus, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FacturacionUserPicker } from "../../components/user-picker";
import type { FacturacionUsuario } from "../../hooks/use-facturacion-users";
import type { AnalistaCausacionRow, CupoBloque10 } from "../lib/types";

export function AnalistasPonderadosEditor({
  rows,
  usuarios,
  totalPeso,
  cuposBloque10,
  heading,
  addLabel,
  blockTitle,
  userPlaceholder,
  onChange,
  onRemove,
  onAdd,
  onSave,
}: {
  rows: AnalistaCausacionRow[];
  usuarios: FacturacionUsuario[];
  totalPeso: number;
  cuposBloque10: CupoBloque10[];
  heading: string;
  addLabel: string;
  blockTitle: string;
  userPlaceholder: (index: number) => string;
  onChange: (
    rowId: string,
    patch: Partial<Omit<AnalistaCausacionRow, "rowId">>,
  ) => void;
  onRemove: (rowId: string) => void;
  onAdd: () => void;
  onSave: () => void;
}) {
  const totalOk = totalPeso === 100;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <UsersRound className="h-4 w-4 text-sky-600" />
            {heading}
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              totalOk
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            Total {totalPeso}%
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <div
              key={row.rowId}
              className="grid gap-2 rounded-xl border border-white bg-white p-2 shadow-xs sm:grid-cols-[minmax(0,1fr)_96px_36px]"
            >
              <FacturacionUserPicker
                value={row.usuarioId}
                onChange={(value) => onChange(row.rowId, { usuarioId: value })}
                usuarios={usuarios}
                placeholder={userPlaceholder(index)}
              />
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={row.peso}
                onChange={(event) =>
                  onChange(row.rowId, { peso: event.target.value })
                }
                className="text-right"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                disabled={rows.length === 1}
                onClick={() => onRemove(row.rowId)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full rounded-xl border-dashed"
          onClick={onAdd}
        >
          <Plus className="mr-2 h-4 w-4" />
          {addLabel}
        </Button>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-sm text-slate-700">
        {totalOk && cuposBloque10.length > 0 ? (
          <>
            <p className="font-semibold text-sky-900">{blockTitle}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {cuposBloque10.map((item) => (
                <span
                  key={item.usuarioId}
                  className="rounded-full border border-white bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-xs"
                >
                  {item.nombre.split(" ")[0]}: {item.cupos}/10
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>El total debe sumar 100% para activar la distribución.</p>
          </div>
        )}
      </div>

      <Button onClick={onSave} className="w-full rounded-xl">
        Guardar distribución
      </Button>
    </div>
  );
}
