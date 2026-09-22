import type ExcelJS from "exceljs";
import type { MatrizRiesgoReporteRow } from "@/convex/lib/onboarding/suppliersMatrizRiesgoReporte";
import { getEmpresaNombre } from "@/lib/empresas";

export const MATRIZ_RIESGO_SHEET_NAME = "Matriz de riesgo";
export const DICCIONARIO_SHEET_NAME = "Diccionario";

export const MATRIZ_RIESGO_HEADERS = [
  "ID_PROCESO",
  "EMPRESA_ID",
  "EMPRESA",
  "FECHA_INICIO_PROCESO",
  "TIPO_SOLICITUD",
  "ESTADO_PROCESO",
  "PROVEEDOR",
  "TIPO_PERSONA",
  "TIPO_DOCUMENTO",
  "NIT",
  "PRODUCTO_SERVICIO",
  "CIIU_PRINCIPAL",
  "ACTIVIDAD_ECONOMICA_PRINCIPAL",
  "CIIU_SECUNDARIO",
  "ACTIVIDAD_ECONOMICA_SECUNDARIA",
  "MONTO_ANUAL_RESPUESTA",
  "MONTO_ANUAL_PUNTAJE",
  "MONTO_ANUAL_NIVEL",
  "SECTOR_ECONOMICO_RESPUESTA",
  "SECTOR_ECONOMICO_PUNTAJE",
  "SECTOR_ECONOMICO_NIVEL",
  "JURISDICCION_NACIONAL_RESPUESTA",
  "JURISDICCION_NACIONAL_PUNTAJE",
  "JURISDICCION_NACIONAL_NIVEL",
  "JURISDICCION_INTERNACIONAL_RESPUESTA",
  "JURISDICCION_INTERNACIONAL_PUNTAJE",
  "JURISDICCION_INTERNACIONAL_NIVEL",
  "PEP_RESPUESTA",
  "PEP_PUNTAJE",
  "PEP_NIVEL",
  "LISTAS_RESTRICTIVAS_RESPUESTA",
  "LISTAS_RESTRICTIVAS_PUNTAJE",
  "LISTAS_RESTRICTIVAS_NIVEL",
  "RIESGO_GLOBAL_PUNTAJE",
  "RIESGO_GLOBAL_NIVEL",
  "TIPO_EVALUACION",
] as const;

export function getEmpresaLabelForExport(empresaId: number): string {
  return getEmpresaNombre(empresaId);
}

function rowToFlatValues(row: MatrizRiesgoReporteRow): Array<string | number | Date | null> {
  return [
    row.inscripcionId,
    row.empresaId,
    getEmpresaLabelForExport(row.empresaId),
    new Date(row.fechaInicioProceso),
    row.tipoSolicitud,
    row.estadoProceso ?? "",
    row.proveedor,
    row.tipoPersona,
    row.tipoDocumento,
    row.nit,
    row.productoServicio,
    row.ciiuPrincipal,
    row.actividadEconomicaPrincipal,
    row.ciiuSecundario,
    row.actividadEconomicaSecundaria,
    row.montoAnual.respuesta,
    row.montoAnual.puntaje,
    row.montoAnual.nivel,
    row.sectorEconomico.respuesta,
    row.sectorEconomico.puntaje,
    row.sectorEconomico.nivel,
    row.jurisdiccionNacional.respuesta,
    row.jurisdiccionNacional.puntaje,
    row.jurisdiccionNacional.nivel,
    row.jurisdiccionInternacional.respuesta,
    row.jurisdiccionInternacional.puntaje,
    row.jurisdiccionInternacional.nivel,
    row.pep.respuesta,
    row.pep.puntaje,
    row.pep.nivel,
    row.listasRestrictivas.respuesta,
    row.listasRestrictivas.puntaje,
    row.listasRestrictivas.nivel,
    row.riesgoGlobalPuntaje,
    row.riesgoGlobalNivel,
    row.tipoEvaluacion,
  ];
}

const PUNTAJE_COLUMN_INDEXES = new Set([17, 20, 23, 26, 29, 32, 34]);
const FECHA_COLUMN_INDEX = 4;

export const DICCIONARIO_ROWS: Array<[string, string, string, string, string, string]> = [
  ["ID_PROCESO", "inscripcionId", "Identificador único del proceso.", "texto", "Id de la inscripción", "Obligatorio"],
  ["EMPRESA_ID", "empresaId", "Identificador numérico de la empresa del proceso.", "número", "Según catálogo de empresas", "Obligatorio"],
  ["EMPRESA", "empresaNombre", "Nombre legible de la empresa.", "texto", "Catálogo de empresas", "Obligatorio"],
  ["FECHA_INICIO_PROCESO", "fechaInicioProceso", "Momento de creación del proceso.", "fecha/hora", "America/Bogota", "Obligatorio"],
  ["TIPO_SOLICITUD", "tipoSolicitud", "Inscripción o actualización.", "texto", "INSCRIPCIÓN | ACTUALIZACIÓN", "Obligatorio"],
  ["ESTADO_PROCESO", "estadoProceso", "Fase o estado terminal vigente.", "texto", "Fases I–VI, COMPLETADO, RECHAZADO, ANULADA", "Obligatorio"],
  ["PROVEEDOR", "proveedor", "Razón social del proveedor.", "texto", "Texto libre", "Obligatorio"],
  ["TIPO_PERSONA", "tipoPersona", "Natural o jurídica.", "texto", "Natural | Jurídica", "Obligatorio"],
  ["TIPO_DOCUMENTO", "tipoDocumento", "Tipo de documento.", "texto", "C.C., NIT, P.A., C.E", "Obligatorio"],
  ["NIT", "nit", "Número de identificación tributaria o documento.", "texto", "Texto", "Respaldo en datos_generales_01"],
  ["PRODUCTO_SERVICIO", "productoServicio", "Servicio o producto suministrado.", "texto", "Texto libre", "Desde matriz_00"],
  ["CIIU_PRINCIPAL", "ciiuPrincipal", "Código CIIU principal.", "texto", "Código CIIU", "Desde actividadPrincipal_02"],
  ["ACTIVIDAD_ECONOMICA_PRINCIPAL", "actividadEconomicaPrincipal", "Descripción actividad principal.", "texto", "Texto libre", "Desde matriz_00"],
  ["CIIU_SECUNDARIO", "ciiuSecundario", "Código CIIU secundario.", "texto", "Código CIIU", "Puede estar vacío"],
  ["ACTIVIDAD_ECONOMICA_SECUNDARIA", "actividadEconomicaSecundaria", "Descripción actividad secundaria.", "texto", "Texto libre", "Puede estar vacío"],
  ["MONTO_ANUAL_RESPUESTA", "montoAnual.respuesta", "Respuesta del factor monto anual.", "texto", "Opciones de matriz", "Conserva respuesta original"],
  ["MONTO_ANUAL_PUNTAJE", "montoAnual.puntaje", "Puntaje recalculado del factor.", "número", "1–4", "Vacío si INDEFINIDO"],
  ["MONTO_ANUAL_NIVEL", "montoAnual.nivel", "Nivel del factor monto.", "texto", "BAJO|MEDIO|ALTO|SUPERIOR|INDEFINIDO", "INDEFINIDO si sin puntaje"],
  ["SECTOR_ECONOMICO_RESPUESTA", "sectorEconomico.respuesta", "Respuesta sector económico.", "texto", "Opciones de matriz", "Conserva respuesta original"],
  ["SECTOR_ECONOMICO_PUNTAJE", "sectorEconomico.puntaje", "Puntaje sector.", "número", "1–4", "Vacío si INDEFINIDO"],
  ["SECTOR_ECONOMICO_NIVEL", "sectorEconomico.nivel", "Nivel sector.", "texto", "BAJO|MEDIO|ALTO|SUPERIOR|INDEFINIDO", "INDEFINIDO si sin puntaje"],
  ["JURISDICCION_NACIONAL_RESPUESTA", "jurisdiccionNacional.respuesta", "Departamento colombiano.", "texto", "Lista de departamentos", "Conserva respuesta original"],
  ["JURISDICCION_NACIONAL_PUNTAJE", "jurisdiccionNacional.puntaje", "Puntaje jurisdicción nacional.", "número", "1–4", "Vacío si INDEFINIDO"],
  ["JURISDICCION_NACIONAL_NIVEL", "jurisdiccionNacional.nivel", "Nivel jurisdicción nacional.", "texto", "BAJO|MEDIO|ALTO|SUPERIOR|INDEFINIDO", "INDEFINIDO si sin puntaje"],
  ["JURISDICCION_INTERNACIONAL_RESPUESTA", "jurisdiccionInternacional.respuesta", "País de jurisdicción internacional.", "texto", "Lista de países", "Conserva respuesta original"],
  ["JURISDICCION_INTERNACIONAL_PUNTAJE", "jurisdiccionInternacional.puntaje", "Puntaje jurisdicción internacional.", "número", "1–4", "Vacío si INDEFINIDO"],
  ["JURISDICCION_INTERNACIONAL_NIVEL", "jurisdiccionInternacional.nivel", "Nivel jurisdicción internacional.", "texto", "BAJO|MEDIO|ALTO|SUPERIOR|INDEFINIDO", "INDEFINIDO si sin puntaje"],
  ["PEP_RESPUESTA", "pep.respuesta", "Persona expuesta políticamente.", "texto", "SÍ | NO", "Normalizado desde isPep"],
  ["PEP_PUNTAJE", "pep.puntaje", "Puntaje PEP.", "número", "1=NO, 4=SÍ", "Vacío si INDEFINIDO"],
  ["PEP_NIVEL", "pep.nivel", "Nivel PEP.", "texto", "BAJO|MEDIO|ALTO|SUPERIOR|INDEFINIDO", "INDEFINIDO si sin puntaje"],
  ["LISTAS_RESTRICTIVAS_RESPUESTA", "listasRestrictivas.respuesta", "Coincidencia en listas restrictivas.", "texto", "SÍ | NO", "Desde matriz vigente"],
  ["LISTAS_RESTRICTIVAS_PUNTAJE", "listasRestrictivas.puntaje", "Puntaje listas.", "número", "1=NO, 4=SÍ", "Vacío si INDEFINIDO"],
  ["LISTAS_RESTRICTIVAS_NIVEL", "listasRestrictivas.nivel", "Nivel listas.", "texto", "BAJO|MEDIO|ALTO|SUPERIOR|INDEFINIDO", "INDEFINIDO si sin puntaje"],
  ["RIESGO_GLOBAL_PUNTAJE", "riesgoGlobalPuntaje", "Máximo de los seis factores.", "número", "1–4", "Vacío si todos indefinidos"],
  ["RIESGO_GLOBAL_NIVEL", "riesgoGlobalNivel", "Nivel global recalculado.", "texto", "BAJO|MEDIO|ALTO|SUPERIOR|INDEFINIDO", "1/BAJO, 2/MEDIO, 3/ALTO, 4/SUPERIOR"],
  ["TIPO_EVALUACION", "tipoEvaluacion", "Tipo de evaluación derivado del riesgo global.", "texto", "INTENSIFICADA|COMPLETA|SIMPLIFICADA|SOLO LISTAS|INDEFINIDO", "Recalculado al exportar"],
];

/** Two sheets: the flat matrix (native dates and numbers) and a data dictionary. */
export function buildMatrizRiesgoWorkbook(ExcelJSModule: typeof ExcelJS, rows: MatrizRiesgoReporteRow[], creator = "Onboarding de proveedores"): ExcelJS.Workbook {
  const wb = new ExcelJSModule.Workbook();
  wb.creator = creator;
  wb.created = new Date();

  const ws = wb.addWorksheet(MATRIZ_RIESGO_SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...MATRIZ_RIESGO_HEADERS]);
  ws.getRow(1).font = { bold: true };

  const flatRows = rows.map(rowToFlatValues);
  for (const values of flatRows) {
    const excelRow = ws.addRow(values);
    excelRow.getCell(FECHA_COLUMN_INDEX).numFmt = "dd/mm/yyyy hh:mm";
    values.forEach((value, index) => {
      const colIndex = index + 1;
      if (PUNTAJE_COLUMN_INDEXES.has(colIndex) && (value === null || value === undefined)) {
        excelRow.getCell(colIndex).value = null;
      }
    });
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: MATRIZ_RIESGO_HEADERS.length } };

  ws.columns = MATRIZ_RIESGO_HEADERS.map((header, index) => {
    const maxLen = Math.max(
      header.length,
      ...flatRows.map((values) => {
        const val = values[index];
        if (val instanceof Date) return 18;
        if (val == null) return 0;
        return String(val).length;
      }),
    );
    return { width: Math.min(Math.max(maxLen + 2, 12), 48) };
  });

  const dict = wb.addWorksheet(DICCIONARIO_SHEET_NAME);
  dict.addRow(["COLUMNA", "CLAVE_TECNICA", "DESCRIPCION", "TIPO_DATO", "VALORES_PERMITIDOS", "REGLA_VACIO"]);
  dict.getRow(1).font = { bold: true };
  for (const entry of DICCIONARIO_ROWS) dict.addRow(entry);
  dict.columns = [{ width: 36 }, { width: 28 }, { width: 42 }, { width: 14 }, { width: 40 }, { width: 28 }];

  return wb;
}
