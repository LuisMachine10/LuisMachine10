// Proyecciones con aportes del Presupuesto (pedido de Mena, oct. 2026): «basado en mi presupuesto se
// determina cuánto va a cada tipo de inversión, y de ahí se agrega mensualmente en las proyecciones».
//
// Reparto: el ahorro presupuestado del mes (contrato personal.presupuesto_ahorro_mensual) se divide por
// clase (planClases, o la meta de asignación de la Política) y, dentro de cada clase, entre sus
// instrumentos (aporte_pct de cada uno, o partes iguales).
//
// Interés compuesto mes a mes, con big.js (sin float): la tasa anual se aplica como tasa nominal ÷ 12.
//   · Capitaliza dentro del instrumento: el interés del mes se suma al saldo y gana interés el mes siguiente.
//   · No capitaliza: el interés se va juntando y se paga cada 1, 3, 6 o 12 meses (o todo al vencer). Si
//     Mena lo reinvierte, entra al saldo (así crea ella misma el interés compuesto); si no, queda cobrado.
//   · El aporte del mes entra al final del mes (empieza a ganar el mes siguiente), desde plan_inicio.
//   · Al vencer: se paga lo pendiente y el instrumento deja de ganar y de recibir aportes (sin suponer
//     una reinversión que Mena no escribió).
// Es una proyección con los supuestos de Mena, no un pronóstico: la pantalla lo dice siempre.

import { Big, CERO, n, redondearTrabajo } from "./decimal";
import { mesesEntre } from "./fechas";
import { type Contexto, valorDOP } from "./posicion";
import { type Activo, type Clase, FRECUENCIAS_PAGO, IDS_CLASE } from "./tipos";

export interface Reglas {
  /** Tasa anual (fracción). */
  tasa: Big;
  capitaliza: boolean;
  /** Si no capitaliza: meses entre pagos de interés; 0 = todo al vencer. */
  cadaMeses: number;
  reinvierte: boolean;
  /** Aporte de cada mes (RD$). */
  aporte: Big;
  /** Primer mes (1 = el próximo cierre de mes) en que entra aporte. */
  desdeMes: number;
  /** Mes en que vence (1 = este mes), o null. */
  vence: number | null;
  /** true si capitaliza/frecuencia no los escribió Mena (la pantalla lo dice). */
  supuesto: boolean;
}

export interface PuntoInstrumento {
  mes: number;
  /** Lo que hay dentro del instrumento (incluye interés ya ganado y aún no pagado). */
  saldo: Big;
  /** Intereses pagados que NO se reinvirtieron (dinero que salió del instrumento). */
  cobrado: Big;
  /** Saldo inicial + aportes. */
  aportado: Big;
  /** Lo que ganaron los intereses: saldo + cobrado − aportado. */
  interes: Big;
}

/** Mes a mes desde el saldo de hoy (mes 0) hasta `meses`. */
export function proyectarInstrumento(saldo0: Big, r: Reglas, meses: number): PuntoInstrumento[] {
  let principal = saldo0;
  let devengado = CERO;
  let cobrado = CERO;
  let aportado = saldo0;
  const tasaMes = r.tasa.div(12);
  const pts: PuntoInstrumento[] = [{ mes: 0, saldo: saldo0, cobrado: CERO, aportado, interes: CERO }];
  for (let t = 1; t <= meses; t++) {
    const activo = r.vence === null || t <= r.vence;
    if (activo) {
      const interes = redondearTrabajo(principal.times(tasaMes));
      if (r.capitaliza) principal = principal.plus(interes);
      else {
        devengado = devengado.plus(interes);
        const paga = t === r.vence || (r.cadaMeses > 0 && t % r.cadaMeses === 0);
        if (paga) {
          if (r.reinvierte) principal = principal.plus(devengado);
          else cobrado = cobrado.plus(devengado);
          devengado = CERO;
        }
      }
      if (t >= r.desdeMes && t !== r.vence && r.aporte.gt(0)) {
        principal = principal.plus(r.aporte);
        aportado = aportado.plus(r.aporte);
      }
    }
    const saldo = principal.plus(devengado);
    pts.push({ mes: t, saldo, cobrado, aportado, interes: saldo.plus(cobrado).minus(aportado) });
  }
  return pts;
}

/** Reglas de un instrumento: lo que Mena escribió en su plan o, si falta, un supuesto razonable y dicho. */
export function reglasDe(a: Activo, aporte: Big, hoy: string): Reglas {
  const plan = a.plan;
  const supuesto = plan?.capitaliza === null || plan?.capitaliza === undefined;
  let capitaliza = plan?.capitaliza ?? true;
  let cadaMeses = 1;
  let reinvierte = plan?.reinvierte ?? false;
  if (supuesto) {
    // Cupón: paga cada mes y no se reinvierte. Lo demás (ahorros, fondos, acumula) se supone capitalizable.
    if (a.clase === "rentafija" && a.tipoRF === "cupon") {
      capitaliza = false;
      cadaMeses = 1;
      reinvierte = false;
    }
  } else if (!capitaliza) {
    const f = FRECUENCIAS_PAGO.find((x) => x.id === plan?.frecuenciaPago) ?? FRECUENCIAS_PAGO[0];
    cadaMeses = f.meses;
  }
  const vence = a.venc && a.venc >= hoy ? Math.max(1, mesesEntre(hoy.slice(0, 7), a.venc.slice(0, 7))) : null;
  const desdeMes = plan?.inicio && plan.inicio > hoy ? Math.max(1, mesesEntre(hoy.slice(0, 7), plan.inicio.slice(0, 7))) : 1;
  return { tasa: n(a.tasa), capitaliza, cadaMeses, reinvierte, aporte, desdeMes, vence: a.venc && a.venc < hoy ? 0 : vence, supuesto };
}

/** Reparto por clase (fracciones): planClases o la meta de asignación; si no hay nada escrito, null. */
export function repartoClases(ctx: Contexto): { pct: Record<Clase, Big>; origen: "plan" | "meta" } | null {
  const fuente = ctx.p.planClases ? "plan" : "meta";
  const crudo = ctx.p.planClases ?? ctx.p.metaAsignacion;
  const pct = Object.fromEntries(IDS_CLASE.map((c) => [c, n(crudo[c])])) as Record<Clase, Big>;
  const suma = IDS_CLASE.reduce((s, c) => s.plus(pct[c]), CERO);
  if (suma.lte(0)) return null;
  // Si no suman 100 %, se reparte en proporción (y la pantalla muestra la suma).
  if (!suma.eq(1)) for (const c of IDS_CLASE) pct[c] = pct[c].div(suma);
  return { pct, origen: fuente };
}

export interface AporteInstrumento {
  activo: Activo;
  pctClase: Big;
  pctEnClase: Big;
  monto: Big;
  /**
   * Ya venció: su parte NO se reparte sola entre los demás (Fase F: nada automático). Queda «sin destino»
   * hasta que Mena confirme a dónde va (Proyecciones → «Venció…»). No se pide como aporte del mes.
   */
  vencido: boolean;
}

/** Cuánto va a cada instrumento al mes: ahorro × % de su clase × % dentro de la clase. */
export function aportesDelPlan(ctx: Contexto, ahorroMensual: Big | null): AporteInstrumento[] {
  const rep = repartoClases(ctx);
  if (!rep || !ahorroMensual || ahorroMensual.lte(0)) return [];
  const out: AporteInstrumento[] = [];
  for (const c of IDS_CLASE) {
    const lista = ctx.activos.filter((a) => a.clase === c);
    if (!lista.length || rep.pct[c].lte(0)) continue;
    const escritos = lista.some((a) => a.plan?.aportePct !== null && a.plan?.aportePct !== undefined);
    const sumaEscritos = lista.reduce((s, a) => s.plus(n(a.plan?.aportePct ?? null)), CERO);
    for (const a of lista) {
      const pctEnClase = escritos ? (sumaEscritos.gt(0) ? n(a.plan?.aportePct ?? null).div(sumaEscritos) : CERO) : new Big(1).div(lista.length);
      const monto = ahorroMensual.times(rep.pct[c]).times(pctEnClase).round(2, Big.roundHalfEven);
      out.push({ activo: a, pctClase: rep.pct[c], pctEnClase, monto, vencido: !!(a.venc && a.venc < ctx.hoy) });
    }
  }
  return out;
}

export interface ProyeccionClase {
  clase: Clase;
  hoy: Big;
  final: Big;
  aportado: Big;
  interes: Big;
}

export interface ProyeccionPortafolio {
  meses: number;
  /** Totales por mes (RD$): lo aportado (saldo de hoy + aportes) y lo que ganaron los intereses. */
  puntos: { mes: number; aportado: Big; interes: Big; total: Big }[];
  porClase: ProyeccionClase[];
  porInstrumento: { activo: Activo; reglas: Reglas; aporte: Big; pts: PuntoInstrumento[] }[];
  sinValorar: Activo[];
  ahorroMensual: Big | null;
}

export function proyectarPortafolio(ctx: Contexto, meses: number, ahorroMensual: Big | null): ProyeccionPortafolio {
  const aportes = new Map(aportesDelPlan(ctx, ahorroMensual).filter((x) => !x.vencido).map((x) => [x.activo.id, x.monto]));
  const porInstrumento: ProyeccionPortafolio["porInstrumento"] = [];
  const sinValorar: Activo[] = [];
  for (const a of ctx.activos) {
    const v = valorDOP(ctx, a);
    if (v === null) {
      sinValorar.push(a);
      continue;
    }
    const aporte = aportes.get(a.id) ?? CERO;
    const reglas = reglasDe(a, aporte, ctx.hoy);
    porInstrumento.push({ activo: a, reglas, aporte, pts: proyectarInstrumento(v, reglas, meses) });
  }
  const puntos: ProyeccionPortafolio["puntos"] = [];
  for (let t = 0; t <= meses; t++) {
    let aportado = CERO;
    let interes = CERO;
    for (const x of porInstrumento) {
      aportado = aportado.plus(x.pts[t].aportado);
      interes = interes.plus(x.pts[t].interes);
    }
    puntos.push({ mes: t, aportado, interes, total: aportado.plus(interes) });
  }
  const porClase = IDS_CLASE.map((c) => {
    const xs = porInstrumento.filter((x) => x.activo.clase === c);
    const sum = (f: (p: PuntoInstrumento) => Big, t: number) => xs.reduce((s, x) => s.plus(f(x.pts[t])), CERO);
    return {
      clase: c,
      hoy: sum((p) => p.saldo, 0),
      final: sum((p) => p.saldo.plus(p.cobrado), meses),
      aportado: sum((p) => p.aportado, meses),
      interes: sum((p) => p.interes, meses),
    };
  });
  return { meses, puntos, porClase, porInstrumento, sinValorar, ahorroMensual };
}

/** Ahorro mensual presupuestado (RD$) desde el contrato del Presupuesto, o null. */
export function ahorroPresupuestado(ctx: Contexto): Big | null {
  const a = ctx.presupuesto?.ahorroMensual;
  return a ? new Big(a) : null;
}

/** Horizonte en meses: el de la página (?anios=), o el de los parámetros, o 10 años. */
export function horizonteMeses(ctx: Contexto, anios?: string | null): number {
  const pedido = anios && /^\d{1,2}$/.test(anios) ? Number(anios) : null;
  const h = pedido ?? (n(ctx.p.horizonte).gt(0) ? Math.round(Number(n(ctx.p.horizonte).toFixed(0))) : 10);
  return Math.min(40, Math.max(1, h)) * 12;
}
