// Asistente de bienvenida del Calendario de Caja: convierte lo que Mena escribe en 4 pasos (cuentas,
// ingresos fijos, gastos fijos y colchón) en los datos completos de la caja, listos para guardarse en
// una sola transacción. Puro y con pruebas: reutiliza las validaciones de los formularios normales y
// devuelve errores que dicen qué arreglar. Todos los montos llegan y salen como texto.

import Big from "big.js";
import type { Fecha } from "./fechas";
import { MARGEN_POR_DEFECTO } from "./importar";
import { type Categoria, type ConfigCaja, type Cuenta, type DatosCaja, esUno, type Recurrente, TIPOS_CUENTA, type TipoCuenta } from "./tipos";
import { type Campos, type Resultado, validarConfig, validarCuenta, validarRecurrente } from "./validar";

export interface CuentaAsistente {
  nombre: string;
  tipo: TipoCuenta;
  /** Lo que hay hoy; en tarjeta, lo que debes hoy. */
  saldo: string;
  /** Solo tarjeta, opcional. */
  limite?: string;
  /** Solo tarjeta, opcional: día del mes en que la pagas completa. */
  diaPago?: string;
}

export interface IngresoAsistente {
  nombre: string;
  monto: string;
  /** "15, 30" */
  dias: string;
  /** Posición (0, 1, …) de la cuenta en la lista del paso 1. */
  cuenta: number;
}

export interface GastoAsistente {
  nombre: string;
  monto: string;
  /** Día del mes (1–31). */
  dia: string;
  cuenta: number;
}

export interface Asistente {
  cuentas: CuentaAsistente[];
  ingresos: IngresoAsistente[];
  gastos: GastoAsistente[];
  colchon: string;
}

/** Categorías de uso diario que se crean sin presupuesto (solo nombres, ninguna cifra). */
export const CATEGORIAS_DIARIAS = ["Comida", "Transporte", "Salidas", "Otros"] as const;

const MAXIMO = 60;

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** Solo texto: un número de JSON pasaría por float, así que no se acepta. */
const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Lee el JSON que manda el asistente (todo como texto). Lo que no es texto se ignora o es error. */
export function leerAsistente(json: string): Resultado<Asistente> {
  let raiz: unknown;
  try {
    raiz = JSON.parse(json);
  } catch {
    return { ok: false, error: "No llegaron los datos del asistente. Recarga la página e inténtalo de nuevo." };
  }
  if (!esObj(raiz)) return { ok: false, error: "No llegaron los datos del asistente. Recarga la página e inténtalo de nuevo." };
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter(esObj).slice(0, MAXIMO) : []);
  const cuentas: CuentaAsistente[] = [];
  for (const c of lista(raiz.cuentas)) {
    const tipo = t(c.tipo);
    if (!esUno(TIPOS_CUENTA, tipo)) return { ok: false, error: "Tipo de cuenta desconocido. Elige banco, efectivo, ahorro o tarjeta." };
    cuentas.push({ nombre: t(c.nombre), tipo, saldo: t(c.saldo), limite: t(c.limite), diaPago: t(c.diaPago) });
  }
  const indice = (v: unknown) => (typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : typeof v === "number" && Number.isInteger(v) ? v : -1);
  const ingresos = lista(raiz.ingresos).map((i) => ({ nombre: t(i.nombre), monto: t(i.monto), dias: t(i.dias), cuenta: indice(i.cuenta) }));
  const gastos = lista(raiz.gastos).map((g) => ({ nombre: t(g.nombre), monto: t(g.monto), dia: t(g.dia), cuenta: indice(g.cuenta) }));
  return { ok: true, valor: { cuentas, ingresos, gastos, colchon: t(raiz.colchon) } };
}

const nombreDe = (n: string, i: number, que: string) => (n ? `«${n}»` : `${que} ${i + 1}`);

/** Quita el «Monto: » / «Saldo inicial: » del validador general para unirlo a la frase del asistente. */
const sinPrefijo = (e: string) => e.replace(/^[^:]+:\s*/, "");

/**
 * Convierte el asistente en los datos completos de la caja. Lo que ya existiera (cuentas, categorías,
 * movimientos… sin configuración) se conserva tal cual y lo nuevo se agrega después.
 */
export function armarDesdeAsistente(
  a: Asistente,
  hoy: Fecha,
  existentes: DatosCaja,
  nuevoId: () => string,
): Resultado<DatosCaja & { config: ConfigCaja }> {
  const mal = (error: string): Resultado<DatosCaja & { config: ConfigCaja }> => ({ ok: false, error });

  // Paso 1 · cuentas
  if (!a.cuentas.length) return mal("Paso 1: agrega al menos una cuenta (por ejemplo, tu cuenta de banco) con lo que tiene hoy.");
  const ordenBase = existentes.cuentas.reduce((m, c) => Math.max(m, c.orden), -1) + 1;
  const cuentas: Cuenta[] = [];
  for (const [i, c] of a.cuentas.entries()) {
    const quien = nombreDe(c.nombre, i, "Cuenta");
    if (!c.nombre) return mal(`Paso 1, cuenta ${i + 1}: ponle un nombre que reconozcas, por ejemplo «Banco Popular» o «Cartera».`);
    if (!c.saldo) {
      return mal(
        c.tipo === "tarjeta"
          ? `Paso 1, ${quien}: escribe cuánto debes hoy en la tarjeta (si no debes nada, escribe 0).`
          : `Paso 1, ${quien}: escribe cuánto tiene hoy (si está vacía, escribe 0).`,
      );
    }
    const campos: Campos = { nombre: c.nombre, tipo: c.tipo, saldoInicial: c.saldo, limite: c.tipo === "tarjeta" ? c.limite : "", orden: String(ordenBase + i) };
    const r = validarCuenta(campos);
    if (!r.ok) return mal(`Paso 1, ${quien}: ${sinPrefijo(r.error)} Escribe solo la cifra, por ejemplo 25,000.50.`);
    if (c.tipo === "tarjeta" && c.diaPago && !diaValido(c.diaPago)) return mal(`Paso 1, ${quien}: el día de pago debe ser un número del 1 al 31.`);
    cuentas.push({ id: nuevoId(), ...r.valor });
  }
  const pagadora = cuentas.find((c) => c.tipo === "banco") ?? cuentas.find((c) => c.tipo === "efectivo") ?? null;

  const categorias: Categoria[] = [];
  const recurrentes: Recurrente[] = [];
  const nombresCat = new Set(existentes.categorias.map((c) => c.nombre.toLowerCase()));
  const nuevaCategoria = (nombre: string, grupo: Categoria["grupo"], presupuesto: string | null): string => {
    const previa = [...existentes.categorias, ...categorias].find((c) => c.nombre.toLowerCase() === nombre.toLowerCase() && c.grupo === grupo);
    if (previa) return previa.id;
    const id = nuevoId();
    categorias.push({ id, nombre, grupo, presupuesto });
    nombresCat.add(nombre.toLowerCase());
    return id;
  };
  const cuentaDe = (k: number) => (k >= 0 && k < cuentas.length ? cuentas[k] : null);

  // Paso 2 · ingresos fijos
  for (const [i, g] of a.ingresos.entries()) {
    if (!g.nombre && !g.monto && !g.dias) continue; // fila vacía
    const quien = nombreDe(g.nombre, i, "Ingreso");
    if (!g.nombre) return mal(`Paso 2, ingreso ${i + 1}: ponle un nombre, por ejemplo «Sueldo» o «Quincena».`);
    if (!g.monto) return mal(`Paso 2, ${quien}: escribe cuánto recibes cada vez, por ejemplo 35,000.`);
    const cuenta = cuentaDe(g.cuenta);
    if (!cuenta) return mal(`Paso 2, ${quien}: elige en qué cuenta te cae.`);
    const r = validarRecurrente({ nombre: g.nombre, tipo: "ingreso", monto: g.monto, cuenta: cuenta.id, frecuencia: "mensual", dias: g.dias });
    if (!r.ok) return mal(`Paso 2, ${quien}: ${frase(r.error)}`);
    recurrentes.push({ id: nuevoId(), ...r.valor, categoria: nuevaCategoria(g.nombre, "ingreso", null) });
  }

  // Paso 3 · gastos fijos
  for (const [i, g] of a.gastos.entries()) {
    if (!g.nombre && !g.monto && !g.dia) continue;
    const quien = nombreDe(g.nombre, i, "Gasto");
    if (!g.nombre) return mal(`Paso 3, gasto ${i + 1}: ponle un nombre, por ejemplo «Alquiler» o «Luz».`);
    if (!g.monto) return mal(`Paso 3, ${quien}: escribe cuánto pagas cada mes, por ejemplo 15,000.`);
    if (!diaValido(g.dia)) return mal(`Paso 3, ${quien}: escribe el día del mes en que lo pagas (un número del 1 al 31).`);
    const cuenta = cuentaDe(g.cuenta);
    if (!cuenta) return mal(`Paso 3, ${quien}: elige con qué cuenta o tarjeta lo pagas.`);
    const r = validarRecurrente({ nombre: g.nombre, tipo: "gasto", monto: g.monto, cuenta: cuenta.id, frecuencia: "mensual", dias: String(Number(g.dia)) });
    if (!r.ok) return mal(`Paso 3, ${quien}: ${frase(r.error)}`);
    // El presupuesto de su categoría es exactamente lo que Mena dijo que paga al mes.
    recurrentes.push({ id: nuevoId(), ...r.valor, categoria: nuevaCategoria(g.nombre, "fijo", r.valor.monto) });
  }

  // Pago de cada tarjeta con día de pago: paga el total adeudado desde el banco (o el efectivo).
  for (const [i, c] of a.cuentas.entries()) {
    if (c.tipo !== "tarjeta" || !c.diaPago) continue;
    if (!pagadora) return mal(`Paso 1, «${c.nombre}»: para programar el pago de la tarjeta agrega también una cuenta de banco o efectivo.`);
    recurrentes.push({
      id: nuevoId(), nombre: `Pago ${c.nombre}`, tipo: "pago_tarjeta", monto: "0", moneda: "DOP", pagoTotal: true,
      cuenta: pagadora.id, destino: cuentas[i].id, categoria: null, frecuencia: "mensual", dias: String(Number(c.diaPago)),
      cadaN: null, fecha: null, desde: null, hasta: null, activo: true,
    });
  }

  // Categorías del día a día, sin presupuesto (para que «+ Gasto» tenga dónde anotar).
  for (const n of CATEGORIAS_DIARIAS) if (!nombresCat.has(n.toLowerCase())) nuevaCategoria(n, "variable", null);

  // Paso 4 · colchón
  if (!a.colchon) return mal("Paso 4: escribe tu colchón mínimo, por ejemplo 10,000. Si no quieres colchón, escribe 0.");
  const cfg = validarConfig({ inicio: hoy, colchon: a.colchon, margen: MARGEN_POR_DEFECTO, tasaUSD: existentes.config?.tasaUSD ?? "" });
  if (!cfg.ok) return mal(`Paso 4: ${sinPrefijo(cfg.error)} Escribe solo la cifra, por ejemplo 10,000.`);

  return {
    ok: true,
    valor: {
      ...existentes,
      config: cfg.valor,
      cuentas: [...existentes.cuentas, ...cuentas],
      categorias: [...existentes.categorias, ...categorias],
      recurrentes: [...existentes.recurrentes, ...recurrentes],
    },
  };
}

function diaValido(d: string): boolean {
  return /^\d{1,2}$/.test(d) && Number(d) >= 1 && Number(d) <= 31;
}

function frase(e: string): string {
  if (/^Monto/.test(e)) return `${sinPrefijo(e)} Escribe solo la cifra, por ejemplo 35,000.`;
  if (/^Días del mes/.test(e)) return "escribe los días del mes en que te pagan, separados por coma (por ejemplo 15, 30).";
  return e;
}

/** Suma mensual de una lista de montos por días ("15, 30" × monto). Para el resumen del último paso. */
export function totalMensual(monto: string, dias: string): string | null {
  try {
    const n = dias.split(/[,\s]+/).filter((x) => diaValido(x)).length;
    const m = new Big(monto.replace(/^(RD)?\$\s*/i, "").replace(/,/g, "").trim());
    return n ? m.times(n).toString() : null;
  } catch {
    return null;
  }
}
