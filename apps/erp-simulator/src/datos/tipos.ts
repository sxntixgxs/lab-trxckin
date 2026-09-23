/** N = NIT, C = cédula de ciudadanía, E = cédula de extranjería, P = pasaporte. */
export type TipoIdentificacion = "N" | "C" | "E" | "P";

export type SucursalSimulada = {
  /** Branch code, e.g. "001". */
  id: string;
  descripcion: string;
  activa: boolean;
  /** CON, ANT, C15, C30, C60, C90, C120. */
  condicionPago: string | null;
  /** Supplier branches only: 001 = bienes, 002 = servicios. */
  tipoProveedor: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
};

export type TerceroSimulado = {
  idInstancia: string;
  cia: number;
  /** f200_id: the tercero code (the document number, as stored by the ERP). */
  id: string;
  /** f200_nit: the document number as stored by the ERP (may be zero-padded). */
  nit: string;
  dv: string | null;
  tipoIdentificacion: TipoIdentificacion;
  /** 1 = persona natural, 2 = persona jurídica. */
  tipoTercero: 1 | 2;
  razonSocial: string;
  nombres: string | null;
  apellido1: string | null;
  apellido2: string | null;
  activo: boolean;
  ciiu: string | null;
  /** Supplier branches; empty when the tercero is not a supplier. */
  proveedor: SucursalSimulada[];
  /** Customer branches; empty when the tercero is not a customer. */
  cliente: SucursalSimulada[];
};
