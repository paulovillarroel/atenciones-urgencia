// Estado de filtros <-> query string, para compartir y guardar vistas.
// Solo se escriben los parámetros que difieren del estado por defecto, así la
// vista inicial deja la URL limpia. Se valida todo lo que entra (URLs a mano).

import type {
  BaseDatos,
  ClaveSerie,
  Dimension,
  Filtros,
  MetricKey,
  Seccion,
} from "./types";
import { DIMENSIONES_DETALLE } from "./types";
import { multiPorDefecto } from "./comparar";

const DIMS: Dimension[] = [
  "anio",
  "causa",
  "edad",
  "region",
  "servicio",
  "establecimiento",
  "comuna",
];
const EDADES: MetricKey[] = ["total", "lt1", "e1_4", "e5_14", "e15_64", "e65"];

export function filtrosPorDefecto(base: BaseDatos): Filtros {
  return {
    comparar: "anio",
    multi: multiPorDefecto("anio", base.lookups, base.meta),
    anio: base.meta.anioActual,
    seccion: "atencion",
    causa: 3,
    region: null,
    servicio: null,
    establecimiento: null,
    comuna: null,
    edad: "total",
    tasa: false,
    log: false,
  };
}

// Claves numéricas válidas de una dimensión (para descartar basura de la URL).
function clavesNumericas(dim: Dimension, base: BaseDatos): Set<number> {
  const { lookups, meta } = base;
  switch (dim) {
    case "anio":
      return new Set(meta.anios);
    case "causa":
      return new Set(lookups.causas.map((c) => c.orden));
    case "region":
      return new Set(lookups.regiones.map((r) => r.codigo));
    case "servicio":
      return new Set(lookups.servicios.map((s) => s.codigo));
    default:
      return new Set();
  }
}

function parsearMulti(
  params: URLSearchParams,
  comparar: Dimension,
  base: BaseDatos,
  seccion: Seccion,
): ClaveSerie[] {
  const porDefecto = () =>
    multiPorDefecto(comparar, base.lookups, base.meta, seccion);
  const raw = params.get("sel");
  if (raw == null) return porDefecto();
  const partes = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (partes.length === 0) return porDefecto();
  // Establecimiento/comuna: códigos string (no se validan contra el detalle,
  // que carga aparte; un código inválido simplemente no trae datos).
  if (DIMENSIONES_DETALLE.includes(comparar)) return partes;
  if (comparar === "edad") {
    const ks = partes.filter(
      (p) => EDADES.includes(p as MetricKey) && p !== "total",
    );
    return ks.length ? (ks as MetricKey[]) : porDefecto();
  }
  const validas = clavesNumericas(comparar, base);
  const nums = partes
    .map(Number)
    .filter((n) => Number.isFinite(n) && validas.has(n));
  return nums.length ? nums : porDefecto();
}

export function filtrosDesdeParams(
  params: URLSearchParams,
  base: BaseDatos,
): Filtros {
  const def = filtrosPorDefecto(base);
  const { lookups, meta } = base;

  const cmp = params.get("cmp") as Dimension | null;
  const comparar = cmp && DIMS.includes(cmp) ? cmp : def.comparar;

  const num = (
    key: string,
    valida: (n: number) => boolean,
    fallback: number | null,
  ): number | null => {
    const v = params.get(key);
    if (v == null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) && valida(n) ? n : fallback;
  };

  const seccion: Seccion =
    params.get("sec") === "h" ? "hospitalizacion" : "atencion";
  const causaDef = seccion === "hospitalizacion" ? 33 : 3;
  const edadRaw = params.get("edad") as MetricKey | null;
  return {
    comparar,
    multi: parsearMulti(params, comparar, base, seccion),
    anio: num("anio", (n) => meta.anios.includes(n), def.anio) ?? def.anio,
    seccion,
    causa:
      num(
        "causa",
        (n) => lookups.causas.some((c) => c.orden === n && c.seccion === seccion),
        causaDef,
      ) ?? causaDef,
    region: num("region", (n) => lookups.regiones.some((r) => r.codigo === n), null),
    servicio: num(
      "servicio",
      (n) => lookups.servicios.some((s) => s.codigo === n),
      null,
    ),
    establecimiento: params.get("estab") || null,
    comuna: params.get("comuna") || null,
    edad: edadRaw && EDADES.includes(edadRaw) ? edadRaw : def.edad,
    tasa: params.get("tasa") === "1",
    log: params.get("log") === "1",
  };
}

function mismoConjunto(a: ClaveSerie[], b: ClaveSerie[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].map(String).sort();
  const sb = [...b].map(String).sort();
  return sa.every((v, i) => v === sb[i]);
}

export function paramsDeFiltros(f: Filtros, base: BaseDatos): URLSearchParams {
  const def = filtrosPorDefecto(base);
  const p = new URLSearchParams();
  if (f.comparar !== def.comparar) p.set("cmp", f.comparar);
  if (f.seccion === "hospitalizacion") p.set("sec", "h");
  if (f.comparar !== "anio" && f.anio !== def.anio) p.set("anio", String(f.anio));
  const causaDef = f.seccion === "hospitalizacion" ? 33 : 3;
  if (f.comparar !== "causa" && f.causa !== causaDef)
    p.set("causa", String(f.causa));
  if (f.comparar !== "edad" && f.edad !== def.edad) p.set("edad", f.edad);
  if (f.comparar !== "region" && f.region != null)
    p.set("region", String(f.region));
  if (f.comparar !== "servicio" && f.servicio != null)
    p.set("servicio", String(f.servicio));
  if (f.comparar !== "establecimiento" && f.establecimiento != null)
    p.set("estab", f.establecimiento);
  if (f.comparar !== "comuna" && f.comuna != null) p.set("comuna", f.comuna);
  if (f.tasa) p.set("tasa", "1");
  if (f.log) p.set("log", "1");
  const defMulti = multiPorDefecto(f.comparar, base.lookups, base.meta, f.seccion);
  if (f.multi.length > 0 && !mismoConjunto(f.multi, defMulti))
    p.set("sel", f.multi.join(","));
  return p;
}
