// Armado de las 4 ediciones POR REGLAS: plantillas fijas + datos de la base (mercado.boletin_datos).
// Ninguna IA. Cada cifra sale de una observación guardada con su fuente (enlace) y su fecha; si falta,
// la edición dice «no confirmado»; si es vieja según su antigüedad máxima, «dato viejo» con su fecha.
// No recomienda comprar ni vender nada.

import Big from "big.js";
import { esMercado, frescuraIntradia } from "../mercados.ts";
import { elegirConceptos, type TemaGlosario, titularQueMenciona } from "./diccionario.ts";
import {
  cifra,
  cifraConSigno,
  cuandoEs,
  datoDe,
  diaRD,
  direccionDe,
  enlaceSeguro,
  fechaConDia,
  fechaCorta,
  fechaLarga,
  horaRD,
  mesCorto,
  nombreMes,
  pctConSigno,
  puntosBasicos,
  sumarDias,
} from "./formato.ts";
import { EDICIONES } from "./horario.ts";
import { contarPalabras, textoPlano } from "./render.ts";
import type {
  DatosBoletin,
  Edicion,
  EstadoCifra,
  Fila,
  FondoGuardado,
  FotoDinero,
  FuenteRef,
  Item,
  NivelGuardado,
  ObsSerie,
  Seccion,
  TipoEdicion,
  TitularGuardado,
} from "./tipos.ts";

export interface OpcionesArmado {
  /** Dirección pública de la app (para enlazar «Tu dinero» y la edición). Opcional. */
  urlApp?: string | null;
  prueba?: boolean;
}

// ───────────────────────────── Catálogo de cifras ─────────────────────────────

interface Grupo {
  titulo: string;
  /** Ids de serie; «A|B» = A, y si A no tiene dato, B (sustituto). */
  ids: string[];
  /** true = solo se muestra la fila si hay dato (Europa y Asia «si existen series»). */
  siExiste?: boolean;
}

export const GRUPOS_MERCADOS: readonly Grupo[] = [
  { titulo: "Bolsas de EE. UU.", ids: ["IDX_SPX", "IDX_DJI", "IDX_IXIC", "IDX_RUT"] },
  { titulo: "Europa y Asia", ids: ["IDX_STOXX50E", "IDX_FTSE", "IDX_GDAXI", "IDX_N225", "IDX_HSI"], siExiste: true },
  { titulo: "Tesoro de EE. UU.", ids: ["UST_2A", "UST_10A"] },
  { titulo: "Dólar y monedas", ids: ["DXY|ETF_UUP", "EURUSD", "USDJPY"] },
  { titulo: "Energía", ids: ["BRENT", "WTI", "GAS_NATURAL"] },
  { titulo: "Metales", ids: ["ORO", "PLATA", "COBRE_CPER"] },
];

export const ETIQUETAS: Readonly<Record<string, string>> = {
  IDX_SPX: "S&P 500",
  IDX_DJI: "Dow Jones",
  IDX_IXIC: "Nasdaq",
  IDX_RUT: "Russell 2000",
  IDX_STOXX50E: "Euro Stoxx 50",
  IDX_FTSE: "FTSE 100 (Londres)",
  IDX_GDAXI: "DAX (Alemania)",
  IDX_N225: "Nikkei 225 (Japón)",
  IDX_HSI: "Hang Seng (Hong Kong)",
  UST_2A: "Tesoro a 2 años",
  UST_10A: "Tesoro a 10 años",
  DXY: "Índice dólar (DXY)",
  ETF_UUP: "Dólar (ETF UUP, sustituto del DXY)",
  EURUSD: "EUR/USD",
  USDJPY: "USD/JPY",
  BRENT: "Brent",
  WTI: "WTI",
  GAS_NATURAL: "Gas natural",
  ORO: "Oro",
  PLATA: "Plata",
  COBRE_CPER: "Cobre (ETF CPER)",
  USDDOP_COMPRA: "Dólar BCRD · compra",
  USDDOP_VENTA: "Dólar BCRD · venta",
  TPM_BCRD: "TPM del Banco Central",
  INFLACION_RD: "Inflación interanual RD",
  TASA_ACT_MN_PROMEDIO: "Activa promedio RD$",
  TASA_ACT_MN_TARJETA: "Tarjeta de crédito RD$",
  TASA_ACT_MN_CONSUMO: "Préstamo de consumo RD$",
  TASA_ACT_MN_HIPOTECARIA: "Hipotecaria RD$",
  TASA_PAS_MN_PROMEDIO: "Pasiva promedio RD$",
  TASA_PAS_MN_30D: "Depósito a 30 días RD$",
  TASA_PAS_MN_360D: "Depósito a un año RD$",
  TASA_PAS_ME_360D: "Depósito a un año US$",
  COMB_GASOLINA_PREMIUM: "Gasolina premium",
  COMB_GASOLINA_REGULAR: "Gasolina regular",
  COMB_GASOIL_OPTIMO: "Gasoil óptimo",
  COMB_GASOIL_REGULAR: "Gasoil regular",
  COMB_GLP: "Gas licuado (GLP)",
};

const COMBUSTIBLES = ["COMB_GASOLINA_PREMIUM", "COMB_GASOLINA_REGULAR", "COMB_GASOIL_OPTIMO", "COMB_GASOIL_REGULAR", "COMB_GLP"];
const TASAS_BANCOS: readonly [string, string][] = [
  ["Activas (lo que cobran)", "TASA_ACT_MN_PROMEDIO"],
  ["Activas (lo que cobran)", "TASA_ACT_MN_TARJETA"],
  ["Activas (lo que cobran)", "TASA_ACT_MN_CONSUMO"],
  ["Activas (lo que cobran)", "TASA_ACT_MN_HIPOTECARIA"],
  ["Pasivas (lo que pagan)", "TASA_PAS_MN_PROMEDIO"],
  ["Pasivas (lo que pagan)", "TASA_PAS_MN_30D"],
  ["Pasivas (lo que pagan)", "TASA_PAS_MN_360D"],
  ["Pasivas (lo que pagan)", "TASA_PAS_ME_360D"],
];
const SEMANA_ENERGIA = ["BRENT", "WTI", "GAS_NATURAL"];
const SEMANA_METALES = ["ORO", "PLATA", "COBRE_CPER"];

/** Umbral habitual de movimiento diario (%) por categoría, si la serie no tiene regla de alerta propia. */
export const UMBRAL_HABITUAL: Readonly<Record<string, string>> = {
  indice: "1",
  metal: "1.5",
  energia: "2",
  divisa: "0.5",
  tasa: "1.5",
  cripto: "3",
};

/** Números fijos de las plantillas (no son cifras del mercado): «Las 5 del día», «24 h», «30 días»… */
export const CONSTANTES_PLANTILLA = ["1", "2", "3", "4", "5", "10", "24", "30", "360", "365"];

export const NOMBRE_CORTO_EDICION: Record<TipoEdicion, string> = {
  am: "AM",
  cierre: "Cierre",
  finde: "Fin de semana",
  tasas: "Tasas RD",
};

// ───────────────────────────── Contexto del armado ─────────────────────────────

class Ctx {
  readonly ahora: Date;
  readonly hoy: string;
  readonly series = new Map<string, ObsSerie>();
  private readonly fuentes = new Map<string, FuenteRef>();
  private readonly faltan: string[] = [];
  readonly temas = new Set<TemaGlosario>();
  readonly catalogo: Map<string, { nombre: string; url: string }>;

  constructor(readonly d: DatosBoletin, readonly op: OpcionesArmado) {
    this.ahora = new Date(d.ahora);
    this.hoy = d.hoy;
    for (const s of d.series) this.series.set(s.serie_id, s);
    this.catalogo = new Map(d.fuentes.map((f) => [f.id, { nombre: f.nombre, url: f.url }]));
  }

  usarFuente(f: FuenteRef | null): void {
    if (!f) return;
    const clave = f.nombre.toLowerCase();
    if (!this.fuentes.has(clave)) this.fuentes.set(clave, f);
  }

  falta(texto: string): void {
    if (!this.faltan.includes(texto)) this.faltan.push(texto);
  }

  listaFuentes(): FuenteRef[] {
    return [...this.fuentes.values()];
  }

  /** Lo no confirmado; las series sin dato se juntan en una sola línea. */
  listaFaltan(): string[] {
    const sinDato = this.faltan.filter((x) => x.endsWith(": sin dato guardado.")).map((x) => x.slice(0, -": sin dato guardado.".length));
    const resto = this.faltan.filter((x) => !x.endsWith(": sin dato guardado."));
    return sinDato.length ? [`Sin dato guardado: ${sinDato.join(", ")}.`, ...resto] : resto;
  }

  /** Primera serie con dato de «A|B». */
  obs(id: string): ObsSerie | null {
    for (const x of id.split("|")) {
      const o = this.series.get(x);
      if (o) return o;
    }
    return null;
  }
}

// ───────────────────────────── Frescura y formato de una cifra ─────────────────────────────

/** Momento de referencia del dato: su hora exacta, o el fin del día del dato (como lib/frescura.ts). */
function momentoDelDato(o: Pick<ObsSerie, "fecha_dato" | "hora_dato">): Date {
  if (o.hora_dato) return new Date(o.hora_dato);
  const fin = new Date(`${o.fecha_dato}T00:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return fin;
}

/** ok · viejo · no_confirmado, con la misma lógica de frescura de la app (intradía: solo con el mercado abierto). */
export function estadoCifra(o: ObsSerie, ahora: Date): EstadoCifra {
  if (o.estado === "no_confirmado" || o.estado === "error") return "no_confirmado";
  if (o.estado === "desactualizado") return "viejo";
  const mercado = o.meta?.mercado;
  if (o.frecuencia === "intradia" && esMercado(mercado)) {
    return frescuraIntradia(momentoDelDato(o), o.max_antiguedad_min, mercado, ahora).estado === "desactualizado" ? "viejo" : "ok";
  }
  const minutos = Math.floor((ahora.getTime() - momentoDelDato(o).getTime()) / 60_000);
  return minutos > o.max_antiguedad_min ? "viejo" : "ok";
}

export function decimalesDe(o: Pick<ObsSerie, "serie_id" | "unidad">): number {
  if (o.serie_id === "EURUSD" || o.serie_id.startsWith("USDDOP_")) return 4;
  return 2;
}

const esTasa = (o: Pick<ObsSerie, "serie_id" | "unidad" | "categoria">) => o.unidad === "%" || o.categoria === "tasa";

export function nivelDe(o: Pick<ObsSerie, "serie_id" | "unidad" | "valor">, valor = o.valor): string {
  const v = cifra(valor, decimalesDe(o));
  if (o.unidad.startsWith("US$/") || o.unidad === "US$") return `US$${v}`;
  if (o.unidad.startsWith("RD$")) return `RD$${v}`;
  if (o.unidad === "%") return `${v} %`;
  return v;
}

/** Cambio diario: tasas en puntos básicos, lo demás en %. Un cambio de cero se dice «sin cambio». */
export function cambioDe(o: ObsSerie): string | null {
  const base = esTasa(o) ? o.cambio : (o.cambio_pct ?? o.cambio);
  if (base === null) return null;
  if (new Big(base).eq(0)) return "sin cambio";
  if (esTasa(o)) return puntosBasicos(o.cambio!);
  if (o.cambio_pct !== null) return pctConSigno(o.cambio_pct);
  return cifraConSigno(o.cambio!, decimalesDe(o));
}

/** Nombre corto de la fuente para cada fila (el nombre completo va en «Fuentes:» al final). */
export const FUENTE_CORTA: Readonly<Record<string, string>> = {
  fmp: "FMP",
  finnhub: "Finnhub",
  cboe: "Cboe",
  fred: "FRED",
  bce_fx: "BCE",
  ecb_api: "BCE",
  fed_h15: "Fed",
  tesoro_eeuu: "Tesoro EE. UU.",
  bcrd: "BCRD",
  bcrd_excel: "BCRD",
  micm: "MICM",
  simv: "SIMV",
  credito_publico: "Hacienda",
  excel_fondos: "Excel",
  afi_reservas: "AFI Reservas",
  manual: "carga manual",
};

function fechaDeObs(o: ObsSerie): string {
  if (o.frecuencia === "mensual") return mesCorto(o.fecha_dato);
  if (o.serie_id === "TPM_BCRD") return `rige desde ${mesCorto(o.fecha_dato)}`;
  if (o.frecuencia === "semanal") return `semana del ${fechaCorta(o.fecha_dato)}`;
  return fechaCorta(o.fecha_dato);
}

/** Fuente de la fila (nombre corto); la completa queda anotada para la lista «Fuentes:». */
function fuenteDe(c: Ctx, o: ObsSerie): FuenteRef {
  const url = enlaceSeguro(o.url_dato) ?? enlaceSeguro(o.fuente_url);
  c.usarFuente({ nombre: o.fuente_nombre, url: enlaceSeguro(o.fuente_url) ?? url });
  return { nombre: FUENTE_CORTA[o.fuente_id] ?? o.fuente_nombre, url };
}

function etiquetaDe(o: ObsSerie): string {
  return ETIQUETAS[o.serie_id] ?? o.nombre;
}

/** La fila de una serie (o una fila «no confirmado» si no hay dato). */
function filaSerie(c: Ctx, id: string, grupo?: string): Fila {
  const o = c.obs(id);
  const principal = id.split("|")[0];
  if (!o) {
    const etiqueta = ETIQUETAS[principal] ?? principal;
    c.falta(`${etiqueta}: sin dato guardado.`);
    return { etiqueta, grupo, nivel: null, cambio: null, dir: null, fecha: null, fuente: null, estado: "no_confirmado" };
  }
  const estado = estadoCifra(o, c.ahora);
  const fuente = fuenteDe(c, o);
  if (estado === "viejo") c.falta(`${etiquetaDe(o)}: dato viejo del ${fechaCorta(o.fecha_dato, true)}.`);
  if (estado === "no_confirmado") c.falta(`${etiquetaDe(o)}: la fuente lo marcó como no confirmado.`);
  const cambio = cambioDe(o);
  return {
    etiqueta: etiquetaDe(o),
    grupo,
    nivel: nivelDe(o),
    cambio,
    dir: direccionDe(esTasa(o) ? o.cambio : (o.cambio_pct ?? o.cambio)),
    fecha: fechaDeObs(o),
    fuente,
    estado,
  };
}

function hayDato(c: Ctx, id: string): boolean {
  return c.obs(id) !== null;
}

// ───────────────────────────── Piezas compartidas ─────────────────────────────

/** Ids (con sustituto resuelto) de las cifras clave de Mercados. */
function idsClave(c: Ctx): string[] {
  const ids: string[] = [];
  for (const g of GRUPOS_MERCADOS) for (const id of g.ids) {
    const o = c.obs(id);
    if (o) ids.push(o.serie_id);
  }
  return ids;
}

/** El dato del día: la cifra clave con el mayor |cambio %| (confirmada y no vieja). */
export function datoDelDia(c: Ctx, extra: string[] = ["USDDOP_VENTA"]): ObsSerie | null {
  let mejor: ObsSerie | null = null;
  for (const id of [...idsClave(c), ...extra]) {
    const o = c.series.get(id);
    if (!o || o.cambio_pct === null || estadoCifra(o, c.ahora) !== "ok") continue;
    if (!mejor || new Big(o.cambio_pct).abs().gt(new Big(mejor.cambio_pct!).abs())) mejor = o;
  }
  return mejor;
}

function textoDatoDelDia(o: ObsSerie | null): string | null {
  return o ? `${etiquetaDe(o)} ${pctConSigno(o.cambio_pct!)}` : null;
}

function movimiento(pct: string | null, decimales = 1): { verbo: string; cuanto: string } | null {
  if (pct === null) return null;
  const p = new Big(pct);
  const abs = p.abs().round(decimales, Big.roundHalfUp);
  if (abs.eq(0)) return { verbo: "quedó casi igual", cuanto: "" };
  return { verbo: p.gt(0) ? "subió" : "bajó", cuanto: ` ${abs.toFixed(decimales)} %` };
}

/** Frases del resumen (mismas reglas que «Hoy en 30 segundos»: solo cifras guardadas, si falta no sale). */
function frase(c: Ctx, id: string, alCierre = false): string | null {
  const o = c.series.get(id);
  if (!o || estadoCifra(o, c.ahora) === "no_confirmado") return null;
  const hoy = c.hoy;
  const viejo = estadoCifra(o, c.ahora) === "viejo" ? ` (dato viejo del ${fechaCorta(o.fecha_dato)})` : "";
  const m = movimiento(o.cambio_pct);
  switch (id) {
    case "IDX_SPX": {
      const cuando = cuandoEs(o.fecha_dato, hoy);
      if (!m) return `La bolsa de EE. UU. (S&P 500) está en ${cifra(o.valor, 2)} puntos (${datoDe(o.fecha_dato, hoy)})${viejo}.`;
      if (!m.cuanto) return `La bolsa de EE. UU. (S&P 500) se mantuvo casi igual ${cuando}, en ${cifra(o.valor, 2)} puntos${viejo}.`;
      return `La bolsa de EE. UU. (S&P 500) ${m.verbo}${m.cuanto} ${cuando} y ${alCierre ? "cerró" : "quedó"} en ${cifra(o.valor, 2)} puntos${viejo}.`;
    }
    case "USDDOP_VENTA": {
      const md = movimiento(o.cambio_pct, 2);
      return `El dólar en RD está en RD$${cifra(o.valor, 4)} para la venta según el Banco Central (${datoDe(o.fecha_dato, hoy)})${md && md.cuanto ? `; ${md.verbo}${md.cuanto}` : ""}${viejo}.`;
    }
    case "BRENT":
      return `El petróleo Brent está en US$${cifra(o.valor, 2)} el barril (${datoDe(o.fecha_dato, hoy)})${m && m.cuanto ? `; ${m.verbo}${m.cuanto}` : ""}${viejo}. Influye en los combustibles en RD.`;
    case "UST_10A": {
      let mov = "";
      if (o.cambio !== null) {
        const pb = new Big(o.cambio).times(100).round(0, Big.roundHalfUp);
        if (!pb.eq(0)) mov = `; ${pb.gt(0) ? "subió" : "bajó"} ${pb.abs().toFixed(0)} centésimas`;
      }
      return `La tasa del bono de EE. UU. a 10 años está en ${cifra(o.valor, 2)} % (${datoDe(o.fecha_dato, hoy)})${mov}${viejo}.`;
    }
    case "ORO":
      return `El oro está en US$${cifra(o.valor, 2)} la onza${m && m.cuanto ? ` y ${m.verbo}${m.cuanto}` : ""} (${datoDe(o.fecha_dato, hoy)})${viejo}.`;
    default:
      return null;
  }
}

function resumenDiario(c: Ctx, dia: ObsSerie | null, alCierre: boolean): string[] {
  const lineas: string[] = [];
  for (const id of ["IDX_SPX", "USDDOP_VENTA"]) {
    const f = frase(c, id, alCierre);
    if (f) lineas.push(f);
  }
  if (dia && dia.serie_id !== "IDX_SPX" && dia.serie_id !== "USDDOP_VENTA") {
    lineas.push(`El movimiento más grande entre las cifras clave: ${etiquetaDe(dia)}, ${pctConSigno(dia.cambio_pct!)} (${datoDe(dia.fecha_dato, c.hoy)}).`);
  }
  for (const id of ["BRENT", "UST_10A", "ORO"]) {
    if (lineas.length >= 3) break;
    if (dia?.serie_id === id) continue;
    const f = frase(c, id, alCierre);
    if (f) lineas.push(f);
  }
  if (!lineas.length) lineas.push("Todavía no hay cifras confirmadas para resumir el día.");
  return lineas.slice(0, 3);
}

function seccionAlertas(c: Ctx, desde: Date | null): Seccion {
  const lista = c.d.alertas.filter((a) => !desde || new Date(a.disparada_en) > desde);
  const titulo = desde ? "Alertas desde la AM" : "Alertas (últimas 24 h)";
  if (!lista.length) return { id: "alertas", titulo, items: [], vacio: "Sin alertas: ningún activo cruzó tus umbrales." };
  return {
    id: "alertas",
    titulo,
    items: lista.map((a) => {
      const fuente = a.fuente_nombre ? { nombre: a.fuente_nombre, url: enlaceSeguro(a.fuente_url) } : null;
      c.usarFuente(fuente);
      const id = [...c.catalogo.entries()].find(([, f]) => f.nombre === a.fuente_nombre)?.[0];
      return {
        texto: `${a.nombre_corto}: ${a.mensaje}`,
        url: fuente?.url ?? null,
        medio: fuente ? (id && FUENTE_CORTA[id]) || fuente.nombre : null,
        meta: `dato del ${fechaCorta(a.fecha_dato)}, sonó ${horaRD(a.disparada_en)}`,
      };
    }),
    recorte: { prioridad: 6, minimo: 3 },
  };
}

function umbralDe(c: Ctx, o: ObsSerie): Big {
  const propio = c.d.umbrales.find((u) => u.serie_id === o.serie_id)?.umbral;
  return new Big(propio ?? UMBRAL_HABITUAL[o.categoria] ?? "1");
}

/** Las 5 del día: los 5 movimientos más grandes frente a su umbral habitual, con su «¿Por qué?». */
function seccionCinco(c: Ctx): Seccion {
  const candidatas = idsClave(c)
    .map((id) => c.series.get(id)!)
    .filter((o) => o.cambio_pct !== null && estadoCifra(o, c.ahora) === "ok" && o.fecha_dato >= sumarDias(c.hoy, -4));
  const orden = candidatas
    .map((o) => ({ o, peso: new Big(o.cambio_pct!).abs().div(umbralDe(c, o)) }))
    .sort((a, b) => b.peso.cmp(a.peso) || a.o.serie_id.localeCompare(b.o.serie_id))
    .slice(0, 5);
  if (!orden.length) {
    return { id: "cinco", titulo: "Las 5 del día", filas: [], vacio: "No hay movimientos confirmados recientes para ordenar." };
  }
  return {
    id: "cinco",
    titulo: "Las 5 del día",
    intro: "Los movimientos más grandes frente a lo habitual de cada activo.",
    filas: orden.map(({ o }) => {
      const f = filaSerie(c, o.serie_id);
      const t = titularQueMenciona(o.serie_id, c.d.titulares, c.ahora, 24);
      if (t) c.usarFuente(fuenteMedio(c, t));
      return { ...f, porque: t ? { titular: t.titular, url: t.url, medio: t.medio } : null };
    }),
  };
}

function fuenteMedio(c: Ctx, t: TitularGuardado): FuenteRef {
  const cat = t.fuente_id ? c.catalogo.get(t.fuente_id) : undefined;
  return { nombre: t.medio, url: enlaceSeguro(cat?.url) ?? enlaceSeguro(t.url) };
}

function seccionMercados(c: Ctx): Seccion {
  const filas: Fila[] = [];
  for (const g of GRUPOS_MERCADOS) {
    for (const id of g.ids) {
      if (g.siExiste && !hayDato(c, id)) {
        c.falta(`${ETIQUETAS[id] ?? id}: sin dato guardado.`);
        continue;
      }
      filas.push(filaSerie(c, id, g.titulo));
    }
  }
  if (hayDato(c, "IDX_SPX") || hayDato(c, "UST_10A")) c.temas.add("bolsas").add("tesoro");
  if (hayDato(c, "DXY|ETF_UUP")) c.temas.add("dolar");
  if (hayDato(c, "BRENT")) c.temas.add("energia");
  if (hayDato(c, "ORO")) c.temas.add("metales");
  return { id: "mercados", titulo: "Mercados", intro: "Dato · nivel · cambio · fecha · fuente.", filas };
}

function ultimaSubasta(c: Ctx): Item | null {
  const e = c.d.emisiones.find((x) => x.fuente === "CREDITO_PUBLICO" || x.fuente === "BCRD");
  if (!e) return null;
  const fuente = fuenteEmision(c, e.fuente, e.url);
  c.temas.add("subastas");
  const cifras = [
    e.monto ? `monto ${e.moneda === "USD" ? "US$" : "RD$"}${cifra(e.monto, 0)}` : null,
    e.tasa ? `tasa de corte ${cifra(e.tasa, 2)} %` : null,
  ].filter(Boolean);
  return {
    texto: `Subasta del ${fechaCorta(e.fecha)}: ${e.instrumento ?? e.descripcion ?? e.numero}${cifras.length ? ` · ${cifras.join(" · ")}` : " · monto y tasa no confirmados (ver el documento oficial)"}`,
    url: fuente.url,
    medio: fuente.nombre,
  };
}

/** Fuente de una subasta: el documento oficial (nombre corto); la institución va a «Fuentes:». */
function fuenteEmision(c: Ctx, fuente: string, url: string): FuenteRef {
  const id = fuente === "BCRD" ? "bcrd" : "credito_publico";
  const cat = c.catalogo.get(id);
  c.usarFuente({ nombre: cat?.nombre ?? (fuente === "BCRD" ? "Banco Central RD" : "Dirección General de Crédito Público"), url: enlaceSeguro(cat?.url) ?? enlaceSeguro(url) });
  return { nombre: fuente === "BCRD" ? "BCRD" : "Hacienda", url: enlaceSeguro(url) };
}

/** Resoluciones y avisos de la SIMV nuevos desde `desde`. */
function itemsSimv(c: Ctx, desde: Date): Item[] {
  const items: Item[] = [];
  for (const e of c.d.emisiones) {
    if (e.fuente !== "SIMV" || new Date(e.recogido_en) <= desde) continue;
    items.push({ texto: `Resolución ${e.numero}${e.emisor ? ` · ${e.emisor}` : ""}${e.descripcion ? `: ${e.descripcion}` : ""}`, url: enlaceSeguro(e.url), medio: "SIMV", meta: fechaCorta(e.fecha) });
  }
  for (const a of c.d.avisos) {
    if (a.institucion !== "SIMV" || new Date(a.fecha) <= desde) continue;
    items.push({ texto: a.titulo, url: enlaceSeguro(a.url), medio: "SIMV", meta: fechaCorta(diaRD(a.fecha)) });
  }
  if (items.length) c.usarFuente({ nombre: c.catalogo.get("simv")?.nombre ?? "SIMV", url: c.catalogo.get("simv")?.url ?? "https://simv.gob.do/" });
  return items;
}

function seccionRD(c: Ctx): Seccion {
  const filas: Fila[] = [];
  for (const id of ["USDDOP_COMPRA", "USDDOP_VENTA"]) filas.push(filaSerie(c, id, "Dólar del Banco Central"));
  for (const id of ["TPM_BCRD", "INFLACION_RD"]) filas.push(filaSerie(c, id, "Política monetaria y precios"));
  const comb = COMBUSTIBLES.filter((id) => hayDato(c, id));
  if (comb.length) for (const id of comb) filas.push(filaSerie(c, id, "Combustibles (MICM, RD$ por galón)"));
  else c.falta("Combustibles del MICM: sin dato guardado.");
  if (hayDato(c, "USDDOP_VENTA")) c.temas.add("dolar_rd");
  if (hayDato(c, "TPM_BCRD")) c.temas.add("tpm");
  if (hayDato(c, "INFLACION_RD")) c.temas.add("inflacion");
  if (comb.length) c.temas.add("combustibles");

  const items: Item[] = [];
  const sub = ultimaSubasta(c);
  if (sub) items.push(sub);
  else c.falta("Subastas de Hacienda o del BCRD: ninguna guardada.");
  const desde = c.d.previa ? new Date(c.d.previa.creado_en) : new Date(c.ahora.getTime() - 7 * 86_400_000);
  const simv = itemsSimv(c, desde);
  if (simv.length) items.push(...simv.slice(0, 2));
  else items.push({ texto: `SIMV: sin resoluciones nuevas desde ${c.d.previa ? "la edición anterior" : "hace una semana"}.` });
  return { id: "rd", titulo: "República Dominicana", filas, items, recorte: { prioridad: 5, minimo: 2 } };
}

const MUNDO_FUENTES = new Set(["aljazeera_rss", "france24_rss"]);

function seccionGuerras(c: Ctx, desde: Date, maximo = 5): Seccion {
  const recientes = c.d.titulares.filter((t) => new Date(t.fecha) > desde && new Date(t.fecha) <= c.ahora);
  const guerra = recientes.filter((t) => t.categoria === "guerra");
  const mundo = recientes.filter((t) => t.categoria !== "guerra" && t.fuente_id !== null && MUNDO_FUENTES.has(t.fuente_id));
  const vistos = new Set<string>();
  const elegidos: TitularGuardado[] = [];
  for (const t of [...guerra, ...mundo]) {
    const k = t.titular.trim().toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    elegidos.push(t);
    if (elegidos.length >= maximo) break;
  }
  if (!elegidos.length) return { id: "guerras", titulo: "Guerras y mundo", items: [], vacio: "Sin titulares de conflictos o del mundo guardados en este período." };
  c.temas.add("guerras");
  return {
    id: "guerras",
    titulo: "Guerras y mundo",
    intro: "Solo el titular y el enlace al medio (sin resumen).",
    items: elegidos.map((t) => {
      c.usarFuente(fuenteMedio(c, t));
      return { texto: t.titular, url: enlaceSeguro(t.url), medio: t.medio, meta: `${fechaCorta(diaRD(t.fecha))}, ${horaRD(t.fecha)}` };
    }),
    recorte: { prioridad: 3, minimo: 2 },
  };
}

function seccionAgenda(c: Ctx, dias: number, titulo = "Agenda"): Seccion {
  const hasta = c.ahora.getTime() + dias * 86_400_000;
  const eventos = c.d.agenda.filter((e) => new Date(e.fecha_hora).getTime() >= c.ahora.getTime() - 3_600_000 && new Date(e.fecha_hora).getTime() <= hasta);
  if (!eventos.length) return { id: "agenda", titulo, items: [], vacio: dias <= 2 ? "No hay eventos cargados en la agenda para mañana." : "No hay eventos cargados en la agenda para la próxima semana." };
  return {
    id: "agenda",
    titulo,
    items: eventos.map((e) => {
      const dia = fechaConDia(diaRD(e.fecha_hora));
      if (e.url) c.usarFuente({ nombre: `Calendario oficial · ${e.institucion}`, url: enlaceSeguro(e.url) });
      return {
        texto: `${e.institucion}: ${e.evento}`,
        url: enlaceSeguro(e.url),
        meta: `${dia}${e.hora_conocida ? `, ${horaRD(e.fecha_hora)}` : ""}${e.confirmado ? "" : " · sin confirmar"}`,
      };
    }),
    recorte: { prioridad: 4, minimo: 2 },
  };
}

function rd$(v: string): string {
  const n = new Big(v);
  return `${n.lt(0) ? "−" : ""}RD$${cifra(n.abs().toString(), 0)}`;
}

const DEC = /^-?\d+(\.\d+)?$/;
const dec = (x: unknown): string | null => (typeof x === "string" && DEC.test(x) ? x : null);
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const NIVELES_RIESGO = new Set(["bajo", "medio", "alto"]);
const FEMENINO: Record<string, string> = { bajo: "baja", medio: "media", alto: "alta" };

/** La foto la escribe la app: se valida campo por campo y lo que no tenga forma se descarta (nunca se rellena). */
export function leerFoto(x: unknown): FotoDinero | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.mes !== "string" || !MES.test(o.mes)) return null;
  const a = o.aportes as Record<string, unknown> | null | undefined;
  const entero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const aportes =
    a && typeof a === "object" && entero(a.plan) !== null && entero(a.pendientes) !== null && dec(a.total) && dec(a.pendiente)
      ? { plan: entero(a.plan)!, pendientes: entero(a.pendientes)!, total: dec(a.total)!, pendiente: dec(a.pendiente)! }
      : null;
  const riesgos = Array.isArray(o.riesgos)
    ? o.riesgos
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        .filter((r) => typeof r.titulo === "string" && NIVELES_RIESGO.has(String(r.impacto)) && NIVELES_RIESGO.has(String(r.probabilidad)))
        .map((r) => ({ titulo: String(r.titulo).slice(0, 80), impacto: String(r.impacto), probabilidad: String(r.probabilidad) }))
    : [];
  return {
    mes: o.mes,
    patrimonio: dec(o.patrimonio),
    vivo: o.vivo === true,
    cambio: dec(o.cambio),
    cambio_pct: dec(o.cambio_pct),
    previo: typeof o.previo === "string" && MES.test(o.previo) ? o.previo : null,
    aportes,
    riesgos,
    riesgos_evaluados: entero(o.riesgos_evaluados) ?? 0,
  };
}

function seccionTuDinero(c: Ctx): Seccion | null {
  const t = c.d.tu_dinero;
  if (!t) return null;
  c.temas.add("tu_dinero");
  const fuente: FuenteRef = { nombre: "Tus registros en Strategya", url: c.op.urlApp ? `${c.op.urlApp.replace(/\/$/, "")}/capital` : null };
  c.usarFuente(fuente);
  const items: Item[] = [];
  const mes = nombreMes(c.hoy.slice(0, 7));
  const p = t.presupuesto;
  if (t.configurado && p?.real && p.presupuestado) {
    items.push({ texto: `Utilidad neta de ${mes}: ${rd$(p.real.utilidad_neta ?? "0")} real contra ${rd$(p.presupuestado.utilidad_neta ?? "0")} presupuestado.`, medio: "Presupuesto" });
  } else {
    items.push({ texto: "Utilidad neta del mes: no confirmado (el Presupuesto todavía no está armado)." });
    c.falta("Tu dinero · Presupuesto: sin configurar.");
  }
  const f = leerFoto(t.foto);
  if (f && t.foto_en) {
    const viejo = c.ahora.getTime() - new Date(t.foto_en).getTime() > 48 * 3_600_000;
    const cuando = `foto del ${fechaCorta(diaRD(t.foto_en))}, ${horaRD(t.foto_en)}${viejo ? " · dato viejo" : ""}`;
    if (viejo) c.falta(`Tu dinero: la foto del Portafolio es del ${fechaCorta(diaRD(t.foto_en), true)} (dato viejo).`);
    if (f.patrimonio !== null) {
      const cambio =
        f.cambio !== null && f.previo
          ? ` (${new Big(f.cambio).gte(0) ? "+" : "−"}${rd$(new Big(f.cambio).abs().toString())}${f.cambio_pct !== null ? `, ${pctConSigno(f.cambio_pct, 1)}` : ""} frente a ${nombreMes(f.previo)})`
          : " (sin mes previo cerrado para comparar)";
      items.push({ texto: `Patrimonio neto: ${rd$(f.patrimonio)}${cambio}.`, medio: "Portafolio", meta: cuando });
    } else {
      items.push({ texto: "Patrimonio neto: no confirmado (todavía no hay cuentas en el Portafolio).", meta: cuando });
    }
    if (f.aportes) {
      items.push({
        texto:
          f.aportes.pendientes > 0
            ? `Aportes del mes: ${f.aportes.pendientes} de ${f.aportes.plan} pendientes por ${rd$(f.aportes.pendiente)} (plan del mes: ${rd$(f.aportes.total)}).`
            : `Aportes del mes: los ${f.aportes.plan} del plan ya están confirmados (${rd$(f.aportes.total)}).`,
        medio: "Portafolio",
      });
    } else {
      items.push({ texto: "Aportes del mes: no hay plan de aportes para este mes." });
    }
    items.push({
      texto: f.riesgos.length
        ? `Riesgos en nivel alto: ${f.riesgos.map((r) => `${r.titulo} (impacto ${r.impacto}, probabilidad ${FEMENINO[r.probabilidad] ?? r.probabilidad})`).join("; ")}.`
        : "Ningún riesgo de la matriz está en nivel alto.",
      medio: "Matriz de riesgo",
    });
  } else {
    items.push({ texto: "Patrimonio, aportes y riesgos: no confirmado (abre Strategya una vez para calcular la foto de tu Portafolio)." });
    c.falta("Tu dinero · Portafolio: sin foto calculada.");
  }
  return { id: "tu-dinero", titulo: "Tu dinero", intro: "Solo para ti. Información de tus registros, no asesoría.", items, personal: true };
}

function seccionGlosario(c: Ctx, cuantos: number): Seccion | null {
  const conceptos = elegirConceptos(c.temas, c.hoy, cuantos);
  if (!conceptos.length) return null;
  return {
    id: "glosario",
    titulo: "Glosario",
    items: conceptos.map((g) => ({ texto: `${g.termino}: ${g.definicion}` })),
    recorte: { prioridad: 1, minimo: 1 },
  };
}

function nivelesClave(c: Ctx): Record<string, NivelGuardado> {
  const n: Record<string, NivelGuardado> = {};
  for (const id of [...idsClave(c), "USDDOP_COMPRA", "USDDOP_VENTA"]) {
    const o = c.series.get(id);
    if (o) n[id] = { valor: o.valor, fecha_dato: o.fecha_dato, hora_dato: o.hora_dato };
  }
  return n;
}

// ───────────────────────────── Las 4 ediciones ─────────────────────────────

function armarAM(c: Ctx): Partial<Edicion> {
  const dia = datoDelDia(c);
  const secciones = [
    seccionAlertas(c, null),
    seccionCinco(c),
    seccionMercados(c),
    seccionRD(c),
    seccionGuerras(c, new Date(c.ahora.getTime() - 24 * 3_600_000)),
    seccionAgenda(c, 7),
    seccionTuDinero(c),
    seccionGlosario(c, 2),
  ].filter((s): s is Seccion => s !== null);
  return { datoDelDia: textoDatoDelDia(dia), resumen: resumenDiario(c, dia, false), secciones };
}

function seccionCambiosAM(c: Ctx): Seccion {
  const am = c.d.am_hoy;
  if (!am) {
    return { id: "desde-am", titulo: "Qué cambió desde la AM", filas: [], vacio: "No hay edición AM de hoy para comparar: abajo van los niveles al cierre." };
  }
  const filas: Fila[] = [];
  for (const id of [...idsClave(c), "USDDOP_VENTA"]) {
    const o = c.series.get(id);
    const antes = am.niveles[id];
    if (!o || !antes) continue;
    const dif = new Big(o.valor).minus(antes.valor);
    if (dif.eq(0)) continue;
    const f = filaSerie(c, id);
    const tasa = esTasa(o);
    filas.push({
      ...f,
      cambio: tasa ? puntosBasicos(dif.toString()) : cifraConSigno(dif.toString(), decimalesDe(o)),
      dir: dif.gt(0) ? "sube" : "baja",
      nota: `AM: ${nivelDe(o, antes.valor)}`,
    });
  }
  return {
    id: "desde-am",
    titulo: "Qué cambió desde la AM",
    intro: `Diferencia de nivel frente a la edición de las ${horaRD(am.creado_en)}. Lo que no se movió no se repite.`,
    filas,
    vacio: filas.length ? undefined : "Ninguna cifra clave cambió desde la AM.",
  };
}

function armarCierre(c: Ctx): Partial<Edicion> {
  const dia = datoDelDia(c);
  const am = c.d.am_hoy;
  const desde = am ? new Date(am.creado_en) : new Date(c.ahora.getTime() - 24 * 3_600_000);
  const secciones: (Seccion | null)[] = [seccionCambiosAM(c), seccionAlertas(c, am ? desde : null), seccionCinco(c)];
  if (!am) secciones.push(seccionMercados(c));
  else {
    // El dólar del BCRD se publica en la tarde: solo sale si cambió desde la AM.
    const filas = ["USDDOP_COMPRA", "USDDOP_VENTA"]
      .filter((id) => {
        const o = c.series.get(id);
        const a = am.niveles[id];
        return o && (!a || a.fecha_dato !== o.fecha_dato || !new Big(a.valor).eq(o.valor));
      })
      .map((id) => filaSerie(c, id, "Dólar del Banco Central"));
    if (filas.length) secciones.push({ id: "rd", titulo: "República Dominicana", intro: "Nuevo desde la AM.", filas });
    if (hayDato(c, "IDX_SPX")) c.temas.add("bolsas");
    if (hayDato(c, "UST_10A")) c.temas.add("tesoro");
    if (hayDato(c, "BRENT")) c.temas.add("energia");
  }
  secciones.push(seccionGuerras(c, desde, 4), seccionAgenda(c, 2, "Agenda de mañana"));
  secciones.push(seccionGlosario(c, 1));
  return { datoDelDia: textoDatoDelDia(dia), resumen: resumenDiario(c, dia, true), secciones: secciones.filter((s): s is Seccion => s !== null) };
}

/** Cambio semanal en % (viernes contra viernes anterior), exacto con big.js. */
export function cambioSemanal(fin: string, ini: string): string | null {
  const a = new Big(ini);
  if (a.eq(0)) return null;
  return new Big(fin).minus(a).div(a.abs()).times(100).round(6, Big.roundHalfUp).toString();
}

function filaSemana(c: Ctx, id: string, grupo: string): Fila | null {
  const w = c.d.semana.find((x) => x.serie_id === id);
  const o = c.series.get(id);
  if (!w || !o) {
    c.falta(`${ETIQUETAS[id] ?? id}: sin cierre semanal guardado.`);
    return { etiqueta: ETIQUETAS[id] ?? id, grupo, nivel: null, cambio: null, dir: null, fecha: null, fuente: null, estado: "no_confirmado" };
  }
  const fuente = fuenteDe(c, o);
  const pct = w.valor_ini ? cambioSemanal(w.valor_fin, w.valor_ini) : null;
  if (!w.valor_ini) c.falta(`${etiquetaDe(o)}: sin cierre del viernes anterior para comparar.`);
  return {
    etiqueta: etiquetaDe(o),
    grupo,
    nivel: nivelDe(o, w.valor_fin),
    cambio: pct !== null ? pctConSigno(pct) : null,
    dir: pct !== null ? direccionDe(pct) : null,
    fecha: fechaConDia(w.fecha_fin),
    fuente,
    estado: "ok",
    nota: w.valor_ini && w.fecha_ini ? `vs ${nivelDe(o, w.valor_ini)} del ${fechaConDia(w.fecha_ini)}` : null,
  };
}

function seccionSemana(c: Ctx): Seccion {
  const filas: Fila[] = [];
  for (const id of SEMANA_ENERGIA) filas.push(filaSemana(c, id, "Energía")!);
  for (const id of SEMANA_METALES) filas.push(filaSemana(c, id, "Metales")!);
  c.falta("Agrícolas (trigo, maíz, soya, café, azúcar): Strategya no guarda series agrícolas todavía.");
  c.temas.add("semana").add("energia").add("metales");
  return {
    id: "semana",
    titulo: "Cierre de la semana · materias primas",
    intro: `Último dato de cada viernes (${fechaConDia(c.d.viernes)}) contra el viernes anterior.`,
    filas,
  };
}

function seccionContexto(c: Ctx): Seccion {
  const filas = [filaSemana(c, "IDX_SPX", "Contexto")!, filaSemana(c, hayDato(c, "DXY") ? "DXY" : "ETF_UUP", "Contexto")!];
  return { id: "contexto", titulo: "Contexto: bolsa y dólar en la semana", filas };
}

function seccionCombustibles(c: Ctx): Seccion {
  const ids = COMBUSTIBLES.filter((id) => hayDato(c, id));
  if (!ids.length) {
    c.falta("Combustibles del MICM: sin dato guardado.");
    return { id: "combustibles", titulo: "Combustibles de la semana (MICM)", filas: [], vacio: "El MICM publica los viernes; todavía no hay precios guardados." };
  }
  c.temas.add("combustibles");
  return { id: "combustibles", titulo: "Combustibles de la semana (MICM)", intro: "Precio oficial por galón y cambio contra la semana anterior.", filas: ids.map((id) => filaSerie(c, id)) };
}

function movimientosSemana(c: Ctx): { o: ObsSerie; pct: string }[] {
  const lista: { o: ObsSerie; pct: string }[] = [];
  for (const id of [...SEMANA_ENERGIA, ...SEMANA_METALES]) {
    const w = c.d.semana.find((x) => x.serie_id === id);
    const o = c.series.get(id);
    if (!w || !o || !w.valor_ini) continue;
    const pct = cambioSemanal(w.valor_fin, w.valor_ini);
    if (pct !== null) lista.push({ o, pct });
  }
  return lista.sort((a, b) => new Big(b.pct).abs().cmp(new Big(a.pct).abs()) || a.o.serie_id.localeCompare(b.o.serie_id));
}

function armarFinde(c: Ctx): Partial<Edicion> {
  const domingo = new Date(`${c.hoy}T12:00:00Z`).getUTCDay() === 0;
  const movs = movimientosSemana(c);
  const top = movs[0] ?? null;
  const resumen: string[] = [];
  const fraseMov = (m: { o: ObsSerie; pct: string }) => {
    const mv = movimiento(m.pct);
    return `${etiquetaDe(m.o)} ${mv && mv.cuanto ? `${mv.verbo}${mv.cuanto}` : "quedó casi igual"} en la semana (cierre del ${fechaConDia(c.d.viernes)}).`;
  };
  let agenda: Seccion | null = null;
  if (domingo) {
    agenda = seccionAgenda(c, 7, "La semana que viene");
    const n = agenda.items?.length ?? 0;
    resumen.push(n ? `La semana que viene trae ${n === 1 ? "un evento" : `${n} eventos`} en la agenda; el primero: ${agenda.items![0].texto} (${agenda.items![0].meta}).` : "La agenda de la semana que viene no tiene eventos cargados.");
    for (const m of movs.slice(0, 2)) resumen.push(fraseMov(m));
  } else {
    for (const m of movs.slice(0, 3)) resumen.push(fraseMov(m));
  }
  if (resumen.length < 3) {
    const spx = c.d.semana.find((x) => x.serie_id === "IDX_SPX");
    const o = c.series.get("IDX_SPX");
    if (spx?.valor_ini && o) resumen.push(`El S&P 500 terminó la semana en ${cifra(spx.valor_fin, 2)} puntos (${pctConSigno(cambioSemanal(spx.valor_fin, spx.valor_ini)!)} frente al viernes anterior).`);
  }
  if (!resumen.length) resumen.push("Todavía no hay cierres semanales confirmados para resumir.");

  const secciones: (Seccion | null)[] = [];
  if (agenda) secciones.push(agenda);
  secciones.push(seccionSemana(c), seccionContexto(c), seccionCombustibles(c), seccionGuerras(c, new Date(c.ahora.getTime() - 24 * 3_600_000), 4));
  if (!domingo) secciones.push(seccionAgenda(c, 7, "La semana que viene"));
  secciones.push(seccionTuDinero(c), seccionGlosario(c, 2));
  return {
    datoDelDia: top ? `${etiquetaDe(top.o)} ${pctConSigno(top.pct)} en la semana` : null,
    resumen: resumen.slice(0, 3),
    secciones: secciones.filter((s): s is Seccion => s !== null),
  };
}

// ── Boletín de Tasas RD ──

const esCerrado = (f: Pick<FondoGuardado, "fondo">) => /cerrad/i.test(f.fondo);

interface FondoVista {
  safi: string;
  fondo: string;
  moneda: "DOP" | "USD";
  r30: FondoGuardado | null;
  r1a: FondoGuardado | null;
}

function fondosVista(fondos: readonly FondoGuardado[]): FondoVista[] {
  const m = new Map<string, FondoVista>();
  for (const f of fondos) {
    const k = `${f.safi}\u0000${f.fondo}\u0000${f.moneda}`;
    const v = m.get(k) ?? { safi: f.safi, fondo: f.fondo, moneda: f.moneda, r30: null, r1a: null };
    if (f.plazo_dias === 30) {
      if (!v.r30 || f.fecha_corte > v.r30.fecha_corte) v.r30 = f;
    } else if (!v.r1a || f.fecha_corte > v.r1a.fecha_corte || (f.fecha_corte === v.r1a.fecha_corte && f.plazo_dias > v.r1a.plazo_dias)) {
      v.r1a = f;
    }
    m.set(k, v);
  }
  return [...m.values()];
}

const MAX_FONDO_MIN = 14_400;

function filaFondo(c: Ctx, f: FondoVista, grupo: string): Fila {
  const base = f.r30 ?? f.r1a!;
  const corte = [f.r30?.fecha_corte, f.r1a?.fecha_corte].filter((x): x is string => !!x).sort().at(-1)!;
  const viejo = c.ahora.getTime() - momentoDelDato({ fecha_dato: corte, hora_dato: null }).getTime() > MAX_FONDO_MIN * 60_000;
  const fuente: FuenteRef = { nombre: f.safi, url: enlaceSeguro(base.url_fuente) };
  c.usarFuente({ nombre: `SAFI ${f.safi}`, url: fuente.url });
  if (viejo) c.falta(`${f.fondo} (${f.safi}): dato viejo, corte del ${fechaCorta(corte, true)}.`);
  return {
    etiqueta: f.fondo,
    grupo,
    nivel: f.r30 ? `${cifra(f.r30.rendimiento, 2)} % a 30 días` : "30 días: no publicado",
    cambio: null,
    dir: null,
    fecha: `corte ${fechaCorta(corte)}`,
    fuente,
    estado: viejo ? "viejo" : "ok",
    nota: f.r1a ? `${cifra(f.r1a.rendimiento, 2)} % a ${f.r1a.plazo_dias} días` : "un año: no publicado",
  };
}

function ordenarFondos(lista: FondoVista[]): FondoVista[] {
  return lista.sort((a, b) => {
    if (a.r30 && b.r30) return new Big(b.r30.rendimiento).cmp(a.r30.rendimiento) || a.fondo.localeCompare(b.fondo, "es");
    return a.r30 ? -1 : b.r30 ? 1 : a.fondo.localeCompare(b.fondo, "es");
  });
}

function armarTasas(c: Ctx): Partial<Edicion> {
  const secciones: Seccion[] = [];
  const pendiente: Item[] = [];

  // Política monetaria
  const tpm = filaSerie(c, "TPM_BCRD", "Banco Central");
  const infl = filaSerie(c, "INFLACION_RD", "Banco Central");
  pendiente.push({ texto: "Facilidades permanentes del BCRD (depósito y préstamo a un día): Strategya no tiene una fuente automática para ellas todavía." });
  c.falta("Facilidades permanentes del BCRD: sin serie en la base.");
  secciones.push({ id: "tpm", titulo: "Política monetaria", filas: [tpm, infl] });
  if (hayDato(c, "TPM_BCRD")) c.temas.add("tpm");

  // Tasas de los bancos
  // Solo las tasas con dato; las que faltan van a «No confirmado» (filaSerie lo anota).
  const filasBancos = TASAS_BANCOS.map(([g, id]) => filaSerie(c, id, g)).filter((f) => f.nivel !== null);
  if (filasBancos.some((f) => f.nivel)) c.temas.add("tasas_bancos");
  secciones.push({ id: "bancos", titulo: "Tasas de los bancos (BCRD)", intro: "Último dato publicado, con su mes.", filas: filasBancos });

  // Subastas
  const subastas = c.d.emisiones.filter((e) => e.fuente === "CREDITO_PUBLICO" || e.fuente === "BCRD").slice(0, 3);
  const itemsSub: Item[] = subastas.map((e) => {
    const fuente = fuenteEmision(c, e.fuente, e.url);
    const partes = [
      e.instrumento ?? e.descripcion ?? e.numero,
      e.monto ? `${e.moneda === "USD" ? "US$" : "RD$"}${cifra(e.monto, 0)}` : "monto no confirmado",
      e.tasa ? `tasa de corte ${cifra(e.tasa, 2)} %` : "tasa de corte no confirmada",
    ];
    return { texto: partes.join(" · "), url: fuente.url, medio: fuente.nombre, meta: `subasta del ${fechaCorta(e.fecha)}` };
  });
  if (itemsSub.length) c.temas.add("subastas");
  else c.falta("Subastas: ninguna guardada.");
  if (subastas.some((e) => !e.monto || !e.tasa)) pendiente.push({ texto: "Algunas subastas no traen monto o tasa de corte: esas cifras viven en el PDF o el Consolidado oficial y no se leyeron." });
  secciones.push({ id: "subastas", titulo: "Últimas subastas", items: itemsSub, vacio: itemsSub.length ? undefined : "No hay subastas guardadas." });

  // SIMV de la semana
  const simv = itemsSimv(c, new Date(c.ahora.getTime() - 7 * 86_400_000));
  secciones.push({
    id: "simv",
    titulo: "SIMV: emisiones y resoluciones de la semana",
    items: simv.slice(0, 5),
    vacio: simv.length ? undefined : "Sin resoluciones ni avisos de la SIMV en los últimos 7 días.",
    recorte: { prioridad: 3, minimo: 2 },
  });

  // Fondos
  const vista = fondosVista(c.d.fondos);
  const dopAb = ordenarFondos(vista.filter((f) => f.moneda === "DOP" && !esCerrado(f)));
  const usdAb = ordenarFondos(vista.filter((f) => f.moneda === "USD" && !esCerrado(f)));
  const cerr = ordenarFondos(vista.filter(esCerrado));
  const filasFondos: Fila[] = [
    ...dopAb.slice(0, 5).map((f) => filaFondo(c, f, "Abiertos en pesos (RD$)")),
    ...usdAb.slice(0, 4).map((f) => filaFondo(c, f, "Abiertos en dólares (US$)")),
    ...cerr.slice(0, 3).map((f) => filaFondo(c, f, "Cerrados")),
  ];
  if (filasFondos.length) c.temas.add("fondos");
  if (!cerr.length) pendiente.push({ texto: "Fondos cerrados: ninguna administradora los publica en una página que Strategya lea; se agregan a mano en «Agregar un dato»." });
  pendiente.push({ texto: "AFI Universal, AFI Popular, Pioneer y BHD Fondos: sus rendimientos se cargan a mano (sus páginas no se leen solas)." });
  secciones.push({
    id: "fondos",
    titulo: "Fondos de inversión por SAFI",
    intro: "Rendimiento anualizado publicado por cada SAFI; siempre con su período (30, 360 o 365 días) y su fecha de corte.",
    filas: filasFondos,
    vacio: filasFondos.length ? undefined : "No hay rendimientos de fondos guardados.",
    recorte: { prioridad: 2, minimo: 4, en: "filas" },
  });

  // Comparador (sin recomendar)
  const comp: Item[] = [];
  const bono = c.d.emisiones.find((e) => e.fuente === "CREDITO_PUBLICO" && e.tasa);
  comp.push(
    bono
      ? { texto: `Bono de Hacienda más reciente: tasa de corte ${cifra(bono.tasa!, 2)} % (subasta del ${fechaCorta(bono.fecha)}).`, url: enlaceSeguro(bono.url), medio: "Crédito Público" }
      : { texto: "Bono de Hacienda más reciente: tasa de corte no confirmada." },
  );
  const pas = c.series.get("TASA_PAS_MN_PROMEDIO");
  comp.push(
    pas
      ? { texto: `Tasa pasiva promedio de los bancos (RD$): ${cifra(pas.valor, 2)} % (${mesCorto(pas.fecha_dato)}).`, url: fuenteDe(c, pas).url, medio: FUENTE_CORTA[pas.fuente_id] ?? pas.fuente_nombre }
      : { texto: "Tasa pasiva promedio de los bancos: no confirmada." },
  );
  const top3 = dopAb.filter((f) => f.r30).slice(0, 3);
  comp.push(
    top3.length
      ? { texto: `Fondos abiertos en pesos con mayor rendimiento a 30 días: ${top3.map((f) => `${f.fondo} (${cifra(f.r30!.rendimiento, 2)} %, corte ${fechaCorta(f.r30!.fecha_corte)})`).join("; ")}.` }
      : { texto: "Fondos en pesos a 30 días: no confirmado." },
  );
  comp.push({ texto: "Son cifras de períodos y riesgos distintos: sirven para ubicarte, no para decidir. No es una recomendación." });
  secciones.push({ id: "comparador", titulo: "Comparador corto", items: comp });

  secciones.push({ id: "pendiente", titulo: "Pendiente", intro: "Lo que falta y por qué.", items: pendiente, recorte: { prioridad: 5, minimo: 2 } });
  const glos = seccionGlosario(c, 2);
  if (glos) secciones.push(glos);

  // Resumen y dato del día
  const resumen: string[] = [];
  const oTpm = c.series.get("TPM_BCRD");
  if (oTpm) resumen.push(`La tasa de política monetaria del Banco Central está en ${cifra(oTpm.valor, 2)} % (rige desde ${mesCorto(oTpm.fecha_dato)}).`);
  if (pas) resumen.push(`Los bancos pagan en promedio ${cifra(pas.valor, 2)} % por los depósitos en pesos (${mesCorto(pas.fecha_dato)}${estadoCifra(pas, c.ahora) === "viejo" ? ", dato viejo" : ""}).`);
  if (top3[0]) resumen.push(`El fondo abierto en pesos que más rindió a 30 días fue ${top3[0].fondo} de ${top3[0].safi}: ${cifra(top3[0].r30!.rendimiento, 2)} % (corte ${fechaCorta(top3[0].r30!.fecha_corte)}).`);
  if (!resumen.length) resumen.push("Todavía no hay tasas confirmadas para resumir.");

  let dato: string | null = null;
  let mejor: ObsSerie | null = null;
  for (const id of ["TPM_BCRD", ...TASAS_BANCOS.map(([, s]) => s)]) {
    const o = c.series.get(id);
    if (!o || o.cambio === null || estadoCifra(o, c.ahora) !== "ok" || new Big(o.cambio).eq(0)) continue;
    if (!mejor || new Big(o.cambio).abs().gt(new Big(mejor.cambio!).abs())) mejor = o;
  }
  if (mejor) dato = `${etiquetaDe(mejor)} ${puntosBasicos(mejor.cambio!)}`;
  else if (oTpm) dato = `TPM ${cifra(oTpm.valor, 2)} %`;
  return { datoDelDia: dato, resumen: resumen.slice(0, 3), secciones };
}

// ───────────────────────────── Largo máximo ─────────────────────────────

function largoDe(e: Edicion): number {
  return contarPalabras(textoPlano(e));
}

/** Quita elementos del final de las secciones recortables (de menor a mayor prioridad) hasta caber. */
function recortar(e: Edicion): void {
  let palabras = largoDe(e);
  while (palabras > e.limitePalabras) {
    const lista = (s: Seccion) => (s.recorte?.en === "filas" ? s.filas : s.items) ?? [];
    const candidatas = e.secciones
      .filter((s) => s.recorte && lista(s).length > s.recorte.minimo)
      .sort((a, b) => a.recorte!.prioridad - b.recorte!.prioridad);
    const s = candidatas[0];
    if (!s) break;
    if (s.recorte?.en === "filas" && s.filas) {
      // Se quita la última fila del grupo más largo: ningún grupo (p. ej. «Cerrados») desaparece primero.
      const cuenta = new Map<string, number>();
      for (const f of s.filas) cuenta.set(f.grupo ?? "", (cuenta.get(f.grupo ?? "") ?? 0) + 1);
      const mayor = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const i = s.filas.map((f) => f.grupo ?? "").lastIndexOf(mayor);
      s.filas.splice(i, 1);
    } else lista(s).pop();
    if (!e.recortes.includes(s.titulo)) e.recortes.push(s.titulo);
    palabras = largoDe(e);
  }
  // Después, las explicaciones bajo cada título; y como último recurso, el glosario.
  if (palabras > e.limitePalabras) {
    for (const s of e.secciones) delete s.intro;
    e.recortes.push("Introducciones de sección");
    palabras = largoDe(e);
  }
  if (palabras > e.limitePalabras && e.secciones.some((s) => s.id === "glosario")) {
    e.secciones = e.secciones.filter((s) => s.id !== "glosario");
    e.recortes.push("Glosario completo");
    palabras = largoDe(e);
  }
  e.palabras = palabras;
}

// ───────────────────────────── Entrada pública ─────────────────────────────

export function armarEdicion(d: DatosBoletin, op: OpcionesArmado = {}): Edicion {
  const c = new Ctx(d, op);
  const tipo = d.tipo;
  const parte = tipo === "am" ? armarAM(c) : tipo === "cierre" ? armarCierre(c) : tipo === "finde" ? armarFinde(c) : armarTasas(c);
  const meta = EDICIONES[tipo];
  const dato = parte.datoDelDia ?? null;
  const nombre = tipo === "finde" ? `${meta.nombre}${new Date(`${d.hoy}T12:00:00Z`).getUTCDay() === 0 ? " · domingo" : " · sábado"}` : meta.nombre;
  const e: Edicion = {
    tipo,
    nombre,
    fecha: d.hoy,
    fechaTexto: fechaLarga(d.hoy),
    armadoEn: d.ahora,
    asunto: `${op.prueba ? "[Prueba] " : ""}${meta.nombre} · ${fechaCorta(d.hoy)} · ${dato ?? "sin dato del día"}`,
    datoDelDia: dato,
    resumen: parte.resumen ?? [],
    secciones: parte.secciones ?? [],
    fuentes: c.listaFuentes(),
    noConfirmado: c.listaFaltan(),
    niveles: tipo === "am" || tipo === "cierre" ? nivelesClave(c) : {},
    conTuDinero: (parte.secciones ?? []).some((s) => s.personal),
    palabras: 0,
    limitePalabras: meta.palabras,
    recortes: [],
    prueba: !!op.prueba,
  };
  recortar(e);
  return e;
}
