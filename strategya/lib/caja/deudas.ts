// Pagos de tarjetas y préstamos: qué parte es capital (baja la deuda) y qué parte es interés (gasto
// financiero del mes). Puro, con big.js.
//
// Regla (Fase F, pedido de Mena):
//   · Si Mena escribe cuánto fue capital, manda eso: interés = pago − capital.
//   · Si no, y es un PRÉSTAMO (u otra deuda) con tasa en el Portafolio: interés del mes = lo que debía al
//     cierre del día anterior × tasa anual ÷ 12, redondeado a centavos, nunca más que el pago.
//   · Si no hay tasa (o es una tarjeta, que solo cobra interés si no se paga completa): todo es capital.
// El resultado se GUARDA en el movimiento (caja_movimientos.interes): así el Presupuesto, el registro único
// y los cierres usan la misma cifra y no cambia si después se edita la tasa.

import Big from "big.js";
import { type Fecha, sumarDias } from "./fechas";
import { simular } from "./motor";
import { type DatosCaja, esDeuda, monedaDe, type Moneda } from "./tipos";

const CERO = new Big(0);

/** Lo que se debía en la cuenta de deuda al cierre del día anterior a `fecha` (solo lo registrado). */
export function deudaAntesDe(datos: DatosCaja, cuentaId: string, fecha: Fecha): Big | null {
  const c = datos.cuentas.find((x) => x.id === cuentaId);
  if (!c || !esDeuda(c.tipo) || !datos.config) return null;
  const ayer = sumarDias(fecha, -1);
  if (ayer < datos.config.inicio) return new Big(c.saldoInicial || "0");
  const sim = simular({ ...datos, recurrentes: [] }, { hoy: ayer, hasta: ayer });
  const p = sim.porFecha.get(ayer)?.posiciones[cuentaId];
  return p == null ? null : new Big(p).times(-1);
}

/** Interés de un mes con la tasa anual (fracción): deuda × tasa ÷ 12, a centavos, entre 0 y el pago. */
export function interesConTasa(deuda: Big, tasaAnual: string, pago: Big): Big {
  if (deuda.lte(0) || new Big(tasaAnual).lte(0)) return CERO;
  const i = deuda.times(tasaAnual).div(12).round(2, Big.roundHalfUp);
  return i.gt(pago) ? pago : i;
}

export interface SeparacionPago {
  /** Interés guardado en el movimiento (null = todo capital). */
  interes: string | null;
  /** Cargos dentro de la cuota (seguro…) guardados en el movimiento (null = ninguno). Gasto aparte. */
  cargos: string | null;
  capital: string;
  como: "escrito" | "tasa" | "todo";
  /** Con tasa: lo que se debía y la tasa usada (para decírselo a Mena). */
  deuda?: string;
  tasa?: string;
}

/**
 * Decide el interés (y los cargos de la cuota) de un pago. `interesEscrito`: undefined = Mena no escribió el
 * capital; null o texto = lo que no fue capital según lo que escribió (monto − capital). Los cargos de la cuota
 * (seguro…) salen de lo que Mena escriba o, en un préstamo, de los «cargos dentro de la cuota» de Mis cuentas:
 * son gasto aparte y NO bajan la deuda (manual, sección E). Interés de tarjeta: solo el que Mena anota de su estado
 * de cuenta (nunca se calcula).
 */
export function separarPago(
  datos: DatosCaja,
  pago: { monto: string; moneda: Moneda; destino: string | null; fecha: Fecha },
  interesEscrito: string | null | undefined,
  cargosEscritos?: string | null,
): SeparacionPago {
  const monto = new Big(pago.monto);
  const c = pago.destino ? datos.cuentas.find((x) => x.id === pago.destino) : undefined;
  const esPrestamo = !!c && c.tipo === "prestamo" && monedaDe(c) === pago.moneda;
  // Cargos: los escritos o los de la cuota del préstamo; nunca más que el pago.
  let cargos = cargosEscritos !== undefined ? (cargosEscritos ? new Big(cargosEscritos) : CERO) : esPrestamo && c?.cargosCuota ? new Big(c.cargosCuota) : CERO;
  if (cargos.gt(monto)) cargos = monto;
  const k = cargos.gt(0) ? cargos.toFixed() : null;
  if (interesEscrito !== undefined) {
    // Lo que no fue capital = interés + cargos.
    const resto = interesEscrito ? new Big(interesEscrito) : CERO;
    if (cargos.gt(resto)) cargos = resto;
    const i = resto.minus(cargos);
    return { interes: i.gt(0) ? i.toFixed() : null, cargos: cargos.gt(0) ? cargos.toFixed() : null, capital: monto.minus(resto).toFixed(), como: resto.gt(0) ? "escrito" : "todo" };
  }
  if (!c || !esPrestamo || !c.tasaAnual) return { interes: null, cargos: k, capital: monto.minus(cargos).toFixed(), como: "todo" };
  const deuda = deudaAntesDe(datos, c.id, pago.fecha);
  if (!deuda) return { interes: null, cargos: k, capital: monto.minus(cargos).toFixed(), como: "todo" };
  const i = interesConTasa(deuda, c.tasaAnual, monto.minus(cargos));
  return {
    interes: i.gt(0) ? i.toFixed() : null,
    cargos: k,
    capital: monto.minus(i).minus(cargos).toFixed(),
    como: i.gt(0) ? "tasa" : "todo",
    deuda: deuda.toFixed(),
    tasa: c.tasaAnual,
  };
}
