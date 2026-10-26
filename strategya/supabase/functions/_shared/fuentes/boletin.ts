// Tareas del Boletín por reglas (sin IA): boletin-am, boletin-cierre, boletin-finde, boletin-tasas y
// boletin-prueba. Cada una lee los datos con mercado.boletin_datos, arma la edición con plantillas
// (_shared/boletin/armar.ts), la guarda en mercado.boletin_ediciones y la envía por Resend.
//
// Idempotencia: mercado.boletin_reservar da una sola edición por tipo y día; si ya salió, la tarea no
// hace nada. Resend recibe además una Idempotency-Key por tipo y día. Si Resend falla, la edición queda
// guardada con estado «error» y el motivo (se ve en /boletin) y la segunda pasada la vuelve a intentar.
// Destino: el secreto BOLETIN_PARA o, si no está, el correo del usuario dueño en la base (auth). Nunca en el código.

import { armarEdicion } from "../boletin/armar.ts";
import { claveIdempotencia, EDICIONES, fechaRD, nombreTarea, tocaHoy } from "../boletin/horario.ts";
import { htmlCorreo, textoPlano } from "../boletin/render.ts";
import type { DatosBoletin, TipoEdicion } from "../boletin/tipos.ts";
import { esTipoEdicion } from "../boletin/tipos.ts";
import type { ContextoTarea, ResultadoTarea, Tarea } from "../ingesta.ts";
import { REMITENTE, URL_RESEND } from "./alertas.ts";

export interface ResultadoEnvio {
  estado: "enviada" | "sin_envio" | "error";
  error?: string;
  resendId?: string | null;
}

/** Destino del correo: BOLETIN_PARA (puede ser una lista separada por comas) o el dueño en la base. */
export async function destinoBoletin(ctx: ContextoTarea): Promise<string[]> {
  const secreto = ctx.entorno("BOLETIN_PARA")?.trim();
  if (secreto) return secreto.split(",").map((s) => s.trim()).filter((s) => /^[^\s@]+@[^\s@]+$/.test(s));
  const dueno = await ctx.rpc<string | null>("boletin_destino").catch(() => null);
  if (dueno && /^[^\s@]+@[^\s@]+$/.test(dueno)) return [dueno];
  const alertas = ctx.entorno("ALERTAS_EMAIL_DESTINO")?.trim();
  return alertas ? [alertas] : [];
}

async function enviar(
  ctx: ContextoTarea,
  correo: { asunto: string; texto: string; html: string },
  clave: string,
  para: string[],
  idempotencia: string,
): Promise<ResultadoEnvio> {
  try {
    const r = await ctx.api(URL_RESEND, {
      metodo: "POST",
      encabezados: { Authorization: `Bearer ${clave}`, "Idempotency-Key": idempotencia },
      cuerpo: { from: REMITENTE, to: para, subject: correo.asunto, text: correo.texto, html: correo.html },
    });
    let id: string | null = null;
    try {
      id = (JSON.parse(r.texto) as { id?: string }).id ?? null;
    } catch {
      id = null;
    }
    return { estado: "enviada", resendId: id };
  } catch (e) {
    return { estado: "error", error: `Resend: ${(e as Error).message}` };
  }
}

interface Pasada {
  tipo: TipoEdicion;
  prueba: boolean;
}

/** Arma, guarda y envía una edición. Devuelve el id de la edición (o null si ya había salido). */
export async function correrEdicion(ctx: ContextoTarea, p: Pasada): Promise<{ id: number | null; resultado: ResultadoTarea }> {
  const ahora = ctx.ahora;
  const hoy = fechaRD(ahora);
  const detalle: Record<string, unknown> = { tipo: p.tipo, fecha: hoy, prueba: p.prueba };

  if (!p.prueba && !tocaHoy(p.tipo, ahora)) {
    return { id: null, resultado: { detalle: { ...detalle, omitida: `La edición ${EDICIONES[p.tipo].nombre} no sale hoy (hora RD).` } } };
  }

  const datos = await ctx.rpc<DatosBoletin>("boletin_datos", { p_tipo: p.tipo, p_ahora: ahora.toISOString() });
  if (!datos || typeof datos !== "object") throw new Error("mercado.boletin_datos no devolvió datos");
  if (!p.prueba && datos.preferencias?.[p.tipo] === false) {
    return { id: null, resultado: { detalle: { ...detalle, omitida: "Desactivada en Ajustes" } } };
  }

  const id = await ctx.rpc<number | string | null>("boletin_reservar", { p_tipo: p.tipo, p_fecha: hoy, p_prueba: p.prueba });
  if (id === null || id === undefined) {
    return { id: null, resultado: { detalle: { ...detalle, omitida: "Ya salió (o se está armando): no se repite" } } };
  }
  const edicionId = Number(id);
  detalle.edicion = edicionId;

  const urlApp = ctx.entorno("STRATEGYA_URL_APP")?.trim() || null;
  let correo: { asunto: string; texto: string; html: string };
  try {
    const e = armarEdicion(datos, { urlApp, prueba: p.prueba });
    correo = { asunto: e.asunto, texto: textoPlano(e), html: htmlCorreo(e, { urlEdicion: urlApp ? `${urlApp.replace(/\/$/, "")}/boletin/${edicionId}` : null }) };
    await ctx.rpc("boletin_guardar", {
      p_id: edicionId,
      p_asunto: e.asunto,
      p_contenido: e,
      p_texto: correo.texto,
      p_html: correo.html,
      p_palabras: e.palabras,
      p_con_tu_dinero: e.conTuDinero,
    });
    detalle.palabras = e.palabras;
    detalle.recortes = e.recortes;
  } catch (err) {
    const mensaje = `No se pudo armar la edición: ${(err as Error).message}`;
    await ctx.rpc("boletin_marcar", { p_id: edicionId, p_estado: "error", p_error: mensaje.slice(0, 2000) });
    return { id: edicionId, resultado: { parcial: true, advertencias: [mensaje], detalle } };
  }

  const clave = ctx.entorno("RESEND_API_KEY")?.trim();
  const para = await destinoBoletin(ctx);
  if (!clave || !para.length) {
    const motivo = !clave ? "Falta RESEND_API_KEY: la edición quedó guardada y se ve en Boletín" : "Sin destino: configura BOLETIN_PARA o el correo del usuario dueño";
    await ctx.rpc("boletin_marcar", { p_id: edicionId, p_estado: "sin_envio", p_error: motivo });
    return { id: edicionId, resultado: { parcial: true, advertencias: [motivo], detalle } };
  }

  const envio = await enviar(ctx, correo, clave, para, claveIdempotencia(p.tipo, hoy, p.prueba ? edicionId : null));
  await ctx.rpc("boletin_marcar", { p_id: edicionId, p_estado: envio.estado, p_error: envio.error ?? null, p_resend_id: envio.resendId ?? null });
  detalle.envio = envio.estado;
  return envio.estado === "enviada"
    ? { id: edicionId, resultado: { detalle } }
    : { id: edicionId, resultado: { parcial: true, advertencias: [envio.error ?? "No se pudo enviar"], detalle } };
}

function tareaEdicion(tipo: TipoEdicion): Tarea {
  return {
    nombre: nombreTarea(tipo),
    fuenteId: "boletin",
    async ejecutar(ctx) {
      return (await correrEdicion(ctx, { tipo, prueba: false })).resultado;
    },
  };
}

export const tareaBoletinAm = tareaEdicion("am");
export const tareaBoletinCierre = tareaEdicion("cierre");
export const tareaBoletinFinde = tareaEdicion("finde");
export const tareaBoletinTasas = tareaEdicion("tasas");

/** «Enviar prueba» desde /boletin: atiende los pedidos pendientes (solo al dueño, nunca a otra dirección). */
export const tareaBoletinPrueba: Tarea = {
  nombre: "boletin-prueba",
  fuenteId: "boletin",
  async ejecutar(ctx) {
    const pedidos = (await ctx.rpc<{ id: number; tipo: string }[] | null>("boletin_pedidos_pendientes")) ?? [];
    const advertencias: string[] = [];
    let atendidos = 0;
    for (const p of pedidos) {
      if (!esTipoEdicion(p.tipo)) {
        await ctx.rpc("boletin_atender_pedido", { p_id: p.id, p_edicion: null, p_error: "Tipo desconocido" });
        continue;
      }
      try {
        const r = await correrEdicion(ctx, { tipo: p.tipo, prueba: true });
        const error = r.resultado.advertencias?.join(" · ") || null;
        if (error) advertencias.push(error);
        await ctx.rpc("boletin_atender_pedido", { p_id: p.id, p_edicion: r.id, p_error: error });
        atendidos++;
      } catch (e) {
        const m = (e as Error).message;
        advertencias.push(m);
        await ctx.rpc("boletin_atender_pedido", { p_id: p.id, p_edicion: null, p_error: m.slice(0, 2000) });
      }
    }
    return { parcial: advertencias.length > 0, advertencias, detalle: { pedidos: pedidos.length, atendidos } };
  },
};

export const TAREAS_BOLETIN: Tarea[] = [tareaBoletinAm, tareaBoletinCierre, tareaBoletinFinde, tareaBoletinTasas, tareaBoletinPrueba];
