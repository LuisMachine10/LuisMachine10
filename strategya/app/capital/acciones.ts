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
  mezclarParametros,
  modoCierre,
  numeroForm,
  nuevoId,
  rutaSegura,
  SECCIONES_PARAMETROS,
  type SeccionParametros,
} from "@/lib/capital/formulario";
import { activoAFila, type AnalisisArchivo, analizarArchivo, cargaParaBase, TAMANO_MAXIMO, transaccionAFila } from "@/lib/capital/importar";
import { esMes } from "@/lib/capital/fechas";
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
    const { error } = await db.from("parametros").upsert({ id: 1, datos: p, actualizado_en: new Date().toISOString() });
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
      const { error } = await db.from("activos").update({ ...fila, actualizado_en: new Date().toISOString() }).eq("id", c.id);
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
    const { error } = await db.from("cierres").upsert({ mes, datos: cierre, actualizado_en: new Date().toISOString() });
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
    const { error } = await db.from("cierres").upsert({ mes, datos: desagregar(datos.ctx.p, guardado), actualizado_en: new Date().toISOString() });
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
    const { error } = await db.from("ips").upsert({ id: 1, datos: ips, actualizado_en: new Date().toISOString() });
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
