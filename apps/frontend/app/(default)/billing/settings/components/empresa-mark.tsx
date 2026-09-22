import Image from "next/image";
import { getEmpresaInfo } from "@/lib/empresas";

/** One-letter company mark (`public/images/empresas/*-icon.svg`), with an initial as fallback. */
export function EmpresaMark({
  empresaId,
  nombre,
  className,
}: {
  empresaId: number;
  nombre: string;
  className?: string;
}) {
  const info = getEmpresaInfo(empresaId);

  if (!info) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-lg bg-slate-900 text-[10px] font-bold text-white ${className ?? ""}`}
      >
        {nombre.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <Image src={info.icon} alt={nombre} width={40} height={40} className={className} unoptimized />
  );
}
