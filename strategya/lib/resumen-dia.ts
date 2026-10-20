// «Hoy en 30 segundos»: frases simples armadas SOLO con las últimas cifras guardadas (sin IA).
// Cada frase dice el valor, hacia dónde se movió y de qué día es el dato. Si falta la cifra, la frase no sale.
import Big from "big.js";
import { cifra, fechaCorta } from "./formato";

export interface UltimaCruda {
  serie_id: string;
  valor: string;
  cambio: string | null;
  cambio_pct: string | null;
  fecha_dato: string;
}

/** Cuándo es el dato, dicho como lo diría una persona: «hoy», «ayer» o «el vie 16 oct». */
export function cuandoEs(fecha: string, hoy: string): string {
  if (fecha === hoy) return "hoy";
  const ayer = new Date(`${hoy}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  if (fecha === ayer.toISOString().slice(0, 10)) return "ayer";
  return `el ${fechaCorta(fecha, false)}`;
}

/** «(dato de hoy)», «(dato de ayer)», «(dato del 16 oct)». */
export function datoDe(fecha: string, hoy: string): string {
  const c = cuandoEs(fecha, hoy);
  return c.startsWith("el ") ? `dato del ${c.slice(3)}` : `dato de ${c}`;
}

function movimiento(pct: string | null): { verbo: string; cuanto: string } | null {
  if (pct === null) return null;
  const p = new Big(pct);
  const abs = p.abs().round(1, Big.roundHalfUp);
  if (abs.eq(0)) return { verbo: "quedó casi igual", cuanto: "" };
  return { verbo: p.gt(0) ? "subió" : "bajó", cuanto: ` ${abs.toFixed(1)} %` };
}

export function frasesDelDia(ultimas: Map<string, UltimaCruda>, hoy: string): string[] {
  const frases: string[] = [];

  const spx = ultimas.get("IDX_SPX");
  if (spx) {
    const m = movimiento(spx.cambio_pct);
    const cuando = cuandoEs(spx.fecha_dato, hoy);
    frases.push(
      !m
        ? `La bolsa de EE. UU. (S&P 500) está en ${cifra(spx.valor, 2)} puntos (${datoDe(spx.fecha_dato, hoy)}).`
        : m.cuanto
          ? `La bolsa de EE. UU. (S&P 500) ${m.verbo}${m.cuanto} ${cuando} y quedó en ${cifra(spx.valor, 2)} puntos.`
          : `La bolsa de EE. UU. (S&P 500) se mantuvo casi igual ${cuando}, en ${cifra(spx.valor, 2)} puntos.`,
    );
  }

  const dolar = ultimas.get("USDDOP_VENTA");
  if (dolar) {
    const m = movimiento(dolar.cambio_pct);
    frases.push(
      `El dólar en RD está en RD$${cifra(dolar.valor, 2)} para la venta según el Banco Central (${datoDe(dolar.fecha_dato, hoy)})${
        m && m.cuanto ? `; ${m.verbo}${m.cuanto}` : ""
      }.`,
    );
  }

  const brent = ultimas.get("BRENT");
  if (brent) {
    const m = movimiento(brent.cambio_pct);
    frases.push(
      `El petróleo Brent está en US$${cifra(brent.valor, 2)} el barril (${datoDe(brent.fecha_dato, hoy)})${
        m && m.cuanto ? `; ${m.verbo}${m.cuanto}` : ""
      }. Influye en los combustibles en RD.`,
    );
  }

  const ust = ultimas.get("UST_10A");
  if (ust) {
    let mov = "";
    if (ust.cambio !== null) {
      const pb = new Big(ust.cambio).times(100).round(0, Big.roundHalfUp);
      if (!pb.eq(0)) mov = `; ${pb.gt(0) ? "subió" : "bajó"} ${pb.abs().toFixed(0)} centésimas`;
    }
    frases.push(
      `La tasa del bono de EE. UU. a 10 años está en ${cifra(ust.valor, 2)} % (${datoDe(ust.fecha_dato, hoy)})${mov}. Guía préstamos e hipotecas.`,
    );
  }

  const oro = ultimas.get("ORO");
  if (oro && frases.length < 4) {
    const m = movimiento(oro.cambio_pct);
    frases.push(`El oro está en US$${cifra(oro.valor, 2)} la onza${m && m.cuanto ? ` y ${m.verbo}${m.cuanto}` : ""} (${datoDe(oro.fecha_dato, hoy)}).`);
  }

  return frases.slice(0, 4);
}
