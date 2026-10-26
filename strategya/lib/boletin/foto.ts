// Foto de «Tu dinero» para el Boletín, calculada con el MISMO motor del Portafolio (lib/capital): patrimonio
// neto y su cambio del mes, aportes del plan pendientes y riesgos de la matriz en nivel alto. Solo totales:
// ningún nombre de cuenta, número de cuenta ni institución. Se guarda en mercado.boletin_tu_dinero.

import Big from "big.js";
import { cambioDelMes, indicadores } from "../capital/cierres";
import { matrizRiesgo, tonoGravedad } from "../capital/matriz";
import { ahorroPresupuestado, aportesDelPlan } from "../capital/proyeccion";
import type { DatosCapital } from "../datos-capital";
import type { FotoDinero } from "../../supabase/functions/_shared/boletin/tipos.ts";

export function fotoTuDinero(datos: Pick<DatosCapital, "ctx" | "configurado" | "registroCompleto" | "aportesConfirmados">): FotoDinero {
  const { ctx } = datos;
  const mes = ctx.hoy.slice(0, 7);
  const hayAlgo = datos.configurado || datos.registroCompleto.length > 0 || ctx.activos.length > 0;
  const ind = indicadores(ctx, mes);
  const cambio = hayAlgo ? cambioDelMes(ctx, mes) : null;

  const plan = aportesDelPlan(ctx, ahorroPresupuestado(ctx)).filter((x) => x.monto.gt(0));
  const confirmados = datos.aportesConfirmados.filter((x) => x.mes === mes);
  const pendientes = plan.filter((x) => !confirmados.some((c) => c.activoId === x.activo.id));
  const suma = (xs: { monto: Big }[]) => xs.reduce((s, x) => s.plus(x.monto), new Big(0));

  const matriz = hayAlgo ? matrizRiesgo(ctx) : [];
  const evaluados = matriz.filter((r) => !r.sinDato);
  return {
    mes,
    patrimonio: hayAlgo ? ind.foto.patrimonio.toFixed(2) : null,
    vivo: ind.foto.vivo,
    cambio: cambio ? cambio.cambio.toFixed(2) : null,
    cambio_pct: cambio?.pct ? cambio.pct.times(100).toFixed(2) : null,
    previo: cambio?.previo ?? null,
    aportes: plan.length ? { plan: plan.length, pendientes: pendientes.length, total: suma(plan).toFixed(2), pendiente: suma(pendientes).toFixed(2) } : null,
    riesgos: evaluados
      .filter((r) => tonoGravedad(r) === "alto")
      .map((r) => ({ titulo: r.titulo, impacto: r.impacto, probabilidad: r.probabilidad })),
    riesgos_evaluados: evaluados.length,
  };
}
