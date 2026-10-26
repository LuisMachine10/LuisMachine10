// Aportes del plan (Fase F): pendientes del mes y de meses anteriores, «Omitir este mes» y la reubicación
// de la parte de un instrumento que venció. Puro, con big.js.
//
//   · Un aporte de un mes queda PENDIENTE hasta que Mena dice «Sí, lo hice» (una compra con aporte_mes) u
//     «Omitir este mes» (se guarda en personal.preferencias, clave «aportes»: id, mes y motivo; sin cifras).
//   · Se muestran los del mes en curso y los de meses anteriores sin responder, desde el mes en que empezó
//     el Presupuesto (o desde el inicio del plan del instrumento), como mucho 12 meses atrás.
//   · El monto de un mes pasado = lo presupuestado para ahorro ese mes en el Presupuesto × el reparto de hoy.
//   · Un instrumento que venció NO pasa su parte sola a los demás: se ofrece reubicarla y Mena confirma.

import Big from "big.js";
import { presupuestoAhorroMensual } from "../caja/resultados";
import type { DatosCaja } from "../caja/tipos";
import { CERO, n } from "./decimal";
import { mesPrevio } from "./fechas";
import type { Contexto } from "./posicion";
import { aportesDelPlan, repartoClases } from "./proyeccion";
import { type Activo, type Clase, IDS_CLASE } from "./tipos";

/** Meses hacia atrás que se revisan como mucho. */
export const MESES_ATRAS = 12;

export interface OmisionAporte {
  activoId: string;
  mes: string;
  motivo: string | null;
  /** Día en que Mena lo omitió (AAAA-MM-DD). */
  fecha: string;
}

export interface PrefAportes {
  omitidos: OmisionAporte[];
}

const ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Lee la preferencia «aportes» (lo que no sirva se descarta). */
export function leerPrefAportes(v: unknown): PrefAportes {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const lista = Array.isArray(o.omitidos) ? o.omitidos : [];
  const omitidos: OmisionAporte[] = [];
  for (const x of lista.slice(0, 600)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (typeof r.activoId !== "string" || !ID.test(r.activoId) || typeof r.mes !== "string" || !MES.test(r.mes)) continue;
    omitidos.push({
      activoId: r.activoId,
      mes: r.mes,
      motivo: typeof r.motivo === "string" && r.motivo.trim() ? r.motivo.trim().slice(0, 200) : null,
      fecha: typeof r.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : "",
    });
  }
  return { omitidos };
}

/** Agrega (o reemplaza) la omisión de un aporte. */
export function conOmision(pref: PrefAportes, o: OmisionAporte): PrefAportes {
  return { omitidos: [...pref.omitidos.filter((x) => !(x.activoId === o.activoId && x.mes === o.mes)), o] };
}

/** Quita la omisión (deshacer). */
export function sinOmision(pref: PrefAportes, activoId: string, mes: string): PrefAportes {
  return { omitidos: pref.omitidos.filter((x) => !(x.activoId === activoId && x.mes === mes)) };
}

export interface AporteDelMes {
  mes: string;
  activo: Activo;
  monto: Big;
  /** Parte del ahorro total (clase × dentro de la clase). */
  pct: Big;
  estado: "pendiente" | "hecho" | "omitido";
  hecho?: { fecha: string | null; monto: string };
  omision?: OmisionAporte;
}

export interface Confirmado {
  activoId: string;
  mes: string;
  fecha: string | null;
  monto: string;
}

/** Los aportes de un mes con su estado. `ahorro` = lo presupuestado para ahorro ese mes (RD$). */
export function aportesDeMes(ctx: Contexto, mes: string, ahorro: Big | null, confirmados: Confirmado[], pref: PrefAportes): AporteDelMes[] {
  return aportesDelPlan(ctx, ahorro)
    .filter((x) => x.monto.gt(0) && !x.vencido)
    .filter((x) => !x.activo.plan?.inicio || x.activo.plan.inicio.slice(0, 7) <= mes)
    .map((x) => {
      const c = confirmados.find((k) => k.activoId === x.activo.id && k.mes === mes);
      const o = pref.omitidos.find((k) => k.activoId === x.activo.id && k.mes === mes);
      const base = { mes, activo: x.activo, monto: x.monto, pct: x.pctClase.times(x.pctEnClase) };
      if (c) return { ...base, estado: "hecho" as const, hecho: { fecha: c.fecha, monto: c.monto } };
      if (o) return { ...base, estado: "omitido" as const, omision: o };
      return { ...base, estado: "pendiente" as const };
    });
}

/**
 * Aportes de meses ANTERIORES al de hoy que siguen sin responder (ni hechos ni omitidos), del más reciente
 * al más viejo. Desde el mes en que empezó el Presupuesto; sin Presupuesto, ninguno.
 */
export function pendientesAnteriores(ctx: Contexto, caja: DatosCaja | null, confirmados: Confirmado[], pref: PrefAportes): AporteDelMes[] {
  if (!caja?.config) return [];
  const desde = caja.config.inicio.slice(0, 7);
  const out: AporteDelMes[] = [];
  let mes = mesPrevio(ctx.hoy.slice(0, 7));
  for (let i = 0; i < MESES_ATRAS && mes >= desde; i++, mes = mesPrevio(mes)) {
    const ahorro = new Big(presupuestoAhorroMensual(caja, mes));
    if (ahorro.lte(0)) continue;
    out.push(...aportesDeMes(ctx, mes, ahorro, confirmados, pref).filter((x) => x.estado === "pendiente"));
  }
  return out;
}

// ───────────────────────── Instrumentos vencidos: reubicar su parte ─────────────────────────

export interface ParteVencida {
  activo: Activo;
  /** Parte del ahorro total que tenía (clase × dentro de la clase). */
  pct: Big;
  /** Lo que le tocaría este mes (RD$) con el ahorro de hoy. */
  monto: Big;
}

/** Instrumentos vencidos que todavía tienen una parte del ahorro (esperan que Mena diga a dónde va). */
export function partesVencidas(ctx: Contexto, ahorro: Big | null): ParteVencida[] {
  return aportesDelPlan(ctx, ahorro)
    .filter((x) => x.vencido && x.pctClase.times(x.pctEnClase).gt(0))
    .map((x) => ({ activo: x.activo, pct: x.pctClase.times(x.pctEnClase), monto: x.monto }));
}

/** Fracciones de reparto que se escriben: aporte_pct de cada instrumento tocado y, si hace falta, planClases. */
export interface Reubicacion {
  /** Instrumento → nueva fracción dentro de su clase (texto con 6 decimales). */
  aportePct: Record<string, string>;
  /** Reparto por clase nuevo (si cambió de clase); null = no se toca. */
  planClases: Record<Clase, string> | null;
  /** Parte del ahorro total que pasa (fracción). */
  parte: Big;
  /** Antes y después, por instrumento (parte del ahorro total), para la pantalla de confirmación. */
  antes: Record<string, Big>;
  despues: Record<string, Big>;
}

const fx = (b: Big) => b.round(6, Big.roundHalfUp).toFixed(6);

/** Fracción dentro de su clase de cada instrumento de la clase (lo escrito o partes iguales; incluye vencidos). */
function fraccionesDeClase(ctx: Contexto, clase: Clase): Map<string, Big> {
  const lista = ctx.activos.filter((a) => a.clase === clase);
  const escritos = lista.some((a) => a.plan?.aportePct !== null && a.plan?.aportePct !== undefined);
  const suma = lista.reduce((s, a) => s.plus(n(a.plan?.aportePct ?? null)), CERO);
  return new Map(lista.map((a) => [a.id, escritos ? (suma.gt(0) ? n(a.plan?.aportePct ?? null).div(suma) : CERO) : new Big(1).div(lista.length)]));
}

/**
 * Pasa toda la parte del instrumento vencido `vencidoId` al instrumento `destinoId`. Misma clase: se mueve
 * dentro de la clase. Otra clase: el reparto por clase cambia en esa parte (queda escrito como plan propio).
 * Devuelve null si no se puede (sin reparto, ids que no existen, destino vencido o el mismo).
 */
export function reubicarParte(ctx: Contexto, vencidoId: string, destinoId: string): Reubicacion | null {
  const rep = repartoClases(ctx);
  const v = ctx.activos.find((a) => a.id === vencidoId);
  const d = ctx.activos.find((a) => a.id === destinoId);
  if (!rep || !v || !d || v.id === d.id || (d.venc && d.venc < ctx.hoy) || !(v.venc && v.venc < ctx.hoy)) return null;
  const fv = fraccionesDeClase(ctx, v.clase as Clase);
  const parteEnClase = fv.get(v.id) ?? CERO;
  const parte = rep.pct[v.clase as Clase].times(parteEnClase);
  if (parte.lte(0)) return null;
  const total = (clase: Clase, f: Map<string, Big>, pct: Record<Clase, Big>) => new Map([...f].map(([id, x]) => [id, pct[clase].times(x)]));
  const antes: Record<string, Big> = {};
  for (const c of IDS_CLASE) for (const [id, x] of total(c, fraccionesDeClase(ctx, c), rep.pct)) antes[id] = x;

  const aportePct: Record<string, string> = {};
  let planClases: Record<Clase, string> | null = null;
  const nuevoPct = { ...rep.pct };
  if (d.clase === v.clase) {
    for (const [id, x] of fv) aportePct[id] = fx(id === v.id ? CERO : id === d.id ? x.plus(parteEnClase) : x);
  } else {
    const cv = v.clase as Clase;
    const cd = d.clase as Clase;
    const fd = fraccionesDeClase(ctx, cd);
    nuevoPct[cv] = rep.pct[cv].minus(parte);
    nuevoPct[cd] = rep.pct[cd].plus(parte);
    // Clase de origen: los demás conservan su proporción entre ellos; el vencido queda en 0.
    const resto = new Big(1).minus(parteEnClase);
    for (const [id, x] of fv) aportePct[id] = fx(id === v.id || resto.lte(0) ? CERO : x.div(resto));
    // Clase de destino: cada uno conserva su monto y el destino suma la parte.
    for (const [id, x] of fd) {
      const monto = rep.pct[cd].times(x).plus(id === d.id ? parte : CERO);
      aportePct[id] = fx(nuevoPct[cd].gt(0) ? monto.div(nuevoPct[cd]) : CERO);
    }
    planClases = Object.fromEntries(IDS_CLASE.map((c) => [c, fx(nuevoPct[c])])) as Record<Clase, string>;
  }
  const despues: Record<string, Big> = {};
  for (const c of IDS_CLASE) {
    for (const a of ctx.activos.filter((x) => x.clase === c)) {
      const f = aportePct[a.id] !== undefined ? new Big(aportePct[a.id]) : (fraccionesDeClase(ctx, c).get(a.id) ?? CERO);
      despues[a.id] = nuevoPct[c].times(f);
    }
  }
  return { aportePct, planClases, parte, antes, despues };
}
