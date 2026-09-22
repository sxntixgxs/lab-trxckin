"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Ban,
  Check,
  CornerUpLeft,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  TrendingDown,
  TrendingUp,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useSession } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ProveedorManualAlert,
  ProveedorOrigenInline,
  isProveedorManualOrigen,
} from "@/app/(default)/finance/advances/components/proveedor-manual-status";

import { formatterCOP, faseLabels } from "../constants";
import type { AnticipoRow, Decision, DialogAction } from "../types";
import { getDefaultReturnTarget } from "../utils";
import {
  getValorContableAnticipo,
  parseValorContableInput,
} from "../../lib/valor-contable-anticipo";

type AnticipoActionDialogProps = {
  open: boolean;
  selected: AnticipoRow | null;
  dialogAction: DialogAction | null;
  onOpenChange: (open: boolean) => void;
  decision: Decision;
  onDecisionChange: (value: Decision) => void;
  observaciones: string;
  onObservacionesChange: (value: string) => void;
  valorContable: number | null;
  onValorContableChange: (value: number) => void;
  archivosAccion: File[];
  onArchivosAccionChange: (files: File[]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSaving: boolean;
};

type AdjuntoBorrador = {
  storageId: Id<"_storage">;
  nombre: string;
  tamanio: number;
  subidoEn: number;
};

type UploadPendingItem = {
  localId: string;
  nombre: string;
  tamanio: number;
};

const thousands = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CurrencyField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-slate-400">
        $
      </span>
      <input
        id="anticipo-valor-contable"
        inputMode="numeric"
        autoComplete="off"
        value={thousands.format(Math.round(value))}
        onChange={(event) => {
          const parsed = parseValorContableInput(event.target.value);
          if (parsed !== null) onChange(parsed);
          else if (!event.target.value.trim()) onChange(0);
        }}
        className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-lg font-bold tabular-nums text-slate-900 shadow-xs outline-hidden transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
    </div>
  );
}

function DecisionToggle({
  decision,
  onChange,
}: {
  decision: Decision;
  onChange: (value: Decision) => void;
}) {
  const options: {
    value: Decision;
    label: string;
    icon: typeof Check;
    activeClass: string;
  }[] = [
    {
      value: "APROBADO",
      label: "Aprobar",
      icon: Check,
      activeClass:
        "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500",
    },
    {
      value: "RECHAZADO",
      label: "Rechazar",
      icon: X,
      activeClass:
        "border-rose-500 bg-rose-50 text-rose-700 ring-1 ring-rose-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const isActive = decision === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
              isActive
                ? option.activeClass
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            <Icon className="h-4 w-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function FileDropzone({
  files,
  onFilesChange,
  disabled = false,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | File[]) {
    const next = [...files, ...Array.from(incoming)];
    onFilesChange(next);
  }

  function removeFile(index: number) {
    onFilesChange(files.filter((_, idx) => idx !== index));
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          if (event.dataTransfer.files.length > 0) {
            addFiles(event.dataTransfer.files);
          }
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition",
          disabled && "cursor-not-allowed opacity-60",
          isDragging
            ? "border-violet-400 bg-violet-50"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/70"
        )}
      >
        <UploadCloud
          className={cn(
            "h-6 w-6",
            isDragging ? "text-violet-500" : "text-slate-400"
          )}
        />
        <p className="text-sm font-semibold text-slate-700">
          Arrastra archivos o haz clic para subir
        </p>
        <p className="text-xs text-slate-400">
          Adjunta soportes si aplican a esta decisión
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </button>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-700">
                  {file.name}
                </span>
                <span className="block text-[11px] text-slate-400">
                  {formatFileSize(file.size)}
                </span>
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeFile(index)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                title="Quitar archivo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DesembolsoAdjuntosDropzone({
  anticipoId,
  disabled = false,
  onBusyChange,
  onLoadingChange,
}: {
  anticipoId: Id<"anticipos">;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onLoadingChange: (loading: boolean) => void;
}) {
  const { data: session } = useSession();
  const [isDragging, setIsDragging] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<UploadPendingItem[]>([]);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const adjuntos = useQuery(
    api.financiero.anticipos.obtenerAdjuntosBorradorDesembolso,
    { anticipoId }
  ) as AdjuntoBorrador[] | undefined;
  const generateUploadUrl = useMutation(
    api.financiero.anticipos.generateUploadUrl
  );
  const guardarAdjunto = useMutation(
    api.financiero.anticipos.guardarAdjuntoBorradorDesembolso
  );
  const eliminarAdjunto = useMutation(
    api.financiero.anticipos.eliminarAdjuntoBorradorDesembolso
  );

  const isUploading = pendingUploads.length > 0;
  const isDeleting = deletingIds.length > 0;
  const isBusy = isUploading || isDeleting;
  const isLoadingAdjuntos = adjuntos === undefined;

  useEffect(() => {
    onBusyChange(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    onLoadingChange(isLoadingAdjuntos);
  }, [isLoadingAdjuntos, onLoadingChange]);

  async function uploadOne(file: File) {
    const userId = session?.user?.id;
    if (!userId) {
      throw new Error("Debes iniciar sesión para subir soportes.");
    }

    const uploadUrl = await generateUploadUrl();
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`No se pudo subir ${file.name}`);
    }
    const data = (await response.json()) as { storageId?: Id<"_storage"> };
    if (!data.storageId) {
      throw new Error(`No se recibió storageId para ${file.name}`);
    }

    const result = await guardarAdjunto({
      anticipoId,
      tesoreroUserId: userId,
      storageId: data.storageId,
      nombre: file.name,
    });
    if (result.discarded) {
      throw new Error(result.reason);
    }
  }

  async function handleFiles(incoming: FileList | File[]) {
    const files = Array.from(incoming);
    if (files.length === 0) return;

    const items = files.map((file) => ({
      localId: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      nombre: file.name,
      tamanio: file.size,
      file,
    }));

    setPendingUploads((prev) => [
      ...prev,
      ...items.map(({ localId, nombre, tamanio }) => ({
        localId,
        nombre,
        tamanio,
      })),
    ]);

    await Promise.all(
      items.map(async (item) => {
        try {
          await uploadOne(item.file);
        } catch (error) {
          console.error(error);
          toast.error(
            error instanceof Error
              ? error.message
              : `No se pudo subir ${item.nombre}`
          );
        } finally {
          setPendingUploads((prev) =>
            prev.filter((pending) => pending.localId !== item.localId)
          );
        }
      })
    );
  }

  async function handleRemove(storageId: Id<"_storage">) {
    const userId = session?.user?.id;
    if (!userId) {
      toast.error("Debes iniciar sesión para eliminar soportes.");
      return;
    }

    const key = String(storageId);
    setDeletingIds((prev) => [...prev, key]);
    try {
      await eliminarAdjunto({
        anticipoId,
        tesoreroUserId: userId,
        storageId,
      });
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el soporte"
      );
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== key));
    }
  }

  const canInteract = !disabled && !isBusy;

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={!canInteract}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (canInteract) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!canInteract) return;
          if (event.dataTransfer.files.length > 0) {
            void handleFiles(event.dataTransfer.files);
          }
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition",
          !canInteract && "cursor-not-allowed opacity-60",
          isDragging
            ? "border-blue-400 bg-blue-50"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/70"
        )}
      >
        {isUploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        ) : (
          <UploadCloud
            className={cn(
              "h-6 w-6",
              isDragging ? "text-blue-500" : "text-slate-400"
            )}
          />
        )}
        <p className="text-sm font-semibold text-slate-700">
          {isUploading
            ? "Subiendo soportes…"
            : "Arrastra archivos o haz clic para subir"}
        </p>
        <p className="text-xs text-slate-400">
          Se guardan de inmediato y permanecen si cierras el diálogo
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={!canInteract}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </button>

      {isLoadingAdjuntos && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando soportes guardados…
        </div>
      )}

      {(pendingUploads.length > 0 || (adjuntos && adjuntos.length > 0)) && (
        <ul className="space-y-1.5">
          {pendingUploads.map((item) => (
            <li
              key={item.localId}
              className="flex min-w-0 items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-700">
                  {item.nombre}
                </span>
                <span className="block text-[11px] text-slate-400">
                  Subiendo · {formatFileSize(item.tamanio)}
                </span>
              </span>
            </li>
          ))}

          {adjuntos?.map((adjunto) => {
            const isDeletingThis = deletingIds.includes(
              String(adjunto.storageId)
            );
            return (
              <li
                key={String(adjunto.storageId)}
                className="flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                  {isDeletingThis ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <a
                    href={`/api/convex/storage/${adjunto.storageId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-blue-700 hover:underline"
                  >
                    <span className="truncate">{adjunto.nombre}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <span className="block text-[11px] text-slate-400">
                    {formatFileSize(adjunto.tamanio)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={!canInteract || isDeletingThis}
                  onClick={() => void handleRemove(adjunto.storageId)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  title="Quitar archivo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AnticipoActionDialog({
  open,
  selected,
  dialogAction,
  onOpenChange,
  decision,
  onDecisionChange,
  observaciones,
  onObservacionesChange,
  valorContable,
  onValorContableChange,
  archivosAccion,
  onArchivosAccionChange,
  onSubmit,
  isSaving,
}: AnticipoActionDialogProps) {
  const isDecisionAction =
    dialogAction === "jefe_directo" ||
    dialogAction === "contabilidad" ||
    dialogAction === "gerencia";
  const isContabilidad = dialogAction === "contabilidad";
  const isDesembolso = dialogAction === "desembolso";
  const isRejected = decision === "RECHAZADO";
  const isMotivoRequired =
    dialogAction === "anular" || dialogAction === "devolver" || isRejected;
  const returnTarget = selected
    ? getDefaultReturnTarget(
        selected.faseActual,
        selected.responsableOrigen,
        selected.cubreFacturaCompleta,
        selected.tipoBolsa
      )
    : null;

  const [desembolsoBusy, setDesembolsoBusy] = useState(false);
  const [desembolsoLoading, setDesembolsoLoading] = useState(false);

  useEffect(() => {
    if (open && isDesembolso) {
      setDesembolsoLoading(true);
      return;
    }
    setDesembolsoBusy(false);
    setDesembolsoLoading(false);
  }, [open, isDesembolso]);

  const valorSolicitado = selected?.valorNumerico ?? 0;
  const valorContableActual = selected ? getValorContableAnticipo(selected) : 0;
  const valorEditable = isContabilidad && !isRejected;
  const valorMostrado = valorEditable
    ? (valorContable ?? valorContableActual)
    : valorContableActual;
  const delta = valorMostrado - valorSolicitado;

  const isBusy = isSaving || (isDesembolso && desembolsoBusy);
  const isSubmitDisabled =
    isBusy || (isDesembolso && desembolsoLoading);

  const headerMeta = useMemo(() => {
    if (dialogAction === "anular") {
      return {
        subtitle: "Anular anticipo",
        Icon: Ban,
        iconClass: "bg-rose-50 text-rose-600",
      };
    }
    if (dialogAction === "devolver") {
      return {
        subtitle: "Devolver a fase anterior",
        Icon: CornerUpLeft,
        iconClass: "bg-orange-50 text-orange-600",
      };
    }
    if (dialogAction === "desembolso") {
      return {
        subtitle: "Registrar desembolso",
        Icon: Upload,
        iconClass: "bg-blue-50 text-blue-600",
      };
    }
    return {
      subtitle: selected
        ? (faseLabels[selected.faseActual] ?? selected.faseActual)
        : "Gestionar anticipo",
      Icon: Pencil,
      iconClass: "bg-violet-50 text-violet-600",
    };
  }, [dialogAction, selected]);

  const { primaryLabel, primaryClass } = useMemo(() => {
    if (dialogAction === "anular") {
      return {
        primaryLabel: "Anular anticipo",
        primaryClass: "bg-rose-600 hover:bg-rose-700",
      };
    }
    if (dialogAction === "devolver") {
      return {
        primaryLabel: "Devolver anticipo",
        primaryClass: "bg-orange-600 hover:bg-orange-700",
      };
    }
    if (dialogAction === "desembolso") {
      return {
        primaryLabel: "Registrar desembolso",
        primaryClass: "bg-blue-600 hover:bg-blue-700",
      };
    }
    if (isRejected) {
      return {
        primaryLabel: "Rechazar anticipo",
        primaryClass: "bg-rose-600 hover:bg-rose-700",
      };
    }
    return {
      primaryLabel: "Aprobar anticipo",
      primaryClass: "bg-emerald-600 hover:bg-emerald-700",
    };
  }, [dialogAction, isRejected]);

  const HeaderIcon = headerMeta.Icon;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isBusy) return;
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-lg overflow-hidden rounded-2xl p-0 gap-0"
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
      >
        <form onSubmit={onSubmit} className="flex max-h-[92vh] min-w-0 flex-col">
          <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-5">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                headerMeta.iconClass
              )}
            >
              <HeaderIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold text-slate-900">
                {selected
                  ? `Anticipo #${selected.consecutivo}`
                  : "Gestionar anticipo"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-500">
                <span className="truncate">
                  {headerMeta.subtitle}
                  {selected ? ` · ${selected.razonSocial}` : ""}
                </span>
                {selected ? (
                  <ProveedorOrigenInline origen={selected.proveedorOrigen} />
                ) : null}
              </DialogDescription>
            </div>
          </div>

          <div className="min-w-0 space-y-5 overflow-y-auto px-6 py-5">
            {selected && isProveedorManualOrigen(selected.proveedorOrigen) ? (
              <ProveedorManualAlert compact />
            ) : null}
            {selected &&
              (isContabilidad ? (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-slate-500">
                      Valor solicitado
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-slate-700">
                      {formatterCOP.format(valorSolicitado)}
                    </span>
                  </div>

                  <div className="h-px bg-slate-200" />

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <label
                        htmlFor="anticipo-valor-contable"
                        className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        Valor contable
                      </label>
                      {delta !== 0 && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                            delta > 0
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          )}
                        >
                          {delta > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {delta > 0 ? "+" : "−"}
                          {formatterCOP.format(Math.abs(delta))}
                        </span>
                      )}
                    </div>
                    {valorEditable ? (
                      <>
                        <CurrencyField
                          value={valorMostrado}
                          onChange={onValorContableChange}
                        />
                        <p className="mt-1.5 text-[11px] text-slate-400">
                          El cambio se guardará al aprobar la revisión de
                          contabilidad.
                        </p>
                      </>
                    ) : (
                      <p className="text-lg font-bold tabular-nums text-slate-900">
                        {formatterCOP.format(valorMostrado)}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
                  <span className="text-xs font-medium text-slate-500">
                    Valor del anticipo
                  </span>
                  <span className="text-lg font-bold tabular-nums text-slate-900">
                    {formatterCOP.format(valorContableActual)}
                  </span>
                </div>
              ))}

            {isDecisionAction && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Decisión
                </p>
                <DecisionToggle
                  decision={decision}
                  onChange={onDecisionChange}
                />
              </div>
            )}

            {dialogAction === "devolver" && selected && (
              <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                <CornerUpLeft className="h-4 w-4 shrink-0" />
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 font-medium">
                  <span className="truncate">
                    {faseLabels[selected.faseActual] ?? selected.faseActual}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate font-semibold">
                    {returnTarget
                      ? (faseLabels[returnTarget] ?? returnTarget)
                      : "Sin fase disponible"}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="anticipo-observaciones"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {isMotivoRequired ? "Motivo" : "Observaciones"}
                {isMotivoRequired && <span className="text-rose-500">*</span>}
              </label>
              <Textarea
                id="anticipo-observaciones"
                value={observaciones}
                onChange={(event) => onObservacionesChange(event.target.value)}
                className="min-h-24 max-w-full resize-y rounded-xl"
                placeholder={
                  isMotivoRequired
                    ? "Describe el motivo."
                    : "Notas opcionales para la trazabilidad del proceso."
                }
                disabled={isBusy}
              />
            </div>

            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Paperclip className="h-3.5 w-3.5" />
                Archivos de soporte
              </p>
              {isDesembolso && selected ? (
                <DesembolsoAdjuntosDropzone
                  anticipoId={selected._id}
                  disabled={isSaving}
                  onBusyChange={setDesembolsoBusy}
                  onLoadingChange={setDesembolsoLoading}
                />
              ) : (
                <FileDropzone
                  files={archivosAccion}
                  onFilesChange={onArchivosAccionChange}
                  disabled={isBusy}
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isBusy}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className={cn("gap-2 text-white", primaryClass)}
              disabled={isSubmitDisabled}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {primaryLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
