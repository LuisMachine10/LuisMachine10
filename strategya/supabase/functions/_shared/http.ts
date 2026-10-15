// Cliente HTTP de la ingesta: tiempo máximo por llamada, reintentos con espera creciente,
// lista de dominios prohibidos y robots.txt antes de cada lectura.
// Sin dependencias de Deno ni de Node: corre igual en la Edge Function y en las pruebas.

import { evaluarRobots, parsearRobots, type ReglasRobots } from "./robots.ts";

/** Sitios que prohíben la lectura automática. Regla de Strategya: no se esquivan. */
export const DOMINIOS_PROHIBIDOS: readonly string[] = ["calculadora.apislab.bvrd.com.do", "bhdfondos.com.do"];

export const PRODUCTO = "Strategya";

export function agenteUsuario(contacto?: string): string {
  const extra = contacto && contacto.trim() ? `; contacto: ${contacto.trim()}` : "";
  return `${PRODUCTO}/0.1 (uso personal${extra})`;
}

export class ErrorIngesta extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErrorIngesta";
  }
}

export interface Respuesta {
  url: string;
  status: number;
  tipo: string;
  texto: string;
  intentos: number;
}

export interface OpcionesHttp {
  agente: string;
  timeoutMs?: number;
  reintentos?: number;
  esperaBaseMs?: number;
  fetch?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
}

const dormirReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function dominioProhibido(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return DOMINIOS_PROHIBIDOS.some((d) => host === d || host.endsWith(`.${d}`));
}

function esperaReintento(intento: number, base: number, retryAfter: string | null): number {
  const segundos = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(segundos) && segundos >= 0) return Math.min(segundos * 1000, 30_000);
  return base * 2 ** (intento - 1);
}

/**
 * GET con tiempo máximo y reintentos (red caída, 429 y 5xx). Un 4xx distinto de 429 no se reintenta.
 * No revisa robots.txt: para eso está `Lector`.
 */
export async function obtenerTexto(url: string, op: OpcionesHttp): Promise<Respuesta> {
  if (dominioProhibido(url)) {
    throw new ErrorIngesta(`Dominio prohibido para lectura automática: ${new URL(url).hostname}`, url);
  }
  const f = op.fetch ?? fetch;
  const dormir = op.dormir ?? dormirReal;
  const timeoutMs = op.timeoutMs ?? 20_000;
  const reintentos = op.reintentos ?? 3;
  const base = op.esperaBaseMs ?? 1_000;

  let ultimoError = "";
  for (let intento = 1; intento <= reintentos + 1; intento++) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), timeoutMs);
    let retryAfter: string | null = null;
    try {
      const r = await f(url, {
        headers: { "User-Agent": op.agente, Accept: "*/*" },
        signal: control.signal,
        redirect: "follow",
      });
      if (r.ok) {
        const texto = await r.text();
        return { url, status: r.status, tipo: r.headers.get("content-type") ?? "", texto, intentos: intento };
      }
      await r.body?.cancel();
      if (r.status !== 429 && r.status < 500) {
        throw new ErrorIngesta(`HTTP ${r.status} en ${url}`, url, r.status);
      }
      retryAfter = r.headers.get("retry-after");
      ultimoError = `HTTP ${r.status}`;
    } catch (e) {
      if (e instanceof ErrorIngesta) throw e;
      ultimoError = control.signal.aborted ? `sin respuesta en ${timeoutMs} ms` : `error de red: ${(e as Error).message}`;
    } finally {
      clearTimeout(reloj);
    }
    if (intento <= reintentos) await dormir(esperaReintento(intento, base, retryAfter));
  }
  throw new ErrorIngesta(`Falló tras ${reintentos + 1} intentos (${ultimoError}): ${url}`, url);
}

export type DecisionRobots =
  | { permitido: true; crawlDelaySeg?: number }
  | { permitido: false; motivo: string };

/**
 * Lee robots.txt por sitio (una vez por corrida) y decide si una URL se puede leer.
 *
 * Política (RFC 9309, con una regla más estricta para 401/403):
 *  - 2xx: se aplican las reglas.
 *  - 401/403: el sitio rechaza la lectura automática → no se lee. (RFC 9309 permitiría leer;
 *    Strategya lo trata como prohibición: es la señal de un bloqueo como el de Cloudflare.)
 *  - otros 4xx (404, 410…): no hay reglas → se puede leer.
 *  - 5xx o sin respuesta: se asume prohibido hasta que vuelva.
 */
export class Lector {
  private readonly cache = new Map<string, Promise<ReglasRobots | DecisionRobots>>();
  private readonly ultimaLlamada = new Map<string, number>();

  constructor(
    private readonly op: OpcionesHttp & { ahora?: () => number },
  ) {}

  private reglasDe(origen: string): Promise<ReglasRobots | DecisionRobots> {
    let p = this.cache.get(origen);
    if (!p) {
      p = obtenerTexto(`${origen}/robots.txt`, { ...this.op, reintentos: 1 }).then(
        (r) => parsearRobots(r.texto),
        (e: unknown) => {
          const status = e instanceof ErrorIngesta ? e.status : undefined;
          if (status === 401 || status === 403) {
            return { permitido: false, motivo: `robots.txt respondió HTTP ${status}: el sitio rechaza la lectura automática` } as const;
          }
          if (status !== undefined && status >= 400 && status < 500) return { permitido: true } as const;
          return { permitido: false, motivo: `robots.txt no disponible (${(e as Error).message}); se asume prohibido` } as const;
        },
      );
      this.cache.set(origen, p);
    }
    return p;
  }

  async decidir(url: string): Promise<DecisionRobots> {
    if (dominioProhibido(url)) return { permitido: false, motivo: "dominio prohibido por regla de Strategya" };
    const u = new URL(url);
    const reglas = await this.reglasDe(u.origin);
    if ("permitido" in reglas) return reglas;
    const permitido = evaluarRobots(reglas, PRODUCTO, u.pathname + u.search);
    if (!permitido) return { permitido: false, motivo: `robots.txt de ${u.hostname} no permite ${u.pathname}` };
    const delay = reglas.crawlDelay(PRODUCTO);
    return delay === undefined ? { permitido: true } : { permitido: true, crawlDelaySeg: delay };
  }

  /** Revisa robots.txt, respeta Crawl-delay entre llamadas al mismo sitio y descarga. */
  async obtener(url: string): Promise<Respuesta> {
    const d = await this.decidir(url);
    if (!d.permitido) throw new ErrorIngesta(`Lectura no permitida: ${d.motivo}`, url);
    const origen = new URL(url).origin;
    const ahora = this.op.ahora ?? Date.now;
    const previa = this.ultimaLlamada.get(origen);
    if (d.crawlDelaySeg && previa !== undefined) {
      const falta = previa + d.crawlDelaySeg * 1000 - ahora();
      if (falta > 0) await (this.op.dormir ?? dormirReal)(Math.min(falta, 30_000));
    }
    this.ultimaLlamada.set(origen, ahora());
    return obtenerTexto(url, this.op);
  }
}
