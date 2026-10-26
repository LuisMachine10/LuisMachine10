// Formularios del registro único «Mis cuentas, activos y deudas» (puro, sin Next). Convierte lo que
// escribe Mena en la fila de personal.activos, con errores que dicen cómo arreglarlo. Montos como texto.

import { aDecimal } from "../../supabase/functions/_shared/json";
import { cicloDeFormulario } from "../caja/ciclo";
import { Big } from "./decimal";
import { esFecha, sumarMeses } from "./fechas";
import { type Campos, numeroForm, pctForm } from "./formulario";
import { CATALOGO, claseDeTipo, esDeudaFin, GRUPOS_ALTA, puedeRecibirCobros, type TipoFin, tipoInicial } from "../finanzas/catalogo";
import { type ClaseRegistro, esClaseDeuda, FRECUENCIAS_PAGO, MONEDAS } from "./tipos";

/**
 * Lo que Mena elige en «¿Qué es?»: el TIPO del catálogo (lib/finanzas/catalogo.ts). Los bienes se separan en
 * vehículo, inmueble u otro (su subtipo). Grupo «tienes» o «debes».
 */
export interface OpcionAlta {
  id: string;
  tipo: TipoFin;
  subtipo: string | null;
  nom: string;
  grupo: "tienes" | "debes";
  /** Sección del selector («Efectivo y cuentas», «Inversiones», «Bienes», «Lo que debes»). */
  seccion: string;
  ayuda: string;
}

export const TIPOS_ALTA: readonly OpcionAlta[] = GRUPOS_ALTA.flatMap((g) =>
  g.tipos.flatMap((t): OpcionAlta[] =>
    t === "bien"
      ? [
          { id: "vehiculo", tipo: "bien", subtipo: "vehiculo", nom: "Vehículo", grupo: "tienes", seccion: g.nom, ayuda: CATALOGO.bien.ayuda },
          { id: "inmueble", tipo: "bien", subtipo: "inmueble", nom: "Casa, apartamento o terreno", grupo: "tienes", seccion: g.nom, ayuda: CATALOGO.bien.ayuda },
          { id: "otro", tipo: "bien", subtipo: "otro", nom: "Otro bien", grupo: "tienes", seccion: g.nom, ayuda: CATALOGO.bien.ayuda },
        ]
      : [{ id: t, tipo: t, subtipo: CATALOGO[t].subtipo ?? null, nom: CATALOGO[t].nom, grupo: esDeudaFin(t) ? "debes" : "tienes", seccion: g.nom, ayuda: CATALOGO[t].ayuda }],
  ),
);
export type TipoAlta = string;

/** Ids de antes (formularios viejos, pruebas): a qué tipo del catálogo equivalen. */
const ALIAS_ALTA: Record<string, string> = { rentavariable: "accion_etf", deuda: "otra_deuda", rentafija: "certificado" };

/** El id de «¿Qué es?» de una fila guardada. */
export function tipoAltaDe(clase: string, subtipo: string | null, tipo?: TipoFin): TipoAlta {
  const t = tipo ?? tipoInicial({ clase, subtipo, nombre: "" }).tipo;
  if (t === "bien") return subtipo === "vehiculo" ? "vehiculo" : subtipo === "inmueble" ? "inmueble" : "otro";
  return t;
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
  // ── Núcleo v2: el tipo del catálogo y lo «elegible» ──
  tipo: TipoFin;
  tipo_confirmado: boolean;
  tiene_debito: boolean | null;
  /** Elegible (certificado, fondo cerrado, fideicomiso): ¿capitaliza? Solo se escribe si el formulario lo trae. */
  capitaliza?: boolean | null;
  paga_a: string | null;
  retencion: string | null;
  comision_admin: string | null;
  plazo_dias: number | null;
  cargos_cuota: string | null;
}

/**
 * Lee el formulario de alta o edición. `saldoSinCambio` = true cuando Mena no tocó el saldo (se compara
 * con el que se le mostró): entonces no se reescribe, para no pisar lo que el Presupuesto ya anotó.
 */
export function registroDeFormulario(c: Campos, hoy: string, cuentas: readonly { id: string; tipo: TipoFin }[] = []): ResultadoForm<FilaAlta> {
  const alta = TIPOS_ALTA.find((t) => t.id === (ALIAS_ALTA[c.tipo ?? ""] ?? c.tipo));
  if (!alta) return { ok: false, error: "Elige qué es (efectivo, una cuenta, una inversión, un bien, una tarjeta o un préstamo)." };
  const regla = CATALOGO[alta.tipo];
  // Clase del motor: la del tipo (fondos y fideicomisos: renta fija o variable, según elija Mena).
  const { clase: claseMotor } = claseDeTipo(alta.tipo, c.claseRV === "rentavariable" ? "rentavariable" : c.claseRV === "rentafija" ? "rentafija" : null);
  const tipo = { clase: claseMotor as ClaseRegistro, subtipo: alta.tipo === "bien" ? alta.subtipo : (regla.subtipo ?? null) };
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
    tipo: alta.tipo,
    tipo_confirmado: true,
    tiene_debito: alta.tipo === "alto_rendimiento" ? c.debito === "si" : null,
    paga_a: null,
    retencion: null,
    comision_admin: null,
    plazo_dias: null,
    cargos_cuota: null,
  };
  // Lo elegible: certificado, fondo cerrado y fideicomiso eligen si capitalizan o pagan a una cuenta.
  if (regla.capitaliza === "elegible" && c.capitaliza !== undefined) fila.capitaliza = c.capitaliza === "si" ? true : c.capitaliza === "no" ? false : null;
  // A qué cuenta caen los intereses, cupones o dividendos (solo efectivo o una cuenta de banco).
  if (regla.pagaACuenta !== "nunca" && c.pagaA) {
    const destino = cuentas.find((x) => x.id === c.pagaA);
    if (!destino || !puedeRecibirCobros(destino.tipo)) return { ok: false, error: "Los intereses, cupones o dividendos caen en efectivo o en una cuenta de banco: elige una de la lista." };
    if (c.id && c.pagaA === c.id) return { ok: false, error: "Elige otra cuenta para cobrar: no puede ser la misma inversión." };
    fila.paga_a = c.pagaA;
  }
  const pct01 = (v: string | undefined, que: string): ResultadoForm<string | null> => {
    const t = numeroForm(v);
    if (!t) return { ok: true, valor: null };
    const x = pctForm(t);
    if (aDecimal(x) === null || new Big(x).lt(0) || new Big(x).gt(1)) return { ok: false, error: `${que} va en %, entre 0 y 100. Por ejemplo 10.` };
    return { ok: true, valor: x };
  };
  if (regla.grupo === "inversion" || alta.tipo === "alto_rendimiento") {
    const r = pct01(c.retencion, "La retención");
    if (!r.ok) return r;
    fila.retencion = r.valor;
  }
  if (regla.comisionPuesto) {
    const r = pct01(c.comision, "La comisión de administración");
    if (!r.ok) return r;
    fila.comision_admin = r.valor;
  }
  if ((alta.tipo === "certificado" || alta.tipo === "mutuo") && c.plazoDias) {
    if (!/^\d{1,4}$/.test(c.plazoDias) || Number(c.plazoDias) < 1) return { ok: false, error: "El plazo va en días, por ejemplo 30." };
    fila.plazo_dias = Number(c.plazoDias);
  }
  if (tipo.clase === "prestamo" || tipo.clase === "deuda") {
    const k = monto(c.cargosCuota, "los cargos dentro de la cuota", "1,200", true);
    if (!k.ok) return k;
    if (k.valor && new Big(k.valor).lt(0)) return { ok: false, error: "Los cargos de la cuota no pueden ser negativos." };
    fila.cargos_cuota = k.valor && new Big(k.valor).gt(0) ? k.valor : null;
  }
  const porUnidades = alta.tipo === "accion_etf" || ((alta.tipo === "fondo_abierto" || alta.tipo === "fondo_cerrado" || alta.tipo === "fideicomiso") && !!numeroForm(c.cantidad));
  const saldoCambio = c.saldoMostrado === undefined || numeroForm(c.saldo) !== numeroForm(c.saldoMostrado);
  if (porUnidades) {
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
