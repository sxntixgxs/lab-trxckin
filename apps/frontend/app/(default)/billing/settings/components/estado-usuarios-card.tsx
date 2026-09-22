import { UserCheck } from "lucide-react";

export function EstadoUsuariosCard({
  totalUsuarios,
  totalUsuariosFinanzas,
}: {
  totalUsuarios: number;
  totalUsuariosFinanzas: number;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <UserCheck className="h-4 w-4 text-emerald-600" />
        Trxckin detectó {totalUsuarios} usuario(s), {totalUsuariosFinanzas}{" "}
        usuario(s) de Gestión Financiera para alimentar este módulo.
      </div>
    </section>
  );
}
