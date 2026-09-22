import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inscripción",
  robots: { index: false, follow: false },
  // Public links carry an access token in the URL: never leak it through the referrer.
  referrer: "no-referrer",
};

/**
 * Shell for the public onboarding forms (suppliers/customers). No sidebar, no header,
 * no user sync: these pages are reached with a signed link and authenticate with it.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">{children}</div>;
}
