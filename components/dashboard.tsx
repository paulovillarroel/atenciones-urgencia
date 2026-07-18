"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, LineChart } from "lucide-react";
import type { BaseDatos, ClaveSerie, Dimension, Filtros, Serie } from "@/lib/types";
import { cargarBase, calcularSeries } from "@/lib/data";
import { mapaColoresComparar } from "@/lib/colores";
import {
  contexto,
  describir,
  multiPorDefecto,
  opcionesDe,
  pluralDe,
} from "@/lib/comparar";
import { fmt } from "@/lib/format";
import { useTema } from "./use-tema";
import { BotonTema } from "./boton-tema";
import { PanelFiltros } from "./filtros";
import { Grafico, type GraficoHandle } from "./grafico";

const AUTOR = "Paulo Villarroel Tapia";
const LINKEDIN = "https://www.linkedin.com/in/paulovillarroel/";
// Ajusta si el repositorio queda con otro nombre/usuario en GitHub.
const REPO = "https://github.com/paulovillarroel/atenciones-urgencia";

const fechaLarga = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function Dashboard() {
  const tema = useTema();
  const [base, setBase] = useState<BaseDatos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros | null>(null);
  const graficoRef = useRef<GraficoHandle>(null);

  useEffect(() => {
    const ac = new AbortController();
    cargarBase(ac.signal)
      .then((b) => {
        setBase(b);
        setFiltros({
          comparar: "anio",
          multi: b.meta.anios.slice(-5),
          anio: b.meta.anioActual,
          causa: 3,
          region: null,
          servicio: null,
          edad: "total",
        });
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => ac.abort();
  }, []);

  const colores = useMemo(() => {
    if (!base || !filtros) return new Map<ClaveSerie, string>();
    const orden = opcionesDe(filtros.comparar, base.lookups, base.meta).map(
      (o) => o.clave,
    );
    return mapaColoresComparar(
      filtros.comparar,
      filtros.multi,
      orden,
      base.meta.anios,
      tema,
    );
  }, [base, filtros, tema]);

  const series: Serie[] = useMemo(() => {
    if (!base || !filtros) return [];
    return calcularSeries(base.datos, filtros).map((s) => {
      const { label, esActual } = describir(
        filtros.comparar,
        s.clave,
        base.lookups,
        base.meta,
      );
      return { clave: s.clave, label, esActual, puntos: s.puntos };
    });
  }, [base, filtros]);

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
  const ctx = contexto(filtros, lookups, meta);

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
      return next;
    });

  const exportar = () => {
    const dim = pluralDe(filtros.comparar).toLowerCase();
    const conDatos = series.filter((s) => s.puntos.length > 0);
    const ordenLeyenda =
      filtros.comparar === "anio" ? [...conDatos].reverse() : conDatos;
    graficoRef.current?.exportarPNG({
      titulo: "Atenciones de urgencia respiratorias · Chile",
      subtitulo:
        `Comparación por ${dim}` + (ctx.length ? ` · ${ctx.join(" · ")}` : ""),
      leyenda: ordenLeyenda.map((s) => ({
        label: s.label + (s.esActual ? " (en curso)" : ""),
        color: colores.get(s.clave) ?? "#888888",
      })),
      pie: [
        `Fuente: ${meta.fuente}`,
        `Visualización: ${AUTOR}` +
          (meta.fuenteActualizada
            ? ` · datos al ${fechaLarga.format(new Date(meta.fuenteActualizada))}`
            : ""),
      ],
      nombre: `urgencias-respiratorias-por-${dim.replace(/\s+/g, "-")}.png`,
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

      <section className="mb-5 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <PanelFiltros
          lookups={lookups}
          meta={meta}
          filtros={filtros}
          colores={colores}
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

        <Grafico
          ref={graficoRef}
          series={series}
          colores={colores}
          tema={tema}
          yLabel="Atenciones"
        />

        <Leyenda
          series={series}
          colores={colores}
          reverso={filtros.comparar === "anio"}
        />

        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          Se excluye la última semana epidemiológica del año en curso por estar
          incompleta. {meta.anioActual}: datos hasta la semana {meta.ultimaSemana}.
          El total del sistema respiratorio (J00-J98) ya agrega sus subcausas; el
          COVID-19 se contabiliza aparte.
        </p>
      </section>

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
      </footer>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      {children}
    </main>
  );
}

function Leyenda({
  series,
  colores,
  reverso,
}: {
  series: Serie[];
  colores: Map<ClaveSerie, string>;
  reverso: boolean;
}) {
  const conDatos = series.filter((s) => s.puntos.length > 0);
  if (conDatos.length < 2) return null;
  const orden = reverso ? [...conDatos].reverse() : conDatos;
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
      {orden.map((s) => (
        <li key={String(s.clave)} className="flex items-center gap-1.5 text-sm">
          <span
            className="inline-block h-[3px] w-4 rounded-full"
            style={{ background: colores.get(s.clave) ?? "var(--muted)" }}
            aria-hidden
          />
          <span className={s.esActual ? "font-semibold text-ink" : "text-ink-2"}>
            {s.label}
            {s.esActual && (
              <span className="font-normal text-muted"> (en curso)</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
