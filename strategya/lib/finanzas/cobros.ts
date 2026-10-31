// Lo que no capitaliza paga su interés, cupón o dividendo a una cuenta del usuario (manual, sección A): ese cobro entra
// al Presupuesto como «Otros ingresos». Aquí se calcula lo que DEBERÍA llegar cada mes con lo que Mena anotó (saldo o
// valor, tasa y retención) para que lo agregue como cobro fijo; no es un dato del banco y la pantalla lo dice. Lo real
// es lo que Mena anota cuando le llega. Puro, con big.js.

import Big from "big.js";
import type { DatosCaja, Recurrente } from "../caja/tipos";
import type { ItemRegistro } from "../capital/registro";
import { CATALOGO, capitalizaDe, pagaACuenta, retencionDe, tasaQueCuenta } from "./catalogo";
import { estadoMutuo } from "./mutuo";

export interface CobroEsperado {
  instrumento: ItemRegistro;
  /** Cuenta del registro que recibe el cobro (paga_a). */
  cuentaRegistro: string;
  /** La misma cuenta en el Presupuesto (null si no está). */
  cuentaCaja: string | null;
  /** Neto de retención, en la moneda del instrumento, por mes. */
  alMes: Big;
  /** El fijo de «Otros ingresos» que ya lo planifica (por su nombre), si existe. */
  fijo: Recurrente | null;
}

/** Nombre del fijo de un cobro (así se reconoce después). */
export const nombreCobro = (i: Pick<ItemRegistro, "nombre">) => `Cobro de ${i.nombre}`.slice(0, 120);

export function cobrosEsperados(registro: readonly ItemRegistro[], caja: DatosCaja | null): CobroEsperado[] {
  const out: CobroEsperado[] = [];
  for (const i of registro) {
    if (i.unidoA || !i.pagaA || CATALOGO[i.tipo].grupo !== "inversion") continue;
    const cap = capitalizaDe(i.tipo, i.plan.capitaliza);
    if (!pagaACuenta(i.tipo, cap)) continue;
    if (i.tipo === "mutuo" && (i.plan.reinvierte ?? estadoMutuo(i.cantidad, i.renovaciones).dejaInteres) === true) continue;
    const tasa = new Big(tasaQueCuenta(i.tipo, i.tasa));
    if (tasa.lte(0)) continue;
    const valor = new Big(i.cantidad).times(i.precio || "1");
    const alMes = valor.times(tasa).div(12).times(new Big(1).minus(retencionDe(i.tipo, i.retencion))).round(2, Big.roundHalfUp);
    const destino = registro.find((x) => x.id === i.pagaA);
    const cuentaCaja = destino?.cajaId ?? null;
    const fijo = caja?.recurrentes.find((r) => r.tipo === "ingreso" && r.nombre === nombreCobro(i)) ?? null;
    out.push({ instrumento: i, cuentaRegistro: i.pagaA, cuentaCaja, alMes, fijo });
  }
  return out;
}
