import type { Metadata } from "next";
import { Ubuntu_Mono } from "next/font/google";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { ArrowUpRight, LogIn, UserPlus } from "lucide-react";
import { AccessRequestLink, accessRequestHost } from "@/components/access-request-link";
import { getAccessRequestUrl } from "@/lib/app-env";
import { DEFAULT_RETURN_PATH, safeReturnPath, signInHref } from "@/lib/return-path";
import { BillingPanel } from "./_components/entry/billing-panel";
import { ModuleFragments } from "./_components/entry/module-fragments";

// Identifiers, amounts and business days only; prose stays in Ubuntu.
const ubuntuMono = Ubuntu_Mono({
  weight: ["400", "700"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-ubuntu-mono",
});

export const metadata: Metadata = {
  title: "Lab Trxckin · Finance operations demo",
  description:
    "Live demo of Lab Trxckin, an open-source finance operations platform for a group of companies: supplier e-invoices with approvals and business-day SLAs, employee advances and petty cash, and supplier and customer onboarding. All data is fictional.",
};

const PORTFOLIO_URL = "https://www.sxntixgxs.dev";
const REPO_URL = "https://github.com/sxntixgxs/lab-trxckin";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const [{ user }, params] = await Promise.all([withAuth(), searchParams]);
  // `?next=` comes from outside links (e.g. the portfolio) and is only honored for app pages.
  const next = safeReturnPath(params.next);
  if (user) {
    redirect(next ?? DEFAULT_RETURN_PATH);
  }

  const requestUrl = getAccessRequestUrl();
  const requestVia = requestUrl && accessRequestHost(requestUrl) === "linkedin.com" ? "Message me on LinkedIn" : "Request access";

  // Plain <a> for the auth routes: they are redirecting route handlers, which next/link would prefetch.
  return (
    <main lang="en" aria-labelledby="entry-title" className={`entry-page ${ubuntuMono.variable}`}>
      <div className="mx-auto flex min-h-dvh w-full max-w-[76rem] flex-col px-5 pb-8 pt-6 sm:px-8 lg:px-10">
        <header className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-xs font-bold text-indigo-200 ring-1 ring-white/[0.08]"
          >
            TX
          </span>
          <span className="text-sm font-bold tracking-[0.18em] text-indigo-100">
            TRXCKIN<span className="sr-only"> (Lab Trxckin)</span>
          </span>
        </header>

        <div className="mt-10 grid gap-10 lg:mt-8 lg:grid-cols-12 lg:items-start lg:gap-12">
          <div className="lg:col-span-8">
            <h1
              id="entry-title"
              className="text-balance text-[2.25rem] font-bold leading-[1.08] tracking-[-0.02em] text-slate-50 sm:text-[2.75rem]"
            >
              Finance operations as workflows, not email threads.
            </h1>
            <p className="mt-4 max-w-[75ch] text-base leading-relaxed text-slate-300 sm:text-lg">
              Lab Trxckin runs the finance back office of a group of companies. Every supplier invoice, advance
              and onboarding has a current owner and an audit trail.
            </p>
          </div>

          <div className="lg:col-span-4 lg:pt-1">
            <div className="flex flex-wrap gap-3 [&>a]:flex-auto">
              <a href={signInHref(next)} className="entry-button entry-button-primary">
                <LogIn aria-hidden className="h-4 w-4" />
                Sign in
              </a>
              <a href="/sign-up" className="entry-button entry-button-tonal">
                <UserPlus aria-hidden className="h-4 w-4" />
                Create account
              </a>
            </div>
            <AccessRequestLink
              newTabLabel="opens in a new tab"
              showHost
              className="entry-button entry-button-outline mt-3 w-full"
              hostClassName="entry-mono text-sm font-normal text-indigo-200/70"
            >
              Request access
            </AccessRequestLink>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              {requestUrl
                ? `New accounts start with the dashboard and your profile. ${requestVia} with your sign-up email and I'll turn on the modules you want to try.`
                : "New accounts start with the dashboard and your profile; an administrator turns on the modules."}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Your name and email are only used to run this demo and set up your access. The app itself is in
              Spanish.
            </p>
          </div>
        </div>

        <section aria-labelledby="entry-board" className="mt-12 lg:mt-8">
          <h2 id="entry-board" className="sr-only">
            Inside the demo
          </h2>
          <BillingPanel />
          <div className="mt-4">
            <ModuleFragments />
          </div>
        </section>

        <footer className="mt-14 flex flex-col gap-3 border-t border-white/[0.07] pt-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Every company, NIT and email here is fictional.</p>
          <p className="flex flex-wrap gap-x-6 gap-y-2">
            <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className="entry-link">
              Built by Santiago Sandoval
              <ArrowUpRight aria-hidden className="h-4 w-4" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="entry-link">
              Code on GitHub (MIT)
              <ArrowUpRight aria-hidden className="h-4 w-4" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
