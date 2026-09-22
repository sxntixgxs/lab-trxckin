"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { IMPERSONATION_CHANGED_EVENT } from "@/lib/impersonate-client";

export function UserSync() {
  const { user } = useAuth();
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    async function sync() {
      try {
        // 1) Upsert our own row from the Convex identity (no privilege fields).
        await storeUser({});
        if (cancelled) {
          return;
        }
        // 2) The Next server loads role/permisos/empresas from Nest and writes them to
        //    Convex with CONVEX_SERVER_SECRET; the browser never sends privileges.
        await fetch("/api/me", { method: "POST", cache: "no-store" });
      } catch (error) {
        console.error("Failed to sync user", error);
      }
    }

    void sync();
    const onChanged = () => {
      void sync();
    };
    window.addEventListener(IMPERSONATION_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(IMPERSONATION_CHANGED_EVENT, onChanged);
    };
  }, [storeUser, user]);

  return null;
}
