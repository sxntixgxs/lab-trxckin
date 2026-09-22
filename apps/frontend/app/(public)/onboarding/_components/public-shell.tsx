"use client";

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { AlertCircle, Check, ClipboardList, Loader2, Lock } from "lucide-react";
import type { FormBranding } from "@/lib/onboarding/branding";
import { cn } from "@/lib/utils";

export type AutosaveStatus = "oculto" | "saving" | "saved";

/** CSS variables so `bg-primary`, `text-primary` and `ring` follow the company color. */
export function brandingVars(branding: FormBranding): CSSProperties {
  return {
    "--primary": branding.primaryHsl,
    "--primary-foreground": "0 0% 100%",
    "--ring": branding.primaryHsl,
  } as CSSProperties;
}

export function PublicHeader({
  branding,
  titulo,
  subtitulo,
  autosave = "oculto",
}: {
  branding: FormBranding;
  titulo: string;
  subtitulo: string;
  autosave?: AutosaveStatus;
}) {
  const hostname = branding.web ? branding.web.replace(/^https?:\/\//, "").split("/")[0] : null;
  const logo = (
    <span className="flex items-center gap-2.5">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm ring-1 ring-white/25">
        <Image src={branding.icon} alt="" width={36} height={36} className="h-full w-full object-contain" unoptimized priority />
      </span>
      <span className="text-sm font-semibold tracking-wide text-white">{branding.nombreCorto}</span>
    </span>
  );
  return (
    <header className="sticky top-0 z-50">
      <div style={{ backgroundColor: branding.color }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {branding.web ? (
            <a href={branding.web} target="_blank" rel="noopener noreferrer" className="inline-block shrink-0 transition-opacity hover:opacity-85">
              {logo}
            </a>
          ) : (
            <span className="inline-block shrink-0">{logo}</span>
          )}
          <div className="hidden flex-col items-center sm:flex">
            <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.18em] text-white/60">{branding.nombre}</span>
            <span className="mt-0.5 text-sm font-bold leading-none tracking-wide text-white">{titulo}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 sm:flex">
              <Lock className="h-3 w-3 text-white/70" />
              <span className="text-[11px] font-medium text-white/80">Formulario seguro</span>
            </div>
            {hostname && (
              <a href={branding.web} target="_blank" rel="noopener noreferrer" className="hidden text-xs text-white/40 transition-colors hover:text-white/70 md:block">
                {hostname} ↗
              </a>
            )}
          </div>
        </div>
      </div>
      <div className="border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6">
          <ClipboardList className="h-3.5 w-3.5 shrink-0" style={{ color: branding.color }} />
          <p className="text-xs text-slate-500">{subtitulo}</p>
          <div className="ml-auto hidden shrink-0 items-center gap-3 sm:flex">
            {autosave !== "oculto" && (
              <div className="flex items-center gap-1.5">
                {autosave === "saving" ? <Loader2 className="h-3 w-3 animate-spin text-slate-400" /> : <Check className="h-3 w-3 text-green-500" />}
                <span className="text-[11px] text-slate-400">{autosave === "saving" ? "Guardando..." : "Guardado"}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[11px] text-slate-400">Conexión cifrada</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter({ branding }: { branding: FormBranding }) {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <p className="text-center text-xs text-slate-400">
          © {new Date().getFullYear()} {branding.nombre} — Todos los derechos reservados
        </p>
      </div>
    </footer>
  );
}

/** Full-page shell with header, brand variables and footer. */
export function PublicShell({
  branding,
  titulo,
  subtitulo,
  autosave,
  children,
  center = false,
  className,
}: {
  branding: FormBranding;
  titulo: string;
  subtitulo: string;
  autosave?: AutosaveStatus;
  children: ReactNode;
  /** Center the content vertically (status cards). */
  center?: boolean;
  className?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900" style={brandingVars(branding)}>
      <PublicHeader branding={branding} titulo={titulo} subtitulo={subtitulo} autosave={autosave} />
      <main className={cn(center ? "flex flex-1 items-center justify-center px-4 py-16" : "flex-1", className)}>{children}</main>
      <PublicFooter branding={branding} />
    </div>
  );
}

/** Colored-header card used for every phase status. */
export function StatusCard({
  tone,
  titulo,
  descripcion,
  razonSocial,
  icon,
  children,
}: {
  tone: "primary" | "blue" | "amber" | "indigo" | "orange" | "green" | "red" | "slate";
  titulo: string;
  descripcion?: ReactNode;
  razonSocial?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const bg: Record<typeof tone, string> = {
    primary: "bg-primary",
    blue: "bg-blue-600",
    amber: "bg-amber-500",
    indigo: "bg-indigo-600",
    orange: "bg-orange-500",
    green: "bg-green-600",
    red: "bg-red-600",
    slate: "bg-slate-600",
  };
  return (
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
      <div className={cn("px-8 py-8 text-white", bg[tone], icon && "text-center")}>
        {icon}
        <h2 className="text-xl font-bold">{titulo}</h2>
        {descripcion && <p className="mt-1 text-sm text-white/80">{descripcion}</p>}
      </div>
      <div className="space-y-4 px-8 py-6">
        {razonSocial && (
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Empresa: <strong className="text-slate-700">{razonSocial}</strong>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function LoadingScreen({ branding, titulo, subtitulo, mensaje = "Verificando enlace..." }: { branding: FormBranding; titulo: string; subtitulo: string; mensaje?: string }) {
  return (
    <PublicShell branding={branding} titulo={titulo} subtitulo={subtitulo} center>
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-slate-500">{mensaje}</p>
      </div>
    </PublicShell>
  );
}

export function InvalidLinkScreen({
  branding,
  titulo,
  subtitulo,
  motivo = "El enlace es inválido, ya fue utilizado o expiró.",
}: {
  branding: FormBranding;
  titulo: string;
  subtitulo: string;
  motivo?: string;
}) {
  return (
    <PublicShell branding={branding} titulo={titulo} subtitulo={subtitulo} center>
      <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <AlertCircle className="h-6 w-6 text-amber-600" />
        </div>
        <h2 className="text-lg font-bold text-amber-900">Enlace inválido o vencido</h2>
        <p className="mt-2 text-sm text-amber-700">{motivo}</p>
        <p className="mt-3 text-sm text-amber-700">
          Solicite un nuevo enlace al equipo que lo invitó{branding.contactEmail ? ` (${branding.contactEmail})` : ""}. Por seguridad, cada correo trae un enlace
          nuevo y los anteriores dejan de funcionar.
        </p>
      </div>
    </PublicShell>
  );
}
