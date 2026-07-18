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
  { key: "establecimiento", label: "Establecimiento", plural: "Establecimientos" },
  { key: "comuna", label: "Comuna", plural: "Comunas" },
];

// Nombres de establecimiento/comuna (código -> nombre) para etiquetas.
export interface NombresDetalle {
  establecimiento: Map<string, string>;
  comuna: Map<string, string>;
}

export function pluralDe(dim: Dimension): string {
  return DIMENSIONES.find((d) => d.key === dim)?.plural ?? dim;
}

// Los nombres de servicio traen el prefijo redundante "Servicio de Salud ",
// que alarga las etiquetas (sobre todo los "Metropolitano …"). Se acorta para
// mostrar como serie (tooltip, leyenda, chips).
export function acortarServicio(nombre: string): string {
  return nombre.replace(/^Servicio de Salud /i, "");
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
        label: acortarServicio(s.nombre),
      }));
    case "establecimiento":
    case "comuna":
      return []; // se eligen por búsqueda de texto (lookups de detalle)
  }
}

// Etiqueta y bandera "año en curso" de una clave de serie.
export function describir(
  dim: Dimension,
  clave: ClaveSerie,
  lookups: Lookups,
  meta: Meta,
  nombres?: NombresDetalle,
): { label: string; esActual: boolean } {
  switch (dim) {
    case "establecimiento":
      return {
        label: nombres?.establecimiento.get(String(clave)) ?? String(clave),
        esActual: false,
      };
    case "comuna":
      return {
        label: nombres?.comuna.get(String(clave)) ?? String(clave),
        esActual: false,
      };
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
        label: acortarServicio(
          lookups.servicios.find((s) => s.codigo === clave)?.nombre ??
            String(clave),
        ),
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
    case "establecimiento":
    case "comuna":
      return []; // vacío: se agregan por búsqueda
  }
}

interface CtxFiltros {
  comparar: Dimension;
  anio: number;
  causa: number;
  region: number | null;
  servicio: number | null;
  establecimiento: string | null;
  comuna: string | null;
  edad: MetricKey;
}

// Alcance geográfico: el contexto fijo más específico (excluyendo la dim comparada).
function alcanceGeo(
  f: CtxFiltros,
  lookups: Lookups,
  nombres?: NombresDetalle,
): string | null {
  const c = f.comparar;
  if (c !== "establecimiento" && f.establecimiento !== null)
    return nombres?.establecimiento.get(f.establecimiento) ?? "Establecimiento";
  if (c !== "comuna" && f.comuna !== null)
    return nombres?.comuna.get(f.comuna) ?? "Comuna";
  if (c !== "servicio" && f.servicio !== null)
    return acortarServicio(
      lookups.servicios.find((s) => s.codigo === f.servicio)?.nombre ?? "",
    );
  if (c !== "region" && f.region !== null)
    return lookups.regiones.find((r) => r.codigo === f.region)?.nombre ?? "";
  if (c === "anio" || c === "causa" || c === "edad") return "Todo Chile";
  return null;
}

// Resumen de contexto (dimensiones fijas) para mostrar bajo el título.
export function contexto(
  f: CtxFiltros,
  lookups: Lookups,
  meta: Meta,
  nombres?: NombresDetalle,
): string[] {
  const p: string[] = [];
  if (f.comparar !== "anio") p.push(String(f.anio));
  if (f.comparar !== "causa")
    p.push(lookups.causas.find((c) => c.orden === f.causa)?.label ?? "");
  if (f.comparar !== "edad")
    p.push(meta.gruposEtarios.find((g) => g.key === f.edad)?.label ?? "");
  const g = alcanceGeo(f, lookups, nombres);
  if (g) p.push(g);
  return p.filter(Boolean);
}
