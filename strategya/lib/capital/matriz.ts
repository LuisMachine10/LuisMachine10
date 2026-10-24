// Matriz de riesgo 3×3 (impacto × probabilidad: bajo, medio, alto) para los 4 riesgos que eligió Mena:
// liquidez y colchón, concentración, moneda (dólar), presupuesto y deuda. Umbrales en Ajustes del
// Portafolio (parametros.umbrales). Gastos e ingresos salen del Presupuesto (contrato personal.resultado_mes);
// sin Presupuesto, del cierre del mes. Describe y compara con los límites de Mena: no recomienda inversiones.

import { Big, CERO, n } from "./decimal";
import { gastoPromedio } from "./cierres";
import { pct, rd } from "./formato";
import { type Contexto, posicion, valorDOP } from "./posicion";
import { deudaTarjetas } from "./registro";
import { nombreClase } from "./tipos";

export type NivelRiesgo = "bajo" | "medio" | "alto";
export const NIVELES: readonly NivelRiesgo[] = ["bajo", "medio", "alto"];
export const NOMBRE_NIVEL: Record<NivelRiesgo, string> = { bajo: "Bajo", medio: "Medio", alto: "Alto" };

export interface RiesgoMatriz {
  id: "liquidez" | "concentracion" | "dolar" | "presupuesto";
  titulo: string;
  /** Qué se evalúa, en una línea. */
  que: string;
  impacto: NivelRiesgo;
  probabilidad: NivelRiesgo;
  /** El dato que lo dispara. */
  dato: string;
  /** De dónde sale el dato. */
  fuente: string;
  /** Qué se puede hacer (sin recomendar inversiones concretas). */
  hacer: string;
  /** Falta algún dato: la celda va punteada («sin dato»). */
  sinDato: boolean;
}

const peso: Record<NivelRiesgo, number> = { bajo: 0, medio: 1, alto: 2 };
/** Gravedad combinada: 0 (bajo/bajo) a 4 (alto/alto). */
export const gravedad = (r: Pick<RiesgoMatriz, "impacto" | "probabilidad">) => peso[r.impacto] + peso[r.probabilidad];
export function tonoGravedad(r: Pick<RiesgoMatriz, "impacto" | "probabilidad">): NivelRiesgo {
  const g = gravedad(r);
  return g >= 3 ? "alto" : g >= 2 ? "medio" : "bajo";
}

/** Cuánto se pasa del límite: ≤ 1 bajo, ≤ 1.5 medio, más alto. */
function porRazon(r: Big): NivelRiesgo {
  return r.lte(1) ? "bajo" : r.lte("1.5") ? "medio" : "alto";
}

const num = (s: string | undefined) => (s === undefined || s === null || s === "" ? null : new Big(s));

export function matrizRiesgo(ctx: Contexto): RiesgoMatriz[] {
  const u = ctx.p.umbrales;
  const pos = posicion(ctx);
  const pre = ctx.presupuesto ?? null;
  const fuentePre = pre ? `tus registros: Presupuesto de ${pre.mes}` : "tus registros: cierres del Portafolio";
  const gastoPres = num(pre?.presupuestado.gastos_totales);
  const gasto = gastoPres && gastoPres.gt(0) ? gastoPres : gastoPromedio(ctx);
  const ingreso = num(pre?.presupuestado.ingresos);
  const lista: RiesgoMatriz[] = [];

  // 1. Liquidez y colchón
  {
    const minimo = n(u.colchonMeses);
    const meses = gasto && gasto.gt(0) ? pos.liquidos.div(gasto) : null;
    const impacto: NivelRiesgo = meses === null ? "medio" : meses.gte(minimo) ? "bajo" : meses.gte(minimo.div(2)) ? "medio" : "alto";
    let probabilidad: NivelRiesgo = "medio";
    if (pre) {
      const neta = num(pre.presupuestado.utilidad_neta) ?? CERO;
      const gReal = num(pre.real.gastos_totales) ?? CERO;
      probabilidad = neta.lt(0) ? "alto" : gastoPres && gReal.gt(gastoPres) ? "medio" : "bajo";
    }
    lista.push({
      id: "liquidez",
      titulo: "Liquidez y colchón",
      que: `¿Te alcanza lo que tienes a mano (efectivo y cuentas) para ${minimo.toFixed()} meses de gastos?`,
      impacto,
      probabilidad,
      dato:
        meses === null
          ? "Falta tu gasto del mes: arma tu Presupuesto o cierra un mes."
          : `Tienes ${rd(pos.liquidos)} a mano: ${meses.toFixed(1)} meses de tus gastos (${rd(gasto!)} al mes). Tu mínimo: ${minimo.toFixed()} meses.`,
      fuente: fuentePre,
      hacer:
        impacto === "bajo"
          ? "Vas bien: mantén el colchón cuando gastes de más un mes."
          : "Sube el colchón poco a poco: aparta una parte fija cada mes en efectivo o ahorro (en el Presupuesto) o recorta gastos variables.",
      sinDato: meses === null,
    });
  }

  // 2. Concentración (un instrumento y una SAFI/emisor)
  {
    const total = pos.total;
    let mayor: { nombre: string; v: Big; clase: string } | null = null;
    for (const a of ctx.activos) {
      const v = valorDOP(ctx, a);
      if (v && (!mayor || v.gt(mayor.v))) mayor = { nombre: a.nombre, v, clase: a.clase };
    }
    const emisores = Object.entries(pos.porEmisor).sort((a, b) => b[1].cmp(a[1]));
    const emisor = emisores[0];
    const pInstr = mayor && total.gt(0) ? mayor.v.div(total) : null;
    const pEmisor = emisor && total.gt(0) ? emisor[1].div(total) : null;
    const rI = pInstr ? pInstr.div(n(u.maxInstrumento).gt(0) ? n(u.maxInstrumento) : 1) : CERO;
    const rE = pEmisor ? pEmisor.div(n(u.maxEmisor).gt(0) ? n(u.maxEmisor) : 1) : CERO;
    const impacto = porRazon(rI.gt(rE) ? rI : rE);
    const probabilidad: NivelRiesgo = !mayor ? "bajo" : mayor.clase === "rentavariable" ? "alto" : mayor.clase === "rentafija" ? "medio" : "bajo";
    lista.push({
      id: "concentracion",
      titulo: "Concentración",
      que: `¿Tienes demasiado en un solo lugar? Tus límites: ${pct(u.maxInstrumento, 0)} en un instrumento y ${pct(u.maxEmisor, 0)} en una SAFI o emisor.`,
      impacto,
      probabilidad,
      dato: mayor
        ? `${pct(pInstr, 0)} en «${mayor.nombre}» (${nombreClase(mayor.clase)}) y ${pct(pEmisor, 0)} en ${emisor[0]}.`
        : "Todavía no hay inversiones valoradas.",
      fuente: "tus registros: Mis cuentas y Cartera",
      hacer:
        impacto === "bajo"
          ? "Repartido dentro de tus límites."
          : "Revisa tu Política: decide cuánto aceptas en un solo lugar y a qué instrumentos o emisores van tus próximos aportes.",
      sinDato: !mayor,
    });
  }

  // 3. Moneda (dólar)
  {
    const total = pos.total;
    const d = total.gt(0) ? pos.extranjero.div(total) : null;
    const min = n(u.dolarMin);
    const max = n(u.dolarMax);
    const fuera = d === null ? CERO : d.lt(min) ? min.minus(d) : d.gt(max) ? d.minus(max) : CERO;
    const impacto: NivelRiesgo = d === null || fuera.eq(0) ? "bajo" : fuera.lte("0.10") ? "medio" : "alto";
    lista.push({
      id: "dolar",
      titulo: "Moneda (dólar)",
      que: `¿Cuánto dependes del dólar? Tu rango: entre ${pct(min, 0)} y ${pct(max, 0)} de lo que tienes en otra moneda.`,
      impacto,
      probabilidad: d === null || fuera.eq(0) ? "bajo" : "medio",
      dato: d === null ? "Todavía no hay inversiones valoradas." : `${pct(d, 0)} de lo que tienes está en dólares o euros (${rd(pos.extranjero)}).`,
      fuente: `tus registros y el dólar ${ctx.mercado.fx.USD.origen === "bcrd" ? "del BCRD" : "que escribiste"}`,
      hacer:
        fuera.eq(0)
          ? "Dentro de tu rango."
          : d!.lt(min)
            ? "Tienes menos dólares que tu mínimo: si el peso se deprecia, pierdes poder de compra. Decide en qué moneda van tus próximos aportes."
            : "Tienes más dólares que tu máximo: un peso más fuerte te restaría. Decide en qué moneda van tus próximos aportes.",
      sinDato: d === null,
    });
  }

  // 4. Presupuesto y deuda
  {
    const gReal = num(pre?.real.gastos_totales);
    const sobre = gastoPres && gastoPres.gt(0) && gReal ? gReal.div(gastoPres).minus(1) : null;
    const limSobre = n(u.sobreGasto);
    const probabilidad: NivelRiesgo = sobre === null ? "medio" : sobre.gt(limSobre) ? "alto" : sobre.gt(0) ? "medio" : "bajo";
    const tc = ctx.registro ? deudaTarjetas(ctx, ctx.registro) : CERO;
    const rel = ingreso && ingreso.gt(0) ? tc.div(ingreso) : null;
    const limDeuda = n(u.deudaTarjetas);
    const impacto: NivelRiesgo = rel === null ? "medio" : rel.gt(limDeuda) ? "alto" : rel.gt(limDeuda.div(2)) ? "medio" : "bajo";
    const partes = [
      sobre === null ? "Sin Presupuesto del mes para comparar gastos." : sobre.gt(0) ? `Gastas ${pct(sobre, 0)} más de lo presupuestado (${rd(gReal!)} de ${rd(gastoPres!)}).` : `Vas ${pct(sobre.abs(), 0)} por debajo de lo presupuestado.`,
      rel === null ? "Falta tu ingreso mensual en el Presupuesto." : `Debes ${rd(tc)} en tarjetas: ${pct(rel, 0)} de tu ingreso del mes.`,
    ];
    lista.push({
      id: "presupuesto",
      titulo: "Presupuesto y deuda",
      que: `¿Gastas más de lo planeado (alto desde ${pct(limSobre, 0)} de más) o debes mucho en tarjetas (alto desde ${pct(limDeuda, 0)} de tu ingreso)?`,
      impacto,
      probabilidad,
      dato: partes.join(" "),
      fuente: fuentePre,
      hacer:
        impacto === "bajo" && probabilidad === "bajo"
          ? "Dentro de lo planeado."
          : "Mira en el Presupuesto qué categorías se pasaron y, si puedes, paga la tarjeta completa antes de su fecha para no pagar intereses.",
      sinDato: sobre === null || rel === null,
    });
  }
  return lista;
}
