export const NO_APLICA_SELECT_VALUE = "NO_APLICA";

export const CRITERIOS_COMPRAS = [
  {
    key: "experiencia",
    label: "Experiencia en el mercado",
    max: 30,
    options: [
      { label: "0 a 3 años", value: 15 },
      { label: "+3 a 5 años", value: 25 },
      { label: "+5 años", value: 30 },
    ],
  },
  {
    key: "referencias",
    label: "Referencia comercial",
    max: 30,
    options: [
      { label: "0 referencias", value: 0 },
      { label: "1 referencia", value: 10 },
      { label: "2 referencias", value: 25 },
      { label: "+2 referencias", value: 30 },
    ],
  },
  {
    key: "portfolio",
    label: "Brochure / Portafolio de servicios",
    max: 30,
    options: [
      { label: "NO", value: 10 },
      { label: "SÍ", value: 30 },
    ],
  },
  {
    key: "certificados",
    label: "Certificado de sistemas de gestión",
    max: 30,
    options: [
      { label: "NO", value: 0 },
      { label: "EN PROCESO", value: 10 },
      { label: "SÍ", value: 30 },
    ],
  },
  {
    key: "garantias",
    label: "Garantía del servicio y/o productos",
    max: 30,
    options: [
      { label: "NO", value: 0 },
      { label: "SÍ", value: 30 },
    ],
  },
  {
    key: "fichasTecnicas",
    label: "Protocolos / Fichas técnicas",
    max: 30,
    options: [
      { label: "NO", value: 0 },
      { label: "SÍ", value: 30 },
    ],
  },
  {
    key: "formaPago",
    label: "Forma de pago",
    max: 30,
    options: [
      { label: "<15 días", value: 0 },
      { label: "15 días", value: 10 },
      { label: "30 días", value: 15 },
      { label: "45 días", value: 20 },
      { label: "60 días", value: 25 },
      { label: "90 días", value: 30 },
    ],
  },
  {
    key: "sstAmbiental",
    label: "Requisitos SST y ambientales",
    max: 30,
    options: [
      { label: "0% documentación", value: 0 },
      { label: "50% documentación", value: 10 },
      { label: "70% documentación", value: 25 },
      { label: "100% documentación", value: 30 },
    ],
  },
] as const;

export type CriterioComprasKey = (typeof CRITERIOS_COMPRAS)[number]["key"];
export type ValorCriterioCompras = number | null;
export type SeleccionCriterioCompras = ValorCriterioCompras | undefined;
export type EstadoProveedorCompras = "ACEPTABLE" | "NO ACEPTABLE" | "PROVEEDOR EN RESERVA";

export type SeleccionesEvaluacionCompras = Partial<Record<CriterioComprasKey, ValorCriterioCompras>>;

export type EvaluacionComprasConCriterios = Record<CriterioComprasKey, SeleccionCriterioCompras>;

const PUNTAJE_MAXIMO_POR_CRITERIO = 30;

export function obtenerValoresEvaluacionCompras(evaluacion: EvaluacionComprasConCriterios): SeleccionCriterioCompras[] {
  return CRITERIOS_COMPRAS.map(({ key }) => evaluacion[key]);
}

export function etiquetaValorCriterioCompras(key: CriterioComprasKey, value: ValorCriterioCompras): string {
  if (value === null) return "NO APLICA";

  const criterio = CRITERIOS_COMPRAS.find((item) => item.key === key);
  const option = criterio?.options.find((item) => item.value === value);
  return option?.label ?? String(value);
}

export function calcularEvaluacionCompras(valores: readonly SeleccionCriterioCompras[]) {
  const estaCompleta = valores.every((value) => value !== undefined);
  const valoresAplicables = valores.filter((value): value is number => typeof value === "number");
  const cantidadAplicables = valoresAplicables.length;
  const tieneCriteriosAplicables = cantidadAplicables > 0;
  const puedeCalcular = estaCompleta && tieneCriteriosAplicables;
  const sumaPuntos = valoresAplicables.reduce((total, value) => total + value, 0);
  const maximoPosible = cantidadAplicables * PUNTAJE_MAXIMO_POR_CRITERIO;
  const promedio = tieneCriteriosAplicables ? sumaPuntos / cantidadAplicables : 0;
  const resultadoPorcentaje = puedeCalcular ? Math.round((promedio / PUNTAJE_MAXIMO_POR_CRITERIO) * 100) : 0;
  const resultadoEscala5 = puedeCalcular ? (resultadoPorcentaje / 100) * 5 : 0;
  const calificacionGeneral = Number(resultadoEscala5.toFixed(2));
  const tieneCeroAplicable = valoresAplicables.some((value) => value === 0);

  const proveedorStatus: EstadoProveedorCompras | null = puedeCalcular
    ? tieneCeroAplicable
      ? "PROVEEDOR EN RESERVA"
      : resultadoEscala5 > 3
        ? "ACEPTABLE"
        : "NO ACEPTABLE"
    : null;

  return {
    estaCompleta,
    tieneCriteriosAplicables,
    puedeCalcular,
    cantidadAplicables,
    sumaPuntos,
    maximoPosible,
    promedio,
    resultadoPorcentaje,
    resultadoEscala5,
    calificacionGeneral,
    tieneCeroAplicable,
    isAprobado: proveedorStatus === "ACEPTABLE",
    proveedorStatus,
  };
}
