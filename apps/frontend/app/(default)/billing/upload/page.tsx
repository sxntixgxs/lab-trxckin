"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation } from "convex/react";
import { ArrowLeft, FileCode2, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import Loading from "../../loading";
import NoAutorizado from "@/app/no-autorizado";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DashboardHero } from "@/components/dashboard-hero";
import { Button } from "@/components/ui/button";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { useFacturacionPage } from "../hooks/use-facturacion-page";
import { getFacturacionErrorMessage } from "../lib/user-facing-error";
import { formatCurrency } from "../lib/utils";

export default function FacturacionCargaPage() {
  const router = useRouter();
  const { status, hasAccess, session } = useFacturacionPage(
    RUTAS_SISTEMA.FACTURACION_FACTURAS,
  );
  const { empresaActiva } = useEmpresaFilter();
  const empresaCarga =
    typeof empresaActiva === "number"
      ? empresaActiva
      : Number(session?.user?.id_empresa ?? 1);
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);
  const processUploadedXml = useAction(api.facturacionGraph.processUploadedXml);

  const xmlInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [categoria, setCategoria] = useState<"administracion" | "tecnologia" | "otro">("administracion");
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [result, setResult] = useState<null | Awaited<ReturnType<typeof processUploadedXml>>>(null);

  async function uploadFile(file: File) {
    const uploadUrl = await generateUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });

    const data = (await response.json()) as { storageId: string };
    return data.storageId;
  }

  if (status === "loading") return <Loading />;
  if (!hasAccess) return <NoAutorizado />;

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <Link href="/billing/invoices" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        Volver a facturas
      </Link>

      <DashboardHero
        title="Carga manual XML"
        description="Sube un XML DIAN y, si existe, el PDF soporte para incorporarlo al flujo de facturación en Trxckin."
        icon={<UploadCloud className="h-8 w-8" />}
        gradientClassName="from-slate-950 via-cyan-950 to-slate-900"
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="grid gap-4 lg:grid-cols-2">
          <UploadSlot title="XML de factura" file={xmlFile} onPick={() => xmlInputRef.current?.click()} />
          <UploadSlot title="PDF soporte (opcional)" file={pdfFile} onPick={() => pdfInputRef.current?.click()} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {[
            ["administracion", "Administración"],
            ["tecnologia", "Tecnología"],
            ["otro", "Otro"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setCategoria(value as typeof categoria)}
              className={`rounded-2xl px-4 py-2 text-sm ${categoria === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            disabled={!xmlFile || loadingUpload}
            onClick={async () => {
              if (!xmlFile) {
                toast.error("Selecciona el XML antes de procesar.");
                return;
              }

              setLoadingUpload(true);
              try {
                const xmlStorageId = await uploadFile(xmlFile);
                const pdfStorageId = pdfFile ? await uploadFile(pdfFile) : undefined;

                const response = await processUploadedXml({
                  xmlStorageId: xmlStorageId as Id<"_storage">,
                  ...(pdfStorageId
                    ? { pdfStorageId: pdfStorageId as Id<"_storage"> }
                    : {}),
                  categoria,
                  empresa: empresaCarga,
                });

                setResult(response);
                toast.success(`Factura ${response.parsed.numeroFactura} cargada correctamente.`);
              } catch (error) {
                toast.error(
                  getFacturacionErrorMessage(
                    error,
                    "No se pudo procesar el XML. Verifica el archivo e intenta nuevamente.",
                  ),
                );
              } finally {
                setLoadingUpload(false);
              }
            }}
          >
            {loadingUpload ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCode2 className="mr-2 h-4 w-4" />}
            Procesar archivo
          </Button>

          {result ? (
            <Button variant="outline" onClick={() => router.push(`/billing/invoices/${result.facturaId}`)}>
              Ver factura creada
            </Button>
          ) : null}
        </div>

        {result ? (
          <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
            <p className="font-semibold">Factura #{result.parsed.numeroFactura} creada.</p>
            <p className="mt-2">{result.parsed.proveedorNombre} · {formatCurrency(result.parsed.total, result.parsed.moneda)}</p>
          </div>
        ) : null}

        <input ref={xmlInputRef} type="file" accept=".xml" className="hidden" onChange={(event) => setXmlFile(event.target.files?.[0] ?? null)} />
        <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)} />
      </section>
    </div>
  );
}

function UploadSlot({ title, file, onPick }: { title: string; file: File | null; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="flex min-h-40 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-slate-400 hover:bg-white">
      <UploadCloud className="h-8 w-8 text-slate-500" />
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{file ? file.name : "Haz clic para seleccionar el archivo"}</p>
    </button>
  );
}
