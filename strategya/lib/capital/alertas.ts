// Hallazgos del mes: lo que está fuera de las metas que Mena escribió en sus parámetros.
// Mismas reglas que el artefacto, redactadas como hechos: describen la cifra y la meta, no
// recomiendan comprar, vender ni mover dinero (Strategya no es asesoría de inversión).

import { CERO, n } from "./decimal";
import { dias, mesCorto, mesLargo } from "./fechas";
import { indicadores } from "./cierres";
import { num, pb, pct, pp, rd } from "./formato";
import { type Contexto, posicion, valorDOP } from "./posicion";
import { puente, rebalanceo, riesgo, ventanasReinversion } from "./riesgo";
import { CLASES, nombreClase } from "./tipos";
import { avisoLimite, cicloDe, cicloVigente, cuandoFalta, notaCiclo } from "../caja/ciclo";
import { fechaBreve } from "../caja/fechas";
import { tarjetasUsdNoConfirmado } from "./registro";

export type Nivel = "error" | "alerta" | "ok";

export interface Hallazgo {
  n: Nivel;
  t: string;
  d: string;
}

export function hallazgos(ctx: Contexto, m: string): Hallazgo[] {
  const A: Hallazgo[] = [];
  const ind = indicadores(ctx, m);
  const pos = posicion(ctx);
  const pu = puente(ctx, m);
  const rk = riesgo(ctx);
  const fxUsd = ctx.mercado.fx.USD;

  if (pos.sinValorar.length) {
    A.push({
      n: "error",
      t: `${pos.sinValorar.length} instrumento(s) sin tipo de cambio`,
      d: `${pos.sinValorar.map((a) => a.nombre).join(", ")}: su moneda no tiene tipo de cambio (ni serie BCRD ni manual). Quedan fuera del total hasta que lo cargues en Cartera → Ajustes.`,
    });
  }
  if (fxUsd.origen === "manual" && fxUsd.fecha) {
    const d = dias(fxUsd.fecha, ctx.hoy);
    if (d > 45 && pos.extranjero.gt(0)) {
      A.push({
        n: "error",
        t: `Tipo de cambio manual con ${d} días sin actualizar`,
        d: `${rd(pos.extranjero)} en moneda extranjera se valoran a RD$ ${num(fxUsd.valor!, 2)} por US$. No hay dato del BCRD guardado todavía.`,
      });
    }
  }
  if (pu?.alerta) {
    A.push({
      n: "error",
      t: `Hay ${rd(pu.sinExplicar.abs())} sin explicar en el patrimonio`,
      d: `Entre ${mesCorto(pu.desde)} y ${mesCorto(pu.hasta)} el patrimonio ${pu.dPat.gte(0) ? "subió" : "bajó"} ${rd(pu.dPat.abs())}. Ahorro, rendimiento y efecto cambiario explican ${rd(pu.flujo.plus(pu.rend).plus(pu.efectoFX))}. Revisa el puente.`,
    });
  }
  const metaFondo = n(ctx.p.metaFondo);
  if (metaFondo.gt(0) && ind.fondoMeses !== null && ind.fondoMeses.lt(metaFondo) && ind.gastoRef) {
    const falta = ind.gastoRef.times(metaFondo).minus(ind.foto.liquidos);
    A.push({
      n: ind.fondoMeses.lt(3) ? "error" : "alerta",
      t: `Fondo de emergencia: ${num(ind.fondoMeses, 1)} meses (meta ${num(metaFondo, 0)})`,
      d: `${rd(ind.foto.liquidos)} líquidos contra ${rd(ind.gastoRef)} de gasto operativo mensual. Faltan ${rd(falta)} para la meta.`,
    });
  }
  const metaTC = n(ctx.p.metaUsoTC);
  if (metaTC.gt(0) && ind.tc.alguna && ind.tc.pct !== null && ind.tc.pct.gt(metaTC)) {
    A.push({
      n: "alerta",
      t: `Uso de tarjeta en ${pct(ind.tc.pct, 0)} (meta ≤ ${pct(metaTC, 0)})`,
      d: `${rd(ind.tc.uso)} sobre un límite de ${rd(ind.tc.limite)}.`,
    });
  }
  if (ind.tc.impago) {
    A.push({ n: "error", t: "Mes sin pagar la tarjeta en full", d: "El cierre marca al menos una tarjeta con saldo sin pagar completo." });
  }
  // Tarjetas: fecha límite cerca sin pago anotado, día de pago fuera del ciclo y parte en US$ sin dólar del BCRD.
  for (const t of (ctx.registro ?? []).filter((i) => i.clase === "tarjeta" && !i.unidoA)) {
    const c = cicloDe(t);
    if (!c) continue;
    const a = avisoLimite(ctx.hoy, c, t.pagos);
    if (a) {
      A.push({
        n: "error",
        t: `${t.nombre}: la fecha límite de pago es ${cuandoFalta(a.faltan)} (${fechaBreve(a.ciclo.limite)})`,
        d: t.cajaId
          ? `No hay pago anotado en el Presupuesto desde el corte del ${fechaBreve(a.ciclo.corte)}. Si ya pagaste, anótalo como «Pago de tarjeta o préstamo».`
          : `Cortó el ${fechaBreve(a.ciclo.corte)}. Esta tarjeta no está en tu Presupuesto, así que no vemos sus pagos: si ya pagaste, ignora este aviso.`,
      });
    }
    const f = cicloVigente(ctx.hoy, c);
    if (f.fueraDeRango) A.push({ n: "alerta", t: `${t.nombre}: tu día de pago cae después de la fecha límite`, d: notaCiclo(f, c) ?? "" });
  }
  const sinDolar = ctx.registro ? tarjetasUsdNoConfirmado(ctx, ctx.registro) : [];
  if (sinDolar.length) {
    A.push({
      n: "alerta",
      t: `Lo que debes en US$ en ${sinDolar.map((x) => x.nombre).join(", ")} no se sumó`,
      d: "Falta el dólar de venta del BCRD de hoy (o tiene más de 7 días): esa parte queda «no confirmado» en tu patrimonio y en la matriz de riesgo hasta que llegue el dato.",
    });
  }
  const metaAhorro = n(ctx.p.metaAhorro);
  if (metaAhorro.gt(0) && ind.tasaAhorro !== null && ind.tasaAhorro.lt(metaAhorro)) {
    A.push({
      n: "alerta",
      t: `Tasa de ahorro en ${pct(ind.tasaAhorro, 0)} (meta ≥ ${pct(metaAhorro, 0)})`,
      d: `Ingresos ${rd(ind.ing)} contra gasto operativo ${rd(ind.gOp)}.`,
    });
  }

  for (const r of rebalanceo(ctx)) {
    if (r.obj.eq(0) && r.actual.eq(0)) continue;
    if (r.dpp.abs().gt("0.05")) {
      A.push({
        n: "alerta",
        t: `${nombreClase(r.id)} está ${r.dpp.gt(0) ? "sobre" : "bajo"} su meta por ${pp(r.dpp)}`,
        d: `Hoy ${pct(r.pctA, 1)} contra una meta de ${pct(r.obj, 0)} (${r.dif.gt(0) ? `faltan ${rd(r.dif)}` : `sobran ${rd(r.dif.neg())}`} para la meta).`,
      });
    }
  }

  for (const a of ctx.activos) {
    if (!a.venc) continue;
    const d = dias(ctx.hoy, a.venc);
    const v = valorDOP(ctx, a);
    const monto = v === null ? `${a.moneda} ${num(n(a.cantidad), 2)}` : rd(v);
    if (d < 0) {
      A.push({ n: "error", t: `${a.nombre} venció hace ${Math.abs(d)} días`, d: `${monto} en ${a.inst || "sin institución"} al ${pct(a.tasa, 2)}. Actualiza el instrumento en Cartera.` });
    } else if (d <= 90) {
      A.push({ n: "alerta", t: `${a.nombre} vence en ${d} días`, d: `${monto} en ${a.inst || "sin institución"}, vence el ${a.venc}.` });
    }
  }

  for (const x of ventanasReinversion(ctx)) {
    A.push({
      n: "alerta",
      t: `${x.a.nombre} paga ${pb(x.spread.neg())} contra la ${x.refNom}`,
      d: `Tu instrumento paga ${pct(x.a.tasa, 2)} y la referencia está en ${pct(x.ref, 2)}. Vence en ${x.d} días.`,
    });
  }

  const maxEmisor = n(ctx.p.maxEmisor);
  if (maxEmisor.gt(0) && rk.maxEmisor?.pct && rk.maxEmisor.pct.gt(maxEmisor)) {
    A.push({
      n: "alerta",
      t: `Concentración: ${pct(rk.maxEmisor.pct, 0)} en ${rk.maxEmisor.nombre}`,
      d: `${rd(rk.maxEmisor.valor)} en un solo emisor, sobre tu límite de ${pct(maxEmisor, 0)}.`,
    });
  }

  if (pos.total.gt(0)) {
    const top = CLASES.map((c) => ({ c, v: pos.porClase[c.id] })).sort((a, b) => b.v.cmp(a.v))[0];
    const peso = top.v.div(pos.total);
    if (peso.gt("0.60")) A.push({ n: "alerta", t: `Concentración: ${pct(peso, 0)} en ${top.c.nom}`, d: "Una sola clase carga la mayor parte del patrimonio." });
  }

  const efe = pos.porClase.efectivo;
  const mejorTasa = ctx.activos.filter((a) => a.clase === "ahorros").reduce((mx, a) => (n(a.tasa).gt(mx) ? n(a.tasa) : mx), CERO);
  if (efe.gt(5000) && mejorTasa.gt("0.03")) {
    A.push({
      n: "alerta",
      t: `${rd(efe)} en efectivo sin devengar`,
      d: `Tu cuenta de ahorros mejor pagada rinde ${pct(mejorTasa, 2)}: ese efectivo deja de ganar ${rd(efe.times(mejorTasa))} al año${n(ctx.p.inflacion).gt(0) ? `, y la inflación de referencia le resta ${rd(efe.times(n(ctx.p.inflacion)))}` : ""}.`,
    });
  }

  const sinTasa = ctx.activos.filter((a) => a.clase === "rentavariable" && n(a.tasa).eq(0) && (valorDOP(ctx, a) ?? CERO).gt(0));
  if (sinTasa.length) {
    A.push({
      n: "alerta",
      t: `${sinTasa.length} posición(es) de renta variable con dividendo en cero`,
      d: `${sinTasa.map((a) => a.simbolo || a.nombre).join(", ")}. Si pagan dividendo, el ingreso pasivo está subestimado (cárgalo en Cartera; si es de EE. UU., recuerda la retención de 30% a no residentes).`,
    });
  }

  if (!ctx.tx.length) {
    A.push({ n: "alerta", t: "Sin libro de transacciones", d: "Sin fechas y precios de compra no hay base de costo, ni P&L realizado, ni TIR por posición." });
  }
  const c = ctx.cierres[m];
  if (!c || !c.cerrado) {
    A.push({ n: "alerta", t: `Falta cerrar ${mesLargo(m)}`, d: "Sin el cierre no hay tasa de ahorro, cobertura pasiva ni puente de patrimonio del mes." });
  }
  if (!Object.keys(ctx.mercado.precios).length && ctx.activos.some((a) => a.simbolo)) {
    A.push({ n: "alerta", t: "Sin precios de mercado guardados", d: "La lectura de precios (Finnhub) todavía no ha guardado cotizaciones: se usan los precios manuales de cada activo." });
  }
  if (!A.length) A.push({ n: "ok", t: "Todo dentro de parámetros", d: "Ningún indicador fuera de meta este mes." });
  return A;
}

/** Orden de severidad para pantalla. */
export function ordenar(A: Hallazgo[]): Hallazgo[] {
  const peso: Record<Nivel, number> = { error: 0, alerta: 1, ok: 2 };
  return [...A].sort((a, b) => peso[a.n] - peso[b.n]);
}
