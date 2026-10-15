// Piezas comunes de las tareas de cotizaciones (FMP y Finnhub): estado del planificador desde la base,
// registro de cada intento por serie y el cálculo exacto del cambio porcentual.

import Big from "big.js";
import type { ContextoTarea } from "./ingesta.ts";
import { esMercado, type Mercado } from "./mercados.ts";
import type { SeriePlan } from "./planificador.ts";

/** Fila de mercado.estado_planificador(...) tal como llega en el JSON. */
interface SerieEstadoCrudo {
  id: string;
  simbolo: string | null;
  mercado: string | null;
  ultimo_intento: string | null;
  ultimo_ok: string | null;
  denegado_hasta: string | null;
}

export interface EstadoProveedor {
  llamadasHoy: number;
  series: SeriePlan[];
  advertencias: string[];
}

const fecha = (s: string | null) => (s ? new Date(s) : null);

/** Día del presupuesto (UTC). */
export function diaPresupuesto(t: Date): string {
  return t.toISOString().slice(0, 10);
}

export function leerEstadoProveedor(crudo: unknown): EstadoProveedor {
  const c = (crudo ?? {}) as { llamadas_hoy?: number | string; series?: SerieEstadoCrudo[] };
  const advertencias: string[] = [];
  const series: SeriePlan[] = [];
  for (const s of c.series ?? []) {
    if (!s.simbolo) {
      advertencias.push(`${s.id}: sin meta.simbolo en el catálogo`);
      continue;
    }
    const mercado: Mercado | null = esMercado(s.mercado) ? s.mercado : null;
    if (!mercado) {
      advertencias.push(`${s.id}: mercado desconocido «${s.mercado ?? ""}»`);
      continue;
    }
    series.push({
      id: s.id,
      simbolo: s.simbolo,
      mercado,
      ultimoIntento: fecha(s.ultimo_intento),
      ultimoOk: fecha(s.ultimo_ok),
      denegadoHasta: fecha(s.denegado_hasta),
    });
  }
  return { llamadasHoy: Number(c.llamadas_hoy ?? 0), series, advertencias };
}

export async function estadoProveedor(ctx: ContextoTarea, proveedor: string, fuente: string): Promise<EstadoProveedor> {
  const crudo = await ctx.rpc("estado_planificador", { p_proveedor: proveedor, p_fuente: fuente, p_dia: diaPresupuesto(ctx.ahora) });
  return leerEstadoProveedor(crudo);
}

export interface Intento {
  serie_id: string;
  ok: boolean;
  error?: string;
  /** El proveedor negó el símbolo por el plan: no se vuelve a pedir en 24 h. */
  denegado?: boolean;
}

const HORAS_DENEGADO = 24;

/** Guarda en mercado.consultas_api cuándo se pidió cada serie y cómo salió (para el planificador y /estado). */
export async function guardarIntentos(ctx: ContextoTarea, proveedor: string, intentos: Intento[]): Promise<void> {
  const ahora = ctx.ahora.toISOString();
  const buenos = intentos.filter((i) => i.ok).map((i) => ({
    proveedor,
    serie_id: i.serie_id,
    ultimo_intento: ahora,
    ultimo_ok: ahora,
    ultimo_error: null,
    denegado_hasta: null,
  }));
  const malos = intentos.filter((i) => !i.ok).map((i) => ({
    proveedor,
    serie_id: i.serie_id,
    ultimo_intento: ahora,
    ultimo_error: (i.error ?? "sin detalle").slice(0, 500),
    denegado_hasta: i.denegado ? new Date(ctx.ahora.getTime() + HORAS_DENEGADO * 3_600_000).toISOString() : null,
  }));
  if (buenos.length) await ctx.guardar("consultas_api", buenos, { conflicto: "proveedor,serie_id" });
  if (malos.length) await ctx.guardar("consultas_api", malos, { conflicto: "proveedor,serie_id" });
}

/** cambio % = cambio / (precio − cambio) × 100, exacto, a 6 decimales. null si no se puede calcular. */
export function cambioPorcentual(precio: string, cambio: string): string | null {
  const previo = new Big(precio).minus(cambio);
  if (previo.eq(0)) return null;
  const pct = new Big(cambio).div(previo).times(100).round(6, Big.roundHalfUp).toFixed();
  return pct === "-0" ? "0" : pct.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
