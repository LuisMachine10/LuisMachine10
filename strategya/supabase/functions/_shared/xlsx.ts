// Lector puro de archivos .xlsx (Office Open XML) para la ingesta.
//
// · Descomprime con fflate y lee el XML con fast-xml-parser. Sin Deno ni Node: corre en ambos.
// · Cada celda conserva el TEXTO exacto que trae el XML (`<v>…</v>`): nunca pasa por float.
// · Resuelve sharedStrings (incluido texto enriquecido), cadenas en línea y resultados de fórmulas.
// · Expone el formato numérico de cada celda: así se sabe si 0.055 se muestra como «5.50%».
// · Varias hojas; las hojas de gráfico (chartsheet) aparecen vacías.
//
// Especificación: ECMA-376 Parte 1 (SpreadsheetML), §18.3 (worksheets) y §18.8 (styles).

import Big from "big.js";
import { strFromU8, unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

export type TipoCelda = "numero" | "texto" | "booleano" | "error";

export interface CeldaXlsx {
  /** Referencia A1, p. ej. "D8977". */
  ref: string;
  columna: string;
  fila: number;
  tipo: TipoCelda;
  /** Texto exacto del XML (número tal cual, p. ej. "5.2499999999999998E-2") o la cadena resuelta. */
  texto: string;
  /** Código de formato numérico de la celda ("0.00%", "General", "dd/mm/yyyy"…). */
  formato: string;
}

export interface HojaXlsx {
  nombre: string;
  /** Filas con al menos una celda con valor, en orden. */
  numerosDeFila: number[];
  fila(n: number): ReadonlyMap<string, CeldaXlsx>;
  celda(ref: string): CeldaXlsx | undefined;
  /** Texto de la celda sin espacios a los lados, o undefined si está vacía. */
  texto(ref: string): string | undefined;
}

export interface LibroXlsx {
  hojas: HojaXlsx[];
  /** true si el libro usa el sistema de fechas 1904 (Mac antiguo). */
  fecha1904: boolean;
  hoja(nombre: string): HojaXlsx | undefined;
}

/** Formatos numéricos predefinidos que importan (ECMA-376 §18.8.30). */
const FORMATOS_PREDEFINIDOS: Readonly<Record<string, string>> = {
  "0": "General",
  "1": "0",
  "2": "0.00",
  "3": "#,##0",
  "4": "#,##0.00",
  "9": "0%",
  "10": "0.00%",
  "11": "0.00E+00",
  "14": "mm-dd-yy",
  "15": "d-mmm-yy",
  "16": "d-mmm",
  "17": "mmm-yy",
  "18": "h:mm AM/PM",
  "19": "h:mm:ss AM/PM",
  "20": "h:mm",
  "21": "h:mm:ss",
  "22": "m/d/yy h:mm",
  "45": "mm:ss",
  "46": "[h]:mm:ss",
  "47": "mmss.0",
  "49": "@",
};

const NOMBRES_ARREGLO = new Set(["row", "c", "si", "r", "sheet", "Relationship", "xf", "numFmt"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false, // los números se quedan como texto
  parseAttributeValue: false,
  trimValues: false, // los espacios de las cadenas son parte del dato
  isArray: (nombre) => NOMBRES_ARREGLO.has(nombre),
});

// deno-lint-ignore no-explicit-any
type Nodo = any;

function textoDe(nodo: Nodo): string {
  if (nodo === undefined || nodo === null) return "";
  if (typeof nodo === "string") return nodo;
  if (typeof nodo === "object" && "#text" in nodo) return String(nodo["#text"]);
  return "";
}

/** Texto de un <si> o <is>: <t> directo o la suma de las corridas <r><t>. Se ignora la fonética (<rPh>). */
function textoCadena(si: Nodo): string {
  if (!si || typeof si !== "object") return textoDe(si);
  if (si.t !== undefined) return textoDe(si.t);
  if (Array.isArray(si.r)) return si.r.map((r: Nodo) => textoDe(r?.t)).join("");
  return "";
}

function leerXml(archivos: Record<string, Uint8Array>, ruta: string): Nodo | null {
  const bytes = archivos[ruta];
  if (!bytes) return null;
  return parser.parse(strFromU8(bytes));
}

/** Ruta interna del archivo a partir del Target de una relación del libro. */
function resolverDestino(destino: string): string {
  if (destino.startsWith("/")) return destino.slice(1);
  const partes = `xl/${destino}`.split("/");
  const salida: string[] = [];
  for (const p of partes) {
    if (p === "..") salida.pop();
    else if (p !== ".") salida.push(p);
  }
  return salida.join("/");
}

const REF = /^([A-Z]+)(\d+)$/;

/** Columna "A" → 1, "Z" → 26, "AA" → 27. */
export function indiceColumna(letras: string): number {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** 1 → "A", 27 → "AA". */
export function letraColumna(indice: number): string {
  let s = "";
  let n = indice;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function crearHoja(nombre: string, celdas: CeldaXlsx[]): HojaXlsx {
  const filas = new Map<number, Map<string, CeldaXlsx>>();
  const porRef = new Map<string, CeldaXlsx>();
  for (const c of celdas) {
    let f = filas.get(c.fila);
    if (!f) filas.set(c.fila, (f = new Map()));
    f.set(c.columna, c);
    porRef.set(c.ref, c);
  }
  const numeros = [...filas.keys()].sort((a, b) => a - b);
  const vacia: ReadonlyMap<string, CeldaXlsx> = new Map();
  return {
    nombre,
    numerosDeFila: numeros,
    fila: (n) => filas.get(n) ?? vacia,
    celda: (ref) => porRef.get(ref),
    texto(ref) {
      const t = porRef.get(ref)?.texto.trim();
      return t ? t : undefined;
    },
  };
}

/** Lee un .xlsx completo. Lanza un error en español si el archivo no es un libro válido. */
export function leerXlsx(bytes: Uint8Array): LibroXlsx {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes, { filter: (f) => f.name.endsWith(".xml") || f.name.endsWith(".rels") });
  } catch (e) {
    throw new Error(`El archivo no es un .xlsx válido (no se pudo descomprimir: ${(e as Error).message})`);
  }
  const libro = leerXml(archivos, "xl/workbook.xml");
  if (!libro?.workbook) throw new Error("El archivo no es un .xlsx válido (falta xl/workbook.xml)");
  const rels = leerXml(archivos, "xl/_rels/workbook.xml.rels");
  const destinos = new Map<string, string>();
  for (const r of rels?.Relationships?.Relationship ?? []) destinos.set(r["@_Id"], r["@_Target"]);

  const pr = libro.workbook.workbookPr;
  const fecha1904 = pr ? ["1", "true"].includes(String(pr["@_date1904"] ?? "").toLowerCase()) : false;

  // Cadenas compartidas
  const compartidas: string[] = (leerXml(archivos, "xl/sharedStrings.xml")?.sst?.si ?? []).map(textoCadena);

  // Estilos → formato numérico por índice de estilo (atributo s de la celda)
  const estilos = leerXml(archivos, "xl/styles.xml")?.styleSheet;
  const propios = new Map<string, string>();
  for (const f of estilos?.numFmts?.numFmt ?? []) propios.set(String(f["@_numFmtId"]), String(f["@_formatCode"]));
  const formatoPorEstilo: string[] = (estilos?.cellXfs?.xf ?? []).map((xf: Nodo) => {
    const id = String(xf["@_numFmtId"] ?? "0");
    return propios.get(id) ?? FORMATOS_PREDEFINIDOS[id] ?? "General";
  });

  const hojas: HojaXlsx[] = [];
  for (const h of libro.workbook.sheets?.sheet ?? []) {
    const nombre = String(h["@_name"]);
    const destino = destinos.get(h["@_id"]);
    const doc = destino ? leerXml(archivos, resolverDestino(destino)) : null;
    const datos = doc?.worksheet?.sheetData;
    const celdas: CeldaXlsx[] = [];
    for (const fila of (datos && typeof datos === "object" ? datos.row : null) ?? []) {
      for (const c of fila?.c ?? []) {
        const ref = String(c["@_r"] ?? "");
        const m = REF.exec(ref);
        if (!m) continue; // sin referencia explícita (no lo genera Excel); se omite antes que adivinar
        const t = String(c["@_t"] ?? "n");
        let texto: string;
        let tipo: TipoCelda;
        if (t === "s") {
          const i = Number(textoDe(c.v));
          if (!Number.isInteger(i) || i < 0 || i >= compartidas.length) continue;
          texto = compartidas[i];
          tipo = "texto";
        } else if (t === "inlineStr") {
          texto = textoCadena(c.is);
          tipo = "texto";
        } else if (t === "str") {
          texto = textoDe(c.v);
          tipo = "texto";
        } else if (t === "b") {
          texto = textoDe(c.v);
          tipo = "booleano";
        } else if (t === "e") {
          texto = textoDe(c.v);
          tipo = "error";
        } else {
          if (c.v === undefined) continue; // celda solo con estilo
          texto = textoDe(c.v).trim();
          tipo = "numero";
        }
        if (texto === "" && tipo !== "texto") continue;
        const s = Number(c["@_s"] ?? 0);
        celdas.push({
          ref,
          columna: m[1],
          fila: Number(m[2]),
          tipo,
          texto,
          formato: formatoPorEstilo[s] ?? "General",
        });
      }
    }
    hojas.push(crearHoja(nombre, celdas));
  }
  return {
    hojas,
    fecha1904,
    hoja: (nombre) => hojas.find((h) => h.nombre === nombre),
  };
}

// ---------------------------------------------------------------------------
// Números y fechas
// ---------------------------------------------------------------------------

const NUMERO_XML = /^-?(\d+\.?\d*|\.\d+)(E[+-]?\d+)?$/i;

/**
 * Número de una celda como decimal exacto. Excel guarda dobles y solo garantiza 15 cifras
 * significativas (lo que él mismo muestra); el XML trae hasta 17 («59.234999999999999»).
 * Se redondea a 15 cifras con aritmética decimal (big.js): «59.234999999999999» → «59.235».
 * Devuelve null si el texto no es un número.
 */
export function numeroExcel(texto: string | undefined): string | null {
  if (texto === undefined) return null;
  const s = texto.trim();
  if (!NUMERO_XML.test(s)) return null;
  const fijo = new Big(s).prec(15, Big.roundHalfUp).toFixed();
  return fijo === "-0" ? "0" : fijo;
}

/** ¿El formato muestra el valor como porcentaje (0.055 → «5.50%»)? Ignora el % entre comillas. */
export function esFormatoPorcentaje(formato: string): boolean {
  return /%/.test(formato.replace(/"[^"]*"|\\./g, ""));
}

/** ¿El formato es de fecha u hora? */
export function esFormatoFecha(formato: string): boolean {
  const limpio = formato.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "");
  return /[dmyhs]/i.test(limpio) && !/^General$/i.test(limpio);
}

/**
 * Valor de una celda en la unidad que se ve en pantalla: si el formato es de porcentaje,
 * la fracción se multiplica por 100 (0.0525 → «5.25»); si no, queda igual.
 */
export function valorVisible(c: CeldaXlsx | undefined): string | null {
  if (!c || c.tipo !== "numero") return null;
  const n = numeroExcel(c.texto);
  if (n === null) return null;
  if (!esFormatoPorcentaje(c.formato)) return n;
  const fijo = new Big(n).times(100).toFixed();
  return fijo === "-0" ? "0" : fijo;
}

/**
 * Fecha serial de Excel → "AAAA-MM-DD". Sistema 1900: el día 60 es el 29 feb 1900 que no
 * existió (error heredado de Lotus 1-2-3) y no se acepta. La parte fraccionaria (hora) se ignora.
 */
export function serialAFecha(serial: string, fecha1904 = false): string {
  const s = serial.trim();
  if (!NUMERO_XML.test(s)) throw new Error(`Fecha serial inválida «${serial}»`);
  const dias = Number(new Big(s).round(0, Big.roundDown).toFixed());
  if (!Number.isSafeInteger(dias) || dias < (fecha1904 ? 0 : 1)) throw new Error(`Fecha serial fuera de rango «${serial}»`);
  let base: number;
  let desplazamiento: number;
  if (fecha1904) {
    base = Date.UTC(1904, 0, 1);
    desplazamiento = dias;
  } else if (dias === 60) {
    throw new Error("La fecha serial 60 (29 feb 1900) no existe");
  } else {
    base = Date.UTC(1899, 11, 31);
    desplazamiento = dias < 60 ? dias : dias - 1;
  }
  return new Date(base + desplazamiento * 86_400_000).toISOString().slice(0, 10);
}
