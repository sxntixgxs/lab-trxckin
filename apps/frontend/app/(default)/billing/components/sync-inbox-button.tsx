"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { getFacturacionErrorMessage } from "../lib/user-facing-error";

export function FacturacionSyncInboxButton({
  variant = "default",
  limit,
}: {
  variant?: "default" | "outline";
  limit?: number;
}) {
  const [loading, setLoading] = useState(false);
  const syncInbox = useAction(api.facturacionGraph.sincronizarBandeja);

  return (
    <Button
      type="button"
      variant={variant}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const result = await syncInbox(limit ? { limit } : {});
          const skippedText =
            result.skipped > 0
              ? ` ${result.skipped} cuenta(s) en modo manual omitida(s).`
              : "";
          toast.success(
            `Bandeja sincronizada: ${result.processed} factura(s) procesada(s), ${result.synced} correo(s) revisado(s).${skippedText}`,
          );
        } catch (error) {
          toast.error(
            getFacturacionErrorMessage(
              error,
              "No fue posible sincronizar la bandeja. Intenta nuevamente.",
            ),
          );
        } finally {
          setLoading(false);
        }
      }}
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      Sincronizar bandeja
    </Button>
  );
}
