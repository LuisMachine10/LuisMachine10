// Cliente de IA de Strategya (Claude Messages API por HTTP, sin SDK) y sus candados.
//
// Regla de la casa: la IA NUNCA introduce cifras. Aquí se hace cumplir así:
//   1. El mensaje se arma solo con datos guardados (series con valor, cambio y fecha; titulares con enlace).
//   2. Se pide JSON estricto (output_config.format) y se valida con un esquema escrito a mano.
//   3. Los enlaces de la respuesta deben salir de la lista entregada.
//   4. Ningún número del texto puede faltar en los datos de entrada (tokens numéricos normalizados).
// Si algo falla, el texto que se guarda es «causa no confirmada» (o no se publica el resumen).
//
// Documentación: https://docs.claude.com/en/api/messages · precios: https://claude.com/pricing

import Big from "big.js";
import type { ContextoTarea } from "./ingesta.ts";
import { aDecimal, jsonExacto } from "./json.ts";

export const URL_MESSAGES = "https://api.anthropic.com/v1/messages";
export const VERSION_API = "2023-06-01";
export const MODELO_PORQUE = "claude-haiku-5-5";
export const MODELO_RESUMEN = "claude-sonnet-5-5";
export const TOPE_POR_DEFECTO = "10";
export const CAUSA_NO_CONFIRMADA = "Causa no confirmada: los titulares guardados no explican este movimiento.";

// ───────────────────────────── Precios y costo ─────────────────────────────

interface TarifaModelo {
  /** US$ por millón de tokens. */
  entrada: string;
  salida: string;
  /** Tarifa para prompts largos (Haiku 5.5 cobra distinto por encima de 100K tokens de entrada). */
  largo?: { desdeTokens: number; entrada: string; salida: string };
}

/** Tarifas de la API de Anthropic (primera parte), consultadas el 15 oct 2026. */
export const TARIFAS: Readonly<Record<string, TarifaModelo>> = {
  "claude-haiku-5-5": { entrada: "0.10", salida: "0.50", largo: { desdeTokens: 100_000, entrada: "0.50", salida: "2.50" } },
  "claude-sonnet-5-5": { entrada: "2.00", salida: "10.00" },
};

export interface UsoTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Costo en US$ con 6 decimales (numeric(12,6)), redondeado hacia arriba para no subestimar el gasto. */
export function calcularCosto(modelo: string, uso: UsoTokens): string {
  const t = TARIFAS[modelo];
  if (!t) throw new Error(`Sin tarifa conocida para el modelo ${modelo}: no se llama para no gastar sin medir`);
  const escritura = uso.cache_creation_input_tokens ?? 0;
  const lectura = uso.cache_read_input_tokens ?? 0;
  const totalEntrada = uso.input_tokens + escritura + lectura;
  const tarifa = t.largo && totalEntrada > t.largo.desdeTokens ? t.largo : t;
  const pe = new Big(tarifa.entrada);
  const costo = new Big(uso.input_tokens)
    .times(pe)
    .plus(new Big(escritura).times(pe).times("1.25"))
    .plus(new Big(lectura).times(pe).times("0.1"))
    .plus(new Big(uso.output_tokens).times(tarifa.salida))
    .div(1_000_000);
  return costo.toFixed(6, Big.roundUp);
}

// ───────────────────────────── Tope mensual ─────────────────────────────

export interface EstadoTope {
  tope: string;
  gasto: string;
  alcanzado: boolean;
  advertencia?: string;
}

export function leerTope(valor: string | undefined): { tope: string; advertencia?: string } {
  if (valor === undefined || valor.trim() === "") return { tope: TOPE_POR_DEFECTO };
  const d = aDecimal(valor);
  if (d === null || new Big(d).lt(0)) {
    return { tope: TOPE_POR_DEFECTO, advertencia: `IA_TOPE_MENSUAL_USD inválido («${valor}»); se usa US$${TOPE_POR_DEFECTO}` };
  }
  return { tope: d };
}

export async function estadoTope(ctx: ContextoTarea): Promise<EstadoTope> {
  const { tope, advertencia } = leerTope(ctx.entorno("IA_TOPE_MENSUAL_USD"));
  const crudo = await ctx.rpc<string | null>("gasto_ia_mes", { p_ahora: ctx.ahora.toISOString() });
  const gasto = aDecimal(crudo ?? "0") ?? "0";
  return { tope, gasto, alcanzado: new Big(gasto).gte(tope), advertencia };
}

export function sumar(a: string, b: string): string {
  return new Big(a).plus(b).toFixed();
}

// ───────────────────────────── Llamada a la API ─────────────────────────────

export interface PedidoClaude {
  modelo: string;
  sistema: string;
  mensaje: string;
  esquema: Record<string, unknown>;
  maxTokens: number;
  esfuerzo: "low" | "medium" | "high";
  timeoutMs?: number;
}

export type ResultadoClaude =
  | { ok: true; json: unknown; uso: UsoTokens; costo: string; modelo: string }
  | { ok: false; motivo: string; uso: UsoTokens; costo: string; modelo: string };

function entero(v: unknown): number {
  const s = typeof v === "string" || typeof v === "number" ? String(v) : "0";
  return /^\d+$/.test(s) ? Number.parseInt(s, 10) : 0;
}

/** Interpreta el cuerpo de la respuesta de /v1/messages (texto JSON). Pura: se prueba sin red. */
export function interpretarRespuesta(cuerpo: string, modeloPedido: string): ResultadoClaude {
  // deno-lint-ignore no-explicit-any
  const r = jsonExacto<any>(cuerpo);
  const modelo = typeof r?.model === "string" && TARIFAS[r.model] ? r.model : modeloPedido;
  const uso: UsoTokens = {
    input_tokens: entero(r?.usage?.input_tokens),
    output_tokens: entero(r?.usage?.output_tokens),
    cache_creation_input_tokens: entero(r?.usage?.cache_creation_input_tokens),
    cache_read_input_tokens: entero(r?.usage?.cache_read_input_tokens),
  };
  const costo = calcularCosto(modelo, uso);
  const base = { uso, costo, modelo };
  if (r?.stop_reason === "refusal") return { ok: false, motivo: "la IA declinó la solicitud", ...base };
  if (r?.stop_reason === "max_tokens") return { ok: false, motivo: "respuesta cortada por max_tokens", ...base };
  const bloques: unknown[] = Array.isArray(r?.content) ? r.content : [];
  const texto = bloques
    // deno-lint-ignore no-explicit-any
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    // deno-lint-ignore no-explicit-any
    .map((b: any) => b.text as string)
    .join("")
    .trim();
  if (!texto) return { ok: false, motivo: "respuesta sin texto", ...base };
  try {
    // jsonExacto: si la IA escribiera un número JSON, llega como texto y no pasa por float.
    return { ok: true, json: jsonExacto(texto), ...base };
  } catch {
    return { ok: false, motivo: "la respuesta no es JSON válido", ...base };
  }
}

export function cuerpoPedido(p: PedidoClaude): Record<string, unknown> {
  return {
    model: p.modelo,
    max_tokens: p.maxTokens,
    system: p.sistema,
    messages: [{ role: "user", content: p.mensaje }],
    output_config: { effort: p.esfuerzo, format: { type: "json_schema", schema: p.esquema } },
  };
}

/** POST a la Messages API con ctx.api (sin SDK). Un error HTTP se propaga (no se cobra). */
export async function llamarClaude(ctx: ContextoTarea, clave: string, p: PedidoClaude): Promise<ResultadoClaude> {
  if (!TARIFAS[p.modelo]) throw new Error(`Sin tarifa conocida para el modelo ${p.modelo}`);
  const r = await ctx.api(URL_MESSAGES, {
    metodo: "POST",
    encabezados: { "x-api-key": clave, "anthropic-version": VERSION_API, "content-type": "application/json" },
    cuerpo: cuerpoPedido(p),
    timeoutMs: p.timeoutMs ?? 90_000,
  });
  return interpretarRespuesta(r.texto, p.modelo);
}

// ───────────────────────────── Números: ninguno inventado ─────────────────────────────

const TOKEN_NUMERICO = /\d(?:[\d.,]*\d)?/g;

function canonico(s: string): string | null {
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return new Big(s).toFixed(); // big.js quita ceros sobrantes: "2.50" → "2.5", "007" → "7"
}

/** Lecturas posibles de un token: «4,107.90» (miles con coma) o «2,5» (decimal con coma). */
export function lecturasNumero(token: string): string[] {
  const out = new Set<string>();
  const a = canonico(token.replace(/,/g, ""));
  if (a) out.add(a);
  if ((token.match(/,/g)?.length ?? 0) <= 1) {
    const b = canonico(token.replace(/\./g, "").replace(",", "."));
    if (b) out.add(b);
  }
  return [...out];
}

export function tokensNumericos(texto: string): string[] {
  return texto.match(TOKEN_NUMERICO) ?? [];
}

/** Conjunto de números que la IA puede citar: los de la entrada, y sus redondeos a 0–3 decimales. */
export function numerosPermitidos(entrada: string): Set<string> {
  const permitidos = new Set<string>();
  for (const t of tokensNumericos(entrada)) {
    for (const l of lecturasNumero(t)) {
      permitidos.add(l);
      const n = new Big(l);
      for (let d = 0; d <= 3; d++) permitidos.add(new Big(n.toFixed(d, Big.roundHalfUp)).toFixed());
    }
  }
  return permitidos;
}

/** Tokens numéricos del texto que no aparecen en la entrada. Vacío = el texto no inventa cifras. */
export function numerosAjenos(texto: string, permitidos: Set<string>): string[] {
  return tokensNumericos(texto).filter((t) => !lecturasNumero(t).some((l) => permitidos.has(l)));
}

// ───────────────────────────── Validación de la salida ─────────────────────────────

export interface Titular {
  id?: number | string;
  titular: string;
  url: string;
  medio?: string;
  fecha?: string;
  pais?: string | null;
  categoria?: string;
}

export interface FuenteTexto {
  titulo: string;
  url: string;
}

export interface ContextoValidacion {
  permitidos: Set<string>;
  /** url → titular guardado. */
  enlaces: Map<string, string>;
}

export type Validacion<T> = { ok: true; valor: T } | { ok: false; motivo: string };

const PROHIBIDAS = /\b(compre|compren|venda|vendan|invierta|inviertan|recomend\w*|aconsej\w*|deber[íi]a[ns]? (comprar|vender|invertir))\b/i;
const ENLACE_EN_TEXTO = /https?:\/\/|www\./i;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clavesExactas(o: Record<string, unknown>, claves: string[]): boolean {
  const k = Object.keys(o).sort();
  return k.length === claves.length && [...claves].sort().every((c, i) => c === k[i]);
}

export function contarOraciones(texto: string): number {
  // «EE. UU.» y otras siglas cortas no cortan oración.
  const limpio = texto.replace(/\b([A-ZÁÉÍÓÚÑ]{1,3})\.(?=\s)/g, "$1");
  return limpio.split(/[.!?…]+(?=\s|$)/).filter((s) => s.trim().length > 0).length;
}

function revisarTexto(campo: string, v: unknown, max: number, ctx: ContextoValidacion, maxOraciones?: number): string | null {
  if (typeof v !== "string") return `${campo}: no es texto`;
  const t = v.trim();
  if (!t) return `${campo}: vacío`;
  if (t.length > max) return `${campo}: más de ${max} caracteres`;
  if (ENLACE_EN_TEXTO.test(t)) return `${campo}: trae un enlace dentro del texto`;
  if (PROHIBIDAS.test(t)) return `${campo}: lenguaje de recomendación`;
  if (maxOraciones !== undefined && contarOraciones(t) > maxOraciones) return `${campo}: más de ${maxOraciones} oraciones`;
  const ajenos = numerosAjenos(t, ctx.permitidos);
  if (ajenos.length) return `${campo}: cifras que no están en los datos (${ajenos.join(", ")})`;
  return null;
}

function revisarUrl(campo: string, v: unknown, ctx: ContextoValidacion): string | null {
  if (typeof v !== "string") return `${campo}: no es texto`;
  if (!ctx.enlaces.has(v)) return `${campo}: enlace que no está en la lista entregada`;
  return null;
}

export interface Porque {
  explicado: boolean;
  texto: string;
  fuentes: FuenteTexto[];
}

export function validarPorque(json: unknown, ctx: ContextoValidacion): Validacion<Porque> {
  if (!esObjeto(json) || !clavesExactas(json, ["explicado", "texto", "fuentes"])) return { ok: false, motivo: "estructura distinta a la pedida" };
  if (typeof json.explicado !== "boolean") return { ok: false, motivo: "explicado: no es booleano" };
  if (!Array.isArray(json.fuentes)) return { ok: false, motivo: "fuentes: no es lista" };
  if (!json.explicado) return { ok: true, valor: { explicado: false, texto: CAUSA_NO_CONFIRMADA, fuentes: [] } };
  const p = revisarTexto("texto", json.texto, 400, ctx, 2);
  if (p) return { ok: false, motivo: p };
  if (json.fuentes.length < 1 || json.fuentes.length > 3) return { ok: false, motivo: "fuentes: se esperan de 1 a 3" };
  const fuentes: FuenteTexto[] = [];
  for (const f of json.fuentes) {
    if (!esObjeto(f) || !clavesExactas(f, ["url"])) return { ok: false, motivo: "fuentes: estructura distinta a la pedida" };
    const u = revisarUrl("fuentes.url", f.url, ctx);
    if (u) return { ok: false, motivo: u };
    if (!fuentes.some((x) => x.url === f.url)) fuentes.push({ titulo: ctx.enlaces.get(f.url as string)!, url: f.url as string });
  }
  return { ok: true, valor: { explicado: true, texto: (json.texto as string).trim(), fuentes } };
}

export interface ItemCinco {
  titulo: string;
  resumen: string;
  porque: string;
  y_que: string;
  url: string;
}

export function validarCinco(json: unknown, ctx: ContextoValidacion): Validacion<ItemCinco[]> {
  if (!esObjeto(json) || !clavesExactas(json, ["items"]) || !Array.isArray(json.items)) return { ok: false, motivo: "estructura distinta a la pedida" };
  if (json.items.length < 1 || json.items.length > 5) return { ok: false, motivo: "items: se esperan de 1 a 5" };
  const items: ItemCinco[] = [];
  for (const [i, it] of json.items.entries()) {
    if (!esObjeto(it) || !clavesExactas(it, ["titulo", "resumen", "porque", "y_que", "url"])) {
      return { ok: false, motivo: `items[${i}]: estructura distinta a la pedida` };
    }
    const problema =
      revisarTexto(`items[${i}].titulo`, it.titulo, 140, ctx, 1) ??
      revisarTexto(`items[${i}].resumen`, it.resumen, 600, ctx, 3) ??
      revisarTexto(`items[${i}].porque`, it.porque, 320, ctx, 2) ??
      revisarTexto(`items[${i}].y_que`, it.y_que, 320, ctx, 2) ??
      revisarUrl(`items[${i}].url`, it.url, ctx);
    if (problema) return { ok: false, motivo: problema };
    if (items.some((x) => x.url === it.url)) return { ok: false, motivo: `items[${i}]: enlace repetido` };
    items.push({
      titulo: (it.titulo as string).trim(),
      resumen: (it.resumen as string).trim(),
      porque: (it.porque as string).trim(),
      y_que: (it.y_que as string).trim(),
      url: it.url as string,
    });
  }
  return { ok: true, valor: items };
}

export const ESTADOS_CONFLICTO = ["ESCALA", "TENSIÓN", "TREGUA", "BAJA INTENSIDAD"] as const;
export type EstadoConflicto = (typeof ESTADOS_CONFLICTO)[number];

export interface Conflicto {
  conflicto: string;
  pais: string;
  estado: EstadoConflicto;
  que_paso: string;
  mercado: string;
  url: string;
}

export function validarGuerras(json: unknown, ctx: ContextoValidacion): Validacion<Conflicto[]> {
  if (!esObjeto(json) || !clavesExactas(json, ["conflictos"]) || !Array.isArray(json.conflictos)) {
    return { ok: false, motivo: "estructura distinta a la pedida" };
  }
  if (json.conflictos.length > 8) return { ok: false, motivo: "conflictos: más de 8" };
  const lista: Conflicto[] = [];
  for (const [i, c] of json.conflictos.entries()) {
    if (!esObjeto(c) || !clavesExactas(c, ["conflicto", "pais", "estado", "que_paso", "mercado", "url"])) {
      return { ok: false, motivo: `conflictos[${i}]: estructura distinta a la pedida` };
    }
    if (typeof c.estado !== "string" || !(ESTADOS_CONFLICTO as readonly string[]).includes(c.estado)) {
      return { ok: false, motivo: `conflictos[${i}].estado: debe ser ${ESTADOS_CONFLICTO.join(" / ")}` };
    }
    if (typeof c.pais !== "string" || c.pais.length > 60) return { ok: false, motivo: `conflictos[${i}].pais: inválido` };
    const problema =
      revisarTexto(`conflictos[${i}].conflicto`, c.conflicto, 100, ctx, 1) ??
      (c.pais.trim() ? revisarTexto(`conflictos[${i}].pais`, c.pais, 60, ctx) : null) ??
      revisarTexto(`conflictos[${i}].que_paso`, c.que_paso, 400, ctx, 2) ??
      revisarTexto(`conflictos[${i}].mercado`, c.mercado, 300, ctx, 2) ??
      revisarUrl(`conflictos[${i}].url`, c.url, ctx);
    if (problema) return { ok: false, motivo: problema };
    lista.push({
      conflicto: (c.conflicto as string).trim(),
      pais: c.pais.trim(),
      estado: c.estado as EstadoConflicto,
      que_paso: (c.que_paso as string).trim(),
      mercado: (c.mercado as string).trim(),
      url: c.url as string,
    });
  }
  return { ok: true, valor: lista };
}

// ───────────────────────────── Esquemas JSON para output_config.format ─────────────────────────────

const texto = { type: "string" } as const;

export const ESQUEMA_PORQUE = {
  type: "object",
  additionalProperties: false,
  required: ["explicado", "texto", "fuentes"],
  properties: {
    explicado: { type: "boolean" },
    texto,
    fuentes: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["url"], properties: { url: texto } },
    },
  },
};

export const ESQUEMA_CINCO = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titulo", "resumen", "porque", "y_que", "url"],
        properties: { titulo: texto, resumen: texto, porque: texto, y_que: texto, url: texto },
      },
    },
  },
};

export const ESQUEMA_GUERRAS = {
  type: "object",
  additionalProperties: false,
  required: ["conflictos"],
  properties: {
    conflictos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["conflicto", "pais", "estado", "que_paso", "mercado", "url"],
        properties: {
          conflicto: texto,
          pais: texto,
          estado: { type: "string", enum: [...ESTADOS_CONFLICTO] },
          que_paso: texto,
          mercado: texto,
          url: texto,
        },
      },
    },
  },
};

// ───────────────────────────── Armado del mensaje (solo datos guardados) ─────────────────────────────

export interface DatoSerie {
  serie_id: string;
  nombre: string;
  unidad: string;
  valor: string;
  cambio?: string | null;
  cambio_pct?: string | null;
  fecha_dato: string;
  hora_dato?: string | null;
  fuente: string;
  sustituto_de?: string | null;
  categoria?: string;
}

export function lineaDato(d: DatoSerie): string {
  const partes = [`${d.nombre} [${d.serie_id}]`, `valor ${d.valor} ${d.unidad}`];
  if (d.cambio) partes.push(`cambio ${d.cambio}`);
  if (d.cambio_pct) partes.push(`cambio % ${d.cambio_pct}`);
  partes.push(`fecha ${d.fecha_dato}${d.hora_dato ? ` ${d.hora_dato}` : ""}`, `fuente ${d.fuente}`);
  if (d.sustituto_de) partes.push(`sustituto de: ${d.sustituto_de}`);
  return `- ${partes.join(" · ")}`;
}

export function lineaTitular(t: Titular): string {
  const meta = [t.fecha, t.medio, t.pais].filter(Boolean).join(" · ");
  return `- ${t.titular}${meta ? ` (${meta})` : ""} — ${t.url}`;
}

export function contextoDe(mensaje: string, titulares: Titular[]): ContextoValidacion {
  return { permitidos: numerosPermitidos(mensaje), enlaces: new Map(titulares.map((t) => [t.url, t.titular])) };
}

export const REGLAS_COMUNES = [
  "Escribe en español neutro, claro y breve.",
  "Usa SOLO los datos y titulares del mensaje. No agregues hechos, cifras, fechas ni porcentajes que no estén escritos ahí.",
  "No escribas enlaces dentro del texto: los enlaces van solo en los campos url, copiados exactamente de la lista.",
  "No des recomendaciones de inversión ni digas qué comprar, vender o hacer.",
  "Responde únicamente con el JSON pedido.",
].join("\n");
