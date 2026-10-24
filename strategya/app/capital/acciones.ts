"use server";

// Escritura de Mena Capital. Toda escritura pasa por aquí: valida con lib/capital/validar.ts y escribe con
// la sesión de Mena (RLS: mercado.es_autorizado()). Ningún número pasa por float.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fotoParaGuardar, fotoViva } from "@/lib/capital/cierres";
import {
  activoDeFormulario,
  camposDe,
  cierreDeFormulario,
  desagregar,
  instrumentoDeFormulario,
  mezclarParametros,
  modoCierre,
  numeroForm,
  nuevoId,
  rutaSegura,
  SECCIONES_PARAMETROS,
  type SeccionParametros,
} from "@/lib/capital/formulario";
import { activoAFila, type AnalisisArchivo, analizarArchivo, cargaParaBase, TAMANO_MAXIMO, transaccionAFila } from "@/lib/capital/importar";
import { esMes, hoyRD } from "@/lib/capital/fechas";
import Big from "big.js";
import { fechaDeSaldo, planDeFormulario, registroDeFormulario } from "@/lib/capital/formulario-registro";
import { guardarPreferenciaCapital, leerPreferenciaCapital, leerPrefRegistro } from "@/lib/capital/preferencias";
import { SECCIONES_IPS } from "@/lib/capital/tipos";
import { Registro, validarActivo, validarCierre, validarIps, validarParametros, validarTransaccion } from "@/lib/capital/validar";
import { datosCapital, parametrosGuardados } from "@/lib/datos-capital";
import { personal } from "@/lib/supabase/servidor";

function volver(ruta: string, mes: string | undefined, resultado: { ok?: string; error?: string }): never {
  const q = new URLSearchParams();
  if (mes && esMes(mes)) q.set("mes", mes);
  if (resultado.ok) q.set("ok", resultado.ok);
  if (resultado.error) q.set("error", resultado.error.slice(0, 400));
  revalidatePath("/capital", "layout");
  redirect(`${ruta}${q.size ? `?${q}` : ""}`);
}

function errores(r: Registro): string {
  return `Revisa: ${r.errores.slice(0, 4).join(" · ")}`;
}

function sinError(e: { message: string } | null, que: string) {
  if (e) throw new Error(`No se pudo guardar ${que}: ${e.message}`);
}

async function intentar(fn: () => Promise<string>): Promise<{ ok?: string; error?: string }> {
  try {
    return { ok: await fn() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─────────────────────────────── Parámetros ───────────────────────────────

export async function guardarParametros(form: FormData): Promise<void> {
  const c = camposDe(form);
  const ruta = rutaSegura(c.volver);
  const seccion = c.seccion as SeccionParametros;
  const resultado = await intentar(async () => {
    if (!SECCIONES_PARAMETROS.includes(seccion)) throw new Error("Sección de parámetros desconocida");
    const actual = await parametrosGuardados();
    const r = new Registro();
    const p = validarParametros(mezclarParametros(actual, seccion, c), r, "parámetros", false);
    if (!r.ok) throw new Error(errores(r));
    const db = await personal();
    const { error } = await db.from("parametros").upsert({ id: 1, datos: p, actualizado_en: new Date().toISOString() }, { onConflict: "id" });
    sinError(error, "los parámetros");
    return "Parámetros guardados";
  });
  volver(ruta, c.mes, resultado);
}

// ─────────────────────────────── Activos ───────────────────────────────

export async function guardarActivo(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    const r = new Registro();
    const a = validarActivo(activoDeFormulario(c), "instrumento", r);
    if (!r.ok || !a) throw new Error(errores(r));
    const db = await personal();
    if (c.id) {
      const { orden: _orden, ...fila } = activoAFila(a);
      // Si no cambió el saldo que se le mostró, no se reescribe (el Presupuesto puede estar moviéndolo).
      const cambio = c.cantidadMostrada === undefined || numeroForm(c.cantidad) !== numeroForm(c.cantidadMostrada);
      const { cantidad, ...resto } = fila;
      const datos = cambio ? { ...resto, cantidad, saldo_fecha: fechaDeSaldo(hoyRD(new Date())) } : resto;
      const { error } = await db.from("activos").update({ ...datos, actualizado_en: new Date().toISOString() }).eq("id", c.id);
      sinError(error, "el instrumento");
    } else {
      const { data, error: e1 } = await db.from("activos").select("orden").order("orden", { ascending: false }).limit(1);
      sinError(e1, "el instrumento");
      const orden = ((data?.[0]?.orden as number | undefined) ?? -1) + 1;
      const { error } = await db.from("activos").insert(activoAFila(a, orden));
      sinError(error, "el instrumento");
    }
    return `${a.nombre} guardado`;
  });
  volver("/capital/cartera", c.mes, resultado);
}

/** Formulario simple de Cartera: un instrumento nuevo y, si trae fecha, su compra en el libro. */
export async function agregarInstrumento(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    const { activo: crudo, compra } = instrumentoDeFormulario(c);
    const r = new Registro();
    const a = validarActivo(crudo, "instrumento", r);
    if (!r.ok || !a) throw new Error(errores(r));
    if (!a.cantidad || a.cantidad === "0") throw new Error("Escribe el monto (o la cantidad y el precio)");
    const tx = compra
      ? validarTransaccion(
          { id: nuevoId("tx"), activoId: a.id, simbolo: a.simbolo ?? "", tipo: "compra", fecha: compra.fecha, cantidad: a.cantidad, precio: a.precio, comision: "0", moneda: a.moneda },
          "compra",
          r,
        )
      : null;
    if (!r.ok) throw new Error(errores(r));
    const db = await personal();
    const { data, error: e1 } = await db.from("activos").select("orden").order("orden", { ascending: false }).limit(1);
    sinError(e1, "el instrumento");
    const orden = ((data?.[0]?.orden as number | undefined) ?? -1) + 1;
    const { error } = await db.from("activos").insert(activoAFila(a, orden));
    sinError(error, "el instrumento");
    if (tx) {
      const { error: e2 } = await db.from("transacciones").insert(transaccionAFila(tx));
      sinError(e2, "la compra en el libro (el instrumento sí quedó guardado)");
    }
    return tx ? `${a.nombre} agregado y su compra anotada en el libro` : `${a.nombre} agregado`;
  });
  volver("/capital/cartera", c.mes, resultado);
}

export async function eliminarActivo(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    if (!c.id) throw new Error("Falta el instrumento");
    const db = await personal();
    const { error } = await db.from("activos").delete().eq("id", c.id);
    sinError(error, "el instrumento");
    return "Instrumento eliminado (sus transacciones se conservan)";
  });
  volver("/capital/cartera", c.mes, resultado);
}

// ─────────────────────────────── Transacciones ───────────────────────────────

export async function registrarTransaccion(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    const db = await personal();
    const { data: activo, error: e1 } = await db.from("activos").select("id, simbolo, nombre, moneda").eq("id", c.activoId ?? "").maybeSingle();
    sinError(e1, "la transacción");
    if (!activo) throw new Error("Ese instrumento no existe");
    const cantidad = numeroForm(c.cantidad);
    const precio = numeroForm(c.precio);
    if (!cantidad && !precio) throw new Error("Falta cantidad o precio");
    const r = new Registro();
    const t = validarTransaccion(
      { id: nuevoId("tx"), activoId: activo.id, simbolo: activo.simbolo ?? "", tipo: c.tipo, fecha: c.fecha, cantidad, precio, comision: numeroForm(c.comision), moneda: activo.moneda },
      "transacción",
      r,
    );
    if (!r.ok || !t) throw new Error(errores(r));
    const { error } = await db.from("transacciones").insert(transaccionAFila(t));
    sinError(error, "la transacción");
    return "Transacción registrada";
  });
  volver("/capital/cartera", c.mes, resultado);
}

export async function eliminarTransaccion(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    const db = await personal();
    const { error } = await db.from("transacciones").delete().eq("id", c.id ?? "");
    sinError(error, "la transacción");
    return "Transacción eliminada";
  });
  volver("/capital/cartera", c.mes, resultado);
}

// ─────────────────────────────── Cierre del mes ───────────────────────────────

export async function guardarCierre(form: FormData): Promise<void> {
  const c = camposDe(form);
  const mes = c.mes;
  const modo = modoCierre(c.modo);
  const resultado = await intentar(async () => {
    if (!esMes(mes)) throw new Error("Mes inválido");
    const datos = await datosCapital();
    const crudo = cierreDeFormulario(datos.ctx.p, datos.ctx.cierres[mes] ?? null, c, modo);
    const r = new Registro();
    const cierre = validarCierre(crudo, `cierre ${mes}`, r);
    if (!r.ok || !cierre) throw new Error(errores(r));
    if (modo === "cerrar") {
      // Congela la foto de hoy (cartera actual − pasivos de este cierre) con el tipo de cambio vigente.
      const ctx = { ...datos.ctx, cierres: { ...datos.ctx.cierres, [mes]: cierre } };
      cierre.snap = fotoParaGuardar(fotoViva(ctx, mes));
      cierre.cerrado = true;
    }
    const db = await personal();
    const { error } = await db.from("cierres").upsert({ mes, datos: cierre, actualizado_en: new Date().toISOString() }, { onConflict: "mes" });
    sinError(error, "el cierre");
    return modo === "cerrar" ? "Mes cerrado: patrimonio congelado" : "Cierre guardado";
  });
  volver("/capital/cierre", mes, resultado);
}

export async function desagregarCierre(form: FormData): Promise<void> {
  const c = camposDe(form);
  const mes = c.mes;
  const resultado = await intentar(async () => {
    if (!esMes(mes)) throw new Error("Mes inválido");
    const datos = await datosCapital();
    const guardado = datos.ctx.cierres[mes];
    if (!guardado?.agregado) throw new Error("Ese mes no es un agregado histórico");
    const db = await personal();
    const { error } = await db.from("cierres").upsert({ mes, datos: desagregar(datos.ctx.p, guardado), actualizado_en: new Date().toISOString() }, { onConflict: "mes" });
    sinError(error, "el cierre");
    return "Convertido a desglose";
  });
  volver("/capital/cierre", mes, resultado);
}

// ─────────────────────────────── IPS ───────────────────────────────

export async function guardarIps(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    const crudo: Record<string, unknown> = Object.fromEntries(SECCIONES_IPS.map(([k]) => [k, c[k] ?? ""]));
    const revisada = c.modo === "revisada";
    crudo.editadoPor = revisada || c.editadoPor === "mena" ? "mena" : "borrador";
    crudo.revisadoEl = revisada ? datosHoy() : c.revisadoEl || null;
    const r = new Registro();
    const ips = validarIps(crudo, r);
    if (!r.ok) throw new Error(errores(r));
    const db = await personal();
    const { error } = await db.from("ips").upsert({ id: 1, datos: ips, actualizado_en: new Date().toISOString() }, { onConflict: "id" });
    sinError(error, "la política");
    return revisada ? "Política marcada como revisada" : "Política guardada";
  });
  volver("/capital/ips", c.mes, resultado);
}

function datosHoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
}

// ─────────────────────────────── Importación ───────────────────────────────

export interface EstadoImportacion {
  paso: "inicio" | "revision" | "hecho";
  analisis: AnalisisArchivo | null;
  /** Contenido del archivo, para confirmar sin volver a subirlo (se valida otra vez al confirmar). */
  contenido: string | null;
  nombre: string | null;
  error: string | null;
  resultado: Record<string, number> | null;
}

export async function previsualizarImportacion(_previo: EstadoImportacion, form: FormData): Promise<EstadoImportacion> {
  const archivo = form.get("archivo");
  const vacio: EstadoImportacion = { paso: "inicio", analisis: null, contenido: null, nombre: null, error: null, resultado: null };
  if (!(archivo instanceof File) || archivo.size === 0) return { ...vacio, error: "Elige un archivo .json." };
  if (archivo.size > TAMANO_MAXIMO) return { ...vacio, error: `El archivo pesa más de ${TAMANO_MAXIMO / 1_000_000} MB.` };
  const contenido = await archivo.text();
  const analisis = analizarArchivo(contenido);
  return { paso: "revision", analisis, contenido: analisis.ok ? contenido : null, nombre: archivo.name, error: null, resultado: null };
}

export async function confirmarImportacion(_previo: EstadoImportacion, form: FormData): Promise<EstadoImportacion> {
  const contenido = String(form.get("contenido") ?? "");
  const analisis = analizarArchivo(contenido);
  const base: EstadoImportacion = { paso: "revision", analisis, contenido, nombre: String(form.get("nombre") ?? ""), error: null, resultado: null };
  if (!analisis.ok) return { ...base, contenido: null, error: "El archivo no pasó la validación: no se importó nada." };
  try {
    const db = await personal();
    const { data, error } = await db.rpc("importar_capital", { p_datos: cargaParaBase(analisis.datos) });
    if (error) throw new Error(error.message);
    revalidatePath("/capital", "layout");
    return { ...base, paso: "hecho", contenido: null, resultado: data as Record<string, number> };
  } catch (e) {
    return { ...base, error: `No se importó nada: ${(e as Error).message}` };
  }
}

/** Un solo punto de entrada para el formulario de dos pasos (useActionState). */
export async function importarCapital(previo: EstadoImportacion, form: FormData): Promise<EstadoImportacion> {
  return form.get("accion") === "confirmar" ? confirmarImportacion(previo, form) : previsualizarImportacion(previo, form);
}

// ─────────────────────────────── Registro único: Mis cuentas, activos y deudas ───────────────────────────────

const ID_REGISTRO = /^[A-Za-z0-9_.:-]{1,80}$/;

export async function guardarRegistro(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    const r = registroDeFormulario(c, hoyRD(new Date()));
    if (!r.ok) throw new Error(r.error);
    const db = await personal();
    const fila = { ...r.valor, actualizado_en: new Date().toISOString() };
    if (c.id) {
      if (!ID_REGISTRO.test(c.id)) throw new Error("Esa fila no existe. Recarga la página.");
      const { error, count } = await db.from("activos").update(fila, { count: "exact" }).eq("id", c.id);
      sinError(error, `«${r.valor.nombre}»`);
      if (!count) throw new Error("Esa fila ya no existe. Recarga la página.");
    } else {
      if (fila.cantidad === undefined) throw new Error("Escribe el saldo.");
      const { data, error: e1 } = await db.from("activos").select("orden").order("orden", { ascending: false }).limit(1);
      sinError(e1, `«${r.valor.nombre}»`);
      const orden = ((data?.[0]?.orden as number | undefined) ?? -1) + 1;
      const { error } = await db.from("activos").insert({ id: nuevoId("r"), ...fila, orden });
      sinError(error, `«${r.valor.nombre}»`);
    }
    revalidatePath("/caja", "layout");
    return `${r.valor.nombre} guardado`;
  });
  volver("/capital/cuentas", c.mes, resultado);
}

export async function eliminarRegistro(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    if (!c.id || !ID_REGISTRO.test(c.id)) throw new Error("Falta la fila");
    const db = await personal();
    const enUso = await db.from("caja_cuentas").select("id", { count: "exact", head: true }).eq("registro_id", c.id);
    if (enUso.count) throw new Error("La usa el Presupuesto. Primero quítala en Presupuesto → Configuración → Tus cuentas; luego bórrala aquí.");
    const { error } = await db.from("activos").delete().eq("id", c.id);
    sinError(error, "la fila");
    return "Borrada (sus transacciones se conservan)";
  });
  volver("/capital/cuentas", c.mes, resultado);
}

/** «Sí, es la misma»: une el par (la del Portafolio queda; la otra se archiva, no se borra). */
export async function unirCuentas(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    if (!c.queda || !c.seVa || !ID_REGISTRO.test(c.queda) || !ID_REGISTRO.test(c.seVa)) throw new Error("Faltan las dos cuentas. Recarga la página.");
    let saldo: string | null = null;
    if (c.saldoModo === "portafolio") saldo = numeroForm(c.saldoPortafolio) || null;
    if (c.saldoModo === "otro") {
      saldo = numeroForm(c.saldoOtro);
      if (!saldo || !/^-?\d+(\.\d+)?$/.test(saldo)) throw new Error("Escribe el saldo de hoy, por ejemplo 25,000.");
    }
    const db = await personal();
    const { error } = await db.rpc("unir_registro", { p_queda: c.queda, p_se_va: c.seVa, p_saldo: saldo, p_fecha: saldo ? fechaDeSaldo(hoyRD(new Date())) : null });
    sinError(error, "la unión");
    revalidatePath("/caja", "layout");
    return "Listo: ahora es una sola cuenta";
  });
  volver("/capital/cuentas", c.mes, resultado);
}

/** «No, son distintas»: no se vuelve a sugerir ese par. «Ya revisé»: la pantalla no se muestra sola. */
export async function decidirUnion(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    const pref = leerPrefRegistro((await leerPreferenciaCapital("registro")).valor);
    if (c.par) pref.separadas = [...new Set([...pref.separadas, c.par.slice(0, 200)])];
    if (c.revisado === "si") pref.revisado = true;
    if (c.revisado === "no") pref.revisado = false;
    const e = await guardarPreferenciaCapital("registro", pref);
    if (e) throw new Error(`No se pudo guardar: ${e}`);
    return c.par ? "Anotado: son cuentas distintas" : "Listo";
  });
  volver(c.volver === "/capital" ? "/capital" : "/capital/cuentas", c.mes, resultado);
}

// ─────────────────────────────── Plan de aportes y proyecciones ───────────────────────────────

/** Reglas de un instrumento para las proyecciones (capitaliza, pago de intereses, reinversión, % del aporte). */
export async function guardarPlan(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    if (!c.id || !ID_REGISTRO.test(c.id)) throw new Error("Falta el instrumento. Recarga la página.");
    const r = planDeFormulario(c);
    if (!r.ok) throw new Error(r.error);
    const db = await personal();
    const { error } = await db.from("activos").update({ ...r.valor, actualizado_en: new Date().toISOString() }).eq("id", c.id);
    sinError(error, "el plan");
    return "Plan guardado";
  });
  volver("/capital/futuro", c.mes, resultado);
}

/**
 * «Sí, lo hice»: el aporte del mes se registra UNA vez. Queda como compra en el libro del Portafolio
 * (con su mes del plan) y, si salió de una cuenta del Presupuesto, como movimiento allá (ahorro
 * realizado). El saldo del instrumento sube por el movimiento (si el Presupuesto lo usa) o directamente.
 */
export async function confirmarAporte(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    if (!c.activoId || !ID_REGISTRO.test(c.activoId) || !esMes(c.aporteMes)) throw new Error("Faltan datos del aporte. Recarga la página.");
    const fecha = c.fecha || hoyRD(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("La fecha no es válida.");
    const datos = await datosCapital();
    const a = datos.ctx.activos.find((x) => x.id === c.activoId);
    if (!a) throw new Error("Ese instrumento ya no está en tu Portafolio.");
    if (datos.aportesConfirmados.some((x) => x.activoId === a.id && x.mes === c.aporteMes)) throw new Error(`El aporte de ${c.aporteMes} a «${a.nombre}» ya estaba confirmado.`);
    const unidades = a.clase === "rentavariable";
    const cantidad = numeroForm(unidades ? c.cantidad : c.monto);
    const precio = unidades ? numeroForm(c.precio) : "1";
    if (!/^\d+(\.\d+)?$/.test(cantidad) || !new Big(cantidad).gt(0)) throw new Error(unidades ? "Escribe cuántas unidades compraste, por ejemplo 2." : "Escribe el monto que aportaste, por ejemplo 5,000.");
    if (!/^\d+(\.\d+)?$/.test(precio)) throw new Error("Escribe el precio de cada unidad, por ejemplo 101.25.");
    const montoMoneda = new Big(cantidad).times(precio);
    const db = await personal();

    // 1. En el Presupuesto (si salió de una de sus cuentas): ahorro realizado, sin anotarlo dos veces.
    let movimientoId: string | null = null;
    if (c.cuenta) {
      const caja = datos.caja.datos;
      const origen = caja?.cuentas.find((x) => x.id === c.cuenta);
      if (!caja || !origen) throw new Error("Esa cuenta ya no está en el Presupuesto. Recarga la página.");
      if (a.moneda !== "DOP") throw new Error("El Presupuesto lleva sus cuentas en RD$: para un aporte en otra moneda deja «¿De qué cuenta salió?» en «De ninguna».");
      let categoria = caja.categorias.find((k) => k.tipo === "ahorro_inversion")?.id ?? null;
      if (!categoria) {
        const nueva = await db.from("caja_categorias").insert({ nombre: "Ahorro e inversión", tipo: "ahorro_inversion" }).select("id").single();
        sinError(nueva.error, "la categoría de ahorro");
        categoria = (nueva.data as { id: string }).id;
      }
      const destino = a.cajaId ?? null;
      const mov = await db
        .from("caja_movimientos")
        .insert({ fecha, tipo: destino ? "transferencia" : "gasto", monto: montoMoneda.toFixed(), moneda: "DOP", cuenta: origen.id, destino, categoria, nota: `Aporte a ${a.nombre}`.slice(0, 500) })
        .select("id")
        .single();
      sinError(mov.error, "el movimiento en el Presupuesto");
      movimientoId = (mov.data as { id: string }).id;
    }

    // 2. El saldo del instrumento: si el Presupuesto lo usa y el aporte salió de una cuenta, ya lo movió el movimiento.
    if (!(a.cajaId && movimientoId)) {
      const nueva = new Big(a.cantidad).plus(cantidad).toFixed();
      const cambio: Record<string, unknown> = { cantidad: nueva, actualizado_en: new Date().toISOString() };
      if (a.cajaId) cambio.saldo_fecha = fechaDeSaldo(hoyRD(new Date()));
      const { error } = await db.from("activos").update(cambio).eq("id", a.id);
      sinError(error, "el saldo del instrumento");
    }

    // 3. En el libro del Portafolio, con su mes del plan.
    const { error } = await db.from("transacciones").insert({
      id: nuevoId("ap"), activo_id: a.id, simbolo: a.simbolo ?? "", tipo: "compra", fecha, cantidad, precio, comision: "0", moneda: a.moneda,
      aporte_mes: c.aporteMes, movimiento_id: movimientoId,
    });
    sinError(error, "el aporte en el libro");
    revalidatePath("/caja", "layout");
    return movimientoId ? `Aporte a ${a.nombre} confirmado y anotado en tu Presupuesto como ahorro` : `Aporte a ${a.nombre} confirmado`;
  });
  volver(c.volver === "/capital" ? "/capital" : "/capital/futuro", c.mes, resultado);
}
