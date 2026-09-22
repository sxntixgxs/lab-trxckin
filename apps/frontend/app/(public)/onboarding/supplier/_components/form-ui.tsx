"use client";

import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { cn } from "@/lib/utils";
import type { FormValues } from "./form-schema";

export type SupplierForm = UseFormReturn<FormValues>;

export const LABEL = "text-xs font-semibold uppercase tracking-wide text-slate-500";
export const INPUT = "border-slate-200 bg-slate-50";
export const INPUT_WHITE = "border-slate-200 bg-white";

export function SectionHeader({ step, title, icon: Icon, description }: { step: string; title: string; icon: React.ElementType; description?: string }) {
  return (
    <div className="mb-6 flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{step}</p>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
    </div>
  );
}

export function FieldGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

export function Section({ index, register, children }: { index: number; register: (index: number, el: HTMLElement | null) => void; children: ReactNode }) {
  return (
    <section ref={(el) => register(index, el)} className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
      {children}
    </section>
  );
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
    >
      {children}
    </button>
  );
}

/** `<input type="date">` bound to an epoch-ms number field (0 / undefined = empty). */
export function epochToDateInput(value: number | undefined | null): string {
  return value && value > 0 ? new Date(value).toISOString().slice(0, 10) : "";
}

export function dateInputToEpoch(value: string, empty: 0 | undefined): number | undefined {
  return value ? new Date(value).getTime() : empty;
}
