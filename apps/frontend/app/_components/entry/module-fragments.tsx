import type { ReactNode } from "react";
import { Handshake, Truck, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { demoAdvance, demoCustomer, demoSupplier } from "./entry-data";

function Fragment({
  id,
  icon: Icon,
  title,
  job,
  className,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  job: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article aria-labelledby={id} className={cn("entry-panel flex flex-col p-5", className)}>
      <header className="flex items-center gap-3">
        <Icon aria-hidden className="h-5 w-5 shrink-0 text-indigo-300" />
        <h3 id={id} className="text-base font-medium text-slate-100">
          {title}
        </h3>
      </header>
      <p className="mt-1 text-sm text-slate-400">{job}</p>
      <div className="mt-4 flex-1">{children}</div>
    </article>
  );
}

/**
 * Small step line shared by the advance chain and the customer phases. Labels are the app's
 * Spanish names; on phones only the current one shows, and it never truncates.
 */
function Steps({ steps, current, label }: { steps: Array<{ key?: string; label: string }>; current: number; label: string }) {
  return (
    <ol aria-label={label} className="flex items-start">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li
            key={`${step.key ?? ""}${step.label}`}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className="entry-step relative flex min-w-0 flex-1 flex-col items-center text-center"
          >
            <span aria-hidden className="entry-step-node" />
            {step.key ? (
              <span className={cn("entry-mono mt-2 text-xs", state === "current" ? "text-slate-50" : "text-slate-400")}>
                {step.key}
              </span>
            ) : null}
            <span
              lang="es"
              className={cn(
                "text-[11px] leading-tight",
                step.key ? "mt-0.5" : "mt-2",
                state === "current"
                  ? "whitespace-nowrap font-medium text-slate-100"
                  : "max-w-full truncate text-slate-400 max-sm:sr-only",
              )}
            >
              {step.label}
            </span>
            <span className="sr-only">
              {state === "done" ? " (done)" : state === "current" ? " (current)" : " (upcoming)"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ModuleFragments() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
      <Fragment
        id="entry-finance"
        icon={Wallet}
        title="Finance"
        job="Employee advances and petty cash"
        className="md:col-span-2 xl:col-span-5"
      >
        <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="entry-mono text-slate-100">{demoAdvance.number}</span>
          <span className="entry-mono text-slate-300">{demoAdvance.amount}</span>
        </p>
        <div className="mt-4">
          <Steps steps={demoAdvance.steps} current={demoAdvance.current} label={`${demoAdvance.number} approval chain`} />
        </div>
        <p className="mt-4 text-sm text-slate-400">
          <span lang="es">Tesorería</span> pays it out; it is legalized against the supplier&apos;s invoice when that
          reaches Billing.
        </p>
      </Fragment>

      <Fragment
        id="entry-suppliers"
        icon={Truck}
        title="Suppliers"
        job="Onboarding where the risk decides the review"
        className="xl:col-span-4"
      >
        <p className="text-sm text-slate-400">
          Risk: <span lang="es" className="text-slate-100">{demoSupplier.risk}</span>
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          Evaluation: <span lang="es" className="text-slate-100">{demoSupplier.evaluation}</span>
        </p>
        <p className="mt-2.5 text-xs text-slate-400">
          <span lang="es">{demoSupplier.phase}</span>, two lanes in parallel
        </p>
        <ul className="mt-2 space-y-1.5">
          {demoSupplier.lanes.map((lane) => (
            <li key={lane.owner} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span lang="es" className="text-slate-200">
                {lane.owner}
              </span>
              <span aria-hidden className="flex gap-1">
                {Array.from({ length: lane.total }, (_, doc) => (
                  <span key={doc} className="entry-doc" data-approved={doc < lane.approved ? "" : undefined} />
                ))}
              </span>
              <span className="entry-mono text-slate-300">
                {lane.approved}/{lane.total}
                <span className="sr-only"> documents approved</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-slate-400">
          Next: <span lang="es">{demoSupplier.next}</span>, by the medium-risk tier
        </p>
      </Fragment>

      <Fragment
        id="entry-customers"
        icon={Handshake}
        title="Customers"
        job="Onboarding with payment terms"
        className="xl:col-span-3"
      >
        <p className="text-sm text-slate-400">
          Terms set by sales: <span className="entry-mono text-slate-100">{demoCustomer.paymentTerms}</span>
        </p>
        <div className="mt-4">
          <Steps steps={demoCustomer.steps} current={demoCustomer.current} label="Customer onboarding phases" />
        </div>
        <p className="mt-4 text-sm text-slate-400">
          <span lang="es" className="text-slate-200">
            {demoCustomer.currentLabel}
          </span>
          : the legal representative signs. Then <span lang="es">Cumplimiento</span> reviews and a tier chosen by
          the risk approves.
        </p>
      </Fragment>
    </div>
  );
}
