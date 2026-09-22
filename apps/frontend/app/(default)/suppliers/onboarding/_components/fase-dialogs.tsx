"use client";

import type { Id } from "@/convex/_generated/dataModel";
import FaseIDialog from "./fase-I-dialog";
import FaseIIIDialog from "./fase-III-dialog";
import FaseIVDialog from "./fase-IV-dialog";
import FaseVDialog from "./fase-V-dialog";
import FaseVIDialog from "./fase-VI-dialog";

export type FaseDialogKey = "I" | "III" | "IV" | "V" | "VI";

/** Which management dialog handles a phase (undefined = nothing to manage internally). */
export function faseDialogFor(fase: string | undefined): FaseDialogKey | undefined {
  switch (fase) {
    case "I_ANALISIS_RIESGO":
      return "I";
    case "III_REVISION_DOCUMENTAL":
    case "III_REVISION_DOCUMENTAL_COMPRAS":
    case "III_REVISION_DOCUMENTAL_CUMPLIMIENTO":
      return "III";
    case "IV_APROBADO_CUMPLIMIENTO":
      return "IV";
    case "V_EVALUACION_COMPRAS":
      return "V";
    case "VI_CREACION_CONTABILIDAD":
      return "VI";
    default:
      return undefined;
  }
}

/** Mounts the management dialog for the selected inscription. */
export function FaseDialogs({
  inscripcionId,
  dialog,
  onClose,
}: {
  inscripcionId: Id<"onboardingProveedores"> | null;
  dialog: FaseDialogKey | null;
  onClose: () => void;
}) {
  if (!inscripcionId || !dialog) return null;
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  switch (dialog) {
    case "I":
      return <FaseIDialog inscripcionId={inscripcionId} open onOpenChange={onOpenChange} />;
    case "III":
      return <FaseIIIDialog inscripcionId={inscripcionId} open onOpenChange={onOpenChange} />;
    case "IV":
      return <FaseIVDialog inscripcionId={inscripcionId} open onOpenChange={onOpenChange} />;
    case "V":
      return <FaseVDialog inscripcionId={inscripcionId} open onOpenChange={onOpenChange} />;
    case "VI":
      return <FaseVIDialog inscripcionId={inscripcionId} open onOpenChange={onOpenChange} />;
  }
}
