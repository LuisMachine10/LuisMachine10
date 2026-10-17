// Cliente HTTP de la ingesta: tiempo máximo por llamada, reintentos con espera creciente,
// lista de dominios prohibidos y robots.txt antes de cada lectura.
// Sin dependencias de Deno ni de Node: corre igual en la Edge Function y en las pruebas.

import { evaluarRobots, parsearRobots, type ReglasRobots } from "./robots.ts";

/** Sitios que prohíben la lectura automática. Regla de Strategya: no se esquivan. */
export const DOMINIOS_PROHIBIDOS: readonly string[] = ["calculadora.apislab.bvrd.com.do", "bhdfondos.com.do"];

export const PRODUCTO = "Strategya";

/** Pausa mínima (segundos) entre llamadas a un mismo sitio, aunque su robots.txt no pida Crawl-delay. */
export const PAUSAS_MINIMAS: Readonly<Record<string, number>> = {
  // GDELT: «Please limit requests to one every 5 seconds» (respuesta 429 del 16 oct 2026).
  "api.gdeltproject.org": 6,
  // Cboe: CDN sin robots.txt; una llamada por segundo como cortesía (≈13 por corrida).
  "cdn.cboe.com": 1,
};

export function agenteUsuario(contacto?: string): string {
  const extra = contacto && contacto.trim() ? `; contacto: ${contacto.trim()}` : "";
  return `${PRODUCTO}/0.1 (uso personal${extra})`;
}

export class ErrorIngesta extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
    /** Primeros caracteres del cuerpo de la respuesta de error (para distinguir un bloqueo de un archivo inexistente). */
    readonly cuerpo?: string,
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

export interface OpcionesApi {
  metodo?: "GET" | "POST";
  encabezados?: Record<string, string>;
  /** Cuerpo JSON (se serializa) o texto. */
  cuerpo?: unknown;
  timeoutMs?: number;
  /** Por defecto solo se reintenta GET; un POST se reintenta solo si se pide. */
  reintentar?: boolean;
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
      if (r.url && r.url !== url && dominioProhibido(r.url)) {
        await r.body?.cancel();
        throw new ErrorIngesta(`La lectura redirigió a un dominio prohibido (${new URL(r.url).hostname}); no se lee`, url);
      }
      if (r.ok) {
        const texto = await r.text();
        return { url, status: r.status, tipo: r.headers.get("content-type") ?? "", texto, intentos: intento };
      }
      if (r.status !== 429 && r.status < 500) {
        const cuerpo = r.status === 401 || r.status === 403 ? (await r.text()).slice(0, 600) : (await r.body?.cancel(), undefined);
        throw new ErrorIngesta(`HTTP ${r.status} en ${ocultarClaves(url)}`, ocultarClaves(url), r.status, cuerpo);
      }
      await r.body?.cancel();
      retryAfter = r.headers.get("retry-after");
      ultimoError = `HTTP ${r.status}`;
    } catch (e) {
      if (e instanceof ErrorIngesta) throw e;
      ultimoError = control.signal.aborted ? `sin respuesta en ${timeoutMs} ms` : `error de red: ${ocultarClaves((e as Error).message)}`;
    } finally {
      clearTimeout(reloj);
    }
    if (intento <= reintentos) await dormir(esperaReintento(intento, base, retryAfter));
  }
  throw new ErrorIngesta(`Falló tras ${reintentos + 1} intentos (${ultimoError}): ${ocultarClaves(url)}`, ocultarClaves(url));
}

/**
 * Llamada a una API documentada (con clave). No pasa por robots.txt: la regla que aplica es el
 * término de uso de la API. Sí respeta la lista de dominios prohibidos, el tiempo máximo y reintenta
 * 429/5xx en GET (y en POST solo si opciones.reintentar).
 */
export async function pedirApi(url: string, op: OpcionesHttp, api: OpcionesApi = {}): Promise<Respuesta> {
  if (dominioProhibido(url)) {
    throw new ErrorIngesta(`Dominio prohibido para lectura automática: ${new URL(url).hostname}`, url);
  }
  const f = op.fetch ?? fetch;
  const dormir = op.dormir ?? dormirReal;
  const metodo = api.metodo ?? "GET";
  const timeoutMs = api.timeoutMs ?? op.timeoutMs ?? 20_000;
  const reintentos = metodo === "GET" || api.reintentar ? (op.reintentos ?? 3) : 0;
  const base = op.esperaBaseMs ?? 1_000;
  const encabezados: Record<string, string> = { "User-Agent": op.agente, Accept: "application/json", ...api.encabezados };
  let cuerpo: string | undefined;
  if (api.cuerpo !== undefined) {
    cuerpo = typeof api.cuerpo === "string" ? api.cuerpo : JSON.stringify(api.cuerpo);
    if (typeof api.cuerpo !== "string") encabezados["Content-Type"] ??= "application/json";
  }

  let ultimoError = "";
  for (let intento = 1; intento <= reintentos + 1; intento++) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), timeoutMs);
    let retryAfter: string | null = null;
    try {
      const r = await f(url, { method: metodo, headers: encabezados, body: cuerpo, signal: control.signal });
      if (r.url && r.url !== url && dominioProhibido(r.url)) {
        await r.body?.cancel();
        throw new ErrorIngesta(`La API redirigió a un dominio prohibido (${new URL(r.url).hostname}); no se lee`, ocultarClaves(url));
      }
      const texto = await r.text();
      if (r.ok) return { url, status: r.status, tipo: r.headers.get("content-type") ?? "", texto, intentos: intento };
      if (r.status !== 429 && r.status < 500) {
        throw new ErrorIngesta(`HTTP ${r.status} en ${ocultarClaves(url)}: ${texto.slice(0, 300)}`, ocultarClaves(url), r.status);
      }
      retryAfter = r.headers.get("retry-after");
      ultimoError = `HTTP ${r.status}`;
    } catch (e) {
      if (e instanceof ErrorIngesta) throw e;
      ultimoError = control.signal.aborted ? `sin respuesta en ${timeoutMs} ms` : `error de red: ${ocultarClaves((e as Error).message)}`;
    } finally {
      clearTimeout(reloj);
    }
    if (intento <= reintentos) await dormir(esperaReintento(intento, base, retryAfter));
  }
  throw new ErrorIngesta(`Falló tras ${reintentos + 1} intentos (${ultimoError}): ${ocultarClaves(url)}`, ocultarClaves(url));
}

/** Quita claves de API de una URL antes de escribirla en un error o en /estado. */
export function ocultarClaves(url: string): string {
  return url.replace(/([?&](?:apikey|api_key|token|key)=)[^&]+/gi, "$1***");
}

/** Respuesta típica de Amazon S3 a un objeto inexistente en un depósito sin listado público. */
export function esS3SinArchivo(cuerpo: string | undefined): boolean {
  return !!cuerpo && /<Error>\s*<Code>AccessDenied<\/Code>/.test(cuerpo) && /<RequestId>/.test(cuerpo) && /<HostId>/.test(cuerpo);
}

/**
 * ¿La URL es un feed de sindicación (RSS/Atom)? Por la ruta (/feed, /rss, .rss, /rss/Nombre…) o porque el
 * host está dedicado a feeds (feeds.content.dowjones.io publica los RSS del WSJ).
 */
export function esFeed(u: URL): boolean {
  return /\/feed\/?$|\/rss\/?$|\.(rss|atom)$|\/feeds?\/[^/]+\.xml$|\/rss\/[^/]+$/i.test(u.pathname) || /^feeds?\./i.test(u.hostname);
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
 *    Única excepción: el feed RSS/Atom que el propio sitio publica para lectores automáticos, y solo
 *    si el feed responde 200 (si el feed también responde 403, no se insiste). Decisión de Mena para
 *    la SIMV (15 oct 2026): sus avisos públicos entran por el feed; las páginas no se tocan.
 *  - otros 4xx (404, 410…): no hay reglas → se puede leer.
 *  - 5xx o sin respuesta: se asume prohibido hasta que vuelva.
 */
export class Lector {
  private readonly cache = new Map<string, Promise<ReglasRobots | DecisionRobots>>();
  private readonly ultimaLlamada = new Map<string, number>();

  constructor(
    private readonly op: OpcionesHttp & {
      ahora?: () => number;
      /** User-Agent distinto por sitio (la SEC exige un correo de contacto; el resto no lo recibe). */
      agentePara?: (host: string) => string | undefined;
    },
  ) {}

  private reglasDe(origen: string): Promise<ReglasRobots | DecisionRobots> {
    let p = this.cache.get(origen);
    if (!p) {
      // La lectura de robots.txt también cuenta para la pausa entre llamadas al sitio.
      this.ultimaLlamada.set(origen, (this.op.ahora ?? Date.now)());
      p = obtenerTexto(`${origen}/robots.txt`, { ...this.op, reintentos: 1 }).then(
        (r) => parsearRobots(r.texto),
        (e: unknown) => {
          const status = e instanceof ErrorIngesta ? e.status : undefined;
          // Un depósito de Amazon S3 sin robots.txt responde 403 «AccessDenied» en vez de 404: no es un
          // bloqueo, es un archivo que no existe (RFC 9309: sin robots.txt se puede leer). Así publica Cboe.
          if (status === 403 && e instanceof ErrorIngesta && esS3SinArchivo(e.cuerpo)) return { permitido: true } as const;
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
    if ("permitido" in reglas) {
      // Un feed RSS/Atom es la vía que el propio sitio publica para lectura automática. Si el robots.txt
      // está bloqueado por un cortafuegos (401/403), se permite SOLO el feed; las páginas siguen prohibidas.
      if (!reglas.permitido && reglas.motivo.includes("HTTP 40") && esFeed(u)) {
        return { permitido: true };
      }
      return reglas;
    }
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
    const pausa = Math.max(d.crawlDelaySeg ?? 0, PAUSAS_MINIMAS[new URL(url).hostname] ?? 0);
    if (pausa && previa !== undefined) {
      const falta = previa + pausa * 1000 - ahora();
      if (falta > 0) await (this.op.dormir ?? dormirReal)(Math.min(falta, 30_000));
    }
    this.ultimaLlamada.set(origen, ahora());
    const agente = this.op.agentePara?.(new URL(url).hostname) ?? this.op.agente;
    return obtenerTexto(url, { ...this.op, agente });
  }
}
