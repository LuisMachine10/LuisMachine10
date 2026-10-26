// Formularios del registro único «Mis cuentas, activos y deudas» (puro, sin Next). Convierte lo que
// escribe Mena en la fila de personal.activos, con errores que dicen cómo arreglarlo. Montos como texto.

import { aDecimal } from "../../supabase/functions/_shared/json";
import { cicloDeFormulario } from "../caja/ciclo";
import { Big } from "./decimal";
import { esFecha, sumarMeses } from "./fechas";
import { type Campos, numeroForm, pctForm } from "./formulario";
import { type ClaseRegistro, esClaseDeuda, FRECUENCIAS_PAGO, MONEDAS } from "./tipos";

/** Lo que Mena elige en «¿Qué vas a agregar?»: clase + subtipo del registro. */
export const TIPOS_ALTA = [
  { id: "corriente", clase: "ahorros", subtipo: "corriente", nom: "Cuenta corriente o de nómina", grupo: "tienes", ayuda: "La cuenta del día a día: de ahí pagas y ahí te cae el sueldo." },
  { id: "ahorro", clase: "ahorros", subtipo: "ahorro", nom: "Cuenta de ahorro", grupo: "tienes", ayuda: "Dinero guardado en el banco que puedes sacar cuando quieras." },
  { id: "efectivo", clase: "efectivo", subtipo: null, nom: "Efectivo", grupo: "tienes", ayuda: "Billetera, caja de la casa." },
  { id: "rentafija", clase: "rentafija", subtipo: null, nom: "Inversión de renta fija", grupo: "tienes", ayuda: "Certificado, bono, fondo de renta fija: te pagan una tasa." },
  { id: "rentavariable", clase: "rentavariable", subtipo: null, nom: "Acciones o ETF", grupo: "tienes", ayuda: "Su precio sube y baja con el mercado." },
  { id: "vehiculo", clase: "otros", subtipo: "vehiculo", nom: "Vehículo", grupo: "tienes", ayuda: "Lo que valdría si lo vendieras hoy." },
  { id: "inmueble", clase: "otros", subtipo: "inmueble", nom: "Casa, apartamento o solar", grupo: "tienes", ayuda: "Lo que valdría si lo vendieras hoy." },
  { id: "otro", clase: "otros", subtipo: "otro", nom: "Otro bien", grupo: "tienes", ayuda: "Algo de valor que podrías vender." },
  { id: "tarjeta", clase: "tarjeta", subtipo: null, nom: "Tarjeta de crédito", grupo: "debes", ayuda: "Lo que debes hoy en la tarjeta." },
  { id: "prestamo", clase: "prestamo", subtipo: null, nom: "Préstamo", grupo: "debes", ayuda: "Carro, casa, personal: lo que te falta por pagar." },
  { id: "deuda", clase: "deuda", subtipo: null, nom: "Otra deuda", grupo: "debes", ayuda: "Lo que le debes a alguien y no es tarjeta ni préstamo." },
] as const;
export type TipoAlta = (typeof TIPOS_ALTA)[number]["id"];

export function tipoAltaDe(clase: string, subtipo: string | null): TipoAlta {
  if (clase === "ahorros") return subtipo === "corriente" ? "corriente" : "ahorro";
  if (clase === "otros") return subtipo === "vehiculo" ? "vehiculo" : subtipo === "inmueble" ? "inmueble" : "otro";
  return (TIPOS_ALTA.find((t) => t.clase === clase)?.id ?? "otro") as TipoAlta;
}

export type ResultadoForm<T> = { ok: true; valor: T } | { ok: false; error: string };

/**
 * Fecha del saldo que se guarda: el saldo que Mena escribe es el de HOY al cierre (incluye lo que ya
 * pasó hoy), así que la base lo guarda como «saldo al empezar mañana». Lo anotado desde mañana lo mueve.
 */
export function fechaDeSaldo(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** El día que se muestra para un saldo guardado («escrito el …»). */
export function diaDelSaldo(saldoFecha: string): string {
  const d = new Date(`${saldoFecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function monto(v: string | undefined, que: string, ejemplo: string, opcional = false): ResultadoForm<string | null> {
  const t = numeroForm(v);
  if (!t) return opcional ? { ok: true, valor: null } : { ok: false, error: `Escribe ${que}, por ejemplo ${ejemplo}. Si es cero, escribe 0.` };
  const d = aDecimal(t);
  if (d === null) return { ok: false, error: `${que[0].toUpperCase()}${que.slice(1)}: «${v}» no es un número. Escribe solo la cifra, por ejemplo ${ejemplo}.` };
  return { ok: true, valor: d };
}

export interface FilaAlta {
  clase: ClaseRegistro;
  subtipo: string | null;
  nombre: string;
  institucion: string;
  simbolo: string | null;
  moneda: string;
  cantidad?: string;
  precio?: string;
  saldo_fecha?: string;
  tasa: string;
  vencimiento: string | null;
  limite: string | null;
  dia_pago: number | null;
  cuota: string | null;
  /** Tarjeta: ciclo. Las demás: null (las restricciones de la base lo exigen). */
  dia_corte: number | null;
  dias_para_pagar: number | null;
  /** Tarjeta en RD$ con parte en dólares. */
  limite_usd: string | null;
  saldo_usd?: string | null;
  saldo_usd_fecha?: string | null;
}

/**
 * Lee el formulario de alta o edición. `saldoSinCambio` = true cuando Mena no tocó el saldo (se compara
 * con el que se le mostró): entonces no se reescribe, para no pisar lo que el Presupuesto ya anotó.
 */
export function registroDeFormulario(c: Campos, hoy: string): ResultadoForm<FilaAlta> {
  const tipo = TIPOS_ALTA.find((t) => t.id === c.tipo);
  if (!tipo) return { ok: false, error: "Elige qué vas a agregar (cuenta, efectivo, inversión, bien, tarjeta o préstamo)." };
  const nombre = (c.nombre ?? "").trim();
  if (!nombre) return { ok: false, error: "Ponle un nombre que reconozcas, por ejemplo «Popular nómina» o «Visa BHD». No pongas números de cuenta." };
  if (nombre.length > 200) return { ok: false, error: "El nombre es muy largo: usa menos de 200 letras." };
  if (/\d{8,}/.test(nombre.replace(/[\s-]/g, ""))) return { ok: false, error: "Parece un número de cuenta o de tarjeta: basta un nombre que reconozcas (por ejemplo «Popular ahorro»)." };
  if (tipo.clase === "tarjeta" && /\d{4}/.test(nombre.replace(/[\s-]/g, ""))) {
    return { ok: false, error: "No pongas números de la tarjeta (ni los 4 últimos): basta un nombre como «Visa BHD» o «Mastercard Popular»." };
  }
  const moneda = (c.moneda ?? "DOP").toUpperCase();
  if (!(MONEDAS as readonly string[]).includes(moneda)) return { ok: false, error: "Elige la moneda: RD$, US$ o €." };
  const deuda = esClaseDeuda(tipo.clase);
  const fila: FilaAlta = {
    clase: tipo.clase,
    subtipo: tipo.subtipo,
    nombre,
    institucion: (c.inst ?? "").trim().slice(0, 200),
    simbolo: null,
    moneda,
    tasa: "0",
    vencimiento: null,
    limite: null,
    dia_pago: null,
    cuota: null,
    dia_corte: null,
    dias_para_pagar: null,
    limite_usd: null,
  };
  const saldoCambio = c.saldoMostrado === undefined || numeroForm(c.saldo) !== numeroForm(c.saldoMostrado);
  if (tipo.clase === "rentavariable") {
    const cant = monto(c.cantidad ?? c.saldo, "cuántas acciones o unidades tienes", "10");
    if (!cant.ok) return cant;
    const precio = monto(c.precio, "el precio de cada una", "101.25", true);
    if (!precio.ok) return precio;
    fila.cantidad = cant.valor!;
    fila.precio = precio.valor ?? "1";
    const s = (c.simbolo ?? "").trim().toUpperCase();
    if (s && !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(s)) return { ok: false, error: "El símbolo solo lleva letras y números, por ejemplo VOO." };
    fila.simbolo = s || null;
    fila.saldo_fecha = hoy;
  } else if (saldoCambio) {
    const s = monto(c.saldo, deuda ? "cuánto debes hoy" : tipo.clase === "otros" ? "cuánto vale hoy" : "cuánto tiene hoy", "25,000");
    if (!s.ok) return s;
    if (deuda && new Big(s.valor!).lt(0)) return { ok: false, error: "En una deuda escribe lo que debes en positivo (por ejemplo 12,400). Si tienes saldo a favor, escribe 0." };
    fila.cantidad = s.valor!;
    fila.precio = "1";
    fila.saldo_fecha = fechaDeSaldo(hoy);
  }
  const tasa = numeroForm(c.tasa);
  if (tasa) {
    const t = pctForm(tasa);
    if (aDecimal(t) === null || new Big(t).lt(-1) || new Big(t).gt(10)) return { ok: false, error: "La tasa va en % al año, por ejemplo 8.5." };
    fila.tasa = t;
  }
  if (c.venc) {
    if (!esFecha(c.venc)) return { ok: false, error: "La fecha de vencimiento no es válida." };
    fila.vencimiento = c.venc;
  }
  if (tipo.clase === "tarjeta") {
    const l = monto(c.limite, "el límite de la tarjeta en RD$", "80,000", true);
    if (!l.ok) return l;
    if (l.valor && new Big(l.valor).lt(0)) return { ok: false, error: "El límite no puede ser negativo." };
    fila.limite = l.valor;
    // Ciclo: día de corte, días para pagar después del corte y día en que quieres pagar.
    // En Mis cuentas el campo de la tarjeta se llama diaPagoTarjeta (el de préstamos, diaPago); el Presupuesto manda diaPago.
    const ci = cicloDeFormulario({ ...c, diaPago: c.diaPagoTarjeta !== undefined ? c.diaPagoTarjeta : c.diaPago });
    if (!ci.ok) return ci;
    fila.dia_corte = ci.valor.dia_corte;
    fila.dias_para_pagar = ci.valor.dias_para_pagar;
    fila.dia_pago = ci.valor.dia_pago;
    // Parte en dólares: límite y lo que debes en US$ (solo en una tarjeta en RD$).
    const lu = monto(c.limiteUsd, "el límite de la tarjeta en US$", "2,000", true);
    if (!lu.ok) return lu;
    if (lu.valor && new Big(lu.valor).lt(0)) return { ok: false, error: "El límite en US$ no puede ser negativo." };
    const usdCambio = c.saldoUsdMostrado === undefined || numeroForm(c.saldoUsd) !== numeroForm(c.saldoUsdMostrado);
    const su = monto(c.saldoUsd, "cuánto debes hoy en US$", "350", true);
    if (!su.ok) return su;
    if (su.valor && new Big(su.valor).lt(0)) return { ok: false, error: "En US$ escribe lo que debes en positivo (por ejemplo 350). Si no debes nada en dólares, escribe 0." };
    if ((lu.valor !== null || (usdCambio && su.valor !== null)) && moneda !== "DOP") {
      return { ok: false, error: "Esta tarjeta está anotada en US$. La parte en dólares es para tarjetas en RD$ que también tienen límite en dólares: anótala en RD$ y escribe aquí su parte en US$." };
    }
    fila.limite_usd = lu.valor;
    if (usdCambio) {
      fila.saldo_usd = su.valor;
      fila.saldo_usd_fecha = su.valor === null ? null : fechaDeSaldo(hoy);
    }
    return { ok: true, valor: fila };
  }
  fila.saldo_usd = null;
  fila.saldo_usd_fecha = null;
  if (deuda && c.diaPago) {
    const d = Number(c.diaPago);
    if (!/^\d{1,2}$/.test(c.diaPago) || d < 1 || d > 31) return { ok: false, error: "El día de pago es un número del 1 al 31, por ejemplo 28." };
    fila.dia_pago = d;
  }
  if (tipo.clase === "prestamo") {
    const q = monto(c.cuota, "la cuota mensual", "9,500", true);
    if (!q.ok) return q;
    fila.cuota = q.valor;
  }
  return { ok: true, valor: fila };
}

export interface PlanForm {
  capitaliza: boolean | null;
  frecuencia_pago: string | null;
  reinvierte: boolean | null;
  aporte_pct: string | null;
  plan_inicio: string | null;
  vencimiento?: string | null;
  tasa?: string;
}

/** Plan de un instrumento (proyecciones). Lo que no se elige queda null (supuesto por defecto). */
export function planDeFormulario(c: Campos): ResultadoForm<PlanForm> {
  const sino = (v: string | undefined) => (v === "si" ? true : v === "no" ? false : null);
  const capitaliza = sino(c.capitaliza);
  const frecuencia = c.frecuenciaPago && FRECUENCIAS_PAGO.some((f) => f.id === c.frecuenciaPago) ? c.frecuenciaPago : null;
  let aporte: string | null = null;
  if (numeroForm(c.aportePct)) {
    aporte = pctForm(c.aportePct);
    if (aDecimal(aporte) === null || new Big(aporte).lt(0) || new Big(aporte).gt(1)) return { ok: false, error: "La parte del aporte va de 0 a 100 %, por ejemplo 50." };
  }
  if (c.inicio && !esFecha(c.inicio)) return { ok: false, error: "La fecha de inicio no es válida." };
  const out: PlanForm = { capitaliza, frecuencia_pago: capitaliza === false ? frecuencia : null, reinvierte: capitaliza === false ? sino(c.reinvierte) : null, aporte_pct: aporte, plan_inicio: c.inicio || null };
  if (c.tasa !== undefined && numeroForm(c.tasa)) {
    const t = pctForm(c.tasa);
    if (aDecimal(t) === null || new Big(t).lt(0) || new Big(t).gt(10)) return { ok: false, error: "La tasa va en % al año, por ejemplo 9.5." };
    out.tasa = t;
  }
  if (c.venc !== undefined) {
    if (c.venc && !esFecha(c.venc)) return { ok: false, error: "La fecha de vencimiento no es válida." };
    out.vencimiento = c.venc || null;
  }
  return { ok: true, valor: out };
}

/** Fecha a 12 meses, para los placeholders («Ej.: …»). */
export function enUnAnio(hoy: string): string {
  return sumarMeses(hoy, 12);
}
