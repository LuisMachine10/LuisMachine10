// Catálogo de widgets del Dashboard. Solo datos (sin React ni red): lo usan el servidor, el modo de
// edición en el navegador y las pruebas.
//
// Para agregar un widget desde otro módulo:
//   1. Agrega aquí su ficha (id único en minúsculas con guiones, título, una línea de qué es).
//   2. Agrega su componente en componentes/dashboard/Widgets.tsx (mapa RENDER), con su sello de fuente.
// Un id que se borre del catálogo se ignora en las disposiciones guardadas (no rompe nada).

export type Tamano = 1 | 2 | 3;
export type GrupoWidget = "dia" | "cifras" | "mercado" | "rd" | "personal" | "noticias" | "capital-hoy" | "capital-futuro" | "capital-riesgo";

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
  "capital-hoy": "Tu dinero hoy",
  "capital-futuro": "Rendimiento y futuro",
  "capital-riesgo": "Riesgos y control",
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
  { id: "ultimo-boletin", titulo: "Último boletín", que: "La última edición que te llegó al correo, con su dato del día.", grupo: "dia", tamano: 1, visible: false },
];

const POR_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export function fichaDe(id: string, catalogo: readonly FichaWidget[] = WIDGETS): FichaWidget | undefined {
  return catalogo === WIDGETS ? POR_ID.get(id) : catalogo.find((w) => w.id === id);
}

/**
 * Widgets del Resumen del Portafolio Financiero (/capital). Misma mecánica que el Dashboard, con su propia
 * preferencia (clave «portafolio»). Sus componentes viven en componentes/capital/WidgetsPortafolio.tsx.
 */
export const WIDGETS_PORTAFOLIO: readonly FichaWidget[] = [
  { id: "pf-patrimonio", titulo: "Patrimonio neto", que: "Lo que tienes menos lo que debes, mes a mes.", grupo: "capital-hoy", tamano: 2, visible: true },
  { id: "pf-balance", titulo: "Tienes y debes", que: "Tus cuentas, inversiones y deudas de hoy.", grupo: "capital-hoy", tamano: 1, visible: true },
  { id: "pf-participacion", titulo: "Participación por categoría", que: "Cómo está repartido tu dinero, contra tu meta.", grupo: "capital-hoy", tamano: 2, visible: true },
  { id: "pf-retorno", titulo: "Retorno esperado", que: "Lo que cada categoría promete pagar al año según sus tasas.", grupo: "capital-futuro", tamano: 1, visible: true },
  { id: "pf-futuro", titulo: "El futuro de cada categoría", que: "Cuánto tendría cada una con tus aportes y el interés compuesto.", grupo: "capital-futuro", tamano: 2, visible: true },
  { id: "pf-aportes", titulo: "Lo que planeaste ahorrar este mes", que: "Tus líneas de ahorro e inversión del mes (instrumento y monto): hechas, a medias o por hacer.", grupo: "capital-futuro", tamano: 1, visible: true },
  { id: "pf-puente", titulo: "Puente de patrimonio e indicadores", que: "Por qué cambió tu patrimonio, y tus números clave al lado.", grupo: "capital-riesgo", tamano: 3, visible: true },
  { id: "pf-riesgos", titulo: "Matriz de riesgos", que: "Liquidez, concentración, dólar y deuda: qué tan probable y qué tan grave.", grupo: "capital-riesgo", tamano: 2, visible: true },
  { id: "pf-dolar", titulo: "Cuánto dependes del dólar", que: "Qué parte de tu patrimonio está en otra moneda y el tipo de cambio usado.", grupo: "capital-riesgo", tamano: 1, visible: true },
  { id: "pf-dia", titulo: "Movimiento del día", que: "Cuánto cambió hoy tu cartera por precios y por el dólar.", grupo: "capital-hoy", tamano: 1, visible: false },
];
