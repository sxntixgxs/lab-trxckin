"use client";

import { useState } from "react";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toDateTimeStr } from "@/app/(default)/suppliers/onboarding/_components/ui-config";
import { crearEnErp, type ModuloOnboarding, type RegistroErp } from "@/lib/erp/terceros";

type Props = {
  modulo: ModuloOnboarding;
  inscripcionId: string;
  /** From the inscription document; it updates reactively once the registration is recorded. */
  registroErp: RegistroErp | undefined;
  /** "proveedor" | "cliente", for the texts. */
  entidad: string;
  /** Called after a successful registration (e.g. to pre-tick the confirmation checkbox). */
  onRegistrado?: () => void;
};

/**
 * Last onboarding phase: registers the tercero in the ERP (the simulator locally), the way
 * Contabilidad would create it in SIESA, and shows the record once it is there.
 */
export function RegistroErpPanel({ modulo, inscripcionId, registroErp, entidad, onRegistrado }: Props) {
  const [enviando, setEnviando] = useState(false);

  async function registrar() {
    setEnviando(true);
    try {
      const { registroErp: registro } = await crearEnErp(modulo, inscripcionId);
      toast.success(
        registro.accion === "CREADO"
          ? `El ${entidad} quedó creado en el ERP.`
          : `El ${entidad} ya existía en el ERP y se actualizó con los datos de la inscripción.`,
      );
      if (!registro.catalogoActualizado) {
        toast.warning("El catálogo local aún no lo refleja. Sincroniza desde Administración → Terceros ERP.");
      }
      onRegistrado?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar en el ERP.");
    } finally {
      setEnviando(false);
    }
  }

  if (registroErp) {
    return (
      <div className="space-y-1 rounded-lg border border-teal-200 bg-white px-3 py-2.5 text-xs text-slate-700">
        <p className="flex items-center gap-1.5 font-semibold text-teal-800">
          <Database className="h-3.5 w-3.5" /> Registrado en el ERP el {toDateTimeStr(registroErp.fecha)}
        </p>
        <p>
          Tercero {registroErp.erpTerceroId} · sucursal {registroErp.sucursalId} ·{" "}
          {registroErp.accion === "CREADO" ? "creado" : "ya existía y se actualizó"}
        </p>
        {!registroErp.catalogoActualizado && (
          <div className="flex items-center gap-2 text-amber-700">
            <span>El catálogo local aún no lo refleja.</span>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={registrar} disabled={enviando}>
              {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Reintentar
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-xs text-slate-600">
        <p className="font-semibold text-slate-800">Registro en el ERP (simulado)</p>
        <p>Crea el tercero como {entidad} en el ERP con los datos de esta inscripción.</p>
      </div>
      <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={registrar} disabled={enviando}>
        {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
        Crear en ERP
      </Button>
    </div>
  );
}
