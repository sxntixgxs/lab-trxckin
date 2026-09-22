"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/** @deprecated Prefer PersistentStageAttachment from reactive detail. */
export type StageAttachmentDraft = {
  storageId: Id<"_storage">;
  nombre: string;
  mimeType?: string;
};

export type PersistentStageAttachment = {
  _id: Id<"cajasMenoresReembolsoAdjuntos">;
  storageId: Id<"_storage">;
  nombre: string;
  mimeType?: string;
  url: string | null;
  actorNombre: string;
  creadoEn: number;
  puedeEliminar: boolean;
};

type OptimisticUpload = {
  tempId: string;
  nombre: string;
  storageId?: Id<"_storage">;
};

export function ReembolsoStageAttachments({
  reembolsoId,
  actor,
  label,
  description,
  emptyLabel = "Arrastra archivos aquí o usa Examinar",
  required = false,
  disabled = false,
  accept = ".pdf,.png,.jpg,.jpeg,.webp",
  maxFiles,
  collapsible = false,
  attachments,
  onBusyChange,
  onView,
}: {
  reembolsoId: Id<"cajasMenoresReembolsos">;
  actor: {
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
    actorRol?: number;
  };
  label: string;
  description?: string;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  accept?: string;
  maxFiles?: number;
  collapsible?: boolean;
  attachments: PersistentStageAttachment[];
  onBusyChange?: (busy: boolean) => void;
  onView: (attachmentId: Id<"cajasMenoresReembolsoAdjuntos">) => void;
}) {
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);
  const crearAdjunto = useMutation(
    api.cajasMenores.crearAdjuntoBorradorReembolsoCajaMenor,
  );
  const eliminarAdjunto = useMutation(
    api.cajasMenores.eliminarAdjuntoBorradorReembolsoCajaMenor,
  );
  const eliminarArchivoFallido = useMutation(
    api.cajasMenores.eliminarArchivoFallidoReembolsoCajaMenor,
  );

  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<OptimisticUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [collapsibleOpen, setCollapsibleOpen] = useState(attachments.length > 0);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = uploading || deletingId !== null;

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (attachments.length > 0) {
      setCollapsibleOpen(true);
    }
  }, [attachments.length]);

  // Drop optimistic rows only when their storage object is visible reactively.
  // Names are intentionally not used: a phase can contain two files with the
  // same name and they must remain distinct until both are persisted.
  useEffect(() => {
    if (optimistic.length === 0) return;
    setOptimistic((current) =>
      current.filter(
        (row) =>
          !row.storageId ||
          !attachments.some(
            (attachment) => String(attachment.storageId) === String(row.storageId),
          ),
      ),
    );
  }, [attachments, optimistic.length]);

  const inputId = useId();
  const dropzoneId = useId();

  const effectiveCount = attachments.length + optimistic.length;
  const atMaxFiles =
    maxFiles !== undefined ? effectiveCount >= maxFiles : false;
  const inputDisabled = disabled || busy || atMaxFiles;
  const allowMultiple = !required && (maxFiles === undefined || maxFiles > 1);

  const handleFiles = useCallback(
    async (selected: FileList | null) => {
      if (!selected?.length || inputDisabled) return;

      const remaining =
        maxFiles !== undefined
          ? Math.max(0, maxFiles - effectiveCount)
          : undefined;
      const filesToUpload = Array.from(selected).slice(
        0,
        remaining ?? selected.length,
      );
      if (filesToUpload.length === 0) return;

      setUploading(true);
      const pendingOptimistic: OptimisticUpload[] = filesToUpload.map((file) => ({
        tempId: `tmp-${file.name}-${file.size}-${Date.now()}`,
        nombre: file.name,
      }));
      setOptimistic((current) => [...current, ...pendingOptimistic]);

      const errors: string[] = [];
      for (const [index, file] of filesToUpload.entries()) {
        const optimisticUpload = pendingOptimistic[index];
        if (!optimisticUpload) continue;
        let storageId: Id<"_storage"> | null = null;
        try {
          const uploadUrl = await generateUploadUrl({});
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!response.ok) throw new Error(`No se pudo subir ${file.name}.`);
          const uploaded = (await response.json()) as {
            storageId: Id<"_storage">;
          };
          storageId = uploaded.storageId;
          const persistedStorageId = storageId;
          setOptimistic((current) =>
            current.map((row) =>
              row.tempId === optimisticUpload.tempId
                ? { ...row, storageId: persistedStorageId }
                : row,
            ),
          );
          await crearAdjunto({
            reembolsoId,
            storageId,
            nombre: file.name,
            mimeType: file.type || undefined,
            ...actor,
          });
        } catch (error) {
          errors.push(
            error instanceof Error ? error.message : `No se pudo subir ${file.name}.`,
          );
          setOptimistic((current) =>
            current.filter((row) => row.tempId !== optimisticUpload.tempId),
          );
          if (storageId) {
            try {
              await eliminarArchivoFallido({ reembolsoId, storageId, ...actor });
            } catch {
              // Do not mask the upload error if cleanup must be retried later.
            }
          }
        }
      }
      if (errors.length > 0) toast.error(errors[0] ?? "Error al subir archivos.");
      if (errors.length < filesToUpload.length && collapsible) setCollapsibleOpen(true);
      setUploading(false);
    },
    [
      actor,
      collapsible,
      crearAdjunto,
      effectiveCount,
      eliminarArchivoFallido,
      generateUploadUrl,
      inputDisabled,
      maxFiles,
      reembolsoId,
    ],
  );

  async function removeFile(attachment: PersistentStageAttachment) {
    if (!attachment.puedeEliminar || disabled || busy) return;
    setDeletingId(attachment._id);
    try {
      await eliminarAdjunto({
        adjuntoId: attachment._id,
        ...actor,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo eliminar el archivo.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function openFilePicker() {
    if (!inputDisabled) inputRef.current?.click();
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    if (!inputDisabled) setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  const infoText =
    "El archivo se guarda al cargarlo y estará disponible cuando vuelvas.";

  const dropzoneContent = (
    <>
      <div
        id={dropzoneId}
        role="button"
        tabIndex={inputDisabled ? -1 : 0}
        aria-labelledby={inputId}
        aria-describedby={`${dropzoneId}-hint`}
        aria-disabled={inputDisabled}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={(event) => {
          if (inputDisabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFilePicker();
          }
        }}
        className={cn(
          "rounded-lg border-2 border-dashed px-3 py-4 transition-colors",
          isDragging
            ? "border-teal-400 bg-teal-50/70"
            : "border-slate-200 bg-slate-50/50 hover:border-slate-300",
          inputDisabled && "cursor-not-allowed opacity-60",
          !inputDisabled &&
            "cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2",
        )}
        onClick={() => {
          if (!inputDisabled) openFilePicker();
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={allowMultiple}
          disabled={inputDisabled}
          className="sr-only"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="flex flex-col items-center gap-1.5 text-center">
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" aria-hidden />
              <p className="text-xs font-medium text-slate-700">Subiendo archivos…</p>
            </>
          ) : (
            <>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-xs">
                <Upload className="h-4 w-4 text-slate-500" aria-hidden />
              </span>
              <p className="text-xs font-medium text-slate-700">{emptyLabel}</p>
              <p id={`${dropzoneId}-hint`} className="text-[11px] text-slate-500">
                PDF, PNG, JPG o WEBP
                {maxFiles !== undefined ? ` · máx. ${maxFiles}` : ""}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-0.5 h-7 rounded-md bg-white px-2 text-xs"
                disabled={inputDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  openFilePicker();
                }}
              >
                Examinar
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500">{infoText}</p>

      {attachments.length > 0 || optimistic.length > 0 ? (
        <ul className="space-y-1.5" aria-label="Archivos adjuntos de la fase">
          {optimistic.map((row) => (
            <li
              key={row.tempId}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <Loader2
                className="h-3.5 w-3.5 shrink-0 animate-spin text-teal-600"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-slate-700">
                {row.nombre}
              </span>
              <span className="shrink-0 text-[11px] text-slate-500">Subiendo…</span>
            </li>
          ))}
          {attachments.map((file) => {
            const isDeleting = deletingId === file._id;
            const canPreview = Boolean(file.url);
            return (
              <li
                key={file._id}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-xs"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{file.nombre}</p>
                  <p className="truncate text-[10px] text-slate-500">
                    Guardado · {file.actorNombre}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 rounded-md text-slate-600 hover:bg-slate-100"
                  disabled={!canPreview || isDeleting}
                  aria-label={`Ver ${file.nombre}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onView(file._id);
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                {file.puedeEliminar && !disabled ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 rounded-md text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    disabled={isDeleting || uploading}
                    aria-label={`Quitar ${file.nombre}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeFile(file);
                    }}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-1 text-[11px] text-slate-400">
          <Paperclip className="h-3 w-3" aria-hidden />
          Sin archivos adjuntos
        </p>
      )}

      {required && attachments.length === 0 && optimistic.length === 0 ? (
        <p className="text-[11px] text-sky-700" role="status">
          Debes cargar al menos un comprobante de pago.
        </p>
      ) : null}
    </>
  );

  return (
    <div className="space-y-2">
      {!collapsible ? (
        <div>
          <Label htmlFor={inputId}>
            {label}
            {required ? " (obligatorio)" : " (opcional)"}
          </Label>
          {description ? (
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
      ) : null}

      {collapsible ? (
        <Collapsible open={collapsibleOpen} onOpenChange={setCollapsibleOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-left text-xs transition hover:bg-slate-100/80"
            >
              <span className="min-w-0">
                <span className="font-medium text-slate-800">
                  {label}
                  {required ? " (obligatorio)" : " (opcional)"}
                </span>
                {description ? (
                  <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-500">
                    {description}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-slate-500">
                {attachments.length > 0 ? (
                  <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-teal-800">
                    {attachments.length}
                  </span>
                ) : null}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    collapsibleOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {dropzoneContent}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        dropzoneContent
      )}
    </div>
  );
}

export function ReembolsoStageAttachmentsReadonly({
  adjuntos,
  onView,
}: {
  adjuntos: Array<{
    nombre: string;
    url: string | null;
    mimeType?: string;
    id?: string;
  }>;
  onView?: (index: number) => void;
}) {
  if (adjuntos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {adjuntos.map((adjunto, index) =>
        adjunto.url ? (
          <span
            key={`${adjunto.nombre}-${index}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-xs font-medium text-teal-700"
          >
            <FileText className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{adjunto.nombre}</span>
            {onView ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-5 w-5 shrink-0 rounded-full text-teal-700 hover:bg-teal-100"
                aria-label={`Ver ${adjunto.nombre}`}
                onClick={() => onView(index)}
              >
                <Eye className="h-3 w-3" />
              </Button>
            ) : (
              <a
                href={adjunto.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full px-1.5 py-0.5 hover:bg-teal-100"
              >
                Abrir
              </a>
            )}
          </span>
        ) : (
          <span
            key={`${adjunto.nombre}-${index}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500"
          >
            <FileText className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{adjunto.nombre}</span>
          </span>
        ),
      )}
    </div>
  );
}
