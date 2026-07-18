"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, LineChart, Loader2 } from "lucide-react";
import type {
  BaseDatos,
  ClaveSerie,
  DetalleLookups,
  Dimension,
  Filtros,
  PuntoSemana,
  Serie,
} from "@/lib/types";
import { DIMENSIONES_DETALLE } from "@/lib/types";
import { cargarBase, calcularSeries } from "@/lib/data";
import { cargarDetalleLookups, consultarSeries, usaDetalle } from "@/lib/detalle";
import { mapaColoresComparar } from "@/lib/colores";
import {
  contexto,
  describir,
  multiPorDefecto,
  type NombresDetalle,
  opcionesDe,
  pluralDe,
} from "@/lib/comparar";
import { fmt, fmtTasa } from "@/lib/format";
import { filtrosDesdeParams, paramsDeFiltros } from "@/lib/estado-url";
import { useTema } from "./use-tema";
import { BotonTema } from "./boton-tema";
import { PanelFiltros } from "./filtros";
import { Grafico, type GraficoHandle } from "./grafico";

const AUTOR = "Paulo Villarroel Tapia";
const LINKEDIN = "https://www.linkedin.com/in/paulovillarroel/";
// Ajusta si el repositorio queda con otro nombre/usuario en GitHub.
const REPO = "https://github.com/paulovillarroel/atenciones-urgencia";
const ISP_URL =
  "https://www.ispch.gob.cl/biomedico/vigilancia-de-laboratorio/ambitos-de-vigilancia/vigilancia-virus-respiratorios/informes-virus-respiratorios/";

const fechaLarga = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function Dashboard() {
  const tema = useTema();
  const [base, setBase] = useState<BaseDatos | null>(null);
  const [detLk, setDetLk] = useState<DetalleLookups | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros | null>(null);
  const [seriesDuck, setSeriesDuck] = useState<
    { clave: ClaveSerie; puntos: PuntoSemana[] }[]
  >([]);
  const [cargandoDuck, setCargandoDuck] = useState(false);
  const [errorDuck, setErrorDuck] = useState<string | null>(null);
  const graficoRef = useRef<GraficoHandle>(null);
  const [resaltado, setResaltado] = useState<ClaveSerie | null>(null);
  // ¿DuckDB-WASM ya cargó al menos una vez? (para el mensaje de carga)
  const [motorListo, setMotorListo] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    cargarBase(ac.signal)
      .then((b) => {
        setBase(b);
        // Estado inicial desde la URL (vista compartida) o el por defecto.
        setFiltros(
          filtrosDesdeParams(new URLSearchParams(window.location.search), b),
        );
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
      });
    // Lookups de detalle (livianos) para la búsqueda por texto.
    cargarDetalleLookups(ac.signal)
      .then(setDetLk)
      .catch(() => {});
    return () => ac.abort();
  }, []);

  // Refleja el estado en la URL (para compartir/guardar la vista). replaceState
  // para no llenar el historial en cada ajuste de filtro.
  useEffect(() => {
    if (!base || !filtros) return;
    const qs = paramsDeFiltros(filtros, base).toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : ""),
    );
  }, [base, filtros]);

  // Consulta a DuckDB-WASM cuando la vista requiere el parquet de detalle.
  useEffect(() => {
    if (!filtros || !usaDetalle(filtros)) return;
    let cancel = false;
    // Indicador de carga antes de la consulta asíncrona a DuckDB.
    /* eslint-disable react-hooks/set-state-in-effect */
    setCargandoDuck(true);
    setErrorDuck(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    consultarSeries(filtros)
      .then((r) => {
        if (!cancel) {
          setMotorListo(true);
          setSeriesDuck(r);
          setCargandoDuck(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancel) {
          setErrorDuck(e instanceof Error ? e.message : String(e));
          setCargandoDuck(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, [filtros]);

  const nombresDetalle: NombresDetalle = useMemo(
    () => ({
      establecimiento: new Map(
        (detLk?.establecimientos ?? []).map((e) => [e.codigo, e.nombre]),
      ),
      comuna: new Map((detLk?.comunas ?? []).map((c) => [c.codigo, c.nombre])),
    }),
    [detLk],
  );

  const colores = useMemo(() => {
    if (!base || !filtros) return new Map<ClaveSerie, string>();
    const orden = DIMENSIONES_DETALLE.includes(filtros.comparar)
      ? filtros.multi
      : opcionesDe(filtros.comparar, base.lookups, base.meta).map((o) => o.clave);
    return mapaColoresComparar(filtros.comparar, filtros.multi, orden, tema);
  }, [base, filtros, tema]);

  const crudasJS = useMemo(
    () =>
      base && filtros && !usaDetalle(filtros)
        ? calcularSeries(base.datos, filtros)
        : [],
    [base, filtros],
  );

  if (error) {
    return (
      <Marco>
        <div className="rounded-lg border border-line bg-surface p-6 text-sm text-ink-2">
          No se pudieron cargar los datos: {error}. Ejecuta{" "}
          <code className="font-mono text-ink">npm run data</code> y recarga.
        </div>
      </Marco>
    );
  }

  if (!base || !filtros) {
    return (
      <Marco>
        <div className="h-[420px] animate-pulse rounded-lg border border-line bg-surface" />
      </Marco>
    );
  }

  const { lookups, meta } = base;
  const detalleActivo = usaDetalle(filtros);
  const mostrarCarga = detalleActivo && cargandoDuck && filtros.multi.length > 0;
  const primeraCarga = mostrarCarga && seriesDuck.length === 0;
  const crudas = detalleActivo ? seriesDuck : crudasJS;
  const series: Serie[] = crudas.map((s) => {
    const { label, esActual } = describir(
      filtros.comparar,
      s.clave,
      lookups,
      meta,
      nombresDetalle,
    );
    return { clave: s.clave, label, esActual, puntos: s.puntos };
  });
  const ctx = contexto(filtros, lookups, meta, nombresDetalle);

  // Tasa por 100.000 hab. al comparar años, regiones, servicios o comunas. El
  // denominador se ajusta a la banda etaria elegida y al área geográfica:
  // - comparar años: cada año / población del área fija (servicio > región > país).
  // - comparar región/servicio/comuna: cada área / su propia población en el año fijo.
  const band = filtros.edad;
  const pobDeSerie = (clave: ClaveSerie): number | undefined => {
    const P = lookups.poblacion;
    if (filtros.comparar === "region")
      return P.region[String(clave)]?.[band]?.[String(filtros.anio)];
    if (filtros.comparar === "servicio")
      return P.servicio[String(clave)]?.[band]?.[String(filtros.anio)];
    if (filtros.comparar === "comuna")
      return detLk?.poblacionComuna[String(clave)]?.[band]?.[String(filtros.anio)];
    const y = String(clave); // comparar === "anio": la clave es el año
    if (filtros.servicio !== null)
      return P.servicio[String(filtros.servicio)]?.[band]?.[y];
    if (filtros.region !== null)
      return P.region[String(filtros.region)]?.[band]?.[y];
    return P.national?.[band]?.[y];
  };
  const tasaAplica =
    filtros.establecimiento === null &&
    filtros.comuna === null &&
    (filtros.comparar === "anio" ||
      filtros.comparar === "region" ||
      filtros.comparar === "servicio" ||
      filtros.comparar === "comuna");
  const esTasa = filtros.tasa && tasaAplica;
  const seriesVista: Serie[] = esTasa
    ? series.map((s) => {
        const pob = pobDeSerie(s.clave);
        return pob
          ? {
              ...s,
              puntos: s.puntos.map((p) => ({
                semana: p.semana,
                valor: (p.valor / pob) * 100000,
              })),
            }
          : s;
      })
    : series;
  const yLabel = esTasa ? "Atenciones por 100.000 hab." : "Atenciones";
  const formatoValor = esTasa ? fmtTasa : fmt;

  const acumuladoActual =
    filtros.comparar === "anio"
      ? (series
          .find((s) => s.clave === meta.anioActual)
          ?.puntos.reduce((a, p) => a + p.valor, 0) ?? null)
      : null;

  const cambiar = (parcial: Partial<Filtros>) =>
    setFiltros((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...parcial };
      if ("region" in parcial) {
        // El servicio depende de la región: se reinicia el contexto.
        next.servicio = null;
        // Si se compara por servicio, se acota la selección a la nueva región.
        if (next.comparar === "servicio") {
          const validos = lookups.servicios
            .filter((s) => next.region === null || s.region === next.region)
            .map((s) => s.codigo as ClaveSerie);
          const set = new Set(validos);
          next.multi = next.multi.filter((c) => set.has(c));
          if (next.multi.length === 0) next.multi = validos.slice(0, 3);
        }
      }
      return next;
    });

  const cambiarComparar = (dim: Dimension) =>
    setFiltros((prev) => {
      if (!prev) return prev;
      const next: Filtros = {
        ...prev,
        comparar: dim,
        multi: multiPorDefecto(dim, lookups, meta),
      };
      if (dim === "region") next.servicio = null;
      next.tasa = false; // la tasa se re-activa por vista (región/servicio)
      return next;
    });

  const exportar = () => {
    const dim = pluralDe(filtros.comparar).toLowerCase();
    graficoRef.current?.exportarPNG({
      titulo: "Atenciones de urgencia respiratorias · Chile",
      subtitulo:
        `Comparación por ${dim}` +
        (ctx.length ? ` · ${ctx.join(" · ")}` : "") +
        (esTasa ? " · tasa por 100.000 hab." : ""),
      pie: [
        `Fuente: ${meta.fuente}`,
        `Visualización: ${AUTOR}` +
          (meta.fuenteActualizada
            ? ` · datos al ${fechaLarga.format(new Date(meta.fuenteActualizada))}`
            : ""),
      ],
      nombre: `urgencias-respiratorias-por-${dim.replace(/\s+/g, "-")}${esTasa ? "-tasa" : ""}.png`,
    });
  };

  return (
    <Marco>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <LineChart
            size={22}
            className="mt-0.5 shrink-0 text-accent"
            aria-hidden
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              Atenciones de urgencia respiratorias
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              Chile · por semana epidemiológica · datos abiertos del DEIS
            </p>
          </div>
        </div>
        <BotonTema />
      </header>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <PanelFiltros
          lookups={lookups}
          meta={meta}
          filtros={filtros}
          colores={colores}
          detalle={detLk}
          onCambio={cambiar}
          onComparar={cambiarComparar}
        />
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <h2 className="text-base font-semibold text-ink">
              Comparación por{" "}
              <span className="text-accent">
                {pluralDe(filtros.comparar).toLowerCase()}
              </span>
            </h2>
            {ctx.length > 0 && (
              <p className="mt-0.5 text-sm text-ink-2">{ctx.join(" · ")}</p>
            )}
          </div>
          <button
            type="button"
            onClick={exportar}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
          >
            <Download size={14} aria-hidden />
            Descargar PNG
          </button>
        </div>

        {acumuladoActual !== null && (
          <p className="mb-4 text-sm text-ink-2">
            Acumulado {meta.anioActual}{" "}
            <span className="text-muted">(sem. 1–{meta.ultimaSemana})</span>:{" "}
            <span className="tnum font-semibold text-ink">
              {fmt(acumuladoActual)}
            </span>{" "}
            atenciones
          </p>
        )}

        {detalleActivo && errorDuck && (
          <p className="mb-4 text-sm text-ink-2">
            No se pudo consultar el detalle: {errorDuck}. Requiere conexión para
            cargar el motor de consultas (DuckDB-WASM).
          </p>
        )}

        {primeraCarga ? (
          <CargandoGrafico
            mensaje={
              motorListo
                ? "Consultando datos en el navegador…"
                : "Cargando el motor de consultas en el navegador (solo la primera vez)…"
            }
          />
        ) : (
          <div className="relative">
            <Grafico
              ref={graficoRef}
              series={seriesVista}
              colores={colores}
              tema={tema}
              yLabel={yLabel}
              formatoValor={formatoValor}
              resaltado={resaltado}
            />
            {mostrarCarga && (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-1 text-xs text-muted shadow-sm backdrop-blur">
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                  Actualizando…
                </span>
              </div>
            )}
          </div>
        )}

        <Leyenda
          series={seriesVista}
          colores={colores}
          reverso={filtros.comparar === "anio"}
          resaltado={resaltado}
          onResaltar={setResaltado}
        />

        {seriesVista.filter((s) => s.puntos.length > 0).length > 8 && (
          <p className="mt-2 text-xs text-muted">
            Muchas series: pasa el cursor sobre una de la leyenda para
            resaltarla.
          </p>
        )}

        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          Se excluye la última semana epidemiológica del año en curso por estar
          incompleta. {meta.anioActual}: datos hasta la semana {meta.ultimaSemana}.
          El total del sistema respiratorio (J00-J98) ya agrega sus subcausas; el
          COVID-19 se contabiliza aparte.
        </p>
      </section>
      </div>

      <footer className="mt-6 flex flex-col gap-1 text-xs text-muted">
        <p>
          Fuente de datos: {meta.fuente}.{" "}
          <a
            href={meta.fuenteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            Ver dataset
            <ExternalLink size={11} aria-hidden />
          </a>
        </p>
        {meta.fuenteActualizada && (
          <p>
            Datos del origen al{" "}
            {fechaLarga.format(new Date(meta.fuenteActualizada))} · actualizado en
            el sitio el {fechaLarga.format(new Date(meta.generado))}.
          </p>
        )}
        <p>
          Visualización:{" "}
          <a
            href={LINKEDIN}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            {AUTOR}
          </a>{" "}
          ·{" "}
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            Código en GitHub
            <ExternalLink size={11} aria-hidden />
          </a>
        </p>
        <p>
          Referencia:{" "}
          <a
            href={ISP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            Informes de circulación de virus respiratorios (ISP)
            <ExternalLink size={11} aria-hidden />
          </a>
        </p>
      </footer>
    </Marco>
  );
}

function CargandoGrafico({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex h-[340px] flex-col items-center justify-center gap-3 rounded-lg border border-line px-6 text-center text-sm text-muted">
      <Loader2 size={22} className="animate-spin text-accent" aria-hidden />
      {mensaje}
    </div>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:max-w-6xl xl:max-w-7xl">
      {children}
    </main>
  );
}

function Leyenda({
  series,
  colores,
  reverso,
  resaltado,
  onResaltar,
}: {
  series: Serie[];
  colores: Map<ClaveSerie, string>;
  reverso: boolean;
  resaltado: ClaveSerie | null;
  onResaltar: (clave: ClaveSerie | null) => void;
}) {
  const conDatos = series.filter((s) => s.puntos.length > 0);
  if (conDatos.length < 2) return null;
  const orden = reverso ? [...conDatos].reverse() : conDatos;
  return (
    <ul className="mt-4 flex flex-wrap gap-x-1 gap-y-0.5">
      {orden.map((s) => {
        const atenuado = resaltado != null && s.clave !== resaltado;
        return (
          <li key={String(s.clave)}>
            <button
              type="button"
              onMouseEnter={() => onResaltar(s.clave)}
              onMouseLeave={() => onResaltar(null)}
              onFocus={() => onResaltar(s.clave)}
              onBlur={() => onResaltar(null)}
              className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-sm transition-opacity hover:bg-ink/[0.04] ${
                atenuado ? "opacity-40" : "opacity-100"
              }`}
            >
              <span
                className="inline-block h-[3px] w-4 shrink-0 rounded-full"
                style={{ background: colores.get(s.clave) ?? "var(--muted)" }}
                aria-hidden
              />
              <span
                className={s.esActual ? "font-semibold text-ink" : "text-ink-2"}
              >
                {s.label}
                {s.esActual && (
                  <span className="font-normal text-muted"> (en curso)</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
