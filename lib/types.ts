// Claves de métrica = columnas del dato (total + grupos etarios).
export type MetricKey = "total" | "lt1" | "e1_4" | "e5_14" | "e15_64" | "e65";

// Dato pre-agregado en formato columnar (arreglos paralelos). Grano:
// (año, semana, región, servicio, causa) con conteos por grupo etario.
export interface DatosColumnar {
  anio: number[];
  semana: number[];
  region: number[];
  servicio: number[];
  causa: number[]; // OrdenCausa
  total: number[];
  lt1: number[];
  e1_4: number[];
  e5_14: number[];
  e15_64: number[];
  e65: number[];
}

export interface Region {
  codigo: number;
  nombre: string;
}

// banda etaria -> año -> población (para tasas por 100.000 hab.).
export type PoblacionBanda = Record<string, Record<string, number>>;
// Población por dimensión: código -> banda -> año (y nacional: banda -> año).
export interface Poblacion {
  region: Record<string, PoblacionBanda>;
  servicio: Record<string, PoblacionBanda>;
  national: PoblacionBanda;
}
export interface Servicio {
  codigo: number;
  nombre: string;
  region: number;
}
export interface Causa {
  orden: number;
  label: string;
  cie10: string;
  grupo: "respiratorio" | "covid";
  esTotal: boolean;
}
export interface Lookups {
  regiones: Region[];
  servicios: Servicio[];
  causas: Causa[];
  poblacion: Poblacion;
}

export interface GrupoEtario {
  key: MetricKey;
  label: string;
}

export interface Meta {
  fuente: string;
  fuenteUrl: string;
  recursoUrl: string;
  generado: string;
  fuenteActualizada: string | null;
  anios: number[];
  anioActual: number;
  ultimaSemana: number; // última semana completa mostrada del año en curso
  semanaCorte: number; // desde esta semana (incl.) se descartó el año en curso
  gruposEtarios: GrupoEtario[];
  filas: number;
  filasSinInfo: number;
}

export interface BaseDatos {
  datos: DatosColumnar;
  lookups: Lookups;
  meta: Meta;
}

// Dimensión por la que se comparan las líneas del gráfico.
export type Dimension = "anio" | "causa" | "edad" | "region" | "servicio";

// Clave de una serie (valor de la dimensión comparada): código numérico
// (año, causa, región, servicio) o clave de grupo etario (string).
export type ClaveSerie = number | MetricKey;

// Estado de filtros de la interfaz.
export interface Filtros {
  comparar: Dimension; // qué representa cada línea
  multi: ClaveSerie[]; // valores seleccionados de la dimensión comparada
  // Valores de contexto (se usan cuando esa dimensión NO es la comparada):
  anio: number;
  causa: number; // OrdenCausa
  region: number | null; // null = todas las regiones
  servicio: number | null; // null = todos los servicios
  edad: MetricKey; // grupo etario
  tasa: boolean; // solo al comparar por región: tasa por 100.000 hab.
}

// Serie (una línea) para el gráfico.
export interface PuntoSemana {
  semana: number;
  valor: number;
}
export interface Serie {
  clave: ClaveSerie;
  label: string;
  esActual: boolean; // año en curso (solo en modo 'anio')
  puntos: PuntoSemana[];
}
