// Ciclo de una tarjeta de crédito: corte, fecha límite y el día en que Mena quiere pagar. Puro, sin red.
//
// Reglas (pedido de Mena, migración 20261028000100_tarjetas_ciclo.sql):
//   · Corte: el «día de corte» de cada mes; si ese mes no tiene ese día (31 en noviembre, 30 en febrero), corta
//     el último día del mes.
//   · Fecha límite = fecha de corte + «días para pagar» (días naturales).
//   · Pago elegido = la primera fecha del rango (corte, límite] cuyo día del mes es el «día en que quieres pagar»
//     (si un mes no tiene ese día, cuenta su último día, igual que los pagos fijos del Presupuesto). Si ninguna
//     cae en el rango: «tu día de pago cae después de la fecha límite» y se sugiere el último día posible (la
//     fecha límite).
// Ejemplo de Mena: corta el 15 nov 2026, 28 días → límite 13 dic 2026; quiere pagar el 30 → paga el 30 nov 2026 y
// le sobran 13 días.

import { type Fecha, diasDelMes, diasEntre, fechaBreve, mesDe, sumarDias, sumarMeses, type Mes } from "./fechas";

export interface CicloTarjeta {
  /** Día del mes del corte (1–31). */
  diaCorte: number;
  /** Días naturales desde el corte hasta la fecha límite (1–60). */
  diasParaPagar: number;
  /** Día del mes en que Mena quiere pagar (1–31) o null si no lo escribió. */
  diaPago: number | null;
}

export interface FechasCiclo {
  corte: Fecha;
  limite: Fecha;
  /** Fecha de pago elegida dentro de (corte, límite]; null si no hay día elegido o no cae en el rango. */
  pago: Fecha | null;
  /** El día elegido no cae antes de la fecha límite: hay que pagar a más tardar `sugerido`. */
  fueraDeRango: boolean;
  /** Fecha que se muestra para pagar: la elegida o, si no cabe o no hay, la límite (el último día posible). */
  sugerido: Fecha;
  /** Días entre la fecha elegida y la límite («te sobran 13 días»). null sin fecha elegida. */
  sobran: number | null;
}

export const DIAS_PARA_PAGAR_MAX = 60;
/** Días antes de la fecha límite en que se avisa si no hay pago anotado del ciclo. */
export const DIAS_AVISO_LIMITE = 3;

/** La fecha del día `dia` en el mes `mes`; si el mes no tiene ese día, su último día. */
export function diaEnMes(mes: Mes, dia: number): Fecha {
  const [a, m] = mes.split("-").map(Number);
  const d = Math.min(Math.max(1, Math.trunc(dia)), diasDelMes(a, m));
  return `${mes}-${String(d).padStart(2, "0")}`;
}

/** ¿Es `f` el día `dia` de su mes (o su último día si el mes es más corto)? */
export function esDiaDelMes(f: Fecha, dia: number): boolean {
  return diaEnMes(mesDe(f), dia) === f;
}

/** El próximo corte desde `desde` (incluido). */
export function proximoCorte(desde: Fecha, diaCorte: number): Fecha {
  const este = diaEnMes(mesDe(desde), diaCorte);
  return este >= desde ? este : diaEnMes(sumarMeses(mesDe(desde), 1), diaCorte);
}

/** Fecha límite y fecha de pago del ciclo que corta en `corte`. */
export function fechasDelCiclo(corte: Fecha, c: CicloTarjeta): FechasCiclo {
  const limite = sumarDias(corte, c.diasParaPagar);
  let pago: Fecha | null = null;
  if (c.diaPago) {
    for (let d = sumarDias(corte, 1); d <= limite; d = sumarDias(d, 1)) {
      if (esDiaDelMes(d, c.diaPago)) {
        pago = d;
        break;
      }
    }
  }
  const fueraDeRango = c.diaPago !== null && pago === null;
  return { corte, limite, pago, fueraDeRango, sugerido: pago ?? limite, sobran: pago ? diasEntre(pago, limite) : null };
}

/** Los ciclos cuyo corte cae en los meses de `desde` −3 a `hasta` +1, en orden (para buscar y para el calendario). */
function ciclosCerca(desde: Fecha, hasta: Fecha, c: CicloTarjeta): FechasCiclo[] {
  const out: FechasCiclo[] = [];
  const fin = sumarMeses(mesDe(hasta), 1);
  for (let m = sumarMeses(mesDe(desde), -3); m <= fin; m = sumarMeses(m, 1)) out.push(fechasDelCiclo(diaEnMes(m, c.diaCorte), c));
  return out;
}

/**
 * El ciclo que importa hoy: el primero cuya fecha límite todavía no pasa (la de hoy cuenta). Si ya cortó y aún
 * no vence, es ese (lo que toca pagar); si no, el del próximo corte.
 */
export function cicloVigente(hoy: Fecha, c: CicloTarjeta): FechasCiclo {
  const lista = ciclosCerca(hoy, hoy, c);
  return lista.find((x) => x.limite >= hoy && x.corte <= hoy) ?? lista.find((x) => x.corte >= hoy) ?? fechasDelCiclo(proximoCorte(hoy, c.diaCorte), c);
}

/** El ciclo del próximo corte (desde hoy, incluido). */
export function cicloDelProximoCorte(hoy: Fecha, c: CicloTarjeta): FechasCiclo {
  return fechasDelCiclo(proximoCorte(hoy, c.diaCorte), c);
}

export type MarcaCiclo = "corte" | "pago" | "limite";

/** Fechas de corte, pago elegido y límite que caen entre `desde` y `hasta` (para marcar el calendario). */
export function marcasEntre(desde: Fecha, hasta: Fecha, c: CicloTarjeta): { fecha: Fecha; marca: MarcaCiclo; ciclo: FechasCiclo }[] {
  const out: { fecha: Fecha; marca: MarcaCiclo; ciclo: FechasCiclo }[] = [];
  const dentro = (f: Fecha | null): f is Fecha => !!f && f >= desde && f <= hasta;
  for (const ci of ciclosCerca(desde, hasta, c)) {
    if (dentro(ci.corte)) out.push({ fecha: ci.corte, marca: "corte", ciclo: ci });
    if (dentro(ci.pago)) out.push({ fecha: ci.pago, marca: "pago", ciclo: ci });
    if (dentro(ci.limite)) out.push({ fecha: ci.limite, marca: "limite", ciclo: ci });
  }
  return out.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

/** «Corte 15 nov · pagas el 30 nov · fecha límite 13 dic». Si ya cortó: «Cortó el 15 oct · …». */
export function lineaCiclo(f: FechasCiclo, hoy: Fecha): string {
  const corte = f.corte < hoy ? `Cortó el ${fechaBreve(f.corte)}` : `Corte ${fechaBreve(f.corte)}`;
  const pago = f.pago ? `pagas el ${fechaBreve(f.pago)}` : f.fueraDeRango ? `paga a más tardar el ${fechaBreve(f.limite)}` : null;
  return [corte, pago, `fecha límite ${fechaBreve(f.limite)}`].filter(Boolean).join(" · ");
}

/** Frase de ayuda: «te sobran 13 días» o el aviso de día fuera de rango. null si no hay nada que decir. */
export function notaCiclo(f: FechasCiclo, c: CicloTarjeta): string | null {
  if (f.fueraDeRango) {
    return `Tu día de pago (el ${c.diaPago}) cae después de la fecha límite: lo último posible es el ${fechaBreve(f.limite)}.`;
  }
  if (f.sobran !== null) return f.sobran === 0 ? "Pagas justo el día de la fecha límite." : `Te sobran ${f.sobran} ${f.sobran === 1 ? "día" : "días"} antes de la fecha límite.`;
  return null;
}

export interface AvisoLimite {
  ciclo: FechasCiclo;
  /** Días que faltan para la fecha límite (0 = hoy). */
  faltan: number;
}

/**
 * Aviso cuando faltan `DIAS_AVISO_LIMITE` días o menos para la fecha límite del ciclo vigente y no hay ningún
 * pago anotado después del corte (`pagos`: fechas de los pagos registrados a esa tarjeta).
 */
export function avisoLimite(hoy: Fecha, c: CicloTarjeta, pagos: readonly Fecha[]): AvisoLimite | null {
  const ci = cicloVigente(hoy, c);
  if (ci.corte > hoy) return null;
  const faltan = diasEntre(hoy, ci.limite);
  if (faltan < 0 || faltan > DIAS_AVISO_LIMITE) return null;
  if (pagos.some((p) => p > ci.corte && p <= hoy)) return null;
  return { ciclo: ci, faltan };
}

/** «hoy», «mañana», «en 3 días». */
export function cuandoFalta(faltan: number): string {
  return faltan <= 0 ? "hoy" : faltan === 1 ? "mañana" : `en ${faltan} días`;
}

export type ResultadoCiclo = { ok: true; valor: { dia_corte: number | null; dias_para_pagar: number | null; dia_pago: number | null } } | { ok: false; error: string };

const entero = (v: string | undefined) => (v ?? "").trim();

/**
 * Lee los 3 campos del ciclo de un formulario. Corte y días para pagar van juntos (los dos o ninguno); el día en
 * que quieres pagar es opcional. Errores en palabras simples.
 */
export function cicloDeFormulario(c: { diaCorte?: string; diasParaPagar?: string; diaPago?: string }): ResultadoCiclo {
  const corte = entero(c.diaCorte);
  const dias = entero(c.diasParaPagar);
  const pago = entero(c.diaPago);
  const dia = (s: string) => /^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 31;
  if (corte && !dia(corte)) return { ok: false, error: "El día de corte es un número del 1 al 31, por ejemplo 15." };
  if (dias && (!/^\d{1,2}$/.test(dias) || Number(dias) < 1 || Number(dias) > DIAS_PARA_PAGAR_MAX))
    return { ok: false, error: `Los días para pagar después del corte son un número del 1 al ${DIAS_PARA_PAGAR_MAX}, por ejemplo 28.` };
  if (pago && !dia(pago)) return { ok: false, error: "El día en que quieres pagar es un número del 1 al 31, por ejemplo 30." };
  if (!!corte !== !!dias) return { ok: false, error: "Para calcular tu fecha límite escribe los dos: el día de corte y cuántos días tienes para pagar después del corte (por ejemplo 15 y 28)." };
  return { ok: true, valor: { dia_corte: corte ? Number(corte) : null, dias_para_pagar: dias ? Number(dias) : null, dia_pago: pago ? Number(pago) : null } };
}

/** El ciclo de una tarjeta si tiene corte y días para pagar; si no, null. */
export function cicloDe(x: { diaCorte?: number | null; diasParaPagar?: number | null; diaPago?: number | null }): CicloTarjeta | null {
  if (!x.diaCorte || !x.diasParaPagar) return null;
  return { diaCorte: x.diaCorte, diasParaPagar: x.diasParaPagar, diaPago: x.diaPago ?? null };
}

