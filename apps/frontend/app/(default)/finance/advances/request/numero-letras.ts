const unidades = [
  "",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidós",
  "veintitrés",
  "veinticuatro",
  "veinticinco",
  "veintiséis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
];

const decenas: Record<number, string> = {
  30: "treinta",
  40: "cuarenta",
  50: "cincuenta",
  60: "sesenta",
  70: "setenta",
  80: "ochenta",
  90: "noventa",
};

const centenas: Record<number, string> = {
  100: "cien",
  200: "doscientos",
  300: "trescientos",
  400: "cuatrocientos",
  500: "quinientos",
  600: "seiscientos",
  700: "setecientos",
  800: "ochocientos",
  900: "novecientos",
};

function menorAMil(numero: number): string {
  if (numero === 0) return "";
  if (numero < 30) return unidades[numero];
  if (numero < 100) {
    const decena = Math.floor(numero / 10) * 10;
    const unidad = numero % 10;
    return unidad === 0
      ? decenas[decena]
      : `${decenas[decena]} y ${unidades[unidad]}`;
  }
  if (numero === 100) return "cien";
  const centena = Math.floor(numero / 100) * 100;
  const resto = numero % 100;
  const prefijo =
    centenas[centena] ?? `${unidades[Math.floor(numero / 100)]}cientos`;
  return resto === 0 ? prefijo : `${prefijo} ${menorAMil(resto)}`;
}

function numeroALetrasBase(numero: number): string {
  if (numero < 1000) return menorAMil(numero);
  const miles = Math.floor(numero / 1000);
  const resto = numero % 1000;
  return `${miles === 1 ? "mil" : `${menorAMil(miles)} mil`}${resto ? ` ${menorAMil(resto)}` : ""}`;
}

export function numeroALetras(numero: number): string {
  const entero = Math.floor(Math.abs(numero));
  if (!entero) return "cero pesos";

  const millones = Math.floor(entero / 1_000_000);
  const miles = Math.floor((entero % 1_000_000) / 1_000);
  const resto = entero % 1_000;
  const partes: string[] = [];

  if (millones > 0) {
    partes.push(
      millones === 1 ? "un millón" : `${numeroALetrasBase(millones)} millones`
    );
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${numeroALetrasBase(miles)} mil`);
  }
  if (resto > 0) {
    partes.push(numeroALetrasBase(resto));
  }

  return `${partes.join(" ")} pesos`.toUpperCase();
}
