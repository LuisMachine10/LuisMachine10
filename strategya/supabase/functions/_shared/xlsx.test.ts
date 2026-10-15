import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  esFormatoFecha,
  esFormatoPorcentaje,
  indiceColumna,
  leerXlsx,
  letraColumna,
  numeroExcel,
  serialAFecha,
  valorVisible,
} from "./xlsx.ts";

const MUESTRAS = join(import.meta.dirname, "..", "..", "..", "pruebas", "muestras", "bcrd");
const abrir = (archivo: string) => leerXlsx(new Uint8Array(readFileSync(join(MUESTRAS, archivo))));

describe("leerXlsx · libros reales del BCRD", () => {
  it("lee las 7 hojas del Excel del dólar, con el texto exacto de cada celda", () => {
    const libro = abrir("TASA_DOLAR_REFERENCIA_MC.xlsx");
    expect(libro.hojas.map((h) => h.nombre)).toEqual([
      "Diaria", "PromMensual", "PromTrimestral", "PromAnual", "FPMensual", "FPTrimestral", "FPAnual",
    ]);
    expect(libro.fecha1904).toBe(false);
    const diaria = libro.hoja("Diaria")!;
    expect(diaria.texto("A1")).toBe("Tasas de Cambio del dólar de Referencia del Mercado Spot");
    expect(diaria.numerosDeFila.at(-1)).toBe(8985);
    // El XML trae el doble con 17 cifras; el lector no lo toca.
    expect(diaria.celda("D8985")).toMatchObject({ tipo: "numero", texto: "61.114899999999999", formato: "0.0000" });
    expect(diaria.celda("B8985")).toMatchObject({ tipo: "texto", texto: "Oct" });
  });

  it("expone el formato de cada celda: la TPM es una fracción con formato de porcentaje", () => {
    const tpm = abrir("Serie_TPM.xlsx");
    expect(tpm.hojas.map((h) => h.nombre)).toEqual(["Tasas", "Gráfico"]);
    expect(tpm.hoja("Gráfico")!.numerosDeFila).toEqual([]); // hoja de gráfico: sin celdas
    const c = tpm.hoja("Tasas")!.celda("C280")!;
    expect(c).toMatchObject({ texto: "5.5E-2", formato: "0.00%" });
    expect(valorVisible(c)).toBe("5.5");
  });

  it("distingue celdas en % y en fracción dentro del mismo cuadro (pasivas MN)", () => {
    const h = abrir("tasas_pasivas_mn.xlsx").hojas[0];
    expect(h.celda("E13")).toMatchObject({ texto: "15.44", formato: "0.00" }); // dic 2001, ya en %
    expect(valorVisible(h.celda("E13"))).toBe("15.44");
    expect(h.celda("E309")).toMatchObject({ texto: "7.5683E-2", formato: "0.00%" }); // ago 2026, fracción
    expect(valorVisible(h.celda("E309"))).toBe("7.5683");
  });
});

// Libro mínimo construido según ECMA-376 para cubrir casos que las muestras no traen.
function libroMinimo(opciones: { fecha1904?: boolean } = {}): Uint8Array {
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const nsR = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  return zipSync({
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook ${ns} ${nsR}>${opciones.fecha1904 ? '<workbookPr date1904="1"/>' : ""}` +
        `<sheets><sheet name="Uno" sheetId="1" r:id="rId1"/><sheet name="Dos" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="x"/>` +
        `<Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml" Type="x"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `<?xml version="1.0"?><sst ${ns}><si><t xml:space="preserve">  con espacios </t></si>` +
        `<si><r><t>Tasa </t></r><r><rPr><b/></rPr><t>activa</t></r><rPh><t>X</t></rPh></si><si><t>A &amp; B</t></si></sst>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0"?><styleSheet ${ns}><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>` +
        `<cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="10"/><xf numFmtId="164"/><xf numFmtId="4"/></cellXfs></styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0"?><worksheet ${ns}><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
        `<row r="2"><c r="A2" s="1"><v>7.0000000000000007E-2</v></c><c r="B2" s="2"><v>45292</v></c>` +
        `<c r="C2" t="inlineStr"><is><t>en línea</t></is></c><c r="D2" t="b"><v>1</v></c><c r="E2" t="e"><v>#N/A</v></c>` +
        `<c r="F2" s="3"/><c r="G2" t="str"><f>A1</f><v>calculado</v></c><c r="AA2" s="3"><v>1234.5</v></c></row>` +
        `</sheetData></worksheet>`,
    ),
    "xl/worksheets/sheet2.xml": strToU8(`<?xml version="1.0"?><worksheet ${ns}><sheetData/></worksheet>`),
  });
}

describe("leerXlsx · casos de la especificación", () => {
  const libro = leerXlsx(libroMinimo());
  const uno = libro.hoja("Uno")!;

  it("resuelve sharedStrings (con espacios, texto enriquecido sin fonética y entidades)", () => {
    expect(uno.celda("A1")?.texto).toBe("  con espacios ");
    expect(uno.texto("A1")).toBe("con espacios");
    expect(uno.celda("B1")?.texto).toBe("Tasa activa");
    expect(uno.celda("C1")?.texto).toBe("A & B");
  });

  it("lee cadenas en línea, booleanos, errores y el resultado de fórmulas de texto", () => {
    expect(uno.celda("C2")).toMatchObject({ tipo: "texto", texto: "en línea" });
    expect(uno.celda("D2")).toMatchObject({ tipo: "booleano", texto: "1" });
    expect(uno.celda("E2")).toMatchObject({ tipo: "error", texto: "#N/A" });
    expect(uno.celda("G2")).toMatchObject({ tipo: "texto", texto: "calculado" });
  });

  it("omite celdas que solo tienen estilo y resuelve columnas de dos letras", () => {
    expect(uno.celda("F2")).toBeUndefined();
    expect(uno.celda("AA2")).toMatchObject({ columna: "AA", texto: "1234.5", formato: "#,##0.00" });
    expect([...uno.fila(2).keys()]).toEqual(["A", "B", "C", "D", "E", "G", "AA"]);
  });

  it("formatos predefinidos y propios; destinos de relación absolutos y relativos", () => {
    expect(uno.celda("A2")?.formato).toBe("0.00%");
    expect(valorVisible(uno.celda("A2"))).toBe("7");
    expect(uno.celda("B2")?.formato).toBe("dd/mm/yyyy");
    expect(serialAFecha(uno.celda("B2")!.texto, libro.fecha1904)).toBe("2024-01-01");
    expect(libro.hoja("Dos")!.numerosDeFila).toEqual([]);
  });

  it("sistema de fechas 1904", () => {
    const l = leerXlsx(libroMinimo({ fecha1904: true }));
    expect(l.fecha1904).toBe(true);
    expect(serialAFecha("0.5", true)).toBe("1904-01-01");
    expect(serialAFecha("43830", true)).toBe("2024-01-01");
  });

  it("rechaza lo que no es un .xlsx", () => {
    expect(() => leerXlsx(new TextEncoder().encode("<html>no</html>"))).toThrow(/no es un \.xlsx válido/);
    expect(() => leerXlsx(zipSync({ "otro.xml": strToU8("<a/>") }))).toThrow(/falta xl\/workbook\.xml/);
  });
});

describe("números y fechas de Excel", () => {
  it("numeroExcel redondea a las 15 cifras que guarda Excel, con aritmética decimal", () => {
    expect(numeroExcel("59.234999999999999")).toBe("59.235");
    expect(numeroExcel("61.114899999999999")).toBe("61.1149");
    expect(numeroExcel("4.4999999999999998E-2")).toBe("0.045");
    expect(numeroExcel("7.4205799813379367E-2")).toBe("0.0742057998133794");
    expect(numeroExcel("3.1633333333333336")).toBe("3.16333333333333");
    expect(numeroExcel("2026")).toBe("2026");
    expect(numeroExcel("-0")).toBe("0");
    expect(numeroExcel("abc")).toBeNull();
    expect(numeroExcel("")).toBeNull();
    expect(numeroExcel(undefined)).toBeNull();
  });

  it("serialAFecha (sistema 1900, con el 29 feb 1900 inexistente)", () => {
    expect(serialAFecha("1")).toBe("1900-01-01");
    expect(serialAFecha("59")).toBe("1900-02-28");
    expect(serialAFecha("61")).toBe("1900-03-01");
    expect(serialAFecha("46309.75")).toBe("2026-10-14");
    expect(() => serialAFecha("60")).toThrow(/no existe/);
    expect(() => serialAFecha("0")).toThrow(/fuera de rango/);
    expect(() => serialAFecha("hoy")).toThrow(/inválida/);
  });

  it("detecta formatos de porcentaje y de fecha", () => {
    expect(esFormatoPorcentaje("0.00%")).toBe(true);
    expect(esFormatoPorcentaje('0.00"%"')).toBe(false);
    expect(esFormatoPorcentaje("0.0000")).toBe(false);
    expect(esFormatoFecha("mmm-yy")).toBe(true);
    expect(esFormatoFecha("dd/mm/yyyy")).toBe(true);
    expect(esFormatoFecha("General")).toBe(false);
    expect(esFormatoFecha("#,##0.00")).toBe(false);
  });

  it("letras de columna", () => {
    expect(indiceColumna("A")).toBe(1);
    expect(indiceColumna("AA")).toBe(27);
    expect(letraColumna(27)).toBe("AA");
    expect(letraColumna(702)).toBe("ZZ");
  });
});
