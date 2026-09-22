import type { Doc } from "@/convex/_generated/dataModel";
import type { Id } from "@/convex/_generated/dataModel";

export type Anticipo = Doc<"anticipos">;
export type AnticipoAdjunto = {
  storageId: Id<"_storage">;
  nombre: string;
};
export type AnticipoFase = Doc<"anticiposFases"> & {
  adjuntos?: AnticipoAdjunto[];
};
export type AnticipoRoleConfigUser = {
  userId: string;
  nombre: string;
  email: string;
};
export type AnticipoRoleConfig = Doc<"anticiposRolesConfig"> & {
  usuarios?: AnticipoRoleConfigUser[];
};
export type AnticipoRow = Anticipo & {
  saldoLegalizado?: number;
  soportesSolicitud?: AnticipoAdjunto[];
  bolsaIdResolved?: Id<"bolsasAnticipos">;
  bolsa?: Doc<"bolsasAnticipos"> | null;
  ultimaFaseInicio: number | null;
  faseEnCurso: AnticipoFase | null;
  legalizacionesFacturacion?: Array<
    Doc<"facturacionAnticipoLegalizaciones"> & {
      factura: Doc<"facturacionFacturas"> | null;
    }
  >;
};
export type UsuarioInfo = {
  id: string;
  nombre?: string;
  email?: string;
  cargo?: string;
  proceso?: string | null;
  procesoUsuario?: {
    nombre?: string | null;
  } | null;
  id_empresa?: number | null;
  id_jefe_directo?: string | null;
  id_jefe_supremo?: string | null;
  lider_proceso?: boolean;
  activo?: boolean;
};
export type FlujoAction =
  | "jefe_directo"
  | "contabilidad"
  | "gerencia"
  | "desembolso";
export type DialogAction = FlujoAction | "rechazar" | "devolver" | "anular";
export type Decision = "APROBADO" | "RECHAZADO";
export type ApprovalBulkDecision = {
  anticipo: AnticipoRow;
  decision: Decision;
  observacion?: string;
  archivos?: File[];
};
export type RolAnticipo =
  | "GERENCIA"
  | "TESORERO"
  | "CONTABILIDAD";
export type RolAnticipoSingle = Exclude<RolAnticipo, "CONTABILIDAD">;
export type AnticiposConfigDraft = Record<RolAnticipoSingle, string> & {
  CONTABILIDAD: string[];
};
