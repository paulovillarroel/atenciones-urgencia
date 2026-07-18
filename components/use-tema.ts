"use client";

import { useSyncExternalStore } from "react";
import type { Tema } from "@/lib/colores";

function resolver(): Tema {
  if (typeof document === "undefined") return "light";
  const t = document.documentElement.dataset.theme;
  if (t === "dark" || t === "light") return t;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribe(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}

export function useTema(): Tema {
  return useSyncExternalStore(subscribe, resolver, () => "light");
}

export function alternarTema(actual: Tema): void {
  const nuevo: Tema = actual === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nuevo;
  try {
    localStorage.setItem("tema", nuevo);
  } catch {
    /* modo privado, etc. */
  }
}
