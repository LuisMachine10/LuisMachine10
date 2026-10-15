// Descarga de archivos binarios (.xlsx) con las MISMAS reglas que ctx.obtener():
// robots.txt, dominios prohibidos, Crawl-delay, tiempo máximo y reintentos.
//
// El contexto de ingesta solo devuelve texto (Respuesta.texto), y decodificar un .xlsx como UTF-8
// lo corrompe. En vez de duplicar la política de lectura, se usa el mismo `Lector` de http.ts con un
// fetch que guarda los bytes originales antes de que el Lector los convierta en texto.

import { agenteUsuario, Lector } from "../http.ts";

export type ObtenerBytes = (url: string) => Promise<Uint8Array>;

export interface OpcionesDescarga {
  agente?: string;
  timeoutMs?: number;
  reintentos?: number;
  fetch?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
}

function urlDe(entrada: string | URL | Request): string {
  if (typeof entrada === "string") return entrada;
  if (entrada instanceof URL) return entrada.href;
  return entrada.url;
}

/** Crea un descargador de bytes. Un descargador por corrida: el robots.txt se lee una vez por sitio. */
export function crearObtenerBytes(op: OpcionesDescarga = {}): ObtenerBytes {
  const capturas = new Map<string, Uint8Array>();
  const base = op.fetch ?? fetch;
  const capturador = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const r = await base(entrada, init);
    if (!r.ok) return r;
    const bytes = new Uint8Array(await r.arrayBuffer());
    capturas.set(urlDe(entrada), bytes);
    return new Response(bytes, { status: r.status, statusText: r.statusText, headers: r.headers });
  }) as typeof fetch;

  const lector = new Lector({
    agente: op.agente ?? agenteUsuario(),
    timeoutMs: op.timeoutMs ?? 30_000,
    reintentos: op.reintentos ?? 2,
    fetch: capturador,
    dormir: op.dormir,
  });

  return async (url) => {
    await lector.obtener(url); // lanza si robots.txt, la lista de prohibidos o el servidor lo impiden
    const bytes = capturas.get(url);
    capturas.delete(url);
    if (!bytes) throw new Error(`No se recibieron los bytes de ${url}`);
    return bytes;
  };
}
