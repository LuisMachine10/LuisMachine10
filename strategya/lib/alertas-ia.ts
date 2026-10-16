// Lógica pura (sin red) de Alertas e IA para la pantalla: validación de umbrales con big.js, estado de la IA
// a partir de las corridas, agrupado de titulares y tipos compartidos por los componentes.

import Big from "big.js";
import { ZONA_RD } from "./formato";

export type TipoRegla = "cambio_pct_dia" | "nivel_sobre" | "nivel_bajo" | "cualquier_cambio";

export const NOMBRE_TIPO: Readonly<Record<TipoRegla, string>> = {
  cambio_pct_dia: "Cambio del día (± %)",
  nivel_sobre: "Nivel por encima de",
  nivel_bajo: "Nivel por debajo de",
  cualquier_cambio: "Cualquier cambio",
};

/** Hoy en RD como AAAA-MM-DD. */
export function hoyRD(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD }).format(ahora);
}

/** Primer instante del mes en curso (hora RD, UTC−4) como ISO. */
export function inicioMesRD(ahora: Date): string {
  const [a, m] = hoyRD(ahora).split("-");
  return new Date(`${a}-${m}-01T04:00:00Z`).toISOString();
}

export type ResultadoUmbral = { ok: true; valor: string | null } | { ok: false; error: string };

const NUMERO = /^\d+(\.\d+)?$/;

/**
 * Valida el umbral que escribe Mena. Acepta «63.5», «4,300» o «4 300» (separador de miles) y lo devuelve como
 * decimal exacto en texto. «cualquier_cambio» no lleva umbral.
 */
export function validarUmbral(tipo: TipoRegla, entrada: string): ResultadoUmbral {
  if (tipo === "cualquier_cambio") return { ok: true, valor: null };
  const limpio = entrada.trim().replace(/[\s,]/g, "");
  if (!limpio) return { ok: false, error: "Escribe un umbral." };
  if (!NUMERO.test(limpio)) return { ok: false, error: "El umbral debe ser un número positivo con punto decimal (por ejemplo 63.50)." };
  const n = new Big(limpio);
  if (n.lte(0)) return { ok: false, error: "El umbral debe ser mayor que cero." };
  if (tipo === "cambio_pct_dia" && n.gt(100)) return { ok: false, error: "Un cambio diario mayor que 100 % no tiene sentido." };
  if ((limpio.split(".")[1] ?? "").length > 6) return { ok: false, error: "Usa como máximo 6 decimales." };
  if (n.gte("1e12")) return { ok: false, error: "El umbral es demasiado grande." };
  return { ok: true, valor: n.toFixed() };
}

export const NOTA_MAX = 300;

export function validarNota(entrada: string): { ok: true; valor: string | null } | { ok: false; error: string } {
  const t = entrada.trim();
  if (t.length > NOTA_MAX) return { ok: false, error: `La nota no puede pasar de ${NOTA_MAX} caracteres.` };
  return { ok: true, valor: t || null };
}

// ───────────────────────────── Estado de la IA ─────────────────────────────

export interface CorridaIA {
  tarea: string;
  inicio: string;
  estado: string;
  error: string | null;
  detalle: Record<string, unknown> | null;
}

export type EstadoIA =
  | { activa: false; motivo: "sin_clave" | "sin_corridas" }
  | { activa: true; topeAlcanzado: boolean; tope: string | null };

/** Decide, con la última corrida de las tareas de IA, si la IA está activa y si llegó al tope. */
export function estadoIA(corridas: CorridaIA[]): EstadoIA {
  const ia = corridas
    .filter((c) => c.tarea === "ia-porque" || c.tarea === "ia-resumen")
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
  const ultima = ia[0];
  if (!ultima) return { activa: false, motivo: "sin_corridas" };
  if (ultima.error && /Falta ANTHROPIC_API_KEY/.test(ultima.error)) return { activa: false, motivo: "sin_clave" };
  const conTope = ia.find((c) => c.detalle && typeof c.detalle.tope_usd === "string");
  const d = conTope?.detalle ?? {};
  return {
    activa: true,
    topeAlcanzado: d.tope_alcanzado === true,
    tope: typeof d.tope_usd === "string" ? d.tope_usd : null,
  };
}

/** Porcentaje usado del tope, con big.js (para la barra; 0–100). */
export function porcentajeUsado(gasto: string, tope: string | null): number | null {
  if (!tope) return null;
  const t = new Big(tope);
  if (t.lte(0)) return 100;
  const p = new Big(gasto).div(t).times(100);
  return Number((p.gt(100) ? new Big(100) : p).toFixed(0)); // solo para pintar el ancho de la barra
}

// ───────────────────────────── Titulares ─────────────────────────────

export interface TitularGuardado {
  id: number;
  titular: string;
  url: string;
  medio: string;
  fecha: string;
  pais: string | null;
  categoria: string;
}

export const SIN_PAIS = "Sin país identificado";

/** Agrupa titulares por país (los de guerra), en orden del titular más reciente de cada grupo. */
export function agruparPorPais(titulares: TitularGuardado[]): Array<{ pais: string; titulares: TitularGuardado[] }> {
  const grupos = new Map<string, TitularGuardado[]>();
  for (const t of [...titulares].sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    const pais = t.pais?.trim() || SIN_PAIS;
    const lista = grupos.get(pais) ?? [];
    lista.push(t);
    grupos.set(pais, lista);
  }
  return [...grupos.entries()].map(([pais, lista]) => ({ pais, titulares: lista }));
}

/** Agrupa por categoría de noticia («mercado», «rd»), los más recientes primero. */
export function agruparPorCategoria(titulares: TitularGuardado[]): Array<{ categoria: string; titulares: TitularGuardado[] }> {
  const orden = ["mercado", "rd", "guerra", "instituciones"];
  const grupos = new Map<string, TitularGuardado[]>();
  for (const t of [...titulares].sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    grupos.set(t.categoria, [...(grupos.get(t.categoria) ?? []), t]);
  }
  return [...grupos.entries()]
    .sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0]))
    .map(([categoria, lista]) => ({ categoria, titulares: lista }));
}

export const NOMBRE_CATEGORIA: Readonly<Record<string, string>> = {
  mercado: "Mercados",
  rd: "República Dominicana",
  guerra: "Conflictos",
  instituciones: "Instituciones",
};

// ───────────────────────────── Resúmenes guardados ─────────────────────────────

export interface ItemCinco {
  titulo: string;
  resumen: string;
  porque: string;
  y_que: string;
  url: string;
}

export interface Conflicto {
  conflicto: string;
  pais: string;
  estado: "ESCALA" | "TENSIÓN" | "TREGUA" | "BAJA INTENSIDAD";
  que_paso: string;
  mercado: string;
  url: string;
}

function esTexto(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Lee datos.items de una explicación «cinco_del_dia» ya validada por la tarea; descarta lo que no tenga forma. */
export function itemsCinco(datos: unknown): ItemCinco[] {
  const items = (datos as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.filter(
    (i): i is ItemCinco => !!i && esTexto(i.titulo) && esTexto(i.resumen) && esTexto(i.porque) && esTexto(i.y_que) && esTexto(i.url),
  );
}

const ESTADOS = new Set(["ESCALA", "TENSIÓN", "TREGUA", "BAJA INTENSIDAD"]);

export function conflictos(datos: unknown): Conflicto[] {
  const lista = (datos as { conflictos?: unknown } | null)?.conflictos;
  if (!Array.isArray(lista)) return [];
  return lista.filter(
    (c): c is Conflicto =>
      !!c && esTexto(c.conflicto) && ESTADOS.has(c.estado) && esTexto(c.que_paso) && esTexto(c.mercado) && esTexto(c.url) && typeof c.pais === "string",
  );
}

/** Clase CSS del estado de un conflicto. */
export function claseEstado(estado: Conflicto["estado"]): string {
  return { ESCALA: "escala", "TENSIÓN": "tension", TREGUA: "tregua", "BAJA INTENSIDAD": "baja-intensidad" }[estado];
}
