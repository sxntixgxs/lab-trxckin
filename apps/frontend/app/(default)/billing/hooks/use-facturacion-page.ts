"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/useCurrentUser";
import { useHasAccess } from "@/hooks/useHasAccess";

export function useFacturacionPage(ruta: string) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const hasAccess = useHasAccess(ruta);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/sign-in");
    }
  }, [router, status]);

  return {
    session,
    status,
    hasAccess,
  };
}
