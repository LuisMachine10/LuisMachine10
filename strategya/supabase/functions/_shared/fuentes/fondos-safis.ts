// Fondos abiertos: rentabilidad anualizada (y valor cuota) leída de las páginas públicas de cada SAFI.
// Solo HTML servido por la propia SAFI, con robots.txt revisado en cada lectura (ctx.obtener). Nada se estima:
// si la página cambia de formato, la tarea falla con el motivo y el último dato bueno queda con su fecha.
//
// Excel · https://fondosabiertos.excel.com.do/  (sonda del 16 oct 2026)
//   <span data-rate="dinamico.pes">8.57%</span>
//   <p data-cuota="dinamico.pes">DOP 1,589.23</p><p data-cuota-fecha="dinamico.pes">04/10/2026</p>
//   <dd data-rate-plazo="dinamico.pes.30">8.29%</dd> … .60 .90 .180 .365
//   <span data-rate-date="dinamico.pes">4 de octubre de 2026</span>
// AFI Reservas · https://www.afireservas.com/fondos/fondo-larimar/
//   «Rentabilidad neta anualizada» → <span class="afi-pill">30 días</span><div class="afi-value">8.65%</div> …
//   Sin fecha de corte en la página: se guarda con la fecha (RD) en que se vio por primera vez y solo si
//   las cifras cambiaron respecto de lo último guardado. La nota lo dice.

import type { Tarea } from "../ingesta.ts";
import { aDecimal } from "../json.ts";
import { fechaLocal } from "../mercados.ts";

export type Moneda = "DOP" | "USD";

export interface RendimientoFondo {
  safi: string;
  fondo: string;
  moneda: Moneda;
  plazo_dias: number;
  rendimiento: string;
  fecha_corte: string;
  valor_cuota: string | null;
  url_fuente: string;
  nota: string | null;
}

const PLAZOS = new Set([30, 60, 90, 180, 365]);
const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const dos = (n: number) => String(n).padStart(2, "0");

/** «4 de octubre de 2026» → 2026-10-04. */
export function fechaEnLetras(texto: string): string | null {
  const m = /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de|del)\s+(\d{4})/i.exec(texto.trim());
  const mes = m ? MESES[m[2].toLowerCase()] : undefined;
  if (!m || !mes) return null;
  return `${m[3]}-${dos(mes)}-${dos(Number(m[1]))}`;
}

/** «04/10/2026» (día/mes/año) → 2026-10-04. */
export function fechaDMA(texto: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim());
  if (!m || Number(m[2]) > 12 || Number(m[1]) > 31) return null;
  return `${m[3]}-${dos(Number(m[2]))}-${dos(Number(m[1]))}`;
}

/** «8.57%» → "8.57"; «DOP 1,589.23» → "1589.23". */
function porcentaje(t: string): string | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*%\s*$/.exec(t);
  return m ? aDecimal(m[1]) : null;
}
function monto(t: string): { moneda: Moneda | null; valor: string | null } {
  const m = /^\s*(DOP|USD|RD\$|US\$)\s*([\d,]+(?:\.\d+)?)\s*$/.exec(t);
  if (!m) return { moneda: null, valor: null };
  return { moneda: m[1] === "USD" || m[1] === "US$" ? "USD" : "DOP", valor: aDecimal(m[2].replaceAll(",", "")) };
}

function porAtributo(html: string, atributo: string): Map<string, string> {
  const salida = new Map<string, string>();
  const re = new RegExp(`${atributo}="([a-z0-9.]+)"[^>]*>([^<]*)<`, "g");
  for (const m of html.matchAll(re)) salida.set(m[1], m[2].trim());
  return salida;
}

// ───────────────────────── Excel ─────────────────────────

export const URL_EXCEL_FONDOS = "https://fondosabiertos.excel.com.do/";
export const SAFI_EXCEL = "Excel SAFI";

const FONDOS_EXCEL: Record<string, string> = {
  dinamico: "Fondo Abierto Dinámico Excel",
  liquidez: "Fondo Abierto de Liquidez Excel",
};

export function parsearExcel(html: string): { filas: RendimientoFondo[]; advertencias: string[] } {
  const plazos = porAtributo(html, "data-rate-plazo");
  const cuotas = porAtributo(html, "data-cuota");
  const fechasCuota = porAtributo(html, "data-cuota-fecha");
  const fechasTasa = porAtributo(html, "data-rate-date");
  if (plazos.size === 0) throw new Error("Excel: formato inesperado (no hay data-rate-plazo)");
  const filas: RendimientoFondo[] = [];
  const advertencias: string[] = [];
  for (const [clave, texto] of plazos) {
    const [fondo, mon, plazoTxt] = clave.split(".");
    const nombre = FONDOS_EXCEL[fondo];
    const moneda: Moneda | null = mon === "pes" ? "DOP" : mon === "usd" ? "USD" : null;
    const plazo = Number(plazoTxt);
    const id = `${fondo}.${mon}`;
    if (!nombre || !moneda || !PLAZOS.has(plazo)) {
      advertencias.push(`Excel: «${clave}» no reconocido`);
      continue;
    }
    const rendimiento = porcentaje(texto);
    const fecha = fechaEnLetras(fechasTasa.get(id) ?? "") ?? fechaDMA(fechasCuota.get(id) ?? "");
    if (!rendimiento || !fecha) {
      advertencias.push(`Excel ${clave}: ${!rendimiento ? `rendimiento ilegible «${texto}»` : "sin fecha"}`);
      continue;
    }
    const cuota = monto(cuotas.get(id) ?? "");
    const cuotaDelDia = cuota.valor && cuota.moneda === moneda && fechaDMA(fechasCuota.get(id) ?? "") === fecha;
    filas.push({
      safi: SAFI_EXCEL,
      fondo: nombre,
      moneda,
      plazo_dias: plazo,
      rendimiento,
      fecha_corte: fecha,
      valor_cuota: cuotaDelDia ? cuota.valor : null,
      url_fuente: URL_EXCEL_FONDOS,
      nota: "Rentabilidad anualizada publicada por la SAFI",
    });
  }
  return { filas, advertencias };
}

// ───────────────────────── AFI Reservas ─────────────────────────

export const SAFI_RESERVAS = "AFI Reservas";
export const PAGINAS_RESERVAS: readonly string[] = [
  "https://www.afireservas.com/fondos/fondo-quisqueya/",
  "https://www.afireservas.com/fondos/fondo-larimar/",
  "https://www.afireservas.com/fondos/fondo-caoba/",
];

const NOTA_RESERVAS = "La página no publica fecha de corte: fecha = día en que Strategya vio estas cifras por primera vez";

function textoPlano(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[​\s]+/g, " ")
    .trim();
}

/** Página de un fondo de AFI Reservas → nombre, moneda y rentabilidad neta anualizada por plazo. */
export function parsearReservas(
  html: string,
  url: string,
  fechaVista: string,
): { fondo: string; moneda: Moneda; filas: RendimientoFondo[] } {
  const titulo = /<title>\s*([^<]+?)\s*<\/title>/i.exec(html)?.[1];
  const plano = textoPlano(html);
  const nombre = /Fondo Mutuo [A-Za-zÁÉÍÓÚáéíóúñÑ ]+?(?= Es | Fondo abierto| Fondo Abierto|$)/.exec(plano)?.[0]?.trim() ?? titulo;
  if (!nombre) throw new Error("AFI Reservas: no se encontró el nombre del fondo");
  const moneda: Moneda | null = /fondo abierto en d[oó]lares|fondo mutuo d[oó]lares/i.test(plano)
    ? "USD"
    : /fondo abierto en pesos/i.test(plano)
      ? "DOP"
      : null;
  if (!moneda) throw new Error(`AFI Reservas ${nombre}: no se pudo confirmar la moneda`);

  const ini = html.indexOf("Rentabilidad neta anualizada");
  if (ini < 0) throw new Error(`AFI Reservas ${nombre}: no aparece «Rentabilidad neta anualizada»`);
  const fin = html.indexOf("Volatilidad", ini);
  const bloque = html.slice(ini, fin > ini ? fin : undefined);
  const filas: RendimientoFondo[] = [];
  for (const m of bloque.matchAll(/afi-pill[^>]*>\s*(\d+)\s*d[ií]as\s*<\/span>\s*<div class="afi-value">\s*([^<]+?)\s*<\/div>/g)) {
    const plazo = Number(m[1]);
    const rendimiento = porcentaje(m[2]);
    if (!PLAZOS.has(plazo) || !rendimiento) continue;
    filas.push({
      safi: SAFI_RESERVAS,
      fondo: nombre,
      moneda,
      plazo_dias: plazo,
      rendimiento,
      fecha_corte: fechaVista,
      valor_cuota: null,
      url_fuente: url,
      nota: NOTA_RESERVAS,
    });
  }
  if (filas.length === 0) throw new Error(`AFI Reservas ${nombre}: no se pudo leer ninguna rentabilidad`);
  return { fondo: nombre, moneda, filas };
}

interface Ultimo {
  fondo: string;
  moneda: string;
  plazo_dias: number;
  rendimiento: string;
}

/** Solo lo que cambió respecto de lo último guardado (Reservas no fecha sus cifras). */
export function soloCambios(filas: RendimientoFondo[], ultimos: Ultimo[]): RendimientoFondo[] {
  const previo = new Map(ultimos.map((u) => [`${u.fondo}|${u.moneda}|${u.plazo_dias}`, aDecimal(u.rendimiento)]));
  return filas.filter((f) => previo.get(`${f.fondo}|${f.moneda}|${f.plazo_dias}`) !== f.rendimiento);
}

const CONFLICTO = "safi,fondo,moneda,plazo_dias,fecha_corte";

export const tareaFondosSafis: Tarea = {
  nombre: "fondos-safis",
  fuenteId: "excel_fondos",
  async ejecutar(ctx) {
    const advertencias: string[] = [];
    const guardadas: Record<string, number> = {};
    const base = { origen: "automatica" };

    try {
      const r = await ctx.obtener(URL_EXCEL_FONDOS);
      const { filas, advertencias: adv } = parsearExcel(r.texto);
      advertencias.push(...adv);
      guardadas[SAFI_EXCEL] = await ctx.guardar(
        "fondos_rendimientos",
        filas.map((f) => ({ ...f, ...base, fuente_id: "excel_fondos" })),
        { conflicto: CONFLICTO },
      );
    } catch (e) {
      advertencias.push(`Excel: ${(e as Error).message}`);
    }

    const hoyRD = fechaLocal(ctx.ahora, "America/Santo_Domingo");
    const leidas: RendimientoFondo[] = [];
    let paginasOk = 0;
    for (const url of PAGINAS_RESERVAS) {
      try {
        const r = await ctx.obtener(url);
        leidas.push(...parsearReservas(r.texto, url, hoyRD).filas);
        paginasOk++;
      } catch (e) {
        advertencias.push(`AFI Reservas (${url}): ${(e as Error).message}`);
      }
    }
    if (leidas.length) {
      const ultimos = (await ctx.rpc<Ultimo[]>("ultimos_rendimientos_safi", { p_safi: SAFI_RESERVAS })) ?? [];
      // Una página repetida (o dos con el mismo fondo) no puede tocar la misma fila dos veces en un upsert.
      const unicas = [...new Map(leidas.map((f) => [`${f.fondo}|${f.moneda}|${f.plazo_dias}`, f])).values()];
      const nuevas = soloCambios(unicas, ultimos);
      guardadas[SAFI_RESERVAS] = nuevas.length
        ? await ctx.guardar("fondos_rendimientos", nuevas.map((f) => ({ ...f, ...base, fuente_id: "afi_reservas" })), { conflicto: CONFLICTO })
        : 0;
    }

    if (guardadas[SAFI_EXCEL] === undefined && paginasOk === 0) throw new Error(advertencias.join(" · "));
    return {
      parcial: advertencias.length > 0,
      advertencias,
      detalle: { guardadas, paginas_reservas: paginasOk, pendientes: ["AFI Universal", "AFI Popular", "Pioneer", "BHD Fondos (manual)"] },
    };
  },
};
