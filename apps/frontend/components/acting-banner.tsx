"use client";

import { ArrowLeftRight, EyeOff, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  ACTING_BANNER_MAX_RESULTS,
  type ActingBannerUsuario,
  filtrarUsuarios,
  formatearNombre,
  indexarUsuarios,
  inicialesDe,
} from "@/lib/acting-banner-lib";
import {
  canUseImpersonationBanner,
  consumeSessionFlash,
  isAdminUser,
  isEditableTarget,
  isImpersonateShortcut,
  reloadAfterSessionChange,
  restoreImpersonation,
  startImpersonation,
  subscribeSessionChangeFromOtherTabs,
} from "@/lib/impersonate-client";

const ACTING_BANNER_HIDDEN_KEY = "lab-trxckin:acting-banner-hidden";

export default function ActingBanner() {
  const { backendUser, isLoading } = useCurrentUser();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [restaurandoCuenta, setRestaurandoCuenta] = useState(false);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [usuarios, setUsuarios] = useState<ActingBannerUsuario[]>([]);
  const [usuariosCargados, setUsuariosCargados] = useState(false);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);
  const [cambiandoUsuarioId, setCambiandoUsuarioId] = useState<string | null>(null);
  const [bannerHidden, setBannerHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(ACTING_BANNER_HIDDEN_KEY) === "true";
  });
  const [sessionBannerVisible, setSessionBannerVisible] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const isImpersonating = Boolean(backendUser?.isImpersonating);
  const isAdmin = isAdminUser(backendUser);
  const canUseImpersonation = canUseImpersonationBanner({ isAdmin, isImpersonating });
  const currentUserId = backendUser?.id ?? "";
  const name = backendUser?.nombre || "usuario";

  const usuariosDisponibles = useMemo(
    () =>
      usuarios.filter((usuario) => {
        const isActive = usuario.activo === undefined || Boolean(usuario.activo);
        return isActive && usuario.id !== currentUserId;
      }),
    [currentUserId, usuarios],
  );

  const usuariosIndexados = useMemo(() => indexarUsuarios(usuariosDisponibles), [usuariosDisponibles]);
  const usuariosFiltrados = useMemo(
    () => filtrarUsuarios(usuariosIndexados, busqueda),
    [busqueda, usuariosIndexados],
  );

  const setBannerVisibility = useCallback((hidden: boolean) => {
    setBannerHidden(hidden);
    if (typeof window === "undefined") return;
    if (hidden) {
      localStorage.setItem(ACTING_BANNER_HIDDEN_KEY, "true");
    } else {
      localStorage.removeItem(ACTING_BANNER_HIDDEN_KEY);
    }
  }, []);

  const cargarUsuarios = useCallback(async () => {
    if (usuariosCargados || cargandoUsuarios) return;
    try {
      setCargandoUsuarios(true);
      const response = await fetch("/api/usuarios/directorio?limit=5000", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudieron cargar los usuarios");
      }
      const data: unknown = await response.json();
      const lista = Array.isArray(data) ? data : [];
      setUsuarios(lista as ActingBannerUsuario[]);
      setUsuariosCargados(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar los usuarios");
    } finally {
      setCargandoUsuarios(false);
    }
  }, [cargandoUsuarios, usuariosCargados]);

  const revealBannerAndOpenSelector = useCallback(() => {
    if (isImpersonating) {
      setBannerVisibility(false);
    } else {
      setSessionBannerVisible(true);
    }
    setSelectorAbierto(true);
    void cargarUsuarios();
  }, [cargarUsuarios, isImpersonating, setBannerVisibility]);

  useEffect(() => {
    const flash = consumeSessionFlash();
    if (flash) toast.success(flash);
    return subscribeSessionChangeFromOtherTabs(() => window.location.reload());
  }, []);

  useEffect(() => {
    if (!canUseImpersonation) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isImpersonateShortcut(event) || isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      revealBannerAndOpenSelector();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUseImpersonation, revealBannerAndOpenSelector]);

  useEffect(() => {
    if (!selectorAbierto) return;
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [selectorAbierto]);

  const handleCambiarUsuario = async (usuario: ActingBannerUsuario) => {
    if (!usuario.id || cambiandoUsuarioId) return;
    try {
      setCambiandoUsuarioId(usuario.id);
      const result = await startImpersonation(usuario.id);
      if (!result.ok) {
        throw new Error(result.message);
      }
      setBannerVisibility(false);
      reloadAfterSessionChange(`Ahora estás actuando como ${result.nombre}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar de usuario");
      setCambiandoUsuarioId(null);
    }
  };

  const handleVolverACuenta = async () => {
    try {
      setRestaurandoCuenta(true);
      const result = await restoreImpersonation();
      if (!result.ok) {
        throw new Error(result.message);
      }
      reloadAfterSessionChange("Has vuelto a tu cuenta de administrador");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo restaurar la cuenta");
      setRestaurandoCuenta(false);
    }
  };

  if (isLoading || !canUseImpersonation) return null;

  const userSelector = (
    <Popover
      modal={false}
      open={selectorAbierto}
      onOpenChange={(open) => {
        setSelectorAbierto(open);
        setBusqueda("");
        if (open) void cargarUsuarios();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={restaurandoCuenta || Boolean(cambiandoUsuarioId)}
          className="flex w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-1.5"
        >
          {cambiandoUsuarioId ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowLeftRight className="h-3.5 w-3.5" />
          )}
          Cambiar
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-[min(440px,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            ref={searchInputRef}
            value={busqueda}
            onValueChange={setBusqueda}
            placeholder="Buscar por nombre, cargo o correo…"
          />
          <CommandList className="max-h-[min(60vh,420px)]">
            {cargandoUsuarios ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando usuarios...
              </div>
            ) : (
              <>
                <CommandEmpty>No se encontraron usuarios para «{busqueda}».</CommandEmpty>
                <CommandGroup>
                  {usuariosFiltrados.map((usuario) => (
                    <CommandItem
                      key={usuario.id}
                      value={usuario.id}
                      disabled={Boolean(cambiandoUsuarioId)}
                      onSelect={() => handleCambiarUsuario(usuario)}
                      className="items-center gap-3 py-2.5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
                        {cambiandoUsuarioId === usuario.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          inicialesDe(usuario.nombre ?? "?")
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {usuario.nombre ? formatearNombre(usuario.nombre) : "Sin nombre"}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {[usuario.cargo && formatearNombre(usuario.cargo), usuario.email]
                            .filter(Boolean)
                            .join(" · ") || "Sin datos adicionales"}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {usuariosFiltrados.length === ACTING_BANNER_MAX_RESULTS && (
                  <div className="border-t border-slate-100 px-3 py-2 text-center text-[11px] text-slate-400">
                    Mostrando los primeros {ACTING_BANNER_MAX_RESULTS} resultados
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  if (isImpersonating && bannerHidden) {
    return (
      <button
        type="button"
        onClick={() => setBannerVisibility(false)}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-3 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-sky-200 bg-white/95 text-sky-700 shadow-xl ring-1 ring-sky-100 transition-colors hover:bg-sky-50 sm:bottom-6 sm:right-6"
        aria-label="Mostrar banner de usuario actuando"
        title="Mostrar banner (Ctrl/⌘+U)"
      >
        <EyeOff className="h-4 w-4" />
      </button>
    );
  }

  if (!isImpersonating && !sessionBannerVisible) return null;

  const hideBanner = () => {
    if (isImpersonating) {
      setBannerVisibility(true);
    } else {
      setSessionBannerVisible(false);
      setSelectorAbierto(false);
    }
  };

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-3 right-3 z-50 sm:left-auto sm:bottom-6 sm:right-6">
      <div className="grid max-w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white/95 px-3 py-3 shadow-xl ring-1 ring-sky-100 sm:flex sm:flex-wrap sm:px-4">
        <button
          type="button"
          onClick={hideBanner}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-700 transition-colors hover:bg-sky-200"
          aria-label="Ocultar banner de sesión"
          title="Ocultar banner"
        >
          <EyeOff className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 leading-tight text-sky-800 sm:flex-none">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">
            {isImpersonating ? "ACTUANDO como" : "Sesión actual"}
          </span>
          <span className="block truncate text-sm font-medium">{name}</span>
        </div>
        <div
          className={`col-span-2 grid gap-2 sm:col-span-1 sm:flex sm:items-center ${
            isImpersonating ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {userSelector}
          {isImpersonating && (
            <button
              type="button"
              onClick={() => void handleVolverACuenta()}
              disabled={restaurandoCuenta || Boolean(cambiandoUsuarioId)}
              className="flex w-full min-w-0 items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-1.5"
            >
              {restaurandoCuenta ? "Restaurando..." : "Volver a mi cuenta"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
