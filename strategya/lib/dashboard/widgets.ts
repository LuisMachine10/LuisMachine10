// Catálogo de widgets del Dashboard. Solo datos (sin React ni red): lo usan el servidor, el modo de
// edición en el navegador y las pruebas.
//
// Para agregar un widget desde otro módulo:
//   1. Agrega aquí su ficha (id único en minúsculas con guiones, título, una línea de qué es).
//   2. Agrega su componente en componentes/dashboard/Widgets.tsx (mapa RENDER), con su sello de fuente.
// Un id que se borre del catálogo se ignora en las disposiciones guardadas (no rompe nada).

export type Tamano = 1 | 2 | 3;
export type GrupoWidget = "dia" | "cifras" | "mercado" | "rd" | "personal" | "noticias";

export interface FichaWidget {
  id: string;
  titulo: string;
  /** Qué es, en una línea de palabras simples. */
  que: string;
  grupo: GrupoWidget;
  /** Tamaño (columnas de una rejilla de 3) la primera vez. */
  tamano: Tamano;
  /** Si se ve la primera vez. */
  visible: boolean;
}

export const NOMBRE_GRUPO: Record<GrupoWidget, string> = {
  dia: "El día",
  cifras: "Cifras del día",
  mercado: "Mercados",
  rd: "República Dominicana",
  personal: "Tu dinero",
  noticias: "Noticias y agenda",
};

/** Orden = disposición por defecto. */
export const WIDGETS: readonly FichaWidget[] = [
  { id: "hoy-30s", titulo: "Hoy en 30 segundos", que: "El día en tres o cuatro frases, armadas con las cifras guardadas.", grupo: "dia", tamano: 3, visible: true },
  { id: "cifra-spx", titulo: "Bolsa de EE. UU. (S&P 500)", que: "Cómo les va a las 500 empresas más grandes de EE. UU.", grupo: "cifras", tamano: 1, visible: true },
  { id: "cifra-oro", titulo: "Oro", que: "Refugio cuando hay miedo en los mercados.", grupo: "cifras", tamano: 1, visible: true },
  { id: "cifra-brent", titulo: "Petróleo Brent", que: "Influye en el precio de los combustibles en RD.", grupo: "cifras", tamano: 1, visible: true },
  { id: "cifra-dolar-rd", titulo: "Dólar en RD (venta)", que: "Lo que cuesta comprar un dólar según el Banco Central.", grupo: "cifras", tamano: 1, visible: true },
  { id: "cifra-bono-10a", titulo: "Bono de EE. UU. a 10 años", que: "La tasa que guía préstamos e hipotecas en el mundo.", grupo: "cifras", tamano: 1, visible: true },
  { id: "cifra-bitcoin", titulo: "Bitcoin", que: "La criptomoneda más grande.", grupo: "cifras", tamano: 1, visible: true },
  { id: "portafolio", titulo: "Rendimiento del portafolio", que: "Cuánto tienes invertido y cuánto cambió en el mes.", grupo: "personal", tamano: 1, visible: true },
  { id: "presupuesto", titulo: "Rendimiento del presupuesto", que: "Tu utilidad neta del mes: lo presupuestado contra lo real.", grupo: "personal", tamano: 2, visible: true },
  { id: "mis-noticias", titulo: "Mis noticias", que: "Los titulares de los medios, temas y palabras que tú eliges.", grupo: "noticias", tamano: 2, visible: true },
  { id: "alertas", titulo: "Alertas de hoy", que: "Los activos que cruzaron uno de tus umbrales hoy.", grupo: "dia", tamano: 1, visible: true },
  { id: "dolar-bcrd", titulo: "Dólar BCRD", que: "Compra y venta del dólar según el Banco Central.", grupo: "rd", tamano: 1, visible: true },
  { id: "curva-tesoro", titulo: "Curva del Tesoro", que: "Lo que paga EE. UU. por prestarle dinero, de 1 mes a 30 años.", grupo: "mercado", tamano: 2, visible: true },
  { id: "combustibles", titulo: "Combustibles", que: "Precios oficiales de la semana en RD (MICM).", grupo: "rd", tamano: 1, visible: true },
  { id: "fondos", titulo: "Fondos de inversión", que: "Los 5 fondos que más rindieron (base 30 días).", grupo: "rd", tamano: 1, visible: true },
  { id: "agenda", titulo: "Agenda", que: "Reuniones de bancos centrales y fechas clave que vienen.", grupo: "noticias", tamano: 1, visible: true },
];

const POR_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export function fichaDe(id: string, catalogo: readonly FichaWidget[] = WIDGETS): FichaWidget | undefined {
  return catalogo === WIDGETS ? POR_ID.get(id) : catalogo.find((w) => w.id === id);
}
