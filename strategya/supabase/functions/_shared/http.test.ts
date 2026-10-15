import { describe, expect, it, vi } from "vitest";
import { agenteUsuario, dominioProhibido, ErrorIngesta, Lector, obtenerTexto } from "./http.ts";

type Paso = { status: number; texto?: string; encabezados?: Record<string, string> } | "red" | "cuelga";

/** fetch falso que responde según una cola de pasos por URL. */
function fetchFalso(guion: Record<string, Paso[]>) {
  const llamadas: string[] = [];
  const f = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada);
    llamadas.push(url);
    const paso = guion[url]?.shift();
    if (!paso) throw new Error(`sin guion para ${url}`);
    if (paso === "red") throw new TypeError("fetch failed");
    if (paso === "cuelga") {
      return new Promise<Response>((_, rechazar) => {
        init?.signal?.addEventListener("abort", () => rechazar(new DOMException("abortado", "AbortError")));
      });
    }
    return new Response(paso.texto ?? "", { status: paso.status, headers: paso.encabezados });
  });
  return { f: f as unknown as typeof fetch, llamadas };
}

const sinEspera = async () => {};
const base = { agente: agenteUsuario(), dormir: sinEspera, esperaBaseMs: 1 };

describe("obtenerTexto", () => {
  it("reintenta 503 y error de red, luego devuelve el cuerpo", async () => {
    const { f, llamadas } = fetchFalso({ "https://x.gov/a": [{ status: 503 }, "red", { status: 200, texto: "ok" }] });
    const r = await obtenerTexto("https://x.gov/a", { ...base, fetch: f });
    expect(r).toMatchObject({ status: 200, texto: "ok", intentos: 3 });
    expect(llamadas).toHaveLength(3);
  });

  it("no reintenta un 404", async () => {
    const { f, llamadas } = fetchFalso({ "https://x.gov/a": [{ status: 404 }] });
    await expect(obtenerTexto("https://x.gov/a", { ...base, fetch: f })).rejects.toMatchObject({ status: 404 });
    expect(llamadas).toHaveLength(1);
  });

  it("corta por tiempo máximo y reporta cuántos intentos hizo", async () => {
    const { f } = fetchFalso({ "https://x.gov/a": ["cuelga", "cuelga"] });
    await expect(obtenerTexto("https://x.gov/a", { ...base, fetch: f, timeoutMs: 20, reintentos: 1 })).rejects.toThrow(
      /Falló tras 2 intentos \(sin respuesta en 20 ms\)/,
    );
  });

  it("espera lo que pide Retry-After en un 429", async () => {
    const esperas: number[] = [];
    const { f } = fetchFalso({
      "https://x.gov/a": [{ status: 429, encabezados: { "retry-after": "7" } }, { status: 200, texto: "ok" }],
    });
    await obtenerTexto("https://x.gov/a", { ...base, fetch: f, dormir: async (ms) => void esperas.push(ms) });
    expect(esperas).toEqual([7000]);
  });

  it("la espera crece: 1×, 2×, 4× la base", async () => {
    const esperas: number[] = [];
    const { f } = fetchFalso({ "https://x.gov/a": [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 200 }] });
    await obtenerTexto("https://x.gov/a", { ...base, esperaBaseMs: 100, fetch: f, dormir: async (ms) => void esperas.push(ms) });
    expect(esperas).toEqual([100, 200, 400]);
  });

  it("se niega a tocar los dominios prohibidos, sin hacer ninguna llamada", async () => {
    const { f, llamadas } = fetchFalso({});
    expect(dominioProhibido("https://www.calculadora.apislab.bvrd.com.do/x")).toBe(true);
    expect(dominioProhibido("https://bhdfondos.com.do/")).toBe(true);
    expect(dominioProhibido("https://www.bancentral.gov.do/")).toBe(false);
    await expect(obtenerTexto("https://bhdfondos.com.do/rendimientos", { ...base, fetch: f })).rejects.toBeInstanceOf(
      ErrorIngesta,
    );
    expect(llamadas).toEqual([]);
  });

  it("identifica a Strategya en el User-Agent, con contacto si se configura", () => {
    expect(agenteUsuario()).toBe("Strategya/0.1 (uso personal)");
    expect(agenteUsuario("datos@ejemplo.do")).toBe("Strategya/0.1 (uso personal; contacto: datos@ejemplo.do)");
  });
});

describe("Lector (robots.txt antes de cada lectura)", () => {
  it("lee robots.txt una sola vez por sitio y descarga si está permitido", async () => {
    const { f, llamadas } = fetchFalso({
      "https://x.gov/robots.txt": [{ status: 200, texto: "User-agent: *\nDisallow: /privado\n" }],
      "https://x.gov/datos/1": [{ status: 200, texto: "uno" }],
      "https://x.gov/datos/2": [{ status: 200, texto: "dos" }],
    });
    const lector = new Lector({ ...base, fetch: f });
    expect((await lector.obtener("https://x.gov/datos/1")).texto).toBe("uno");
    expect((await lector.obtener("https://x.gov/datos/2")).texto).toBe("dos");
    expect(llamadas.filter((u) => u.endsWith("robots.txt"))).toHaveLength(1);
  });

  it("no descarga lo que robots.txt prohíbe", async () => {
    const { f, llamadas } = fetchFalso({
      "https://x.gov/robots.txt": [{ status: 200, texto: "User-agent: *\nDisallow: /privado\n" }],
    });
    await expect(new Lector({ ...base, fetch: f }).obtener("https://x.gov/privado/a")).rejects.toThrow(/no permite/);
    expect(llamadas).toEqual(["https://x.gov/robots.txt"]);
  });

  it("robots.txt 404 → se puede leer", async () => {
    const { f } = fetchFalso({
      "https://x.gov/robots.txt": [{ status: 404 }],
      "https://x.gov/a": [{ status: 200, texto: "ok" }],
    });
    expect((await new Lector({ ...base, fetch: f }).obtener("https://x.gov/a")).texto).toBe("ok");
  });

  it("robots.txt 403 (bloqueo tipo Cloudflare, como SIMV) → no se lee", async () => {
    const { f, llamadas } = fetchFalso({ "https://simv.gob.do/robots.txt": [{ status: 403 }] });
    await expect(new Lector({ ...base, fetch: f }).obtener("https://simv.gob.do/normativas/resoluciones/")).rejects.toThrow(
      /rechaza la lectura automática/,
    );
    expect(llamadas).toEqual(["https://simv.gob.do/robots.txt"]);
  });

  it("robots.txt caído (5xx) → se asume prohibido", async () => {
    const { f } = fetchFalso({ "https://x.gov/robots.txt": [{ status: 503 }, { status: 503 }] });
    await expect(new Lector({ ...base, fetch: f }).obtener("https://x.gov/a")).rejects.toThrow(/se asume prohibido/);
  });

  it("respeta Crawl-delay entre llamadas al mismo sitio", async () => {
    let reloj = 0;
    const esperas: number[] = [];
    const { f } = fetchFalso({
      "https://x.gov/robots.txt": [{ status: 200, texto: "User-agent: *\nCrawl-delay: 5\n" }],
      "https://x.gov/a": [{ status: 200 }],
      "https://x.gov/b": [{ status: 200 }],
    });
    const lector = new Lector({
      ...base,
      fetch: f,
      ahora: () => reloj,
      dormir: async (ms) => {
        esperas.push(ms);
        reloj += ms;
      },
    });
    await lector.obtener("https://x.gov/a");
    reloj += 1000;
    await lector.obtener("https://x.gov/b");
    expect(esperas).toEqual([4000]);
  });
});
