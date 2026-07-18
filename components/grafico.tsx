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
// Tooltip fijado para incluir en la exportación.
interface AncladoExport {
  semana: number;
  ex: number;
  items: {
    label: string;
    color: string;
    valorStr: string;
    esActual: boolean;
    ey: number; // y del punto sobre su línea (px del gráfico)
  }[];
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
  resaltado?: ClaveSerie | null; // serie a destacar (atenúa las demás)
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

interface Escalas {
  x: { apply: (v: number) => number; invert: (v: number) => number };
  y: { apply: (v: number) => number };
  porSemana: Map<number, Map<ClaveSerie, number>>;
}

const MARGENES = { top: 30, right: 18, bottom: 40, left: 60 };

function techoAgradable(x: number): number {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * p;
}

// Semana más cercana a una posición horizontal (px) dentro del gráfico.
function semanaDesdePx(px: number, esc: Escalas): number | null {
  const cruda = esc.x.invert(px);
  let mejor = -1;
  let dist = Infinity;
  for (const sem of esc.porSemana.keys()) {
    const d = Math.abs(sem - cruda);
    if (d < dist) {
      dist = d;
      mejor = sem;
    }
  }
  return mejor >= 0 ? mejor : null;
}

export const Grafico = forwardRef<GraficoHandle, GraficoProps>(function Grafico(
  { series, colores, tema, yLabel, formatoValor, resaltado = null },
  ref,
) {
  const fmtVal = formatoValor ?? fmt;
  const contRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const [alto, setAlto] = useState(360);
  const [hover, setHover] = useState<EstadoHover | null>(null);
  const [anclado, setAnclado] = useState<number | null>(null);
  const [escalas, setEscalas] = useState<Escalas | null>(null);
  // Grupos <g> de cada línea (en orden de `series`), para resaltar sin re-render.
  const lineasRef = useRef<{ clave: ClaveSerie; el: SVGGElement | null }[]>([]);
  const resaltadoRef = useRef<ClaveSerie | null>(null);

  // Atenúa las líneas no resaltadas manipulando opacidad en el DOM (reconstruir
  // el gráfico en cada hover sería costoso).
  const aplicarResaltado = useCallback((r: ClaveSerie | null) => {
    const existe = r != null && lineasRef.current.some((l) => l.clave === r);
    for (const { clave, el } of lineasRef.current) {
      if (!el) continue;
      el.style.transition = "opacity 120ms ease";
      el.style.opacity = !existe || clave === r ? "1" : "0.12";
    }
  }, []);

  useEffect(() => {
    resaltadoRef.current = resaltado;
    aplicarResaltado(resaltado);
  }, [resaltado, aplicarResaltado]);

  // Estado del crosshair para una semana dada (valores de cada serie).
  const construirEstado = useCallback(
    (semana: number, esc: Escalas): EstadoHover | null => {
      const perClave = esc.porSemana.get(semana);
      if (!perClave) return null;
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
            y: esc.y.apply(v),
          };
        })
        .filter((x): x is ItemHover => x !== null)
        .sort((a, b) => b.valor - a.valor);
      if (items.length === 0) return null;
      return { semana, x: esc.x.apply(semana), items };
    },
    [series, colores, tema],
  );

  // Estado fijado (derivado): se muestra cuando el mouse no está encima.
  const ancladoEstado =
    anclado != null && escalas ? construirEstado(anclado, escalas) : null;
  const mostrado = hover ?? ancladoEstado;
  const esFijado = !hover && ancladoEstado != null;

  useImperativeHandle(ref, () => ({
    exportarPNG: (spec: ExportSpec) => {
      const svg = plotRef.current?.querySelector("svg");
      if (!svg || !escalas) return;
      const etiquetas: Etiqueta[] = series
        .filter((s) => s.puntos.length > 0)
        .map((s) => {
          const u = s.puntos[s.puntos.length - 1];
          return {
            label: s.label + (s.esActual ? " (en curso)" : ""),
            color: colores.get(s.clave) ?? CHROME[tema].muted,
            ex: escalas.x.apply(u.semana),
            ey: escalas.y.apply(u.valor),
          };
        });
      const est = anclado != null ? construirEstado(anclado, escalas) : null;
      const anc: AncladoExport | null = est
        ? {
            semana: est.semana,
            ex: est.x,
            items: est.items.map((i) => ({
              label: i.label + (i.esActual ? " (en curso)" : ""),
              color: i.color,
              valorStr: fmtVal(i.valor),
              esActual: i.esActual,
              ey: i.y,
            })),
          }
        : null;
      componerPNG(svg, spec, etiquetas, anc, tema).catch((e) =>
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

      // Ticks del eje X según el ancho: menos ticks en móvil y se descarta el
      // penúltimo si queda tan cerca del último que las etiquetas se solaparían
      // (p. ej. "50" y "53" en pantallas angostas).
      const pxPorSemana =
        (ancho - MARGENES.left - MARGENES.right) / Math.max(1, maxSemana - 1);
      const sepMin = Math.max(2, Math.ceil(22 / Math.max(1, pxPorSemana)));
      const baseTicks = ancho < 520 ? [1, 20, 40] : [1, 10, 20, 30, 40, 50];
      const ticksX = [
        ...baseTicks.filter((t) => t < maxSemana && maxSemana - t >= sepMin),
        maxSemana,
      ];

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

      // Refs a las líneas (orden de `series`) y reaplica el resaltado vigente.
      const grupos = [
        ...plot.querySelectorAll<SVGGElement>('[aria-label="line"]'),
      ];
      lineasRef.current = series.map((s, i) => ({
        clave: s.clave,
        el: grupos[i] ?? null,
      }));
      aplicarResaltado(resaltadoRef.current);

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
      setEscalas({ x: xs, y: ys, porSemana });
    })();

    return () => {
      cancelado = true;
    };
  }, [series, colores, tema, ancho, yLabel, hayDatos, aplicarResaltado]);

  const onMove = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      const el = plotRef.current;
      if (!escalas || !el) return;
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      if (px < MARGENES.left || px > rect.width - MARGENES.right) {
        setHover(null);
        return;
      }
      const wk = semanaDesdePx(px, escalas);
      setHover(wk != null ? construirEstado(wk, escalas) : null);
    },
    [escalas, construirEstado],
  );

  const onClick = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      const el = plotRef.current;
      if (!escalas || !el) return;
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      if (px < MARGENES.left || px > rect.width - MARGENES.right) return;
      const wk = semanaDesdePx(px, escalas);
      if (wk != null) setAnclado((prev) => (prev === wk ? null : wk));
    },
    [escalas],
  );

  if (!hayDatos) {
    return (
      <div className="flex h-[340px] items-center justify-center rounded-lg border border-line px-6 text-center text-sm text-ink-2">
        Selecciona al menos una serie para comparar (o ajusta los filtros).
      </div>
    );
  }

  const cerca = mostrado ? mostrado.x > ancho * 0.62 : false;
  const resaltadoValido =
    resaltado != null && series.some((s) => s.clave === resaltado)
      ? resaltado
      : null;
  const atenua = (clave: ClaveSerie) =>
    resaltadoValido != null && clave !== resaltadoValido ? 0.2 : 1;

  return (
    <div ref={contRef} className="relative w-full select-none">
      <div
        ref={plotRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onPointerMove={onMove}
        onClick={onClick}
        className="w-full cursor-crosshair [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
      />
      {mostrado && (
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute bg-axis"
            style={{
              left: mostrado.x,
              top: MARGENES.top,
              width: 1,
              height: alto - MARGENES.top - MARGENES.bottom,
            }}
          />
          {mostrado.items.map((it) => (
            <div
              key={String(it.clave)}
              className="absolute rounded-full"
              style={{
                left: mostrado.x - 4,
                top: it.y - 4,
                width: 8,
                height: 8,
                background: it.color,
                boxShadow: `0 0 0 2px ${CHROME[tema].surface}`,
                opacity: atenua(it.clave),
              }}
            />
          ))}
          <div
            className="absolute w-max max-w-[240px] rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
            style={{
              left: mostrado.x,
              top: MARGENES.top + 4,
              transform: cerca
                ? "translateX(calc(-100% - 12px))"
                : "translateX(12px)",
            }}
          >
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-ink-2">
              Semana {mostrado.semana}
              {esFijado && <span className="text-muted">· fijada</span>}
            </div>
            <ul className="space-y-1">
              {mostrado.items.map((it) => (
                <li
                  key={String(it.clave)}
                  className="flex items-center justify-between gap-3"
                  style={{ opacity: atenua(it.clave) }}
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
      <p className="mt-2 text-xs text-muted">
        {anclado != null
          ? `Semana ${anclado} fijada — se incluye al descargar. Clic para soltar.`
          : "Haz clic en el gráfico para fijar los valores de una semana e incluirlos en la descarga."}
      </p>
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

// Compone un PNG (2x) autoexplicativo: título, subtítulo, gráfico y pie.
// - Sin semana fijada: etiquetas directas de cada serie a la derecha (guía de
//   color a su línea, anti-solape), para identificar sin emparejar colores.
// - Con semana fijada: crosshair + caja de valores de esa semana (como el tooltip).
async function componerPNG(
  svg: SVGSVGElement,
  spec: ExportSpec,
  etiquetas: Etiqueta[],
  anclado: AncladoExport | null,
  tema: Tema,
): Promise<void> {
  const c = CHROME[tema];
  const W = Math.round(svg.clientWidth || Number(svg.getAttribute("width")) || 900);
  const Hc = Math.round(svg.clientHeight || Number(svg.getAttribute("height")) || 460);
  const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const escala = 2;
  const padX = 24;

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

  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) return;

  // Etiquetas directas (solo si NO hay semana fijada).
  const corto = (s: string) => s.replace(/^Servicio de Salud /i, "");
  const n = etiquetas.length;
  const lineH = Math.max(11, Math.min(16, Math.floor((Hc - 8) / Math.max(1, n))));
  const fontSize = Math.max(9, Math.min(13, lineH - 3));
  const dotR = 3.5;
  const dotGap = 8;
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
  const gutter = anclado
    ? 0
    : n
      ? Math.ceil(8 + dotR * 2 + dotGap + maxTextW + 14)
      : padX;

  if (!anclado) {
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

  if (anclado) {
    dibujarFijado(ctx, anclado, yChart, W, Hc, c, FONT);
  } else {
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
  }

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

// Dibuja el crosshair de la semana fijada y una caja con los valores.
function dibujarFijado(
  ctx: CanvasRenderingContext2D,
  anclado: AncladoExport,
  yChart: number,
  W: number,
  Hc: number,
  c: { ink: string; ink2: string; muted: string; grid: string; axis: string; surface: string },
  FONT: string,
): void {
  // Regla vertical.
  ctx.strokeStyle = c.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(anclado.ex, yChart);
  ctx.lineTo(anclado.ex, yChart + Hc);
  ctx.stroke();

  // Puntos de color sobre cada línea (con anillo del color de superficie).
  for (const it of anclado.items) {
    const dy = yChart + it.ey;
    ctx.beginPath();
    ctx.arc(anclado.ex, dy, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = c.surface;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(anclado.ex, dy, 4, 0, Math.PI * 2);
    ctx.fillStyle = it.color;
    ctx.fill();
  }

  const pad = 10;
  const n = anclado.items.length;
  const rowH = Math.max(13, Math.min(18, Math.floor((Hc - 40) / Math.max(1, n))));
  const fs = Math.max(10, Math.min(12, rowH - 4));
  const headerH = 20;

  ctx.font = `600 12px ${FONT}`;
  let contW = ctx.measureText(`Semana ${anclado.semana}`).width;
  ctx.font = `${fs}px ${FONT}`;
  for (const it of anclado.items) {
    const w =
      14 + ctx.measureText(it.label).width + 18 + ctx.measureText(it.valorStr).width;
    contW = Math.max(contW, w);
  }
  const boxW = Math.min(contW + pad * 2, W - 16);
  const boxH = headerH + n * rowH + pad;

  let boxX = anclado.ex + 14;
  if (boxX + boxW > W - 6) boxX = anclado.ex - boxW - 14;
  boxX = Math.max(6, Math.min(boxX, W - boxW - 6));
  let boxY = yChart + 6;
  if (boxY + boxH > yChart + Hc - 6) boxY = yChart + Hc - boxH - 6;
  boxY = Math.max(yChart + 4, boxY);

  ctx.fillStyle = c.surface;
  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textBaseline = "top";
  ctx.fillStyle = c.ink2;
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(`Semana ${anclado.semana}`, boxX + pad, boxY + pad);

  let ry = boxY + pad + headerH - 4;
  for (const it of anclado.items) {
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.arc(boxX + pad + 4, ry + fs / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.ink;
    ctx.font = `${fs}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(it.label, boxX + pad + 14, ry);
    ctx.textAlign = "right";
    ctx.font = `600 ${fs}px ${FONT}`;
    ctx.fillText(it.valorStr, boxX + boxW - pad, ry);
    ctx.textAlign = "left";
    ry += rowH;
  }
}
