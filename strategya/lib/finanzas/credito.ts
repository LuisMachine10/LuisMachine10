// Tarjetas de crédito (manual, sección D): VARIOS pagos por ciclo y el «uso del crédito» (lo que debes ÷ tu límite,
// por moneda) antes y después de cada pago planificado. Comprar con la tarjeta = gasto del mes y sube la deuda; pagarla
// = transferencia (no es gasto) que baja la deuda; los intereses de la tarjeta solo los que Mena anota de su estado de
// cuenta. Puro, con big.js.

import Big from "big.js";
import { cicloVigente, type CicloTarjeta, type FechasCiclo } from "../caja/ciclo";
import type { Fecha } from "../caja/fechas";
import type { Simulacion } from "../caja/motor";
import { claveUSD, type Cuenta, type Moneda } from "../caja/tipos";

const CERO = new Big(0);

export interface EstadoCredito {
  deuda: Big;
  limite: Big | null;
  /** deuda ÷ límite (fracción). null sin límite. */
  uso: Big | null;
}

export interface PasoPago {
  fecha: Fecha;
  monto: Big;
  /** Fijo del Presupuesto que lo planifica (null = ya anotado). */
  recurrenteId: string | null;
  nombre: string;
  antes: EstadoCredito;
  despues: EstadoCredito;
}

const estado = (deuda: Big, limite: Big | null): EstadoCredito => ({ deuda, limite, uso: limite && limite.gt(0) ? deuda.div(limite) : null });

/**
 * Uso del crédito antes y después de cada pago, en orden de fecha. La deuda nunca baja de 0 (un pago mayor que lo
 * que se debe deja la deuda en 0: lo demás es saldo a favor y no se cuenta como crédito usado).
 */
export function usoAntesDespues(
  deudaInicial: Big,
  limite: Big | null,
  pagos: readonly { fecha: Fecha; monto: Big; recurrenteId?: string | null; nombre?: string }[],
): PasoPago[] {
  let deuda = deudaInicial.lt(0) ? CERO : deudaInicial;
  return [...pagos]
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    .map((p) => {
      const antes = estado(deuda, limite);
      deuda = deuda.minus(p.monto);
      if (deuda.lt(0)) deuda = CERO;
      return { fecha: p.fecha, monto: p.monto, recurrenteId: p.recurrenteId ?? null, nombre: p.nombre ?? "Pago", antes, despues: estado(deuda, limite) };
    });
}

export interface PlanTarjeta {
  cuenta: Cuenta;
  /** El ciclo vigente (null si la tarjeta no tiene ciclo: se miran los próximos 31 días). */
  ciclo: FechasCiclo | null;
  hasta: Fecha;
  /** Una parte por moneda (RD$ y, si la tarjeta lleva parte en dólares, US$). */
  partes: { moneda: Moneda; hoy: EstadoCredito; pasos: PasoPago[] }[];
}

/**
 * Para cada tarjeta: lo que debes hoy y los pagos planificados (fijos «Pago de tarjeta o préstamo») desde hoy hasta la
 * fecha límite del ciclo vigente — uno o varios —, con el uso del crédito antes y después de cada uno. Los montos salen
 * de la simulación del Presupuesto (un «pagar todo lo que debas» toma lo que se debe ese día).
 */
export function planTarjetas(sim: Simulacion, cuentas: readonly Cuenta[], hoy: Fecha): PlanTarjeta[] {
  const out: PlanTarjeta[] = [];
  const dHoy = sim.porFecha.get(hoy);
  for (const c of cuentas) {
    if (c.tipo !== "tarjeta") continue;
    const ciclo = c.ciclo ? cicloVigente(hoy, c.ciclo as CicloTarjeta) : null;
    const hasta = ciclo ? ciclo.limite : sumar(hoy, 31);
    const pagosDe = (parte: Moneda) =>
      sim.dias
        .filter((d) => d.fecha >= hoy && d.fecha <= hasta)
        .flatMap((d) =>
          d.planificados
            // En una tarjeta en dos monedas, cada pago va a la parte elegida (o a la de la moneda del pago).
            .filter((o) => o.tipo === "pago_tarjeta" && o.destino === c.id && (!c.usd || ((o.parte ?? o.moneda) === "USD" ? "USD" : "DOP") === parte))
            .map((o) => ({ fecha: d.fecha, monto: new Big(o.monto), recurrenteId: o.recurrenteId, nombre: o.nombre })),
        );
    const pos = (k: string) => (dHoy?.posiciones[k] !== undefined ? new Big(dHoy.posiciones[k]).times(-1) : new Big(c.saldoInicial || "0"));
    const partes: PlanTarjeta["partes"] = [];
    const monedaPrincipal: Moneda = c.moneda ?? "DOP";
    const lim = c.limite ? new Big(c.limite) : null;
    partes.push({ moneda: monedaPrincipal, hoy: estado(pos(c.id), lim), pasos: usoAntesDespues(pos(c.id), lim, pagosDe("DOP")) });
    if (c.usd) {
      const limU = c.usd.limite ? new Big(c.usd.limite) : null;
      const k = claveUSD(c.id);
      partes.push({ moneda: "USD", hoy: estado(pos(k), limU), pasos: usoAntesDespues(pos(k), limU, pagosDe("USD")) });
    }
    out.push({ cuenta: c, ciclo, hasta, partes });
  }
  return out;
}

function sumar(f: Fecha, n: number): Fecha {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
