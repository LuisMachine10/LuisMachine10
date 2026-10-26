// Foto de «Tu dinero» para el Boletín, calculada con el MISMO motor del Portafolio (lib/capital): patrimonio
// neto y su cambio del mes, aportes del plan pendientes y riesgos de la matriz en nivel alto. Solo totales:
// ningún nombre de cuenta, número de cuenta ni institución. Se guarda en mercado.boletin_tu_dinero.

import Big from "big.js";
import { cambioDelMes, indicadores } from "../capital/cierres";
import { matrizRiesgo, tonoGravedad } from "../capital/matriz";
import type { PlanDelMes } from "../finanzas/plan";
import { cicloDe, cicloVigente, fechasDelCiclo, proximoCorte } from "../caja/ciclo";
import { sumarDias } from "../caja/fechas";
import type { ItemRegistro } from "../capital/registro";
import type { DatosCapital } from "../datos-capital";
import type { FotoDinero } from "../../supabase/functions/_shared/boletin/tipos.ts";

export function fotoTuDinero(datos: Pick<DatosCapital, "ctx" | "configurado" | "registroCompleto"> & { plan?: PlanDelMes | null; aportesConfirmados?: unknown }): FotoDinero {
  const { ctx } = datos;
  const mes = ctx.hoy.slice(0, 7);
  const hayAlgo = datos.configurado || datos.registroCompleto.length > 0 || ctx.activos.length > 0;
  const ind = indicadores(ctx, mes);
  const cambio = hayAlgo ? cambioDelMes(ctx, mes) : null;

  // «Lo que planeaste ahorrar este mes»: las líneas del plan (instrumento + monto) y cuánto falta de cada una.
  const lineas = datos.plan?.lineas ?? [];
  const pendientes = lineas.filter((l) => l.estado !== "hecha");
  const total = lineas.reduce((s, l) => s.plus(l.planeadoDOP ?? 0), new Big(0));
  const falta = pendientes.reduce((s, l) => {
    const f = l.planeadoDOP && l.hechoDOP ? l.planeadoDOP.minus(l.hechoDOP) : (l.planeadoDOP ?? new Big(0));
    return s.plus(f.gt(0) ? f : 0);
  }, new Big(0));

  const matriz = hayAlgo ? matrizRiesgo(ctx) : [];
  const evaluados = matriz.filter((r) => !r.sinDato);
  return {
    mes,
    patrimonio: hayAlgo ? ind.foto.patrimonio.toFixed(2) : null,
    vivo: ind.foto.vivo,
    cambio: cambio ? cambio.cambio.toFixed(2) : null,
    cambio_pct: cambio?.pct ? cambio.pct.times(100).toFixed(2) : null,
    previo: cambio?.previo ?? null,
    aportes: lineas.length ? { plan: lineas.length, pendientes: pendientes.length, total: total.toFixed(2), pendiente: falta.toFixed(2) } : null,
    riesgos: evaluados
      .filter((r) => tonoGravedad(r) === "alto")
      .map((r) => ({ titulo: r.titulo, impacto: r.impacto, probabilidad: r.probabilidad })),
    riesgos_evaluados: evaluados.length,
    tarjetas: ciclosTarjetas(ctx.registro ?? [], ctx.hoy),
  };
}

/** Nombre de la tarjeta para el correo: el que puso Mena, sin secuencias de 3 o más dígitos (nunca números de tarjeta). */
export function nombreSeguro(nombre: string): string {
  return nombre.replace(/\d{3,}/g, "…").slice(0, 60).trim() || "Tarjeta";
}

/** El ciclo vigente y el siguiente de cada tarjeta con ciclo: el correo elige los de los próximos 7 días. */
export function ciclosTarjetas(registro: ItemRegistro[], hoy: string): NonNullable<FotoDinero["tarjetas"]> {
  const out: NonNullable<FotoDinero["tarjetas"]> = [];
  for (const t of registro) {
    if (t.clase !== "tarjeta" || t.unidoA) continue;
    const c = cicloDe(t);
    if (!c) continue;
    const vigente = cicloVigente(hoy, c);
    const siguiente = fechasDelCiclo(proximoCorte(sumarDias(vigente.corte, 1), c.diaCorte), c);
    for (const f of [vigente, siguiente]) {
      out.push({ nombre: nombreSeguro(t.nombre), corte: f.corte, pago: f.pago, limite: f.limite, pagado: t.pagos.some((p) => p > f.corte && p <= hoy) });
    }
  }
  return out;
}
