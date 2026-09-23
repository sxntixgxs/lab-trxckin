import { COMPANIAS_SIMULADAS, type CompaniaSimulada } from "./companias";
import { NITS_DEMO, tercerosDemo } from "./demo";
import { calcularDvNit, normalizarNit } from "./nit";
import { crearAleatorio, semillaDe, type Aleatorio } from "./prng";
import type { SucursalSimulada, TerceroSimulado, TipoIdentificacion } from "./tipos";

export const TERCEROS_GENERADOS_POR_COMPANIA = 120;

/**
 * Documents the generator never produces: ACME (the onboarding demo company, which starts
 * outside the ERP on purpose), the app's own companies and the fixtures used by the app's tests.
 */
export const NITS_RESERVADOS: ReadonlySet<string> = new Set([
  "900123456", // ACME Colombia S.A.S.
  "900000001",
  "900000002",
  "900000003",
  "900000004",
  "900111222",
  "900333444",
  "800555666",
  "800555111",
  "901000111",
  "900765432",
  "900999888",
  "900654321",
  "900555666",
  "860026182",
  "800999888",
]);

const PREFIJOS = [
  "Comercializadora",
  "Distribuidora",
  "Inversiones",
  "Servicios",
  "Transportes",
  "Constructora",
  "Ingeniería",
  "Suministros",
  "Soluciones",
  "Logística",
  "Industrias",
  "Agroindustrial",
  "Consultores",
  "Laboratorio",
  "Metalmecánica",
  "Papelería",
  "Tecnología",
  "Almacenes",
] as const;

const NUCLEOS = [
  "Andina",
  "del Valle",
  "Cóndor",
  "Guadua",
  "Los Llanos",
  "Sabana",
  "Cafetera",
  "Caribe",
  "Orinoco",
  "Magdalena",
  "Altamira",
  "Frailejón",
  "Quimbaya",
  "Tayrona",
  "La Montaña",
  "Santa Fe",
  "Chicamocha",
  "Guatapé",
  "Barichara",
  "Cocora",
  "Pance",
  "El Poblado",
  "Río Claro",
  "Bahía Solano",
] as const;

const SUFIJOS = ["S.A.S.", "S.A.S.", "S.A.S.", "Ltda.", "S.A."] as const;

const NOMBRES = [
  "Ana María",
  "Carlos",
  "Diana",
  "Felipe",
  "Juliana",
  "Andrés",
  "Laura",
  "Santiago",
  "Valentina",
  "Camilo",
  "Paola",
  "Jorge",
  "Natalia",
  "Sebastián",
  "Catalina",
  "Mauricio",
] as const;

const APELLIDOS = [
  "Gómez",
  "Rodríguez",
  "Martínez",
  "López",
  "García",
  "Hernández",
  "Pérez",
  "Sánchez",
  "Ramírez",
  "Torres",
  "Díaz",
  "Moreno",
  "Vargas",
  "Rojas",
  "Castro",
  "Ortiz",
  "Jiménez",
  "Suárez",
] as const;

const LUGARES = [
  { ciudad: "Bogotá D.C.", departamento: "Bogotá D.C." },
  { ciudad: "Medellín", departamento: "Antioquia" },
  { ciudad: "Cali", departamento: "Valle del Cauca" },
  { ciudad: "Barranquilla", departamento: "Atlántico" },
  { ciudad: "Bucaramanga", departamento: "Santander" },
  { ciudad: "Pereira", departamento: "Risaralda" },
  { ciudad: "Manizales", departamento: "Caldas" },
  { ciudad: "Cartagena", departamento: "Bolívar" },
  { ciudad: "Villavicencio", departamento: "Meta" },
  { ciudad: "Tunja", departamento: "Boyacá" },
  { ciudad: "Neiva", departamento: "Huila" },
  { ciudad: "Santa Marta", departamento: "Magdalena" },
] as const;

type Lugar = (typeof LUGARES)[number];

const CIIU = ["4663", "4690", "4923", "4111", "7110", "6201", "4752", "0810", "4659", "8299", "4530", "1811", "4719", "5611", "7490"] as const;
const VIAS = ["Calle", "Carrera", "Avenida", "Transversal", "Diagonal"] as const;
const CONDICIONES_PROVEEDOR = ["CON", "C15", "C30", "C30", "C60"] as const;
const CONDICIONES_CLIENTE = ["CON", "ANT", "C30", "C60", "C90"] as const;

/** Every fake ERP tercero: the curated demo cases plus the generated bulk for each company. */
export function construirDatosSimulados(cantidadPorCompania = TERCEROS_GENERADOS_POR_COMPANIA): TerceroSimulado[] {
  const excluidos = new Set([...NITS_RESERVADOS, ...Object.values(NITS_DEMO).map(normalizarNit)]);
  return [
    ...tercerosDemo(),
    ...COMPANIAS_SIMULADAS.flatMap((compania) => generarTercerosCompania(compania, cantidadPorCompania, excluidos)),
  ];
}

/** Deterministic: the same company and amount always produce the same terceros. */
export function generarTercerosCompania(
  compania: CompaniaSimulada,
  cantidad: number,
  excluidos: ReadonlySet<string>,
): TerceroSimulado[] {
  const rnd = crearAleatorio(semillaDe(`${compania.idInstancia}:${compania.cia}`));
  const documentosUsados = new Set(excluidos);
  const nombresUsados = new Set<string>();
  const terceros: TerceroSimulado[] = [];
  while (terceros.length < cantidad) {
    terceros.push(
      rnd.probabilidad(0.15)
        ? personaNatural(rnd, compania, documentosUsados)
        : personaJuridica(rnd, compania, documentosUsados, nombresUsados),
    );
  }
  return terceros;
}

function personaJuridica(
  rnd: Aleatorio,
  compania: CompaniaSimulada,
  documentosUsados: Set<string>,
  nombresUsados: Set<string>,
): TerceroSimulado {
  const nit = documentoUnico(rnd, 800_000_000, 901_999_999, documentosUsados);
  const nucleo = nombreUnico(rnd, nombresUsados);
  const razonSocial = `${nucleo} ${rnd.elegir(SUFIJOS)}`;
  const activo = !rnd.probabilidad(0.08);
  let esProveedor = rnd.probabilidad(0.7);
  const esCliente = rnd.probabilidad(0.4);
  if (!esProveedor && !esCliente) esProveedor = true;
  const lugar = rnd.elegir(LUGARES);
  const dominio = `${slug(nucleo)}.example.com`;

  return {
    idInstancia: compania.idInstancia,
    cia: compania.cia,
    id: nit,
    nit,
    dv: calcularDvNit(nit),
    tipoIdentificacion: "N",
    tipoTercero: 2,
    razonSocial,
    nombres: null,
    apellido1: null,
    apellido2: null,
    activo,
    ciiu: rnd.elegir(CIIU),
    proveedor: esProveedor ? sucursales(rnd, razonSocial, lugar, activo, "proveedor", dominio) : [],
    cliente: esCliente ? sucursales(rnd, razonSocial, lugar, activo, "cliente", dominio) : [],
  };
}

function personaNatural(rnd: Aleatorio, compania: CompaniaSimulada, documentosUsados: Set<string>): TerceroSimulado {
  const tipoIdentificacion: TipoIdentificacion = rnd.probabilidad(0.1) ? "E" : "C";
  const documento =
    tipoIdentificacion === "E"
      ? documentoUnico(rnd, 100_000, 9_999_999, documentosUsados)
      : rnd.probabilidad(0.5)
        ? documentoUnico(rnd, 10_000_000, 99_999_999, documentosUsados)
        : documentoUnico(rnd, 1_000_000_000, 1_199_999_999, documentosUsados);
  const nombres = rnd.elegir(NOMBRES);
  const apellido1 = rnd.elegir(APELLIDOS);
  const apellido2 = rnd.elegir(APELLIDOS);
  const razonSocial = `${nombres} ${apellido1} ${apellido2}`;
  const activo = !rnd.probabilidad(0.08);
  let esProveedor = rnd.probabilidad(0.8);
  const esCliente = rnd.probabilidad(0.3);
  if (!esProveedor && !esCliente) esProveedor = true;
  const lugar = rnd.elegir(LUGARES);
  const dominio = "example.com";

  return {
    idInstancia: compania.idInstancia,
    cia: compania.cia,
    id: documento,
    nit: documento,
    dv: null,
    tipoIdentificacion,
    tipoTercero: 1,
    razonSocial,
    nombres,
    apellido1,
    apellido2,
    activo,
    ciiu: rnd.elegir(CIIU),
    proveedor: esProveedor ? sucursales(rnd, razonSocial, lugar, activo, "proveedor", dominio, slug(razonSocial)) : [],
    cliente: esCliente ? sucursales(rnd, razonSocial, lugar, activo, "cliente", dominio, slug(razonSocial)) : [],
  };
}

function sucursales(
  rnd: Aleatorio,
  razonSocial: string,
  principal: Lugar,
  terceroActivo: boolean,
  tipo: "proveedor" | "cliente",
  dominio: string,
  buzon = tipo === "proveedor" ? "ventas" : "cartera",
): SucursalSimulada[] {
  const lista = [crearSucursal(rnd, "001", razonSocial, principal, terceroActivo, tipo, `${buzon}@${dominio}`)];
  if (rnd.probabilidad(0.1)) {
    const otro = LUGARES.find((lugar) => lugar !== principal && rnd.probabilidad(0.3)) ?? LUGARES[0];
    lista.push(
      crearSucursal(
        rnd,
        "002",
        `${razonSocial} - ${otro.ciudad}`,
        otro,
        terceroActivo,
        tipo,
        `${slug(otro.ciudad)}.${buzon}@${dominio}`,
      ),
    );
  }
  return lista;
}

function crearSucursal(
  rnd: Aleatorio,
  id: string,
  descripcion: string,
  lugar: Lugar,
  terceroActivo: boolean,
  tipo: "proveedor" | "cliente",
  email: string,
): SucursalSimulada {
  return {
    id,
    descripcion,
    // An inactive tercero has every branch inactive; an active one occasionally has one off.
    activa: terceroActivo && !rnd.probabilidad(0.05),
    condicionPago: rnd.elegir(tipo === "proveedor" ? CONDICIONES_PROVEEDOR : CONDICIONES_CLIENTE),
    tipoProveedor: tipo === "proveedor" ? rnd.elegir(["001", "002"] as const) : null,
    email,
    telefono: `3${rnd.entero(100_000_000, 509_999_999)}`,
    direccion: `${rnd.elegir(VIAS)} ${rnd.entero(1, 150)} # ${rnd.entero(1, 99)}-${rnd.entero(1, 99)}`,
    ciudad: lugar.ciudad,
    departamento: lugar.departamento,
  };
}

function documentoUnico(rnd: Aleatorio, min: number, max: number, usados: Set<string>): string {
  for (let intento = 0; intento < 1000; intento++) {
    const documento = String(rnd.entero(min, max));
    if (!usados.has(documento)) {
      usados.add(documento);
      return documento;
    }
  }
  throw new Error("No se pudo generar un documento único.");
}

function nombreUnico(rnd: Aleatorio, usados: Set<string>): string {
  for (let intento = 0; intento < 50; intento++) {
    const nombre = `${rnd.elegir(PREFIJOS)} ${rnd.elegir(NUCLEOS)}`;
    if (!usados.has(nombre)) {
      usados.add(nombre);
      return nombre;
    }
  }
  // The word lists allow ~430 names per company; past that, number the repeats.
  const base = `${rnd.elegir(PREFIJOS)} ${rnd.elegir(NUCLEOS)}`;
  let n = 2;
  while (usados.has(`${base} ${n}`)) n++;
  usados.add(`${base} ${n}`);
  return `${base} ${n}`;
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
