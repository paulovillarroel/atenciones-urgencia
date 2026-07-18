"use client";

import {
  Activity,
  Building2,
  Calendar,
  GitCompare,
  MapPin,
  Percent,
  Users,
} from "lucide-react";
import type {
  ClaveSerie,
  Dimension,
  Filtros,
  Lookups,
  Meta,
} from "@/lib/types";
import { acortarServicio, DIMENSIONES, opcionesDe, pluralDe } from "@/lib/comparar";

interface FiltrosProps {
  lookups: Lookups;
  meta: Meta;
  filtros: Filtros;
  colores: Map<ClaveSerie, string>;
  onCambio: (parcial: Partial<Filtros>) => void;
  onComparar: (dim: Dimension) => void;
}

const claseSelect =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-accent";

function Campo({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

export function PanelFiltros({
  lookups,
  meta,
  filtros,
  colores,
  onCambio,
  onComparar,
}: FiltrosProps) {
  const { comparar } = filtros;
  const iconAttrs = { size: 14, className: "text-muted", "aria-hidden": true };

  const mostrarRegion = comparar !== "region";
  const mostrarServicio = comparar !== "servicio" && comparar !== "region";
  const tasaDisponible =
    (comparar === "region" || comparar === "servicio") &&
    Object.keys(lookups.poblacion[comparar]).length > 0;

  const serviciosVisibles =
    filtros.region === null
      ? lookups.servicios
      : lookups.servicios.filter((s) => s.region === filtros.region);

  // Opciones de la dimensión comparada (servicios se acotan por región si hay).
  const opcionesMulti =
    comparar === "servicio" && filtros.region !== null
      ? lookups.servicios
          .filter((s) => s.region === filtros.region)
          .map((s) => ({ clave: s.codigo as ClaveSerie, label: acortarServicio(s.nombre) }))
      : opcionesDe(comparar, lookups, meta);

  return (
    <div className="flex flex-col gap-4">
      {/* Comparar por */}
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
          <GitCompare {...iconAttrs} />
          Comparar por
        </span>
        <div className="flex flex-wrap gap-1">
          {DIMENSIONES.map((d) => {
            const activo = comparar === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => onComparar(d.key)}
                aria-pressed={activo}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  activo
                    ? "border-accent bg-accent/10 font-medium text-ink"
                    : "border-line text-ink-2 hover:text-ink"
                }`}
              >
                {d.plural}
              </button>
            );
          })}
        </div>
      </div>

      {/* Métrica: absoluto vs tasa (regiones o servicios, si hay población) */}
      {tasaDisponible && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
            <Percent {...iconAttrs} />
            Métrica
          </span>
          <div className="flex flex-wrap gap-1">
            {[
              { tasa: false, label: "Valor absoluto" },
              { tasa: true, label: "Tasa (por 100.000 hab.)" },
            ].map((op) => {
              const activo = filtros.tasa === op.tasa;
              return (
                <button
                  key={op.label}
                  type="button"
                  onClick={() => onCambio({ tasa: op.tasa })}
                  aria-pressed={activo}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    activo
                      ? "border-accent bg-accent/10 font-medium text-ink"
                      : "border-line text-ink-2 hover:text-ink"
                  }`}
                >
                  {op.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Contexto (dimensiones fijas) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {comparar !== "anio" && (
          <Campo label="Año" icon={<Calendar {...iconAttrs} />}>
            <select
              className={claseSelect}
              value={filtros.anio}
              onChange={(e) => onCambio({ anio: Number(e.target.value) })}
            >
              {[...meta.anios].reverse().map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {comparar !== "causa" && (
          <Campo label="Causa (CIE-10)" icon={<Activity {...iconAttrs} />}>
            <select
              className={claseSelect}
              value={filtros.causa}
              onChange={(e) => onCambio({ causa: Number(e.target.value) })}
            >
              {lookups.causas.map((c) => (
                <option key={c.orden} value={c.orden}>
                  {c.label} ({c.cie10})
                </option>
              ))}
            </select>
          </Campo>
        )}

        {comparar !== "edad" && (
          <Campo label="Grupo etario" icon={<Users {...iconAttrs} />}>
            <select
              className={claseSelect}
              value={filtros.edad}
              onChange={(e) =>
                onCambio({ edad: e.target.value as Filtros["edad"] })
              }
            >
              {meta.gruposEtarios.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {mostrarRegion && (
          <Campo
            label={comparar === "servicio" ? "Región (alcance)" : "Región"}
            icon={<MapPin {...iconAttrs} />}
          >
            <select
              className={claseSelect}
              value={filtros.region ?? ""}
              onChange={(e) =>
                onCambio({
                  region: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Todas las regiones</option>
              {lookups.regiones.map((r) => (
                <option key={r.codigo} value={r.codigo}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {mostrarServicio && (
          <Campo label="Servicio de salud" icon={<Building2 {...iconAttrs} />}>
            <select
              className={claseSelect}
              value={filtros.servicio ?? ""}
              onChange={(e) =>
                onCambio({
                  servicio:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Todos los servicios</option>
              {serviciosVisibles.map((s) => (
                <option key={s.codigo} value={s.codigo}>
                  {acortarServicio(s.nombre)}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </div>

      {/* Dimensión comparada (multi-selección) */}
      <MultiSeleccion
        titulo={`${pluralDe(comparar)} a comparar`}
        opciones={opcionesMulti}
        seleccion={filtros.multi}
        colores={colores}
        anioActual={comparar === "anio" ? meta.anioActual : null}
        reverso={comparar === "anio"}
        quick={
          comparar === "anio"
            ? { label: "Últimos 5", accion: () => onCambio({ multi: meta.anios.slice(-5) }) }
            : undefined
        }
        onCambio={(multi) => onCambio({ multi })}
      />
    </div>
  );
}

function MultiSeleccion({
  titulo,
  opciones,
  seleccion,
  colores,
  anioActual,
  reverso,
  quick,
  onCambio,
}: {
  titulo: string;
  opciones: { clave: ClaveSerie; label: string }[];
  seleccion: ClaveSerie[];
  colores: Map<ClaveSerie, string>;
  anioActual: number | null;
  reverso: boolean;
  quick?: { label: string; accion: () => void };
  onCambio: (seleccion: ClaveSerie[]) => void;
}) {
  const sel = new Set(seleccion);
  const orden = opciones.map((o) => o.clave);
  const toggle = (clave: ClaveSerie) => {
    const nuevo = new Set(sel);
    if (nuevo.has(clave)) nuevo.delete(clave);
    else nuevo.add(clave);
    onCambio(orden.filter((c) => nuevo.has(c))); // mantiene orden canónico
  };
  const lista = reverso ? [...opciones].reverse() : opciones;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-ink-2">{titulo}</span>
        <div className="flex items-center gap-3">
          {quick && (
            <button
              type="button"
              onClick={quick.accion}
              className="text-xs text-muted underline-offset-2 hover:text-ink-2 hover:underline"
            >
              {quick.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => onCambio(orden)}
            className="text-xs text-muted underline-offset-2 hover:text-ink-2 hover:underline"
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => onCambio([])}
            className="text-xs text-muted underline-offset-2 hover:text-ink-2 hover:underline"
          >
            Limpiar
          </button>
        </div>
      </div>
      <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
        {lista.map((o) => {
          const activo = sel.has(o.clave);
          return (
            <button
              key={String(o.clave)}
              type="button"
              onClick={() => toggle(o.clave)}
              aria-pressed={activo}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors ${
                activo
                  ? "border-ink/20 bg-ink/[0.05] text-ink"
                  : "border-line text-muted hover:text-ink-2"
              }`}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: activo
                    ? (colores.get(o.clave) ?? "var(--muted)")
                    : "var(--axis)",
                }}
              />
              {o.label}
              {anioActual !== null && o.clave === anioActual && (
                <span className="text-[10px] text-muted">•</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
