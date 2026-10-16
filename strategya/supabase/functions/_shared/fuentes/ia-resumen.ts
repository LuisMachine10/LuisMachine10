// Tarea «ia-resumen» (7:35 AM y 5:05 PM RD, y a pedido): con Claude Sonnet redacta «Las 5 del día» y
// «Guerras en el mundo» a partir de mercado.noticias y las observaciones del día. Solo texto: las cifras
// que aparezcan deben estar en los datos de entrada, y los enlaces deben ser de los titulares entregados.

import type { ContextoTarea, Tarea } from "../ingesta.ts";
import {
  type Conflicto,
  contextoDe,
  type DatoSerie,
  ESQUEMA_CINCO,
  ESQUEMA_GUERRAS,
  estadoTope,
  type ItemCinco,
  lineaDato,
  lineaTitular,
  llamarClaude,
  MODELO_RESUMEN,
  REGLAS_COMUNES,
  type ResultadoClaude,
  sumar,
  type Titular,
  validarCinco,
  validarGuerras,
} from "../ia.ts";

export const SISTEMA_CINCO = [
  "Eres el redactor de Strategya, la terminal financiera personal de un analista en República Dominicana.",
  "Escribe «Las 5 del día»: las noticias más importantes para los mercados y para RD, elegidas de los titulares entregados.",
  "Cada item: titulo (una línea), resumen (dos o tres oraciones), porque (por qué importa, una o dos oraciones),",
  "y_que (qué implica para República Dominicana, una o dos oraciones) y url (el enlace exacto del titular usado).",
  "Si hay menos de cinco titulares relevantes, entrega menos items. Puedes citar cifras de la sección DATOS solo si están escritas ahí.",
  REGLAS_COMUNES,
].join("\n");

export const SISTEMA_GUERRAS = [
  "Eres el redactor de Strategya, la terminal financiera personal de un analista en República Dominicana.",
  "Escribe «Guerras en el mundo»: los conflictos armados o geopolíticos que aparecen en los titulares entregados.",
  "Cada conflicto: conflicto (nombre corto), pais (país principal, en español), estado (ESCALA, TENSIÓN, TREGUA o BAJA INTENSIDAD,",
  "según lo que dicen los titulares), que_paso (una o dos oraciones), mercado (cómo lo leen los mercados, una o dos oraciones,",
  "sin cifras que no estén en DATOS) y url (el enlace exacto del titular usado). Si no hay conflictos en los titulares, devuelve una lista vacía.",
  REGLAS_COMUNES,
].join("\n");

export function mensajeResumen(datos: DatoSerie[], titulares: Titular[]): string {
  return [
    "DATOS (último dato confirmado de cada serie):",
    ...(datos.length ? datos.map(lineaDato) : ["- (sin datos confirmados recientes)"]),
    "",
    "TITULARES GUARDADOS (usa solo estos enlaces):",
    ...titulares.map(lineaTitular),
  ].join("\n");
}

export function textoCinco(items: ItemCinco[]): string {
  return items.map((it, i) => `${i + 1}. ${it.titulo} — ${it.resumen} ¿Por qué? ${it.porque} ¿Y qué? ${it.y_que}`).join("\n");
}

export function textoGuerras(lista: Conflicto[]): string {
  if (!lista.length) return "Sin conflictos en los titulares guardados.";
  return lista.map((c) => `${c.conflicto} [${c.estado}] — ${c.que_paso} Mercado: ${c.mercado}`).join("\n");
}

type Tipo = "cinco_del_dia" | "guerras";

interface Pieza {
  tipo: Tipo;
  titulares: Titular[];
  sistema: string;
  esquema: Record<string, unknown>;
}

export const tareaIaResumen: Tarea = {
  nombre: "ia-resumen",
  fuenteId: "anthropic",
  async ejecutar(ctx: ContextoTarea) {
    const clave = ctx.entorno("ANTHROPIC_API_KEY")?.trim();
    if (!clave) return { parcial: true, advertencias: ["Falta ANTHROPIC_API_KEY: el resumen con IA no está activo"] };

    const advertencias: string[] = [];
    const tope = await estadoTope(ctx);
    if (tope.advertencia) advertencias.push(tope.advertencia);
    const detalle: Record<string, unknown> = { tope_usd: tope.tope, gasto_mes_usd: tope.gasto, tope_alcanzado: tope.alcanzado };
    if (tope.alcanzado) {
      advertencias.push(`Tope de IA alcanzado (US$${tope.gasto} de US$${tope.tope} este mes): no se llama a la IA`);
      return { parcial: true, advertencias, detalle };
    }

    const ahora = ctx.ahora.toISOString();
    const desde = new Date(ctx.ahora.getTime() - 24 * 3_600_000).toISOString();
    const [datos, deMercado, deGuerra] = await Promise.all([
      ctx.rpc<DatoSerie[] | null>("ia_observaciones_dia", { p_ahora: ahora }),
      ctx.rpc<Titular[] | null>("ia_titulares", { p_desde: desde, p_categorias: ["mercado", "rd"], p_limite: 60 }),
      ctx.rpc<Titular[] | null>("ia_titulares", { p_desde: desde, p_categorias: ["guerra"], p_limite: 40 }),
    ]);

    const piezas: Pieza[] = [
      { tipo: "cinco_del_dia", titulares: deMercado ?? [], sistema: SISTEMA_CINCO, esquema: ESQUEMA_CINCO },
      { tipo: "guerras", titulares: deGuerra ?? [], sistema: SISTEMA_GUERRAS, esquema: ESQUEMA_GUERRAS },
    ];

    let gasto = tope.gasto;
    const resultado: Record<string, string> = {};
    // Las dos llamadas van en paralelo para caber en el tiempo máximo de la Edge Function.
    await Promise.all(
      piezas.map(async (p) => {
        if (!p.titulares.length) {
          resultado[p.tipo] = "sin titulares";
          advertencias.push(`${p.tipo}: no hay titulares guardados en las últimas 24 h; la pantalla muestra «sin resumen»`);
          return;
        }
        const mensaje = mensajeResumen(datos ?? [], p.titulares);
        let r: ResultadoClaude;
        try {
          r = await llamarClaude(ctx, clave, {
            modelo: MODELO_RESUMEN,
            sistema: p.sistema,
            mensaje,
            esquema: p.esquema,
            maxTokens: 8000,
            esfuerzo: "low",
            timeoutMs: 110_000,
          });
        } catch (e) {
          resultado[p.tipo] = "error";
          advertencias.push(`${p.tipo}: ${(e as Error).message}`);
          return;
        }
        gasto = sumar(gasto, r.costo);
        const ctxV = contextoDe(mensaje, p.titulares);
        const fila: Record<string, unknown> = {
          tipo: p.tipo,
          fecha: ahora,
          modelo: r.modelo,
          tokens_entrada: r.uso.input_tokens,
          tokens_salida: r.uso.output_tokens,
          costo_usd: r.costo,
          texto: "Resumen no confirmado: la salida de la IA no pasó la validación.",
          fuentes: [],
          datos: null,
          confirmada: false,
        };
        const v = !r.ok
          ? ({ ok: false, motivo: r.motivo } as const)
          : p.tipo === "cinco_del_dia"
            ? validarCinco(r.json, ctxV)
            : validarGuerras(r.json, ctxV);
        if (v.ok) {
          const lista = v.valor as Array<{ url: string }>;
          fila.texto = p.tipo === "cinco_del_dia" ? textoCinco(v.valor as ItemCinco[]) : textoGuerras(v.valor as Conflicto[]);
          fila.fuentes = lista.map((x) => ({ titulo: ctxV.enlaces.get(x.url)!, url: x.url }));
          fila.datos = p.tipo === "cinco_del_dia" ? { items: v.valor } : { conflictos: v.valor };
          fila.confirmada = true;
          resultado[p.tipo] = "ok";
        } else {
          fila.datos = { motivo: v.motivo };
          resultado[p.tipo] = "no confirmado";
          advertencias.push(`${p.tipo}: no confirmado (${v.motivo})`);
        }
        // Se guarda aunque no pase la validación: el costo cuenta para el tope.
        await ctx.guardar("explicaciones", [fila]);
      }),
    );

    Object.assign(detalle, { resultado, gasto_mes_usd: gasto, titulares_mercado: (deMercado ?? []).length, titulares_guerra: (deGuerra ?? []).length });
    return { parcial: advertencias.length > 0, advertencias, detalle };
  },
};
