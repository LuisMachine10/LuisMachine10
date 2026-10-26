// Tipos del Boletín por reglas (sin IA). Lo mismo corre en la Edge Function (Deno) y en la app (Next):
// por eso este módulo no importa nada de la app ni de Node, y sus imports llevan extensión .ts.
//
// Entrada: DatosBoletin = lo que devuelve mercado.boletin_datos(tipo, ahora) (cifras como texto).
// Salida:  Edicion = contenido estructurado; de ahí salen el texto plano, el HTML del correo y la página.

export type TipoEdicion = "am" | "cierre" | "finde" | "tasas";
export const TIPOS_EDICION: readonly TipoEdicion[] = ["am", "cierre", "finde", "tasas"];

export function esTipoEdicion(x: unknown): x is TipoEdicion {
  return typeof x === "string" && (TIPOS_EDICION as readonly string[]).includes(x);
}

// ───────────────────────────── Entrada ─────────────────────────────

export interface ObsSerie {
  serie_id: string;
  nombre: string;
  nombre_corto: string;
  categoria: string;
  unidad: string;
  frecuencia: string;
  max_antiguedad_min: number;
  sustituto_de: string | null;
  meta: Record<string, unknown> | null;
  valor: string;
  cambio: string | null;
  cambio_pct: string | null;
  fecha_dato: string;
  hora_dato: string | null;
  recogido_en: string;
  url_dato: string | null;
  estado: string;
  fuente_id: string;
  fuente_nombre: string;
  fuente_url: string;
}

export interface SemanaSerie {
  serie_id: string;
  valor_fin: string;
  fecha_fin: string;
  valor_ini: string | null;
  fecha_ini: string | null;
}

export interface TitularGuardado {
  id: number;
  titular: string;
  url: string;
  medio: string;
  fecha: string;
  categoria: string;
  fuente_id: string | null;
}

export interface AlertaDia {
  id: number;
  serie_id: string;
  nombre: string;
  nombre_corto: string;
  unidad: string;
  valor: string;
  mensaje: string;
  disparada_en: string;
  fecha_dato: string;
  fuente_nombre: string | null;
  fuente_url: string | null;
}

export interface EventoAgenda {
  fecha_hora: string;
  institucion: string;
  evento: string;
  importancia: number;
  confirmado: boolean;
  url: string | null;
  hora_conocida: boolean;
  zona: string | null;
}

export interface EmisionRD {
  id: number;
  fuente: string;
  numero: string;
  emisor: string | null;
  instrumento: string | null;
  monto: string | null;
  moneda: string | null;
  tasa: string | null;
  fecha: string;
  url: string;
  descripcion: string | null;
  recogido_en: string;
}

export interface AvisoFeed {
  institucion: string;
  titulo: string;
  url: string;
  fecha: string;
}

export interface FondoGuardado {
  safi: string;
  fondo: string;
  moneda: "DOP" | "USD";
  plazo_dias: number;
  rendimiento: string;
  fecha_corte: string;
  url_fuente: string;
  origen: string | null;
}

export interface FuenteCatalogo {
  id: string;
  nombre: string;
  url: string;
}

/** Nivel de una cifra clave guardado en la edición (el Cierre lo compara con la AM). */
export interface NivelGuardado {
  valor: string;
  fecha_dato: string;
  hora_dato: string | null;
}

/** Foto de «Tu dinero» que calcula la app con el motor del Portafolio (mercado.boletin_tu_dinero). */
export interface FotoDinero {
  /** Mes AAAA-MM de la foto. */
  mes: string;
  patrimonio: string | null;
  /** true = calculada con la cartera de hoy; false = la del último cierre de mes. */
  vivo: boolean;
  cambio: string | null;
  /** Cambio en por ciento (ya multiplicado por 100). */
  cambio_pct: string | null;
  /** Mes AAAA-MM contra el que se compara el cambio. */
  previo: string | null;
  aportes: { plan: number; pendientes: number; total: string; pendiente: string } | null;
  riesgos: { titulo: string; impacto: string; probabilidad: string }[];
  riesgos_evaluados: number;
}

export interface ResultadoMes {
  mes: string;
  presupuestado: Record<string, string> | null;
  real: Record<string, string> | null;
}

export interface TuDineroDatos {
  configurado: boolean;
  presupuesto: ResultadoMes | null;
  foto: FotoDinero | null;
  foto_en: string | null;
}

export interface PreferenciasBoletin {
  am?: boolean;
  cierre?: boolean;
  finde?: boolean;
  tasas?: boolean;
  tu_dinero?: boolean;
}

export interface DatosBoletin {
  tipo: TipoEdicion;
  ahora: string;
  hoy: string;
  viernes: string;
  preferencias: PreferenciasBoletin;
  series: ObsSerie[];
  semana: SemanaSerie[];
  umbrales: { serie_id: string; umbral: string }[];
  alertas: AlertaDia[];
  titulares: TitularGuardado[];
  agenda: EventoAgenda[];
  emisiones: EmisionRD[];
  avisos: AvisoFeed[];
  fondos: FondoGuardado[];
  fuentes: FuenteCatalogo[];
  previa: { id: number; fecha: string; creado_en: string } | null;
  am_hoy: { id: number; creado_en: string; niveles: Record<string, NivelGuardado> } | null;
  tu_dinero: TuDineroDatos | null;
}

// ───────────────────────────── Salida ─────────────────────────────

export type EstadoCifra = "ok" | "viejo" | "no_confirmado";
export type Direccion = "sube" | "baja" | "igual";

export interface FuenteRef {
  nombre: string;
  url: string | null;
}

export interface Porque {
  titular: string;
  url: string;
  medio: string;
}

/** Una cifra: dato · nivel · cambio · fecha · fuente. */
export interface Fila {
  etiqueta: string;
  /** Subtítulo de grupo (Bolsas de EE. UU., Metales…): el renderizador lo pone como encabezado. */
  grupo?: string;
  nivel: string | null;
  cambio: string | null;
  dir: Direccion | null;
  /** Fecha del dato ya escrita («24 oct», «sep 2026»). */
  fecha: string | null;
  fuente: FuenteRef | null;
  estado: EstadoCifra;
  nota?: string | null;
  /** Solo en «Las 5 del día»: el titular que lo menciona, o null = «causa no confirmada». */
  porque?: Porque | null;
}

export interface Item {
  texto: string;
  url?: string | null;
  medio?: string | null;
  meta?: string | null;
}

export interface Seccion {
  id: string;
  titulo: string;
  intro?: string;
  filas?: Fila[];
  items?: Item[];
  /** Si la sección no tiene dato: qué falta y por qué. */
  vacio?: string;
  /** Sección personal («Tu dinero»): solo para el dueño. */
  personal?: boolean;
  /** Recorte por largo: se quitan elementos del final, de menor a mayor prioridad, hasta `minimo`. */
  recorte?: { prioridad: number; minimo: number; en?: "items" | "filas" };
}

export interface Edicion {
  tipo: TipoEdicion;
  nombre: string;
  /** Día de la edición (AAAA-MM-DD, hora RD). */
  fecha: string;
  fechaTexto: string;
  /** Momento del armado (ISO). */
  armadoEn: string;
  asunto: string;
  /** «El dato del día»: el movimiento más grande en % entre las cifras clave. */
  datoDelDia: string | null;
  resumen: string[];
  secciones: Seccion[];
  fuentes: FuenteRef[];
  noConfirmado: string[];
  /** Niveles de las cifras clave (los usa el Cierre para decir qué cambió desde la AM). */
  niveles: Record<string, NivelGuardado>;
  conTuDinero: boolean;
  palabras: number;
  limitePalabras: number;
  /** Qué se recortó para no pasar del límite de palabras. */
  recortes: string[];
  prueba: boolean;
}
