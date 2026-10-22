// Arma lo que muestran los paneles de mercado a partir de filas ya guardadas (sin red, sin float para cifras).
// Solo formatea y empareja: si un dato no está, el ítem dice «sin datos»; nunca rellena.

import Big from "big.js";
import type { DatosSello } from "../componentes/SelloFuente";
import { cifra, cifraConSigno, direccion, fechaCorta, puntosBasicos, type Direccion } from "./formato";
import { frescura } from "./frescura";
import { esMercado, frescuraIntradia, type Mercado } from "./mercados";

export interface SerieMercado {
  id: string;
  nombre: string;
  nombre_corto: string;
  categoria: string;
  unidad: string;
  moneda: string | null;
  fuente_id: string;
  frecuencia: string;
  max_antiguedad_min: number;
  orden: number;
  sustituto_de: string | null;
  meta: { simbolo?: string; mercado?: string } & Record<string, unknown>;
  activa: boolean;
}

export interface ObsMercado {
  serie_id: string;
  valor: string;
  cambio: string | null;
  cambio_pct: string | null;
  cambio_origen: string;
  fecha_dato: string;
  hora_dato: string | null;
  recogido_en: string;
  url_dato: string | null;
  estado: string;
  fuente_id: string;
}

export interface FuenteMercado {
  id: string;
  nombre: string;
  url: string;
}

export interface Explicacion {
  serie_id: string | null;
  texto: string;
  fuentes: { titulo?: string; url?: string }[];
  fecha: string;
}

export interface PuntoIntradia {
  serie_id: string;
  valor: string;
  fecha_dato: string;
  hora_dato: string;
}

export type EstadoItem = "al_dia" | "cerrado" | "desactualizado" | "sin_datos" | "no_disponible";

export interface ItemMercado {
  id: string;
  nombre: string;
  nombreCorto: string;
  unidad: string;
  sustitutoDe: string | null;
  estado: EstadoItem;
  /** Cifras ya formateadas (texto exacto redondeado), o null si no hay dato. */
  valor: string | null;
  cambio: string | null;
  cambioPct: string | null;
  direccion: Direccion;
  /** «cierre del vie 16 oct» con el mercado cerrado. */
  etiquetaCierre: string | null;
  /** La fuente no da hora: la que se ve es la de la consulta (FMP quote-short). */
  horaEsConsulta: boolean;
  horaDato: string | null;
  sello: DatosSello | null;
  mercado: Mercado | null;
  fuenteId: string;
}

/** Decimales con que se muestra cada serie. */
export function decimales(serie: Pick<SerieMercado, "id" | "categoria">): number {
  if (serie.id === "EURUSD") return 4;
  if (serie.id === "BTC") return 0;
  return 2;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function etiquetaCierre(fechaDato: string): string {
  const d = new Date(`${fechaDato}T00:00:00Z`).getUTCDay();
  return `cierre del ${DIAS[d]} ${fechaCorta(fechaDato, false)}`;
}

export interface ContextoItem {
  ahora: Date;
  fuentes: Map<string, FuenteMercado>;
  /** Tareas cuya última corrida falló, por fuente. */
  fuentesConFallo?: Set<string>;
}

export function armarItem(serie: SerieMercado, obs: ObsMercado | undefined, ctx: ContextoItem): ItemMercado {
  const mercado = esMercado(serie.meta?.mercado) ? serie.meta.mercado : null;
  const base: ItemMercado = {
    id: serie.id,
    nombre: serie.nombre,
    nombreCorto: serie.nombre_corto,
    unidad: serie.unidad,
    sustitutoDe: serie.sustituto_de,
    estado: serie.activa ? "sin_datos" : "no_disponible",
    valor: null,
    cambio: null,
    cambioPct: null,
    direccion: "igual",
    etiquetaCierre: null,
    horaEsConsulta: serie.fuente_id === "fmp",
    horaDato: null,
    sello: null,
    mercado,
    fuenteId: serie.fuente_id,
  };
  if (!obs) return base;

  const dec = decimales(serie);
  const esTasa = serie.categoria === "tasa" || serie.unidad === "%";
  let estado: EstadoItem;
  if (serie.frecuencia === "intradia" && mercado && obs.hora_dato) {
    estado = frescuraIntradia(new Date(obs.hora_dato), serie.max_antiguedad_min, mercado, ctx.ahora).estado;
  } else {
    estado = frescura(obs, serie.max_antiguedad_min, ctx.ahora).desactualizado ? "desactualizado" : "al_dia";
  }
  const fuente = ctx.fuentes.get(obs.fuente_id);
  return {
    ...base,
    estado,
    valor: cifra(obs.valor, dec),
    cambio: obs.cambio === null ? null : esTasa ? puntosBasicos(obs.cambio) : cifraConSigno(obs.cambio, dec),
    cambioPct: obs.cambio_pct === null || esTasa ? null : `${cifraConSigno(obs.cambio_pct, 2)}%`,
    direccion: direccion(obs.cambio),
    etiquetaCierre: estado === "cerrado" ? etiquetaCierre(obs.fecha_dato) : null,
    horaDato: obs.hora_dato,
    // quote-short de FMP no trae hora (se usa la de la consulta); Cboe, BCE y FRED sí traen la del dato.
    horaEsConsulta: obs.fuente_id === "fmp",
    fuenteId: obs.fuente_id,
    sello: {
      fuente: fuente?.nombre ?? obs.fuente_id,
      url: obs.url_dato ?? fuente?.url ?? null,
      fechaDato: obs.fecha_dato,
      verificadoEn: obs.recogido_en,
      desactualizado: estado === "desactualizado",
      ultimaCorridaFallo: ctx.fuentesConFallo?.has(obs.fuente_id) ?? false,
    },
  };
}

/** La explicación «porqué» más reciente de la serie en las últimas 24 h, o null. */
export function porqueReciente(explicaciones: Explicacion[], serieId: string, ahora: Date): Explicacion | null {
  const limite = ahora.getTime() - 24 * 3_600_000;
  return (
    explicaciones
      .filter((e) => e.serie_id === serieId && new Date(e.fecha).getTime() >= limite)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null
  );
}

/** Puntos del último día de negociación de la serie, en orden de hora. */
export function puntosDelDia(puntos: PuntoIntradia[], serieId: string): PuntoIntradia[] {
  const propios = puntos.filter((p) => p.serie_id === serieId);
  const dia = propios.map((p) => p.fecha_dato).sort().at(-1);
  return propios.filter((p) => p.fecha_dato === dia).sort((a, b) => a.hora_dato.localeCompare(b.hora_dato));
}

/** Trazo SVG de una línea de valores (Number solo para ubicar los puntos en pantalla). */
export function trazoSparkline(valores: string[], ancho: number, alto: number, margen = 2): string | null {
  if (valores.length < 2) return null;
  const nums = valores.map(Number);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const rango = max - min || 1;
  const x = (i: number) => margen + (i * (ancho - 2 * margen)) / (nums.length - 1);
  const y = (v: number) => margen + (alto - 2 * margen) * (1 - (v - min) / rango);
  return nums.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
}

// ───────────────────────── Mi lista y Mis posiciones (acciones de EE. UU.) ─────────────────────────

/** Formato de símbolo que acepta Mi lista (letras y punto, como BRK.B). */
export const RE_SIMBOLO_LISTA = /^[A-Z.]{1,6}$/;
/** Tope de símbolos en Mi lista (la ingesta lee hasta 50 entre lista y posiciones). */
export const MAXIMO_LISTA = 40;
/** Minutos de bolsa abierta tras los que una cotización de la lista se marca «dato viejo» (15 diferido + 5 de ciclo + margen). */
export const MAX_MIN_COTIZACION_LISTA = 45;

/** Lo que escribe Mena → símbolo válido, o un error que dice cómo arreglarlo. */
export function validarSimboloLista(texto: unknown): { simbolo: string } | { error: string } {
  const s = String(texto ?? "")
    .trim()
    .replace(/^\$/, "")
    .toUpperCase();
  if (!s) return { error: "Escribe el símbolo de la acción o ETF, por ejemplo AAPL o VOO." };
  if (/\s/.test(s)) return { error: "Escribe un solo símbolo, sin espacios (ej.: MSFT)." };
  if (/\d/.test(s)) return { error: "Los símbolos de EE. UU. no llevan números: usa solo letras (ej.: NVDA)." };
  if (s.length > 6)
    return { error: `«${s.slice(0, 12)}» es muy largo: el símbolo tiene de 1 a 6 letras (ej.: GOOGL). Si escribiste el nombre de la empresa, busca su símbolo.` };
  if (!RE_SIMBOLO_LISTA.test(s)) return { error: "Usa solo letras y, si hace falta, un punto (ej.: BRK.B)." };
  return { simbolo: s };
}

/** Fila de mercado.cotizaciones_cartera (cifras como texto). */
export interface CotizacionLista {
  simbolo: string;
  fecha: string;
  precio: string;
  cierre_anterior: string | null;
  cambio: string | null;
  cambio_pct: string | null;
  maximo: string | null;
  minimo: string | null;
  hora_dato: string | null;
  fuente: string;
  url_dato: string | null;
  recogido_en: string;
}

export interface VistaCotizacion {
  precio: string;
  /** Cambio del día por acción en US$ y en %, ya con signo. */
  cambio: string | null;
  cambioPct: string | null;
  /** Cambio por acción sin formato (texto exacto), para multiplicar por la cantidad. */
  cambioExacto: string | null;
  direccion: Direccion;
  maximo: string | null;
  minimo: string | null;
  /** 0–1: dónde está el precio entre el mínimo y el máximo del día (solo para dibujar la barra). */
  posicionRango: number | null;
  estado: "al_dia" | "cerrado" | "desactualizado";
  etiquetaCierre: string | null;
  horaDato: string | null;
  sello: DatosSello;
}

/** La cotización más reciente de cada símbolo (las filas pueden venir en cualquier orden). */
export function ultimaPorSimbolo(filas: CotizacionLista[]): Map<string, CotizacionLista> {
  const m = new Map<string, CotizacionLista>();
  for (const f of filas) {
    const ya = m.get(f.simbolo);
    if (!ya || f.fecha > ya.fecha || (f.fecha === ya.fecha && f.recogido_en > ya.recogido_en)) m.set(f.simbolo, f);
  }
  return m;
}

/** Cotización → lo que se ve: cifras redondeadas, rango del día, frescura y sello. Nada se rellena. */
export function vistaCotizacion(c: CotizacionLista, ctx: ContextoItem): VistaCotizacion {
  const precio = new Big(c.precio);
  // Cambio: el de la fuente; si no vino, precio − cierre anterior (ambos de la misma fuente).
  const anterior = c.cierre_anterior !== null && new Big(c.cierre_anterior).gt(0) ? new Big(c.cierre_anterior) : null;
  const cambio = c.cambio !== null ? new Big(c.cambio) : anterior ? precio.minus(anterior) : null;
  const pct = c.cambio_pct !== null ? new Big(c.cambio_pct) : cambio && anterior ? cambio.div(anterior).times(100) : null;
  let posicionRango: number | null = null;
  if (c.maximo !== null && c.minimo !== null) {
    const max = new Big(c.maximo);
    const min = new Big(c.minimo);
    if (max.gt(min)) {
      // Number solo para ubicar el punto en la barra.
      const p = Number(precio.minus(min).div(max.minus(min)).toFixed(4));
      posicionRango = Math.min(1, Math.max(0, p));
    } else if (max.eq(min)) posicionRango = 0.5;
  }
  const estado: VistaCotizacion["estado"] = c.hora_dato
    ? frescuraIntradia(new Date(c.hora_dato), MAX_MIN_COTIZACION_LISTA, "us_acciones", ctx.ahora).estado
    : frescura({ fecha_dato: c.fecha }, 4 * 1440, ctx.ahora).desactualizado
      ? "desactualizado"
      : "cerrado";
  const fuente = ctx.fuentes.get(c.fuente);
  const nombreFuente =
    c.fuente === "cboe" ? "Cboe · diferido 15 min" : c.fuente === "finnhub" ? "Finnhub · cierre" : (fuente?.nombre ?? c.fuente);
  return {
    precio: cifra(c.precio, 2),
    cambio: cambio === null ? null : cifraConSigno(cambio.toString(), 2),
    cambioPct: pct === null ? null : `${cifraConSigno(pct.toString(), 2)}%`,
    cambioExacto: cambio === null ? null : cambio.toString(),
    direccion: direccion(cambio === null ? null : cambio.toString()),
    maximo: c.maximo === null ? null : cifra(c.maximo, 2),
    minimo: c.minimo === null ? null : cifra(c.minimo, 2),
    posicionRango,
    estado,
    etiquetaCierre: estado === "cerrado" ? etiquetaCierre(c.fecha) : null,
    horaDato: c.hora_dato,
    sello: {
      fuente: nombreFuente,
      url: c.url_dato ?? fuente?.url ?? null,
      fechaDato: c.fecha,
      verificadoEn: c.recogido_en,
      desactualizado: estado === "desactualizado",
      ultimaCorridaFallo: ctx.fuentesConFallo?.has(c.fuente) ?? false,
    },
  };
}

/**
 * Contexto de Mi lista y Mis posiciones: el aviso «última lectura falló» de Cboe depende de la tarea que
 * de verdad lee estos símbolos (cotizaciones-lista), no de la de índices (cotizaciones-cboe).
 */
export function contextoLista(ctx: ContextoItem, estadoTareaLista: string | null | undefined): ContextoItem {
  const fallo = new Set([...(ctx.fuentesConFallo ?? [])].filter((f) => f !== "cboe"));
  if (estadoTareaLista === "error") fallo.add("cboe");
  return { ...ctx, fuentesConFallo: fallo };
}

export interface ElementoLista {
  simbolo: string;
  nota: string;
  orden: number;
}

export interface FilaLista {
  simbolo: string;
  nota: string;
  cotizacion: VistaCotizacion | null;
  /** «Cboe no publica este símbolo» (marcado en las últimas 24 h y sin cotización más nueva). */
  sinCotizacion: string | null;
}

export interface MarcaSinCotizacion {
  simbolo: string;
  motivo: string;
  marcado_en: string;
}

function marcaVigente(marcas: MarcaSinCotizacion[], simbolo: string, c: CotizacionLista | undefined, ahora: Date): string | null {
  const limite = ahora.getTime() - 24 * 3_600_000;
  const m = marcas.find((x) => x.simbolo === simbolo && new Date(x.marcado_en).getTime() >= limite);
  if (!m) return null;
  return !c || new Date(c.recogido_en).getTime() < new Date(m.marcado_en).getTime() ? m.motivo : null;
}

export function armarLista(
  lista: ElementoLista[],
  cotizaciones: Map<string, CotizacionLista>,
  marcas: MarcaSinCotizacion[],
  ctx: ContextoItem,
): FilaLista[] {
  return [...lista]
    .sort((a, b) => a.orden - b.orden || a.simbolo.localeCompare(b.simbolo))
    .map((e) => {
      const c = cotizaciones.get(e.simbolo);
      const motivo = marcaVigente(marcas, e.simbolo, c, ctx.ahora);
      return { simbolo: e.simbolo, nota: e.nota, cotizacion: c && !motivo ? vistaCotizacion(c, ctx) : null, sinCotizacion: motivo };
    });
}

/** Activo de Renta Variable con símbolo, tal como sale de personal.activos (cifras en texto). */
export interface ActivoPosicion {
  id: string;
  nombre: string;
  simbolo: string;
  cantidad: string;
  /** Precio manual de Portafolio (se usa solo si no hay cotización). */
  precio: string;
  actualizado_en: string | null;
}

/** Base de costo calculada con el libro de transacciones (lib/capital/retorno · costoDe). */
export interface CostoActivo {
  costoTotal: Big;
}

export interface FilaPosicion {
  id: string;
  simbolo: string;
  nombre: string;
  cantidad: string;
  precio: string;
  origenPrecio: "mercado" | "manual";
  valor: string;
  /** Cambio del día de toda la posición (cantidad × cambio por acción). */
  dia: string | null;
  diaPct: string | null;
  direccionDia: Direccion;
  ganancia: string | null;
  gananciaPct: string | null;
  direccionGanancia: Direccion;
  cotizacion: VistaCotizacion | null;
  sinCotizacion: string | null;
  actualizadoEn: string | null;
}

export interface ResumenPosiciones {
  filas: FilaPosicion[];
  valor: string;
  dia: string | null;
  diaPct: string | null;
  direccionDia: Direccion;
  ganancia: string | null;
  gananciaPct: string | null;
  direccionGanancia: Direccion;
  /** Posiciones sin cambio del día (sin cotización): no entran en el total del día. */
  sinCambio: number;
  /** Posiciones sin compras anotadas: no entran en la ganancia contra el costo. */
  sinCosto: number;
  /** Posiciones valoradas con el precio manual de Portafolio. */
  conPrecioManual: number;
}

const pctTexto = (b: Big) => `${cifraConSigno(b.times(100).toString(), 2)}%`;

export function armarPosiciones(
  activos: ActivoPosicion[],
  cotizaciones: Map<string, CotizacionLista>,
  costos: Map<string, CostoActivo | null>,
  marcas: MarcaSinCotizacion[],
  ctx: ContextoItem,
): ResumenPosiciones {
  let valorTotal = new Big(0);
  let diaTotal = new Big(0);
  let baseDia = new Big(0);
  let conDia = 0;
  let ganTotal = new Big(0);
  let costoTotal = new Big(0);
  let conCosto = 0;
  let manual = 0;
  const filas = activos.map((a): FilaPosicion => {
    const c = cotizaciones.get(a.simbolo);
    const v = c ? vistaCotizacion(c, ctx) : null;
    const cantidad = new Big(a.cantidad);
    const precio = new Big(c ? c.precio : a.precio || "0");
    if (!c) manual++;
    const valor = cantidad.times(precio);
    valorTotal = valorTotal.plus(valor);
    let dia: Big | null = null;
    if (v?.cambioExacto) {
      dia = cantidad.times(v.cambioExacto);
      diaTotal = diaTotal.plus(dia);
      baseDia = baseDia.plus(valor.minus(dia));
      conDia++;
    }
    const costo = costos.get(a.id) ?? null;
    let ganancia: Big | null = null;
    let gananciaPct: Big | null = null;
    if (costo && costo.costoTotal.gt(0)) {
      ganancia = valor.minus(costo.costoTotal);
      gananciaPct = ganancia.div(costo.costoTotal);
      ganTotal = ganTotal.plus(ganancia);
      costoTotal = costoTotal.plus(costo.costoTotal);
      conCosto++;
    }
    return {
      id: a.id,
      simbolo: a.simbolo,
      nombre: a.nombre,
      cantidad: cifraCantidad(a.cantidad),
      precio: cifra(precio.toString(), 2),
      origenPrecio: c ? "mercado" : "manual",
      valor: cifra(valor.toString(), 2),
      dia: dia === null ? null : cifraConSigno(dia.toString(), 2),
      diaPct: v?.cambioPct ?? null,
      direccionDia: direccion(dia === null ? null : dia.toString()),
      ganancia: ganancia === null ? null : cifraConSigno(ganancia.toString(), 2),
      gananciaPct: gananciaPct === null ? null : pctTexto(gananciaPct),
      direccionGanancia: direccion(ganancia === null ? null : ganancia.toString()),
      cotizacion: v,
      sinCotizacion: c ? null : marcaVigente(marcas, a.simbolo, c, ctx.ahora),
      actualizadoEn: a.actualizado_en,
    };
  });
  return {
    filas,
    valor: cifra(valorTotal.toString(), 2),
    dia: conDia ? cifraConSigno(diaTotal.toString(), 2) : null,
    diaPct: conDia && baseDia.gt(0) ? pctTexto(diaTotal.div(baseDia)) : null,
    direccionDia: conDia ? direccion(diaTotal.toString()) : "igual",
    ganancia: conCosto ? cifraConSigno(ganTotal.toString(), 2) : null,
    gananciaPct: conCosto && costoTotal.gt(0) ? pctTexto(ganTotal.div(costoTotal)) : null,
    direccionGanancia: conCosto ? direccion(ganTotal.toString()) : "igual",
    sinCambio: activos.length - conDia,
    sinCosto: activos.length - conCosto,
    conPrecioManual: manual,
  };
}

/** Cantidad de acciones sin ceros de más: «10», «2.5», «1,250.125». */
export function cifraCantidad(texto: string): string {
  const fijo = new Big(texto).toFixed(6).replace(/\.?0+$/, "");
  const neg = fijo.startsWith("-");
  const [entero, frac] = (neg ? fijo.slice(1) : fijo).split(".");
  const cuerpo = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "−" : ""}${cuerpo}${frac ? `.${frac}` : ""}`;
}
