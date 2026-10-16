// SEC EDGAR · índice diario por tipo de formulario (Fusiones e IPO).
//   https://www.sec.gov/Archives/edgar/daily-index/AAAA/QTRn/form.AAAAMMDD.idx
// robots.txt de sec.gov prohíbe /cgi-bin (feeds Atom); /Archives/edgar/daily-index/ está permitido.
// La SEC exige un User-Agent con correo: el lector lo agrega solo para sec.gov (STRATEGYA_CONTACTO).
// Muestra real (truncada) del 14 oct 2026 en pruebas/muestras/sec/.
//
// Formato del índice: encabezado, una línea de guiones y luego columnas de ancho fijo:
//   Form Type (0–16) · Company Name (17–78) · CIK (79–90) · Date Filed (91–102) · File Name (103–)

import type { Tarea } from "../ingesta.ts";
import { ErrorIngesta } from "../http.ts";

export type TipoOperacion = "ipo" | "fusion";

/** Formularios que interesan y qué indican. Nada más se guarda. */
export const FORMULARIOS_SEC: Readonly<Record<string, { tipo: TipoOperacion; descripcion: string }>> = {
  "S-1": { tipo: "ipo", descripcion: "Registro de oferta (empresa de EE. UU.)" },
  "F-1": { tipo: "ipo", descripcion: "Registro de oferta (empresa extranjera)" },
  "424B4": { tipo: "ipo", descripcion: "Prospecto final con precio" },
  "425": { tipo: "fusion", descripcion: "Comunicación sobre una fusión o canje" },
  DEFM14A: { tipo: "fusion", descripcion: "Proxy definitivo de fusión" },
  PREM14A: { tipo: "fusion", descripcion: "Proxy preliminar de fusión" },
  "SC TO-T": { tipo: "fusion", descripcion: "Oferta pública de adquisición (de un tercero)" },
  "SC 14D9": { tipo: "fusion", descripcion: "Respuesta de la empresa a una oferta pública" },
};

export interface OperacionSec {
  form: string;
  tipo: TipoOperacion;
  empresa: string;
  cik: string;
  /** Fecha de presentación (AAAA-MM-DD). */
  fecha: string;
  /** Página índice de la presentación en EDGAR. */
  url: string;
  /** Ruta del archivo en el índice (edgar/data/CIK/ACCESION.txt): identifica la presentación. */
  archivo: string;
  /** Día del índice del que salió. */
  indice_fecha: string;
  fuente_id: string;
}

const LINEA = /^(.+?)\s{2,}(.+?)\s{2,}(\d{1,10})\s+(\d{8})\s+(edgar\/data\/\S+\.txt)\s*$/;

/** Columnas de ancho fijo; si una línea no las respeta, se intenta por separación de 2+ espacios. */
function columnas(linea: string): [string, string, string, string, string] | null {
  const fijo: [string, string, string, string, string] = [
    linea.slice(0, 17).trim(),
    linea.slice(17, 79).trim(),
    linea.slice(79, 91).trim(),
    linea.slice(91, 103).trim(),
    linea.slice(103).trim(),
  ];
  if (fijo[0] && fijo[1] && /^\d{1,10}$/.test(fijo[2]) && /^\d{8}$/.test(fijo[3]) && /^edgar\/data\/\S+\.txt$/.test(fijo[4])) {
    return fijo;
  }
  const m = LINEA.exec(linea);
  return m ? [m[1].trim(), m[2].trim(), m[3], m[4], m[5]] : null;
}

/** edgar/data/1811470/0001811470-25-000023.txt → página índice de esa presentación. */
export function urlPresentacion(archivo: string): string | null {
  const m = /^edgar\/data\/(\d+)\/(\d{10}-\d{2}-\d{6})\.txt$/.exec(archivo);
  if (!m) return null;
  return `https://www.sec.gov/Archives/edgar/data/${m[1]}/${m[2].replace(/-/g, "")}/${m[2]}-index.htm`;
}

export interface LecturaIndice {
  operaciones: OperacionSec[];
  /** Filas de datos leídas (de todos los formularios). */
  filas: number;
  advertencias: string[];
}

export function parsearIndiceSec(texto: string, indiceFecha: string): LecturaIndice {
  const lineas = texto.split(/\r?\n/);
  const inicio = lineas.findIndex((l) => /^-{20,}\s*$/.test(l));
  if (!lineas.some((l) => /^Form Type\s+Company Name/.test(l)) || inicio < 0) {
    throw new Error("Formato inesperado: no es un índice diario de EDGAR por formulario (form.idx)");
  }
  const operaciones: OperacionSec[] = [];
  const advertencias: string[] = [];
  let filas = 0;
  for (const linea of lineas.slice(inicio + 1)) {
    if (!linea.trim()) continue;
    const c = columnas(linea);
    if (!c) continue; // línea cortada (muestra truncada) o fuera de formato
    filas++;
    const [form, empresa, cik, crudaFecha, archivo] = c;
    const def = FORMULARIOS_SEC[form];
    if (!def) continue;
    const url = urlPresentacion(archivo);
    const fecha = `${crudaFecha.slice(0, 4)}-${crudaFecha.slice(4, 6)}-${crudaFecha.slice(6, 8)}`;
    if (!url) {
      advertencias.push(`Ruta de archivo inesperada: ${archivo}`);
      continue;
    }
    operaciones.push({
      form,
      tipo: def.tipo,
      empresa,
      cik,
      fecha,
      url,
      archivo,
      indice_fecha: indiceFecha,
      fuente_id: "sec_edgar",
    });
  }
  return { operaciones, filas, advertencias };
}

/** Fecha de Nueva York (AAAA-MM-DD) de un instante. */
export function fechaNuevaYork(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function esFinDeSemana(fecha: string): boolean {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
}

/**
 * Días a consultar: el día hábil anterior (lunes a viernes, en Nueva York) y hoy si es día hábil.
 * Los feriados no se adivinan: ese día la SEC no publica índice (404) y la tarea lo anota sin error.
 */
export function diasIndiceSec(ahora: Date): string[] {
  const hoy = fechaNuevaYork(ahora);
  let anterior = sumarDias(hoy, -1);
  while (esFinDeSemana(anterior)) anterior = sumarDias(anterior, -1);
  return esFinDeSemana(hoy) ? [anterior] : [anterior, hoy];
}

export function urlIndiceSec(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  const trimestre = Math.ceil(Number(m) / 3);
  return `https://www.sec.gov/Archives/edgar/daily-index/${a}/QTR${trimestre}/form.${a}${m}${d}.idx`;
}

export const tareaSec: Tarea = {
  nombre: "sec-edgar",
  fuenteId: "sec_edgar",
  async ejecutar(ctx) {
    const dias = diasIndiceSec(ctx.ahora);
    const advertencias: string[] = [];
    const sinIndice: string[] = [];
    const leidos: string[] = [];
    let operaciones = 0;
    let nuevas = 0;
    for (const dia of dias) {
      try {
        const r = await ctx.obtener(urlIndiceSec(dia));
        const lectura = parsearIndiceSec(r.texto, dia);
        advertencias.push(...lectura.advertencias);
        operaciones += lectura.operaciones.length;
        nuevas += await ctx.guardar("operaciones_sec", lectura.operaciones as unknown as Record<string, unknown>[], {
          conflicto: "archivo,cik,form",
          ignorarDuplicados: true,
        });
        leidos.push(dia);
      } catch (e) {
        // 404: el índice de ese día no existe todavía (o es feriado). No es un error de la tarea.
        // Un 403 sí se reporta: es un bloqueo y no se esquiva.
        if (e instanceof ErrorIngesta && e.status === 404) sinIndice.push(dia);
        else advertencias.push(`Índice del ${dia}: ${(e as Error).message}`);
      }
    }
    if (leidos.length === 0 && advertencias.length > 0) throw new Error(advertencias.join(" · "));
    return {
      parcial: advertencias.length > 0,
      advertencias,
      detalle: { dias, leidos, sin_indice: sinIndice, operaciones, nuevas },
    };
  },
};
