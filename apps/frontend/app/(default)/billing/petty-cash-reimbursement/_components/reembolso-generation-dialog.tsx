"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { FacturacionUsuario } from "../../hooks/use-facturacion-users";
import {
  normalizeInvoiceItem,
  ReembolsoConfirmDialog,
  ReembolsoDocumentViewer,
  ReembolsoGenerationPanel,
  type GenerationCentroDraft,
  ReembolsoInvoiceNavigator,
  ReembolsoWorkspaceShell,
  type ReembolsoInvoiceItem,
} from "@/components/cajas-menores/reembolso-workspace";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCOP } from "@/lib/format";
import {
  createDefaultDistribucion,
  isDistribucionValid,
  toLegacyCentroCosto,
} from "@/lib/cajas-menores/centros-costo-distribucion";

import type { DashboardCaja, DashboardMovimiento } from "./types";

export type CentroCostoDraft = GenerationCentroDraft;

function buildCentroCostoDraft(
  movimiento: DashboardMovimiento,
): CentroCostoDraft {
  const storedCentroCostoId = movimiento.centroCostoId?.trim() || undefined;
  const centrosCostoDistribucion = createDefaultDistribucion(movimiento.valor, {
    centroCostoCodigo: movimiento.centroCostoCodigo,
    centroCostoNombre: movimiento.centroCostoNombre,
    centrosCostoDistribucion: movimiento.centrosCostoDistribucion,
  }).map((row, index) => ({
    ...row,
    centroCostoId:
      row.centroCostoId?.trim() || (index === 0 ? storedCentroCostoId : undefined),
  }));
  const legacy = toLegacyCentroCosto(centrosCostoDistribucion);

  return {
    ...(legacy.centroCostoId ? { centroCostoId: legacy.centroCostoId } : {}),
    centroCostoCodigo: legacy.centroCostoCodigo,
    centroCostoNombre: legacy.centroCostoNombre,
    centrosCostoDistribucion,
  };
}

function areCentroCostoDraftsEqual(
  current: CentroCostoDraft,
  baseline: CentroCostoDraft,
) {
  const clean = (value?: string) => value?.trim() ?? "";
  if (clean(current.centroCostoId) !== clean(baseline.centroCostoId)) return false;
  if (clean(current.centroCostoCodigo) !== clean(baseline.centroCostoCodigo)) {
    return false;
  }
  if (clean(current.centroCostoNombre) !== clean(baseline.centroCostoNombre)) {
    return false;
  }
  if (
    current.centrosCostoDistribucion.length !==
    baseline.centrosCostoDistribucion.length
  ) {
    return false;
  }

  return current.centrosCostoDistribucion.every((row, index) => {
    const baselineRow = baseline.centrosCostoDistribucion[index];
    if (!baselineRow) return false;
    return (
      clean(row.centroCostoId) === clean(baselineRow.centroCostoId) &&
      clean(row.centroCostoCodigo) === clean(baselineRow.centroCostoCodigo) &&
      clean(row.centroCostoNombre) === clean(baselineRow.centroCostoNombre) &&
      Number(row.valor) === Number(baselineRow.valor)
    );
  });
}

export type ReembolsoGenerationSubmit = {
  movimientoIds: Array<Id<"facturacionCajaMenorMovimientos">>;
  centroCostoOverrides: Array<
    CentroCostoDraft & { movimientoId: Id<"facturacionCajaMenorMovimientos"> }
  >;
  aprobacionLider?: {
    aprobadorUserId: string;
    aprobadorNombre: string;
    aprobadorEmail: string;
  };
};

export function buildDirtyCentroCostoOverride(
  movimientoId: Id<"facturacionCajaMenorMovimientos">,
  draft: CentroCostoDraft,
  baseline: CentroCostoDraft,
): ReembolsoGenerationSubmit["centroCostoOverrides"][number] | null {
  if (areCentroCostoDraftsEqual(draft, baseline)) return null;

  const legacy = toLegacyCentroCosto(draft.centrosCostoDistribucion);
  return {
    movimientoId,
    ...(legacy.centroCostoId ? { centroCostoId: legacy.centroCostoId } : {}),
    centroCostoCodigo: legacy.centroCostoCodigo,
    centroCostoNombre: legacy.centroCostoNombre,
    centrosCostoDistribucion: draft.centrosCostoDistribucion,
  };
}

type ReembolsoGenerationDialogProps = {
  open: boolean;
  caja: DashboardCaja | null;
  selectedIds: string[];
  actorUserId?: string;
  usuarios: FacturacionUsuario[];
  usuariosLoading?: boolean;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ReembolsoGenerationSubmit) => void;
};

export function ReembolsoGenerationDialog({
  open,
  caja,
  selectedIds,
  actorUserId,
  usuarios,
  usuariosLoading,
  loading,
  onOpenChange,
  onSubmit,
}: ReembolsoGenerationDialogProps) {
  const [centroByMovimiento, setCentroByMovimiento] = useState<
    Record<string, CentroCostoDraft>
  >({});
  const [centroBaselineByMovimiento, setCentroBaselineByMovimiento] = useState<
    Record<string, CentroCostoDraft>
  >({});
  const [requiereAprobacion, setRequiereAprobacion] = useState(false);
  const [aprobadorId, setAprobadorId] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const movimientos = useMemo<DashboardMovimiento[]>(() => {
    if (!caja) return [];
    const selected = new Set(selectedIds);
    return caja.pendientes.filter((movimiento: DashboardMovimiento) =>
      selected.has(String(movimiento._id)),
    );
  }, [caja, selectedIds]);

  const total = useMemo(
    () =>
      movimientos.reduce(
        (sum: number, movimiento: DashboardMovimiento) => sum + movimiento.valor,
        0,
      ),
    [movimientos],
  );

  const facturaIds = useMemo<Array<Id<"facturacionFacturas">>>(() => {
    const seen = new Set<string>();
    const ids: Array<Id<"facturacionFacturas">> = [];
    for (const movimiento of movimientos) {
      const facturaId = movimiento.facturaId as Id<"facturacionFacturas">;
      if (seen.has(String(facturaId))) continue;
      seen.add(String(facturaId));
      ids.push(facturaId);
    }
    return ids;
  }, [movimientos]);

  const storageIds = useMemo<Array<Id<"_storage">>>(() => {
    const seen = new Set<string>();
    const ids: Array<Id<"_storage">> = [];
    for (const movimiento of movimientos) {
      for (const storageId of [
        movimiento.factura?.pdfStorageId,
        movimiento.factura?.soportesStorageId,
      ]) {
        if (!storageId || seen.has(String(storageId))) continue;
        seen.add(String(storageId));
        ids.push(storageId);
      }
    }
    return ids;
  }, [movimientos]);

  const storageUrls = useQuery(
    api.facturacionStorage.getUrls,
    storageIds.length > 0 ? { storageIds, facturaIds } : "skip",
  );

  const adjuntosPorFactura = useQuery(
    api.facturacionAdjuntos.listarPorFacturas,
    facturaIds.length > 0 ? { facturaIds } : "skip",
  );

  const adjuntosLoading =
    (storageIds.length > 0 && storageUrls === undefined) ||
    (facturaIds.length > 0 && adjuntosPorFactura === undefined);

  const invoices = useMemo<ReembolsoInvoiceItem[]>(() => {
    const urlByStorageId = new Map<string, string>();
    for (const item of storageUrls ?? []) {
      if (item.url) urlByStorageId.set(String(item.storageId), item.url);
    }
    for (const group of adjuntosPorFactura ?? []) {
      for (const adjunto of group.adjuntos) {
        if (adjunto.url) {
          urlByStorageId.set(String(adjunto.storageId), adjunto.url);
        }
      }
    }

    const adjuntosByFacturaId = new Map<
      string,
      NonNullable<Parameters<typeof normalizeInvoiceItem>[0]["adjuntos"]>
    >();
    for (const group of adjuntosPorFactura ?? []) {
      adjuntosByFacturaId.set(String(group.facturaId), group.adjuntos);
    }

    return movimientos.map((movimiento) =>
      normalizeInvoiceItem(
        {
          key: String(movimiento._id),
          movimientoId: String(movimiento._id),
          facturaId: String(movimiento.facturaId),
          numeroFactura: movimiento.factura?.numeroFactura ?? "Recibo físico",
          proveedorNombre:
            movimiento.factura?.proveedorNombre ?? movimiento.nombreEmpresa,
          concepto: movimiento.concepto,
          observaciones: movimiento.observaciones,
          valor: movimiento.valor,
          centroCostoCodigo: movimiento.centroCostoCodigo,
          centroCostoNombre: movimiento.centroCostoNombre,
          centrosCostoDistribucion: movimiento.centrosCostoDistribucion,
          fechaPago: movimiento.fechaPago,
          pdfStorageId: movimiento.factura?.pdfStorageId,
          soportesStorageId: movimiento.factura?.soportesStorageId,
          soportesNombre: movimiento.factura?.soportesNombre,
          adjuntos: adjuntosByFacturaId.get(String(movimiento.facturaId)) ?? [],
        },
        urlByStorageId,
      ),
    );
  }, [adjuntosPorFactura, movimientos, storageUrls]);

  const activeInvoice =
    invoices.find((invoice) => invoice.key === activeKey) ?? null;

  const validDistribuciones = useMemo(() => {
    return movimientos.filter((movimiento) => {
      const draft =
        centroByMovimiento[String(movimiento._id)] ??
        buildCentroCostoDraft(movimiento);
      return isDistribucionValid(movimiento.valor, draft.centrosCostoDistribucion);
    }).length;
  }, [centroByMovimiento, movimientos]);

  const hasDirtyCentros = useMemo(() => {
    return movimientos.some((movimiento) => {
      const id = String(movimiento._id);
      const draft = centroByMovimiento[id];
      const baseline = centroBaselineByMovimiento[id];
      if (!draft || !baseline) return false;
      return !areCentroCostoDraftsEqual(draft, baseline);
    });
  }, [centroBaselineByMovimiento, centroByMovimiento, movimientos]);

  const hasUnsavedChanges =
    hasDirtyCentros || requiereAprobacion || Boolean(aprobadorId);

  useEffect(() => {
    if (!open || !caja) return;
    const initial: Record<string, CentroCostoDraft> = {};
    const selected = new Set(selectedIds);
    for (const movimiento of caja.pendientes) {
      if (!selected.has(String(movimiento._id))) continue;
      initial[String(movimiento._id)] = buildCentroCostoDraft(movimiento);
    }
    setCentroByMovimiento(initial);
    setCentroBaselineByMovimiento(initial);
    setRequiereAprobacion(false);
    setAprobadorId(null);
    setActiveKey(null);
    setListCollapsed(false);
    setConfirmOpen(false);
    setDiscardOpen(false);
  }, [open, caja, selectedIds]);

  useEffect(() => {
    if (!activeKey && invoices.length > 0) {
      setActiveKey(invoices[0]!.key);
    }
  }, [activeKey, invoices]);

  const goRelative = useCallback(
    (delta: number) => {
      if (!activeKey || invoices.length === 0) return;
      const index = invoices.findIndex((invoice) => invoice.key === activeKey);
      const next = invoices[index + delta];
      if (next) setActiveKey(next.key);
    },
    [activeKey, invoices],
  );

  function requestClose() {
    if (hasUnsavedChanges) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function buildSubmitPayload(): ReembolsoGenerationSubmit | null {
    if (!caja || movimientos.length === 0) return null;
    if (
      movimientos.some((movimiento) => {
        const draft = centroByMovimiento[String(movimiento._id)];
        return !isDistribucionValid(
          movimiento.valor,
          draft?.centrosCostoDistribucion ?? [],
        );
      })
    ) {
      toast.error(
        "Completa la distribución de centros de costo para todas las facturas.",
      );
      return null;
    }

    const aprobador = usuarios.find((usuario) => usuario.id === aprobadorId);
    if (requiereAprobacion && !aprobador) {
      toast.error("Selecciona el líder aprobador.");
      return null;
    }

    const centroCostoOverrides: ReembolsoGenerationSubmit["centroCostoOverrides"] =
      movimientos.flatMap((movimiento) => {
        const movimientoId = String(movimiento._id);
        const draft =
          centroByMovimiento[movimientoId] ?? buildCentroCostoDraft(movimiento);
        const baseline =
          centroBaselineByMovimiento[movimientoId] ??
          buildCentroCostoDraft(movimiento);
        const override = buildDirtyCentroCostoOverride(
          movimiento._id as Id<"facturacionCajaMenorMovimientos">,
          draft,
          baseline,
        );
        return override ? [override] : [];
      });

    return {
      movimientoIds: movimientos.map(
        (movimiento) =>
          movimiento._id as Id<"facturacionCajaMenorMovimientos">,
      ),
      centroCostoOverrides,
      ...(requiereAprobacion && aprobador
        ? {
            aprobacionLider: {
              aprobadorUserId: aprobador.id,
              aprobadorNombre: aprobador.nombre,
              aprobadorEmail: aprobador.email,
            },
          }
        : {}),
    };
  }

  function handleGenerateClick() {
    const payload = buildSubmitPayload();
    if (!payload) return;
    setConfirmOpen(true);
  }

  function handleConfirmGenerate() {
    const payload = buildSubmitPayload();
    if (!payload) return;
    setConfirmOpen(false);
    onSubmit(payload);
  }

  const activeDraft = activeKey
    ? centroByMovimiento[activeKey] ?? null
    : null;

  return (
    <>
      <ReembolsoWorkspaceShell
        open={open}
        title="Generar solicitud de reembolso"
        description="Revisa facturas, adjuntos y centros de costo"
        onOpenChange={onOpenChange}
        onRequestClose={requestClose}
        listCollapsed={listCollapsed}
        onToggleList={() => setListCollapsed((current) => !current)}
        mobileBlocked
        header={
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold leading-tight text-slate-950">
              Generar solicitud de reembolso
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">
                {caja?.nombre ?? "Caja Menor"}
              </span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span>{movimientos.length} factura(s)</span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatCOP(total)}
              </span>
              {loading ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-slate-400"
                  aria-hidden
                />
              ) : null}
            </div>
          </div>
        }
        list={
          <ReembolsoInvoiceNavigator
            invoices={invoices}
            activeKey={activeKey}
            onSelect={setActiveKey}
            onPrev={() => goRelative(-1)}
            onNext={() => goRelative(1)}
          />
        }
        viewer={
          <ReembolsoDocumentViewer
            invoice={activeInvoice}
            documentsLoading={adjuntosLoading}
          />
        }
        panel={
          <ReembolsoGenerationPanel
            invoice={activeInvoice}
            invoices={invoices}
            centroDraft={activeDraft}
            onCentroChange={(draft) => {
              if (!activeKey) return;
              setCentroByMovimiento((current) => ({
                ...current,
                [activeKey]: draft,
              }));
            }}
            empresaId={caja?.empresa_id}
            requiereAprobacion={requiereAprobacion}
            onRequiereAprobacionChange={setRequiereAprobacion}
            aprobadorId={aprobadorId}
            onAprobadorChange={setAprobadorId}
            usuarios={usuarios}
            usuariosLoading={usuariosLoading}
            actorUserId={actorUserId}
            total={total}
            validDistribuciones={validDistribuciones}
            busy={loading}
            onCancel={requestClose}
            onGenerate={handleGenerateClick}
          />
        }
      />

      <ReembolsoConfirmDialog
        open={confirmOpen}
        action="generar"
        faseDestino={
          requiereAprobacion ? "Aprobación líder" : "Revisor Caja Menor"
        }
        facturaCount={movimientos.length}
        valorTotal={total}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmGenerate}
      />

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar cambios</AlertDialogTitle>
            <AlertDialogDescription>
              Hay ediciones de centros de costo o aprobación líder sin generar.
              Si cierras, se descartarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              Descartar y cerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
