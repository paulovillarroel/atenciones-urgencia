import type {
  ClaveSerie,
  Dimension,
  Lookups,
  Meta,
  MetricKey,
} from "./types";

export const DIMENSIONES: {
  key: Dimension;
  label: string; // singular (para el contexto)
  plural: string; // para el selector "Comparar por"
}[] = [
  { key: "anio", label: "Año", plural: "Años" },
  { key: "causa", label: "Causa", plural: "Causas" },
  { key: "edad", label: "Grupo etario", plural: "Grupos etarios" },
  { key: "region", label: "Región", plural: "Regiones" },
  { key: "servicio", label: "Servicio de salud", plural: "Servicios" },
];

export function pluralDe(dim: Dimension): string {
  return DIMENSIONES.find((d) => d.key === dim)?.plural ?? dim;
}

// Valores posibles de una dimensión, en orden canónico.
export function opcionesDe(
  dim: Dimension,
  lookups: Lookups,
  meta: Meta,
): { clave: ClaveSerie; label: string }[] {
  switch (dim) {
    case "anio":
      return meta.anios.map((a) => ({ clave: a, label: String(a) }));
    case "causa":
      return lookups.causas.map((c) => ({ clave: c.orden, label: c.label }));
    case "edad":
      return meta.gruposEtarios
        .filter((g) => g.key !== "total")
        .map((g) => ({ clave: g.key, label: g.label }));
    case "region":
      return lookups.regiones.map((r) => ({ clave: r.codigo, label: r.nombre }));
    case "servicio":
      return lookups.servicios.map((s) => ({
        clave: s.codigo,
        label: s.nombre,
      }));
  }
}

// Etiqueta y bandera "año en curso" de una clave de serie.
export function describir(
  dim: Dimension,
  clave: ClaveSerie,
  lookups: Lookups,
  meta: Meta,
): { label: string; esActual: boolean } {
  switch (dim) {
    case "anio":
      return { label: String(clave), esActual: clave === meta.anioActual };
    case "causa":
      return {
        label: lookups.causas.find((c) => c.orden === clave)?.label ?? String(clave),
        esActual: false,
      };
    case "edad":
      return {
        label: meta.gruposEtarios.find((g) => g.key === clave)?.label ?? String(clave),
        esActual: false,
      };
    case "region":
      return {
        label: lookups.regiones.find((r) => r.codigo === clave)?.nombre ?? String(clave),
        esActual: false,
      };
    case "servicio":
      return {
        label: lookups.servicios.find((s) => s.codigo === clave)?.nombre ?? String(clave),
        esActual: false,
      };
  }
}

// Selección múltiple por defecto al elegir una dimensión de comparación.
export function multiPorDefecto(
  dim: Dimension,
  lookups: Lookups,
  meta: Meta,
): ClaveSerie[] {
  switch (dim) {
    case "anio":
      return meta.anios.slice(-5);
    case "causa":
      return [4, 6, 7, 8].filter((o) => lookups.causas.some((c) => c.orden === o));
    case "edad":
      return meta.gruposEtarios
        .filter((g) => g.key !== "total")
        .map((g) => g.key);
    case "region":
      return [13, 5, 8].filter((c) => lookups.regiones.some((r) => r.codigo === c));
    case "servicio":
      return lookups.servicios.slice(0, 3).map((s) => s.codigo);
  }
}

// Resumen de contexto (dimensiones fijas) para mostrar bajo el título.
export function contexto(
  filtros: {
    comparar: Dimension;
    anio: number;
    causa: number;
    region: number | null;
    servicio: number | null;
    edad: MetricKey;
  },
  lookups: Lookups,
  meta: Meta,
): string[] {
  const p: string[] = [];
  if (filtros.comparar !== "anio") p.push(String(filtros.anio));
  if (filtros.comparar !== "causa")
    p.push(lookups.causas.find((c) => c.orden === filtros.causa)?.label ?? "");
  if (filtros.comparar !== "edad")
    p.push(meta.gruposEtarios.find((g) => g.key === filtros.edad)?.label ?? "");
  // Alcance geográfico (región/servicio) cuando aplica.
  if (filtros.comparar !== "region" && filtros.comparar !== "servicio") {
    if (filtros.servicio !== null)
      p.push(lookups.servicios.find((s) => s.codigo === filtros.servicio)?.nombre ?? "");
    else if (filtros.region !== null)
      p.push(lookups.regiones.find((r) => r.codigo === filtros.region)?.nombre ?? "");
    else p.push("Todo Chile");
  } else if (filtros.comparar === "servicio" && filtros.region !== null) {
    p.push(lookups.regiones.find((r) => r.codigo === filtros.region)?.nombre ?? "");
  }
  return p.filter(Boolean);
}
