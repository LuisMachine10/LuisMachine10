// Glosario de Strategya: conceptos en una línea, definiciones generales y sin cifras de mercado.
// «Conceptos del día»: selección determinista (mismos datos → mismos conceptos) según lo que se movió
// y lo que hay en pantalla. No es asesoría de inversión.

import type { CategoriaNoticia } from "./noticias";

export interface Concepto {
  id: string;
  termino: string;
  definicion: string;
  /** Ids (o prefijos terminados en «_») de series del catálogo que traen este concepto a la pantalla. */
  series?: string[];
  /** Categorías de noticias que lo traen. */
  categorias?: CategoriaNoticia[];
}

export const GLOSARIO: readonly Concepto[] = [
  { id: "tpm", termino: "TPM", definicion: "Tasa de política monetaria: la tasa de referencia que fija el banco central para orientar el costo del dinero.", series: ["TPM_BCRD"], categorias: ["rd"] },
  { id: "rendimiento-par", termino: "Rendimiento par", definicion: "Tasa a la que un bono del Tesoro se vendería exactamente a su valor nominal; es la base de la curva oficial.", series: ["UST_"] },
  { id: "curva", termino: "Curva de rendimientos", definicion: "Los rendimientos de bonos de un mismo emisor ordenados por plazo, de corto a largo.", series: ["UST_"] },
  { id: "pendiente", termino: "Pendiente de la curva", definicion: "Diferencia entre el rendimiento largo y el corto (por ejemplo, 10 años menos 2 años).", series: ["UST_10A", "UST_2A"] },
  { id: "curva-invertida", termino: "Curva invertida", definicion: "Cuando los plazos cortos rinden más que los largos; el mercado suele leerlo como señal de desaceleración.", series: ["UST_"] },
  { id: "pb", termino: "Puntos básicos", definicion: "Un punto básico es la centésima parte de un punto porcentual; se usa para medir cambios de tasas.", series: ["UST_", "TASA_", "TPM_BCRD"] },
  { id: "dxy", termino: "DXY", definicion: "Índice que mide el dólar frente a una canasta de monedas de países desarrollados, con el euro como mayor peso.", series: ["DXY", "ETF_UUP"] },
  { id: "brent-wti", termino: "Brent vs WTI", definicion: "Dos crudos de referencia: Brent marca el precio internacional (mar del Norte) y WTI el de EE. UU. (Texas).", series: ["BRENT", "WTI", "ETF_USO", "ETF_BNO"] },
  { id: "etf", termino: "ETF", definicion: "Fondo cotizado en bolsa que replica un índice o activo y se compra y vende como una acción.", series: ["ETF_", "COBRE_CPER"] },
  { id: "sustituto", termino: "Sustituto (proxy)", definicion: "Activo que se usa para seguir otro que no tiene cotización directa disponible, como un ETF de cobre.", series: ["COBRE_CPER", "ETF_"] },
  { id: "tasa-corte", termino: "Tasa de corte", definicion: "En una subasta de bonos o letras, la tasa más alta aceptada por el emisor; fija el rendimiento de esa emisión.", categorias: ["rd"] },
  { id: "encaje", termino: "Encaje legal", definicion: "Porción de los depósitos que los bancos deben mantener inmovilizada en el banco central.", categorias: ["rd"] },
  { id: "tasa-referencia-dolar", termino: "Tasa de referencia del dólar", definicion: "Promedio de compra y venta de dólares que publica el Banco Central de la RD a partir de las operaciones del mercado.", series: ["USDDOP_COMPRA", "USDDOP_VENTA"], categorias: ["rd"] },
  { id: "inflacion", termino: "Inflación interanual", definicion: "Variación de los precios al consumidor frente al mismo mes del año anterior.", series: ["INFLACION_RD"], categorias: ["mercado", "rd"] },
  { id: "fomc", termino: "FOMC", definicion: "Comité de la Reserva Federal que decide el rango objetivo de la tasa de fondos federales.", series: ["TASA_FED_SUP", "TASA_FED_INF"], categorias: ["instituciones"] },
  { id: "fondos-federales", termino: "Tasa de fondos federales", definicion: "Tasa a la que los bancos de EE. UU. se prestan reservas a un día; la Fed fija un rango objetivo para ella.", series: ["TASA_FED_SUP", "TASA_FED_INF"] },
  { id: "facilidad-deposito", termino: "Facilidad de depósito", definicion: "Tasa que paga el BCE a los bancos por dejar dinero a un día; es su principal tasa de política.", series: ["TASA_BCE_DEP"], categorias: ["instituciones"] },
  { id: "forward-guidance", termino: "Orientación futura", definicion: "Mensajes del banco central sobre el rumbo probable de sus tasas, para guiar las expectativas.", categorias: ["instituciones"] },
  { id: "qe", termino: "Expansión cuantitativa (QE)", definicion: "Compra masiva de bonos por el banco central para bajar tasas largas y dar liquidez.", categorias: ["instituciones"] },
  { id: "qt", termino: "Ajuste cuantitativo (QT)", definicion: "El banco central reduce su balance dejando vencer o vendiendo los bonos que compró.", categorias: ["instituciones"] },
  { id: "halcon-paloma", termino: "Halcón y paloma", definicion: "Halcón prioriza contener la inflación con tasas altas; paloma prioriza el crecimiento y el empleo.", categorias: ["instituciones"] },
  { id: "spread", termino: "Diferencial (spread)", definicion: "Diferencia de rendimiento entre dos instrumentos, por ejemplo un bono soberano y el del Tesoro al mismo plazo.", series: ["UST_"] },
  { id: "riesgo-pais", termino: "Riesgo país", definicion: "Prima que pagan los bonos de un país sobre los del Tesoro de EE. UU.; refleja el riesgo de crédito percibido.", categorias: ["rd", "mercado"] },
  { id: "duracion", termino: "Duración", definicion: "Sensibilidad del precio de un bono a los cambios de tasa: a mayor duración, más se mueve el precio.", series: ["UST_"] },
  { id: "precio-rendimiento", termino: "Precio y rendimiento", definicion: "En un bono van en sentido contrario: si el rendimiento sube, el precio baja, y viceversa.", series: ["UST_"] },
  { id: "cupon", termino: "Cupón", definicion: "Interés fijo que paga un bono sobre su valor nominal en cada periodo.", categorias: ["rd"] },
  { id: "letras", termino: "Letras del Tesoro", definicion: "Deuda de corto plazo (hasta un año) que se emite con descuento y no paga cupón.", series: ["UST_1M", "UST_1_5M", "UST_2M", "UST_3M", "UST_4M", "UST_6M"] },
  { id: "subasta", termino: "Subasta de bonos", definicion: "Mecanismo con el que un gobierno coloca deuda: los inversionistas ofertan y se adjudica por tasa.", categorias: ["rd"] },
  { id: "indice-bursatil", termino: "Índice bursátil", definicion: "Indicador que resume el precio de un grupo de acciones, como el S&P 500 o el Nikkei.", series: ["IDX_"] },
  { id: "capitalizacion", termino: "Ponderado por capitalización", definicion: "Índice donde cada empresa pesa según el valor total de sus acciones en bolsa.", series: ["IDX_SPX", "IDX_IXIC", "ETF_SPY", "ETF_QQQ"] },
  { id: "dow", termino: "Ponderado por precio", definicion: "Índice donde pesa más la acción de mayor precio, no la empresa más grande; así se calcula el Dow Jones.", series: ["IDX_DJI", "ETF_DIA"] },
  { id: "small-caps", termino: "Empresas pequeñas", definicion: "Compañías de menor capitalización, como las del Russell 2000; suelen ser más sensibles al crédito local.", series: ["IDX_RUT", "ETF_IWM"] },
  { id: "volatilidad", termino: "Volatilidad", definicion: "Cuánto y qué tan rápido varía un precio; más volatilidad significa movimientos más amplios.", categorias: ["mercado"] },
  { id: "refugio", termino: "Activo refugio", definicion: "Activo que suele buscarse en momentos de tensión, como el oro, el dólar o los bonos del Tesoro.", series: ["ORO", "ETF_GLD", "PLATA"], categorias: ["guerra"] },
  { id: "geopolitica", termino: "Prima geopolítica", definicion: "Parte del precio de un activo, sobre todo del petróleo, que refleja el riesgo de un conflicto.", series: ["BRENT", "WTI"], categorias: ["guerra"] },
  { id: "cuello-botella", termino: "Paso marítimo estratégico", definicion: "Estrecho por el que pasa gran parte del comercio de energía, como Ormuz o Bab el-Mandeb en el mar Rojo.", categorias: ["guerra"] },
  { id: "sanciones", termino: "Sanciones económicas", definicion: "Restricciones de un país a otro sobre comercio, finanzas o personas; en EE. UU. las administra la OFAC.", categorias: ["guerra", "instituciones"] },
  { id: "opep", termino: "OPEP+", definicion: "Grupo de países productores de petróleo que coordina cuotas de producción.", series: ["BRENT", "WTI"], categorias: ["mercado"] },
  { id: "henry-hub", termino: "Henry Hub", definicion: "Punto de entrega en Luisiana que sirve de referencia para el precio del gas natural en EE. UU.", series: ["GAS_NATURAL", "ETF_UNG"] },
  { id: "onza-troy", termino: "Onza troy", definicion: "Unidad de peso con la que se cotizan el oro y la plata; es algo mayor que la onza común.", series: ["ORO", "PLATA"] },
  { id: "par-divisas", termino: "Par de divisas", definicion: "Precio de una moneda en otra: EUR/USD dice cuántos dólares vale un euro.", series: ["EURUSD", "USDJPY"] },
  { id: "carry", termino: "Carry trade", definicion: "Endeudarse en una moneda de tasa baja para invertir en otra de tasa alta; se deshace cuando sube la volatilidad.", series: ["USDJPY"] },
  { id: "bitcoin-etf", termino: "ETF de bitcoin al contado", definicion: "Fondo que tiene bitcoin real y cotiza en bolsa, como IBIT.", series: ["BTC", "ETF_IBIT"] },
  { id: "ipo", termino: "Salida a bolsa (IPO)", definicion: "Primera venta pública de acciones de una empresa; en la SEC empieza con el formulario S-1 o F-1.", categorias: ["mercado"] },
  { id: "424b4", termino: "Prospecto 424B4", definicion: "Documento final de una oferta registrada en la SEC, con el precio ya fijado.", categorias: ["mercado"] },
  { id: "fusion", termino: "Fusión y adquisición", definicion: "Una empresa se une a otra o la compra; en la SEC deja rastros en formularios como 425 o DEFM14A.", categorias: ["mercado"] },
  { id: "opa", termino: "Oferta pública de adquisición", definicion: "Propuesta a los accionistas para comprarles sus acciones; en la SEC se presenta como SC TO-T.", categorias: ["mercado"] },
  { id: "cambio-pct", termino: "Cambio porcentual", definicion: "Cuánto varió un precio respecto del cierre anterior, expresado en porcentaje.", series: ["IDX_", "ETF_", "ORO", "BRENT", "WTI", "BTC"] },
  { id: "cierre-anterior", termino: "Cierre anterior", definicion: "Último precio de la sesión previa; es la base contra la que se mide el cambio del día.", series: ["IDX_", "ETF_"] },
  { id: "pib", termino: "PIB", definicion: "Valor de todos los bienes y servicios finales que produce una economía en un periodo.", categorias: ["mercado", "rd"] },
  { id: "recesion", termino: "Recesión", definicion: "Caída generalizada y sostenida de la actividad económica, no solo de un sector.", categorias: ["mercado"] },
  { id: "aranceles", termino: "Aranceles", definicion: "Impuestos a las importaciones; encarecen los productos de fuera y pueden alterar cadenas de suministro.", categorias: ["mercado"] },
  { id: "remesas", termino: "Remesas", definicion: "Dinero que envían a su país quienes trabajan en el exterior; es una fuente importante de divisas para la RD.", categorias: ["rd"] },
  { id: "liquidez", termino: "Liquidez", definicion: "Facilidad para comprar o vender un activo rápido sin mover mucho su precio.", categorias: ["mercado", "instituciones"] },
  { id: "basilea", termino: "Basilea III", definicion: "Normas internacionales de capital y liquidez para bancos que coordina el Comité de Basilea en el BIS.", categorias: ["instituciones"] },
  { id: "desactualizado", termino: "Desactualizado", definicion: "En Strategya: el dato superó su antigüedad máxima y se muestra marcado hasta que la fuente publique otro.", categorias: [] },
];

function aplica(c: Concepto, serieId: string): boolean {
  return (c.series ?? []).some((s) => (s.endsWith("_") ? serieId.startsWith(s) : serieId === s));
}

/** Número del día (días desde 1970-01-01) a partir de AAAA-MM-DD; para la rotación determinista. */
function numeroDia(fecha: string): number {
  return Math.floor(Date.parse(`${fecha}T00:00:00Z`) / 86_400_000);
}

export interface EntradaConceptos {
  /** Series que más se movieron hoy, en orden (las primeras pesan más). */
  seriesMovidas: string[];
  /** Categorías de noticias en pantalla, de más a menos titulares. */
  categorias: CategoriaNoticia[];
  /** Día (AAAA-MM-DD, RD) para completar con rotación cuando lo anterior no alcanza. */
  fecha: string;
  min?: number;
  max?: number;
}

/**
 * Conceptos del día (entre min y max, por defecto 3–5):
 *  1. los de las series que más se movieron (por orden de movimiento, un concepto nuevo por serie);
 *  2. los de las categorías de noticias en pantalla (por orden);
 *  3. si faltan para llegar al mínimo, se completan rotando el glosario según el día.
 */
export function conceptosDelDia(e: EntradaConceptos): Concepto[] {
  const min = e.min ?? 3;
  const max = e.max ?? 5;
  const elegidos: Concepto[] = [];
  const agregar = (c: Concepto | undefined) => {
    if (c && elegidos.length < max && !elegidos.includes(c)) elegidos.push(c);
  };
  for (const s of e.seriesMovidas) agregar(GLOSARIO.find((c) => aplica(c, s) && !elegidos.includes(c)));
  for (const cat of e.categorias) agregar(GLOSARIO.find((c) => (c.categorias ?? []).includes(cat) && !elegidos.includes(c)));
  const n = GLOSARIO.length;
  let i = ((numeroDia(e.fecha) % n) + n) % n;
  for (let vueltas = 0; elegidos.length < min && vueltas < n; vueltas++, i = (i + 7) % n) agregar(GLOSARIO[i]);
  return elegidos;
}
