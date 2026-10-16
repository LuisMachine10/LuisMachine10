import { describe, expect, it } from "vitest";
import { analizarArchivo, cargaParaBase, exportar } from "./importar";
import { leerCierre, leerParametros } from "./validar";

// Archivo SINTÉTICO con la misma forma que guarda el artefacto (números JSON, tasas como fracción).
// Las cifras son inventadas para la prueba.
const ARCHIVO = `{
  "parametros": {
    "fx": { "DOP": 1, "USD": 60.25, "EUR": 66.5 },
    "fxUpdated": "2026-09-30",
    "inflacion": 0.05, "tasaRetiro": 0.04, "aporteMensual": 8000, "retornoObjetivo": 0.09,
    "incrAporteAnual": 0, "horizonte": 3, "metaFondo": 4, "metaAhorro": 0.15, "metaUsoTC": 0.35,
    "metaAsignacion": { "efectivo": 0.05, "ahorros": 0.15, "rentafija": 0.5, "accionesusa": 0.3 },
    "bandaRebalanceo": 0.03, "maxEmisor": 0.3,
    "escenarios": [{ "id": "base", "nom": "Base", "retorno": 0.09, "inflacion": 0.05, "deprecFX": 0.02, "aporte": 8000 }],
    "tarjetas": [{ "id": "tc-1", "nombre": "Tarjeta", "limite": 20000 }],
    "ingresos": [{ "id": "in-1", "nombre": "Salario", "pres": 50000.10 }],
    "fijos": [{ "id": "gf-1", "nombre": "Alquiler", "pres": 15000 }],
    "variables": [], "aportes": []
  },
  "activos": [
    { "id": "a1", "clase": "ahorros", "nombre": "Ahorros", "inst": "Banco", "moneda": "DOP", "cantidad": 1000.10, "precio": 1, "tasa": 0.075 },
    { "id": "a2", "clase": "rentafija", "nombre": "Certificado", "inst": "Banco", "moneda": "DOP", "cantidad": 20000, "precio": 1, "tasa": 0.08, "venc": "2027-12-31", "tipoRF": "acumula" },
    { "id": "a3", "clase": "rentafija", "nombre": "Mutuo", "inst": "Puesto", "moneda": "DOP", "cantidad": 5000, "precio": 1, "tasa": 0.09, "venc": "", "tipoRF": "acumula" },
    { "id": "a4", "clase": "accionesusa", "nombre": "ETF", "simbolo": "abc", "inst": "Corredor", "moneda": "USD", "cantidad": 1, "precio": 50.5, "tasa": 0 }
  ],
  "transacciones": [
    { "id": "t1", "activoId": "a4", "simbolo": "ABC", "tipo": "compra", "fecha": "2026-03-02", "cantidad": 1, "precio": 90.5, "comision": 0, "moneda": "USD" }
  ],
  "cierres": {
    "2026-01": { "agregado": true, "totIngresos": 41000, "totFijos": 8000, "totVariables": 9500, "totAportes": 7000, "tarjetas": { "tc-1": { "uso": 4000, "full": true } }, "cerrado": true },
    "2026-02": { "ingresos": { "in-1": 50000 }, "fijos": { "gf-1": null }, "deudas": { "tc": 0, "prestamos": 0, "otras": 0 },
                 "snap": { "activos": 123456.70, "pasivos": 0, "patrimonio": 123456.70, "liquidos": 20000, "ingresoPasivoAnual": 8000, "fecha": "2026-02-28", "fx": { "USD": 59, "EUR": 66 } },
                 "cerrado": true, "nota": "Nota de prueba." }
  },
  "ips": { "horizonte": "Texto de prueba", "objetivo": "", "editadoPor": "borrador" }
}`;

describe("analizarArchivo", () => {
  const r = analizarArchivo(ARCHIVO);

  it("acepta el formato del artefacto y convierte cada número a texto decimal exacto", () => {
    expect(r.errores).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.datos.parametros!.fx).toEqual({ USD: "60.25", EUR: "66.5" });
    expect(r.datos.parametros!.ingresos[0].pres).toBe("50000.1");
    expect(r.datos.activos![0].cantidad).toBe("1000.1");
    expect(r.datos.cierres!["2026-02"].snap!.patrimonio).toBe("123456.7");
    expect(r.datos.cierres!["2026-02"].fijos).toEqual({ "gf-1": null });
  });

  it("normaliza: símbolo en mayúsculas, vencimiento vacío = sin vencimiento", () => {
    expect(r.datos.activos![3].simbolo).toBe("ABC");
    expect(r.datos.activos![2].venc).toBeNull();
    expect(r.datos.activos![3].tipoRF).toBeNull();
  });

  it("arma el resumen de lo que se va a importar", () => {
    expect(r.resumen.activos).toEqual({ total: 4, porClase: { ahorros: 1, rentafija: 2, accionesusa: 1 }, conSimbolo: ["ABC"] });
    expect(r.resumen.cierres).toEqual({ total: 2, desde: "2026-01", hasta: "2026-02", conFoto: 1, cerrados: 2 });
    expect(r.resumen.transacciones).toMatchObject({ total: 1, desde: "2026-03-02", sinActivo: 0 });
    expect(r.resumen.parametros).toMatchObject({ tarjetas: 1, partidas: 2, escenarios: 1, fxManual: ["USD", "EUR"] });
    expect(r.resumen.ips).toEqual({ secciones: 1, editadoPor: "borrador" });
  });

  it("la carga para la base usa los nombres de columna y solo las secciones presentes", () => {
    const c = cargaParaBase(r.datos);
    expect(Object.keys(c).sort()).toEqual(["activos", "cierres", "ips", "parametros", "transacciones"]);
    expect((c.activos as { institucion: string; orden: number }[])[1]).toMatchObject({ institucion: "Banco", orden: 1, vencimiento: "2027-12-31", tipo_rf: "acumula" });
    expect((c.transacciones as { activo_id: string }[])[0].activo_id).toBe("a4");
    expect((c.cierres as { mes: string }[]).map((x) => x.mes)).toEqual(["2026-01", "2026-02"]);
    expect(Object.keys(cargaParaBase(analizarArchivo('{"activos": []}').datos))).toEqual(["activos"]);
  });

  it("lo exportado se vuelve a importar igual", () => {
    const texto = exportar({
      parametros: r.datos.parametros!,
      activos: r.datos.activos!,
      transacciones: r.datos.transacciones!,
      cierres: r.datos.cierres!,
      ips: r.datos.ips!,
    });
    const otra = analizarArchivo(texto);
    expect(otra.errores).toEqual([]);
    expect(otra.datos).toEqual(r.datos);
  });
});

describe("analizarArchivo · errores", () => {
  it("JSON roto o vacío", () => {
    expect(analizarArchivo("{no").errores[0]).toMatch(/no es JSON válido/);
    expect(analizarArchivo("[]").ok).toBe(false);
    expect(analizarArchivo('{"otra": 1}').errores[0]).toMatch(/ninguna sección/);
  });

  it("señala cada problema con su ruta", () => {
    const r = analizarArchivo(`{
      "activos": [
        { "id": "a1", "clase": "cripto", "nombre": "X", "moneda": "BTC", "cantidad": "uno" },
        { "id": "a1", "clase": "ahorros", "nombre": "Y", "moneda": "DOP", "cantidad": 1, "venc": "2026-02-30" }
      ],
      "cierres": { "2026-13": {}, "2026-01": { "ingresos": { "in-1": "abc" }, "cerrado": "sí" } },
      "transacciones": [{ "id": "t1", "activoId": "a1", "tipo": "regalo", "cantidad": -1 }]
    }`);
    expect(r.ok).toBe(false);
    const todo = r.errores.join("\n");
    expect(todo).toMatch(/activos\[0\]\.clase: clase desconocida «cripto»/);
    expect(todo).toMatch(/activos\[0\]\.moneda: moneda desconocida «BTC»/);
    expect(todo).toMatch(/activos\[0\]\.cantidad: «uno» no es un número/);
    expect(todo).toMatch(/activos\[1\]\.venc: fecha inválida/);
    expect(todo).toMatch(/activos: id repetido «a1»/);
    expect(todo).toMatch(/cierres: mes inválido «2026-13»/);
    expect(todo).toMatch(/cierres\.2026-01\.ingresos\.in-1: «abc» no es un número/);
    expect(todo).toMatch(/cierres\.2026-01\.cerrado: debe ser true o false/);
    expect(todo).toMatch(/transacciones\[0\]\.tipo: tipo desconocido «regalo»/);
    expect(todo).toMatch(/transacciones\[0\]\.cantidad: debe ser ≥ 0/);
  });

  it("acepta los nombres del almacenamiento local del artefacto e ignora MERCADO", () => {
    const r = analizarArchivo('{"ACTIVOS": [], "TX": [], "CIERRES": {}, "MERCADO": {"2026-10-01": {"usdDop": 60}}}');
    expect(r.ok).toBe(true);
    expect(Object.keys(r.datos).sort()).toEqual(["activos", "cierres", "transacciones"]);
    expect(r.avisos.join(" ")).toMatch(/MERCADO/);
  });

  it("parámetros incompletos: avisa qué falta y lo deja sin configurar", () => {
    const r = analizarArchivo('{"parametros": {"inflacion": 0.05}}');
    expect(r.ok).toBe(true);
    expect(r.datos.parametros!.inflacion).toBe("0.05");
    expect(r.datos.parametros!.fx).toEqual({ USD: null, EUR: null });
    expect(r.avisos[0]).toMatch(/no trae fx/);
  });
});

describe("lectura desde la base", () => {
  it("valida el jsonb guardado y explica si está dañado", () => {
    expect(leerParametros({ inflacion: "0.04" }).inflacion).toBe("0.04");
    expect(() => leerParametros({ inflacion: "mucho" })).toThrow(/personal\.parametros/);
    expect(leerCierre("2026-01", { cerrado: true }).cerrado).toBe(true);
  });
});
