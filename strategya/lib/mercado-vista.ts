// Arma lo que muestran los paneles de mercado a partir de filas ya guardadas (sin red, sin float para cifras).
// Solo formatea y empareja: si un dato no está, el ítem dice «sin datos»; nunca rellena.

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
