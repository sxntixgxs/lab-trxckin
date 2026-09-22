"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FacturacionUsuario } from "../../hooks/use-facturacion-users";
import { getFacturacionErrorMessage } from "../../lib/user-facing-error";
import type { AnalistaCausacionRow } from "../lib/types";
import {
  buildSiesaProveedoresSearchParams,
  isNitConsultaReady,
  normalizeProveedorNit,
  type ProveedorSiesaBusqueda,
  type ProveedoresSiesaBusquedaResponse,
} from "@/lib/siesa-proveedores";

type Actor = {
  actualizadoPorUserId?: string;
  actualizadoPorNombre?: string;
};

export function ProveedoresCausacionEditor({
  empresaConfig,
  analistasCausacion,
  usuariosFinanzas,
  actor,
}: {
  empresaConfig: number;
  analistasCausacion: AnalistaCausacionRow[];
  usuariosFinanzas: FacturacionUsuario[];
  actor: Actor;
}) {
  const proveedores = useQuery(
    api.facturacionConfiguracion.listarProveedoresCausacion,
    {
      empresa: empresaConfig,
    }
  );
  const guardarProveedor = useMutation(
    api.facturacionConfiguracion.guardarProveedorCausacion
  );
  const eliminarProveedor = useMutation(
    api.facturacionConfiguracion.eliminarProveedorCausacion
  );

  const [busqueda, setBusqueda] = useState("");
  const [nitManual, setNitManual] = useState("");
  const [nombreManual, setNombreManual] = useState("");
  const [seleccionado, setSeleccionado] =
    useState<ProveedorSiesaBusqueda | null>(null);
  const [sugerencias, setSugerencias] = useState<ProveedorSiesaBusqueda[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [nitConsultado, setNitConsultado] = useState<string | null>(null);
  const [mostrarRegistroManual, setMostrarRegistroManual] = useState(false);
  const [analistaId, setAnalistaId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const analistasDisponibles = useMemo(() => {
    return analistasCausacion
      .map((row) => {
        const usuario = usuariosFinanzas.find(
          (item) => item.id === row.usuarioId
        );
        if (!usuario) return null;
        return {
          usuarioId: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email,
        };
      })
      .filter(
        (item): item is { usuarioId: string; nombre: string; email: string } =>
          Boolean(item)
      );
  }, [analistasCausacion, usuariosFinanzas]);

  useEffect(() => {
    const query = busqueda.trim();
    const nitQuery = normalizeProveedorNit(query);
    if (!isNitConsultaReady(query)) {
      setSugerencias([]);
      setErrorBusqueda(null);
      setNitConsultado(null);
      setCargando(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setCargando(true);
      setErrorBusqueda(null);
      setNitConsultado(null);

      try {
        const params = buildSiesaProveedoresSearchParams({
          nit: nitQuery,
          empresa: empresaConfig,
        });

        const response = await fetch(
          `/api/proveedores/search?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error("No se pudo consultar proveedores en SIESA.");
        }

        const data =
          (await response.json()) as ProveedoresSiesaBusquedaResponse;
        setSugerencias(data.proveedores ?? []);
        setNitConsultado(nitQuery);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setSugerencias([]);
        setNitConsultado(nitQuery);
        setErrorBusqueda(
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudo consultar proveedores en SIESA."
        );
      } finally {
        if (!controller.signal.aborted) {
          setCargando(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [busqueda, empresaConfig]);

  const proveedoresPorAnalista = useMemo(() => {
    const grouped = new Map<
      string,
      {
        analistaNombre: string;
        items: NonNullable<typeof proveedores>;
      }
    >();

    for (const item of proveedores ?? []) {
      const current = grouped.get(item.analistaUsuarioId) ?? {
        analistaNombre: item.analistaNombre,
        items: [],
      };
      current.items.push(item);
      grouped.set(item.analistaUsuarioId, current);
    }

    return [...grouped.entries()].sort((a, b) =>
      a[1].analistaNombre.localeCompare(b[1].analistaNombre, "es", {
        sensitivity: "base",
      })
    );
  }, [proveedores]);

  const nitObjetivo = seleccionado?.nit?.trim() || nitManual.trim();
  const nombreObjetivo =
    seleccionado?.descripcionSucursal?.trim() || nombreManual.trim();
  const nitNormalizado = normalizeProveedorNit(nitObjetivo);
  const busquedaActual = busqueda.trim();
  const nitBusqueda = normalizeProveedorNit(busquedaActual);
  const puedeBuscarPorNit = isNitConsultaReady(busquedaActual);
  const busquedaTerminada = nitConsultado === nitBusqueda;
  const proveedorNoEncontrado =
    puedeBuscarPorNit &&
    busquedaTerminada &&
    !cargando &&
    !errorBusqueda &&
    sugerencias.length === 0;

  const conflictoNit = useMemo(() => {
    if (!nitNormalizado || !proveedores) return null;
    const existente = proveedores.find(
      (item) => item.proveedorNitNormalizado === nitNormalizado
    );
    if (!existente) return null;
    if (existente.analistaUsuarioId === analistaId) return null;
    return existente;
  }, [analistaId, nitNormalizado, proveedores]);

  async function handleGuardar() {
    setErrorLocal(null);

    if (!analistaId) {
      setErrorLocal("Selecciona el analista de causación.");
      return;
    }

    const analista = analistasDisponibles.find(
      (item) => item.usuarioId === analistaId
    );
    if (!analista) {
      setErrorLocal("El analista seleccionado no está en la distribución.");
      return;
    }

    if (!nitObjetivo || !nitNormalizado) {
      setErrorLocal("Ingresa un NIT válido.");
      return;
    }

    if (!nombreObjetivo) {
      setErrorLocal("Ingresa el nombre del proveedor.");
      return;
    }

    if (conflictoNit) {
      setErrorLocal(
        `El NIT ya está asignado a ${conflictoNit.analistaNombre}.`
      );
      return;
    }

    setGuardando(true);
    try {
      await guardarProveedor({
        empresa: empresaConfig,
        proveedorNit: nitObjetivo,
        proveedorNombre: nombreObjetivo,
        analistaUsuarioId: analista.usuarioId,
        analistaNombre: analista.nombre,
        analistaEmail: analista.email,
        ...actor,
      });
      setBusqueda("");
      setNitManual("");
      setNombreManual("");
      setSeleccionado(null);
      setSugerencias([]);
      setNitConsultado(null);
      setMostrarRegistroManual(false);
      toast.success("Proveedor asignado.");
    } catch (error) {
      const message = getFacturacionErrorMessage(
        error,
        "No se pudo guardar el proveedor. Revisa la información e intenta nuevamente.",
      );
      setErrorLocal(message);
      toast.error(message);
    } finally {
      setGuardando(false);
    }
  }

  async function handleEliminar(
    id: Id<"facturacionCausacionProveedorAnalistas">
  ) {
    try {
      await eliminarProveedor({ id });
      toast.success("Proveedor eliminado.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo eliminar el proveedor. Intenta nuevamente.",
        ),
      );
    }
  }

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Building2 className="h-4 w-4 text-sky-600" />
          Proveedores con analista fijo
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Busca por NIT en SIESA o ingresa el proveedor manualmente. La
          asignación se compara siempre por NIT.
        </p>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <Input
          value={busqueda}
          onChange={(event) => {
            const value = event.target.value;
            const nit = normalizeProveedorNit(value);
            setBusqueda(value);
            setSeleccionado(null);
            setMostrarRegistroManual(false);
            setNombreManual("");
            if (nit) {
              setNitManual(nit);
            } else {
              setNitManual("");
            }
          }}
          inputMode="numeric"
          placeholder="Buscar proveedor en SIESA por NIT"
        />

        {(cargando || errorBusqueda || busquedaActual.length > 0) && (
          <div className="min-h-[52px] rounded-xl border border-slate-100 bg-slate-50/80 p-2">
            {cargando ? (
              <div className="flex items-center gap-2 px-2 py-2 text-xs font-medium text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                Consultando proveedor por NIT...
              </div>
            ) : errorBusqueda ? (
              <p className="px-2 py-2 text-xs font-medium text-red-600">
                {errorBusqueda}
              </p>
            ) : !puedeBuscarPorNit ? (
              <p className="px-2 py-2 text-xs text-slate-500">
                Ingresa al menos 5 dígitos del NIT para buscar en SIESA.
              </p>
            ) : !busquedaTerminada ? (
              <p className="px-2 py-2 text-xs text-slate-500">
                Esperando la consulta del NIT...
              </p>
            ) : sugerencias.length > 0 ? (
              <div className="max-h-40 overflow-y-auto">
                {sugerencias.map((proveedor) => {
                  const selected =
                    seleccionado?.id === proveedor.id &&
                    seleccionado?.sucursalId === proveedor.sucursalId;

                  return (
                    <button
                      key={`${proveedor.id}-${proveedor.sucursalId ?? "0"}`}
                      type="button"
                      className={`flex w-full flex-col rounded-lg px-2 py-2 text-left text-xs transition ${
                        selected
                          ? "bg-sky-100 text-sky-900"
                          : "hover:bg-white hover:text-slate-900"
                      }`}
                      onClick={() => {
                        setSeleccionado(proveedor);
                        setNitManual(proveedor.nit);
                        setNombreManual(proveedor.descripcionSucursal);
                        setMostrarRegistroManual(false);
                      }}
                    >
                      <span className="font-semibold">
                        {proveedor.descripcionSucursal}
                      </span>
                      <span className="text-slate-500">
                        NIT {proveedor.nit}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 px-2 py-2">
                <p className="text-xs text-slate-500">
                  No encontramos un proveedor en SIESA para ese NIT.
                </p>
                {!mostrarRegistroManual ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-lg px-3 text-xs"
                    onClick={() => {
                      setNitManual(nitBusqueda);
                      setNombreManual("");
                      setMostrarRegistroManual(true);
                    }}
                  >
                    Registrar manualmente
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        )}

        {mostrarRegistroManual && proveedorNoEncontrado ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600">
              Completa los datos del proveedor para guardar la asignación.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={nitManual}
                onChange={(event) => {
                  setNitManual(event.target.value);
                  setSeleccionado(null);
                }}
                placeholder="NIT del proveedor"
              />
              <Input
                value={nombreManual}
                onChange={(event) => {
                  setNombreManual(event.target.value);
                  if (seleccionado) setSeleccionado(null);
                }}
                placeholder="Nombre del proveedor"
              />
            </div>
          </div>
        ) : null}

        <Select
          value={analistaId ?? undefined}
          onValueChange={(value) => setAnalistaId(value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Analista de causación" />
          </SelectTrigger>
          <SelectContent>
            {analistasDisponibles.map((analista) => (
              <SelectItem key={analista.usuarioId} value={analista.usuarioId}>
                {analista.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {conflictoNit ? (
          <p className="text-xs font-medium text-amber-700">
            El NIT ya está asignado a {conflictoNit.analistaNombre}.
          </p>
        ) : null}
        {errorLocal ? (
          <p className="text-xs font-medium text-red-600">{errorLocal}</p>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="w-full rounded-xl"
          disabled={
            guardando ||
            analistasDisponibles.length === 0 ||
            (!seleccionado && !(mostrarRegistroManual && proveedorNoEncontrado))
          }
          onClick={() => void handleGuardar()}
        >
          {guardando ? "Guardando..." : "Asignar proveedor"}
        </Button>
      </div>

      {proveedores === undefined ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando proveedores asignados...
        </div>
      ) : proveedoresPorAnalista.length === 0 ? (
        <p className="text-xs text-slate-500">
          Aún no hay proveedores con analista fijo.
        </p>
      ) : (
        <div className="space-y-3">
          {proveedoresPorAnalista.map(([usuarioId, grupo]) => (
            <div
              key={usuarioId}
              className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
            >
              <p className="text-sm font-semibold text-slate-800">
                {grupo.analistaNombre}
              </p>
              <div className="mt-2 space-y-2">
                {grupo.items.map((item) => (
                  <div
                    key={item._id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-white bg-white px-3 py-2 shadow-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {item.proveedorNombre}
                      </p>
                      <p className="text-xs text-slate-500">
                        NIT {item.proveedorNit}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => void handleEliminar(item._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
