"use server";

// Toda edición del Calendario de Caja pasa por aquí. Cada acción valida con lib/caja/validar.ts
// (puro, con pruebas) y escribe con la sesión de Mena: RLS en la base es la barrera real.

import { randomUUID } from "node:crypto";
import { armarDesdeAsistente, type CuentaDelRegistro, leerAsistente } from "@/lib/caja/asistente";
import { leerRegistro } from "@/lib/capital/datos-registro";
import { cuentasParaPresupuesto } from "@/lib/capital/registro";
import { leerCaja } from "@/lib/caja/datos";
import Big from "big.js";
import { cicloDeFormulario } from "@/lib/caja/ciclo";
import { aJsonSQL, parsearImportacion, type ResumenImportacion } from "@/lib/caja/importar";
import { esFecha, hoyRD } from "@/lib/caja/fechas";
import {
  validarCategoria,
  validarConfig,
  validarCuenta,
  validarMovimiento,
  validarRecurrente,
  validarSaldoReal,
} from "@/lib/caja/validar";
import { personal } from "@/lib/supabase/servidor";
import {
  anotarMovimiento,
  bien,
  cajaParaValidar,
  campos,
  descontarDelAdicional,
  type EstadoAccion,
  interesDelPago,
  mal,
  refrescar,
  revisarListas,
} from "@/lib/caja/anotar";

export type { EstadoAccion } from "@/lib/caja/anotar";

function errorBase(e: { message: string } | null, que: string): EstadoAccion | null {
  return e ? mal(`No se pudo ${que}: ${e.message}`) : null;
}

// Los ids del artefacto se conservan tal cual: cualquier texto corto sin caracteres de control.
// eslint-disable-next-line no-control-regex
const ID = /^[^\u0000-\u001f]{1,120}$/;

// ───────────────────────── Movimientos ─────────────────────────

/** Registrar (o confirmar / ajustar un planificado: llega con recurrenteId). */
export async function registrarMovimiento(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  return anotarMovimiento(form);
}

export async function editarMovimiento(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const c = campos(form);
  if (!c.id || !ID.test(c.id)) return mal("Movimiento inválido.");
  const r = validarMovimiento(c);
  if (!r.ok) return mal(r.error);
  const m = r.valor;
  const datos = await cajaParaValidar();
  if (typeof datos === "string") return mal(datos);
  const lista = await revisarListas(m, datos);
  if (lista) return mal(lista);
  const pago = await interesDelPago(m, datos);
  if ("error" in pago) return mal(pago.error);
  const db = await personal();
  const { error, count } = await db
    .from("caja_movimientos")
    .update(
      { fecha: m.fecha, tipo: m.tipo, monto: m.monto, moneda: m.moneda, tasa: m.tasa, cuenta: m.cuenta, destino: m.destino,
        categoria: m.categoria, nota: m.nota, interes: pago.interes, parte: m.parte ?? null, cargos: pago.cargos, categoria_cargos: m.categoriaCargos ?? null,
        registro_origen: m.registroOrigen ?? null, registro_destino: m.registroDestino ?? null, actualizado_en: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("id", c.id);
  const e = errorBase(error, "guardar el cambio");
  if (e) return e;
  if (!count) return mal("Ese movimiento ya no existe.");
  refrescar();
  return bien(`Guardado.${pago.frase}`);
}

export async function eliminarMovimiento(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const id = String(form.get("id") ?? "");
  if (!ID.test(id)) return mal("Movimiento inválido.");
  const db = await personal();
  const { error } = await db.from("caja_movimientos").delete().eq("id", id);
  const e = errorBase(error, "eliminar el movimiento");
  if (e) return e;
  refrescar();
  return bien("Eliminado.");
}

// ───────────────────────── Recurrentes del día ─────────────────────────

export async function omitirRecurrente(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const fecha = String(form.get("fecha") ?? "");
  const rid = String(form.get("recurrenteId") ?? "");
  if (!esFecha(fecha) || !ID.test(rid)) return mal("Datos inválidos.");
  const db = await personal();
  const { error } = await db.from("caja_omitidos").upsert({ fecha, recurrente_id: rid }, { onConflict: "fecha,recurrente_id", ignoreDuplicates: true });
  const e = errorBase(error, "omitir");
  if (e) return e;
  refrescar();
  return bien("Listo: este mes no se cuenta.");
}

export async function deshacerOmitido(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const fecha = String(form.get("fecha") ?? "");
  const rid = String(form.get("recurrenteId") ?? "");
  if (!esFecha(fecha) || !ID.test(rid)) return mal("Datos inválidos.");
  const db = await personal();
  const { error } = await db.from("caja_omitidos").delete().eq("fecha", fecha).eq("recurrente_id", rid);
  const e = errorBase(error, "deshacer");
  if (e) return e;
  refrescar();
  return bien("Vuelve a contar como programado.");
}

// ───────────────────────── Cuadrar con el banco y nota ─────────────────────────

/** Campos saldo:<cuentaId>. Vacío = quitar el cuadre de esa cuenta ese día. */
export async function cuadrarSaldos(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const fecha = String(form.get("fecha") ?? "");
  if (!esFecha(fecha)) return mal("Fecha inválida.");
  const poner: { fecha: string; cuenta_id: string; saldo: string; actualizado_en: string }[] = [];
  const quitar: string[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("saldo:") || typeof v !== "string") continue;
    const cuenta = k.slice(6);
    if (!ID.test(cuenta)) return mal("Cuenta inválida.");
    const r = validarSaldoReal(v);
    if (!r.ok) return mal(r.error);
    if (r.valor === null) quitar.push(cuenta);
    else poner.push({ fecha, cuenta_id: cuenta, saldo: r.valor, actualizado_en: new Date().toISOString() });
  }
  const db = await personal();
  if (poner.length) {
    const { error } = await db.from("caja_saldos_reales").upsert(poner, { onConflict: "fecha,cuenta_id" });
    const e = errorBase(error, "guardar los saldos");
    if (e) return e;
  }
  if (quitar.length) {
    const { error } = await db.from("caja_saldos_reales").delete().eq("fecha", fecha).in("cuenta_id", quitar);
    const e = errorBase(error, "quitar los saldos vacíos");
    if (e) return e;
  }
  refrescar();
  return bien(poner.length ? "Saldos cuadrados." : "Cuadre quitado.");
}

export async function guardarNota(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const fecha = String(form.get("fecha") ?? "");
  const nota = String(form.get("nota") ?? "").trim();
  if (!esFecha(fecha)) return mal("Fecha inválida.");
  if (nota.length > 2000) return mal("La nota pasa de 2,000 caracteres.");
  const db = await personal();
  const { error } = nota
    ? await db.from("caja_notas").upsert({ fecha, nota, actualizado_en: new Date().toISOString() }, { onConflict: "fecha" })
    : await db.from("caja_notas").delete().eq("fecha", fecha);
  const e = errorBase(error, "guardar la nota");
  if (e) return e;
  refrescar();
  return bien(nota ? "Nota guardada." : "Nota borrada.");
}

// ───────────────────────── Ajustes ─────────────────────────

export async function guardarConfig(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const r = validarConfig(campos(form));
  if (!r.ok) return mal(r.error);
  const db = await personal();
  const { error } = await db.from("caja_config").upsert(
    { id: 1, inicio: r.valor.inicio, colchon: r.valor.colchon, margen: r.valor.margen, tasa_usd: r.valor.tasaUSD, actualizado_en: new Date().toISOString() },
    { onConflict: "id" },
  );
  const e = errorBase(error, "guardar los ajustes");
  if (e) return e;
  refrescar();
  return bien("Guardado.");
}

async function enUso(columnas: { tabla: string; col: string }[], id: string): Promise<boolean> {
  const db = await personal();
  for (const { tabla, col } of columnas) {
    const { count, error } = await db.from(tabla).select("*", { count: "exact", head: true }).eq(col, id);
    if (error) throw new Error(error.message);
    if (count) return true;
  }
  return false;
}

async function guardarEn(tabla: string, id: string | undefined, fila: Record<string, unknown>, que: string): Promise<EstadoAccion> {
  const db = await personal();
  const ahora = new Date().toISOString();
  if (id) {
    if (!ID.test(id)) return mal("Id inválido.");
    const { error, count } = await db.from(tabla).update({ ...fila, actualizado_en: ahora }, { count: "exact" }).eq("id", id);
    const e = errorBase(error, `guardar ${que}`);
    if (e) return e;
    if (!count) return mal(`Ya no existe ${que}.`);
  } else {
    const { error } = await db.from(tabla).insert(fila);
    const e = errorBase(error, `crear ${que}`);
    if (e) return e;
  }
  refrescar();
  return bien("Guardado.");
}

async function eliminarDe(tabla: string, id: string, usos: { tabla: string; col: string }[], que: string): Promise<EstadoAccion> {
  if (!ID.test(id)) return mal("Id inválido.");
  try {
    if (await enUso(usos, id)) return mal(`No se puede eliminar ${que}: hay movimientos o pagos fijos que la usan. Cámbialos primero.`);
  } catch (e) {
    return mal(`No se pudo revisar si está en uso: ${(e as Error).message}`);
  }
  const db = await personal();
  const { error } = await db.from(tabla).delete().eq("id", id);
  const e = errorBase(error, `eliminar ${que}`);
  if (e) return e;
  refrescar();
  return bien("Eliminado.");
}

export async function guardarCuenta(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const c = campos(form);
  const r = validarCuenta(c);
  if (!r.ok) return mal(r.error);
  const v = r.valor;
  // Tarjeta: el ciclo y el límite en US$ viven en el registro único (Portafolio → Mis cuentas).
  let tarjeta: Record<string, unknown> | null = null;
  if (c.conCiclo === "si" && v.tipo === "tarjeta" && c.id) {
    const ci = cicloDeFormulario(c);
    if (!ci.ok) return mal(ci.error);
    const lu = validarSaldoReal(c.limiteUsd);
    if (!lu.ok) return mal(lu.error.replace("Saldo", "Límite en US$"));
    if (lu.valor && new Big(lu.valor).lt(0)) return mal("El límite en US$ no puede ser negativo.");
    tarjeta = { ...ci.valor, limite_usd: lu.valor };
  }
  const res = await guardarEn("caja_cuentas", c.id || undefined, { nombre: v.nombre, tipo: v.tipo, saldo_inicial: v.saldoInicial, limite: v.limite, orden: v.orden }, "la cuenta");
  if (!res.ok || !tarjeta) return res;
  const db = await personal();
  const enl = await db.from("caja_cuentas").select("registro_id").eq("id", c.id!).maybeSingle();
  const reg = (enl.data as { registro_id: string | null } | null)?.registro_id;
  if (enl.error || !reg) return mal("Se guardó la cuenta, pero no se encontró en tu Portafolio para guardar el ciclo. Ábrela en Portafolio → Mis cuentas.");
  const { error } = await db.from("activos").update({ ...tarjeta, actualizado_en: new Date().toISOString() }).eq("id", reg);
  if (error) {
    return mal(
      /doble_moneda/.test(error.message)
        ? "Se guardó la cuenta, pero no el límite en US$: esta tarjeta está anotada en US$ en tu Portafolio. La parte en dólares es para tarjetas en RD$."
        : `Se guardó la cuenta, pero no el ciclo de la tarjeta: ${error.message}`,
    );
  }
  refrescar();
  return bien(tarjeta.dia_corte ? "Guardado. El calendario ya marca el corte, el día en que quieres pagar y la fecha límite." : "Guardado.");
}

export async function guardarCategoria(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const c = campos(form);
  const r = validarCategoria(c);
  if (!r.ok) return mal(r.error);
  return guardarEn("caja_categorias", c.id || undefined, { nombre: r.valor.nombre, tipo: r.valor.tipo, adicional: r.valor.adicional }, "la categoría");
}

/**
 * «Asígnale una categoría»: pone la categoría a un fijo o a un movimiento que no la tenía, sin tocar
 * nada más. Campos: cual (recurrente | movimiento), id, categoria.
 */
export async function asignarCategoria(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const cual = String(form.get("cual") ?? "");
  const id = String(form.get("id") ?? "");
  const categoria = String(form.get("categoria") ?? "").trim();
  if ((cual !== "recurrente" && cual !== "movimiento") || !ID.test(id)) return mal("Datos inválidos. Recarga la página.");
  if (!categoria || !ID.test(categoria)) return mal("Elige una categoría de la lista.");
  const db = await personal();
  const cat = await db.from("caja_categorias").select("id, nombre, adicional::text").eq("id", categoria).maybeSingle();
  if (cat.error) return mal(`No se pudo revisar la categoría: ${cat.error.message}`);
  if (!cat.data) return mal("Esa categoría ya no existe. Recarga la página y elige otra.");
  const tabla = cual === "recurrente" ? "caja_recurrentes" : "caja_movimientos";
  const { error, data } = await db.from(tabla).update({ categoria, actualizado_en: new Date().toISOString() }).eq("id", id).select("id");
  const e = errorBase(error, "asignar la categoría");
  if (e) return e;
  if (!data?.length) return mal("Ya no existe. Recarga la página.");
  const nota = cual === "recurrente" ? await descontarDelAdicional(id, cat.data as unknown as { id: string; nombre: string; adicional: string | null }) : "";
  refrescar();
  return bien(`Listo: ya cuenta en su categoría.${nota}`);
}

export async function eliminarCategoria(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  return eliminarDe(
    "caja_categorias",
    String(form.get("id") ?? ""),
    [
      { tabla: "caja_movimientos", col: "categoria" },
      { tabla: "caja_recurrentes", col: "categoria" },
    ],
    "la categoría",
  );
}

export async function guardarRecurrente(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const c = campos(form);
  const r = validarRecurrente(c);
  if (!r.ok) return mal(r.error);
  const v = r.valor;
  const datos = await cajaParaValidar();
  if (typeof datos === "string") return mal(datos);
  const lista = await revisarListas({ fecha: hoyRD(), tipo: v.tipo, monto: v.monto, moneda: v.moneda, tasa: null, cuenta: v.cuenta, destino: v.destino, registroDestino: v.registroDestino ?? null, categoria: v.categoria, nota: null, recurrenteId: null }, datos);
  if (lista) return mal(lista);
  return guardarEn(
    "caja_recurrentes",
    c.id || undefined,
    {
      nombre: v.nombre, tipo: v.tipo, monto: v.monto, moneda: v.moneda, pago_total: v.pagoTotal, cuenta: v.cuenta, destino: v.destino,
      categoria: v.categoria, frecuencia: v.frecuencia, dias: v.dias, cada_n: v.cadaN, fecha: v.fecha, desde: v.desde, hasta: v.hasta, activo: v.activo,
      parte: v.parte ?? null, registro_destino: v.registroDestino ?? null,
    },
    "el pago fijo",
  );
}

/**
 * Plan del mes: una línea de «Ahorro e inversión» = un fijo «Mover entre mis cuentas» hacia el instrumento EXACTO, con su
 * monto en su moneda, el día y la cuenta de donde sale (manual, sección C). Lleva la categoría de ahorro e inversión
 * (si no hay ninguna, se crea «Ahorro e inversión»). Valida las listas del manual igual que un movimiento.
 */
export async function guardarLineaAhorro(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const c = campos(form);
  const datos = await cajaParaValidar();
  if (typeof datos === "string") return mal(datos);
  let categoria = datos.categorias.find((k) => k.id === c.categoria && k.tipo === "ahorro_inversion")?.id ?? datos.categorias.find((k) => k.tipo === "ahorro_inversion")?.id ?? null;
  const db = await personal();
  if (!categoria) {
    const nueva = await db.from("caja_categorias").insert({ nombre: "Ahorro e inversión", tipo: "ahorro_inversion" }).select("id").single();
    const e = errorBase(nueva.error, "crear la categoría de ahorro");
    if (e) return e;
    categoria = (nueva.data as { id: string }).id;
  }
  const destinoNombre = String(c.destinoNombre ?? "").trim();
  const r = validarRecurrente({ ...c, tipo: "transferencia", categoria, frecuencia: c.frecuencia || "mensual", nombre: (c.nombre || `Ahorro: ${destinoNombre || "inversión"}`).slice(0, 120) });
  if (!r.ok) return mal(r.error);
  const v = r.valor;
  const lista = await revisarListas({ fecha: hoyRD(), tipo: "transferencia", monto: v.monto, moneda: v.moneda, tasa: null, cuenta: v.cuenta, destino: v.destino, registroDestino: v.registroDestino ?? null, categoria, nota: null, recurrenteId: null }, datos);
  if (lista) return mal(lista);
  return guardarEn(
    "caja_recurrentes",
    c.id || undefined,
    {
      nombre: v.nombre, tipo: "transferencia", monto: v.monto, moneda: v.moneda, pago_total: false, cuenta: v.cuenta, destino: v.destino, registro_destino: v.registroDestino ?? null,
      categoria, frecuencia: v.frecuencia, dias: v.dias, cada_n: v.cadaN, fecha: v.fecha, desde: v.desde, hasta: v.hasta, activo: v.activo,
    },
    "la línea de ahorro",
  );
}

/**
 * «Agregar como cobro fijo»: el interés, cupón o dividendo que una inversión paga a una cuenta entra al plan como
 * «Otros ingresos» (categoría «Intereses y dividendos», de tipo otro ingreso; se crea si no hay ninguna).
 */
export async function agregarCobroFijo(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const c = campos(form);
  const datos = await cajaParaValidar();
  if (typeof datos === "string") return mal(datos);
  const db = await personal();
  let categoria = datos.categorias.find((k) => k.tipo === "otro_ingreso" && k.nombre === "Intereses y dividendos")?.id ?? datos.categorias.find((k) => k.tipo === "otro_ingreso")?.id ?? null;
  if (!categoria) {
    const nueva = await db.from("caja_categorias").insert({ nombre: "Intereses y dividendos", tipo: "otro_ingreso" }).select("id").single();
    const e = errorBase(nueva.error, "crear la categoría de otros ingresos");
    if (e) return e;
    categoria = (nueva.data as { id: string }).id;
  }
  const r = validarRecurrente({ ...c, tipo: "ingreso", categoria, frecuencia: "mensual" });
  if (!r.ok) return mal(r.error);
  const v = r.valor;
  const lista = await revisarListas({ fecha: hoyRD(), tipo: "ingreso", monto: v.monto, moneda: v.moneda, tasa: null, cuenta: v.cuenta, destino: null, categoria, nota: null, recurrenteId: null }, datos);
  if (lista) return mal(lista);
  return guardarEn(
    "caja_recurrentes",
    undefined,
    { nombre: v.nombre, tipo: "ingreso", monto: v.monto, moneda: v.moneda, pago_total: false, cuenta: v.cuenta, destino: null, categoria, frecuencia: "mensual", dias: v.dias, activo: true },
    "el cobro fijo",
  );
}

/** Los movimientos que ya lo confirmaron se quedan (son historia); sus omitidos se borran. */
export async function eliminarRecurrente(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const id = String(form.get("id") ?? "");
  if (!ID.test(id)) return mal("Id inválido.");
  const db = await personal();
  const { error } = await db.from("caja_recurrentes").delete().eq("id", id);
  const e = errorBase(error, "eliminar el pago fijo");
  if (e) return e;
  await db.from("caja_omitidos").delete().eq("recurrente_id", id);
  refrescar();
  return bien("Eliminado. Lo que ya marcaste como hecho se queda.");
}

// ───────────────────────── Asistente de bienvenida ─────────────────────────

/**
 * Guarda todo el asistente (cuentas, ingresos y gastos fijos, colchón) en una sola transacción con la
 * misma función de la base que la importación (caja_importar: verifica que sea la dueña o el dueño y,
 * si algo falla, no cambia nada). Lo que ya existiera sin configuración se conserva.
 */
export async function crearCajaDesdeAsistente(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const a = leerAsistente(String(form.get("datos") ?? ""));
  if (!a.ok) return mal(a.error);
  let actual: Awaited<ReturnType<typeof leerCaja>>;
  try {
    actual = await leerCaja();
  } catch (e) {
    return mal(`No se pudo leer tu caja para guardar: ${(e as Error).message}. Revisa tu conexión e inténtalo de nuevo.`);
  }
  if (actual.datos.config) return mal("Tu presupuesto ya estaba creado. Para cambiar algo, ve a Configuración.");
  let registro: CuentaDelRegistro[] = [];
  if (a.valor.cuentas.some((c) => c.registroId)) {
    try {
      registro = cuentasParaPresupuesto(await leerRegistro(actual.datos, actual.enlaces, hoyRD()));
    } catch (e) {
      return mal(`No se pudo leer tu Portafolio para usar sus cuentas: ${(e as Error).message}. Inténtalo de nuevo.`);
    }
  }
  const r = armarDesdeAsistente(a.valor, hoyRD(), actual.datos, randomUUID, registro);
  if (!r.ok) return mal(r.error);
  const { error } = await (await personal()).rpc("caja_importar", { p_datos: aJsonSQL(r.valor) });
  if (error) return mal(`No se guardó nada (la base respondió: ${error.message}). Inténtalo de nuevo en un momento.`);
  refrescar();
  return bien("¡Listo! Tu presupuesto ya está funcionando.");
}

// ───────────────────────── Importar ─────────────────────────

export interface EstadoImportacion {
  fase: "inicio" | "revisado" | "importado" | "error";
  resumen: ResumenImportacion | null;
  errores: string[];
  advertencias: string[];
  mensaje: string | null;
}

/** Paso 1: validar y mostrar el resumen sin escribir nada. Paso 2 (confirmar=si): reemplazar todo. */
export async function importarCaja(_p: EstadoImportacion, form: FormData): Promise<EstadoImportacion> {
  const archivo = form.get("archivo");
  const texto = typeof archivo === "string" ? archivo : archivo instanceof File && archivo.size ? await archivo.text() : String(form.get("texto") ?? "");
  if (!texto.trim()) return { fase: "error", resumen: null, errores: ["Elige el archivo JSON exportado del artefacto."], advertencias: [], mensaje: null };
  const r = parsearImportacion(texto);
  if (r.errores.length || !r.datos) return { fase: "error", resumen: r.resumen, errores: r.errores, advertencias: r.advertencias, mensaje: null };
  if (form.get("confirmar") !== "si") {
    return { fase: "revisado", resumen: r.resumen, errores: [], advertencias: r.advertencias, mensaje: null };
  }
  const { error } = await (await personal()).rpc("caja_importar", { p_datos: aJsonSQL(r.datos) });
  if (error) {
    return { fase: "error", resumen: r.resumen, errores: [`La base rechazó la importación y no cambió nada: ${error.message}`], advertencias: r.advertencias, mensaje: null };
  }
  refrescar();
  return { fase: "importado", resumen: r.resumen, errores: [], advertencias: r.advertencias, mensaje: "Importado. Todo lo anterior del Calendario de Caja se reemplazó." };
}
