import {
  FileArchive,
  FileCheck2,
  FileText,
  Wallet,
} from "lucide-react";

import type { Doc } from "@/convex/_generated/dataModel";
import type { FacturaAdjuntoConUrl } from "./types";
import { DocumentLink, isPdfLikeAdjunto } from "./shared-ui";

export function FacturaDocuments({
  factura,
  tarea,
  xmlUrl,
  pdfUrl,
  soportesUrl,
  comprobanteUrl,
  adjuntoPrincipal,
  adjuntosExtra,
}: {
  factura: Doc<"facturacionFacturas">;
  tarea: Doc<"facturacionTareas"> | null;
  xmlUrl?: string | null;
  pdfUrl?: string | null;
  soportesUrl?: string | null;
  comprobanteUrl?: string | null;
  adjuntoPrincipal: FacturaAdjuntoConUrl | null;
  adjuntosExtra: FacturaAdjuntoConUrl[];
}) {
  const hasDocuments =
    xmlUrl ||
    pdfUrl ||
    adjuntoPrincipal?.url ||
    soportesUrl ||
    comprobanteUrl ||
    adjuntosExtra.some((adjunto) => adjunto.url);

  if (!hasDocuments) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {xmlUrl ? (
        <DocumentLink
          href={xmlUrl}
          label="XML DIAN"
          hint="Documento original"
          icon={<FileText className="h-4 w-4" />}
        />
      ) : null}
      {pdfUrl ? (
        <DocumentLink
          href={pdfUrl}
          label="PDF factura"
          hint="Representación gráfica"
          icon={<FileCheck2 className="h-4 w-4" />}
        />
      ) : null}
      {adjuntoPrincipal?.url ? (
        <DocumentLink
          href={adjuntoPrincipal.url}
          label={
            isPdfLikeAdjunto(adjuntoPrincipal) ? "PDF factura" : "Soporte factura"
          }
          hint={adjuntoPrincipal.nombre}
          icon={
            isPdfLikeAdjunto(adjuntoPrincipal) ? (
              <FileCheck2 className="h-4 w-4" />
            ) : (
              <FileArchive className="h-4 w-4" />
            )
          }
        />
      ) : null}
      {soportesUrl ? (
        <DocumentLink
          href={soportesUrl}
          label="Descargar soportes"
          hint={factura.soportesNombre ?? "Archivo .zip con soportes"}
          icon={<FileArchive className="h-4 w-4" />}
          download={factura.soportesNombre ?? "soportes.zip"}
        />
      ) : null}
      {typeof comprobanteUrl === "string" && comprobanteUrl ? (
        <DocumentLink
          href={comprobanteUrl}
          label="Comprobante de pago"
          hint={tarea?.comprobantePagoNombre ?? "Soporte tesorería"}
          icon={<Wallet className="h-4 w-4" />}
          highlight
        />
      ) : null}
      {adjuntosExtra.map((adjunto) => {
        if (!adjunto.url) return null;
        const adjuntoEsPdf = isPdfLikeAdjunto(adjunto);
        return (
          <DocumentLink
            key={String(adjunto._id)}
            href={adjunto.url}
            label={adjuntoEsPdf ? "PDF adjunto" : "Adjunto factura"}
            hint={adjunto.nombre}
            icon={
              adjuntoEsPdf ? (
                <FileCheck2 className="h-4 w-4" />
              ) : (
                <FileArchive className="h-4 w-4" />
              )
            }
          />
        );
      })}
    </div>
  );
}
