import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { ErrorIngesta, type Respuesta } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import { AvisoGdelt, CONSULTAS_GDELT, consultaDelTurno, fechaGdelt, filasNoticias, parsearGdelt, tareaGdelt, urlGdelt } from "./gdelt.ts";

// SINTÉTICA: reemplazar por real (sondas/lotes/21-gdelt-artlist.txt). Forma documentada de artlist.
const MUESTRA = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "gdelt", "artlist-sintetica.json"),
  "utf8",
);

const ok = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "application/json", texto, intentos: 1 });

describe("parsearGdelt", () => {
  const arts = parsearGdelt(MUESTRA);

  it("descarta entradas sin fecha válida, sin http o sin titular", () => {
    expect(arts).toHaveLength(7);
    expect(arts.map((a) => a.url)).not.toContain("ftp://medio-ejemplo-cinco.com/no-http");
  });

  it("guarda titular, enlace, medio (en minúsculas), fecha UTC e idioma: nada del texto", () => {
    expect(arts[2]).toEqual({
      titular: "Houthi missile targets cargo ship in the Red Sea",
      url: "https://medio-ejemplo-dos.com/news/red-sea-shipping-missile",
      medio: "medio-ejemplo-dos.com",
      fecha: "2026-10-15T12:00:00.000Z",
      idioma: "English",
    });
  });

  it("GDELT sin artículos responde {} → lista vacía", () => {
    expect(parsearGdelt("{}")).toEqual([]);
  });

  it("el aviso de límite en texto plano es un AvisoGdelt, no un error de formato", () => {
    expect(() => parsearGdelt("Please limit requests to one every 5 seconds or contact us.")).toThrow(AvisoGdelt);
    expect(() => parsearGdelt("<html>Mantenimiento</html>")).toThrow(/Formato inesperado/);
  });

  it("fechaGdelt", () => {
    expect(fechaGdelt("20261015T141500Z")).toBe("2026-10-15T14:15:00.000Z");
    expect(fechaGdelt("2026-10-15")).toBeNull();
  });
});

describe("filasNoticias", () => {
  it("categoría y lugar por titular; la misma URL con utm/www/barra no se repite", async () => {
    const { filas, descartadas } = await filasNoticias(parsearGdelt(MUESTRA), { fuenteId: "gdelt", origen: "gdelt", pista: "guerra" });
    expect(descartadas).toBe(0);
    expect(filas).toHaveLength(6);
    const porTitular = Object.fromEntries(filas.map((f) => [f.titular, f]));
    expect(porTitular["Airstrikes hit Gaza City as ceasefire talks stall"]).toMatchObject({
      categoria: "guerra", lugar: "Gaza", pais: "Palestina", lat: "31.50", lon: "34.47", origen: "gdelt", fuente_id: "gdelt",
    });
    expect(porTitular["Houthi missile targets cargo ship in the Red Sea"]).toMatchObject({ categoria: "guerra", lugar: "Mar Rojo" });
    expect(porTitular["Russian drone attack on Kyiv overnight, Ukrainian officials say"]).toMatchObject({ categoria: "guerra", lugar: "Kyiv" });
    expect(porTitular["Stocks slip as trade war fears return"]).toMatchObject({ categoria: "mercado", lugar: null, lat: null });
    expect(porTitular["Troops mass near the border as tensions rise"]).toMatchObject({ categoria: "guerra", lugar: null });
    expect(porTitular["Banco Central de la República Dominicana informa sobre las remesas de septiembre"]).toMatchObject({
      categoria: "rd", pais: "República Dominicana",
    });
    expect(filas.every((f) => /^[0-9a-f]{64}$/.test(f.hash))).toBe(true);
  });

  it("sin pista, un titular que no encaja en ninguna regla no se guarda", async () => {
    const { filas, descartadas } = await filasNoticias(
      [{ titular: "Celebrity wedding photos", url: "https://a.com/x", medio: "a.com", fecha: "2026-10-15T00:00:00.000Z", idioma: null }],
      { fuenteId: "gdelt", origen: "gdelt" },
    );
    expect(filas).toEqual([]);
    expect(descartadas).toBe(1);
  });
});

describe("rotación de consultas", () => {
  it("cada 10 minutos cambia: guerras → mercados → RD", () => {
    const base = Date.UTC(2026, 9, 15, 0, 0, 0);
    const ids = [0, 1, 2, 3].map((k) => consultaDelTurno(new Date(base + k * 600_000 + 5_000)).id);
    expect(new Set(ids.slice(0, 3))).toEqual(new Set(["guerras", "mercados", "rd"]));
    expect(ids[3]).toBe(ids[0]);
  });

  it("la URL pide artlist en JSON de las últimas 24 h, con espacios como %20", () => {
    const u = urlGdelt(CONSULTAS_GDELT[2]);
    expect(u.startsWith("https://api.gdeltproject.org/api/v2/doc/doc?query=")).toBe(true);
    expect(u).toContain("mode=artlist");
    expect(u).toContain("format=json");
    expect(u).toContain("timespan=24h");
    expect(u).toContain("maxrecords=50");
    expect(u).not.toContain("+");
    expect(new URL(u).searchParams.get("query")).toBe(CONSULTAS_GDELT[2].query);
  });
});

describe("tarea noticias-gdelt", () => {
  const ahora = () => new Date(Date.UTC(2026, 9, 15, 0, 0, 5)); // turno 0 de la rotación del día

  it("UNA sola consulta por corrida, por el lector (robots.txt) y guarda en noticias", async () => {
    const { almacen, tablas } = almacenMemoria();
    const llamadas: string[] = [];
    const r = await correrTarea(tareaGdelt, almacen, {
      ahora,
      obtener: async (url) => {
        llamadas.push(url);
        return ok(url, MUESTRA);
      },
      api: async () => {
        throw new Error("no debe usarse: GDELT pasa por robots.txt");
      },
    });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toBe(urlGdelt(consultaDelTurno(ahora())));
    expect(r.estado).toBe("ok");
    expect(tablas.noticias).toHaveLength(6);
    expect(r.detalle).toMatchObject({ recibidos: 7, nuevas: 6 });
  });

  it("un 429 termina en «parcial» con el motivo, sin error", async () => {
    const { almacen, tablas } = almacenMemoria();
    const r = await correrTarea(tareaGdelt, almacen, {
      ahora,
      obtener: async (url) => {
        throw new ErrorIngesta(`Falló tras 3 intentos (HTTP 429): ${url}`, url);
      },
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/429/);
    expect(r.detalle).toMatchObject({ limite: true });
    expect(tablas.noticias).toBeUndefined();
  });

  it("el aviso de límite en texto también es «parcial»", async () => {
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tareaGdelt, almacen, {
      ahora,
      obtener: async (url) => ok(url, "Please limit requests to one every 5 seconds"),
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/GDELT pidió esperar/);
  });

  it("otro fallo de red es error", async () => {
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tareaGdelt, almacen, {
      ahora,
      obtener: async () => {
        throw new Error("sin red");
      },
    });
    expect(r.estado).toBe("error");
  });
});
