import { describe, expect, it } from "vitest";
import { crearObtenerBytes } from "./descarga-binaria.ts";
import {
  decodificarEntidades,
  enRango,
  fechaDdMmAaaa,
  fechaEnTexto,
  finDeMes,
  hoyRD,
  mesEnTexto,
  mesesAtras,
  numeroMes,
  numeroPagina,
  seccion,
  textoPlano,
} from "./rd-comun.ts";

describe("fechas en español", () => {
  it("meses abreviados y completos, con o sin tilde", () => {
    expect(["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map(numeroMes)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(numeroMes("Septiembre")).toBe(9);
    expect(numeroMes("sept.")).toBe(9);
    expect(numeroMes("Agosto")).toBe(8);
    expect(numeroMes("Total")).toBeNull();
  });

  it("fechas escritas", () => {
    expect(fechaEnTexto("14 de Octubre 2026")).toBe("2026-10-14");
    expect(fechaEnTexto("2 de octubre de 2026")).toBe("2026-10-02");
    expect(fechaEnTexto("31 de febrero de 2026")).toBeNull();
    expect(mesEnTexto("Septiembre 2026")).toEqual({ anio: 2026, mes: 9 });
    expect(fechaDdMmAaaa("10/09/2026 | 189 KB")).toBe("2026-09-10");
  });

  it("fin de mes, meses atrás y hoy en RD", () => {
    expect(finDeMes(2026, 2)).toBe("2026-02-28");
    expect(finDeMes(2028, 2)).toBe("2028-02-29");
    expect(finDeMes(2026, 12)).toBe("2026-12-31");
    expect(mesesAtras("2026-10-15", 36)).toBe("2023-10-01");
    expect(mesesAtras("2026-01-15", 1)).toBe("2025-12-01");
    expect(hoyRD(new Date("2026-10-16T03:30:00Z"))).toBe("2026-10-15"); // 11:30 PM en RD
  });
});

describe("cifras de páginas", () => {
  it("acepta solo el formato con coma de miles y punto decimal", () => {
    expect(numeroPagina("61.1477")).toBe("61.1477");
    expect(numeroPagina(" 5.12% ")).toBe("5.12");
    expect(numeroPagina("1,525.40")).toBe("1525.4");
    expect(numeroPagina("1.525,40")).toBeNull();
    expect(numeroPagina("N/D")).toBeNull();
    expect(numeroPagina(undefined)).toBeNull();
    expect(enRango("61.1477", 5, 200)).toBe(true);
    expect(enRango("250", 5, 200)).toBe(false);
  });

  it("HTML a texto", () => {
    expect(decodificarEntidades("Inflaci&#243;n &amp; precio &#250;nico &#xF3; &nbsp;&desconocida;")).toBe(
      "Inflación & precio único ó  &desconocida;",
    );
    expect(textoPlano("<b>Gasolina</b>\n   Premium &aacute;")).toBe("Gasolina Premium á");
    expect(seccion("a <x> b <y> c", /<x>/, /<y>/)).toBe("<x> b ");
    expect(seccion("abc", /z/)).toBeNull();
  });
});

describe("crearObtenerBytes", () => {
  const xlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x00, 0x80, 0xc3]); // bytes no UTF-8

  it("pasa por robots.txt y devuelve los bytes intactos", async () => {
    const pedidas: string[] = [];
    const obtener = crearObtenerBytes({
      reintentos: 0,
      fetch: (async (entrada: string | URL | Request) => {
        const url = String(entrada);
        pedidas.push(url);
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
        return new Response(xlsx, { status: 200 });
      }) as typeof fetch,
    });
    expect(await obtener("https://cdn.ejemplo.do/a.xlsx")).toEqual(xlsx);
    expect(await obtener("https://cdn.ejemplo.do/b.xlsx")).toEqual(xlsx);
    expect(pedidas).toEqual(["https://cdn.ejemplo.do/robots.txt", "https://cdn.ejemplo.do/a.xlsx", "https://cdn.ejemplo.do/b.xlsx"]);
  });

  it("respeta un Disallow de robots.txt: el archivo ni se pide", async () => {
    const pedidas: string[] = [];
    const obtener = crearObtenerBytes({
      reintentos: 0,
      fetch: (async (entrada: string | URL | Request) => {
        pedidas.push(String(entrada));
        return new Response("User-agent: *\nDisallow: /documents/\n", { status: 200 });
      }) as typeof fetch,
    });
    await expect(obtener("https://cdn.ejemplo.do/documents/a.xlsx")).rejects.toThrow(/no permite/);
    expect(pedidas).toEqual(["https://cdn.ejemplo.do/robots.txt"]);
  });

  it("un 403 del archivo no se reintenta ni se esquiva", async () => {
    const obtener = crearObtenerBytes({
      reintentos: 2,
      fetch: (async (entrada: string | URL | Request) =>
        String(entrada).endsWith("/robots.txt")
          ? new Response("", { status: 404 })
          : new Response("bloqueado", { status: 403 })) as typeof fetch,
    });
    await expect(obtener("https://cdn.ejemplo.do/a.xlsx")).rejects.toThrow(/HTTP 403/);
  });
});
