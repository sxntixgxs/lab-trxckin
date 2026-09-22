"use client";

import type { Id } from "@/convex/_generated/dataModel";
import FaseIDialog from "./fase-I-dialog";
import FaseIIIDialog from "./fase-III-dialog";
import FaseIIIADialog from "./fase-IIIA-dialog";
import FaseIVDialog from "./fase-IV-dialog";

export type FaseDialogKey = "I" | "III" | "IIIA" | "IV";

/** Which management dialog handles a phase (undefined = nothing to manage internally). */
export function faseDialogFor(fase: string | undefined): FaseDialogKey | undefined {
  switch (fase) {
    case "I_ANALISIS_RIESGO":
      return "I";
    case "III_REVISION_DOCUMENTAL":
      return "III";
    case "IIIA_APROBACION_CUMPLIMIENTO":
      return "IIIA";
    case "IV_CREACION_CONTABILIDAD":
      return "IV";
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
  inscripcionId: Id<"onboardingClientes"> | null;
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
    case "IIIA":
      return <FaseIIIADialog inscripcionId={inscripcionId} open onOpenChange={onOpenChange} />;
    case "IV":
      return <FaseIVDialog inscripcionId={inscripcionId} open onOpenChange={onOpenChange} />;
  }
}
