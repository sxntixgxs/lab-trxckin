import {
  ESTADO_TONE_CLASSES,
  type EstadoTone,
} from "@/lib/cajas-menores";

export function KpiTile({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: EstadoTone;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-xs ${ESTADO_TONE_CLASSES[tone].kpi ?? ESTADO_TONE_CLASSES[tone].badge}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-black tabular-nums">{value}</p>
    </div>
  );
}
