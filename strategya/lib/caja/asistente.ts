// Asistente de bienvenida del Presupuesto: convierte lo que Mena escribe en 4 pasos (1 ingresos, 2 costos y
// gastos, 3 cuentas y saldos de hoy, 4 ahorro e inversión y colchón) en los datos completos, listos para
// guardarse en una sola transacción. Cada ingreso o gasto es una categoría del estado de resultados; si
// tiene día fijo, además queda como pago o cobro fijo (recurrente) enlazado a esa categoría: se anota una
// sola vez. Puro y con pruebas; reutiliza las validaciones de los formularios y devuelve errores que dicen
// qué arreglar. Todos los montos llegan y salen como texto.

import Big from "big.js";
import type { Fecha } from "./fechas";
import { MARGEN_POR_DEFECTO } from "./importar";
import {
  type Categoria,
  type ConfigCaja,
  type Cuenta,
  type DatosCaja,
  esDeuda,
  esUno,
  type Recurrente,
  TIPOS_CATEGORIA,
  TIPOS_CUENTA,
  type TipoCategoria,
  type TipoCuenta,
} from "./tipos";
import { type Campos, montoDeTexto, type Resultado, validarConfig, validarCuenta, validarRecurrente } from "./validar";

export interface CuentaAsistente {
  nombre: string;
  tipo: TipoCuenta;
  /** Lo que hay hoy; en tarjeta, lo que debes hoy. */
  saldo: string;
  /** Solo tarjeta, opcional. */
  limite?: string;
  /** Solo tarjeta, opcional: día del mes en que la pagas completa. */
  diaPago?: string;
  /** Si es una cuenta que ya está en el Portafolio (registro único): su id. Nombre, tipo y saldo salen de allí. */
  registroId?: string;
}

/** Una cuenta del registro único del Portafolio que el Presupuesto puede usar. */
export interface CuentaDelRegistro {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  /** Saldo de hoy (en una deuda, lo que debes). */
  saldo: string;
  limite: string | null;
  diaPago: number | null;
  /** Es una inversión (renta fija): sirve como destino de ahorro, pero no viene marcada de entrada. */
  inversion?: boolean;
}

/** Un ingreso, costo o gasto: es una categoría; con días, también un fijo. */
export interface ConceptoAsistente {
  nombre: string;
  tipo: TipoCategoria;
  /** Ingresos: lo que recibes cada vez (con días) o al mes (sin días). Gastos: lo que pagas cada vez o al mes. */
  monto: string;
  /** Días del mes en que ocurre ("15, 30"). Vacío = no tiene día fijo: es un presupuesto del mes. */
  dias: string;
}

export interface Asistente {
  ingresos: ConceptoAsistente[];
  gastos: ConceptoAsistente[];
  cuentas: CuentaAsistente[];
  /** Posición (0, 1, …) de la cuenta donde caen los ingresos fijos. -1 = la primera que no es tarjeta. */
  cuentaIngresos: number;
  /** Posición de la cuenta (o tarjeta) con que se pagan los gastos fijos. -1 = la primera que no es tarjeta. */
  cuentaGastos: number;
  /** Lo que apartas al mes para tu Portafolio (opcional). */
  ahorro: string;
  colchon: string;
}

/** Categorías de uso diario que se crean sin monto (solo nombres, ninguna cifra). */
export const CATEGORIAS_DIARIAS = ["Comida", "Transporte", "Salidas", "Otros"] as const;
export const NOMBRE_AHORRO = "Ahorro e inversión";

export const TIPOS_INGRESO: readonly TipoCategoria[] = ["ingreso", "otro_ingreso"];
export const TIPOS_GASTO: readonly TipoCategoria[] = ["costo", "gasto", "gasto_financiero", "otro_gasto"];
const MAXIMO = 60;

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** Solo texto: un número de JSON pasaría por float, así que no se acepta. */
const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const MAL_DATOS = "No llegaron los datos del asistente. Recarga la página e inténtalo de nuevo.";

/** Lee el JSON que manda el asistente (todo como texto). Lo que no es texto se ignora o es error. */
export function leerAsistente(json: string): Resultado<Asistente> {
  let raiz: unknown;
  try {
    raiz = JSON.parse(json);
  } catch {
    return { ok: false, error: MAL_DATOS };
  }
  if (!esObj(raiz)) return { ok: false, error: MAL_DATOS };
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter(esObj).slice(0, MAXIMO) : []);
  const cuentas: CuentaAsistente[] = [];
  for (const c of lista(raiz.cuentas)) {
    const tipo = t(c.tipo);
    if (!esUno(TIPOS_CUENTA, tipo)) return { ok: false, error: "Tipo de cuenta desconocido. Elige banco, efectivo, ahorro o tarjeta." };
    const registroId = t(c.registroId);
    cuentas.push({ nombre: t(c.nombre), tipo, saldo: t(c.saldo), limite: t(c.limite), diaPago: t(c.diaPago), ...(registroId ? { registroId } : {}) });
  }
  const conceptos = (v: unknown, permitidos: readonly TipoCategoria[], porDefecto: TipoCategoria): ConceptoAsistente[] | null => {
    const r: ConceptoAsistente[] = [];
    for (const x of lista(v)) {
      const tipo = t(x.tipo) || porDefecto;
      if (!esUno(TIPOS_CATEGORIA, tipo) || !permitidos.includes(tipo)) return null;
      r.push({ nombre: t(x.nombre), tipo, monto: t(x.monto), dias: t(x.dias) });
    }
    return r;
  };
  const ingresos = conceptos(raiz.ingresos, TIPOS_INGRESO, "ingreso");
  const gastos = conceptos(raiz.gastos, TIPOS_GASTO, "gasto");
  if (!ingresos || !gastos) return { ok: false, error: MAL_DATOS };
  const indice = (v: unknown) => (typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : typeof v === "number" && Number.isInteger(v) ? v : -1);
  return {
    ok: true,
    valor: { ingresos, gastos, cuentas, cuentaIngresos: indice(raiz.cuentaIngresos), cuentaGastos: indice(raiz.cuentaGastos), ahorro: t(raiz.ahorro), colchon: t(raiz.colchon) },
  };
}

const nombreDe = (n: string, i: number, que: string) => (n ? `«${n}»` : `${que} ${i + 1}`);

/** Quita el «Monto: » / «Saldo inicial: » del validador general para unirlo a la frase del asistente. */
const sinPrefijo = (e: string) => e.replace(/^[^:]+:\s*/, "");

/** Monto escrito → decimal, o el error con un ejemplo para arreglarlo. */
function montoPositivo(v: string, donde: string, ejemplo: string): Resultado<string> {
  try {
    const m = montoDeTexto(v);
    if (m === null) return { ok: false, error: `${donde}: escribe el monto, por ejemplo ${ejemplo}.` };
    if (new Big(m).lte(0)) return { ok: false, error: `${donde}: el monto debe ser mayor que cero.` };
    return { ok: true, valor: m };
  } catch {
    return { ok: false, error: `${donde}: «${v}» no es un número. Escribe solo la cifra, por ejemplo ${ejemplo}.` };
  }
}

function diaValido(d: string): boolean {
  return /^\d{1,2}$/.test(d) && Number(d) >= 1 && Number(d) <= 31;
}

const partirDias = (dias: string) => dias.split(/[,\s]+/).filter(Boolean);

/**
 * Convierte el asistente en los datos completos. Lo que ya existiera (cuentas, categorías, movimientos…
 * sin configuración) se conserva y lo nuevo se agrega después.
 */
export function armarDesdeAsistente(
  a: Asistente,
  hoy: Fecha,
  existentes: DatosCaja,
  nuevoId: () => string,
  registro: readonly CuentaDelRegistro[] = [],
): Resultado<DatosCaja & { config: ConfigCaja }> {
  const mal = (error: string): Resultado<DatosCaja & { config: ConfigCaja }> => ({ ok: false, error });

  // Copia: un nombre repetido suma su monto a la categoría que ya existía, sin tocar lo recibido.
  const categorias: Categoria[] = existentes.categorias.map((c) => ({ ...c }));
  const nuevaCategoria = (nombre: string, tipo: TipoCategoria, adicional: string | null): string => {
    const previa = categorias.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase() && c.tipo === tipo);
    if (previa) {
      if (adicional) previa.adicional = new Big(previa.adicional ?? "0").plus(adicional).toString();
      return previa.id;
    }
    const id = nuevoId();
    categorias.push({ id, nombre, tipo, adicional });
    return id;
  };
  // Los fijos se arman después del paso 3 (necesitan las cuentas).
  const fijos: { paso: 1 | 2; quien: string; c: ConceptoAsistente; monto: string; categoria: string }[] = [];

  // Paso 1 · ingresos   ·   Paso 2 · costos y gastos
  const pasos = [
    { paso: 1 as const, lista: a.ingresos, que: "Ingreso", ejemplo: "35,000" },
    { paso: 2 as const, lista: a.gastos, que: "Gasto", ejemplo: "15,000" },
  ];
  for (const { paso, lista, que, ejemplo } of pasos) {
    for (const [i, c] of lista.entries()) {
      if (!c.nombre && !c.monto && !c.dias) continue; // fila vacía
      const quien = nombreDe(c.nombre, i, que);
      if (!c.nombre) {
        return mal(paso === 1 ? `Paso 1, ingreso ${i + 1}: ponle un nombre, por ejemplo «Sueldo» o «Quincena».` : `Paso 2, gasto ${i + 1}: ponle un nombre, por ejemplo «Alquiler» o «Comida».`);
      }
      const m = montoPositivo(c.monto, `Paso ${paso}, ${quien}`, ejemplo);
      if (!m.ok) return mal(m.error);
      if (c.dias) {
        if (!partirDias(c.dias).every(diaValido)) {
          return mal(
            paso === 1
              ? `Paso 1, ${quien}: escribe los días del mes en que te pagan, separados por coma (por ejemplo 15, 30), o déjalo vacío si no tiene día fijo.`
              : `Paso 2, ${quien}: escribe el día del mes en que lo pagas (un número del 1 al 31), o déjalo vacío si no tiene día fijo.`,
          );
        }
        fijos.push({ paso, quien, c, monto: m.valor, categoria: nuevaCategoria(c.nombre, c.tipo, null) });
      } else {
        // Sin día fijo: lo que esperas recibir o gastar en el mes (un presupuesto sin fecha).
        nuevaCategoria(c.nombre, c.tipo, m.valor);
      }
    }
  }

  // Paso 3 · cuentas y saldos de hoy
  if (!a.cuentas.length) return mal("Paso 3: agrega al menos una cuenta (por ejemplo, tu cuenta de banco) con lo que tiene hoy.");
  const ordenBase = existentes.cuentas.reduce((m, c) => Math.max(m, c.orden), -1) + 1;
  const cuentas: Cuenta[] = [];
  for (const [i, c] of a.cuentas.entries()) {
    if (c.registroId) {
      // Ya está en el Portafolio: se usa tal cual (una sola verdad), sin pedir de nuevo nombre ni saldo.
      const r = registro.find((x) => x.id === c.registroId);
      if (!r) return mal(`Paso 3: una de las cuentas elegidas ya no está en tu Portafolio. Vuelve a elegirla.`);
      if (c.diaPago && !diaValido(c.diaPago)) return mal(`Paso 3, «${r.nombre}»: el día de pago debe ser un número del 1 al 31.`);
      cuentas.push({ id: nuevoId(), nombre: r.nombre, tipo: r.tipo, saldoInicial: r.saldo, limite: r.limite, orden: ordenBase + i, registroId: r.id });
      continue;
    }
    const quien = nombreDe(c.nombre, i, "Cuenta");
    if (!c.nombre) return mal(`Paso 3, cuenta ${i + 1}: ponle un nombre que reconozcas, por ejemplo «Banco Popular» o «Cartera».`);
    if (!c.saldo) {
      return mal(
        c.tipo === "tarjeta"
          ? `Paso 3, ${quien}: escribe cuánto debes hoy en la tarjeta (si no debes nada, escribe 0).`
          : `Paso 3, ${quien}: escribe cuánto tiene hoy (si está vacía, escribe 0).`,
      );
    }
    const campos: Campos = { nombre: c.nombre, tipo: c.tipo, saldoInicial: c.saldo, limite: c.tipo === "tarjeta" ? c.limite : "", orden: String(ordenBase + i) };
    const r = validarCuenta(campos);
    if (!r.ok) return mal(`Paso 3, ${quien}: ${sinPrefijo(r.error)} Escribe solo la cifra, por ejemplo 25,000.50.`);
    if (c.tipo === "tarjeta" && c.diaPago && !diaValido(c.diaPago)) return mal(`Paso 3, ${quien}: el día de pago debe ser un número del 1 al 31.`);
    cuentas.push({ id: nuevoId(), ...r.valor });
  }
  const pagadora = cuentas.find((c) => c.tipo === "banco") ?? cuentas.find((c) => c.tipo === "efectivo") ?? null;
  const elegida = (k: number) => (k >= 0 && k < cuentas.length ? cuentas[k] : null);
  const noTarjeta = cuentas.find((c) => !esDeuda(c.tipo)) ?? null;
  const cuentaIngresos = elegida(a.cuentaIngresos) ?? noTarjeta;
  const cuentaGastos = elegida(a.cuentaGastos) ?? noTarjeta ?? cuentas[0];

  const recurrentes: Recurrente[] = [];
  for (const f of fijos) {
    const cuenta = f.paso === 1 ? cuentaIngresos : cuentaGastos;
    if (!cuenta) return mal("Paso 3: para recibir tus ingresos fijos agrega una cuenta de banco o efectivo.");
    const dias = partirDias(f.c.dias).map((d) => String(Number(d))).join(", ");
    const r = validarRecurrente({ nombre: f.c.nombre, tipo: f.paso === 1 ? "ingreso" : "gasto", monto: f.monto, cuenta: cuenta.id, categoria: f.categoria, frecuencia: "mensual", dias });
    if (!r.ok) return mal(`Paso ${f.paso}, ${f.quien}: ${r.error}`);
    recurrentes.push({ id: nuevoId(), ...r.valor });
  }

  // Pago de cada tarjeta con día de pago: paga el total adeudado desde el banco (o el efectivo).
  for (const [i, c] of a.cuentas.entries()) {
    if (cuentas[i].tipo !== "tarjeta" || !c.diaPago) continue;
    if (!pagadora) return mal(`Paso 3, «${cuentas[i].nombre}»: para programar el pago de la tarjeta agrega también una cuenta de banco o efectivo.`);
    recurrentes.push({
      id: nuevoId(), nombre: `Pago ${cuentas[i].nombre}`, tipo: "pago_tarjeta", monto: "0", moneda: "DOP", pagoTotal: true,
      cuenta: pagadora.id, destino: cuentas[i].id, categoria: null, frecuencia: "mensual", dias: String(Number(c.diaPago)),
      cadaN: null, fecha: null, desde: null, hasta: null, activo: true,
    });
  }

  // Categorías del día a día, sin monto (para que «+ Gasto» tenga dónde anotar).
  const nombres = new Set(categorias.map((c) => c.nombre.toLowerCase()));
  for (const n of CATEGORIAS_DIARIAS) if (!nombres.has(n.toLowerCase())) nuevaCategoria(n, "gasto", null);

  // Paso 4 · ahorro e inversión y colchón
  if (a.ahorro) {
    const m = montoPositivo(a.ahorro, "Paso 4, ahorro e inversión", "5,000");
    if (!m.ok) return mal(`${m.error} Si no apartas nada, déjalo vacío.`);
    nuevaCategoria(NOMBRE_AHORRO, "ahorro_inversion", m.valor);
  } else if (!categorias.some((c) => c.tipo === "ahorro_inversion")) {
    nuevaCategoria(NOMBRE_AHORRO, "ahorro_inversion", null);
  }
  if (!a.colchon) return mal("Paso 4: escribe tu colchón mínimo, por ejemplo 10,000. Si no quieres colchón, escribe 0.");
  const cfg = validarConfig({ inicio: hoy, colchon: a.colchon, margen: MARGEN_POR_DEFECTO, tasaUSD: existentes.config?.tasaUSD ?? "" });
  if (!cfg.ok) return mal(`Paso 4: ${sinPrefijo(cfg.error)} Escribe solo la cifra, por ejemplo 10,000.`);

  return {
    ok: true,
    valor: {
      ...existentes,
      config: cfg.valor,
      cuentas: [...existentes.cuentas, ...cuentas],
      categorias,
      recurrentes: [...existentes.recurrentes, ...recurrentes],
    },
  };
}

/** Suma mensual de un monto por días ("15, 30" × monto). Para los totales del asistente. */
export function totalMensual(monto: string, dias: string): string | null {
  try {
    const n = new Set(partirDias(dias).filter(diaValido).map(Number)).size;
    const m = montoDeTexto(monto);
    return n && m ? new Big(m).times(n).toString() : null;
  } catch {
    return null;
  }
}

/** Lo que pesa un concepto en el mes: con días, monto × días; sin días, el monto tal cual. */
export function alMes(monto: string, dias: string): string | null {
  if (dias.trim()) return totalMensual(monto, dias);
  try {
    return montoDeTexto(monto);
  } catch {
    return null;
  }
}
