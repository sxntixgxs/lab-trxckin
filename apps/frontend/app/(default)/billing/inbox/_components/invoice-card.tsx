import { useState } from "react";
import {
  ChevronRight,
  Coins,
  FilePlus2,
  FileText,
  RotateCcw,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BuzonTarea } from "../../components/buzon-row";
import { FacturacionStatusBadge } from "../../components/status-badge";
import {
  EmpresaIconTile,
  FacturaEmpresaBadge,
  getEmpresaAccentStyle,
  resolveFacturacionEmpresaId,
} from "../../lib/empresa-ui";
import { getDocumentoLabel } from "../../lib/valor-contable";
import { formatDate, formatElapsed } from "../../lib/utils";
import { FacturaPagoAmount } from "../../components/valor-contable-ui";
import { getActiveStage, getReturnMetadata } from "../../lib/workflow-config";
import { FacturaPdfPreviewCard } from "./factura-pdf-preview-card";
import { getDueLabel } from "./helpers";
import { StageProgress } from "./shared";

export function InvoiceCard({
  tarea,
  selected,
  selectionMode,
  checked,
  onToggleChecked,
  onSelect,
}: {
  tarea: BuzonTarea;
  selected: boolean;
  selectionMode: boolean;
  checked: boolean;
  onToggleChecked: () => void;
  onSelect: () => void;
}) {
  const factura = tarea.factura;
  const pdfUrl = tarea.pdfUrl;
  const [previewOpen, setPreviewOpen] = useState(false);
  const stage = String(getActiveStage(tarea));
  const returnInfo = getReturnMetadata(tarea.asignacion);
  const vencimiento = getDueLabel(factura?.fechaVencimiento);
  const hasPhysicalSupport =
    factura?.isFisico === true && (tarea.adjuntosCount ?? 0) > 0;
  const hasPreviewDocuments = Boolean(pdfUrl || hasPhysicalSupport);
  const empresaAccent = getEmpresaAccentStyle(resolveFacturacionEmpresaId(tarea));

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        className={`group flex w-full flex-col gap-4 rounded-xl border border-l-[3px] bg-white p-4 text-left shadow-xs transition hover:border-slate-300 hover:bg-slate-50 md:flex-row md:items-center ${
          selected ? "border-slate-900 ring-1 ring-slate-900/10" : "border-slate-200"
        }`}
        style={{ borderLeftColor: empresaAccent.color }}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {selectionMode ? (
            <div
              className="pt-2"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={onToggleChecked}
                aria-label="Seleccionar factura"
              />
            </div>
          ) : null}
          <EmpresaIconTile
            empresaId={resolveFacturacionEmpresaId(tarea)}
            className="h-10 w-10"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-950">
                {factura?.proveedorNombre ?? "Sin proveedor"}
              </p>
              <FacturaEmpresaBadge tarea={tarea} />
              <FacturacionStatusBadge estado={tarea.estado} />
              {factura?.esLegalizacionAnticipo ? (
                <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                  <Coins className="mr-1 h-3 w-3" />
                  Anticipo
                </Badge>
              ) : null}
              {factura?.esLegalizacionCajaMenor ? (
                <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">
                  <WalletCards className="mr-1 h-3 w-3" />
                  Caja Menor
                </Badge>
              ) : null}
              {factura?.isFisico ? (
                <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                  <FilePlus2 className="mr-1 h-3 w-3" />
                  Documento físico
                </Badge>
              ) : null}
              {returnInfo ? (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Devuelta
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              #{factura?.numeroFactura ?? "-"} · NIT {factura?.proveedorNit ?? "-"}{" "}
              · {getDocumentoLabel(factura)}
            </p>
            <div className="mt-3">
              <StageProgress stage={stage} compact />
            </div>
          </div>
        </div>
        <div
          className="flex w-full shrink-0 justify-start md:w-auto md:min-w-[170px] md:justify-center"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {hasPreviewDocuments ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-100"
              onClick={() => setPreviewOpen(true)}
            >
              <FileText className="h-4 w-4" />
              {pdfUrl ? "Ver PDF" : "Ver soporte"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-400"
              disabled
            >
              <FileText className="h-4 w-4" />
              {factura?.isFisico ? "Sin soporte" : "Sin PDF"}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4 md:ml-auto">
          <div className="text-right">
            {factura ? (
              <FacturaPagoAmount factura={factura} fase={stage} />
            ) : (
              <p className="text-base font-semibold tabular-nums text-slate-950">-</p>
            )}
            <p className="text-xs text-slate-500">
              Emitida {factura?.fechaEmision ? formatDate(factura.fechaEmision) : "-"}
            </p>
            <p className={vencimiento.className}>{vencimiento.label}</p>
            <p className="mt-2 text-xs text-slate-500">
              {formatElapsed(tarea.creadoEn)} · {tarea.asignadoANombre.split(" ")[0]}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:text-slate-500" />
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex h-[86vh] w-[92vw] max-w-[980px] flex-col gap-0 overflow-hidden rounded-2xl bg-slate-50 p-0">
          <DialogHeader className="border-b border-slate-200 bg-white px-5 py-4 pr-12">
            <DialogTitle className="truncate text-base">
              {pdfUrl ? "Representación gráfica" : "Soporte físico"} · #
              {factura?.numeroFactura ?? "-"}
            </DialogTitle>
            <DialogDescription className="truncate">
              {factura?.proveedorNombre ?? "Factura"} · NIT {factura?.proveedorNit ?? "-"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden p-4">
            <FacturaPdfPreviewCard
              tarea={tarea}
              heightClassName="h-[calc(86vh-180px)]"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
