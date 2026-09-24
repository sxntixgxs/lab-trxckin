import type { CSSProperties } from "react";
import Image from "next/image";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { billingPhases, currentPhaseIndex, demoInvoice } from "./entry-data";

const phaseLabel = (key: string) => billingPhases.find((phase) => phase.key === key)?.label ?? key;

/**
 * Billing's workflow with one fictional invoice: the eight phases on one line that never wraps,
 * the current owner with the business-day SLA, and the append-only history.
 */
export function BillingPanel() {
  const { sla } = demoInvoice;
  // The phase line and the SLA meter time their one-off animation from the current phase.
  const panelStyle = { "--entry-current": currentPhaseIndex } as CSSProperties;

  return (
    <article
      aria-labelledby="entry-billing"
      className="entry-panel entry-billing relative overflow-hidden p-5 md:p-6"
      style={panelStyle}
    >
      <span aria-hidden className="entry-accent-line pointer-events-none absolute inset-x-6 top-0 h-px" />
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <FileText aria-hidden className="h-5 w-5 shrink-0 text-indigo-300" />
          <h3 id="entry-billing" className="text-base font-medium text-slate-100">
            Billing
          </h3>
          <p className="hidden text-sm text-slate-400 sm:block">
            Supplier e-invoices, from the reception mailbox to payment
          </p>
        </div>
        <p className="entry-fictional">Fictional invoice</p>
      </header>

      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300">
        <span className="entry-mono text-base text-slate-100">{demoInvoice.number}</span>
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          {demoInvoice.supplier} <span className="text-slate-400">to</span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Image
              src={demoInvoice.companyIcon}
              alt=""
              width={20}
              height={20}
              unoptimized
              className="h-5 w-5 rounded-md ring-1 ring-white/10"
            />
            <span lang="es">{demoInvoice.company}</span>
          </span>
        </span>
        <span className="entry-mono text-slate-100">{demoInvoice.amount}</span>
      </p>

      <div className="entry-phase-line mt-5">
        <div aria-hidden className="entry-phase-track" />
        <div aria-hidden className="entry-phase-fill" />
        <div aria-hidden className="entry-now-light" />
        <ol aria-label={`${demoInvoice.number} workflow`} className="relative grid grid-cols-8">
          {billingPhases.map((phase, index) => {
            const state = index < currentPhaseIndex ? "done" : index === currentPhaseIndex ? "current" : "upcoming";
            return (
              <li
                key={phase.key}
                data-state={state}
                aria-current={state === "current" ? "step" : undefined}
                className="entry-station flex flex-col items-center text-center"
                style={{ "--i": index } as CSSProperties}
              >
                <span aria-hidden className="entry-node" />
                <span
                  lang="es"
                  className={cn(
                    "mt-3 px-1 text-xs leading-tight",
                    state === "current" ? "font-medium text-slate-50" : "text-slate-400 max-md:sr-only",
                  )}
                >
                  {phase.label}
                </span>
                <span className="sr-only">
                  {state === "done" ? " (done)" : state === "current" ? " (current phase)" : " (upcoming)"}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-0">
        <div className="lg:pr-10">
          <p className="text-base text-slate-300">
            With <span className="font-medium text-slate-50">{demoInvoice.owner}</span> ·{" "}
            <span lang="es">{demoInvoice.ownerRole}</span> since{" "}
            <span className="entry-mono text-slate-200">{demoInvoice.since}</span>
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {demoInvoice.task.text} <span lang="es">{demoInvoice.task.next}</span>
          </p>
          <div className="mt-4 flex items-center gap-3">
            <ol aria-hidden className="flex gap-1">
              {Array.from({ length: sla.of }, (_, day) => (
                <li
                  key={day}
                  data-filled={day < sla.day ? "" : undefined}
                  className="entry-sla-segment"
                  style={{ "--i": day } as CSSProperties}
                />
              ))}
            </ol>
            <p className="text-sm text-slate-200">
              Day <span className="entry-mono">{sla.day}</span> of <span className="entry-mono">{sla.of}</span>{" "}
              <span className="text-slate-400">business days</span>
            </p>
          </div>
        </div>

        <div className="lg:border-l lg:border-white/[0.07] lg:pl-10">
          <h4 className="text-xs text-slate-400">History, append-only</h4>
          <ol className="mt-1 divide-y divide-white/[0.06]">
            {demoInvoice.history.map((entry) => (
              <li key={entry.phase} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
                <span className="entry-mono text-slate-400">{entry.day}</span>
                <span className="text-slate-300">
                  <span lang="es" className="text-slate-100">
                    {phaseLabel(entry.phase)}
                  </span>{" "}
                  · {entry.text}
                  {"term" in entry ? (
                    <>
                      {" "}
                      <span lang="es">{entry.term}</span>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </article>
  );
}
