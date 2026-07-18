import { BASE_PATH } from "./data";

type Conn = import("@duckdb/duckdb-wasm").AsyncDuckDBConnection;

let conexionPromesa: Promise<Conn> | null = null;

// Inicializa DuckDB-WASM (bundles desde jsDelivr) y registra el parquet de
// detalle por URL, de modo que se lea por rangos HTTP (no baja los 15 MB de
// golpe, y el navegador cachea). Solo se carga la primera vez que se usa.
async function iniciar(): Promise<Conn> {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], {
      type: "text/javascript",
    }),
  );
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  const url = new URL(
    `${BASE_PATH}/data/detalle.parquet`,
    window.location.href,
  ).href;
  await db.registerFileURL(
    "detalle.parquet",
    url,
    duckdb.DuckDBDataProtocol.HTTP,
    false,
  );
  return db.connect();
}

function conexionDuck(): Promise<Conn> {
  if (!conexionPromesa) conexionPromesa = iniciar();
  return conexionPromesa;
}

export async function consultar(
  sql: string,
): Promise<Record<string, unknown>[]> {
  const conn = await conexionDuck();
  const tabla = await conn.query(sql);
  return tabla.toArray().map((r) => r.toJSON()) as Record<string, unknown>[];
}
