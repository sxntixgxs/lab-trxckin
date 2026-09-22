"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Eye,
  FileIcon,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatDateTime } from "../lib/utils";
import { getFacturacionErrorMessage } from "../lib/user-facing-error";
import { AdjuntosPreviewDialog } from "./adjuntos-viewer/adjuntos-preview-dialog";
import {
  buildFacturaPdfDocument,
  formatFileSize,
} from "./adjuntos-viewer/adjuntos-viewer-document-utils";
import type { DocumentoAdjunto } from "./adjuntos-viewer/adjuntos-viewer-types";

export type { DocumentoAdjunto } from "./adjuntos-viewer/adjuntos-viewer-types";
export { AdjuntosPreviewDialog } from "./adjuntos-viewer/adjuntos-preview-dialog";
export {
  buildFacturaPdfDocument,
  FACTURA_PDF_DOCUMENT_ID,
} from "./adjuntos-viewer/adjuntos-viewer-document-utils";

export type AdjuntoConUrl = Doc<"facturacionAdjuntos"> & { url: string | null };

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB

type Actor = {
  userId?: string;
  nombre: string;
  email: string;
};

type AdjuntosPanelProps = {
  facturaId: Id<"facturacionFacturas"> | null;
  asignacionId?: Id<"facturacionAsignaciones"> | null;
  facturaPdfUrl?: string | null;
  facturaPdfStorageId?: Id<"_storage"> | null;
  numeroFactura?: string | null;
  actor: Actor;
  compact?: boolean;
  maxItems?: number;
  onOpenFull?: () => void;
  className?: string;
};

export function BuzonAdjuntosDialog({
  facturaId,
  asignacionId,
  numeroFactura,
  proveedorNombre,
  facturaPdfUrl,
  facturaPdfStorageId,
  actor,
  onClose,
}: {
  facturaId: Id<"facturacionFacturas"> | null;
  asignacionId?: Id<"facturacionAsignaciones"> | null;
  numeroFactura?: string;
  proveedorNombre?: string;
  facturaPdfUrl?: string | null;
  facturaPdfStorageId?: Id<"_storage"> | null;
  actor: Actor;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={facturaId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Paperclip className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogHeader className="p-0">
              <DialogTitle className="text-base font-semibold">
                Adjuntos de la factura
                {numeroFactura ? ` · #${numeroFactura}` : ""}
              </DialogTitle>
            </DialogHeader>
            {proveedorNombre ? (
              <p className="truncate text-xs text-slate-500">{proveedorNombre}</p>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <BuzonAdjuntosPanel
            facturaId={facturaId}
            asignacionId={asignacionId}
            facturaPdfUrl={facturaPdfUrl}
            facturaPdfStorageId={facturaPdfStorageId}
            numeroFactura={numeroFactura}
            actor={actor}
            className="border-0 p-0"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BuzonAdjuntosPanel({
  facturaId,
  asignacionId,
  facturaPdfUrl,
  facturaPdfStorageId,
  numeroFactura,
  actor,
  compact = false,
  maxItems,
  onOpenFull,
  className,
}: AdjuntosPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<Id<"facturacionAdjuntos"> | null>(
    null,
  );
  const [expanded, setExpanded] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIds, setViewerIds] = useState<string[]>([]);
  const [viewerFocusedId, setViewerFocusedId] = useState<string | null>(null);

  const adjuntos = useQuery(
    api.facturacionAdjuntos.listarPorFactura,
    facturaId ? { facturaId } : "skip",
  );

  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);
  const crearAdjunto = useMutation(api.facturacionAdjuntos.crear);
  const eliminarAdjunto = useMutation(api.facturacionAdjuntos.eliminar);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !facturaId) return;

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(
          `${file.name} supera el límite de ${MAX_FILE_BYTES / (1024 * 1024)}MB`,
        );
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setUploadingNames((prev) => [...prev, ...validFiles.map((file) => file.name)]);

    for (const file of validFiles) {
      try {
        const uploadUrl = await generateUploadUrl({});
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });
        if (!response.ok) {
          throw new Error(`Error al subir ${file.name}`);
        }
        const { storageId } = (await response.json()) as { storageId: string };
        await crearAdjunto({
          facturaId,
          ...(asignacionId ? { asignacionId } : {}),
          storageId: storageId as Id<"_storage">,
          nombre: file.name,
          mimeType: file.type || undefined,
          size: file.size,
          subidoPorUserId: actor.userId,
          subidoPorNombre: actor.nombre,
          subidoPorEmail: actor.email,
        });
        toast.success(`${file.name} subido.`);
      } catch (error) {
        toast.error(
          getFacturacionErrorMessage(
            error,
            `No se pudo subir ${file.name}. Intenta nuevamente.`,
          ),
        );
      } finally {
        setUploadingNames((prev) => prev.filter((name) => name !== file.name));
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: Id<"facturacionAdjuntos">) {
    setDeletingId(id);
    try {
      await eliminarAdjunto({ adjuntoId: id });
      toast.success("Adjunto eliminado.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo eliminar el adjunto. Intenta nuevamente.",
        ),
      );
    } finally {
      setDeletingId(null);
    }
  }

  const supportList = (adjuntos ?? []) as AdjuntoConUrl[];
  const facturaPdfDocument = facturaPdfUrl
    ? buildFacturaPdfDocument(facturaPdfUrl, numeroFactura, facturaPdfStorageId)
    : null;
  const list = [
    ...(facturaPdfDocument ? [facturaPdfDocument] : []),
    ...supportList.map(toDocumentoAdjunto),
  ];
  const visibleList =
    typeof maxItems === "number" && !expanded ? list.slice(0, maxItems) : list;
  const hiddenCount = Math.max(0, list.length - visibleList.length);
  const canCollapse =
    typeof maxItems === "number" && expanded && list.length > maxItems;

  function openPreview(documento: DocumentoAdjunto) {
    if (!documento.url) {
      toast.error("Este documento todavía no tiene vista disponible.");
      return;
    }
    setViewerIds(
      facturaPdfDocument && documento.id !== facturaPdfDocument.id
        ? [facturaPdfDocument.id, documento.id]
        : [documento.id],
    );
    setViewerFocusedId(documento.id);
    setViewerOpen(true);
  }

  return (
    <>
      <section
        className={cn(
          "rounded-xl border border-slate-200 bg-white p-4",
          compact && "p-3",
          className,
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Adjuntos</p>
            <p className="text-xs text-slate-500">
              {supportList.length} archivo(s) de soporte
              {facturaPdfDocument ? " · incluye PDF factura" : ""}
            </p>
          </div>
          {onOpenFull ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={onOpenFull}
            >
              Ver todos
            </Button>
          ) : null}
        </div>

        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 text-left transition hover:border-slate-400 hover:bg-slate-50",
            compact ? "py-3" : "py-5",
          )}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void handleFiles(event.dataTransfer.files);
          }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-xs">
            <UploadCloud className="h-4 w-4 text-slate-500" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-700">
              Arrastra o haz clic para adjuntar
            </span>
            <span className="block text-xs text-slate-500">
              Máximo {MAX_FILE_BYTES / (1024 * 1024)}MB por archivo
            </span>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
          />
        </label>

        {uploadingNames.length > 0 ? (
          <div className="mt-3 space-y-1">
            {uploadingNames.map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Subiendo {name}...
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-3">
          {adjuntos === undefined && list.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando adjuntos...
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500">
              Sin adjuntos todavía.
            </div>
          ) : (
            <>
              <ul
                className={cn(
                  "space-y-2",
                  canCollapse && "max-h-80 overflow-y-auto pr-1",
                )}
              >
                {visibleList.map((documento) => {
                  const isFacturaPdf = documento.kind === "factura_pdf";
                  const adjuntoId = documento.adjuntoId;
                  return (
                    <li
                      key={documento.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border bg-white px-3 py-2 transition hover:border-slate-300",
                        isFacturaPdf
                          ? "border-blue-200 bg-blue-50/60 ring-1 ring-blue-100"
                          : "border-slate-200",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          isFacturaPdf
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {isFacturaPdf ? (
                          <FileText className="h-4 w-4" />
                        ) : (
                          <FileIcon className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
                          <span className="truncate">{documento.nombre}</span>
                          {isFacturaPdf ? (
                            <Badge className="shrink-0 border-blue-200 bg-blue-100 text-[10px] font-semibold uppercase text-blue-700 hover:bg-blue-100">
                              Representación gráfica
                            </Badge>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {getDocumentMeta(documento)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-lg p-0"
                          onClick={() => openPreview(documento)}
                          disabled={!documento.url}
                          title="Vista previa"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {documento.url ? (
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-lg p-0"
                          >
                            <a
                              href={documento.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Descargar"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : null}
                        {adjuntoId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-lg p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => void handleDelete(adjuntoId)}
                            disabled={deletingId === adjuntoId}
                            title="Eliminar"
                          >
                            {deletingId === adjuntoId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
                {adjuntos === undefined ? (
                  <li className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cargando archivos de soporte...
                  </li>
                ) : null}
              </ul>
              {hiddenCount > 0 || canCollapse ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-8 w-full rounded-lg text-xs font-medium text-slate-600"
                  onClick={() => setExpanded((prev) => !prev)}
                >
                  {hiddenCount > 0 ? (
                    <>
                      <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
                      Ver todos ({list.length})
                    </>
                  ) : (
                    <>
                      <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
                      Ver menos
                    </>
                  )}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </section>

      <AdjuntosPreviewDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        adjuntos={list}
        selectedIds={viewerIds}
        initialFocusedId={viewerFocusedId}
        onSelectedIdsChange={setViewerIds}
      />
    </>
  );
}

export function toDocumentoAdjunto(adjunto: AdjuntoConUrl): DocumentoAdjunto {
  return {
    id: String(adjunto._id),
    adjuntoId: adjunto._id,
    storageId: adjunto.storageId,
    nombre: adjunto.nombre,
    url: adjunto.url,
    mimeType: adjunto.mimeType,
    size: adjunto.size,
    subidoPorNombre: adjunto.subidoPorNombre,
    creadoEn: adjunto.creadoEn,
    kind: "soporte",
  };
}

function getDocumentMeta(documento: DocumentoAdjunto) {
  if (documento.kind === "factura_pdf") {
    return "Visualización en PDF de la factura";
  }

  const source = documento.subidoPorNombre ?? "Adjunto";
  const createdAt = documento.creadoEn ? ` · ${formatDateTime(documento.creadoEn)}` : "";
  const size =
    typeof documento.size === "number" ? ` · ${formatFileSize(documento.size)}` : "";
  return `${source}${createdAt}${size}`;
}
