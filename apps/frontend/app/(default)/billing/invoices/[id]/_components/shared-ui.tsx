import { Download } from "lucide-react";
import type { ReactNode } from "react";

export function Detail({
  label,
  value,
  className,
  children,
}: {
  label: string;
  value?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <div className="mt-1.5 text-sm text-slate-900">{children ?? value}</div>
    </div>
  );
}

export function MoneyCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border p-5 shadow-xs ${
        highlight
          ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
          : "border-slate-200 bg-white"
      }`}
    >
      {highlight ? (
        <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-emerald-100/60 blur-2xl" />
      ) : null}
      <p className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p
        className={`relative mt-2 text-2xl font-semibold tracking-tight ${
          highlight ? "text-emerald-900" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function DocumentLink({
  href,
  label,
  hint,
  icon,
  highlight,
  download,
}: {
  href: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  highlight?: boolean;
  download?: string;
}) {
  return (
    <a
      href={href}
      target={download ? undefined : "_blank"}
      rel="noreferrer"
      {...(download ? { download } : {})}
      className={`group inline-flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm font-medium shadow-xs transition ${
        highlight
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-xl ${
          highlight
            ? "bg-emerald-500 text-white"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {icon}
      </span>
      <span className="flex flex-col leading-tight">
        <span>{label}</span>
        {hint ? (
          <span
            className={`text-[11px] font-normal ${
              highlight ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            {hint}
          </span>
        ) : null}
      </span>
      <Download className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
    </a>
  );
}

export function isPdfLikeAdjunto(adjunto?: {
  nombre?: string;
  mimeType?: string;
} | null) {
  if (!adjunto) return false;
  const mimeType = adjunto.mimeType?.toLowerCase() ?? "";
  const nombre = adjunto.nombre?.toLowerCase() ?? "";
  return mimeType === "application/pdf" || nombre.endsWith(".pdf");
}
