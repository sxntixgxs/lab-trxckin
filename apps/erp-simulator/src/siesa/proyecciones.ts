/**
 * Turns database rows into the flat rows SIESA's standard queries return (`detalle.Table`).
 * The input types are structural so this module does not depend on the generated Prisma client.
 */

export type FilaSiesa = Record<string, string | number | null>;

export type TerceroBD = {
  f200_rowid: number;
  f200_id_cia: number;
  f200_id: string;
  f200_nit: string;
  f200_dv_nit: string | null;
  f200_id_tipo_ident: string;
  f200_ind_tipo_tercero: number;
  f200_razon_social: string;
  f200_nombres: string | null;
  f200_apellido1: string | null;
  f200_apellido2: string | null;
  f200_ind_cliente: number;
  f200_ind_proveedor: number;
  f200_ind_estado: number;
  f200_id_ciiu: string | null;
  f200_fecha_creacion: Date;
  f200_fecha_actualizacion: Date;
};

type ContactoBD = {
  f015_email: string | null;
  f015_telefono: string | null;
  f015_direccion1: string | null;
  f015_ciudad: string | null;
  f015_departamento: string | null;
};

export type ProveedorBD = ContactoBD & {
  f202_id_sucursal: string;
  f202_descripcion_sucursal: string;
  f202_ind_estado: number;
  f202_id_cond_pago: string | null;
  f202_id_tipo_prov: string | null;
  tercero: TerceroBD;
};

export type ClienteBD = ContactoBD & {
  f201_id_sucursal: string;
  f201_descripcion_sucursal: string;
  f201_ind_estado_activo: number;
  f201_id_cond_pago: string | null;
  tercero: TerceroBD;
};

export type CompaniaBD = {
  f010_id: number;
  f010_razon_social: string;
  f010_nit: string;
  f010_ind_estado: number;
};

function filaTercero(t: TerceroBD): FilaSiesa {
  return {
    f200_rowid: t.f200_rowid,
    f200_id_cia: t.f200_id_cia,
    f200_id: t.f200_id,
    f200_nit: t.f200_nit,
    f200_dv_nit: t.f200_dv_nit,
    f200_id_tipo_ident: t.f200_id_tipo_ident,
    f200_ind_tipo_tercero: t.f200_ind_tipo_tercero,
    f200_razon_social: t.f200_razon_social,
    f200_nombres: t.f200_nombres,
    f200_apellido1: t.f200_apellido1,
    f200_apellido2: t.f200_apellido2,
    f200_ind_cliente: t.f200_ind_cliente,
    f200_ind_proveedor: t.f200_ind_proveedor,
    f200_ind_estado: t.f200_ind_estado,
    f200_id_ciiu: t.f200_id_ciiu,
    f200_fecha_creacion: t.f200_fecha_creacion.toISOString(),
    f200_fecha_actualizacion: t.f200_fecha_actualizacion.toISOString(),
  };
}

function filaContacto(c: ContactoBD): FilaSiesa {
  return {
    f015_email: c.f015_email,
    f015_telefono: c.f015_telefono,
    f015_direccion1: c.f015_direccion1,
    f015_ciudad: c.f015_ciudad,
    f015_departamento: c.f015_departamento,
  };
}

/** API_v2_Proveedores: one row per supplier branch (t200 ⋈ t202). */
export function filaProveedor(p: ProveedorBD): FilaSiesa {
  return {
    ...filaTercero(p.tercero),
    f202_id_sucursal: p.f202_id_sucursal,
    f202_descripcion_sucursal: p.f202_descripcion_sucursal,
    f202_ind_estado: p.f202_ind_estado,
    f202_id_cond_pago: p.f202_id_cond_pago,
    f202_id_tipo_prov: p.f202_id_tipo_prov,
    ...filaContacto(p),
  };
}

/** API_v2_Clientes: one row per customer branch (t200 ⋈ t201). */
export function filaCliente(c: ClienteBD): FilaSiesa {
  return {
    ...filaTercero(c.tercero),
    f201_id_sucursal: c.f201_id_sucursal,
    f201_descripcion_sucursal: c.f201_descripcion_sucursal,
    f201_ind_estado_activo: c.f201_ind_estado_activo,
    f201_id_cond_pago: c.f201_id_cond_pago,
    ...filaContacto(c),
  };
}

/** API_v2_Companias: one row per company of the instance (t010). */
export function filaCompania(c: CompaniaBD): FilaSiesa {
  return {
    f010_id: c.f010_id,
    f010_razon_social: c.f010_razon_social,
    f010_nit: c.f010_nit,
    f010_ind_estado: c.f010_ind_estado,
  };
}
