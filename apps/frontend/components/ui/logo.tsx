import Link from "next/link";

export default function Logo({ sidebar = false }: { sidebar?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={
        sidebar
          ? "sidebar-brand relative flex items-center justify-center mx-auto overflow-hidden transition-opacity duration-200 hover:opacity-90"
          : "inline-flex items-center"
      }
    >
      <span className="sidebar-brand-logo text-sm font-semibold tracking-[0.18em] text-indigo-100">
        TRXCKIN
      </span>
      {sidebar ? (
        <span className="sidebar-brand-icon pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-xs font-bold text-indigo-200 ring-1 ring-white/[0.08]">
            TX
          </span>
        </span>
      ) : null}
    </Link>
  );
}
