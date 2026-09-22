export const ACTING_BANNER_MAX_RESULTS = 50;

export type ActingBannerUsuario = {
  id: string;
  nombre?: string;
  cargo?: string | null;
  email?: string;
  activo?: boolean;
};

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase();
}

export function formatearNombre(nombre: string): string {
  return nombre.toLowerCase().replace(/(^|\s|\.)\p{L}/gu, (char) => char.toUpperCase());
}

type UsuarioIndexado = {
  usuario: ActingBannerUsuario;
  nombreNorm: string;
  palabrasNombre: string[];
  restoNorm: string;
};

export function indexarUsuarios(usuarios: ActingBannerUsuario[]): UsuarioIndexado[] {
  return usuarios.map((usuario) => {
    const nombreNorm = normalizarTexto(usuario.nombre ?? "");
    return {
      usuario,
      nombreNorm,
      palabrasNombre: nombreNorm.split(/\s+/).filter(Boolean),
      restoNorm: normalizarTexto([usuario.cargo, usuario.email].filter(Boolean).join(" ")),
    };
  });
}

export function filtrarUsuarios(indexados: UsuarioIndexado[], query: string): ActingBannerUsuario[] {
  const q = normalizarTexto(query.trim());
  if (!q) {
    return indexados.slice(0, ACTING_BANNER_MAX_RESULTS).map((item) => item.usuario);
  }

  const tokens = q.split(/\s+/);
  const puntuados: { score: number; item: UsuarioIndexado }[] = [];

  for (const item of indexados) {
    let score = 0;
    let coincideTodo = true;

    for (const token of tokens) {
      if (item.palabrasNombre.some((palabra) => palabra === token)) {
        score += 4;
      } else if (item.palabrasNombre.some((palabra) => palabra.startsWith(token))) {
        score += 3;
      } else if (item.nombreNorm.includes(token)) {
        score += 2;
      } else if (item.restoNorm.includes(token)) {
        score += 1;
      } else {
        coincideTodo = false;
        break;
      }
    }

    if (!coincideTodo) continue;
    if (item.nombreNorm.startsWith(tokens[0] ?? "")) score += 2;
    puntuados.push({ score, item });
  }

  puntuados.sort(
    (left, right) =>
      right.score - left.score || left.item.nombreNorm.localeCompare(right.item.nombreNorm),
  );

  return puntuados.slice(0, ACTING_BANNER_MAX_RESULTS).map((item) => item.item.usuario);
}
