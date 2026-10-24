// Registro único «Mis cuentas, activos y deudas» (personal.activos desde la migración
// 20261023000100_registro_unico.sql). Funciones puras: de la fila de la base al modelo, saldo vigente de
// cada cuenta (lo escrito + lo que el Presupuesto anotó desde entonces), balance personal (activos −
// deudas = patrimonio) y sugerencias de filas repetidas para «Unir cuentas repetidas».
//
// Saldo vigente: si el Presupuesto usa la cuenta, su línea de tiempo vive allá (saldo inicial +
// movimientos + cuadres, y cada saldo escrito aquí entra como cuadre). El saldo de hoy sale del mismo
// motor del Presupuesto (lib/caja/motor.ts · simular) SIN los pagos fijos que todavía no se confirman:
// solo lo que de verdad pasó. Una sola verdad para las dos pantallas.

import Big from "big.js";
import { simular } from "../caja/motor";
import type { CuentaDelRegistro } from "../caja/asistente";
import type { DatosCaja } from "../caja/tipos";
import { CERO, n, suma } from "./decimal";
import { type Contexto, valorDOP } from "./posicion";
import {
  type Activo,
  type ClaseRegistro,
  CLASES,
  CLASES_OTRAS,
  type Dec,
  esClaseDeuda,
  esClaseInversion,
  type FrecuenciaPago,
  FRECUENCIAS_PAGO,
  type Moneda,
  type PlanInstrumento,
  type TipoRentaFija,
} from "./tipos";

export const IDS_CLASE_REGISTRO: readonly ClaseRegistro[] = [...CLASES.map((c) => c.id), ...CLASES_OTRAS.map((c) => c.id)];

export type OrigenRegistro = "portafolio" | "presupuesto" | "tarjetas";

export interface ItemRegistro {
  id: string;
  clase: ClaseRegistro;
  subtipo: string | null;
  nombre: string;
  inst: string;
  simbolo: string | null;
  moneda: Moneda;
  /** Saldo VIGENTE (monto o unidades). En una deuda, lo que se debe hoy. */
  cantidad: Dec;
  /** Lo que Mena escribió la última vez (antes de sumar lo que anotó el Presupuesto). */
  cantidadEscrita: Dec;
  precio: Dec;
  tasa: Dec;
  venc: string | null;
  tipoRF: TipoRentaFija | null;
  /** Fecha del saldo escrito (saldo al empezar ese día). null = sin saldo registrado. */
  saldoFecha: string | null;
  limite: Dec | null;
  diaPago: number | null;
  cuota: Dec | null;
  origen: OrigenRegistro;
  unidoA: string | null;
  /** Cuenta del Presupuesto enlazada (caja_cuentas.id) o null si el Presupuesto no la usa. */
  cajaId: string | null;
  plan: PlanInstrumento;
  orden: number;
  actualizadoEn: string | null;
  /** De dónde sale `cantidad`. */
  vigente: { fuente: "escrito" | "presupuesto"; movimientos: number };
}

/** Columnas que se piden a personal.activos (numeric como texto). */
export const COLUMNAS_REGISTRO =
  "id, clase, subtipo, nombre, institucion, simbolo, moneda, cantidad::text, precio::text, tasa::text, vencimiento, tipo_rf, saldo_fecha, limite::text, dia_pago, cuota::text, origen, unido_a, capitaliza, frecuencia_pago, reinvierte, aporte_pct::text, plan_inicio, orden, actualizado_en";

type F = Record<string, unknown>;
const txt = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
// node-postgres entrega date como Date a medianoche local; PostgREST, como texto.
const dia = (v: unknown): string | null =>
  v === null || v === undefined
    ? null
    : v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`
      : String(v).slice(0, 10);
const esFrecuencia = (v: unknown): v is FrecuenciaPago => FRECUENCIAS_PAGO.some((f) => f.id === v);

/** Fila de personal.activos (columnas COLUMNAS_REGISTRO) → modelo. `cajaId` = cuenta del Presupuesto enlazada. */
export function filaARegistro(f: F, cajaId: string | null = null): ItemRegistro {
  const cantidad = txt(f.cantidad) ?? "0";
  return {
    id: String(f.id),
    clase: String(f.clase) as ClaseRegistro,
    subtipo: txt(f.subtipo),
    nombre: String(f.nombre ?? ""),
    inst: String(f.institucion ?? ""),
    simbolo: txt(f.simbolo),
    moneda: String(f.moneda) as Moneda,
    cantidad,
    cantidadEscrita: cantidad,
    precio: txt(f.precio) ?? "1",
    tasa: txt(f.tasa) ?? "0",
    venc: dia(f.vencimiento),
    tipoRF: (txt(f.tipo_rf) as TipoRentaFija | null) ?? null,
    saldoFecha: dia(f.saldo_fecha),
    limite: txt(f.limite),
    diaPago: f.dia_pago === null || f.dia_pago === undefined ? null : Number(f.dia_pago),
    cuota: txt(f.cuota),
    origen: (txt(f.origen) as OrigenRegistro | null) ?? "portafolio",
    unidoA: txt(f.unido_a),
    cajaId,
    plan: {
      capitaliza: typeof f.capitaliza === "boolean" ? f.capitaliza : null,
      frecuenciaPago: esFrecuencia(f.frecuencia_pago) ? f.frecuencia_pago : null,
      reinvierte: typeof f.reinvierte === "boolean" ? f.reinvierte : null,
      aportePct: txt(f.aporte_pct),
      inicio: dia(f.plan_inicio),
    },
    orden: Number(f.orden ?? 0),
    actualizadoEn: f.actualizado_en instanceof Date ? f.actualizado_en.toISOString() : txt(f.actualizado_en),
    vigente: { fuente: "escrito", movimientos: 0 },
  };
}

/** Un instrumento de inversión del registro como Activo del motor de Capital. */
export function aActivo(i: ItemRegistro): Activo {
  return {
    id: i.id,
    clase: i.clase as Activo["clase"],
    nombre: i.nombre,
    inst: i.inst,
    simbolo: i.simbolo,
    moneda: i.moneda,
    cantidad: i.cantidad,
    precio: i.precio,
    tasa: i.tasa,
    venc: i.venc,
    tipoRF: i.tipoRF,
    saldoFecha: i.saldoFecha,
    subtipo: i.subtipo,
    cajaId: i.cajaId,
    cantidadEscrita: i.cantidadEscrita,
    plan: i.plan,
  };
}

export const esDeuda = (i: Pick<ItemRegistro, "clase">) => esClaseDeuda(i.clase);
export const esInversion = (i: Pick<ItemRegistro, "clase">) => esClaseInversion(i.clase);

/** ¿Puede ser cuenta del Presupuesto? Saldos en pesos (no unidades ni bienes). */
export function sirveParaPresupuesto(i: ItemRegistro): boolean {
  if (i.unidoA || i.moneda !== "DOP") return false;
  if (esDeuda(i)) return true;
  return (i.clase === "efectivo" || i.clase === "ahorros" || i.clase === "rentafija") && n(i.precio).eq(1);
}

/** Cuentas del Presupuesto que mueven saldo: efectivo y cuentas (los demás quedan como destino de ahorro). */
export function tipoCajaDe(i: Pick<ItemRegistro, "clase" | "subtipo">): "banco" | "efectivo" | "ahorro" | "tarjeta" | "prestamo" {
  if (i.clase === "efectivo") return "efectivo";
  if (i.clase === "ahorros" && i.subtipo === "corriente") return "banco";
  if (i.clase === "tarjeta") return "tarjeta";
  if (i.clase === "prestamo" || i.clase === "deuda") return "prestamo";
  return "ahorro";
}

/**
 * Saldo vigente de cada fila enlazada al Presupuesto: la posición de su cuenta al cierre de hoy según el
 * motor del Presupuesto, con lo registrado (movimientos y cuadres) y SIN los fijos aún no confirmados.
 * Las filas sin enlace (o sin Presupuesto configurado) quedan con lo escrito.
 */
export function conSaldosVigentes(items: ItemRegistro[], caja: DatosCaja | null, hoy: string): ItemRegistro[] {
  if (!caja?.config) return items;
  const enlazadas = items.filter((i) => i.cajaId && caja.cuentas.some((c) => c.id === i.cajaId));
  if (!enlazadas.length) return items;
  const sim = simular({ ...caja, recurrentes: [] }, { hoy, hasta: hoy });
  const d = sim.porFecha.get(hoy);
  if (!d) return items;
  return items.map((i) => {
    if (!i.cajaId || d.posiciones[i.cajaId] === undefined) return i;
    const pos = new Big(d.posiciones[i.cajaId]);
    const cantidad = (esDeuda(i) ? pos.times(-1) : pos).toFixed();
    const movimientos = caja.movimientos.filter((m) => m.fecha <= hoy && (m.cuenta === i.cajaId || m.destino === i.cajaId)).length;
    return { ...i, cantidad: cantidad === "-0" ? "0" : cantidad, vigente: { fuente: "presupuesto", movimientos } };
  });
}

/** Valor en RD$ de una fila (deudas en positivo). null si falta el tipo de cambio de su moneda. */
export function valorRegistro(ctx: Contexto, i: ItemRegistro): Big | null {
  return valorDOP(ctx, aActivo(i));
}

export interface Balance {
  /** Las 4 clases de inversión. */
  inversiones: Big;
  /** Vehículo, inmueble y otros bienes. */
  otros: Big;
  activos: Big;
  deudas: Big;
  patrimonio: Big;
  porClase: Partial<Record<ClaseRegistro, Big>>;
  sinValorar: ItemRegistro[];
  /** Deudas sin saldo escrito (punteado gris «sin dato»). */
  deudasSinDato: ItemRegistro[];
  hayDeudas: boolean;
}

export function balance(ctx: Contexto, items: ItemRegistro[]): Balance {
  const porClase: Partial<Record<ClaseRegistro, Big>> = {};
  const sinValorar: ItemRegistro[] = [];
  let inversiones = CERO;
  let otros = CERO;
  let deudas = CERO;
  for (const i of items) {
    if (i.unidoA) continue;
    const v = valorRegistro(ctx, i);
    if (v === null) {
      sinValorar.push(i);
      continue;
    }
    porClase[i.clase] = (porClase[i.clase] ?? CERO).plus(v);
    if (esDeuda(i)) deudas = deudas.plus(v);
    else if (esInversion(i)) inversiones = inversiones.plus(v);
    else otros = otros.plus(v);
  }
  const activos = inversiones.plus(otros);
  const vigentes = items.filter((i) => !i.unidoA);
  return {
    inversiones,
    otros,
    activos,
    deudas,
    patrimonio: activos.minus(deudas),
    porClase,
    sinValorar,
    deudasSinDato: vigentes.filter((i) => esDeuda(i) && i.saldoFecha === null && i.vigente.fuente === "escrito"),
    hayDeudas: vigentes.some(esDeuda),
  };
}

/** Deuda de tarjetas (RD$, solo las que tienen saldo). */
export function deudaTarjetas(ctx: Contexto, items: ItemRegistro[]): Big {
  return suma(items.filter((i) => !i.unidoA && i.clase === "tarjeta").map((i) => valorRegistro(ctx, i) ?? CERO));
}

// ───────────────────────── Unir cuentas repetidas ─────────────────────────

const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "en", "mi", "mis", "cuenta", "cuentas", "cta", "ahorro", "ahorros", "corriente",
  "banco", "tarjeta", "tarjetas", "credito", "debito", "rd", "us", "usd", "dop", "pesos", "dolares", "nomina", "personal",
]);

/** «Cuenta de Ahorros Popular» → ["popular"]. Minúsculas, sin acentos ni palabras de relleno. */
export function palabrasClave(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !VACIAS.has(w));
}

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export interface ParUnion {
  /** La que vino del Presupuesto (se archiva al unir). */
  presupuesto: ItemRegistro;
  /** La del Portafolio (se queda: conserva su id, su historia y su clase). */
  portafolio: ItemRegistro;
  /** Por qué se sugiere, en palabras simples. */
  motivo: string;
  puntos: number;
}

export const clavePar = (p: Pick<ParUnion, "presupuesto" | "portafolio">) => `${p.presupuesto.id}|${p.portafolio.id}`;

function compatibles(a: ItemRegistro, b: ItemRegistro): boolean {
  if (a.moneda !== b.moneda) return false;
  if (esDeuda(a) !== esDeuda(b)) return false;
  if (esDeuda(a)) return (a.clase === "tarjeta") === (b.clase === "tarjeta");
  if (!n(b.precio).eq(1) || !n(a.precio).eq(1)) return false;
  if (a.clase === "efectivo" || b.clase === "efectivo") return a.clase === b.clase;
  return (a.clase === "ahorros" || a.clase === "rentafija") && (b.clase === "ahorros" || b.clase === "rentafija");
}

/**
 * Pares probables «la misma cuenta anotada dos veces»: una fila que vino del Presupuesto y una del
 * Portafolio (o de sus tarjetas) compatibles (misma moneda, mismo tipo) con nombre o institución
 * parecidos. Cada fila aparece en un solo par (el de más puntos). Nada se une solo: Mena confirma.
 */
export function sugerirUniones(items: ItemRegistro[], descartadas: ReadonlySet<string> = new Set()): ParUnion[] {
  const vivas = items.filter((i) => !i.unidoA);
  const delPresupuesto = vivas.filter((i) => i.origen === "presupuesto");
  const delPortafolio = vivas.filter((i) => i.origen !== "presupuesto" && !i.cajaId);
  const efectivoP = delPresupuesto.filter((i) => i.clase === "efectivo" && i.moneda === "DOP");
  const efectivoQ = delPortafolio.filter((i) => i.clase === "efectivo" && i.moneda === "DOP");
  const candidatos: ParUnion[] = [];
  for (const p of delPresupuesto) {
    for (const q of delPortafolio) {
      if (!compatibles(p, q)) continue;
      const par = { presupuesto: p, portafolio: q };
      if (descartadas.has(clavePar(par))) continue;
      const pp = palabrasClave(p.nombre);
      const pq = palabrasClave(`${q.nombre} ${q.inst}`);
      let puntos = 0;
      let motivo = "";
      if (plano(p.nombre) && plano(p.nombre) === plano(q.nombre)) {
        puntos = 100;
        motivo = "Tienen el mismo nombre.";
      } else {
        const comunes = [...new Set(pp.filter((w) => pq.includes(w)))];
        const inst = palabrasClave(q.inst);
        if (comunes.length) {
          puntos = Math.min(90, 40 * comunes.length + (inst.some((w) => comunes.includes(w)) ? 10 : 0));
          motivo = inst.some((w) => comunes.includes(w))
            ? `«${p.nombre}» lleva el nombre de la institución de «${q.nombre}» (${q.inst}).`
            : `Los dos nombres dicen «${comunes.join(" ")}».`;
        } else if (p.clase === "efectivo" && efectivoP.length === 1 && efectivoQ.length === 1) {
          puntos = 50;
          motivo = "Las dos son tu efectivo y no hay otro.";
        }
      }
      if (puntos >= 40) candidatos.push({ ...par, puntos, motivo });
    }
  }
  candidatos.sort((a, b) => b.puntos - a.puntos || a.presupuesto.orden - b.presupuesto.orden);
  const usados = new Set<string>();
  const pares: ParUnion[] = [];
  for (const c of candidatos) {
    if (usados.has(c.presupuesto.id) || usados.has(c.portafolio.id)) continue;
    usados.add(c.presupuesto.id);
    usados.add(c.portafolio.id);
    pares.push(c);
  }
  return pares;
}

/** Las filas del registro que el Presupuesto puede usar y todavía no usa (para el asistente y Configuración). */
export function cuentasParaPresupuesto(items: ItemRegistro[]): CuentaDelRegistro[] {
  return items
    .filter((i) => !i.cajaId && sirveParaPresupuesto(i))
    .map((i) => ({ id: i.id, nombre: i.nombre, tipo: tipoCajaDe(i), saldo: i.cantidad, limite: i.limite, diaPago: i.diaPago, ...(i.clase === "rentafija" ? { inversion: true } : {}) }));
}
