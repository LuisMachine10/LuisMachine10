// Planificador de consultas (puro): en cada ciclo de 5 minutos decide qué series pedir al proveedor sin
// pasarse del presupuesto diario de llamadas. Reparte lo que queda del día entre las series según su
// prioridad y los minutos que su mercado seguirá abierto. Si alcanza para todo, refresca todo cada ciclo.

import { estadoMercado, minutosAbiertos, type Mercado } from "./mercados.ts";

export interface SeriePlan {
  id: string;
  simbolo: string;
  mercado: Mercado;
  ultimoIntento: Date | null;
  ultimoOk: Date | null;
  /** El proveedor negó el símbolo (plan): no se pide hasta esta hora. */
  denegadoHasta: Date | null;
}

export type MotivoConsulta = "abierto" | "cierre" | "primera";

export interface Plan {
  modo: "todo" | "reparto" | "sin_presupuesto" | "nada_pendiente";
  /** Series a pedir en este ciclo, en orden de prioridad. */
  elegidas: { id: string; simbolo: string; motivo: MotivoConsulta }[];
  /** Llamadas disponibles hoy (después de la reserva). null = sin límite. */
  restantes: number | null;
  /** Minutos entre consultas que le tocan a cada serie con su mercado abierto. */
  intervaloMin: Record<string, number>;
}

/** Prioridad del pedido de Mena; el resto va después, con peso 1. */
export const PRIORIDAD_FMP: readonly string[] = ["ORO", "PLATA", "IDX_SPX", "BRENT", "EURUSD", "BTC"];
const PESO_ALTO = 3;
const PESO_NORMAL = 1;
/** Margen para que una serie no se salte un ciclo por segundos de diferencia entre corridas. */
const HOLGURA_MIN = 2;
/** Tras el cierre, cuánto tiempo se intenta capturar el último precio de la sesión. */
const VENTANA_CIERRE_MIN = 60;
/** Una serie que nunca se leyó se reintenta con el mercado cerrado como mucho cada tanto. */
const REINTENTO_PRIMERA_MIN = 360;

export interface EntradaPlan {
  series: SeriePlan[];
  ahora: Date;
  /** Llamadas por día; null = sin límite (p. ej. Finnhub, que limita por minuto). */
  limiteDia: number | null;
  usadasHoy: number;
  /** Llamadas que se guardan para otras tareas del mismo proveedor. */
  reserva?: number;
  cicloMin?: number;
  prioridad?: readonly string[];
  maxPorCiclo?: number;
}

function finDiaUtc(t: Date): Date {
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1));
}

const minutosDesde = (d: Date | null, ahora: Date) => (d ? (ahora.getTime() - d.getTime()) / 60_000 : Infinity);

export function planificar(e: EntradaPlan): Plan {
  const ciclo = e.cicloMin ?? 5;
  const prioridad = e.prioridad ?? PRIORIDAD_FMP;
  const maxPorCiclo = e.maxPorCiclo ?? 30;
  const peso = (id: string) => (prioridad.includes(id) ? PESO_ALTO : PESO_NORMAL);
  const rango = (id: string) => (prioridad.includes(id) ? prioridad.indexOf(id) : prioridad.length);
  const restantes = e.limiteDia === null ? null : Math.max(0, e.limiteDia - e.usadasHoy - (e.reserva ?? 0));
  const finDia = finDiaUtc(e.ahora);

  const disponibles = e.series.filter((s) => !s.denegadoHasta || s.denegadoHasta.getTime() <= e.ahora.getTime());

  // Qué podría pedirse ahora y por qué.
  const candidatas: { s: SeriePlan; motivo: MotivoConsulta }[] = [];
  const minutosRestantes = new Map<string, number>();
  for (const s of disponibles) {
    const est = estadoMercado(s.mercado, e.ahora);
    minutosRestantes.set(s.id, minutosAbiertos(s.mercado, e.ahora, finDia));
    if (est.abierto) {
      candidatas.push({ s, motivo: "abierto" });
    } else if (
      est.sesion &&
      (!s.ultimoOk || s.ultimoOk.getTime() < est.sesion.fin.getTime()) &&
      minutosDesde(est.sesion.fin, e.ahora) <= VENTANA_CIERRE_MIN &&
      (!s.ultimoIntento || s.ultimoIntento.getTime() < est.sesion.fin.getTime() || minutosDesde(s.ultimoIntento, e.ahora) >= ciclo - HOLGURA_MIN)
    ) {
      candidatas.push({ s, motivo: "cierre" });
    } else if (!s.ultimoOk && minutosDesde(s.ultimoIntento, e.ahora) >= REINTENTO_PRIMERA_MIN) {
      candidatas.push({ s, motivo: "primera" });
    }
  }

  // Cuánto costaría refrescar todo cada ciclo hasta el fin del día (UTC).
  const demanda =
    disponibles.reduce((n, s) => n + Math.ceil((minutosRestantes.get(s.id) ?? 0) / ciclo), 0) +
    candidatas.filter((c) => c.motivo !== "abierto").length;

  const intervaloMin: Record<string, number> = {};
  let modo: Plan["modo"];
  if (restantes === null || restantes >= demanda) {
    modo = "todo";
    for (const s of disponibles) intervaloMin[s.id] = ciclo;
  } else if (restantes === 0) {
    modo = "sin_presupuesto";
  } else {
    modo = "reparto";
    const ponderado = disponibles.reduce((n, s) => n + (minutosRestantes.get(s.id) ?? 0) * peso(s.id), 0);
    const k = ponderado / restantes;
    for (const s of disponibles) intervaloMin[s.id] = Math.max(ciclo, Math.ceil(k / peso(s.id)));
  }

  if (modo === "sin_presupuesto") return { modo, elegidas: [], restantes, intervaloMin };

  const debidas = candidatas.filter(
    (c) => c.motivo !== "abierto" || minutosDesde(c.s.ultimoIntento, e.ahora) >= (intervaloMin[c.s.id] ?? ciclo) - HOLGURA_MIN,
  );
  const atraso = (c: { s: SeriePlan }) => minutosDesde(c.s.ultimoIntento, e.ahora) / (intervaloMin[c.s.id] ?? ciclo);
  debidas.sort((a, b) => rango(a.s.id) - rango(b.s.id) || atraso(b) - atraso(a) || a.s.id.localeCompare(b.s.id));

  const tope = Math.min(maxPorCiclo, restantes ?? Infinity);
  const elegidas = debidas.slice(0, tope).map((c) => ({ id: c.s.id, simbolo: c.s.simbolo, motivo: c.motivo }));
  return { modo: elegidas.length ? modo : "nada_pendiente", elegidas, restantes, intervaloMin };
}
