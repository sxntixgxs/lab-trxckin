import { companiaDeAppEmpresa, type CompaniaSimulada } from "./companias";
import { calcularDvNit } from "./nit";
import type { SucursalSimulada, TerceroSimulado } from "./tipos";

/**
 * Hand-picked terceros documented in docs/erp-simulado.md. Each one demonstrates a case in the
 * onboarding modals, the anticipos supplier lookup or the catalog sync. ACME (900123456) is left
 * out on purpose: its first process is an INSCRIPCIÓN, and "Crear en ERP" registers it here.
 */
export const NITS_DEMO = {
  /** Supplier with two branches (anticipos branch picker) in empresa 1. */
  proveedorMultisucursal: "900222333",
  /** Inactive supplier in empresa 1 ("Inactivo en ERP"). */
  proveedorInactivo: "900444555",
  /** Customer and supplier in empresa 1. */
  clienteYProveedor: "800666777",
  /** Natural person (cédula, no DV), supplier in empresa 1. */
  personaNatural: "52123456",
  /** Supplier that exists only in empresa 2 (per-company scope). */
  soloEmpresa2: "901777888",
  /** Customer stored zero-padded by the ERP, in empresa 3 (NIT normalization). */
  nitConCeros: "0890123456",
} as const;

type SucursalBase = Partial<SucursalSimulada> &
  Pick<SucursalSimulada, "id" | "descripcion" | "ciudad" | "departamento">;

function sucursal(base: SucursalBase): SucursalSimulada {
  return {
    activa: true,
    condicionPago: "C30",
    tipoProveedor: null,
    email: null,
    telefono: null,
    direccion: null,
    ...base,
  };
}

function juridica(
  compania: CompaniaSimulada,
  datos: {
    nit: string;
    razonSocial: string;
    ciiu: string;
    activo?: boolean;
    proveedor?: SucursalSimulada[];
    cliente?: SucursalSimulada[];
  },
): TerceroSimulado {
  return {
    idInstancia: compania.idInstancia,
    cia: compania.cia,
    id: datos.nit,
    nit: datos.nit,
    dv: calcularDvNit(datos.nit),
    tipoIdentificacion: "N",
    tipoTercero: 2,
    razonSocial: datos.razonSocial,
    nombres: null,
    apellido1: null,
    apellido2: null,
    activo: datos.activo ?? true,
    ciiu: datos.ciiu,
    proveedor: datos.proveedor ?? [],
    cliente: datos.cliente ?? [],
  };
}

export function tercerosDemo(): TerceroSimulado[] {
  const empresa1 = companiaDeAppEmpresa(1);
  const empresa2 = companiaDeAppEmpresa(2);
  const empresa3 = companiaDeAppEmpresa(3);

  return [
    juridica(empresa1, {
      nit: NITS_DEMO.proveedorMultisucursal,
      razonSocial: "Distribuidora Andina del Norte S.A.S.",
      ciiu: "4663",
      proveedor: [
        sucursal({
          id: "001",
          descripcion: "Distribuidora Andina del Norte S.A.S.",
          ciudad: "Bogotá D.C.",
          departamento: "Bogotá D.C.",
          tipoProveedor: "001",
          email: "compras@distribuidora-andina.example.com",
          telefono: "3104567890",
          direccion: "Calle 13 # 68-45",
        }),
        sucursal({
          id: "002",
          descripcion: "Distribuidora Andina del Norte S.A.S. - Medellín",
          ciudad: "Medellín",
          departamento: "Antioquia",
          tipoProveedor: "001",
          condicionPago: "C60",
          email: "medellin@distribuidora-andina.example.com",
          telefono: "3157894561",
          direccion: "Carrera 50 # 30-12",
        }),
      ],
    }),
    juridica(empresa1, {
      nit: NITS_DEMO.proveedorInactivo,
      razonSocial: "Transportes Cóndor S.A.S.",
      ciiu: "4923",
      activo: false,
      proveedor: [
        sucursal({
          id: "001",
          descripcion: "Transportes Cóndor S.A.S.",
          ciudad: "Bucaramanga",
          departamento: "Santander",
          activa: false,
          tipoProveedor: "002",
          email: "operaciones@transportes-condor.example.com",
          telefono: "3176541230",
          direccion: "Avenida Quebradaseca # 21-40",
        }),
      ],
    }),
    juridica(empresa1, {
      nit: NITS_DEMO.clienteYProveedor,
      razonSocial: "Ferretería El Nevado S.A.S.",
      ciiu: "4752",
      proveedor: [
        sucursal({
          id: "001",
          descripcion: "Ferretería El Nevado S.A.S.",
          ciudad: "Manizales",
          departamento: "Caldas",
          tipoProveedor: "001",
          condicionPago: "CON",
          email: "ventas@ferreteria-el-nevado.example.com",
          telefono: "3128765432",
          direccion: "Carrera 23 # 65-11",
        }),
      ],
      cliente: [
        sucursal({
          id: "001",
          descripcion: "Ferretería El Nevado S.A.S.",
          ciudad: "Manizales",
          departamento: "Caldas",
          condicionPago: "C30",
          email: "cartera@ferreteria-el-nevado.example.com",
          telefono: "3128765432",
          direccion: "Carrera 23 # 65-11",
        }),
      ],
    }),
    {
      idInstancia: empresa1.idInstancia,
      cia: empresa1.cia,
      id: NITS_DEMO.personaNatural,
      nit: NITS_DEMO.personaNatural,
      dv: null,
      tipoIdentificacion: "C",
      tipoTercero: 1,
      razonSocial: "María Fernanda Ruiz Castaño",
      nombres: "María Fernanda",
      apellido1: "Ruiz",
      apellido2: "Castaño",
      activo: true,
      ciiu: "7020",
      proveedor: [
        sucursal({
          id: "001",
          descripcion: "María Fernanda Ruiz Castaño",
          ciudad: "Pereira",
          departamento: "Risaralda",
          tipoProveedor: "002",
          condicionPago: "C15",
          email: "maria.ruiz@example.com",
          telefono: "3009876543",
          direccion: "Calle 19 # 8-34",
        }),
      ],
      cliente: [],
    },
    juridica(empresa2, {
      nit: NITS_DEMO.soloEmpresa2,
      razonSocial: "Suministros Mineros del Norte S.A.S.",
      ciiu: "4659",
      proveedor: [
        sucursal({
          id: "001",
          descripcion: "Suministros Mineros del Norte S.A.S.",
          ciudad: "Valledupar",
          departamento: "Cesar",
          tipoProveedor: "001",
          condicionPago: "C60",
          email: "comercial@suministros-mineros.example.com",
          telefono: "3015553322",
          direccion: "Carrera 9 # 16-50",
        }),
      ],
    }),
    juridica(empresa3, {
      nit: NITS_DEMO.nitConCeros,
      razonSocial: "Servicios Técnicos del Valle S.A.S.",
      ciiu: "3312",
      cliente: [
        sucursal({
          id: "001",
          descripcion: "Servicios Técnicos del Valle S.A.S.",
          ciudad: "Cali",
          departamento: "Valle del Cauca",
          condicionPago: "C30",
          email: "cuentas@servicios-tecnicos-valle.example.com",
          telefono: "3162224455",
          direccion: "Avenida 6N # 23-61",
        }),
      ],
    }),
  ];
}
