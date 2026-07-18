// Pipeline de datos: descarga el parquet de atenciones de urgencia respiratorias
// (datos.gob.cl / DEIS), lo limpia y lo pre-agrega a un archivo compacto que la
// app estatica consume en el navegador. Se ejecuta en local (`npm run data`) y a
// diario en GitHub Actions antes del build.
//
// Fuente: https://datos.gob.cl/dataset/atenciones-de-urgencia-causas-respiratorias
//
// Decisiones de limpieza (ver README):
//  - Se normaliza por CODIGO, no por glosa (hay typos: Region 14 "Los/los Rios",
//    Servicio 25 "Aysen/Aisen"). Chile tiene 16 regiones y 29 servicios de salud.
//  - Se descarta la ultima semana epidemiologica del ano en curso (incompleta).
//    En el ano en curso la semana 53 es la PRIMERA (arrastre de inicio de enero),
//    asi que "ultima" es la de mayor numero del bloque 1..N, no la 53.
//  - v1 solo ATENCIONES (OrdenCausa 3-11). Las hospitalizaciones son OrdenCausa
//    33/34/35 (prefijo "- "); para sumarlas mas adelante, ver ATENCION_ORDENES.
//  - No se suma sobre todas las causas: OrdenCausa=3 ya es el total de 4-9. El
//    total respiratorio del grafico usa la causa 3; COVID (10/11) va aparte.

import { DuckDBInstance } from "@duckdb/node-api";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  POBLACION_COMUNA,
  POBLACION_NACIONAL,
  POBLACION_REGION,
  POBLACION_SERVICIO,
} from "./poblacion.mjs";

const PARQUET_URL =
  "https://datos.gob.cl/dataset/606ef5bb-11d1-475b-b69f-b980da5757f4/resource/ae6c9887-106d-4e98-8875-40bf2b836041/download/at_urg_respiratorio_semanal.parquet";
const FUENTE_URL =
  "https://datos.gob.cl/dataset/atenciones-de-urgencia-causas-respiratorias";

// Causas del bloque "atenciones de urgencia" (v1). Hospitalizaciones = 33,34,35.
const ATENCION_ORDENES = [3, 4, 5, 6, 7, 8, 9, 10, 11];

// Grupos etarios: columna en el dato -> clave y etiqueta en la app.
const GRUPOS_ETARIOS = [
  { key: "total", label: "Todas las edades" },
  { key: "lt1", label: "Menores de 1 año" },
  { key: "e1_4", label: "1 a 4 años" },
  { key: "e5_14", label: "5 a 14 años" },
  { key: "e15_64", label: "15 a 64 años" },
  { key: "e65", label: "65 años o más" },
];

// Regiones de Chile ordenadas de norte a sur, con nombre limpio por codigo DPA.
// La poblacion por anio (para tasas) vive en scripts/poblacion.mjs.
// Evita depender de las glosas del dato (que traen mayusculas/typos inconsistentes).
const REGIONES = [
  { codigo: 15, nombre: "Arica y Parinacota" },
  { codigo: 1, nombre: "Tarapacá" },
  { codigo: 2, nombre: "Antofagasta" },
  { codigo: 3, nombre: "Atacama" },
  { codigo: 4, nombre: "Coquimbo" },
  { codigo: 5, nombre: "Valparaíso" },
  { codigo: 13, nombre: "Metropolitana de Santiago" },
  { codigo: 6, nombre: "O'Higgins" },
  { codigo: 7, nombre: "Maule" },
  { codigo: 16, nombre: "Ñuble" },
  { codigo: 8, nombre: "Biobío" },
  { codigo: 9, nombre: "La Araucanía" },
  { codigo: 14, nombre: "Los Ríos" },
  { codigo: 10, nombre: "Los Lagos" },
  { codigo: 11, nombre: "Aysén" },
  { codigo: 12, nombre: "Magallanes" },
];

// Etiquetas limpias de causas (las glosas crudas traen MAYUSCULAS y espacios dobles).
const CAUSAS = [
  { orden: 3, label: "Total sistema respiratorio", cie10: "J00-J98", grupo: "respiratorio", esTotal: true },
  { orden: 4, label: "IRA alta", cie10: "J00-J06", grupo: "respiratorio", esTotal: false },
  { orden: 5, label: "Influenza", cie10: "J09-J11", grupo: "respiratorio", esTotal: false },
  { orden: 6, label: "Neumonía", cie10: "J12-J18", grupo: "respiratorio", esTotal: false },
  { orden: 7, label: "Bronquitis / bronquiolitis aguda", cie10: "J20-J21", grupo: "respiratorio", esTotal: false },
  { orden: 8, label: "Crisis obstructiva bronquial", cie10: "J40-J46", grupo: "respiratorio", esTotal: false },
  { orden: 9, label: "Otras causas respiratorias", cie10: "J22, J30-J39, J47, J60-J98", grupo: "respiratorio", esTotal: false },
  { orden: 10, label: "COVID-19 (virus no identificado)", cie10: "U07.2", grupo: "covid", esTotal: false },
  { orden: 11, label: "COVID-19 (virus identificado)", cie10: "U07.1", grupo: "covid", esTotal: false },
];

const CODIGO_SIN_INFO = 0;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "data");

// DuckDB devuelve BIGINT/HUGEINT como BigInt; los sum() caben en Number con holgura.
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

async function main() {
  const t0 = Date.now();
  console.log("Conectando a DuckDB y cargando httpfs…");
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  await conn.run(
    "INSTALL httpfs; LOAD httpfs; SET http_timeout=300000; SET http_retries=8; SET http_retry_wait_ms=2000;",
  );

  console.log("Descargando y materializando el parquet (~67 MB)…");
  await conn.run(`
    CREATE TABLE raw AS
    SELECT
      Anio::INTEGER                                   AS anio,
      SemanaEstadistica::INTEGER                      AS semana,
      OrdenCausa::INTEGER                             AS orden,
      COALESCE(TRY_CAST(RegionCodigo AS INTEGER), ${CODIGO_SIN_INFO})        AS region,
      COALESCE(TRY_CAST(ServicioSaludCodigo AS INTEGER), ${CODIGO_SIN_INFO}) AS servicio,
      trim(ServicioSaludGlosa)                        AS servicio_glosa,
      EstablecimientoCodigo                           AS estab,
      trim(EstablecimientoGlosa)                      AS estab_glosa,
      lpad(ComunaCodigo, 5, '0')                      AS comuna,
      trim(ComunaGlosa)                               AS comuna_glosa,
      NumTotal::INTEGER                               AS total,
      NumMenor1Anio::INTEGER                          AS lt1,
      Num1a4Anios::INTEGER                            AS e1_4,
      Num5a14Anios::INTEGER                           AS e5_14,
      Num15a64Anios::INTEGER                          AS e15_64,
      Num65oMas::INTEGER                              AS e65
    FROM read_parquet('${PARQUET_URL}')
    WHERE OrdenCausa IN (${ATENCION_ORDENES.join(",")})
  `);

  const totalRawRows = num(
    (await conn.runAndReadAll("SELECT count(*) AS n FROM raw")).getRowObjects()[0].n,
  );
  console.log(`  filas de atenciones: ${totalRawRows.toLocaleString("es-CL")}`);

  // Ano en curso = maximo Anio presente.
  const anioActual = num(
    (await conn.runAndReadAll("SELECT max(anio) AS y FROM raw")).getRowObjects()[0].y,
  );

  // Semanas del ano en curso, para decidir el corte (la ultima esta incompleta).
  const semanasActual = (
    await conn.runAndReadAll(
      `SELECT DISTINCT semana AS w FROM raw WHERE anio = ${anioActual} ORDER BY w`,
    )
  )
    .getRowObjects()
    .map((r) => num(r.w));

  // Regla del bloque contiguo: el ano en curso avanza como un run 1,2,3,...,N.
  // - La semana N (mas reciente) llega incompleta -> se descarta.
  // - Una semana 52/53 "arrastre" (dias de inicio de enero que pertenecen a la
  //   ultima semana del ano anterior) aparece suelta, fuera del run, y tambien
  //   queda excluida. Se descarta todo lo >= al corte = N.
  const setSem = new Set(semanasActual);
  let ultimaContigua = 0;
  for (let w = 1; setSem.has(w); w++) ultimaContigua = w;
  const semanaCorte =
    ultimaContigua > 0 ? ultimaContigua : Math.max(...semanasActual);
  const ultimaSemana = semanaCorte - 1; // ultima semana completa mostrada
  const hayArrastre = semanasActual.some((w) => w > semanaCorte);

  console.log(
    `  año en curso: ${anioActual} — se conservan las semanas 1 a ${ultimaSemana} ` +
      `(se descarta la ${semanaCorte} por incompleta` +
      (hayArrastre ? ` y la ${Math.max(...semanasActual)} por arrastre de enero` : "") +
      ")",
  );

  // Agregacion al grano (anio, semana, region, servicio, causa).
  console.log("Agregando…");
  const aggReader = await conn.runAndReadAll(`
    SELECT anio, semana, region, servicio, orden,
      sum(total)::BIGINT  AS total,
      sum(lt1)::BIGINT    AS lt1,
      sum(e1_4)::BIGINT   AS e1_4,
      sum(e5_14)::BIGINT  AS e5_14,
      sum(e15_64)::BIGINT AS e15_64,
      sum(e65)::BIGINT    AS e65
    FROM raw
    WHERE NOT (anio = ${anioActual} AND semana >= ${semanaCorte})
    GROUP BY ALL
    ORDER BY anio, semana, region, servicio, orden
  `);
  const aggRows = aggReader.getRowObjects();

  // A columnas paralelas (formato compacto para el navegador).
  const cols = {
    anio: [], semana: [], region: [], servicio: [], causa: [],
    total: [], lt1: [], e1_4: [], e5_14: [], e15_64: [], e65: [],
  };
  for (const r of aggRows) {
    cols.anio.push(num(r.anio));
    cols.semana.push(num(r.semana));
    cols.region.push(num(r.region));
    cols.servicio.push(num(r.servicio));
    cols.causa.push(num(r.orden));
    cols.total.push(num(r.total));
    cols.lt1.push(num(r.lt1));
    cols.e1_4.push(num(r.e1_4));
    cols.e5_14.push(num(r.e5_14));
    cols.e15_64.push(num(r.e15_64));
    cols.e65.push(num(r.e65));
  }

  // Lookups de servicios de salud (nombre canonico por codigo = glosa mas frecuente).
  const serviciosReader = await conn.runAndReadAll(`
    SELECT servicio AS codigo, mode(servicio_glosa) AS nombre,
           mode(region) AS region
    FROM raw
    WHERE servicio <> ${CODIGO_SIN_INFO}
    GROUP BY servicio
    ORDER BY nombre
  `);
  const servicios = serviciosReader.getRowObjects().map((r) => ({
    codigo: num(r.codigo),
    nombre: r.nombre,
    region: num(r.region),
  }));

  // Desplegables limpios: solo las 16 regiones y 29 servicios reales (por codigo).
  // Las filas con codigo nulo (~0,74%) se conservan en el dato como codigo 0 para
  // que "Todas las regiones/servicios" no pierda ese total, pero NO se listan como
  // opcion filtrable (evita el falso "17/30" que confunde con el typo del origen).
  const regionesPresentes = new Set(cols.region);
  const regiones = REGIONES.filter((r) => regionesPresentes.has(r.codigo));
  const filasSinInfo = cols.region.filter((c) => c === CODIGO_SIN_INFO).length;

  const anios = [
    ...new Set(cols.anio),
  ].sort((a, b) => a - b);

  // last-modified del recurso remoto (fecha real de los datos de origen).
  let fuenteActualizada = null;
  try {
    const head = await fetch(PARQUET_URL, { method: "HEAD" });
    fuenteActualizada = head.headers.get("last-modified");
  } catch {
    /* opcional */
  }

  const meta = {
    fuente: "DEIS — Ministerio de Salud de Chile (datos.gob.cl)",
    fuenteUrl: FUENTE_URL,
    recursoUrl: PARQUET_URL,
    generado: new Date().toISOString(),
    fuenteActualizada,
    anios,
    anioActual,
    ultimaSemana, // ultima semana completa del ano en curso que se muestra
    semanaCorte, // desde esta semana (incl.) se descarto el ano en curso
    gruposEtarios: GRUPOS_ETARIOS,
    filas: cols.anio.length,
    filasSinInfo,
  };

  // Poblacion por anio (solo codigos presentes) para calcular tasas.
  const filtrarPob = (tabla, codigos) =>
    Object.fromEntries(
      [...codigos].map((c) => [c, tabla[c]]).filter(([, p]) => p),
    );
  const poblacion = {
    region: filtrarPob(POBLACION_REGION, new Set(regiones.map((r) => r.codigo))),
    servicio: filtrarPob(POBLACION_SERVICIO, new Set(servicios.map((s) => s.codigo))),
    national: POBLACION_NACIONAL,
  };

  const lookups = { regiones, servicios, causas: CAUSAS, poblacion };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, "atenciones.json"), JSON.stringify(cols));
  await writeFile(resolve(OUT_DIR, "lookups.json"), JSON.stringify(lookups));
  await writeFile(resolve(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  // Detalle a nivel establecimiento/comuna para consultas en el navegador
  // (DuckDB-WASM): parquet compacto (solo atenciones, sin la semana incompleta).
  console.log("Escribiendo detalle.parquet (establecimiento/comuna)…");
  await conn.run(`
    COPY (
      SELECT estab AS establecimiento, estab_glosa AS establecimiento_glosa,
             comuna, comuna_glosa, region, servicio, anio, semana,
             orden AS causa, total, lt1, e1_4, e5_14, e15_64, e65
      FROM raw
      WHERE NOT (anio = ${anioActual} AND semana >= ${semanaCorte})
      ORDER BY comuna, establecimiento
    ) TO '${resolve(OUT_DIR, "detalle.parquet")}' (FORMAT parquet, COMPRESSION zstd);
  `);

  const establecimientos = (
    await conn.runAndReadAll(`
      SELECT estab AS codigo, mode(estab_glosa) AS nombre, mode(comuna) AS comuna,
             mode(region) AS region, mode(servicio) AS servicio
      FROM raw WHERE estab IS NOT NULL GROUP BY estab ORDER BY nombre
    `)
  )
    .getRowObjects()
    .map((r) => ({
      codigo: r.codigo,
      nombre: r.nombre,
      comuna: r.comuna,
      region: num(r.region),
      servicio: num(r.servicio),
    }));

  const comunasDetalle = (
    await conn.runAndReadAll(`
      SELECT comuna AS codigo, mode(comuna_glosa) AS nombre,
             mode(region) AS region, mode(servicio) AS servicio
      FROM raw WHERE comuna IS NOT NULL GROUP BY comuna ORDER BY nombre
    `)
  )
    .getRowObjects()
    .map((r) => ({
      codigo: r.codigo,
      nombre: r.nombre,
      region: num(r.region),
      servicio: num(r.servicio),
    }));

  // Población por comuna (INE) acotada a las comunas presentes en el detalle,
  // para calcular tasas por 100.000 al comparar comunas. Se sirve junto con los
  // lookups (carga diferida, solo cuando se usa el detalle).
  const codigosComuna = new Set(comunasDetalle.map((c) => c.codigo));
  const poblacionComuna = Object.fromEntries(
    Object.entries(POBLACION_COMUNA).filter(([cod]) => codigosComuna.has(cod)),
  );

  await writeFile(
    resolve(OUT_DIR, "detalle-lookups.json"),
    JSON.stringify({ establecimientos, comunas: comunasDetalle, poblacionComuna }),
  );

  console.log(
    `  detalle: ${establecimientos.length} establecimientos, ${comunasDetalle.length} comunas ` +
      `(${Object.keys(poblacionComuna).length} con población INE).`,
  );

  console.log(
    `Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s — ` +
      `${meta.filas.toLocaleString("es-CL")} filas agregadas · ` +
      `${regiones.length} regiones · ${servicios.length} servicios · ${anios.length} años ` +
      `(${filasSinInfo.toLocaleString("es-CL")} filas con código nulo van solo a "Todas").`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
