// Colores del gráfico. Paleta categórica validada por la skill dataviz
// (para líneas pasa las verificaciones de daltonismo en claro y oscuro).

import type { ClaveSerie, Dimension } from "./types";

export type Tema = "light" | "dark";

const CATEGORICAL_LIGHT = [
  "#2a78d6", // azul
  "#008300", // verde
  "#e87ba4", // magenta
  "#eda100", // amarillo
  "#1baf7a", // aqua
  "#eb6834", // naranja
  "#4a3aa7", // violeta
  "#e34948", // rojo
];
const CATEGORICAL_DARK = [
  "#3987e5",
  "#008300",
  "#d55181",
  "#c98500",
  "#199e70",
  "#d95926",
  "#9085e9",
  "#e66767",
];
const GRIS = "#898781"; // historia profunda (contexto), igual en ambos temas

// Chrome del gráfico por tema (coincide con los tokens de globals.css).
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

// Mapa estable año -> color, por IDENTIDAD del año (no por la selección):
// el año más reciente toma el slot 1; hacia atrás, slots 2..8; la historia
// más profunda va en gris de contexto. Así, activar o desactivar un año no
// repinta a los demás (regla de la skill: el color sigue a la entidad).
export function mapaColoresAnios(
  aniosDominio: number[],
  tema: Tema,
): Map<number, string> {
  const cat = tema === "dark" ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  const desc = [...aniosDominio].sort((a, b) => b - a); // reciente primero
  const m = new Map<number, string>();
  desc.forEach((anio, i) => m.set(anio, i < cat.length ? cat[i] : GRIS));
  return m;
}

// Un año es "de contexto" (gris) si quedó fuera de los slots categóricos.
export function esColorContexto(color: string): boolean {
  return color === GRIS;
}

// Mapa de colores genérico para cualquier dimensión de comparación.
// - Años: mapa estable por identidad del año (reciente = azul, historia = gris).
// - Otras dimensiones: color por posición en el orden canónico de la selección
//   (slots categóricos y, más allá de 8, gris).
export function mapaColoresComparar(
  comparar: Dimension,
  seleccion: ClaveSerie[],
  ordenCanonico: ClaveSerie[],
  aniosDominio: number[],
  tema: Tema,
): Map<ClaveSerie, string> {
  if (comparar === "anio") {
    return mapaColoresAnios(aniosDominio, tema) as Map<ClaveSerie, string>;
  }
  const cat = tema === "dark" ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  const sel = new Set(seleccion);
  const m = new Map<ClaveSerie, string>();
  ordenCanonico
    .filter((v) => sel.has(v))
    .forEach((v, i) => m.set(v, i < cat.length ? cat[i] : GRIS));
  return m;
}
