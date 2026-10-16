// Utilidades puras para las fuentes de República Dominicana (BCRD, Crédito Público, SIMV, MICM).

import Big from "big.js";

const MESES: Readonly<Record<string, number>> = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
};

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "Ago", "agosto", "Septiembre", "Sept." → 8, 9… ; null si no es un mes. */
export function numeroMes(texto: string | undefined): number | null {
  if (!texto) return null;
  const clave = sinTildes(texto.trim().toLowerCase()).replace(/\.$/, "");
  return MESES[clave] ?? null;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** ¿Existe ese día en el calendario? */
export function fechaValida(anio: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  if (anio < 1900 || anio > 2200 || mes < 1 || mes > 12 || dia < 1) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** AAAA-MM-DD, o null si la fecha no existe. */
export function fechaIso(anio: number, mes: number, dia: number): string | null {
  return fechaValida(anio, mes, dia) ? `${anio}-${dos(mes)}-${dos(dia)}` : null;
}

/** Último día del mes: (2026, 2) → "2026-02-28". Los datos mensuales se fechan al cierre del mes. */
export function finDeMes(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0));
  return `${anio}-${dos(mes)}-${dos(d.getUTCDate())}`;
}

/** Primer día del mes: (2026, 10) → "2026-10-01". */
export function inicioDeMes(anio: number, mes: number): string {
  return `${anio}-${dos(mes)}-01`;
}

/** "14 de Octubre 2026", "14 de octubre de 2026" → "2026-10-14". */
export function fechaEnTexto(texto: string): string | null {
  const m = /(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+(?:de(?:l)?\s+)?(\d{4})/.exec(texto);
  if (!m) return null;
  const mes = numeroMes(m[2]);
  return mes ? fechaIso(Number(m[3]), mes, Number(m[1])) : null;
}

/** "Septiembre 2026" → { anio: 2026, mes: 9 }. */
export function mesEnTexto(texto: string): { anio: number; mes: number } | null {
  const m = /([A-Za-zÁÉÍÓÚáéíóú]+)\s+(?:de\s+)?(\d{4})/.exec(texto);
  if (!m) return null;
  const mes = numeroMes(m[1]);
  return mes ? { anio: Number(m[2]), mes } : null;
}

/** "dd/mm/aaaa" → "aaaa-mm-dd". */
export function fechaDdMmAaaa(texto: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  return m ? fechaIso(Number(m[3]), Number(m[2]), Number(m[1])) : null;
}

/** Fecha de hoy en RD (UTC−4, sin horario de verano). */
export function hoyRD(ahora: Date): string {
  return new Date(ahora.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
}

/** Resta meses a una fecha AAAA-MM-DD y devuelve el primer día de ese mes. */
export function mesesAtras(fecha: string, meses: number): string {
  const [a, m] = fecha.split("-").map(Number);
  const total = a * 12 + (m - 1) - meses;
  return inicioDeMes(Math.floor(total / 12), (total % 12) + 1);
}

/**
 * Número escrito por una persona en una página ("61.1477", "1,525.40", "5.12%") → decimal exacto.
 * Solo acepta el formato con coma de miles y punto decimal que usan BCRD y MICM. Null si no encaja.
 */
export function numeroPagina(texto: string | undefined): string | null {
  if (!texto) return null;
  const s = texto.replace(/\s+/g, "").replace(/%$/, "");
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) return null;
  return new Big(s.replace(/,/g, "")).toFixed();
}

/** ¿El decimal está dentro del rango [min, max]? (comparación exacta con big.js) */
export function enRango(valor: string, min: number, max: number): boolean {
  const v = new Big(valor);
  return v.gte(min) && v.lte(max);
}

const ENTIDADES: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", ordm: "º", ordf: "ª",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", iquest: "¿", iexcl: "¡",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", deg: "°", reg: "®", copy: "©",
};

/** Decodifica entidades HTML (&#250; &#xF3; &aacute; &amp;…). Las desconocidas se dejan tal cual. */
export function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, ent: string) => {
    if (ent[0] === "#") {
      const n = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : todo;
    }
    return ENTIDADES[ent] ?? todo;
  });
}

/** Quita etiquetas HTML, decodifica entidades y colapsa espacios. */
export function textoPlano(html: string): string {
  return decodificarEntidades(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Recorte de `html` desde la primera coincidencia de `inicio` hasta la siguiente de `fin` (o el final). */
export function seccion(html: string, inicio: RegExp, fin?: RegExp): string | null {
  const i = html.search(inicio);
  if (i < 0) return null;
  const resto = html.slice(i);
  if (!fin) return resto;
  const j = resto.slice(1).search(fin);
  return j < 0 ? resto : resto.slice(0, j + 1);
}
