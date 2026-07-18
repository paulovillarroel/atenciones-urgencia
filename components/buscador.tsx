"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { ClaveSerie } from "@/lib/types";

export interface OpcionBuscar {
  codigo: string;
  nombre: string;
}

function useMatches(opciones: OpcionBuscar[], texto: string, excluir: Set<string>) {
  return useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!t) return [];
    return opciones
      .filter((o) => !excluir.has(o.codigo) && o.nombre.toLowerCase().includes(t))
      .slice(0, 25);
  }, [opciones, texto, excluir]);
}

const inputCls =
  "w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";

function Dropdown({
  matches,
  onPick,
}: {
  matches: OpcionBuscar[];
  onPick: (o: OpcionBuscar) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
      {matches.map((o) => (
        <li key={o.codigo}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(o);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-ink-2 hover:bg-ink/[0.05] hover:text-ink"
          >
            {o.nombre}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Multi-selección por búsqueda (para comparar por establecimiento/comuna).
export function BuscadorMulti({
  opciones,
  seleccion,
  colores,
  onCambio,
  placeholder,
}: {
  opciones: OpcionBuscar[];
  seleccion: string[];
  colores?: Map<ClaveSerie, string>;
  onCambio: (sel: string[]) => void;
  placeholder: string;
}) {
  const [texto, setTexto] = useState("");
  const excluir = useMemo(() => new Set(seleccion), [seleccion]);
  const matches = useMatches(opciones, texto, excluir);
  const nombre = (c: string) => opciones.find((o) => o.codigo === c)?.nombre ?? c;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder}
          className={inputCls}
        />
        <Dropdown
          matches={matches}
          onPick={(o) => {
            onCambio([...seleccion, o.codigo]);
            setTexto("");
          }}
        />
      </div>
      {seleccion.length > 0 && (
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {seleccion.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1.5 rounded-full border border-ink/20 bg-ink/[0.05] py-1 pl-2.5 pr-1.5 text-sm text-ink"
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: colores?.get(c) ?? "var(--muted)" }}
              />
              {nombre(c)}
              <button
                type="button"
                onClick={() => onCambio(seleccion.filter((x) => x !== c))}
                aria-label={`Quitar ${nombre(c)}`}
                className="text-muted hover:text-ink"
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Selección única por búsqueda (para filtro de contexto). null = todos.
export function BuscadorUno({
  opciones,
  valor,
  onCambio,
  placeholder,
  todos,
}: {
  opciones: OpcionBuscar[];
  valor: string | null;
  onCambio: (v: string | null) => void;
  placeholder: string;
  todos: string;
}) {
  const [texto, setTexto] = useState("");
  const matches = useMatches(opciones, texto, useMemo(() => new Set<string>(), []));
  const nombre = valor ? (opciones.find((o) => o.codigo === valor)?.nombre ?? valor) : null;

  if (valor !== null) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm">
        <span className="truncate text-ink">{nombre}</span>
        <button
          type="button"
          onClick={() => onCambio(null)}
          aria-label="Quitar filtro"
          className="shrink-0 text-muted hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search
        size={15}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={`${todos} — ${placeholder}`}
        className={inputCls}
      />
      <Dropdown
        matches={matches}
        onPick={(o) => {
          onCambio(o.codigo);
          setTexto("");
        }}
      />
    </div>
  );
}
