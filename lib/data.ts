import type {
  BaseDatos,
  ClaveSerie,
  DatosColumnar,
  Filtros,
  MetricKey,
  PuntoSemana,
} from "./types";

// Prefijo de ruta en GitHub Pages (vacío en local). Debe usarse en todo fetch
// de assets estáticos servidos bajo /<repo>.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function cargarBase(signal?: AbortSignal): Promise<BaseDatos> {
  const j = async (nombre: string) => {
    const r = await fetch(`${BASE_PATH}/data/${nombre}`, { signal });
    if (!r.ok) throw new Error(`No se pudo cargar ${nombre} (${r.status})`);
    return r.json();
  };
  const [datos, lookups, meta] = await Promise.all([
    j("atenciones.json"),
    j("lookups.json"),
    j("meta.json"),
  ]);
  return { datos, lookups, meta };
}

// Agrega las series según la dimensión de comparación, en una sola pasada.
// Cada serie corresponde a un valor seleccionado de `filtros.comparar`; las
// demás dimensiones actúan como filtro de contexto. Cuando se compara por
// grupo etario, cada serie es una columna de edad distinta.
export function calcularSeries(
  datos: DatosColumnar,
  filtros: Filtros,
): { clave: ClaveSerie; puntos: PuntoSemana[] }[] {
  const { comparar, multi, anio, causa, region, servicio, edad } = filtros;
  const acc = new Map<ClaveSerie, Map<number, number>>();
  for (const k of multi) acc.set(k, new Map());
  const clavesSet = new Set(multi);
  const metricaFija = comparar === "edad" ? null : datos[edad];
  const n = datos.anio.length;

  for (let i = 0; i < n; i++) {
    // Filtros de contexto (todas las dimensiones excepto la comparada).
    if (comparar !== "anio" && datos.anio[i] !== anio) continue;
    if (comparar !== "causa" && datos.causa[i] !== causa) continue;
    if (comparar !== "region" && region !== null && datos.region[i] !== region)
      continue;
    if (
      comparar !== "servicio" &&
      servicio !== null &&
      datos.servicio[i] !== servicio
    )
      continue;

    const s = datos.semana[i];

    if (comparar === "edad") {
      // Cada serie es una columna de edad; la misma fila alimenta a todas.
      for (const k of multi) {
        const v = datos[k as MetricKey][i];
        const porSemana = acc.get(k)!;
        porSemana.set(s, (porSemana.get(s) ?? 0) + v);
      }
      continue;
    }

    const clave =
      comparar === "anio"
        ? datos.anio[i]
        : comparar === "causa"
          ? datos.causa[i]
          : comparar === "region"
            ? datos.region[i]
            : datos.servicio[i];
    if (!clavesSet.has(clave)) continue;
    const porSemana = acc.get(clave)!;
    porSemana.set(s, (porSemana.get(s) ?? 0) + metricaFija![i]);
  }

  return multi.map((clave) => ({
    clave,
    puntos: [...acc.get(clave)!.entries()]
      .map(([semana, valor]) => ({ semana, valor }))
      .sort((p, q) => p.semana - q.semana),
  }));
}
