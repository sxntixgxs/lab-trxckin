/**
 * Texto de declaraciones y tratamiento de datos para el formulario de inscripción de clientes.
 * Usado en la UI del formulario público y en el PDF.
 */
import { FINALIDADES_TRATAMIENTO, type EmpresaDeclaraciones } from "./suppliers";

export const CUSTOMER_DECLARACIONES = (empresa: EmpresaDeclaraciones) => ({
  ORIGEN_FONDOS: {
    titulo: "DECLARACIÓN DE ORIGEN DE FONDOS",
    subtitulo: "SE DECLARA EXPRESAMENTE QUE:",
    puntos: [
      "La actividad económica que desarrolla el suscrito es lícita y se realiza dentro del marco legal aplicable.",
      "Los recursos que conforman el patrimonio del suscrito provienen de actividades que no se encuentran tipificadas como ilícitas en el Código Penal Colombiano.",
      `La información suministrada en el presente documento es verídica, susceptible de ser verificada, y se compromete a actualizarla anualmente o cada vez que ${empresa.nombre} lo solicite, durante la vigencia de la relación comercial.`,
      `No existe conflicto de interés con ${empresa.nombre} en la actualidad, y en caso de presentarse con posterioridad, se compromete a reportarlo de forma debida para mantener relaciones comerciales éticas y morales.`,
      "Los fondos derivados del contrato no serán utilizados para financiar el terrorismo, la proliferación de armas de destrucción masiva ni ninguna otra actividad ilícita.",
      "Se compromete a adoptar, implementar y hacer efectivas las medidas de control tendientes a prevenir y controlar que los recursos o actividades en las que participe contribuyan al lavado de activos, financiación del terrorismo o proliferación de armas de destrucción masiva.",
      `Cualquier ocultamiento, omisión de información, falsedad o engaño en la información comercial suministrada, de ser detectado por ${empresa.nombre}, dará lugar a la terminación de la relación sin indemnización alguna.`,
    ],
  },
  ACTUALIZACION: {
    titulo: "ACTUALIZACIÓN DE LA INFORMACIÓN",
    texto: `EL CLIENTE se obliga a informar y a actualizar, por escrito y oportunamente durante la relación comercial con ${empresa.nombre}, cualquier cambio que se genere de la composición accionaria o Representante Legal, así como a actualizar la información suministrada con una periodicidad como mínimo anual, de conformidad con las normas legales y las circulares de la Superintendencia de Sociedades.`,
  },
  TRATAMIENTO_DATOS: {
    titulo: "TRATAMIENTO DE DATOS",
    declaracion: `Declaro que he sido informado que ${empresa.nombre}, con NIT ${empresa.nit}, es el responsable del tratamiento de los datos personales obtenidos y que he leído las Políticas de Tratamiento de Datos Personales${empresa.web ? ` disponibles en el sitio web ${empresa.web}` : ""}.`,
    consentimiento:
      "Por ello, consiento y autorizo de manera previa, expresa e inequívoca que mis datos personales sean tratados con sujeción a lo establecido en sus Políticas de Protección de Datos Personales atendiendo a las finalidades en ellas señaladas, entre las que se encuentran:",
    finalidades: FINALIDADES_TRATAMIENTO,
    derechos: `Como Titular de información tengo derecho a conocer, actualizar y rectificar mis datos personales, solicitar prueba de la autorización otorgada para su tratamiento, ser informado sobre el uso que se ha dado a los mismos, presentar quejas ante la SIC por infracción a la ley, revocar la autorización y/o solicitar la supresión de mis datos en los casos en que sea procedente y acceder en forma gratuita a los mismos${empresa.emailProteccionDatos ? ` mediante solicitud por escrito dirigida al correo ${empresa.emailProteccionDatos}` : ""}.`,
  },
});

export type CustomerDeclaraciones = ReturnType<typeof CUSTOMER_DECLARACIONES>;
