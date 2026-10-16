// Adaptado de God's Eye View (MIT, © 2026 Bilawal Sidhu) — src/data/aisStreamAdapter.js
// (classifyAisFailure, parseRetryAfterMs, decodeAisFrameSync, AIS_RECOGNIZED_MESSAGE_TYPES,
// aisEnvelopeMmsi, isRecognizedAisEnvelope, parseAisEnvelope) y server/providers/vessels/ais-live.js
// (forma del mensaje de suscripción). Portado a TypeScript estricto. Cambios: en vez de un vigilante de
// conexión permanente, Strategya abre UNA muestra corta por hora y solo guarda CONTEOS por paso.
//
// AISStream.io · WebSocket wss://stream.aisstream.io/v0/stream (clave gratuita, servicio beta).
// Esquema público de mensajes: https://github.com/aisstream/ais-message-models (type-definition.yaml).
// Privacidad: los MMSI solo viven en memoria durante la muestra para contar buques distintos; nunca se
// guardan nombres ni MMSI en la base, ni en el detalle de la corrida.

import type { FilaObservacion, Tarea } from "../ingesta.ts";

export const URL_AISSTREAM = "wss://stream.aisstream.io/v0/stream";
export const DURACION_MUESTRA_MS = 40_000;
/** AISStream cierra la conexión si la suscripción no llega en los primeros 3 s. */
export const PLAZO_SUSCRIPCION_MS = 3_000;
export const AIS_MAX_FRAME_BYTES = 1_000_000;

/**
 * Cajas de vigilancia por paso: [[lat_sur, lon_oeste], [lat_norte, lon_este]] (formato de AISStream).
 * Los ids coinciden con lib/globo/pasos.ts y con las series AIS_<ID>_* de la migración del globo.
 */
export const CAJAS_PASOS: Readonly<Record<string, [[number, number], [number, number]]>> = {
  ORMUZ: [[25.6, 55.6], [27.2, 57.2]],
  BAB_EL_MANDEB: [[12.0, 42.8], [13.2, 44.0]],
  SUEZ: [[29.8, 32.2], [31.4, 32.7]],
  MALACA: [[1.0, 100.0], [3.5, 103.6]],
  PANAMA: [[8.8, -80.0], [9.5, -79.4]],
  BOSFORO: [[40.95, 28.9], [41.3, 29.2]],
  GIBRALTAR: [[35.75, -6.1], [36.2, -5.2]],
  BUENA_ESPERANZA: [[-35.5, 17.5], [-33.5, 20.5]],
  DANESES: [[54.9, 10.4], [56.3, 13.0]],
};

export const TIPOS_FILTRADOS = ["PositionReport", "ShipStaticData"] as const;

// ---------------------------------------------------------------------------
// Clasificación de fallos (portado de aisStreamAdapter.js)
// ---------------------------------------------------------------------------

const TEXTO_CLAVE =
  /(unauthoriz|unauthoris|forbidden|invalid\s*api[\s_-]*key|invalid\s*key|bad\s*api[\s_-]*key|authentic|api\s*key\s*(is\s*)?(invalid|required|missing|not\s*valid))/i;
const TEXTO_LIMITE = /(rate[\s_-]*limit|too\s*many\s*(requests|connections)|quota\s*exceeded|429)/i;

export type TipoFalloAis = "auth" | "rate-limit" | "transport";

export interface FalloAis {
  tipo: TipoFalloAis;
  mensaje: string;
  reintentarEnMs?: number;
}

/** Retry-After (segundos o fecha HTTP) en milisegundos; 0 si falta o no se entiende. */
export function parsearRetryAfterMs(crudo: string | number | null | undefined, ahoraMs = Date.now()): number {
  if (crudo === null || crudo === undefined) return 0;
  const t = String(crudo).trim();
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t) * 1000;
  const fecha = Date.parse(t);
  return Number.isFinite(fecha) ? Math.max(0, fecha - ahoraMs) : 0;
}

/**
 * Un rechazo de clave no se arregla reintentando, y un límite de uso exige respetar la pausa del servidor:
 * solo «transport» es un fallo genérico.
 */
export function clasificarFalloAis(
  entrada: { httpStatus?: number | string; mensaje?: string; retryAfter?: string | number | null; ahoraMs?: number } = {},
): FalloAis {
  const t = String(entrada.mensaje ?? "").trim();
  let status = Number(entrada.httpStatus);
  if (!Number.isFinite(status)) {
    const m = /unexpected server response:\s*(\d{3})/i.exec(t);
    status = m ? Number(m[1]) : NaN;
  }
  const retry = () => parsearRetryAfterMs(entrada.retryAfter, entrada.ahoraMs);
  if (status === 401 || status === 403) return { tipo: "auth", mensaje: `AISStream rechazó la clave (HTTP ${status})` };
  if (status === 429) return { tipo: "rate-limit", mensaje: "AISStream limitó esta clave (HTTP 429)", reintentarEnMs: retry() };
  if (Number.isFinite(status) && status >= 400) return { tipo: "transport", mensaje: `Falló la conexión con AISStream (HTTP ${status})` };
  if (TEXTO_CLAVE.test(t)) return { tipo: "auth", mensaje: `AISStream rechazó la clave: ${t}` };
  if (TEXTO_LIMITE.test(t)) return { tipo: "rate-limit", mensaje: `AISStream limitó esta clave: ${t}`, reintentarEnMs: retry() };
  return { tipo: "transport", mensaje: t || "error del WebSocket de AISStream" };
}

/** Decodifica un mensaje del socket sin suspender; null si es un Blob (requiere await). */
export function decodificarMarcoSync(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  if (Array.isArray(data)) {
    const partes = data.map(decodificarMarcoSync);
    return partes.some((p) => p === null) ? null : partes.join("");
  }
  return null;
}

export function largoMarco(data: unknown): number {
  if (typeof data === "string") return data.length;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (Array.isArray(data)) return data.reduce((s: number, p) => s + largoMarco(p), 0);
  return 0;
}

/** Enumeración COMPLETA de AisMessageTypes de AISStream (copiada tal cual, no elegida a mano). */
export const TIPOS_MENSAJE_AIS: ReadonlySet<string> = new Set([
  "PositionReport", "UnknownMessage", "AddressedSafetyMessage", "AddressedBinaryMessage", "AidsToNavigationReport",
  "AssignedModeCommand", "BaseStationReport", "BinaryAcknowledge", "BinaryBroadcastMessage", "ChannelManagement",
  "CoordinatedUTCInquiry", "DataLinkManagementMessage", "DataLinkManagementMessageData", "ExtendedClassBPositionReport",
  "GroupAssignmentCommand", "GnssBroadcastBinaryMessage", "Interrogation", "LongRangeAisBroadcastMessage",
  "MultiSlotBinaryMessage", "SafetyBroadcastMessage", "ShipStaticData", "SingleSlotBinaryMessage",
  "StandardClassBPositionReport", "StandardSearchAndRescueAircraftReport", "StaticDataReport",
]);

// deno-lint-ignore no-explicit-any
type Sobre = Record<string, any>;

/** MMSI del mensaje (solo para contar distintos en memoria). */
export function mmsiDelSobre(sobre: Sobre, cuerpo: Sobre = {}): string | null {
  const meta = sobre?.MetaData ?? sobre?.Metadata ?? {};
  const crudo = meta.MMSI ?? cuerpo.UserID ?? cuerpo.UserId ?? cuerpo.Mmsi;
  if (crudo === null || crudo === undefined) return null;
  const t = String(crudo).trim();
  return /^\d{9}$/.test(t) ? t : null;
}

/** ¿Es tráfico AIS real? Tipo reconocido, cuerpo bajo ese tipo y MMSI. */
export function esSobreAisReconocido(sobre: unknown): sobre is Sobre {
  if (!sobre || typeof sobre !== "object" || Array.isArray(sobre)) return false;
  const s = sobre as Sobre;
  if (typeof s.MessageType !== "string" || !TIPOS_MENSAJE_AIS.has(s.MessageType)) return false;
  const cuerpo = s.Message?.[s.MessageType];
  if (!cuerpo || typeof cuerpo !== "object") return false;
  return mmsiDelSobre(s, cuerpo) !== null;
}

export type MarcoAis = { tipo: "malformado" } | { tipo: "error"; mensaje: string } | { tipo: "dato"; sobre: Sobre };

export function parsearMarcoAis(t: string): MarcoAis {
  let s: unknown;
  try {
    s = JSON.parse(t); // solo coordenadas, tipos y MMSI: nada de esto se guarda como cifra
  } catch {
    return { tipo: "malformado" };
  }
  if (!s || typeof s !== "object" || Array.isArray(s)) return { tipo: "malformado" };
  const o = s as Sobre;
  if (o.error) return { tipo: "error", mensaje: String(o.error) };
  return { tipo: "dato", sobre: o };
}

// ---------------------------------------------------------------------------
// Conteo puro por paso
// ---------------------------------------------------------------------------

export function dentroDeCaja(lat: number, lon: number, caja: [[number, number], [number, number]]): boolean {
  const [[s, o], [n, e]] = caja;
  return lat >= s && lat <= n && lon >= o && lon <= e;
}

export function pasoDe(lat: number, lon: number, cajas = CAJAS_PASOS): string | null {
  for (const [id, caja] of Object.entries(cajas)) if (dentroDeCaja(lat, lon, caja)) return id;
  return null;
}

export type ClaseBuque = "tanquero" | "carga" | "otro";

/** Tipo de buque AIS (ITU-R M.1371): 70–79 carga, 80–89 tanquero. */
export function claseBuque(tipo: unknown): ClaseBuque | null {
  const n = typeof tipo === "number" ? tipo : typeof tipo === "string" && /^\d+$/.test(tipo) ? Number(tipo) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 255) return null;
  if (n >= 80 && n <= 89) return "tanquero";
  if (n >= 70 && n <= 79) return "carga";
  return "otro";
}

export interface ConteoPaso {
  buques: number;
  tanqueros: number;
  carga: number;
  /** Buques con datos estáticos (tipo conocido) durante la muestra. */
  conTipo: number;
}

export interface ResultadoConteo {
  porPaso: Record<string, ConteoPaso>;
  mensajes: number;
  reconocidos: number;
  descartados: number;
  errores: string[];
}

function coordenadas(sobre: Sobre, cuerpo: Sobre): { lat: number; lon: number } | null {
  const meta = sobre.MetaData ?? sobre.Metadata ?? {};
  const lat = Number(cuerpo.Latitude ?? meta.latitude ?? meta.Latitude);
  const lon = Number(cuerpo.Longitude ?? meta.longitude ?? meta.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  // 91/181 son los valores AIS de «posición no disponible».
  return { lat, lon };
}

/**
 * Cuenta buques distintos por paso a partir de los mensajes crudos de la muestra. Puro: los MMSI solo
 * viven dentro de esta función; lo que sale son números.
 */
export function contarBuques(marcos: readonly string[], cajas = CAJAS_PASOS): ResultadoConteo {
  const vistos = new Map<string, Set<string>>();
  const tipos = new Map<string, ClaseBuque>();
  const pasoDeMmsi = new Map<string, Set<string>>();
  let reconocidos = 0;
  let descartados = 0;
  const errores: string[] = [];
  for (const id of Object.keys(cajas)) vistos.set(id, new Set());

  for (const t of marcos) {
    if (t.length > AIS_MAX_FRAME_BYTES) {
      descartados++;
      continue;
    }
    const m = parsearMarcoAis(t);
    if (m.tipo === "error") {
      errores.push(m.mensaje);
      continue;
    }
    if (m.tipo === "malformado" || !esSobreAisReconocido(m.sobre)) {
      descartados++;
      continue;
    }
    const sobre = m.sobre;
    const cuerpo = sobre.Message[sobre.MessageType] as Sobre;
    const mmsi = mmsiDelSobre(sobre, cuerpo)!;
    reconocidos++;
    if (sobre.MessageType === "ShipStaticData") {
      const clase = claseBuque(cuerpo.Type);
      if (clase) tipos.set(mmsi, clase);
    }
    const pos = coordenadas(sobre, cuerpo);
    const paso = pos ? pasoDe(pos.lat, pos.lon, cajas) : null;
    if (!paso) continue;
    vistos.get(paso)!.add(mmsi);
    if (!pasoDeMmsi.has(mmsi)) pasoDeMmsi.set(mmsi, new Set());
    pasoDeMmsi.get(mmsi)!.add(paso);
  }

  const porPaso: Record<string, ConteoPaso> = {};
  for (const [paso, mmsis] of vistos) {
    let tanqueros = 0;
    let carga = 0;
    let conTipo = 0;
    for (const mmsi of mmsis) {
      const clase = tipos.get(mmsi);
      if (!clase) continue;
      conTipo++;
      if (clase === "tanquero") tanqueros++;
      if (clase === "carga") carga++;
    }
    porPaso[paso] = { buques: mmsis.size, tanqueros, carga, conTipo };
  }
  return { porPaso, mensajes: marcos.length, reconocidos, descartados, errores };
}

export function suscripcionAis(clave: string, cajas = CAJAS_PASOS) {
  return { APIKey: clave, BoundingBoxes: Object.values(cajas), FilterMessageTypes: [...TIPOS_FILTRADOS] };
}

/** Fecha AAAA-MM-DD en hora de RD. */
function fechaRD(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d);
}

export function filasConteo(conteo: ResultadoConteo, fin: Date): FilaObservacion[] {
  const filas: FilaObservacion[] = [];
  const hora = new Date(Math.floor(fin.getTime() / 60_000) * 60_000).toISOString();
  for (const [paso, c] of Object.entries(conteo.porPaso)) {
    for (const [sufijo, valor] of [["BUQUES", c.buques], ["TANQUEROS", c.tanqueros], ["CARGA", c.carga]] as const) {
      filas.push({ serie_id: `AIS_${paso}_${sufijo}`, valor: String(valor), fecha_dato: fechaRD(fin), hora_dato: hora, url_dato: "https://aisstream.io/" });
    }
  }
  return filas;
}

// ---------------------------------------------------------------------------
// Muestra por WebSocket (inyectable para pruebas)
// ---------------------------------------------------------------------------

export interface SocketAis {
  enviar(texto: string): void;
  cerrar(): void;
}

export interface EventosSocket {
  alAbrir(): void;
  alMensaje(data: unknown): void;
  alError(mensaje: string): void;
  alCerrar(codigo: number, motivo: string): void;
}

export type AbrirSocket = (url: string, eventos: EventosSocket) => SocketAis;

/** Socket nativo (Deno y navegadores): WebSocket estándar. */
export const abrirWebSocketNativo: AbrirSocket = (url, ev) => {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => ev.alAbrir();
  ws.onmessage = (e) => ev.alMensaje(e.data);
  ws.onerror = (e) => ev.alError((e as ErrorEvent).message ?? "error del WebSocket");
  ws.onclose = (e) => ev.alCerrar(e.code, e.reason);
  return {
    enviar: (t) => ws.send(t),
    cerrar: () => {
      try {
        ws.close();
      } catch {
        // ya cerrado
      }
    },
  };
};

export interface MuestraAis {
  marcos: string[];
  fallo: FalloAis | null;
  abierto: boolean;
}

/**
 * Abre el socket, manda la suscripción apenas abre (debe llegar antes de 3 s), escucha `duracionMs` y cierra.
 * Un mensaje de error de AISStream o un cierre prematuro se clasifica (auth / rate-limit / transport).
 */
export function tomarMuestraAis(op: {
  abrir: AbrirSocket;
  suscripcion: unknown;
  duracionMs?: number;
  temporizador?: (fn: () => void, ms: number) => unknown;
  limpiar?: (id: unknown) => void;
}): Promise<MuestraAis> {
  const duracion = op.duracionMs ?? DURACION_MUESTRA_MS;
  const programar = op.temporizador ?? ((fn, ms) => setTimeout(fn, ms));
  const limpiar = op.limpiar ?? ((id) => clearTimeout(id as number));
  return new Promise((resolver) => {
    const marcos: string[] = [];
    let fallo: FalloAis | null = null;
    let abierto = false;
    let terminado = false;
    let socket: SocketAis | null = null;
    const relojes: unknown[] = [];
    const terminar = () => {
      if (terminado) return;
      terminado = true;
      relojes.forEach(limpiar);
      socket?.cerrar();
      resolver({ marcos, fallo, abierto });
    };
    try {
      socket = op.abrir(URL_AISSTREAM, {
        alAbrir() {
          abierto = true;
          try {
            socket!.enviar(JSON.stringify(op.suscripcion));
          } catch (e) {
            fallo = clasificarFalloAis({ mensaje: (e as Error).message });
            terminar();
          }
        },
        alMensaje(data) {
          if (terminado) return;
          if (largoMarco(data) > AIS_MAX_FRAME_BYTES) return;
          const t = decodificarMarcoSync(data);
          if (t === null) return;
          const m = parsearMarcoAis(t);
          if (m.tipo === "error") {
            fallo = clasificarFalloAis({ mensaje: m.mensaje });
            terminar();
            return;
          }
          marcos.push(t);
        },
        alError(mensaje) {
          if (terminado) return;
          fallo ??= clasificarFalloAis({ mensaje });
          terminar();
        },
        alCerrar(codigo, motivo) {
          if (terminado) return;
          if (!fallo) fallo = clasificarFalloAis({ mensaje: motivo || `AISStream cerró la conexión (código ${codigo})` });
          terminar();
        },
      });
    } catch (e) {
      fallo = clasificarFalloAis({ mensaje: (e as Error).message });
      terminar();
      return;
    }
    relojes.push(
      programar(() => {
        if (!abierto && !terminado) {
          fallo = { tipo: "transport", mensaje: `AISStream no abrió la conexión en ${PLAZO_SUSCRIPCION_MS / 1000} s` };
          terminar();
        }
      }, PLAZO_SUSCRIPCION_MS),
    );
    relojes.push(programar(terminar, duracion));
  });
}

export function crearTareaBuquesAis(abrir: AbrirSocket = abrirWebSocketNativo, duracionMs = DURACION_MUESTRA_MS): Tarea {
  return {
    nombre: "buques-ais",
    fuenteId: "aisstream",
    async ejecutar(ctx) {
      const clave = ctx.entorno("AISSTREAM_API_KEY")?.trim();
      const activo = ctx.entorno("GLOBO_AIS_ACTIVO")?.trim() === "1";
      if (!activo || !clave) {
        const advertencias = [
          ...(activo ? [] : ["Buques AIS desactivado (GLOBO_AIS_ACTIVO no es 1)"]),
          ...(clave ? [] : ["Falta AISSTREAM_API_KEY"]),
        ];
        return { parcial: true, advertencias, detalle: { desactivado: true } };
      }

      const muestra = await tomarMuestraAis({ abrir, suscripcion: suscripcionAis(clave), duracionMs });
      const conteo = contarBuques(muestra.marcos);
      const detalle = {
        mensajes: conteo.mensajes,
        reconocidos: conteo.reconocidos,
        descartados: conteo.descartados,
        duracion_s: duracionMs / 1000,
        fallo: muestra.fallo?.tipo ?? null,
      };
      if (conteo.reconocidos === 0) {
        // Sin tráfico reconocido no hay muestra: no se registran ceros.
        throw new Error(muestra.fallo?.mensaje ?? "AISStream no envió mensajes AIS reconocibles durante la muestra");
      }
      await ctx.registrar(filasConteo(conteo, new Date(ctx.ahora.getTime() + duracionMs)));
      // Si la conexión se cortó antes de tiempo, la muestra fue más corta: se guarda y se avisa.
      const advertencias = muestra.fallo ? [`Muestra incompleta: ${muestra.fallo.mensaje}`] : [];
      return { parcial: advertencias.length > 0, advertencias, detalle };
    },
  };
}

export const tareaBuquesAis: Tarea = crearTareaBuquesAis();
