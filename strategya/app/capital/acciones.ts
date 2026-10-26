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
  pctForm,
  rutaSegura,
  SECCIONES_PARAMETROS,
  type SeccionParametros,
} from "@/lib/capital/formulario";
import { activoAFila, type AnalisisArchivo, analizarArchivo, cargaParaBase, TAMANO_MAXIMO, transaccionAFila } from "@/lib/capital/importar";
import { esMes, hoyRD } from "@/lib/capital/fechas";
import Big from "big.js";
import { fechaDeSaldo, planDeFormulario, registroDeFormulario } from "@/lib/capital/formulario-registro";
import { guardarPreferenciaCapital, leerPreferenciaCapital, leerPrefRegistro } from "@/lib/capital/preferencias";
import { CATALOGO, esTipoFin, type TipoFin } from "@/lib/finanzas/catalogo";
import { leerRenovaciones, renovar } from "@/lib/finanzas/mutuo";
import { anotarMovimiento } from "@/lib/caja/anotar";
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
    const db = await personal();
    // Las cuentas que pueden recibir intereses, cupones o dividendos (efectivo y cuentas de banco).
    const lista = await db.from("activos").select("id, tipo").is("unido_a", null);
    sinError(lista.error, "tus cuentas");
    const cuentas = ((lista.data ?? []) as { id: string; tipo: string }[]).filter((x) => esTipoFin(x.tipo)) as { id: string; tipo: TipoFin }[];
    const r = registroDeFormulario(c, hoyRD(new Date()), cuentas);
    if (!r.ok) throw new Error(r.error);
    const fila: Record<string, unknown> = { ...r.valor, actualizado_en: new Date().toISOString() };
    if (c.id) {
      if (!ID_REGISTRO.test(c.id)) throw new Error("Esa fila no existe. Recarga la página.");
      // Lo «elegible» que Mena cambia del comportamiento por defecto del tipo queda anotado (campo, valor y fecha).
      const previa = await db.from("activos").select("tipo, capitaliza, tiene_debito, cambios_tipo").eq("id", c.id).maybeSingle();
      sinError(previa.error, `«${r.valor.nombre}»`);
      if (!previa.data) throw new Error("Esa fila ya no existe. Recarga la página.");
      const antes = previa.data as { tipo: string; capitaliza: boolean | null; tiene_debito: boolean | null; cambios_tipo: Record<string, unknown> | null };
      const cambios = { ...(antes.cambios_tipo ?? {}) } as Record<string, { valor: unknown; fecha: string }>;
      const hoy = hoyRD(new Date());
      if (r.valor.capitaliza !== undefined && r.valor.capitaliza !== antes.capitaliza) cambios.capitaliza = { valor: r.valor.capitaliza, fecha: hoy };
      if (r.valor.tipo === "alto_rendimiento" && r.valor.tiene_debito !== antes.tiene_debito) cambios.tiene_debito = { valor: r.valor.tiene_debito, fecha: hoy };
      if (r.valor.tipo !== antes.tipo) cambios.tipo = { valor: r.valor.tipo, fecha: hoy };
      fila.cambios_tipo = cambios;
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
    const regla = CATALOGO[r.valor.tipo];
    const enPresupuesto = regla.grupo === "cuenta" || regla.grupo === "deuda" ? " Ya aparece sola en tu Presupuesto." : "";
    return `${r.valor.nombre} guardado.${enPresupuesto}`;
  });
  volver("/capital/cuentas", c.mes, resultado);
}

export async function eliminarRegistro(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    if (!c.id || !ID_REGISTRO.test(c.id)) throw new Error("Falta la fila");
    const db = await personal();
    // Todo lo que paga o recibe está en el Presupuesto (solo). Si su cuenta allá no tiene historia, se quita con ella;
    // si tiene movimientos o fijos, no se borra nada (se perdería esa historia).
    const enl = await db.from("caja_cuentas").select("id").eq("registro_id", c.id);
    sinError(enl.error, "la fila");
    for (const k of (enl.data ?? []) as { id: string }[]) {
      for (const [tabla, col] of [["caja_movimientos", "cuenta"], ["caja_movimientos", "destino"], ["caja_recurrentes", "cuenta"], ["caja_recurrentes", "destino"]] as const) {
        const u = await db.from(tabla).select("id", { count: "exact", head: true }).eq(col, k.id);
        sinError(u.error, "la fila");
        if (u.count) throw new Error("Tiene movimientos o pagos fijos en el Presupuesto: no se puede borrar sin perder esa historia. Si ya no la usas, déjala en 0.");
      }
      const s1 = await db.from("caja_saldos_reales").delete().eq("cuenta_id", k.id);
      sinError(s1.error, "la fila");
      const s2 = await db.from("caja_cuentas").delete().eq("id", k.id);
      sinError(s2.error, "la fila");
    }
    const { error } = await db.from("activos").delete().eq("id", c.id);
    sinError(error, "la fila");
    revalidatePath("/caja", "layout");
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

// ─────────────────────────────── Plan del mes y proyecciones ───────────────────────────────

/** Reglas de un instrumento para las proyecciones (tasa, si capitaliza, cada cuánto paga, si reinvierte, vencimiento). */
export async function guardarPlan(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    if (!c.id || !ID_REGISTRO.test(c.id)) throw new Error("Falta el instrumento. Recarga la página.");
    const r = planDeFormulario(c);
    if (!r.ok) throw new Error(r.error);
    const db = await personal();
    const { aporte_pct: _a, plan_inicio: _i, ...fila } = r.valor;
    const { error } = await db.from("activos").update({ ...fila, actualizado_en: new Date().toISOString() }).eq("id", c.id);
    sinError(error, "el plan");
    return "Reglas guardadas";
  });
  volver("/capital/futuro", c.mes, resultado);
}

/**
 * «Registrar la transferencia» de una línea de «Lo que planeaste ahorrar este mes»: un movimiento del Presupuesto
 * («Mover entre mis cuentas», categoría de ahorro e inversión) hacia el instrumento exacto, que confirma su fijo.
 * La misma validación de listas que el Presupuesto (el ahorro sale de efectivo o de una cuenta).
 */
export async function registrarLinea(form: FormData): Promise<void> {
  const c = camposDe(form);
  const fd = new FormData();
  for (const [k, v] of Object.entries({ tipo: "transferencia", fecha: c.fecha, monto: c.monto, moneda: c.moneda, cuenta: c.cuenta, destino: c.destino, categoria: c.categoria, recurrenteId: c.recurrenteId, nota: c.nota, unidades: c.unidades })) {
    if (v) fd.set(k, v);
  }
  const r = await anotarMovimiento(fd);
  volver(c.volver === "/capital" ? "/capital" : "/capital/futuro", c.mes, r.ok ? { ok: r.mensaje ?? "Anotado" } : { error: r.mensaje ?? "No se pudo anotar" });
}

/**
 * Mutuo / reporto: Mena anota la renovación (tasa nueva, días, el interés que ganó, si lo deja o lo retira y un
 * aporte adicional). Se guarda el evento, el capital nuevo y la tasa; el interés retirado entra al Presupuesto como
 * «Otros ingresos» en la cuenta que elija, y el aporte sale de la cuenta que elija («Mover entre mis cuentas»).
 */
export async function registrarRenovacion(form: FormData): Promise<void> {
  const c = camposDe(form);
  const resultado = await intentar(async () => {
    if (!c.id || !ID_REGISTRO.test(c.id)) throw new Error("Falta el mutuo. Recarga la página.");
    const fecha = c.fecha || hoyRD(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("La fecha no es válida.");
    const plazo = Number(c.plazoDias || "30");
    if (!Number.isInteger(plazo) || plazo < 1 || plazo > 3660) throw new Error("El plazo va en días, por ejemplo 30.");
    const tasa = pctForm(numeroForm(c.tasa));
    if (!tasa || !/^\d+(\.\d+)?$/.test(tasa) || new Big(tasa).gt(1)) throw new Error("Escribe la tasa nueva en % al año, por ejemplo 8.75.");
    const interes = numeroForm(c.interes) || "0";
    const aporte = numeroForm(c.aporte) || "0";
    if (!/^\d+(\.\d+)?$/.test(interes) || !/^\d+(\.\d+)?$/.test(aporte)) throw new Error("El interés y el aporte van en números, por ejemplo 750.");
    const deja = c.deja === "si";
    const db = await personal();
    const a = await db.from("activos").select("id, nombre, tipo, moneda, cantidad::text, renovaciones").eq("id", c.id).maybeSingle();
    sinError(a.error, "el mutuo");
    const f = a.data as { id: string; nombre: string; tipo: string; moneda: string; cantidad: string; renovaciones: unknown } | null;
    if (!f || f.tipo !== "mutuo") throw new Error("Ese instrumento no es un mutuo o reporto.");
    if (!deja && new Big(interes).gt(0) && !c.cuentaInteres) throw new Error("¿A qué cuenta te pagaron el interés? Elígela (entra como «Otros ingresos»).");
    if (new Big(aporte).gt(0) && !c.cuentaAporte) throw new Error("¿De qué cuenta salió el aporte? Elígela.");
    const ev = renovar(f.cantidad, { fecha, plazoDias: plazo, tasa, interes, dejaInteres: deja, aporte });
    // 1. El aporte: «Mover entre mis cuentas» hacia el mutuo (sale de tu cuenta; el cuadre de abajo deja el capital nuevo).
    const avisos: string[] = [];
    if (new Big(aporte).gt(0)) {
      const caja = await db.from("caja_cuentas").select("id").eq("registro_id", f.id).maybeSingle();
      const fd = new FormData();
      const destino = (caja.data as { id: string } | null)?.id ?? `r:${f.id}`;
      for (const [k, v] of Object.entries({ tipo: "transferencia", fecha, monto: aporte, moneda: f.moneda, cuenta: c.cuentaAporte!, destino, categoria: await categoriaDe("ahorro_inversion", "Ahorro e inversión"), nota: `Aporte al renovar ${f.nombre}` })) fd.set(k, v);
      const r = await anotarMovimiento(fd);
      if (!r.ok) throw new Error(r.mensaje ?? "No se pudo anotar el aporte");
    }
    // 2. El interés retirado: «Otros ingresos» en la cuenta que eligió.
    if (!deja && new Big(interes).gt(0)) {
      const fd = new FormData();
      for (const [k, v] of Object.entries({ tipo: "ingreso", fecha, monto: interes, moneda: f.moneda, cuenta: c.cuentaInteres!, categoria: await categoriaDe("otro_ingreso", "Intereses y dividendos"), nota: `Interés de ${f.nombre}` })) fd.set(k, v);
      const r = await anotarMovimiento(fd);
      if (!r.ok) avisos.push(`El interés no se anotó en el Presupuesto: ${r.mensaje}`);
    }
    // 3. El evento y el capital nuevo (al empezar el día siguiente a la renovación, como los saldos escritos).
    const lista = [...leerRenovaciones(f.renovaciones), ev];
    const { error } = await db
      .from("activos")
      .update({ renovaciones: lista, cantidad: ev.capitalNuevo, saldo_fecha: fechaDeSaldo(fecha), tasa, plazo_dias: plazo, vencimiento: sumarDiasISO(fecha, plazo), actualizado_en: new Date().toISOString() })
      .eq("id", f.id);
    sinError(error, "la renovación");
    revalidatePath("/caja", "layout");
    return `Renovado: ${f.nombre} queda en ${ev.capitalNuevo} (${deja ? "dejaste el interés adentro" : "retiraste el interés"}).${avisos.length ? ` ${avisos.join(" ")}` : ""}`;
  });
  volver("/capital/futuro", c.mes, resultado);
}

function sumarDiasISO(f: string, n: number): string {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** La categoría del Presupuesto de ese tipo (la primera) o una nueva con ese nombre. */
async function categoriaDe(tipo: "ahorro_inversion" | "otro_ingreso", nombre: string): Promise<string> {
  const db = await personal();
  const r = await db.from("caja_categorias").select("id, nombre").eq("tipo", tipo).order("n").limit(20);
  sinError(r.error, "la categoría");
  const lista = (r.data ?? []) as { id: string; nombre: string }[];
  const igual = lista.find((x) => x.nombre === nombre) ?? lista[0];
  if (igual) return igual.id;
  const nueva = await db.from("caja_categorias").insert({ nombre, tipo }).select("id").single();
  sinError(nueva.error, "la categoría");
  return (nueva.data as { id: string }).id;
}


