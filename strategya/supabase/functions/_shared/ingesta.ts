// Orquestador de una corrida de ingesta: abre la corrida, ejecuta la tarea, la cierra
// con su estado y nunca deja una excepción sin registrar en mercado.corridas.

import { ocultarClaves, type OpcionesApi, type Respuesta } from "./http.ts";

export type EstadoObservacion = "ok" | "desactualizado" | "error" | "no_confirmado";

/** Una observación lista para mercado.registrar_observaciones. Los números viajan como texto. */
export interface FilaObservacion {
  serie_id: string;
  valor: string;
  fecha_dato: string; // AAAA-MM-DD
  hora_dato?: string; // ISO 8601 con zona
  cambio?: string;
  cambio_pct?: string;
  url_dato?: string;
  estado?: EstadoObservacion;
  /** Fuente de esta fila si no es la de la serie (respaldo: Cboe, BCE o FRED en una serie de FMP). */
  fuente_id?: string;
}

export interface ConteoRegistro {
  recibidas: number;
  insertadas: number;
  actualizadas: number;
}

export type EstadoCorrida = "ok" | "parcial" | "error" | "omitida";

export interface CierreCorrida {
  estado: EstadoCorrida;
  error?: string;
  filas: number;
  detalle: Record<string, unknown>;
}

export interface OpcionesGuardar {
  /** Columnas de la restricción única para el upsert (p. ej. "hash"). */
  conflicto?: string;
  /** true = si ya existe, no se toca (insert … on conflict do nothing). */
  ignorarDuplicados?: boolean;
}

export interface Almacen {
  iniciarCorrida(tarea: string, fuenteId: string): Promise<number>;
  terminarCorrida(id: number, cierre: CierreCorrida): Promise<void>;
  registrarObservaciones(corridaId: number, filas: FilaObservacion[]): Promise<ConteoRegistro>;
  /** Upsert en una tabla del esquema mercado. Devuelve cuántas filas se escribieron. */
  guardar(tabla: string, filas: Record<string, unknown>[], opciones?: OpcionesGuardar): Promise<number>;
  /** Llama una función SQL del esquema mercado. */
  rpc<T = unknown>(funcion: string, args?: Record<string, unknown>): Promise<T>;
}

export interface ContextoTarea {
  ahora: Date;
  /** GET con robots.txt, tiempo máximo y reintentos (páginas y archivos públicos). */
  obtener(url: string): Promise<Respuesta>;
  /** Llamada a una API documentada con clave (FMP, Finnhub, Anthropic, Resend). Sin robots.txt. */
  api(url: string, opciones?: OpcionesApi): Promise<Respuesta>;
  /** Variables de entorno de la función (claves de API). */
  entorno(nombre: string): string | undefined;
  registrar(filas: FilaObservacion[]): Promise<ConteoRegistro>;
  guardar(tabla: string, filas: Record<string, unknown>[], opciones?: OpcionesGuardar): Promise<number>;
  rpc<T = unknown>(funcion: string, args?: Record<string, unknown>): Promise<T>;
}

export interface ResultadoTarea {
  /** true si una parte falló pero hubo datos buenos que guardar. */
  parcial?: boolean;
  advertencias?: string[];
  detalle?: Record<string, unknown>;
}

export interface Tarea {
  nombre: string;
  fuenteId: string;
  ejecutar(ctx: ContextoTarea): Promise<ResultadoTarea>;
}

export interface ResumenCorrida extends CierreCorrida {
  tarea: string;
  corridaId: number;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esDecimal(s: string): boolean {
  return DECIMAL.test(s);
}

/** Valida forma antes de mandar a la base: un número mal leído nunca se guarda. */
export function validarFila(f: FilaObservacion): string | null {
  if (!f.serie_id) return "sin serie_id";
  if (!esDecimal(f.valor)) return `valor no numérico «${f.valor}» en ${f.serie_id}`;
  if (!FECHA.test(f.fecha_dato)) return `fecha inválida «${f.fecha_dato}» en ${f.serie_id}`;
  if (f.cambio !== undefined && !esDecimal(f.cambio)) return `cambio no numérico en ${f.serie_id}`;
  if (f.cambio_pct !== undefined && !esDecimal(f.cambio_pct)) return `cambio_pct no numérico en ${f.serie_id}`;
  return null;
}

function mensaje(e: unknown): string {
  // Ninguna clave de API llega a corridas.error (se lee desde /estado).
  const m = ocultarClaves(e instanceof Error ? e.message : String(e));
  return m.length > 2000 ? `${m.slice(0, 2000)}…` : m;
}

export interface Dependencias {
  obtener: (url: string) => Promise<Respuesta>;
  api?: (url: string, opciones?: OpcionesApi) => Promise<Respuesta>;
  entorno?: (nombre: string) => string | undefined;
  ahora?: () => Date;
}

export async function correrTarea(tarea: Tarea, almacen: Almacen, dependencias: Dependencias): Promise<ResumenCorrida> {
  const corridaId = await almacen.iniciarCorrida(tarea.nombre, tarea.fuenteId);
  let filas = 0;
  const conteo: ConteoRegistro = { recibidas: 0, insertadas: 0, actualizadas: 0 };
  let cierre: CierreCorrida;

  const ctx: ContextoTarea = {
    ahora: (dependencias.ahora ?? (() => new Date()))(),
    obtener: dependencias.obtener,
    api: dependencias.api ?? (() => Promise.reject(new Error("Este contexto no tiene acceso a APIs"))),
    entorno: dependencias.entorno ?? (() => undefined),
    async guardar(tabla, lote, opciones) {
      if (lote.length === 0) return 0;
      const n = await almacen.guardar(tabla, lote, opciones);
      filas += n;
      return n;
    },
    rpc: (funcion, args) => almacen.rpc(funcion, args),
    async registrar(lote) {
      for (const f of lote) {
        const problema = validarFila(f);
        if (problema) throw new Error(`Fila rechazada antes de guardar: ${problema}`);
      }
      if (lote.length === 0) return { recibidas: 0, insertadas: 0, actualizadas: 0 };
      const r = await almacen.registrarObservaciones(corridaId, lote);
      filas += r.insertadas + r.actualizadas;
      conteo.recibidas += r.recibidas;
      conteo.insertadas += r.insertadas;
      conteo.actualizadas += r.actualizadas;
      return r;
    },
  };

  try {
    const r = await tarea.ejecutar(ctx);
    const advertencias = r.advertencias ?? [];
    cierre = {
      estado: r.parcial ? "parcial" : "ok",
      error: advertencias.length ? mensaje(advertencias.join(" · ")) : undefined,
      filas,
      detalle: { ...conteo, ...r.detalle, advertencias: advertencias.map((a) => ocultarClaves(a)) },
    };
  } catch (e) {
    cierre = { estado: "error", error: mensaje(e), filas, detalle: { ...conteo } };
  }

  try {
    await almacen.terminarCorrida(corridaId, cierre);
  } catch (e) {
    cierre = { ...cierre, estado: "error", error: `No se pudo cerrar la corrida: ${mensaje(e)}` };
  }
  return { tarea: tarea.nombre, corridaId, ...cierre };
}
