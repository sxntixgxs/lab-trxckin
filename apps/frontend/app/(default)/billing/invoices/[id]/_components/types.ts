import type { Doc, Id } from "@/convex/_generated/dataModel";

export type PeajesCruceDetalle = {
  fuente: "peajes_excel";
  operacionId?: Id<"facturacionPeajesOperaciones">;
  legalizacionIds: Array<Id<"facturacionAnticipoLegalizaciones">>;
  aplicadoEn: number;
  valorBruto: number;
  valorNotasCredito: number;
  valorNeto: number;
  notasCredito: Array<{
    notaCreditoId: Id<"facturacionFacturas">;
    numeroFactura: string;
    fechaEmision?: string;
    valor: number;
    referenciaDocumento?: string;
    facturaRelacionadaId?: Id<"facturacionFacturas">;
    facturaRelacionadaNumero?: string;
    detalleDisponible: boolean;
  }>;
};

export type NotaCreditoRelacionDetalle = {
  esPeajes?: boolean;
  mensajePeajes?: string;
  facturaOrigen: Doc<"facturacionFacturas"> | null;
  notasCredito: Array<Doc<"facturacionFacturas">>;
  origenRelacion?: "dian" | "manual" | "sin_relacion";
};

export type LegalizacionAnticipoDetalle = Doc<"facturacionAnticipoLegalizaciones"> & {
  anticipo: Doc<"anticipos"> | null;
};

export type LegalizacionCajaMenorDetalle = Doc<"facturacionCajaMenorLegalizaciones"> & {
  cajaMenor: Doc<"cajasMenores"> | null;
};

export type MovimientoCajaMenorDetalle = {
  _id: string;
  estado: string;
  valor: number;
  concepto: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  origen?: string;
  cajaMenorId?: string;
  cajaMenor?: { nombre?: string } | null;
  reembolso?: { estado: string } | null;
  creadoEn: number;
};

export type FacturaAdjuntoConUrl = Doc<"facturacionAdjuntos"> & { url: string | null };

export type FacturaWithTareaData = {
  factura: Doc<"facturacionFacturas">;
  tarea: Doc<"facturacionTareas"> | null;
  aprobaciones: Array<Doc<"facturacionAprobaciones">>;
  asignaciones: Array<Doc<"facturacionAsignaciones">>;
  legalizacionesAnticipos: LegalizacionAnticipoDetalle[];
  legalizacionesCajaMenor: LegalizacionCajaMenorDetalle[];
  movimientosCajaMenor: MovimientoCajaMenorDetalle[];
  peajesCruceDetalle: PeajesCruceDetalle | null;
  notaCreditoRelacion: NotaCreditoRelacionDetalle | null;
  estadoResuelto?: string | null;
  cajaMenorProceso?: CajaMenorProceso | null;
};

export type CajaMenorProgresoPaso = {
  key: string;
  label: string;
  estado: "completado" | "actual" | "omitida" | "pendiente";
};

export type CajaMenorProcesoIntervalo = {
  id: string;
  origen: "facturacion" | "caja_menor";
  intentoId?: string;
  fase: string;
  faseLabel: string;
  rol?: string;
  estado: string;
  responsableUserId?: string;
  responsableNombre: string;
  responsableEmail?: string;
  inicioEn: number;
  finEn: number;
  duracionMs: number;
  diasLaborales: number;
  enCurso: boolean;
  observacion?: string;
};

export type CajaMenorProceso = {
  aplica: true;
  fasePublica: string;
  fasePublicaLabel: string;
  responsableActual?: {
    userId?: string;
    nombre: string;
    email?: string;
    rol?: string;
    esEquipo?: boolean;
  };
  intentoVigenteId?: string;
  advertencia?: string;
  pasosProgreso: CajaMenorProgresoPaso[];
  pasosBarraUnificada: CajaMenorProgresoPaso[];
  intervalos: CajaMenorProcesoIntervalo[];
  intentos: Array<{
    intentoId: string;
    reembolsoId: string;
    intervalos: CajaMenorProcesoIntervalo[];
  }>;
};

export const FLOW_STEPS = [
  { key: "recepcion", label: "Recepción" },
  { key: "revision_lider", label: "Líder" },
  { key: "causacion", label: "Causación" },
  { key: "revision_impuestos", label: "Contabilidad" },
  { key: "eventos_dian", label: "Eventos DIAN" },
  { key: "gerencia", label: "Gerencia" },
  { key: "revision_tesoreria", label: "Tesorería" },
  { key: "pagada", label: "Pagada" },
] as const;
