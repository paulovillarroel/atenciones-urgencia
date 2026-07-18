// Colores del gráfico. Los primeros 8 slots usan la paleta categórica validada
// por la skill dataviz (daltonismo-segura en claro/oscuro). Para 9+ series se
// generan colores distintos por rotación de tono (ángulo áureo) en OKLCH, así
// nunca quedan series en gris al comparar muchos elementos.

import type { ClaveSerie, Dimension } from "./types";

export type Tema = "light" | "dark";

const CATEGORICAL_LIGHT = [
  "#2a78d6", // azul
  "#008300", // verde
  "#e87ba4", // magenta
  "#eda100", // amarillo
  "#00a1c4", // cian (antes aqua/verde-azulado: se confundía con el verde)
  "#eb6834", // naranja
  "#4a3aa7", // violeta
  "#e34948", // rojo
];
const CATEGORICAL_DARK = [
  "#3987e5",
  "#008300",
  "#d55181",
  "#c98500",
  "#0fa3c4", // cian (antes verde-azulado)
  "#d95926",
  "#9085e9",
  "#e66767",
];

export interface ChromeChart {
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  surface: string;
}
export const CHROME: Record<Tema, ChromeChart> = {
  light: {
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    surface: "#fcfcfb",
  },
  dark: {
    ink: "#ffffff",
    ink2: "#c3c2b7",
    muted: "#898781",
    grid: "#2c2c2a",
    axis: "#383835",
    surface: "#1a1a19",
  },
};

// OKLCH -> hex sRGB (coeficientes de Björn Ottosson), con recorte al gamut.
function oklchAHex(L: number, C: number, hGrados: number): string {
  const h = (hGrados * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const canal = (x: number) => {
    const c = Math.max(0, Math.min(1, x));
    const g = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(g * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + lin.map(canal).join("");
}

// Color generado para el slot i (>= 8): tono por ángulo áureo, con leve zigzag
// de luminosidad para separar vecinos, ajustado por tema.
function colorGenerado(i: number, tema: Tema): string {
  const hue = (i * 137.508 + (tema === "dark" ? 25 : 10)) % 360;
  const baseL = tema === "dark" ? 0.72 : 0.56;
  const dL = i % 2 === 1 ? (tema === "dark" ? 0.06 : -0.06) : 0;
  return oklchAHex(baseL + dL, 0.15, hue);
}

function colorSlot(i: number, tema: Tema): string {
  const cat = tema === "dark" ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  return i < cat.length ? cat[i] : colorGenerado(i, tema);
}

// Mapa de colores para la dimensión de comparación. El color sigue la posición
// de la serie en el orden mostrado (años: recientes primero; resto: orden
// canónico). Sin grises: más allá de 8 se generan tonos distintos.
export function mapaColoresComparar(
  comparar: Dimension,
  seleccion: ClaveSerie[],
  ordenCanonico: ClaveSerie[],
  tema: Tema,
): Map<ClaveSerie, string> {
  const ordenados =
    comparar === "anio"
      ? [...seleccion].sort((a, b) => Number(b) - Number(a))
      : ordenCanonico.filter((v) => seleccion.includes(v));
  const m = new Map<ClaveSerie, string>();
  ordenados.forEach((v, i) => m.set(v, colorSlot(i, tema)));
  return m;
}
