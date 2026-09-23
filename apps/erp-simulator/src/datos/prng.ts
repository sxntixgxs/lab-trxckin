/**
 * Small deterministic PRNG (mulberry32): the same seed always yields the same fake ERP data,
 * so demos and docs can rely on it.
 */
export function crearAleatorio(semilla: number) {
  let estado = semilla >>> 0;
  const siguiente = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    siguiente,
    /** Integer in [min, max]. */
    entero: (min: number, max: number) => min + Math.floor(siguiente() * (max - min + 1)),
    elegir: <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)],
    probabilidad: (p: number) => siguiente() < p,
  };
}

export type Aleatorio = ReturnType<typeof crearAleatorio>;

/** Stable 32-bit FNV-1a hash, used to derive one seed per company. */
export function semillaDe(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
