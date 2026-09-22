export type UsuarioConfig = {
  usuarioId: string;
  nombre: string;
  email: string;
};

export type UsuarioPonderadoConfig = UsuarioConfig & {
  peso: number;
};

export type ConfiguracionFacturacionItem = {
  usuarioId?: string;
  nombre?: string;
  email?: string;
  usuarios?: UsuarioConfig[];
  usuariosPonderados?: UsuarioPonderadoConfig[];
  valor?: string;
  sincronizacionGraphDeshabilitada?: boolean;
};

export type UsuariosListaConfigKey =
  | "recepcion"
  | "contadores_impuestos"
  | "contadores_peajes"
  | "eventos_dian"
  | "revisor_caja_menor"
  | "notificacion_pagadas"
  | "notificacion_legalizadas"
  | "notificacion_rechazado_dian";

export type AnalistaCausacionRow = {
  rowId: string;
  usuarioId: string | null;
  peso: string;
};

export type CupoBloque10 = {
  usuarioId: string;
  nombre: string;
  cupos: number;
};

let analistaRowSequence = 0;

export function createAnalistaRow(
  usuarioId: string | null = null,
  peso = 100
): AnalistaCausacionRow {
  analistaRowSequence += 1;
  return {
    rowId: `${usuarioId ?? "analista"}-${analistaRowSequence}`,
    usuarioId,
    peso: String(peso),
  };
}

export type ProveedorCausacionItem = {
  _id: string;
  proveedorNit: string;
  proveedorNitNormalizado: string;
  proveedorNombre: string;
  analistaUsuarioId: string;
  analistaNombre: string;
  analistaEmail: string;
};

export type {
  ProveedorSiesaBusqueda,
  ProveedoresSiesaBusquedaResponse,
} from "@/lib/siesa-proveedores";

export type SlaPhase =
  | "recepcion"
  | "revision_lider"
  | "causacion"
  | "revision_impuestos"
  | "eventos_dian"
  | "pendiente_rechazar_dian"
  | "gerencia"
  | "revision_tesoreria";

export const SLA_PHASE_ORDER: SlaPhase[] = [
  "recepcion",
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "pendiente_rechazar_dian",
  "gerencia",
  "revision_tesoreria",
];

export const SLA_PHASE_LABELS: Record<SlaPhase, string> = {
  recepcion: "Recepción",
  revision_lider: "Líder",
  causacion: "Causación",
  revision_impuestos: "Contabilidad",
  eventos_dian: "Eventos DIAN",
  pendiente_rechazar_dian: "Rechazos DIAN",
  gerencia: "Gerencia",
  revision_tesoreria: "Tesorería",
};

export type SlaFaseConfig = {
  fase: SlaPhase;
  label: string;
  umbralDiasLaborales: number | null;
  habilitado: boolean;
  actualizadoEn: number | null;
  actualizadoPorNombre: string | null;
  actualizadoPorEmail: string | null;
};

export type SlaOversightEmail = {
  email: string;
  nombre: string | null;
};

export type SlaConfigResponse = {
  fases: SlaFaseConfig[];
  oversightEmails: SlaOversightEmail[];
  emailsHabilitados: boolean;
  warningRule: string;
  preview: {
    ejemploInicioMs: number;
    umbralEjemplo: number;
    alertaEn: number;
    venceEn: number;
  };
};

export function calcularCuposBloque10(
  rows: Array<{ usuarioId: string; nombre: string; peso: number }>
): CupoBloque10[] {
  const totalPeso = rows.reduce((total, row) => total + row.peso, 0);
  if (rows.length === 0 || totalPeso <= 0) return [];

  const calculados = rows.map((row, index) => {
    const exacto = (row.peso / totalPeso) * 10;
    return {
      ...row,
      index,
      cupos: Math.floor(exacto),
      residuo: exacto - Math.floor(exacto),
    };
  });

  const asignados = calculados.reduce((total, row) => total + row.cupos, 0);
  const faltantes = 10 - asignados;
  const porResiduo = [...calculados].sort((a, b) => b.residuo - a.residuo || a.index - b.index);
  for (let index = 0; index < faltantes; index += 1) {
    porResiduo[index % porResiduo.length].cupos += 1;
  }

  return calculados;
}
