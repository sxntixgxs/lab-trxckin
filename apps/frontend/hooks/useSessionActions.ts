"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { reloadAfterSessionChange, restoreImpersonation } from "@/lib/impersonate-client";

/** Session actions shared by the header and the command palette. */
export function useSessionActions() {
  const { signOut } = useAuth();
  const { backendUser } = useCurrentUser();
  const [restaurando, setRestaurando] = useState(false);
  const isImpersonating = Boolean(backendUser?.isImpersonating);

  const restore = useCallback(async () => {
    try {
      setRestaurando(true);
      const result = await restoreImpersonation();
      if (!result.ok) {
        throw new Error(result.message);
      }
      reloadAfterSessionChange("Has vuelto a tu cuenta de administrador");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo restaurar la cuenta");
      setRestaurando(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (isImpersonating) {
      await restoreImpersonation();
    }
    await signOut();
  }, [isImpersonating, signOut]);

  return { isImpersonating, restaurando, restore, logout };
}
