import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { correrTarea, type FilaObservacion } from "../ingesta.ts";
import { leerXlsx } from "../xlsx.ts";
import {
  crearTareaBcrdExcel,
  CUADROS_TASAS,
  parsearCuadroTasas,
  parsearDolarExcel,
  parsearPortadaBcrd,
  parsearTbm,
  parsearTpmExcel,
  tareaBcrdPortada,
  URL_DOLAR_XLSX,
  URL_PORTADA_BCRD,
  URL_TPM_XLSX,
  urlMonetario,
} from "./bcrd.ts";

// Descargas reales del 15 oct 2026 (sonda en GitHub Actions). No se editan a mano.
const MUESTRAS = join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "bcrd");
const bytes = (archivo: string) => new Uint8Array(readFileSync(join(MUESTRAS, archivo)));
const libro = (archivo: string) => leerXlsx(bytes(archivo));
const PORTADA = readFileSync(join(MUESTRAS, "portada.html"), "utf8");

const valor = (filas: FilaObservacion[], serie: string, fecha?: string) =>
  filas.find((f) => f.serie_id === serie && (fecha === undefined || f.fecha_dato === fecha))?.valor;
const ultima = (filas: FilaObservacion[], serie: string) =>
  filas.filter((f) => f.serie_id === serie).sort((a, b) => a.fecha_dato.localeCompare(b.fecha_dato)).at(-1);

describe("parsearPortadaBcrd · portada real", () => {
  const r = parsearPortadaBcrd(PORTADA);

  it("lee el dólar del día: compra 61.1477 y venta 61.6788 del 14 oct 2026", () => {
    expect(valor(r.filas, "USDDOP_COMPRA")).toBe("61.1477");
    expect(valor(r.filas, "USDDOP_VENTA")).toBe("61.6788");
    expect(r.filas.find((f) => f.serie_id === "USDDOP_VENTA")?.fecha_dato).toBe("2026-10-14");
  });

  it("lee la inflación interanual de septiembre 2026 (general 5.12 % y subyacente 4.61 %), fechada al cierre del mes", () => {
    expect(valor(r.filas, "INFLACION_RD", "2026-09-30")).toBe("5.12");
    expect(valor(r.filas, "INFLACION_SUB_RD", "2026-09-30")).toBe("4.61");
  });

  it("lee las tasas promedio ponderado de los bancos múltiples de septiembre 2026", () => {
    expect(valor(r.filas, "TASA_ACT_MN_PROMEDIO", "2026-09-30")).toBe("13.65");
    expect(valor(r.filas, "TASA_PAS_MN_PROMEDIO", "2026-09-30")).toBe("6.97");
  });

  it("sin advertencias y cada cifra con su enlace oficial", () => {
    expect(r.advertencias).toEqual([]);
    expect(r.filas).toHaveLength(6);
    for (const f of r.filas) expect(f.url_dato).toMatch(/^https:\/\/(www|cdn)\.bancentral\.gov\.do\//);
    expect(r.detalle).toEqual({ fecha_dolar: "2026-10-14", mes_inflacion: "2026-09-30", mes_tasas: "2026-09-30" });
  });

  it("descarta un dólar con la venta por debajo de la compra", () => {
    const alterada = PORTADA.replace(/61\.6788/, "60.0000");
    const x = parsearPortadaBcrd(alterada);
    expect(valor(x.filas, "USDDOP_VENTA")).toBeUndefined();
    expect(x.advertencias.join()).toMatch(/venta .* menor que la compra/);
  });

  it("si la portada cambia de diseño avisa en vez de inventar", () => {
    const x = parsearPortadaBcrd("<html><title>Banco Central</title></html>");
    expect(x.filas).toEqual([]);
    expect(x.advertencias).toHaveLength(4);
    expect(() => parsearPortadaBcrd("<html>Mantenimiento</html>")).toThrow(/Formato inesperado/);
  });
});

describe("parsearDolarExcel · TASA_DOLAR_REFERENCIA_MC.xlsx real", () => {
  const r = parsearDolarExcel(libro("TASA_DOLAR_REFERENCIA_MC.xlsx"), "2026-10-01");

  it("último día publicado: 13 oct 2026, compra 61.1149 y venta 61.5396", () => {
    expect(r.detalle).toEqual({ ultima_fecha_dolar: "2026-10-13" });
    expect(ultima(r.filas, "USDDOP_COMPRA")).toMatchObject({ fecha_dato: "2026-10-13", valor: "61.1149" });
    expect(ultima(r.filas, "USDDOP_VENTA")).toMatchObject({ fecha_dato: "2026-10-13", valor: "61.5396" });
  });

  it("9 días hábiles de octubre (1, 2, 5–9, 12, 13) × compra y venta, sin advertencias", () => {
    expect(r.filas).toHaveLength(18);
    expect([...new Set(r.filas.map((f) => f.fecha_dato))]).toEqual([
      "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13",
    ]);
    expect(r.advertencias).toEqual([]);
  });

  it("los dobles de 17 cifras vuelven a los 4 decimales publicados", () => {
    const sep = parsearDolarExcel(libro("TASA_DOLAR_REFERENCIA_MC.xlsx"), "2026-09-22");
    expect(valor(sep.filas, "USDDOP_COMPRA", "2026-09-22")).toBe("59.235"); // XML: 59.234999999999999
    expect(valor(sep.filas, "USDDOP_COMPRA", "2026-10-01")).toBe("59.8986"); // XML: 59.898600000000002
  });

  it("todo el historial desde 1991 se lee sin errores", () => {
    const todo = parsearDolarExcel(libro("TASA_DOLAR_REFERENCIA_MC.xlsx"), "1900-01-01");
    expect(todo.advertencias).toEqual([]);
    expect(todo.filas[0]).toMatchObject({ serie_id: "USDDOP_COMPRA", valor: "11.2", fecha_dato: "1991-01-02" });
    expect(todo.filas).toHaveLength(2 * (8985 - 3));
  });
});

describe("parsearTpmExcel · Serie_TPM.xlsx real", () => {
  const r = parsearTpmExcel(libro("Serie_TPM.xlsx"));

  it("TPM vigente en octubre 2026: 5.50 % (sube 25 pb desde 5.25 % en septiembre)", () => {
    expect(ultima(r.filas, "TPM_BCRD")).toMatchObject({ fecha_dato: "2026-10-01", valor: "5.5", url_dato: URL_TPM_XLSX });
    expect(valor(r.filas, "TPM_BCRD", "2026-09-01")).toBe("5.25");
  });

  it("convierte la fracción a % y arrastra el año que solo aparece en enero", () => {
    expect(valor(r.filas, "TPM_BCRD", "2004-12-01")).toBe("7"); // XML: 7.0000000000000007E-2
    expect(valor(r.filas, "TPM_BCRD", "2025-11-01")).toBe("5.25"); // XML: 5.2499999999999998E-2
    expect(r.filas).toHaveLength(12 * 22 + 10); // ene 2004 – oct 2026, sin huecos
    // «Feb1» y «Mar2» llevan pegada la llamada a una nota al pie: siguen siendo febrero y marzo.
    expect(valor(r.filas, "TPM_BCRD", "2013-02-01")).toBe("5");
    expect(valor(r.filas, "TPM_BCRD", "2020-03-01")).toBe("3.5");
    expect(r.advertencias).toEqual([]);
  });
});

describe("parsearCuadroTasas · cuadros reales V.4 a V.7", () => {
  const leer = (archivo: string, desde = "2026-01-01") => {
    const cuadro = CUADROS_TASAS.find((c) => c.archivo === archivo)!;
    return parsearCuadroTasas(libro(archivo), cuadro, desde);
  };

  it("activas MN de agosto 2026: tarjeta 58.3295, consumo 19.1148, comercial 12.774, hipotecaria 11.4148", () => {
    const r = leer("tasas_activas_mn.xlsx");
    const ago = "2026-08-31";
    expect(valor(r.filas, "TASA_ACT_MN_TARJETA", ago)).toBe("58.3295");
    expect(valor(r.filas, "TASA_ACT_MN_CONSUMO", ago)).toBe("19.1148");
    expect(valor(r.filas, "TASA_ACT_MN_COMERCIAL", ago)).toBe("12.774");
    expect(valor(r.filas, "TASA_ACT_MN_HIPOTECARIA", ago)).toBe("11.4148");
    expect(valor(r.filas, "TASA_ACT_MN_INTERBANCARIA", ago)).toBe("7.42057998133794");
    expect(r.detalle).toEqual({
      "tasas_activas_mn.xlsx": {
        ultimo_mes: ago,
        columnas: {
          TASA_ACT_MN_TARJETA: "G", TASA_ACT_MN_CONSUMO: "H", TASA_ACT_MN_COMERCIAL: "I",
          TASA_ACT_MN_HIPOTECARIA: "L", TASA_ACT_MN_INTERBANCARIA: "O",
        },
      },
    });
    expect(r.advertencias).toEqual([]);
    expect(r.filas[0].url_dato).toBe(urlMonetario("tasas_activas_mn.xlsx"));
  });

  it("activas ME de agosto 2026", () => {
    const r = leer("tasas_activas_me.xlsx");
    expect(valor(r.filas, "TASA_ACT_ME_TARJETA", "2026-08-31")).toBe("58.8505");
    expect(valor(r.filas, "TASA_ACT_ME_CONSUMO", "2026-08-31")).toBe("8.172");
    expect(valor(r.filas, "TASA_ACT_ME_COMERCIAL", "2026-08-31")).toBe("7.152");
    expect(valor(r.filas, "TASA_ACT_ME_HIPOTECARIA", "2026-08-31")).toBe("8.7503");
    expect(r.advertencias).toEqual([]);
  });

  it("pasivas MN de agosto 2026 por plazo (operaciones nuevas)", () => {
    const r = leer("tasas_pasivas_mn.xlsx");
    expect(valor(r.filas, "TASA_PAS_MN_AHORRO", "2026-08-31")).toBe("0.4889");
    expect(valor(r.filas, "TASA_PAS_MN_30D", "2026-08-31")).toBe("7.5683");
    expect(valor(r.filas, "TASA_PAS_MN_180D", "2026-08-31")).toBe("7.4063");
    expect(valor(r.filas, "TASA_PAS_MN_360D", "2026-08-31")).toBe("6.8979");
    expect(valor(r.filas, "TASA_PAS_MN_MAS360D", "2026-08-31")).toBe("6.29");
    expect(r.filas).toHaveLength(8 * 5); // ene–ago 2026
  });

  it("pasivas ME de agosto 2026", () => {
    const r = leer("tasas_pasivas_me.xlsx");
    expect(valor(r.filas, "TASA_PAS_ME_30D", "2026-08-31")).toBe("3.905");
    expect(valor(r.filas, "TASA_PAS_ME_MAS360D", "2026-08-31")).toBe("3.1738");
  });

  it("dic 2001 venía en % (formato «0.00») y no se multiplica: 15.44 % a un mes", () => {
    const r = leer("tasas_pasivas_mn.xlsx", "2001-01-01");
    expect(valor(r.filas, "TASA_PAS_MN_30D", "2001-12-31")).toBe("15.44");
    expect(valor(r.filas, "TASA_PAS_MN_AHORRO", "2001-12-31")).toBe("4");
    expect(r.advertencias).toEqual([]);
  });

  it("si una columna desaparece o se duplica, avisa y no adivina", () => {
    const cuadro = { archivo: "tasas_activas_mn.xlsx", columnas: [{ serie: "X", ruta: [/^No existe$/] }, { serie: "Y", ruta: [/Otros/] }] };
    const r = parsearCuadroTasas(libro("tasas_activas_mn.xlsx"), cuadro, "2026-01-01");
    expect(r.filas).toEqual([]);
    expect(r.advertencias).toEqual([
      "tasas_activas_mn.xlsx: la columna de X no aparece",
      "tasas_activas_mn.xlsx: la columna de Y es ambigua",
    ]);
  });
});

describe("tareas del BCRD de punta a punta (almacén en memoria)", () => {
  const ahora = () => new Date("2026-10-15T14:00:00Z");

  it("bcrd-portada registra 6 cifras y cierra en ok", async () => {
    const { almacen, observaciones } = almacenMemoria();
    const pedidas: string[] = [];
    const r = await correrTarea(tareaBcrdPortada, almacen, {
      ahora,
      obtener: async (url) => {
        pedidas.push(url);
        return { url, status: 200, tipo: "text/html", texto: PORTADA, intentos: 1 };
      },
    });
    expect(pedidas).toEqual([URL_PORTADA_BCRD]);
    expect(r).toMatchObject({ estado: "ok", filas: 6 });
    expect(observaciones).toHaveLength(6);
  });

  it("bcrd-portada sin ninguna cifra legible termina en error", async () => {
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tareaBcrdPortada, almacen, {
      obtener: async (url) => ({ url, status: 200, tipo: "text/html", texto: "<html>Banco Central</html>", intentos: 1 }),
    });
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/ninguna cifra legible/);
  });

  const ARCHIVOS: Record<string, string> = {
    [URL_DOLAR_XLSX]: "TASA_DOLAR_REFERENCIA_MC.xlsx",
    [URL_TPM_XLSX]: "Serie_TPM.xlsx",
    [urlMonetario("tbm_activad.xlsx")]: "tbm_activad-real-2026-10-16.xlsx",
    [urlMonetario("tbm_pasivad.xlsx")]: "tbm_pasivad-real-2026-10-16.xlsx",
  [urlMonetario("tbm_activad.xlsx")]: "tbm_activad-real-2026-10-16.xlsx",
  [urlMonetario("tbm_pasivad.xlsx")]: "tbm_pasivad-real-2026-10-16.xlsx",
    ...Object.fromEntries(CUADROS_TASAS.map((c) => [urlMonetario(c.archivo), c.archivo])),
  };

  it("tbm: historial mensual del promedio ponderado, sin el mes en curso preliminar ni los días", () => {
    const act = parsearTbm(leerXlsx(bytes("tbm_activad-real-2026-10-16.xlsx")), "TASA_ACT_MN_PROMEDIO", "u", "2023-10-01");
    const pas = parsearTbm(leerXlsx(bytes("tbm_pasivad-real-2026-10-16.xlsx")), "TASA_PAS_MN_PROMEDIO", "u", "2023-10-01");
    expect(act.advertencias).toEqual([]);
    expect(act.filas.at(-1)).toMatchObject({ fecha_dato: "2026-09-30", valor: "13.65" }); // 13.6485 publicado como 13.65
    expect(pas.filas.at(-1)).toMatchObject({ fecha_dato: "2026-09-30", valor: "6.97" }); // 6.9691
    expect(act.filas.find((f) => f.fecha_dato === "2026-01-31")?.valor).toBe("13.59"); // «Enero 2026» 13.5906
    expect(act.filas[0].fecha_dato).toBe("2023-10-31");
    expect(act.filas.some((f) => f.fecha_dato.startsWith("2026-10"))).toBe(false);
  });

  it("bcrd-excel lee los 8 libros y registra el historial reciente", async () => {
    const { almacen, observaciones } = almacenMemoria();
    const pedidas: string[] = [];
    const tarea = crearTareaBcrdExcel(() => async (url) => {
      pedidas.push(url);
      return bytes(ARCHIVOS[url]);
    });
    const r = await correrTarea(tarea, almacen, { ahora, obtener: () => Promise.reject(new Error("no se usa")) });
    expect(r.estado).toBe("ok");
    expect(pedidas).toHaveLength(8);
    expect(r.detalle).toMatchObject({ archivos: 8, ultima_fecha_dolar: "2026-10-13", ultimo_mes_tpm: "2026-10-01" });
    // Dólar desde jul 2025 (15 meses), tasas desde oct 2023 (36 meses), TPM completa.
    const dolar = observaciones.filter((o) => o.serie_id === "USDDOP_COMPRA").map((o) => o.fecha_dato).sort();
    expect(dolar[0]).toBe("2025-07-01");
    const tasas = observaciones.filter((o) => o.serie_id === "TASA_ACT_MN_TARJETA").map((o) => o.fecha_dato).sort();
    expect(tasas[0]).toBe("2023-10-31");
    expect(observaciones.filter((o) => o.serie_id === "TPM_BCRD")).toHaveLength(274);
  });

  it("bcrd-excel con un archivo caído guarda los demás y queda parcial", async () => {
    const { almacen } = almacenMemoria();
    const tarea = crearTareaBcrdExcel(() => async (url) => {
      if (url === URL_TPM_XLSX) throw new Error("HTTP 503");
      return bytes(ARCHIVOS[url]);
    });
    const r = await correrTarea(tarea, almacen, { ahora, obtener: () => Promise.reject(new Error("no se usa")) });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/Serie_TPM\.xlsx: HTTP 503/);
  });

  it("bcrd-excel con un HTML en vez de Excel no guarda nada y termina en error", async () => {
    const { almacen, observaciones } = almacenMemoria();
    const tarea = crearTareaBcrdExcel(() => async () => new TextEncoder().encode("<html>403</html>"));
    const r = await correrTarea(tarea, almacen, { ahora, obtener: () => Promise.reject(new Error("no se usa")) });
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/no es un \.xlsx válido/);
    expect(observaciones).toEqual([]);
  });
});
