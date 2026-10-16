// Tarea «ia-porque» (cada 15 min): para cada serie que se movió más que su umbral, pide a Claude Haiku
// 1–2 oraciones que expliquen el movimiento SOLO con los titulares guardados. Si la salida no pasa la
// validación o los titulares no lo explican, se guarda «causa no confirmada». Nunca pasa el tope mensual.

import Big from "big.js";
import type { ContextoTarea, Tarea } from "../ingesta.ts";
import {
  CAUSA_NO_CONFIRMADA,
  contextoDe,
  direccionDe,
  type DatoSerie,
  ESQUEMA_PORQUE,
  estadoTope,
  type FuenteTexto,
  lineaDato,
  lineaTitular,
  llamarClaude,
  MODELO_PORQUE,
  REGLAS_COMUNES,
  sumar,
  type Titular,
  validarPorque,
} from "../ia.ts";

export interface CandidatoPorque extends DatoSerie {
  categoria: string;
  umbral: string;
}

export const SISTEMA_PORQUE = [
  "Eres el redactor de Strategya, una terminal financiera personal.",
  "Tu tarea: explicar en una o dos oraciones por qué se movió una serie de mercado, usando solo los titulares entregados.",
  "Si ningún titular explica el movimiento, responde explicado=false, texto vacío y fuentes vacías. No adivines.",
  "Si sí lo explica, cita en fuentes los enlaces de los titulares que usaste (de uno a tres).",
  REGLAS_COMUNES,
].join("\n");

export function mensajePorque(c: CandidatoPorque, titulares: Titular[]): string {
  return [
    "SERIE QUE SE MOVIÓ:",
    lineaDato(c),
    "",
    "TITULARES GUARDADOS (usa solo estos enlaces):",
    ...titulares.map(lineaTitular),
  ].join("\n");
}

interface FilaExplicacion {
  serie_id: string;
  tipo: "porque";
  fecha: string;
  texto: string;
  fuentes: FuenteTexto[];
  modelo: string;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  costo_usd: string;
  datos: Record<string, unknown>;
  confirmada: boolean;
}

function datosDe(c: CandidatoPorque, motivo?: string): Record<string, unknown> {
  return { fecha_dato: c.fecha_dato, valor: c.valor, cambio_pct: c.cambio_pct ?? null, ...(motivo ? { motivo } : {}) };
}

/** Parte del tope mensual que pueden gastar los porqués. */
export const PARTE_PORQUE = "0.7";

export const tareaIaPorque: Tarea = {
  nombre: "ia-porque",
  fuenteId: "anthropic",
  async ejecutar(ctx: ContextoTarea) {
    const clave = ctx.entorno("ANTHROPIC_API_KEY")?.trim();
    if (!clave) return { parcial: true, advertencias: ["Falta ANTHROPIC_API_KEY: los porqués con IA no están activos"] };

    const advertencias: string[] = [];
    const tope = await estadoTope(ctx);
    if (tope.advertencia) advertencias.push(tope.advertencia);
    const detalle: Record<string, unknown> = { tope_usd: tope.tope, gasto_mes_usd: tope.gasto, tope_alcanzado: tope.alcanzado };
    if (tope.alcanzado) {
      advertencias.push(`Tope de IA alcanzado (US$${tope.gasto} de US$${tope.tope} este mes): no se llama a la IA`);
      return { parcial: true, advertencias, detalle };
    }
    // Los porqués se detienen al 70 % del tope: el resto queda para «Las 5 del día» y «Guerras».
    const limitePorque = new Big(tope.tope).times(PARTE_PORQUE).toFixed(6);
    if (new Big(tope.gasto).gte(limitePorque)) {
      advertencias.push(`Los porqués ya usaron su parte del tope (US$${limitePorque} de US$${tope.tope}); lo que queda es para los resúmenes`);
      return { parcial: true, advertencias, detalle: { ...detalle, limite_porque_usd: limitePorque } };
    }

    const candidatos = (await ctx.rpc<CandidatoPorque[] | null>("ia_candidatos_porque", { p_ahora: ctx.ahora.toISOString(), p_limite: 8 })) ?? [];
    const desde = new Date(ctx.ahora.getTime() - 24 * 3_600_000).toISOString();
    const titulares = candidatos.length
      ? ((await ctx.rpc<Titular[] | null>("ia_titulares", { p_desde: desde, p_categorias: ["mercado", "guerra", "rd"], p_limite: 40 })) ?? [])
      : [];

    let gasto = tope.gasto;
    let llamadas = 0;
    let confirmadas = 0;
    for (const c of candidatos) {
      if (new Big(gasto).gte(limitePorque)) {
        detalle.tope_alcanzado = true;
        advertencias.push(`Tope de IA alcanzado a mitad de la corrida (US$${gasto}); quedan series sin explicar`);
        break;
      }
      const fila: FilaExplicacion = {
        serie_id: c.serie_id,
        tipo: "porque",
        fecha: ctx.ahora.toISOString(),
        texto: CAUSA_NO_CONFIRMADA,
        fuentes: [],
        modelo: MODELO_PORQUE,
        tokens_entrada: null,
        tokens_salida: null,
        costo_usd: "0",
        datos: datosDe(c),
        confirmada: false,
      };
      if (titulares.length === 0) {
        // Sin titulares no hay con qué explicar: no se gasta una llamada.
        fila.modelo = "sin-llamada";
        fila.datos = datosDe(c, "sin titulares guardados en las últimas 24 h");
      } else {
        const mensaje = mensajePorque(c, titulares);
        try {
          const r = await llamarClaude(ctx, clave, {
            modelo: MODELO_PORQUE,
            sistema: SISTEMA_PORQUE,
            mensaje,
            esquema: ESQUEMA_PORQUE,
            maxTokens: 2000,
            esfuerzo: "low",
          });
          llamadas++;
          gasto = sumar(gasto, r.costo);
          fila.modelo = r.modelo;
          fila.tokens_entrada = r.uso.input_tokens;
          fila.tokens_salida = r.uso.output_tokens;
          fila.costo_usd = r.costo;
          const v = r.ok ? validarPorque(r.json, contextoDe([c], titulares, direccionDe(c.cambio_pct ?? c.cambio))) : { ok: false as const, motivo: r.motivo };
          if (v.ok && v.valor.explicado) {
            fila.texto = v.valor.texto;
            fila.fuentes = v.valor.fuentes;
            fila.confirmada = true;
            confirmadas++;
          } else {
            fila.datos = datosDe(c, v.ok ? "los titulares no explican el movimiento" : `validación: ${v.motivo}`);
          }
        } catch (e) {
          advertencias.push(`${c.serie_id}: ${(e as Error).message}`);
          continue; // error HTTP: no se cobra y no se guarda nada; se reintenta en la próxima corrida
        }
      }
      await ctx.guardar("explicaciones", [fila as unknown as Record<string, unknown>]);
    }

    Object.assign(detalle, { candidatos: candidatos.length, titulares: titulares.length, llamadas, confirmadas, gasto_mes_usd: gasto });
    return { parcial: advertencias.length > 0, advertencias, detalle };
  },
};
