// ============================================================
// Constantes compartidas por las matrices de riesgo de
// proveedores y clientes (jurisdicciones, PEP, listas, escala).
// ============================================================

export type RiesgoNivel = "BAJO" | "MEDIO" | "ALTO" | "SUPERIOR" | "INDEFINIDO";
export type TipoEvaluacion = "SOLO LISTAS" | "SIMPLIFICADA" | "COMPLETA" | "INTENSIFICADA" | "INDEFINIDO";
export type TipoPersona = "PERSONA_NATURAL" | "PERSONA_JURIDICA";
export type TipoDocumento = "C.C." | "NIT" | "P.A." | "C.E";

export const TIPO_DOCUMENTO_OPTIONS = ["C.C.", "NIT", "P.A.", "C.E"] as const;
export const TIPO_PERSONA_OPTIONS = ["PERSONA_NATURAL", "PERSONA_JURIDICA"] as const;
export const LISTAS_OPTIONS = ["SÍ", "NO"] as const;
export const RIESGO_NIVELES = ["BAJO", "MEDIO", "ALTO", "SUPERIOR"] as const;
export const TIPOS_EVALUACION = ["SOLO LISTAS", "SIMPLIFICADA", "COMPLETA", "INTENSIFICADA"] as const;

export const TIPO_PERSONA_LABELS: Record<string, string> = {
  PERSONA_NATURAL: "Natural",
  PERSONA_JURIDICA: "Jurídica",
};

export const PEP_RISK_MATRIX: Record<string, number> = { "SÍ": 4, "NO": 1 };
export const LISTAS_RISK_MATRIX: Record<string, number> = { "SÍ": 4, "NO": 1 };

export const GENERAL_RISK_MATRIX: Record<number, RiesgoNivel> = {
  1: "BAJO",
  2: "MEDIO",
  3: "ALTO",
  4: "SUPERIOR",
};

export const TIPO_EVALUACION_MATRIX: Record<string, TipoEvaluacion> = {
  SUPERIOR: "INTENSIFICADA",
  ALTO: "COMPLETA",
  MEDIO: "SIMPLIFICADA",
  BAJO: "SOLO LISTAS",
};

export const RIESGO_SCORE: Record<RiesgoNivel, number> = {
  INDEFINIDO: 0,
  BAJO: 1,
  MEDIO: 2,
  ALTO: 3,
  SUPERIOR: 4,
};

export function scoreToNivel(score: number): RiesgoNivel {
  if (score <= 0) return "INDEFINIDO";
  return GENERAL_RISK_MATRIX[score] ?? "INDEFINIDO";
}

export const JURISDICCION_NACIONAL_OPTIONS = [
  "Amazonas", "Antioquia", "Arauca", "Atlántico", "Bolívar", "Boyacá",
  "Caldas", "Caquetá", "Casanare", "Cauca", "Cesar", "Chocó", "Córdoba",
  "Cundinamarca", "Guainía", "Guaviare", "Huila", "La Guajira", "Magdalena",
  "Meta", "Nariño", "Norte de Santander", "Putumayo", "Quindío", "Risaralda",
  "San Andrés y Providencia", "Santander", "Sucre", "Tolima",
  "Valle del Cauca", "Vaupés", "Vichada",
] as const;

export const JURISDICCION_NACIONAL_RISK_MATRIX: Record<string, number> = {
  "Amazonas": 4,
  "Antioquia": 3,
  "Arauca": 4,
  "Atlántico": 2,
  "Bolívar": 3,
  "Boyacá": 1,
  "Caldas": 1,
  "Caquetá": 4,
  "Casanare": 2,
  "Cauca": 4,
  "Cesar": 3,
  "Chocó": 4,
  "Córdoba": 3,
  "Cundinamarca": 1,
  "Guainía": 4,
  "Guaviare": 4,
  "Huila": 2,
  "La Guajira": 4,
  "Magdalena": 3,
  "Meta": 2,
  "Nariño": 4,
  "Norte de Santander": 4,
  "Putumayo": 4,
  "Quindío": 1,
  "Risaralda": 1,
  "San Andrés y Providencia": 3,
  "Santander": 1,
  "Sucre": 3,
  "Tolima": 2,
  "Valle del Cauca": 3,
  "Vaupés": 3,
  "Vichada": 4,
};

export const JURISDICCION_INTERNACIONAL_OPTIONS = [
  "Afghanistan", "Albania", "Algeria", "Angola", "Argentina", "Armenia",
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh",
  "Barbados", "Belarus", "Belgium", "Benin", "Bhutan", "Bolivia",
  "Bosnia and Herzegovina", "Botswana", "Brazil", "Bulgaria", "Burkina Faso",
  "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada",
  "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros",
  "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia",
  "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Estonia", "Ethiopia", "Fiji",
  "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana",
  "Greece", "Grenada", "Guatemala", "Guinea", "Guinea Bissau", "Guyana",
  "Haiti", "Honduras", "Hong Kong", "Hungary", "Iceland", "India",
  "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica",
  "Japan", "Jordan", "Kazakhstan", "Kenya", "Korea, North", "Korea, South",
  "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho",
  "Liberia", "Libya", "Lithuania", "Luxembourg", "Madagascar", "Malawi",
  "Malaysia", "Maldives", "Mali", "Malta", "Mauritania", "Mauritius",
  "Mexico", "Moldova", "Mongolia", "Montenegro", "Morocco", "Mozambique",
  "Myanmar", "Namibia", "Nepal", "Netherlands", "New Zealand", "Nicaragua",
  "Niger", "Nigeria", "North Macedonia", "Norway", "Oman", "Pakistan",
  "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland",
  "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Lucia",
  "Saint Vincent and the Grenadines", "San Marino",
  "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles",
  "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands",
  "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan",
  "Suriname", "Sweden", "Switzerland", "Syria", "Tajikistan", "Taiwan",
  "Tanzania", "Thailand", "Timor-Leste", "Togo", "Trinidad and Tobago",
  "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States of America",
  "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela", "Vietnam", "Yemen",
  "Zambia", "Zimbabwe",
] as const;

// Mapeo de bandas CPI 2023 a la escala 1-4 de la matriz:
//   Muy Alto (CPI < 20)  → 4   (cap de la escala; la banda original es 5)
//   Alto (CPI 20-39)     → 4
//   Medio-Alto (40-59)   → 3
//   Medio-Bajo (60-79)   → 2
//   Bajo (CPI ≥ 80)      → 1
export const JURISDICCION_INTERNACIONAL_RISK_MATRIX: Record<string, number> = {
  // Muy Alto (clamped to 4)
  "Somalia": 4, "South Sudan": 4, "Venezuela": 4, "Yemen": 4, "Libya": 4,
  "Eritrea": 4, "Nicaragua": 4, "Sudan": 4, "Syria": 4, "Equatorial Guinea": 4,
  "Korea, North": 4, "Haiti": 4, "Afghanistan": 4, "Myanmar": 4,
  "Turkmenistan": 4, "Burundi": 4, "Tajikistan": 4, "Comoros": 4,
  "Democratic Republic of the Congo": 4, "Cambodia": 4,
  // Alto
  "Guinea Bissau": 4, "Mozambique": 4, "Chad": 4, "Honduras": 4, "Zimbabwe": 4,
  "Russia": 4, "Congo": 4, "Iran": 4, "Lebanon": 4, "Eswatini": 4,
  "Bangladesh": 4, "Central African Republic": 4, "Paraguay": 4,
  "Madagascar": 4, "Uganda": 4, "Guatemala": 4, "Nigeria": 4, "Guinea": 4,
  "Kyrgyzstan": 4, "Cameroon": 4, "Papua New Guinea": 4, "Mexico": 4,
  "Iraq": 4, "Liberia": 4, "Mali": 4, "Bolivia": 4, "Pakistan": 4, "Gabon": 4,
  "Azerbaijan": 4, "Mauritania": 4, "Kenya": 4, "Peru": 4, "Egypt": 4,
  "Djibouti": 4, "Niger": 4, "Mongolia": 4, "Uzbekistan": 4, "Turkey": 4,
  "Belarus": 4, "El Salvador": 4, "Togo": 4, "Angola": 4, "Philippines": 4,
  "Ecuador": 4, "Panama": 4, "Thailand": 4, "Serbia": 4, "Laos": 4,
  "Indonesia": 4, "Malawi": 4, "Bosnia and Herzegovina": 4, "Nepal": 4,
  "Sierra Leone": 4, "Algeria": 4, "Sri Lanka": 4, "Brazil": 4, "Ukraine": 4,
  "Argentina": 4, "Dominican Republic": 4, "Gambia": 4, "Zambia": 4,
  "Lesotho": 4, "Colombia": 4, "Ethiopia": 4, "Kazakhstan": 4, "Suriname": 4,
  "Albania": 4, "Morocco": 4, "India": 4, "Maldives": 4, "Tunisia": 4,
  // Medio-Alto
  "Guyana": 3, "Tanzania": 3, "Burkina Faso": 3, "Cuba": 3, "Hungary": 3,
  "North Macedonia": 3, "Bulgaria": 3, "South Africa": 3, "Vietnam": 3,
  "Trinidad and Tobago": 3, "Moldova": 3, "Kosovo": 3, "China": 3, "Ghana": 3,
  "Solomon Islands": 3, "Timor-Leste": 3, "Jamaica": 3, "Benin": 3,
  "Sao Tome and Principe": 3, "Romania": 3, "Senegal": 3, "Kuwait": 3,
  "Montenegro": 3, "Armenia": 3, "Namibia": 3, "Vanuatu": 3, "Croatia": 3,
  "Mauritius": 3, "Slovakia": 3, "Malta": 3, "Bahrain": 3, "Jordan": 3,
  "Greece": 3, "Georgia": 3, "Oman": 3, "Malaysia": 3, "Poland": 3, "Italy": 3,
  "Fiji": 3, "Cyprus": 3, "Spain": 3, "Grenada": 3, "Costa Rica": 3,
  "Portugal": 3, "Saudi Arabia": 3, "Rwanda": 3, "Slovenia": 3, "Qatar": 3,
  "Botswana": 3, "Saint Lucia": 3, "Czechia": 3,
  // Medio-Bajo
  "Dominica": 2, "Latvia": 2, "Israel": 2, "Cabo Verde": 2,
  "Saint Vincent and the Grenadines": 2, "Korea, South": 2, "Chile": 2,
  "Bahamas": 2, "United States of America": 2, "Lithuania": 2, "France": 2,
  "Taiwan": 2, "Barbados": 2, "Seychelles": 2, "United Arab Emirates": 2,
  "Austria": 2, "Belgium": 2, "United Kingdom": 2, "Bhutan": 2, "Japan": 2,
  "Uruguay": 2, "Canada": 2, "Australia": 2, "Hong Kong": 2, "Estonia": 2,
  "Ireland": 2, "Iceland": 2, "Germany": 2, "Luxembourg": 2, "Netherlands": 2,
  // Bajo
  "Sweden": 1, "Switzerland": 1, "Norway": 1, "New Zealand": 1, "Singapore": 1,
  "Finland": 1, "Denmark": 1,
};
