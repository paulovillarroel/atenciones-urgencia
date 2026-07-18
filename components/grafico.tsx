"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ClaveSerie, Serie } from "@/lib/types";
import { CHROME, type Tema } from "@/lib/colores";
import { fmt, fmtCompacto } from "@/lib/format";

export interface ExportSpec {
  titulo: string;
  subtitulo: string;
  pie: string[];
  nombre: string;
}
// Etiqueta directa: nombre de la serie anclado al final de su línea (px del SVG).
interface Etiqueta {
  label: string;
  color: string;
  ex: number;
  ey: number;
}
export interface GraficoHandle {
  exportarPNG: (spec: ExportSpec) => void;
}

interface GraficoProps {
  series: Serie[];
  colores: Map<ClaveSerie, string>;
  tema: Tema;
  yLabel: string;
  formatoValor?: (n: number) => string;
}

interface ItemHover {
  clave: ClaveSerie;
  label: string;
  esActual: boolean;
  valor: number;
  color: string;
  y: number;
}
interface EstadoHover {
  semana: number;
  x: number;
  items: ItemHover[];
}

const MARGENES = { top: 30, right: 18, bottom: 40, left: 60 };

function techoAgradable(x: number): number {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * p;
}

export const Grafico = forwardRef<GraficoHandle, GraficoProps>(function Grafico(
  { series, colores, tema, yLabel, formatoValor },
  ref,
) {
  const fmtVal = formatoValor ?? fmt;
  const contRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const [alto, setAlto] = useState(360);
  const [hover, setHover] = useState<EstadoHover | null>(null);

  const escalasRef = useRef<{
    x: { apply: (v: number) => number; invert: (v: number) => number };
    y: { apply: (v: number) => number };
    porSemana: Map<number, Map<ClaveSerie, number>>;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    exportarPNG: (spec: ExportSpec) => {
      const svg = plotRef.current?.querySelector("svg");
      const est = escalasRef.current;
      if (!svg || !est) return;
      const etiquetas: Etiqueta[] = series
        .filter((s) => s.puntos.length > 0)
        .map((s) => {
          const u = s.puntos[s.puntos.length - 1];
          return {
            label: s.label + (s.esActual ? " (en curso)" : ""),
            color: colores.get(s.clave) ?? CHROME[tema].muted,
            ex: est.x.apply(u.semana),
            ey: est.y.apply(u.valor),
          };
        });
      componerPNG(svg, spec, etiquetas, tema).catch((e) =>
        console.error("Exportación PNG falló:", e),
      );
    },
  }));

  // Ancho responsivo.
  useEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setAncho(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hayDatos = series.some((s) => s.puntos.length > 0);

  useEffect(() => {
    const host = plotRef.current;
    if (!host || ancho === 0 || !hayDatos) return;
    let cancelado = false;
    setHover(null);

    (async () => {
      const Plot = await import("@observablehq/plot");
      if (cancelado || !plotRef.current) return;
      const c = CHROME[tema];
      const altoPx = Math.max(320, Math.min(540, Math.round(ancho * 0.52)));
      setAlto(altoPx);

      const semanas = series.flatMap((s) => s.puntos.map((p) => p.semana));
      const maxSemana = Math.max(52, ...semanas);
      const maxValor = Math.max(
        1,
        ...series.flatMap((s) => s.puntos.map((p) => p.valor)),
      );
      const techo = techoAgradable(maxValor);

      const ticksX = [1, 10, 20, 30, 40, 50, maxSemana].filter(
        (t, i, a) => t <= maxSemana && a.indexOf(t) === i,
      );

      const lineas = series.map((s) =>
        Plot.line(s.puntos, {
          x: "semana",
          y: "valor",
          stroke: colores.get(s.clave) ?? c.muted,
          strokeWidth: s.esActual ? 2.5 : 1.6,
          strokeLinejoin: "round",
          strokeLinecap: "round",
          curve: "linear",
        }),
      );

      const plot = Plot.plot({
        width: ancho,
        height: altoPx,
        marginTop: MARGENES.top,
        marginRight: MARGENES.right,
        marginBottom: MARGENES.bottom,
        marginLeft: MARGENES.left,
        style: {
          background: "transparent",
          color: c.muted,
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          fontSize: "12px",
          overflow: "visible",
        },
        x: {
          domain: [1, maxSemana],
          label: "Semana epidemiológica →",
          labelAnchor: "center",
          labelOffset: 34,
          ticks: ticksX,
          tickSize: 0,
          tickPadding: 8,
        },
        y: {
          domain: [0, techo],
          label: `↑ ${yLabel}`,
          labelAnchor: "top",
          tickSize: 0,
          tickPadding: 6,
          grid: true,
          tickFormat: (d: number) => fmtCompacto(d),
        },
        marks: [
          Plot.ruleY([0], { stroke: c.axis, strokeWidth: 1 }),
          ...lineas,
        ],
      });

      plot
        .querySelectorAll<SVGLineElement>("[aria-label$='grid'] line")
        .forEach((l) => {
          l.setAttribute("stroke", c.grid);
          l.setAttribute("stroke-opacity", "1");
        });

      plotRef.current.replaceChildren(plot);

      const xs = plot.scale("x") as unknown as {
        apply: (v: number) => number;
        invert: (v: number) => number;
      };
      const ys = plot.scale("y") as unknown as { apply: (v: number) => number };

      const porSemana = new Map<number, Map<ClaveSerie, number>>();
      for (const s of series) {
        for (const p of s.puntos) {
          if (!porSemana.has(p.semana)) porSemana.set(p.semana, new Map());
          porSemana.get(p.semana)!.set(s.clave, p.valor);
        }
      }
      escalasRef.current = { x: xs, y: ys, porSemana };
    })();

    return () => {
      cancelado = true;
    };
  }, [series, colores, tema, ancho, yLabel, hayDatos]);

  const onMove = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      const est = escalasRef.current;
      const el = plotRef.current;
      if (!est || !el) return;
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      if (px < MARGENES.left || px > rect.width - MARGENES.right) {
        setHover(null);
        return;
      }
      const semanaCruda = est.x.invert(px);
      let mejor = -1;
      let dist = Infinity;
      for (const sem of est.porSemana.keys()) {
        const d = Math.abs(sem - semanaCruda);
        if (d < dist) {
          dist = d;
          mejor = sem;
        }
      }
      const perClave = mejor >= 0 ? est.porSemana.get(mejor) : undefined;
      if (!perClave) {
        setHover(null);
        return;
      }
      const items: ItemHover[] = series
        .map((s) => {
          const v = perClave.get(s.clave);
          if (v == null) return null;
          return {
            clave: s.clave,
            label: s.label,
            esActual: s.esActual,
            valor: v,
            color: colores.get(s.clave) ?? CHROME[tema].muted,
            y: est.y.apply(v),
          };
        })
        .filter((x): x is ItemHover => x !== null)
        .sort((a, b) => b.valor - a.valor);
      if (items.length === 0) {
        setHover(null);
        return;
      }
      setHover({ semana: mejor, x: est.x.apply(mejor), items });
    },
    [series, colores, tema],
  );

  if (!hayDatos) {
    return (
      <div className="flex h-[340px] items-center justify-center rounded-lg border border-line px-6 text-center text-sm text-ink-2">
        Selecciona al menos una serie para comparar (o ajusta los filtros).
      </div>
    );
  }

  const cerca = hover ? hover.x > ancho * 0.62 : false;

  return (
    <div ref={contRef} className="relative w-full select-none">
      <div
        ref={plotRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onPointerMove={onMove}
        className="w-full [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
      />
      {hover && (
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute bg-axis"
            style={{
              left: hover.x,
              top: MARGENES.top,
              width: 1,
              height: alto - MARGENES.top - MARGENES.bottom,
            }}
          />
          {hover.items.map((it) => (
            <div
              key={String(it.clave)}
              className="absolute rounded-full"
              style={{
                left: hover.x - 4,
                top: it.y - 4,
                width: 8,
                height: 8,
                background: it.color,
                boxShadow: `0 0 0 2px ${CHROME[tema].surface}`,
              }}
            />
          ))}
          <div
            className="absolute w-max max-w-[240px] rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
            style={{
              left: hover.x,
              top: MARGENES.top + 4,
              transform: cerca
                ? "translateX(calc(-100% - 12px))"
                : "translateX(12px)",
            }}
          >
            <div className="mb-1.5 font-medium text-ink-2">
              Semana {hover.semana}
            </div>
            <ul className="space-y-1">
              {hover.items.map((it) => (
                <li
                  key={String(it.clave)}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: it.color }}
                    />
                    <span className="truncate text-ink">
                      {it.label}
                      {it.esActual && (
                        <span className="text-muted"> (en curso)</span>
                      )}
                    </span>
                  </span>
                  <span className="tnum shrink-0 font-medium text-ink">
                    {fmtVal(it.valor)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
});

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

// Compone un PNG (2x) autoexplicativo: título, subtítulo (qué se compara y su
// contexto), el gráfico con ETIQUETAS DIRECTAS de cada serie a la derecha (guía
// de color hasta el final de su línea, con anti-solape) y un pie con fuente/autoría.
// Las etiquetas directas evitan tener que emparejar colores con una leyenda aparte.
async function componerPNG(
  svg: SVGSVGElement,
  spec: ExportSpec,
  etiquetas: Etiqueta[],
  tema: Tema,
): Promise<void> {
  const c = CHROME[tema];
  const W = Math.round(svg.clientWidth || Number(svg.getAttribute("width")) || 900);
  const Hc = Math.round(svg.clientHeight || Number(svg.getAttribute("height")) || 460);
  const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const escala = 2;
  const padX = 24;

  // Rasterizar el gráfico (con su propio fondo).
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(W));
  clone.setAttribute("height", String(Hc));
  clone.style.fontFamily = FONT;
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "100%");
  rect.setAttribute("height", "100%");
  rect.setAttribute("fill", c.surface);
  clone.insertBefore(rect, clone.firstChild);
  const xml = new XMLSerializer().serializeToString(clone);
  const chart = await cargarImagen(
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml),
  );

  // Etiquetas directas: fuente según cantidad; acortamos el prefijo redundante.
  const corto = (s: string) => s.replace(/^Servicio de Salud /i, "");
  const n = etiquetas.length;
  const lineH = Math.max(11, Math.min(16, Math.floor((Hc - 8) / Math.max(1, n))));
  const fontSize = Math.max(9, Math.min(13, lineH - 3));
  const dotR = 3.5;
  const dotGap = 8;

  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) return;
  medidor.font = `${fontSize}px ${FONT}`;
  const puntos = etiquetas.map((e) => ({
    color: e.color,
    ex: e.ex,
    ey: e.ey,
    texto: corto(e.label),
    slot: e.ey,
  }));
  const maxTextW = puntos.reduce(
    (m, p) => Math.max(m, medidor.measureText(p.texto).width),
    0,
  );
  const gutter = n ? Math.ceil(8 + dotR * 2 + dotGap + maxTextW + 14) : padX;

  // Anti-solape: ordenar por y del extremo, empujar hacia abajo y encuadrar.
  puntos.sort((a, b) => a.slot - b.slot);
  let prev = -Infinity;
  for (const p of puntos) {
    p.slot = Math.max(p.slot, prev + lineH);
    prev = p.slot;
  }
  const overflow = prev - (Hc - 4);
  if (overflow > 0) for (const p of puntos) p.slot -= overflow;
  if (puntos.length && puntos[0].slot < 4) {
    const d = 4 - puntos[0].slot;
    for (const p of puntos) p.slot += d;
  }

  const yTop = 22,
    yBottom = 22,
    gapChart = 14,
    gapPie = 14;
  const hTitulo = spec.titulo ? 26 : 0;
  const hSub = spec.subtitulo ? 20 : 0;
  const totalH =
    yTop + hTitulo + hSub + gapChart + Hc + gapPie + spec.pie.length * 16 + yBottom;
  const totalW = W + gutter;

  const canvas = document.createElement("canvas");
  canvas.width = totalW * escala;
  canvas.height = Math.round(totalH) * escala;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(escala, escala);
  ctx.textBaseline = "top";
  ctx.fillStyle = c.surface;
  ctx.fillRect(0, 0, totalW, totalH);

  let y = yTop;
  if (spec.titulo) {
    ctx.fillStyle = c.ink;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(spec.titulo, padX, y);
    y += hTitulo;
  }
  if (spec.subtitulo) {
    ctx.fillStyle = c.ink2;
    ctx.font = `14px ${FONT}`;
    ctx.fillText(spec.subtitulo, padX, y);
    y += hSub;
  }
  y += gapChart;
  const yChart = y;
  ctx.drawImage(chart, 0, yChart, W, Hc);

  // Etiquetas directas a la derecha, con guía a cada línea.
  const dotX = W + 8;
  const textX = dotX + dotR * 2 + dotGap;
  ctx.font = `${fontSize}px ${FONT}`;
  ctx.textBaseline = "middle";
  for (const p of puntos) {
    const my = yChart + p.slot + fontSize / 2;
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.ex, yChart + p.ey);
    ctx.lineTo(dotX, my);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(dotX + dotR, my, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.ink;
    ctx.fillText(p.texto, textX, my);
  }
  ctx.textBaseline = "top";
  y = yChart + Hc + gapPie;

  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = c.muted;
  for (const linea of spec.pie) {
    ctx.fillText(linea, padX, y);
    y += 16;
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = spec.nombre;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }, "image/png");
}
