// Términos y privacidad (Núcleo v2, manual sección F). Puro, sin red.
//
// La casilla «Acepto los términos y condiciones» se marca UNA vez por versión: se guarda la versión y la fecha de
// aceptación en personal.preferencias (clave «terminos») y una cookie con la versión para no consultar la base en cada
// página. Si cambia el texto de forma importante, se sube VERSION_TERMINOS y se vuelve a pedir.

export const VERSION_TERMINOS = "2026-10-26";
export const COOKIE_TERMINOS = "strategya_terminos";
export const RUTA_TERMINOS = "/terminos";

export interface AceptacionTerminos {
  version: string;
  /** ISO de cuando se aceptó. */
  aceptadoEn: string;
}

/** Lee la preferencia guardada (lo que no sirva = no aceptado). */
export function leerAceptacion(v: unknown): AceptacionTerminos | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.version !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.version)) return null;
  if (typeof o.aceptadoEn !== "string" || Number.isNaN(Date.parse(o.aceptadoEn))) return null;
  return { version: o.version, aceptadoEn: o.aceptadoEn };
}

/** ¿Aceptó la versión vigente? */
export const aceptoVigente = (a: AceptacionTerminos | null) => a?.version === VERSION_TERMINOS;

/**
 * ¿Hay que llevarlo a /terminos antes de esta página? Solo navegaciones normales (GET de una página) de alguien que
 * entró y no tiene la cookie de la versión vigente. Nunca /login, /terminos ni archivos.
 */
export function pideTerminos(r: { ruta: string; metodo: string; cookie: string | undefined; conSesion: boolean; esAccion: boolean }): boolean {
  if (!r.conSesion || r.metodo !== "GET" || r.esAccion) return false;
  if (r.ruta === RUTA_TERMINOS || r.ruta.startsWith(`${RUTA_TERMINOS}/`) || r.ruta === "/login" || r.ruta.startsWith("/login/")) return false;
  if (/\.[a-z0-9]{2,5}$/i.test(r.ruta)) return false;
  return r.cookie !== VERSION_TERMINOS;
}

/** «volver» seguro: solo rutas internas. */
export function rutaVolver(v: string | null | undefined): string {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith(RUTA_TERMINOS) ? v.slice(0, 300) : "/";
}

/** El texto de los términos, en lenguaje simple (lo que se acepta). */
export const TEXTO_TERMINOS: readonly { titulo: string; parrafos: readonly string[] }[] = [
  {
    titulo: "Tu información es tuya",
    parrafos: [
      "Lo que anotas en Strategya (tus cuentas, inversiones, deudas, presupuesto y preferencias) es tuyo. Solo tú lo ves: la base de datos lo protege por usuario.",
      "No se vende ni se comparte con nadie. No se usa para publicidad.",
      "Nunca te pedimos ni guardamos números de cuenta, de tarjeta ni de cédula: basta un nombre que reconozcas.",
    ],
  },
  {
    titulo: "Puedes llevártela o borrarla",
    parrafos: [
      "Puedes descargar tus datos cuando quieras (Portafolio → Exportar y Presupuesto → Configuración → Avanzado).",
      "Puedes borrar lo que anotaste: cada fila tiene su botón para borrar, con una pantalla que te pide confirmar. Para borrar todo, escríbenos y lo hacemos contigo.",
    ],
  },
  {
    titulo: "No es asesoría de inversión",
    parrafos: [
      "Strategya ordena tus números y te muestra cálculos con tus propios datos. No te dice qué comprar ni qué vender.",
      "Las proyecciones son cálculos con tus tasas y tus montos, no pronósticos.",
    ],
  },
  {
    titulo: "De dónde salen las cifras",
    parrafos: [
      "Las cifras del mercado vienen de fuentes públicas citadas al lado de cada número (por ejemplo, el Banco Central, el BCE o la Reserva Federal), con su fecha.",
      "Si un dato no llegó, la pantalla dice «sin dato», «no confirmado» o «dato viejo»: nunca se inventa. Ninguna cifra sale de un modelo de inteligencia artificial.",
    ],
  },
];
