import Image from "next/image";
import Link from "next/link";
import type { EmpresaInfo } from "@/lib/empresas";

export default function Logo({
  sidebar = false,
  empresa = null,
}: {
  sidebar?: boolean;
  /** Active company: swaps the collapsed-rail tile for its icon. */
  empresa?: EmpresaInfo | null;
}) {
  const className = sidebar
    ? "sidebar-brand relative flex items-center justify-center mx-auto overflow-hidden transition-opacity duration-200 hover:opacity-90"
    : "inline-flex items-center";

  return (
    <Link href="/dashboard" className={className}>
      <span className="sidebar-brand-logo text-sm font-semibold tracking-[0.18em] text-indigo-100">
        TRXCKIN
      </span>
      {sidebar ? (
        <span className="sidebar-brand-icon pointer-events-none absolute inset-0 flex items-center justify-center">
          {empresa ? (
            <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl shadow-sm ring-1 ring-white/[0.08]">
              <Image
                src={empresa.icon}
                alt={empresa.nombre}
                width={36}
                height={36}
                className="h-full w-full object-contain"
                unoptimized
              />
            </span>
          ) : (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-xs font-bold text-indigo-200 ring-1 ring-white/[0.08]">
              TX
            </span>
          )}
        </span>
      ) : null}
    </Link>
  );
}
