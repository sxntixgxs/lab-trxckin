"use client";

import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  LayoutDashboard,
  Loader2,
  Paperclip,
  Search,
  Send,
  UploadCloud,
  UserCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/useCurrentUser";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ProveedorManualAlert,
  ProveedorManualBadge,
} from "@/app/(default)/finance/advances/components/proveedor-manual-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { getEmpresaNombre } from "@/lib/empresas";
import { isProveedorAnticipoReady, type ProveedorAnticipo } from "@/lib/siesa-proveedores";
import { cn } from "@/lib/utils";

import {
  anticipoRequiereAprobacionJefe,
  getRutaAprobacionResumen,
  getSiguienteFaseLabel,
} from "../../lib/anticipo-routing";
import { todayInputValue, toTimestamp } from "../date-utils";
import { numeroALetras } from "../numero-letras";
import { resolveAnticipoResponsible } from "../responsable-routing";
import {
  filtrarLideres,
  getLideresDisponibles,
  normalizarUsuariosAnticiposPayload,
  type UsuarioAnticipo,
} from "./lideres-options";
import { ProveedorAnticipoField } from "./ProveedorAnticipoField";

type FormaPago = "TRANSFERENCIA BANCARIA" | "TRANSFERENCIA PAGO ELECTRÓNICO";

const formatterCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

async function fetchUsuariosAnticipos() {
  const response = await fetch("/api/usuarios/directorio", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("No se pudo cargar el directorio de usuarios");
  }
  return normalizarUsuariosAnticiposPayload(await response.json());
}

function UsuarioLiderCombobox({
  value,
  usuarios,
  disabled,
  onChange,
}: {
  value: string;
  usuarios: UsuarioAnticipo[];
  disabled: boolean;
  onChange: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = useMemo(
    () => usuarios.find((usuario) => usuario.id === value),
    [usuarios, value]
  );
  const filtered = useMemo(() => {
    return filtrarLideres(usuarios, search);
  }, [search, usuarios]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-10 w-full justify-between bg-white px-3 font-normal"
        >
          <span className="min-w-0 truncate text-left">
            {selected ? (
              (selected.nombre ?? selected.email ?? "Usuario disponible")
            ) : (
              <span className="text-muted-foreground">Buscar líder de proceso</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por nombre, email o cargo..."
          />
          <CommandList className="max-h-[min(320px,var(--radix-popover-content-available-height))]">
            <CommandGroup>
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check
                  className={cn("mr-2 h-4 w-4 shrink-0", value ? "opacity-0" : "opacity-100")}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium">Sin líder seleccionado</span>
                  <span className="text-xs text-muted-foreground">
                    Limpiar y omitir esta aprobación
                  </span>
                </div>
              </CommandItem>
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground" role="status">
                  No se encontró ningún líder con esa búsqueda.
                </div>
              ) : null}
              {filtered.map((usuario) => (
                <CommandItem
                  key={usuario.id}
                  value={usuario.id}
                  onSelect={() => {
                    onChange(usuario.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === usuario.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {usuario.nombre ?? usuario.email ?? "Usuario disponible"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[usuario.email, usuario.cargo].filter(Boolean).join(" · ") ||
                        "Sin datos adicionales"}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Search className="h-3.5 w-3.5" />
              {filtered.length} de {usuarios.length}
            </div>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SolicitarAnticipoClient() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { empresaActiva, mostrarSelector } = useEmpresaFilter();
  const crearAnticipo = useMutation(api.financiero.anticipos.crearAnticipo);
  const generateUploadUrl = useMutation(api.financiero.anticipos.generateUploadUrl);

  const [proveedor, setProveedor] = useState<ProveedorAnticipo | null>(null);
  const [formaPago, setFormaPago] = useState<FormaPago>("TRANSFERENCIA BANCARIA");
  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [banco, setBanco] = useState("");
  const [valor, setValor] = useState("");
  const [esPeaje, setEsPeaje] = useState(false);
  const [cubreFacturaCompleta, setCubreFacturaCompleta] = useState(true);
  const [fechaLegalizacion, setFechaLegalizacion] = useState(todayInputValue());
  const [documentos, setDocumentos] = useState<File[]>([]);
  const [observaciones, setObservaciones] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [omitirAprobacionJefe, setOmitirAprobacionJefe] = useState(true);
  const [liderSeleccionadoId, setLiderSeleccionadoId] = useState("");

  const { data: usuarios = [], isLoading: isLoadingUsuarios } = useQuery({
    queryKey: ["anticipos-solicitar-usuarios"],
    queryFn: fetchUsuariosAnticipos,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/sign-in");
  }, [router, status]);

  const debeSeleccionarEmpresa =
    status !== "loading" && mostrarSelector && empresaActiva === null;
  const empresaSolicitanteId = debeSeleccionarEmpresa
    ? null
    : (empresaActiva ?? session?.user?.id_empresa ?? null);
  const empresaSolicitanteNombre = empresaSolicitanteId
    ? getEmpresaNombre(empresaSolicitanteId)
    : "Sin empresa asignada";
  const usuarioActual = useMemo(
    () => usuarios.find((usuario) => usuario.id === session?.user?.id),
    [session?.user?.id, usuarios]
  );
  const idJefeDirecto = usuarioActual?.id_jefe_directo;
  const jefeDirecto = useMemo(
    () =>
      idJefeDirecto
        ? usuarios.find((usuario) => usuario.id === idJefeDirecto)
        : undefined,
    [idJefeDirecto, usuarios]
  );
  const jefeDirectoId = jefeDirecto?.id ?? "";
  const lideresDisponibles = useMemo(
    () => getLideresDisponibles(usuarios, empresaSolicitanteId, jefeDirecto),
    [empresaSolicitanteId, jefeDirecto, usuarios]
  );
  const liderSeleccionado = lideresDisponibles.find(
    (usuario) => usuario.id === liderSeleccionadoId
  );
  const solicitanteComoResponsable = {
    id: session?.user?.id ?? "",
    nombre: session?.user?.nombre,
    email: session?.user?.email,
  };
  const { responsible: responsableSeleccionado, origin: responsableOrigen } =
    resolveAnticipoResponsible({
      currentUser: solicitanteComoResponsable,
      configuredBoss: jefeDirecto,
      selectedLeader: liderSeleccionado,
      omitBossApproval: omitirAprobacionJefe,
    });
  const routingInput = {
    cubreFacturaCompleta: esPeaje ? true : cubreFacturaCompleta,
    tipoBolsa: esPeaje ? ("peajes" as const) : ("general" as const),
    responsableOrigen,
  };
  const siguienteFase = getSiguienteFaseLabel(routingInput);
  const rutaAprobacion = (() => {
    const pasos = getRutaAprobacionResumen(routingInput);
    if (anticipoRequiereAprobacionJefe(routingInput)) {
      pasos[0] = `Aprobación de ${responsableSeleccionado.nombre ?? "líder seleccionado"}`;
    }
    return pasos;
  })();
  const valorNumerico = Number(valor || 0);
  const valorLetra = Number.isFinite(valorNumerico) ? numeroALetras(valorNumerico) : "";
  const canSubmit = Boolean(
    session?.user?.id &&
      empresaSolicitanteId &&
      !debeSeleccionarEmpresa &&
      (omitirAprobacionJefe || Boolean(liderSeleccionado)) &&
      isProveedorAnticipoReady(proveedor) &&
      Number.isFinite(valorNumerico) &&
      valorNumerico > 0 &&
      fechaLegalizacion
  );

  useEffect(() => {
    setLiderSeleccionadoId(jefeDirectoId);
    setOmitirAprobacionJefe(!jefeDirectoId);
  }, [jefeDirectoId]);

  useEffect(() => {
    if (esPeaje) setCubreFacturaCompleta(true);
  }, [esPeaje]);

  useEffect(() => {
    if (
      liderSeleccionadoId &&
      !lideresDisponibles.some((usuario) => usuario.id === liderSeleccionadoId)
    ) {
      setLiderSeleccionadoId(jefeDirectoId);
      setOmitirAprobacionJefe(!jefeDirectoId);
    }
  }, [jefeDirectoId, liderSeleccionadoId, lideresDisponibles]);

  function handleDocumentosChange(files: FileList | null) {
    if (!files) return;
    setDocumentos((prev) => {
      const byKey = new Map(
        prev.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file])
      );
      Array.from(files).forEach((file) => {
        byKey.set(`${file.name}-${file.size}-${file.lastModified}`, file);
      });
      return Array.from(byKey.values());
    });
  }

  function removeDocumento(index: number) {
    setDocumentos((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadFile(file: File) {
    const uploadUrl = await generateUploadUrl();
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) throw new Error(`No se pudo subir ${file.name}`);
    const data = (await response.json()) as { storageId?: Id<"_storage"> };
    if (!data.storageId) throw new Error(`No se recibió storageId para ${file.name}`);
    return { storageId: data.storageId, nombre: file.name };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.user?.id) {
      toast.error("Debes iniciar sesión para crear la solicitud.");
      return;
    }
    if (!canSubmit) {
      toast.error(
        debeSeleccionarEmpresa
          ? "Selecciona una empresa en el selector principal."
          : "Revisa los campos requeridos antes de enviar."
      );
      return;
    }
    if (!omitirAprobacionJefe && !liderSeleccionado) {
      toast.error("Selecciona quién realizará la aprobación de jefe directo.");
      return;
    }
    if (formaPago === "TRANSFERENCIA BANCARIA" && (!numeroCuenta.trim() || !banco.trim())) {
      toast.error("Banco y número de cuenta son requeridos para transferencia bancaria.");
      return;
    }
    if (!proveedor || !isProveedorAnticipoReady(proveedor)) {
      toast.error("Consulta y confirma el proveedor antes de enviar.");
      return;
    }

    const empresaId = Number(empresaSolicitanteId);
    const procesoSolicitanteId = usuarioActual?.id_proceso ?? session.user.id_proceso ?? undefined;
    const procesoSolicitanteNombre =
      usuarioActual?.proceso ?? session.user.proceso?.nombre ?? undefined;
    setIsSubmitting(true);
    try {
      const soportesSolicitud =
        documentos.length > 0 ? await Promise.all(documentos.map(uploadFile)) : [];

      const result = await crearAnticipo({
        empresa: empresaId,
        empresa_id: empresaId,
        razonSocial: proveedor.razonSocial.trim(),
        nit: proveedor.nit.trim(),
        formaPago,
        tipoBolsa: esPeaje ? "peajes" : "general",
        numeroCuenta: numeroCuenta.trim() || undefined,
        banco: banco.trim() || undefined,
        valorNumerico,
        valorLetra,
        maxLegalizacionDate: toTimestamp(fechaLegalizacion),
        soportesSolicitud: soportesSolicitud.length > 0 ? soportesSolicitud : undefined,
        observaciones: observaciones.trim() || undefined,
        createdById: session.user.id,
        solicitanteNombre: session.user.nombre,
        solicitanteEmail: session.user.email,
        procesoId: esPeaje ? undefined : (procesoSolicitanteId ?? undefined),
        procesoNombre: esPeaje ? "PEAJES" : (procesoSolicitanteNombre ?? undefined),
        responsableUserId: responsableSeleccionado.id,
        responsableNombre: responsableSeleccionado.nombre ?? "Usuario seleccionado",
        responsableEmail: responsableSeleccionado.email ?? "",
        responsableOrigen,
        cubreFacturaCompleta: esPeaje ? true : cubreFacturaCompleta,
        proveedorOrigen: proveedor.origen,
        proveedorSiesaId: proveedor.origen === "siesa" ? proveedor.siesaId : undefined,
        proveedorSiesaSucursalId:
          proveedor.origen === "siesa" ? proveedor.siesaSucursalId : undefined,
        proveedorManualConfirmado:
          proveedor.origen === "manual_solicitud" ? proveedor.manualConfirmado : undefined,
      });

      toast.success(`Anticipo #${result.consecutivo} enviado a ${siguienteFase}`);
      router.push("/finance/advances");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo crear el anticipo");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6 xl:p-8">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                Finanzas
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                Solicitud de anticipo
              </Badge>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
              Solicitar anticipo
            </h1>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-slate-600">
              Registra los datos del tercero, el valor solicitado y la fecha máxima de legalización
              para iniciar el flujo de aprobaciones.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2 bg-white" asChild>
              <Link href="/finance/advances">
                <LayoutDashboard className="h-4 w-4" />
                Ir a Anticipos
              </Link>
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            {debeSeleccionarEmpresa && (
              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-black">Selecciona una empresa</p>
                  <p className="mt-0.5 font-medium">
                    La solicitud debe quedar asociada a una empresa específica. Cambia “Todas las
                    empresas” en el selector principal antes de enviar.
                  </p>
                </div>
              </div>
            )}

            <Card className="rounded-md border-slate-200 shadow-xs">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                    1
                  </span>
                  Tercero y responsable
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Empresa solicitante</Label>
                  <div className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900">
                    <Building2 className="h-4 w-4 text-emerald-600" />
                    <span className="truncate">{empresaSolicitanteNombre}</span>
                  </div>
                  <p className="text-xs font-medium text-slate-500">
                    Se toma del selector principal. Si no tienes multicompañía, se usa tu empresa
                    asignada.
                  </p>
                </div>
                <ProveedorAnticipoField
                  empresaId={empresaSolicitanteId != null ? Number(empresaSolicitanteId) : null}
                  value={proveedor}
                  onChange={setProveedor}
                  disabled={isSubmitting}
                />
                <div className="md:col-span-2">
                  <div
                    className={cn(
                      "rounded-md border p-4",
                      omitirAprobacionJefe
                        ? "border-slate-200 bg-slate-50"
                        : "border-emerald-200 bg-emerald-50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white",
                          omitirAprobacionJefe ? "text-slate-600" : "text-emerald-700"
                        )}
                      >
                        <UserCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-3">
                        {isLoadingUsuarios ? (
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Consultando jefe directo
                          </div>
                        ) : (
                          <>
                            <div>
                              <p
                                className={cn(
                                  "text-sm font-black",
                                  omitirAprobacionJefe ? "text-slate-900" : "text-emerald-950"
                                )}
                              >
                                Aprobación de jefe directo
                              </p>
                              <p
                                className={cn(
                                  "mt-1 text-sm font-medium leading-relaxed",
                                  omitirAprobacionJefe ? "text-slate-600" : "text-emerald-800"
                                )}
                              >
                                {jefeDirecto
                                  ? `${jefeDirecto.nombre ?? "Tu jefe configurado"} está preseleccionado como sugerencia. Puedes elegir otro líder activo de la empresa.`
                                  : "No tienes jefe directo configurado. Puedes seleccionar un líder o mantener la omisión para continuar por la ruta directa."}
                              </p>
                            </div>
                            <UsuarioLiderCombobox
                              value={liderSeleccionadoId}
                              usuarios={lideresDisponibles}
                              disabled={
                                isLoadingUsuarios || !empresaSolicitanteId || omitirAprobacionJefe
                              }
                              onChange={(value) => {
                                setLiderSeleccionadoId(value);
                                setOmitirAprobacionJefe(!value);
                              }}
                            />
                            {liderSeleccionado && !omitirAprobacionJefe ? (
                              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-800">
                                <Badge
                                  variant="outline"
                                  className="border-emerald-200 bg-white text-emerald-700"
                                >
                                  Responsable: {liderSeleccionado.nombre ?? "Usuario seleccionado"}
                                </Badge>
                              </div>
                            ) : null}
                            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
                              <Checkbox
                                checked={omitirAprobacionJefe}
                                onCheckedChange={(checked) =>
                                  setOmitirAprobacionJefe(checked === true)
                                }
                                className="mt-0.5"
                              />
                              <span>
                                Omitir aprobación de jefe directo
                                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                  La solicitud continuará a{" "}
                                  {cubreFacturaCompleta ? "Contabilidad" : "Gerencia"} y tú
                                  conservarás la responsabilidad de legalización.
                                </span>
                              </span>
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-md border-slate-200 shadow-xs">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                    2
                  </span>
                  Valor, pago y enrutamiento
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Valor solicitado</Label>
                  <Input
                    type="number"
                    min="1"
                    value={valor}
                    onChange={(event) => setValor(event.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Forma de pago</Label>
                  <Select
                    value={formaPago}
                    onValueChange={(value) => setFormaPago(value as FormaPago)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRANSFERENCIA BANCARIA">Transferencia bancaria</SelectItem>
                      <SelectItem value="TRANSFERENCIA PAGO ELECTRÓNICO">
                        Transferencia pago electrónico
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Banco</Label>
                  <Input
                    value={banco}
                    onChange={(event) => setBanco(event.target.value)}
                    placeholder="Banco destino"
                    disabled={formaPago !== "TRANSFERENCIA BANCARIA"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Número de cuenta</Label>
                  <Input
                    value={numeroCuenta}
                    onChange={(event) => setNumeroCuenta(event.target.value)}
                    placeholder="Cuenta destino"
                    disabled={formaPago !== "TRANSFERENCIA BANCARIA"}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Valor en letras</Label>
                  <Input
                    value={valorNumerico > 0 ? valorLetra : ""}
                    readOnly
                    className="bg-slate-50 font-semibold"
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm md:col-span-2">
                  <Checkbox
                    checked={cubreFacturaCompleta}
                    disabled={esPeaje}
                    onCheckedChange={(checked) => setCubreFacturaCompleta(checked === true)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block font-black text-slate-900">
                      Este anticipo cubre el 100% de la factura
                    </span>
                    <span className="mt-0.5 block font-medium text-slate-500">
                      Si no lo cubre, después de la aprobación del jefe directo pasará directo a
                      Gerencia Financiera.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm md:col-span-2">
                  <Checkbox
                    checked={esPeaje}
                    onCheckedChange={(checked) => setEsPeaje(checked === true)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block font-black text-slate-900">PEAJES</span>
                    <span className="mt-0.5 block font-medium text-slate-500">
                      Este anticipo alimenta la bolsa única PEAJES por empresa.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>

            <Card className="rounded-md border-slate-200 shadow-xs">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                    3
                  </span>
                  Legalización y soportes
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="space-y-2">
                  <Label>Fecha máxima de legalización</Label>
                  <Input
                    type="date"
                    value={fechaLegalizacion}
                    onChange={(event) => setFechaLegalizacion(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Documentos soporte</Label>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-4 py-5 text-center transition hover:border-emerald-300 hover:bg-emerald-50/40">
                    <UploadCloud className="h-6 w-6 text-emerald-600" />
                    <span className="text-sm font-bold text-slate-800">
                      Cargar uno o varios documentos
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      PDF, imágenes, Word o Excel
                    </span>
                    <Input
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      onChange={(event) => handleDocumentosChange(event.target.files)}
                    />
                  </label>

                  {documentos.length > 0 && (
                    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                        {documentos.length}{" "}
                        {documentos.length === 1
                          ? "documento seleccionado"
                          : "documentos seleccionados"}
                      </p>
                      <div className="space-y-1.5">
                        {documentos.map((file, index) => (
                          <div
                            key={`${file.name}-${file.size}-${file.lastModified}`}
                            className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className="truncate font-semibold text-slate-700">
                                {file.name}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => removeDocumento(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Observaciones</Label>
                  <Textarea
                    value={observaciones}
                    onChange={(event) => setObservaciones(event.target.value)}
                    placeholder="Detalle el motivo del anticipo, centro de costo, obra o soporte operativo relevante."
                    className="min-h-28"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
            <Card className="rounded-md border-slate-200 shadow-xs">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg text-slate-950">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Valor</p>
                  <p className="mt-1 text-xl font-black text-slate-950">
                    {valorNumerico > 0 ? formatterCOP.format(valorNumerico) : "$ 0"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Proveedor</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="font-black text-slate-950">
                      {proveedor?.razonSocial.trim() || "Sin consultar"}
                    </p>
                    {proveedor?.origen === "manual_solicitud" ? (
                      <ProveedorManualBadge compact />
                    ) : proveedor?.origen === "siesa" ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-800"
                      >
                        SIESA
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    {proveedor?.nit.trim()
                      ? `NIT ${proveedor.nit.trim()}`
                      : "Consulta el NIT para identificar al proveedor"}
                  </p>
                </div>
                <div className="space-y-2 text-slate-600">
                  {rutaAprobacion.map((paso) => (
                    <div key={paso} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {paso}
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {esPeaje ? "Bolsa PEAJES" : "Legalización final"}
                  </div>
                </div>
                {proveedor?.origen === "manual_solicitud" ? <ProveedorManualAlert compact /> : null}
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={!canSubmit || isSubmitting || status === "loading"}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isSubmitting ? "Enviando..." : "Enviar solicitud"}
                </Button>
                <Button type="button" variant="ghost" className="w-full gap-2" asChild>
                  <Link href="/finance/advances">
                    <ArrowLeft className="h-4 w-4" />
                    Volver a Anticipos
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </aside>
        </form>
      </div>
    </div>
  );
}
