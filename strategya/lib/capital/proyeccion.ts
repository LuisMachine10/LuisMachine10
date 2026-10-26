// Proyecciones del Portafolio (Núcleo v2, manual de lógica financiera secciones A y C).
//
// Aportes: EXACTAMENTE las líneas del plan del mes («Lo que planeaste ahorrar este mes»: instrumento + monto en su
// moneda, lib/finanzas/plan.ts). Ya no hay reparto por porcentajes: la Política de inversión solo compara.
//
// Cada instrumento rinde según su TIPO (lib/finanzas/catalogo.ts), mes a mes con big.js (tasa anual ÷ 12):
//   · Efectivo, cuenta corriente y bienes no rinden. La cuenta de ahorro: por ahora su interés mínimo no se cuenta.
//   · Alto rendimiento y fondo abierto capitalizan (el interés se queda adentro y gana interés).
//   · Certificado, fondo cerrado y fideicomiso: lo que Mena eligió (capitaliza o paga a una cuenta). Sin elegir, NO
//     se proyecta su interés (no se supone) y la pantalla lo pide.
//   · Mutuo/reporto: no capitaliza solo. Cada plazo (30 días ≈ 1 mes) se renueva: si Mena deja el interés (lo que
//     escribió en su plan o lo que hizo en su última renovación) entra al capital; si no, se cobra.
//   · Bono, acción/ETF: el cupón o dividendo se cobra en una cuenta (no capitaliza).
//   · Retención del interés: la del instrumento o la del tipo (certificados bancarios 10 %). Comisión de
//     administración de puesto de bolsa: solo si está anotada; si no, «no confirmado» (no se inventa).
//   · El aporte del mes entra al final del mes (gana desde el siguiente). Al vencer (certificado, bono) se paga lo
//     pendiente y deja de ganar y de recibir aportes: no se supone una renovación que Mena no escribió.
// Es una proyección con los datos de Mena, no un pronóstico: la pantalla lo dice siempre.

import { CATALOGO, capitalizaDe, retencionDe, tasaQueCuenta, type TipoFin, tipoInicial } from "../finanzas/catalogo";
import { estadoMutuo, mesesDePlazo } from "../finanzas/mutuo";
import { Big, CERO, n, redondearTrabajo } from "./decimal";
import { mesesEntre } from "./fechas";
import { type Contexto, fxDe, valorDOP } from "./posicion";
import { type Activo, type Clase, FRECUENCIAS_PAGO, IDS_CLASE } from "./tipos";

export interface Reglas {
  /** Tasa anual (fracción) que cuenta. */
  tasa: Big;
  capitaliza: boolean;
  /** Si no capitaliza: meses entre pagos de interés; 0 = todo al vencer. */
  cadaMeses: number;
  reinvierte: boolean;
  /** Aporte de cada mes (RD$). */
  aporte: Big;
  /** Primer mes (1 = el próximo cierre de mes) en que entra aporte. */
  desdeMes: number;
  /** Último mes con aporte (null = sin fin). */
  hastaMes?: number | null;
  /** Mes en que vence (1 = este mes), o null. */
  vence: number | null;
  /** Retención del interés (fracción). */
  retencion?: Big;
  /** Comisión de administración al año (fracción). null = no se descuenta. */
  comision?: Big | null;
  /** true si algo no lo escribió Mena y se usa lo del tipo (la pantalla lo dice). */
  supuesto: boolean;
  /** Tipo elegible sin elegir (certificado, fondo cerrado, fideicomiso): su interés no se proyecta. */
  sinElegir?: boolean;
  /** Puesto de bolsa sin comisión anotada: «no confirmado». */
  comisionNoConfirmada?: boolean;
  /** De dónde sale la regla de reinversión de un mutuo. */
  origenReinversion?: "plan" | "ultima_renovacion" | "no_capitaliza_solo";
}

export interface PuntoInstrumento {
  mes: number;
  /** Lo que hay dentro del instrumento (incluye interés ya ganado y aún no pagado). */
  saldo: Big;
  /** Intereses (netos) pagados que NO se reinvirtieron: dinero que salió a una cuenta. */
  cobrado: Big;
  /** Saldo inicial + aportes. */
  aportado: Big;
  /** Lo que ganaron los intereses (neto de retención y comisiones): saldo + cobrado − aportado. */
  interes: Big;
  /** Interés bruto acumulado (antes de retención). */
  bruto: Big;
  /** Retención acumulada. */
  retenido: Big;
  /** Comisiones acumuladas. */
  comisiones: Big;
}

/** Mes a mes desde el saldo de hoy (mes 0) hasta `meses`. */
export function proyectarInstrumento(saldo0: Big, r: Reglas, meses: number): PuntoInstrumento[] {
  let principal = saldo0;
  let devengado = CERO;
  let cobrado = CERO;
  let aportado = saldo0;
  let bruto = CERO;
  let retenido = CERO;
  let comisiones = CERO;
  const tasaMes = r.tasa.div(12);
  const ret = r.retencion ?? CERO;
  const comMes = r.comision && r.comision.gt(0) ? r.comision.div(12) : null;
  const pts: PuntoInstrumento[] = [{ mes: 0, saldo: saldo0, cobrado: CERO, aportado, interes: CERO, bruto, retenido, comisiones }];
  for (let t = 1; t <= meses; t++) {
    const activo = r.vence === null || t <= r.vence;
    if (activo) {
      const b = redondearTrabajo(principal.times(tasaMes));
      const retiene = redondearTrabajo(b.times(ret));
      const interes = b.minus(retiene);
      bruto = bruto.plus(b);
      retenido = retenido.plus(retiene);
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
      if (comMes) {
        const c = redondearTrabajo(principal.times(comMes));
        principal = principal.minus(c);
        comisiones = comisiones.plus(c);
      }
      const conAporte = t >= r.desdeMes && (r.hastaMes === null || r.hastaMes === undefined || t <= r.hastaMes) && t !== r.vence;
      if (conAporte && r.aporte.gt(0)) {
        principal = principal.plus(r.aporte);
        aportado = aportado.plus(r.aporte);
      }
    }
    const saldo = principal.plus(devengado);
    pts.push({ mes: t, saldo, cobrado, aportado, interes: saldo.plus(cobrado).minus(aportado), bruto, retenido, comisiones });
  }
  return pts;
}

/** Tipo del instrumento (sin tipo, el de su clase con la misma regla de la migración). */
export function tipoDe(a: Activo): TipoFin {
  return a.tipo ?? tipoInicial({ clase: a.clase, subtipo: a.subtipo ?? null, nombre: a.nombre, institucion: a.inst, simbolo: a.simbolo, tipoRF: a.tipoRF }).tipo;
}

/** Las reglas de un instrumento según su tipo y lo que Mena eligió. */
export function reglasDe(a: Activo, aporte: Big, hoy: string, op: { desdeMes?: number; hastaMes?: number | null } = {}): Reglas {
  const tipo = tipoDe(a);
  const regla = CATALOGO[tipo];
  const plan = a.plan;
  let tasa = n(tasaQueCuenta(tipo, a.tasa));
  let capitaliza = capitalizaDe(tipo, plan?.capitaliza ?? null);
  let supuesto = false;
  let sinElegir = false;
  let cadaMeses = 1;
  let reinvierte = false;
  let origenReinversion: Reglas["origenReinversion"];
  if (capitaliza === null) {
    // Elegible sin elegir: no se supone; su interés no se proyecta.
    sinElegir = true;
    capitaliza = true;
    tasa = CERO;
  } else if (!capitaliza) {
    if (tipo === "mutuo") {
      cadaMeses = mesesDePlazo(a.plazoDias);
      const ultima = estadoMutuo(a.cantidad, a.renovaciones ?? []).dejaInteres;
      if (plan?.reinvierte !== null && plan?.reinvierte !== undefined) {
        reinvierte = plan.reinvierte;
        origenReinversion = "plan";
      } else if (ultima !== null) {
        reinvierte = ultima;
        origenReinversion = "ultima_renovacion";
      } else origenReinversion = "no_capitaliza_solo";
    } else {
      const f = FRECUENCIAS_PAGO.find((x) => x.id === plan?.frecuenciaPago);
      if (!f) supuesto = tasa.gt(0);
      cadaMeses = f?.meses ?? 1;
      // Cupones, dividendos e intereses que se pagan a una cuenta: se cobran (no vuelven solos al instrumento).
      reinvierte = false;
    }
  }
  const vence = tipo === "mutuo" ? null : a.venc && a.venc >= hoy ? Math.max(1, mesesEntre(hoy.slice(0, 7), a.venc.slice(0, 7))) : a.venc && a.venc < hoy ? 0 : null;
  const comision = a.comisionAdmin ? n(a.comisionAdmin) : null;
  return {
    tasa,
    capitaliza,
    cadaMeses,
    reinvierte,
    aporte,
    desdeMes: op.desdeMes ?? 1,
    hastaMes: op.hastaMes ?? null,
    vence,
    retencion: n(retencionDe(tipo, a.retencion ?? null)),
    comision,
    supuesto,
    sinElegir,
    comisionNoConfirmada: regla.comisionPuesto && comision === null && tasa.gt(0),
    origenReinversion,
  };
}

/** Aporte mensual de un instrumento según el plan del mes (en su moneda), con el mes desde y hasta cuándo entra. */
export interface AportePlan {
  monto: Big;
  moneda: string;
  desdeMes?: number;
  hastaMes?: number | null;
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
  /** Suma de los aportes del plan del mes (RD$). null = no hay líneas. */
  ahorroMensual: Big | null;
  /** Líneas del plan cuyo instrumento no está en el Portafolio o no tiene tipo de cambio. */
  aportesSinDestino: string[];
}

/** Proyección con los aportes EXACTOS del plan del mes (id del registro → monto en su moneda). */
export function proyectarPortafolio(ctx: Contexto, meses: number, aportes: Map<string, AportePlan> = new Map()): ProyeccionPortafolio {
  const porInstrumento: ProyeccionPortafolio["porInstrumento"] = [];
  const sinValorar: Activo[] = [];
  let ahorro = CERO;
  const usados = new Set<string>();
  for (const a of ctx.activos) {
    const v = valorDOP(ctx, a);
    if (v === null) {
      sinValorar.push(a);
      continue;
    }
    const ap = aportes.get(a.id);
    let aporte = CERO;
    if (ap) {
      const fx = fxDe(ctx, ap.moneda as Activo["moneda"]);
      if (fx) {
        aporte = ap.monto.times(fx);
        usados.add(a.id);
        ahorro = ahorro.plus(aporte);
      }
    }
    const reglas = reglasDe(a, aporte, ctx.hoy, { desdeMes: ap?.desdeMes, hastaMes: ap?.hastaMes });
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
  return {
    meses,
    puntos,
    porClase,
    porInstrumento,
    sinValorar,
    ahorroMensual: aportes.size ? ahorro : null,
    aportesSinDestino: [...aportes.keys()].filter((id) => !usados.has(id)),
  };
}

/** Horizonte en meses: el de la página (?anios=), o el de los parámetros, o 10 años. */
export function horizonteMeses(ctx: Contexto, anios?: string | null): number {
  const pedido = anios && /^\d{1,2}$/.test(anios) ? Number(anios) : null;
  const h = pedido ?? (n(ctx.p.horizonte).gt(0) ? Math.round(Number(n(ctx.p.horizonte).toFixed(0))) : 10);
  return Math.min(40, Math.max(1, h)) * 12;
}

/** «Cuánto te deja al mes» una cuenta de alto rendimiento (o cualquier instrumento que rinde): saldo × tasa ÷ 12, neto de retención. */
export function cuantoDejaAlMes(a: Activo): Big | null {
  const tipo = tipoDe(a);
  const tasa = n(tasaQueCuenta(tipo, a.tasa));
  if (tasa.lte(0)) return null;
  const b = n(a.cantidad).times(n(a.precio || "1")).times(tasa).div(12);
  return b.times(new Big(1).minus(n(retencionDe(tipo, a.retencion ?? null)))).round(2, Big.roundHalfUp);
}
