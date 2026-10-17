import "server-only";
import { cache } from "react";
import { mercado } from "@/lib/supabase/servidor";

// Historias cortas para los minigráficos de la terminal: lecturas intradía guardadas (últimos días) y
// cierres diarios recientes de las series que no son intradía (dólar BCRD, Tesoro). Cifras como texto.

/** Series con minigráfico intradía en la terminal y en los paneles de mercado. */
export const SERIES_INTRADIA = [
  "IDX_SPX", "IDX_DJI", "IDX_IXIC", "IDX_RUT", "IDX_STOXX50E", "IDX_FTSE", "IDX_GDAXI", "IDX_N225", "IDX_HSI",
  "ORO", "PLATA", "COBRE_CPER", "BRENT", "WTI", "GAS_NATURAL", "ETF_USO", "ETF_UNG",
  "EURUSD", "USDJPY", "DXY", "ETF_UUP", "BTC",
];

/** Series diarias con su historia de las últimas semanas. */
export const SERIES_DIARIAS = ["USDDOP_VENTA", "UST_10A", "UST_2A"];

export interface LecturaIntradia {
  serie_id: string;
  valor: string;
  fecha_dato: string;
  hora_dato: string;
}

export interface LecturaDiaria {
  serie_id: string;
  valor: string;
  fecha_dato: string;
}

export interface Historias {
  intradia: LecturaIntradia[];
  diarias: LecturaDiaria[];
}

const DIAS_INTRADIA = 4;
const DIAS_DIARIA = 45;
// Supabase entrega como máximo 1000 filas por consulta (max-rows); se piden las más recientes.
const TOPE_INTRADIA = 1000;

export const historias = cache(async (): Promise<Historias> => {
  const db = await mercado();
  const desdeIntradia = new Date(Date.now() - DIAS_INTRADIA * 86_400_000).toISOString();
  const desdeDiaria = new Date(Date.now() - DIAS_DIARIA * 86_400_000).toISOString().slice(0, 10);
  const [intra, diarias] = await Promise.all([
    db
      .from("observaciones")
      .select("serie_id, valor::text, fecha_dato, hora_dato")
      .in("serie_id", SERIES_INTRADIA)
      .gte("hora_dato", desdeIntradia)
      // Las más recientes primero: si se llega al tope, se pierden las más viejas, no las de hoy.
      .order("hora_dato", { ascending: false })
      .limit(TOPE_INTRADIA),
    db
      .from("observaciones")
      .select("serie_id, valor::text, fecha_dato")
      .in("serie_id", SERIES_DIARIAS)
      .gte("fecha_dato", desdeDiaria)
      .order("fecha_dato")
      .limit(1000),
  ]);
  if (intra.error) throw new Error(`No se pudieron leer las lecturas del día: ${intra.error.message}`);
  if (diarias.error) throw new Error(`No se pudo leer la historia diaria: ${diarias.error.message}`);
  return {
    intradia: ((intra.data ?? []) as unknown as LecturaIntradia[]).filter((l) => !!l.hora_dato).reverse(),
    diarias: (diarias.data ?? []) as unknown as LecturaDiaria[],
  };
});

/** Lecturas del último día de negociación de la serie, en orden de hora. */
export function delUltimoDia(h: Historias, serieId: string): LecturaIntradia[] {
  const propias = h.intradia.filter((l) => l.serie_id === serieId);
  const dia = propias.map((l) => l.fecha_dato).sort().at(-1);
  return propias.filter((l) => l.fecha_dato === dia).sort((a, b) => a.hora_dato.localeCompare(b.hora_dato));
}

/** Un valor por fecha (el último guardado de ese día), en orden de fecha. */
export function cierresDiarios(h: Historias, serieId: string, maximo = 30): LecturaDiaria[] {
  const porFecha = new Map<string, LecturaDiaria>();
  for (const l of h.diarias) if (l.serie_id === serieId) porFecha.set(l.fecha_dato, l);
  return [...porFecha.values()].sort((a, b) => a.fecha_dato.localeCompare(b.fecha_dato)).slice(-maximo);
}
