"use client";

import { useEffect } from "react";
import { getEmpresaVisualTheme } from "@/lib/empresa-theme";
import { useEmpresaStore } from "@/store/empresa-store";

/** Writes the active company's accent colors to the `--empresa-*` CSS variables on `<html>`. */
export function EmpresaThemeVars() {
  const empresaActiva = useEmpresaStore((state) => state.empresaActiva);

  useEffect(() => {
    const theme = getEmpresaVisualTheme(empresaActiva);
    const root = document.documentElement;

    root.style.setProperty("--empresa-accent-rgb", theme.accentRgb);
    root.style.setProperty("--empresa-bg-top", theme.bgTop);
    root.style.setProperty("--empresa-bg-middle", theme.bgMiddle);
    root.style.setProperty("--empresa-bg-bottom", theme.bgBottom);
    root.style.setProperty("--empresa-accent-text", theme.accentText);
  }, [empresaActiva]);

  return null;
}
