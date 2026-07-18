import type {
  ClaveSerie,
  DetalleLookups,
  Filtros,
  MetricKey,
  PuntoSemana,
} from "./types";
import { DIMENSIONES_DETALLE } from "./types";
import { BASE_PATH } from "./data";
import { consultar } from "./duckdb";

// ¿La vista actual requiere el parquet de detalle (DuckDB-WASM)? Sí cuando se
// compara por establecimiento/comuna o cuando alguno es filtro de contexto.
export function usaDetalle(f: Filtros): boolean {
  return (
    DIMENSIONES_DETALLE.includes(f.comparar) ||
    f.establecimiento !== null ||
    f.comuna !== null
  );
}

export async function cargarDetalleLookups(
  signal?: AbortSignal,
): Promise<DetalleLookups> {
  const r = await fetch(`${BASE_PATH}/data/detalle-lookups.json`, { signal });
  if (!r.ok) throw new Error(`No se pudo cargar detalle-lookups (${r.status})`);
  return r.json();
}

const COLUMNA: Record<string, string> = {
  anio: "anio",
  causa: "causa",
  region: "region",
  servicio: "servicio",
  establecimiento: "establecimiento",
  comuna: "comuna",
};
const esCodigo = (dim: string) =>
  dim === "establecimiento" || dim === "comuna";
const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

// Series por la dimensión comparada, consultando el parquet de detalle.
export async function consultarSeries(
  filtros: Filtros,
): Promise<{ clave: ClaveSerie; puntos: PuntoSemana[] }[]> {
  const { comparar, multi, anio, causa, region, servicio, establecimiento, comuna, edad } =
    filtros;
  if (multi.length === 0) return [];

  const where: string[] = [];
  if (comparar !== "anio") where.push(`anio = ${anio}`);
  if (comparar !== "causa") where.push(`causa = ${causa}`);
  if (comparar !== "region" && region !== null) where.push(`region = ${region}`);
  if (comparar !== "servicio" && servicio !== null)
    where.push(`servicio = ${servicio}`);
  if (comparar !== "establecimiento" && establecimiento !== null)
    where.push(`establecimiento = ${q(establecimiento)}`);
  if (comparar !== "comuna" && comuna !== null)
    where.push(`comuna = ${q(comuna)}`);

  if (comparar === "edad") {
    const keys = multi as MetricKey[];
    const sel = keys.map((k) => `sum(${k})::BIGINT AS ${k}`).join(", ");
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await consultar(
      `SELECT semana, ${sel} FROM 'detalle.parquet' ${w} GROUP BY semana ORDER BY semana`,
    );
    return keys.map((k) => ({
      clave: k,
      puntos: rows.map((r) => ({ semana: Number(r.semana), valor: Number(r[k]) })),
    }));
  }

  const col = COLUMNA[comparar];
  const vals = esCodigo(comparar)
    ? (multi as string[]).map(q).join(", ")
    : (multi as number[]).join(", ");
  const w = where.length ? `AND ${where.join(" AND ")}` : "";
  const rows = await consultar(
    `SELECT ${col} AS clave, semana, sum(${edad})::BIGINT AS valor
     FROM 'detalle.parquet' WHERE ${col} IN (${vals}) ${w}
     GROUP BY clave, semana ORDER BY clave, semana`,
  );

  const porClave = new Map<ClaveSerie, PuntoSemana[]>();
  for (const r of rows) {
    const clave: ClaveSerie = esCodigo(comparar)
      ? String(r.clave)
      : Number(r.clave);
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave)!.push({ semana: Number(r.semana), valor: Number(r.valor) });
  }
  return (multi as ClaveSerie[]).map((k) => ({
    clave: k,
    puntos: porClave.get(k) ?? [],
  }));
}
