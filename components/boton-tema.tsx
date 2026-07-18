"use client";

import { Moon, Sun } from "lucide-react";
import { alternarTema, useTema } from "./use-tema";

export function BotonTema() {
  const tema = useTema();
  return (
    <button
      type="button"
      onClick={() => alternarTema(tema)}
      aria-label={tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-ink-2 transition-colors hover:text-ink"
    >
      {tema === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
