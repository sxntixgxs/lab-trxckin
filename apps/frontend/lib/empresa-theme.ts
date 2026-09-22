export type EmpresaVisualTheme = {
  accentRgb: string;
  bgTop: string;
  bgMiddle: string;
  bgBottom: string;
  accentText: string;
};

/** Matches the `--empresa-*` / `--sidebar-*` defaults declared in `app/css/style.css`. */
export const DEFAULT_EMPRESA_VISUAL_THEME: EmpresaVisualTheme = {
  accentRgb: "99 102 241",
  bgTop: "#0B1020",
  bgMiddle: "#0E1426",
  bgBottom: "#0B1020",
  accentText: "#c7d2fe",
};

export const EMPRESA_VISUAL_THEMES: Record<number, EmpresaVisualTheme> = {
  1: {
    accentRgb: "226 28 33",
    bgTop: "#120B12",
    bgMiddle: "#111426",
    bgBottom: "#0B1020",
    accentText: "#fecaca",
  },
  2: {
    accentRgb: "23 109 63",
    bgTop: "#07130F",
    bgMiddle: "#0B1A18",
    bgBottom: "#0B1020",
    accentText: "#bbf7d0",
  },
  3: {
    accentRgb: "213 73 19",
    bgTop: "#160D08",
    bgMiddle: "#171425",
    bgBottom: "#0B1020",
    accentText: "#fed7aa",
  },
  4: {
    accentRgb: "124 58 237",
    bgTop: "#0F0B1A",
    bgMiddle: "#131126",
    bgBottom: "#0B1020",
    accentText: "#ddd6fe",
  },
};

export function getEmpresaVisualTheme(empresaId: number | null | undefined): EmpresaVisualTheme {
  if (empresaId == null) return DEFAULT_EMPRESA_VISUAL_THEME;
  return EMPRESA_VISUAL_THEMES[empresaId] ?? DEFAULT_EMPRESA_VISUAL_THEME;
}
