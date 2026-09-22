"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { reloadAfterSessionChange, restoreImpersonation } from "@/lib/impersonate-client";
import { useAppProvider } from "@/providers/app-provider";

export default function Header() {
  const { sidebarOpen, setSidebarOpen } = useAppProvider();
  const { user, signOut } = useAuth();
  const { backendUser } = useCurrentUser();
  const [restaurando, setRestaurando] = useState(false);
  const isImpersonating = Boolean(backendUser?.isImpersonating);
  const displayEmail = backendUser?.email || user?.email;

  const handleRestore = async () => {
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
  };

  const handleSignOut = async () => {
    if (isImpersonating) {
      await restoreImpersonation();
    }
    await signOut();
  };

  return (
    <header className="app-shell-header sticky top-0 bg-white dark:bg-[#182235] border-b border-slate-200 dark:border-slate-700 z-30">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 -mb-px">
          <div className="flex">
            <button
              className="text-slate-500 hover:text-slate-600 lg:hidden"
              aria-controls="sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <span className="sr-only">Abrir Menu</span>
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="5" width="16" height="2" />
                <rect x="4" y="11" width="16" height="2" />
                <rect x="4" y="17" width="16" height="2" />
              </svg>
            </button>
          </div>
          <div className="flex items-center space-x-3">
            {isImpersonating && (
              <>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  ACTUANDO
                </span>
                <button
                  type="button"
                  onClick={() => void handleRestore()}
                  disabled={restaurando}
                  className="rounded-xl bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {restaurando ? "Restaurando..." : "Volver a mi cuenta"}
                </button>
              </>
            )}
            {displayEmail && (
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {isImpersonating ? backendUser?.nombre ?? displayEmail : displayEmail}
              </span>
            )}
            <hr className="w-px h-6 bg-slate-200 dark:bg-slate-700 border-none" />
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-xl bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
