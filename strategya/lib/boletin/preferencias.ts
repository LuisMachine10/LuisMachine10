// Preferencias del Boletín (personal.preferencias, clave «boletin»): qué ediciones salen y si el correo
// lleva «Tu dinero». Lo que no esté guardado vale «sí» (así venía funcionando con las tareas de Claude).
import { EDICIONES } from "../../supabase/functions/_shared/boletin/horario.ts";
import { TIPOS_EDICION, type TipoEdicion } from "../../supabase/functions/_shared/boletin/tipos.ts";

export type PrefBoletin = Record<TipoEdicion | "tu_dinero", boolean>;

export function normalizarPrefBoletin(v: unknown): PrefBoletin {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const leer = (k: string) => (typeof o[k] === "boolean" ? (o[k] as boolean) : true);
  return { am: leer("am"), cierre: leer("cierre"), finde: leer("finde"), tasas: leer("tasas"), tu_dinero: leer("tu_dinero") };
}

export const NOMBRE_TIPO: Record<TipoEdicion, string> = {
  am: "Bitácora · AM",
  cierre: "Bitácora · Cierre",
  finde: "Fin de semana · Materias primas",
  tasas: "Boletín de Tasas RD",
};

const DIAS: Record<TipoEdicion, string> = {
  am: "lunes a viernes",
  cierre: "lunes a viernes",
  finde: "sábado y domingo",
  tasas: "los lunes",
};

function hora12(h: number, m: number): string {
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** «Lunes a viernes, 7:35 AM (llega antes de las 8:00 AM)». */
export function cuandoSale(tipo: TipoEdicion): string {
  const e = EDICIONES[tipo];
  const d = DIAS[tipo];
  return `${d.charAt(0).toUpperCase()}${d.slice(1)}, ${hora12(e.hora, e.minuto)} hora RD (llega antes de las ${e.llegaAntes})`;
}

export function esTipo(x: unknown): x is TipoEdicion {
  return typeof x === "string" && (TIPOS_EDICION as readonly string[]).includes(x);
}
