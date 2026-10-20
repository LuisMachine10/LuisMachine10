// Nombres en palabras simples para cada lectura automática (tarea de ingesta) y la familia a la que pertenece.
// El id técnico (`cotizaciones-fmp`) sigue visible en pequeño y en el title, para quien lo necesite.

export type Familia = "Mercado" | "RD" | "Noticias" | "Instituciones" | "Globo" | "IA y alertas" | "Otras";

export const FAMILIAS: readonly Familia[] = ["Mercado", "RD", "Noticias", "Instituciones", "Globo", "IA y alertas", "Otras"];

export const DESCRIPCION_FAMILIA: Readonly<Record<Familia, string>> = {
  Mercado: "Precios de bolsas, materias primas, divisas, tasas y bonos.",
  RD: "Banco Central, Hacienda, mercado de valores y combustibles de República Dominicana.",
  Noticias: "Titulares de prensa que alimentan la terminal.",
  Instituciones: "Comunicados de bancos centrales y organismos.",
  Globo: "Sismos, ciclones y barcos para el mapa del mundo.",
  "IA y alertas": "Textos redactados con IA y el vigilante de tus umbrales.",
  Otras: "Lecturas que todavía no tienen un grupo asignado.",
};

const TAREAS: Readonly<Record<string, { nombre: string; familia: Familia }>> = {
  tesoro: { nombre: "Bonos del Tesoro de EE. UU.", familia: "Mercado" },
  "cotizaciones-fmp": { nombre: "Índices, metales y petróleo", familia: "Mercado" },
  "cotizaciones-finnhub": { nombre: "Fondos cotizados (ETF) y cobre", familia: "Mercado" },
  "cotizaciones-cboe": { nombre: "Índices de respaldo (Cboe)", familia: "Mercado" },
  "divisas-bce": { nombre: "Tipos de cambio del BCE", familia: "Mercado" },
  "cierres-fred": { nombre: "Cierres diarios (FRED)", familia: "Mercado" },
  "tasas-politica": { nombre: "Tasas de bancos centrales", familia: "Mercado" },
  "movimientos-acciones": { nombre: "Acciones que más se movieron", familia: "Mercado" },
  "sec-edgar": { nombre: "Fusiones y salidas a bolsa (SEC)", familia: "Mercado" },
  "precios-cartera": { nombre: "Precios de tu cartera", familia: "Mercado" },
  "bcrd-portada": { nombre: "Dólar y tasa del Banco Central", familia: "RD" },
  "bcrd-excel": { nombre: "Estadísticas del Banco Central", familia: "RD" },
  "credito-publico": { nombre: "Subastas de bonos de Hacienda", familia: "RD" },
  simv: { nombre: "Avisos de la SIMV", familia: "RD" },
  micm: { nombre: "Precios de combustibles (MICM)", familia: "RD" },
  "fondos-safis": { nombre: "Fondos de inversión (SAFI)", familia: "RD" },
  "noticias-gdelt": { nombre: "Noticias del mundo (GDELT)", familia: "Noticias" },
  "noticias-prensa": { nombre: "Prensa financiera", familia: "Noticias" },
  "instituciones-fed": { nombre: "Reserva Federal (Fed)", familia: "Instituciones" },
  "instituciones-bce": { nombre: "Banco Central Europeo", familia: "Instituciones" },
  "instituciones-boj": { nombre: "Banco de Japón", familia: "Instituciones" },
  "instituciones-boe": { nombre: "Banco de Inglaterra", familia: "Instituciones" },
  "instituciones-bis": { nombre: "Banco de Pagos Internacionales", familia: "Instituciones" },
  "instituciones-tesoro": { nombre: "Tesoro de EE. UU. (prensa)", familia: "Instituciones" },
  "instituciones-cepal": { nombre: "CEPAL", familia: "Instituciones" },
  "sismos-usgs": { nombre: "Sismos (USGS)", familia: "Globo" },
  "ciclones-nhc": { nombre: "Ciclones y tormentas (NHC)", familia: "Globo" },
  "buques-ais": { nombre: "Barcos en ruta (AIS)", familia: "Globo" },
  alertas: { nombre: "Vigilante de alertas", familia: "IA y alertas" },
  "ia-porque": { nombre: "«¿Por qué se movió?» con IA", familia: "IA y alertas" },
  "ia-resumen": { nombre: "Resumen del día con IA", familia: "IA y alertas" },
};

/** Nombre legible y familia de una tarea. Una tarea nueva sin entrada cae en «Otras» con su id como nombre. */
export function describirTarea(id: string): { nombre: string; familia: Familia } {
  const t = TAREAS[id];
  if (t) return t;
  if (id.startsWith("instituciones-")) return { nombre: id.replace("instituciones-", "Institución: "), familia: "Instituciones" };
  return { nombre: id, familia: "Otras" };
}

export type Salud = "ok" | "parcial" | "error" | "corriendo" | "otro";

/** Estado de una corrida en tres colores. Una corrida que lleva más de 30 min «corriendo» se da por colgada (error). */
export function salud(estado: string, inicio: string, ahora: Date, colgadaMin = 30): { salud: Salud; texto: string } {
  if (estado === "corriendo") {
    return ahora.getTime() - new Date(inicio).getTime() > colgadaMin * 60_000
      ? { salud: "error", texto: "Colgada" }
      : { salud: "corriendo", texto: "Leyendo ahora" };
  }
  if (estado === "ok") return { salud: "ok", texto: "Al día" };
  if (estado === "parcial") return { salud: "parcial", texto: "A medias" };
  if (estado === "error") return { salud: "error", texto: "Falló" };
  return { salud: "otro", texto: estado };
}
