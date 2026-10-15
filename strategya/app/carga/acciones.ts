"use server";

// Carga manual (solo Mena). La base vuelve a validar todo y exige mercado.es_autorizado():
// estas validaciones solo dan mensajes claros antes de llegar a ella.

import { revalidatePath } from "next/cache";
import { validarDecimal, validarEnlace, validarFecha, type Validacion } from "@/lib/rd";
import { mercado } from "@/lib/supabase/servidor";

export interface EstadoCarga {
  ok: boolean | null;
  mensaje: string | null;
}

const texto = (form: FormData, campo: string) => String(form.get(campo) ?? "").trim();

function primerError(...v: Validacion<unknown>[]): string | null {
  for (const x of v) if (!x.ok) return x.error;
  return null;
}

function refrescar() {
  revalidatePath("/");
  revalidatePath("/rd");
  revalidatePath("/carga");
}

function mensajeBase(error: { message: string; code?: string }): string {
  if (error.code === "23505") return "Ya existe un registro igual (mismo fondo, moneda, base y fecha de corte).";
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) {
    return "No autorizado: inicia sesión con la cuenta de Mena.";
  }
  return error.message;
}

export async function cargarDato(_previo: EstadoCarga, form: FormData): Promise<EstadoCarga> {
  const serie = texto(form, "serie");
  const fecha = validarFecha(texto(form, "fecha"), "Fecha del dato");
  const valor = validarDecimal(texto(form, "valor"), "El valor");
  const enlace = validarEnlace(texto(form, "enlace"));
  if (!serie) return { ok: false, mensaje: "Elige la serie." };
  const error = primerError(fecha, valor, enlace);
  if (error || !fecha.ok || !valor.ok || !enlace.ok) return { ok: false, mensaje: error };

  const db = await mercado();
  const r = await db.rpc("cargar_dato_manual", {
    p_serie_id: serie,
    p_fecha: fecha.valor,
    p_valor: valor.valor,
    p_url: enlace.valor,
    p_nota: texto(form, "nota") || null,
  });
  if (r.error) return { ok: false, mensaje: mensajeBase(r.error) };
  refrescar();
  return { ok: true, mensaje: `Guardado: ${serie} = ${valor.valor} al ${fecha.valor}.` };
}

const PRODUCTOS_COMBUSTIBLE = [
  ["COMB_GASOLINA_PREMIUM", "Gasolina premium"],
  ["COMB_GASOLINA_REGULAR", "Gasolina regular"],
  ["COMB_GASOIL_OPTIMO", "Gasoil óptimo"],
  ["COMB_GASOIL_REGULAR", "Gasoil regular"],
  ["COMB_GLP", "GLP"],
] as const;

export async function cargarCombustibles(_previo: EstadoCarga, form: FormData): Promise<EstadoCarga> {
  const semana = validarFecha(texto(form, "semana"), "Inicio de la semana");
  const enlace = validarEnlace(texto(form, "enlace"));
  const error = primerError(semana, enlace);
  if (error || !semana.ok || !enlace.ok) return { ok: false, mensaje: error };

  const precios: [string, string, string][] = [];
  for (const [serie, nombre] of PRODUCTOS_COMBUSTIBLE) {
    const crudo = texto(form, serie);
    if (!crudo) continue;
    const v = validarDecimal(crudo, nombre, { positivo: true });
    if (!v.ok) return { ok: false, mensaje: v.error };
    precios.push([serie, nombre, v.valor]);
  }
  if (precios.length === 0) return { ok: false, mensaje: "Escribe al menos un precio." };

  const db = await mercado();
  const guardados: string[] = [];
  for (const [serie, nombre, valor] of precios) {
    const r = await db.rpc("cargar_dato_manual", {
      p_serie_id: serie,
      p_fecha: semana.valor,
      p_valor: valor,
      p_url: enlace.valor,
      p_nota: "Precio semanal de combustibles (carga manual)",
    });
    if (r.error) {
      if (guardados.length) refrescar();
      return {
        ok: false,
        mensaje: `${nombre}: ${mensajeBase(r.error)}${guardados.length ? ` (sí se guardó: ${guardados.join(", ")})` : ""}`,
      };
    }
    guardados.push(nombre);
  }
  refrescar();
  return { ok: true, mensaje: `Guardados ${guardados.length} precios de la semana del ${semana.valor}.` };
}

export async function cargarFondo(_previo: EstadoCarga, form: FormData): Promise<EstadoCarga> {
  const safi = texto(form, "safi");
  const fondo = texto(form, "fondo");
  const moneda = texto(form, "moneda");
  const plazo = Number(texto(form, "plazo"));
  const rendimiento = validarDecimal(texto(form, "rendimiento"), "El rendimiento");
  const corte = validarFecha(texto(form, "corte"), "Fecha de corte");
  const enlace = validarEnlace(texto(form, "enlace"));
  if (!safi || !fondo) return { ok: false, mensaje: "Escribe la SAFI y el nombre del fondo." };
  if (moneda !== "DOP" && moneda !== "USD") return { ok: false, mensaje: "Elige la moneda del fondo." };
  if (![30, 360, 365].includes(plazo)) return { ok: false, mensaje: "La base del rendimiento debe ser 30, 360 o 365 días." };
  const error = primerError(rendimiento, corte, enlace);
  if (error || !rendimiento.ok || !corte.ok || !enlace.ok) return { ok: false, mensaje: error };

  const db = await mercado();
  const r = await db.from("fondos_rendimientos").insert({
    safi,
    fondo,
    moneda,
    plazo_dias: plazo,
    rendimiento: rendimiento.valor, // texto: PostgREST lo convierte a numeric sin pasar por float
    fecha_corte: corte.valor,
    url_fuente: enlace.valor,
    nota: texto(form, "nota") || null,
  });
  if (r.error) return { ok: false, mensaje: mensajeBase(r.error) };
  refrescar();
  return { ok: true, mensaje: `Guardado: ${fondo} (${safi}) ${rendimiento.valor}% al ${corte.valor}.` };
}

export async function cargarEmision(_previo: EstadoCarga, form: FormData): Promise<EstadoCarga> {
  const fuente = texto(form, "fuente");
  const numero = texto(form, "numero");
  const fecha = validarFecha(texto(form, "fecha"), "Fecha");
  const enlace = validarEnlace(texto(form, "enlace"));
  const monto = texto(form, "monto");
  const tasa = texto(form, "tasa");
  if (fuente !== "SIMV" && fuente !== "BVRD") return { ok: false, mensaje: "Elige SIMV (resolución) o BVRD (hecho relevante)." };
  if (!numero) return { ok: false, mensaje: "Falta el número de la resolución o del hecho relevante." };
  const checks: Validacion<unknown>[] = [fecha, enlace];
  if (monto) checks.push(validarDecimal(monto, "El monto", { positivo: true }));
  if (tasa) checks.push(validarDecimal(tasa, "La tasa"));
  const error = primerError(...checks);
  if (error || !fecha.ok || !enlace.ok) return { ok: false, mensaje: error };

  const db = await mercado();
  const r = await db.rpc("cargar_emision_manual", {
    p_fuente: fuente,
    p_numero: numero,
    p_fecha: fecha.valor,
    p_url: enlace.valor,
    p_emisor: texto(form, "emisor") || null,
    p_instrumento: texto(form, "instrumento") || null,
    p_monto: monto || null,
    p_moneda: texto(form, "moneda") || null,
    p_tasa: tasa || null,
    p_descripcion: texto(form, "descripcion") || null,
  });
  if (r.error) return { ok: false, mensaje: mensajeBase(r.error) };
  refrescar();
  return { ok: true, mensaje: `Guardado: ${fuente} ${numero} del ${fecha.valor}.` };
}
