// Validación de lo que Mena escribe en los formularios del Calendario de Caja. Funciones puras:
// reciben los campos como texto y devuelven el registro listo para guardar, o el error en español.

import Big from "big.js";
import { esFecha } from "./fechas";
import {
  type Categoria,
  type ConfigCaja,
  type Cuenta,
  esDeuda,
  esUno,
  FRECUENCIAS,
  MONEDAS,
  type Movimiento,
  type Recurrente,
  TIPOS_CATEGORIA,
  TIPOS_CUENTA,
  TIPOS_MOVIMIENTO,
} from "./tipos";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };
export type Campos = Record<string, string | undefined>;

const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
const mal = <T>(error: string): Resultado<T> => ({ ok: false, error });

/**
 * Monto escrito por una persona → decimal exacto. Acepta "1,500.50", "RD$ 1500", "  25 ".
 * La coma se toma como separador de miles (uso de RD). Devuelve null si está vacío; lanza si no es número.
 */
export function montoDeTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" && typeof v !== "number") throw new Error("no es un número");
  const s = String(v).trim().replace(/^(RD|US)?\$\s*/i, "").replace(/,/g, "").replace(/\s+/g, "");
  if (s === "") return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) throw new Error("no es un número");
  const fijo = new Big(s.replace(/^\+/, "")).toFixed();
  return fijo === "-0" ? "0" : fijo;
}

function leerMonto(v: unknown, nombre: string, opciones: { requerido?: boolean; positivo?: boolean; permitirNegativo?: boolean } = {}): Resultado<string | null> {
  let m: string | null;
  try {
    m = montoDeTexto(v);
  } catch {
    return mal(`${nombre}: «${String(v)}» no es un número.`);
  }
  if (m === null) return opciones.requerido ? mal(`${nombre}: falta.`) : ok(null);
  const b = new Big(m);
  if (opciones.positivo && b.lte(0)) return mal(`${nombre}: debe ser mayor que cero.`);
  if (!opciones.permitirNegativo && b.lt(0)) return mal(`${nombre}: no puede ser negativo.`);
  return ok(m);
}

const texto = (v: string | undefined) => (v ?? "").trim();
const opcional = (v: string | undefined) => texto(v) || null;

export function validarConfig(c: Campos): Resultado<ConfigCaja> {
  const inicio = texto(c.inicio);
  if (!esFecha(inicio)) return mal("Fecha de inicio: escribe una fecha válida (AAAA-MM-DD).");
  const colchon = leerMonto(c.colchon, "Colchón", { requerido: true });
  if (!colchon.ok) return colchon;
  const margen = leerMonto(c.margen, "Margen", { requerido: true });
  if (!margen.ok) return margen;
  const tasa = leerMonto(c.tasaUSD, "Tasa US$", { positivo: true });
  if (!tasa.ok) return tasa;
  return ok({ inicio, colchon: colchon.valor!, margen: margen.valor!, tasaUSD: tasa.valor });
}

export function validarCuenta(c: Campos): Resultado<Omit<Cuenta, "id">> {
  const nombre = texto(c.nombre);
  if (!nombre) return mal("La cuenta necesita un nombre.");
  if (!esUno(TIPOS_CUENTA, c.tipo)) return mal("Tipo de cuenta inválido.");
  if (c.tipo === "tarjeta" && /\d{4}/.test(nombre.replace(/[\s-]/g, ""))) return mal("No pongas números de la tarjeta (ni los 4 últimos): basta un nombre como «Visa BHD».");
  const saldo = leerMonto(c.saldoInicial, esDeuda(c.tipo) ? "Deuda inicial" : "Saldo inicial", { permitirNegativo: !esDeuda(c.tipo) });
  if (!saldo.ok) return saldo;
  const limite = leerMonto(c.limite, "Límite");
  if (!limite.ok) return limite;
  const orden = texto(c.orden);
  if (orden && !/^-?\d+$/.test(orden)) return mal("Orden: debe ser un número entero.");
  return ok({ nombre, tipo: c.tipo, saldoInicial: saldo.valor ?? "0", limite: limite.valor, orden: orden ? Number.parseInt(orden, 10) : 0 });
}

export function validarCategoria(c: Campos): Resultado<Omit<Categoria, "id">> {
  const nombre = texto(c.nombre);
  if (!nombre) return mal("La categoría necesita un nombre. Ej.: Sueldo, Comida o Intereses de la tarjeta.");
  if (!esUno(TIPOS_CATEGORIA, c.tipo)) return mal("Elige el tipo: ingreso, costo, gasto, gasto financiero, otro ingreso, otro gasto o ahorro e inversión.");
  const p = leerMonto(c.adicional, "Monto adicional al mes");
  if (!p.ok) return { ok: false, error: `${p.error} Escribe solo la cifra, por ejemplo 12,000, o déjalo vacío.` };
  return ok({ nombre, tipo: c.tipo, adicional: p.valor && new Big(p.valor).eq(0) ? null : p.valor });
}

/**
 * Todo ingreso o gasto lleva su categoría: así cae solo en el estado de resultados. Mover entre mis
 * cuentas y pagar la tarjeta no la necesitan (no son ingreso ni gasto).
 */
export function pideCategoria(tipo: string): boolean {
  return tipo === "ingreso" || tipo === "gasto";
}

function revisarCategoria(tipo: string, categoria: string | null): string | null {
  if (pideCategoria(tipo) && !categoria) {
    return tipo === "ingreso"
      ? "Elige la categoría del ingreso (por ejemplo «Sueldo»). Si no está, créala en Configuración."
      : "Elige la categoría del gasto (por ejemplo «Comida»). Si no está, créala en Configuración.";
  }
  return null;
}

function revisarCuentas(tipo: string, cuenta: string | null, destino: string | null): string | null {
  if (!cuenta) return "Elige la cuenta.";
  if ((tipo === "transferencia" || tipo === "pago_tarjeta") && !destino) return "Elige la cuenta de destino.";
  if ((tipo === "transferencia" || tipo === "pago_tarjeta") && destino === cuenta) return "La cuenta de origen y la de destino son la misma.";
  return null;
}

/** Prefijo de una inversión del registro que no vive en el Presupuesto (acciones, fondos por cuotas) en las listas. */
export const PREFIJO_REGISTRO = "r:";

/** «r:<id>» → la fila del registro; un id normal → la cuenta del Presupuesto. */
export function partirCuenta(v: string | null): { caja: string | null; registro: string | null } {
  if (!v) return { caja: null, registro: null };
  return v.startsWith(PREFIJO_REGISTRO) ? { caja: null, registro: v.slice(PREFIJO_REGISTRO.length) || null } : { caja: v, registro: null };
}

export function validarMovimiento(c: Campos): Resultado<Omit<Movimiento, "id">> {
  const fecha = texto(c.fecha);
  if (!esFecha(fecha)) return mal("Fecha inválida.");
  if (!esUno(TIPOS_MOVIMIENTO, c.tipo)) return mal("Tipo de movimiento inválido.");
  const moneda = c.moneda || "DOP";
  if (!esUno(MONEDAS, moneda)) return mal("Moneda inválida.");
  const monto = leerMonto(c.monto, "Monto", { requerido: true, positivo: true });
  if (!monto.ok) return monto;
  // La tasa también sirve en pesos cuando el dinero entra o sale de una cuenta en US$.
  const tasa = leerMonto(c.tasa, "Tasa", { positivo: true });
  if (!tasa.ok) return tasa;
  const cuentaCruda = opcional(c.cuenta);
  const destinoCrudo = c.tipo === "transferencia" || c.tipo === "pago_tarjeta" ? opcional(c.destino) : null;
  const e = revisarCuentas(c.tipo, cuentaCruda, destinoCrudo) ?? revisarCategoria(c.tipo, opcional(c.categoria));
  if (e) return mal(e);
  // Una inversión que no vive en el Presupuesto («r:<id>»): solo en un ahorro (destino) o un rescate (origen).
  const o = partirCuenta(cuentaCruda);
  const d = partirCuenta(destinoCrudo);
  if ((o.registro || d.registro) && c.tipo !== "transferencia") return mal("Esa inversión solo puede recibir ahorro o salir en un «Rescate o venta». Elige una cuenta.");
  if (o.registro && d.registro) return mal("De una inversión a otra no se pasa directo: primero rescátala a una cuenta y luego ahorra en la otra.");
  const cuenta = o.caja;
  const destino = d.caja;
  // Pago de tarjeta o préstamo: «¿cuánto fue capital?». Escrito → interés = monto − capital. Vacío → sin
  // decidir aquí (la acción lo calcula con la tasa del préstamo o lo deja todo como capital).
  let interes: string | null | undefined;
  let cargos: string | null | undefined;
  if (c.tipo === "pago_tarjeta") {
    const cap = leerMonto(c.capital, "Capital");
    if (!cap.ok) return { ok: false, error: `${cap.error} Escribe solo la parte que baja tu deuda, por ejemplo 7,500, o déjalo vacío.` };
    if (cap.valor !== null) {
      if (new Big(cap.valor).gt(monto.valor!)) return mal("El capital no puede ser mayor que el pago. Escribe la parte del pago que baja tu deuda.");
      const i = new Big(monto.valor!).minus(cap.valor);
      interes = i.eq(0) ? null : i.toFixed();
    }
    // Cargos dentro de la cuota (seguro…): gasto aparte que no baja la deuda. Vacío = los de Mis cuentas.
    const k = leerMonto(c.cargos, "Cargos");
    if (!k.ok) return { ok: false, error: `${k.error} Escribe solo la cifra del seguro u otros cargos, por ejemplo 1,200, o déjalo vacío.` };
    if (k.valor !== null) {
      if (new Big(k.valor).gt(monto.valor!)) return mal("Los cargos no pueden ser mayores que el pago.");
      cargos = new Big(k.valor).eq(0) ? null : k.valor;
    }
  }
  const parte = leerParte(c);
  return ok({
    fecha,
    tipo: c.tipo,
    monto: monto.valor!,
    moneda,
    tasa: tasa.valor,
    cuenta,
    destino,
    categoria: opcional(c.categoria),
    nota: opcional(c.nota),
    recurrenteId: opcional(c.recurrenteId),
    ...(interes !== undefined ? { interes } : {}),
    ...(cargos !== undefined ? { cargos } : {}),
    ...(parte ? { parte } : {}),
    ...(o.registro ? { registroOrigen: o.registro } : {}),
    ...(d.registro ? { registroDestino: d.registro } : {}),
    ...(c.tipo === "pago_tarjeta" && opcional(c.categoriaCargos) ? { categoriaCargos: opcional(c.categoriaCargos) } : {}),
  });
}

/**
 * Tarjeta en dos monedas: a qué parte va el pago («La parte en RD$» / «La parte en US$»). Vacío = según la
 * moneda del monto. Solo los pagos y los cargos a una tarjeta lo usan; los demás quedan en null.
 */
export function leerParte(c: Campos): "DOP" | "USD" | null {
  return c.parte === "DOP" || c.parte === "USD" ? c.parte : null;
}

export function validarRecurrente(c: Campos): Resultado<Omit<Recurrente, "id">> {
  const nombre = texto(c.nombre);
  if (!nombre) return mal("El pago o cobro fijo necesita un nombre. Ej.: Alquiler o Quincena.");
  if (!esUno(TIPOS_MOVIMIENTO, c.tipo)) return mal("Tipo inválido.");
  const frecuencia = c.frecuencia || "mensual";
  if (!esUno(FRECUENCIAS, frecuencia)) return mal("Frecuencia inválida.");
  const moneda = c.moneda || "DOP";
  if (!esUno(MONEDAS, moneda)) return mal("Moneda inválida.");
  const pagoTotal = c.tipo === "pago_tarjeta" && (c.pagoTotal === "on" || c.pagoTotal === "true");
  const monto = leerMonto(c.monto, "Monto", { requerido: !pagoTotal, positivo: !pagoTotal });
  if (!monto.ok) return monto;
  const cuenta = opcional(c.cuenta);
  const destinoCrudo = c.tipo === "transferencia" || c.tipo === "pago_tarjeta" ? opcional(c.destino) : null;
  const e = revisarCuentas(c.tipo, cuenta, destinoCrudo) ?? revisarCategoria(c.tipo, opcional(c.categoria));
  if (e) return mal(e);
  if (cuenta?.startsWith(PREFIJO_REGISTRO)) return mal("Un pago fijo sale de efectivo o de una cuenta.");
  const d = partirCuenta(destinoCrudo);
  if (d.registro && c.tipo !== "transferencia") return mal("Esa inversión solo puede recibir ahorro.");
  const destino = d.caja;
  const dias = texto(c.dias);
  let cadaN: number | null = null;
  let fecha: string | null = null;
  if (frecuencia === "mensual") {
    const lista = dias.split(/[,\s]+/).filter(Boolean);
    if (!lista.length || lista.some((x) => !/^\d+$/.test(x) || Number(x) < 1 || Number(x) > 31))
      return mal("Días del mes: escribe números del 1 al 31 separados por coma (p. ej. 15, 30).");
  } else if (frecuencia === "cada_n") {
    const n = texto(c.cadaN);
    if (!/^\d+$/.test(n) || Number(n) < 1) return mal("Cada N días: escribe un número entero mayor que cero.");
    cadaN = Number.parseInt(n, 10);
  } else {
    fecha = texto(c.fecha);
    if (!esFecha(fecha)) return mal("Fecha: escribe una fecha válida.");
  }
  const desde = opcional(c.desde);
  const hasta = opcional(c.hasta);
  if (desde && !esFecha(desde)) return mal("Desde: fecha inválida.");
  if (hasta && !esFecha(hasta)) return mal("Hasta: fecha inválida.");
  if (desde && hasta && hasta < desde) return mal("«Hasta» es anterior a «desde».");
  return ok({
    nombre,
    tipo: c.tipo,
    monto: monto.valor ?? "0",
    moneda: pagoTotal ? "DOP" : moneda,
    pagoTotal,
    cuenta,
    destino,
    categoria: opcional(c.categoria),
    frecuencia,
    dias: frecuencia === "mensual" ? dias : "",
    cadaN,
    fecha,
    desde,
    hasta,
    activo: c.activo === undefined ? true : c.activo === "on" || c.activo === "true",
    ...(c.tipo === "pago_tarjeta" && leerParte(c) ? { parte: leerParte(c) } : {}),
    ...(d.registro ? { registroDestino: d.registro } : {}),
  });
}

/** Saldo real del banco: vacío = borrar el cuadre de esa cuenta. */
export function validarSaldoReal(v: string | undefined): Resultado<string | null> {
  return leerMonto(v, "Saldo", { permitirNegativo: true });
}
