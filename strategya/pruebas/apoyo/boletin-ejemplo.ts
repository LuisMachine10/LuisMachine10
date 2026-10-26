// Datos de ejemplo para las pruebas del Boletín (forma exacta de mercado.boletin_datos). Cifras inventadas
// para la prueba: no son de Mena ni del mercado real. Ninguna cuenta, correo ni cédula.
import type { DatosBoletin, ObsSerie, TipoEdicion } from "../../supabase/functions/_shared/boletin/tipos.ts";

type Base = Pick<ObsSerie, "serie_id" | "valor"> & Partial<ObsSerie>;

const FUENTES: Record<string, { nombre: string; url: string }> = {
  fmp: { nombre: "Financial Modeling Prep", url: "https://site.financialmodelingprep.com/" },
  finnhub: { nombre: "Finnhub", url: "https://finnhub.io/" },
  tesoro_eeuu: { nombre: "Tesoro de EE. UU.", url: "https://home.treasury.gov/" },
  bcrd: { nombre: "Banco Central RD · portada", url: "https://www.bancentral.gov.do/" },
  bcrd_excel: { nombre: "Banco Central RD · estadísticas (Excel)", url: "https://www.bancentral.gov.do/a/CustomView/2536" },
  micm: { nombre: "MICM · precios de combustibles", url: "https://micm.gob.do/" },
  simv: { nombre: "SIMV · Superintendencia del Mercado de Valores", url: "https://simv.gob.do/" },
  credito_publico: { nombre: "Dirección General de Crédito Público", url: "https://www.creditopublico.gob.do/emisiones/subastas" },
  aljazeera_rss: { nombre: "Al Jazeera · RSS", url: "https://www.aljazeera.com/xml/rss/all.xml" },
};

function s(b: Base): ObsSerie {
  const fuente = b.fuente_id ?? "fmp";
  return {
    nombre: b.serie_id,
    nombre_corto: b.serie_id,
    categoria: "indice",
    unidad: "puntos",
    frecuencia: "intradia",
    max_antiguedad_min: 120,
    sustituto_de: null,
    meta: { mercado: "us_acciones" },
    cambio: null,
    cambio_pct: null,
    fecha_dato: "2026-10-23",
    hora_dato: "2026-10-23T20:00:00+00:00",
    recogido_en: "2026-10-23T20:05:00+00:00",
    url_dato: null,
    estado: "ok",
    fuente_id: fuente,
    fuente_nombre: FUENTES[fuente]?.nombre ?? fuente,
    fuente_url: FUENTES[fuente]?.url ?? "https://example.org/",
    ...b,
  };
}

export const AHORA_AM = "2026-10-26T11:35:00+00:00"; // lunes 7:35 AM RD
/** Futuros y divisas abren el domingo en la tarde: el lunes a las 7:35 AM ya hay cotización del día. */
const LUNES = "2026-10-26T11:30:00+00:00";

export function seriesEjemplo(): ObsSerie[] {
  return [
    s({ serie_id: "IDX_SPX", nombre: "S&P 500", valor: "6834.72", cambio: "81.3", cambio_pct: "1.2034" }),
    s({ serie_id: "IDX_DJI", nombre: "Dow Jones Industrial", valor: "46710.15", cambio: "-140.2", cambio_pct: "-0.3" }),
    s({ serie_id: "IDX_IXIC", nombre: "Nasdaq Composite", valor: "23204.87", cambio: "410.2", cambio_pct: "1.8" }),
    // Viejo: la última cifra es de hace una semana con el mercado abierto en medio.
    s({ serie_id: "IDX_RUT", nombre: "Russell 2000", valor: "2402.1", cambio: "5.1", cambio_pct: "0.21", fecha_dato: "2026-10-16", hora_dato: "2026-10-16T20:00:00+00:00" }),
    s({ serie_id: "IDX_STOXX50E", nombre: "Euro Stoxx 50", valor: "5680.3", cambio_pct: "0.4", meta: { mercado: "europa" }, hora_dato: "2026-10-23T15:30:00+00:00" }),
    s({ serie_id: "IDX_N225", nombre: "Nikkei 225", valor: "49120.5", cambio_pct: "-1.1", meta: { mercado: "asia" }, fecha_dato: "2026-10-26", hora_dato: "2026-10-26T06:00:00+00:00" }),
    s({ serie_id: "UST_2A", nombre: "Tesoro EE. UU. 2 años", categoria: "tasa", unidad: "%", frecuencia: "diaria", max_antiguedad_min: 5760, meta: {}, valor: "3.48", cambio: "-0.03", cambio_pct: "-0.8547", hora_dato: null, fuente_id: "tesoro_eeuu" }),
    s({ serie_id: "UST_10A", nombre: "Tesoro EE. UU. 10 años", categoria: "tasa", unidad: "%", frecuencia: "diaria", max_antiguedad_min: 5760, meta: {}, valor: "4.01", cambio: "0.02", cambio_pct: "0.5", hora_dato: null, fuente_id: "tesoro_eeuu" }),
    s({ serie_id: "ETF_UUP", nombre: "Invesco DB US Dollar (UUP)", categoria: "divisa", unidad: "US$", valor: "27.15", cambio_pct: "0.22", max_antiguedad_min: 30, fuente_id: "finnhub", sustituto_de: "Índice dólar" }),
    s({ serie_id: "EURUSD", nombre: "Euro / Dólar", categoria: "divisa", unidad: "US$ por €", valor: "1.1642", cambio_pct: "-0.31", meta: { mercado: "fx" }, fecha_dato: "2026-10-26", hora_dato: LUNES }),
    s({ serie_id: "USDJPY", nombre: "Dólar / Yen", categoria: "divisa", unidad: "¥ por US$", valor: "152.37", cambio_pct: "0.45", meta: { mercado: "fx" }, fecha_dato: "2026-10-26", hora_dato: LUNES }),
    s({ serie_id: "BRENT", nombre: "Petróleo Brent", categoria: "energia", unidad: "US$/bbl", valor: "64.22", cambio_pct: "2.9", meta: { mercado: "futuros" }, fecha_dato: "2026-10-26", hora_dato: LUNES }),
    s({ serie_id: "WTI", nombre: "Petróleo WTI", categoria: "energia", unidad: "US$/bbl", valor: "60.5", cambio_pct: "2.6", meta: { mercado: "futuros" }, fecha_dato: "2026-10-26", hora_dato: LUNES }),
    s({ serie_id: "GAS_NATURAL", nombre: "Gas natural (Henry Hub)", categoria: "energia", unidad: "US$/MMBtu", valor: "3.41", cambio_pct: "-1.7", meta: { mercado: "futuros" }, fecha_dato: "2026-10-26", hora_dato: LUNES }),
    s({ serie_id: "ORO", nombre: "Oro", categoria: "metal", unidad: "US$/oz", valor: "4105.3", cambio_pct: "-2.4", meta: { mercado: "futuros" }, fecha_dato: "2026-10-26", hora_dato: LUNES }),
    s({ serie_id: "PLATA", nombre: "Plata", categoria: "metal", unidad: "US$/oz", valor: "48.62", cambio_pct: "-3.1", meta: { mercado: "futuros" }, fecha_dato: "2026-10-26", hora_dato: LUNES }),
    s({ serie_id: "COBRE_CPER", nombre: "Cobre · ETF CPER", categoria: "metal", unidad: "US$", valor: "31.4", cambio_pct: "0.6", max_antiguedad_min: 30, fuente_id: "finnhub", sustituto_de: "Cobre" }),
    s({ serie_id: "USDDOP_COMPRA", nombre: "Dólar BCRD · compra", categoria: "rd", unidad: "RD$ por US$", frecuencia: "diaria", max_antiguedad_min: 5760, meta: {}, valor: "62.9845", hora_dato: null, fuente_id: "bcrd", url_dato: "https://www.bancentral.gov.do/a/d/2532" }),
    s({ serie_id: "USDDOP_VENTA", nombre: "Dólar BCRD · venta", categoria: "rd", unidad: "RD$ por US$", frecuencia: "diaria", max_antiguedad_min: 5760, meta: {}, valor: "63.127", cambio: "0.0312", cambio_pct: "0.05", hora_dato: null, fuente_id: "bcrd", url_dato: "https://www.bancentral.gov.do/a/d/2532" }),
    s({ serie_id: "TPM_BCRD", nombre: "Tasa de política monetaria (BCRD)", categoria: "rd", unidad: "%", frecuencia: "eventual", max_antiguedad_min: 525600, meta: {}, valor: "5.25", cambio: "0", fecha_dato: "2026-10-01", hora_dato: null, fuente_id: "bcrd_excel" }),
    s({ serie_id: "INFLACION_RD", nombre: "Inflación interanual RD (IPC)", categoria: "rd", unidad: "%", frecuencia: "mensual", max_antiguedad_min: 64800, meta: {}, valor: "3.71", fecha_dato: "2026-09-30", hora_dato: null, fuente_id: "bcrd" }),
    s({ serie_id: "COMB_GASOLINA_PREMIUM", nombre: "Gasolina premium", categoria: "energia", unidad: "RD$/galón", frecuencia: "semanal", max_antiguedad_min: 14400, meta: { principal: true }, valor: "290.1", cambio: "0", fecha_dato: "2026-10-24", hora_dato: null, fuente_id: "micm", url_dato: "https://micm.gob.do/aviso-semana" }),
    s({ serie_id: "COMB_GASOIL_OPTIMO", nombre: "Gasoil óptimo", categoria: "energia", unidad: "RD$/galón", frecuencia: "semanal", max_antiguedad_min: 14400, meta: { principal: true }, valor: "241.1", cambio: "-3", fecha_dato: "2026-10-24", hora_dato: null, fuente_id: "micm", url_dato: "https://micm.gob.do/aviso-semana" }),
    s({ serie_id: "TASA_ACT_MN_PROMEDIO", nombre: "Tasa activa promedio", categoria: "tasa", unidad: "%", frecuencia: "mensual", max_antiguedad_min: 72000, meta: {}, valor: "13.4", cambio: "-0.12", fecha_dato: "2026-09-30", hora_dato: null, fuente_id: "bcrd" }),
    // Vieja: agosto, con 50 días de antigüedad máxima.
    s({ serie_id: "TASA_PAS_MN_PROMEDIO", nombre: "Tasa pasiva promedio", categoria: "tasa", unidad: "%", frecuencia: "mensual", max_antiguedad_min: 72000, meta: {}, valor: "7.12", cambio: "0.05", fecha_dato: "2026-08-31", hora_dato: null, fuente_id: "bcrd" }),
    s({ serie_id: "TASA_PAS_MN_30D", nombre: "Tasa pasiva 30 días", categoria: "tasa", unidad: "%", frecuencia: "mensual", max_antiguedad_min: 144000, meta: {}, valor: "6.55", fecha_dato: "2026-09-30", hora_dato: null, fuente_id: "bcrd_excel" }),
  ];
}

/** Las mismas series vistas el fin de semana: lo del lunes todavía no existe; queda el cierre del viernes. */
export function seriesViernes(): ObsSerie[] {
  return seriesEjemplo().map((o) => (o.hora_dato === LUNES ? { ...o, fecha_dato: "2026-10-23", hora_dato: "2026-10-23T20:55:00+00:00", recogido_en: "2026-10-23T21:00:00+00:00" } : o));
}

export function datosEjemplo(tipo: TipoEdicion = "am", ahora = AHORA_AM, extra: Partial<DatosBoletin> = {}): DatosBoletin {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date(ahora));
  return {
    tipo,
    ahora,
    hoy,
    viernes: "2026-10-23",
    preferencias: {},
    series: seriesEjemplo(),
    semana: [],
    umbrales: [
      { serie_id: "ORO", umbral: "2" },
      { serie_id: "PLATA", umbral: "4" },
      { serie_id: "IDX_SPX", umbral: "2" },
    ],
    alertas: [
      {
        id: 7,
        serie_id: "PLATA",
        nombre: "Plata",
        nombre_corto: "Plata",
        unidad: "US$/oz",
        valor: "48.62",
        mensaje: "48.62 US$/oz, por debajo del umbral de 52 US$/oz",
        disparada_en: "2026-10-26T02:10:00+00:00",
        fecha_dato: "2026-10-23",
        fuente_nombre: "Financial Modeling Prep",
        fuente_url: "https://site.financialmodelingprep.com/",
      },
    ],
    titulares: [
      { id: 101, titular: "Oil jumps as supply worries & Gulf tensions rise", url: "https://www.reuters.com/oil-jumps", medio: "Reuters", fecha: "2026-10-26T09:00:00+00:00", categoria: "mercado", fuente_id: null },
      { id: 102, titular: "Gold slides as traders take profits", url: "https://www.cnbc.com/gold-slides", medio: "CNBC", fecha: "2026-10-26T08:00:00+00:00", categoria: "mercado", fuente_id: null },
      { id: 103, titular: "Ceasefire talks stall as shelling resumes", url: "https://www.aljazeera.com/news/ceasefire", medio: "Al Jazeera", fecha: "2026-10-26T07:00:00+00:00", categoria: "guerra", fuente_id: "aljazeera_rss" },
      { id: 104, titular: "Navy escorts tankers through the Red Sea", url: "https://www.france24.com/en/red-sea", medio: "France 24", fecha: "2026-10-26T05:00:00+00:00", categoria: "guerra", fuente_id: null },
      { id: 105, titular: "Leaders meet for climate summit", url: "https://www.aljazeera.com/news/summit", medio: "Al Jazeera", fecha: "2026-10-26T04:00:00+00:00", categoria: "mercado", fuente_id: "aljazeera_rss" },
      // Fuera de la ventana de 24 h: no debe usarse como «¿Por qué?» de la plata.
      { id: 90, titular: "Silver hits a two-month low", url: "https://www.reuters.com/silver-old", medio: "Reuters", fecha: "2026-10-24T09:00:00+00:00", categoria: "mercado", fuente_id: null },
    ],
    agenda: [
      { fecha_hora: "2026-10-28T18:00:00+00:00", institucion: "Fed", evento: "Decisión de tasas (FOMC)", importancia: 3, confirmado: false, url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", hora_conocida: true, zona: "America/New_York" },
      { fecha_hora: "2026-10-29T13:15:00+00:00", institucion: "BCE", evento: "Decisión de tipos de interés", importancia: 3, confirmado: true, url: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", hora_conocida: true, zona: "Europe/Berlin" },
    ],
    emisiones: [
      { id: 1, fuente: "CREDITO_PUBLICO", numero: "CP-0921", emisor: "Ministerio de Hacienda", instrumento: "Bonos de Hacienda 2031", monto: "5000000000", moneda: "DOP", tasa: "9.85", fecha: "2026-10-21", url: "https://www.creditopublico.gob.do/subasta-21-oct.pdf", descripcion: null, recogido_en: "2026-10-21T15:20:00+00:00" },
      { id: 2, fuente: "SIMV", numero: "R-SIMV-2026-41-EV", emisor: "Parval", instrumento: null, monto: null, moneda: null, tasa: null, fecha: "2026-10-24", url: "https://simv.gob.do/resolucion-41", descripcion: "Aprobación de programa de emisiones", recogido_en: "2026-10-25T15:45:00+00:00" },
    ],
    avisos: [{ institucion: "SIMV", titulo: "SIMV publica nuevo reglamento de fondos", url: "https://simv.gob.do/aviso-reglamento", fecha: "2026-10-25T14:00:00+00:00" }],
    fondos: [
      { safi: "Excel", fondo: "Fondo Dinámico", moneda: "DOP", plazo_dias: 30, rendimiento: "7.85", fecha_corte: "2026-10-24", url_fuente: "https://fondosabiertos.excel.com.do/", origen: "automatica" },
      { safi: "Excel", fondo: "Fondo Dinámico", moneda: "DOP", plazo_dias: 365, rendimiento: "8.4", fecha_corte: "2026-10-24", url_fuente: "https://fondosabiertos.excel.com.do/", origen: "automatica" },
      { safi: "Excel", fondo: "Fondo Liquidez", moneda: "DOP", plazo_dias: 30, rendimiento: "6.9", fecha_corte: "2026-10-24", url_fuente: "https://fondosabiertos.excel.com.do/", origen: "automatica" },
      { safi: "Excel", fondo: "Fondo Dinámico", moneda: "USD", plazo_dias: 30, rendimiento: "4.1", fecha_corte: "2026-10-24", url_fuente: "https://fondosabiertos.excel.com.do/", origen: "automatica" },
      { safi: "Reservas", fondo: "Fondo Mira", moneda: "DOP", plazo_dias: 30, rendimiento: "8.12", fecha_corte: "2026-10-22", url_fuente: "https://www.afireservas.com/fondos/fondo-mira", origen: "automatica" },
      { safi: "Reservas", fondo: "Fondo Mira", moneda: "DOP", plazo_dias: 360, rendimiento: "7.95", fecha_corte: "2026-10-22", url_fuente: "https://www.afireservas.com/fondos/fondo-mira", origen: "automatica" },
      // Viejo: corte de hace más de 10 días.
      { safi: "Popular", fondo: "Fondo Cerrado Inmobiliario", moneda: "USD", plazo_dias: 365, rendimiento: "6.3", fecha_corte: "2026-09-30", url_fuente: "https://www.afipopular.com.do/fondo-cerrado", origen: "manual" },
    ],
    fuentes: Object.entries(FUENTES).map(([id, f]) => ({ id, ...f })),
    previa: { id: 1, fecha: "2026-10-23", creado_en: "2026-10-23T11:36:00+00:00" },
    am_hoy: null,
    tu_dinero: {
      configurado: true,
      presupuesto: { mes: "2026-10", presupuestado: { utilidad_neta: "45000" }, real: { utilidad_neta: "38250.5" } },
      foto: {
        mes: "2026-10",
        patrimonio: "2350400.75",
        vivo: true,
        cambio: "35200.1",
        cambio_pct: "1.52",
        previo: "2026-09",
        aportes: { plan: 3, pendientes: 2, total: "30000", pendiente: "20000" },
        riesgos: [{ titulo: "Liquidez y colchón", impacto: "alto", probabilidad: "medio" }],
        riesgos_evaluados: 4,
      },
      foto_en: "2026-10-26T01:10:00+00:00",
    },
    ...extra,
  };
}

/** Cierres semanales de ejemplo (viernes 23 contra viernes 16 de octubre). */
export function semanaEjemplo(): DatosBoletin["semana"] {
  return [
    { serie_id: "BRENT", valor_fin: "64.22", fecha_fin: "2026-10-23", valor_ini: "61.05", fecha_ini: "2026-10-16" },
    { serie_id: "WTI", valor_fin: "60.5", fecha_fin: "2026-10-23", valor_ini: "58.9", fecha_ini: "2026-10-16" },
    { serie_id: "GAS_NATURAL", valor_fin: "3.41", fecha_fin: "2026-10-23", valor_ini: "3.6", fecha_ini: "2026-10-16" },
    { serie_id: "ORO", valor_fin: "4105.3", fecha_fin: "2026-10-23", valor_ini: "4250", fecha_ini: "2026-10-16" },
    { serie_id: "PLATA", valor_fin: "48.62", fecha_fin: "2026-10-23", valor_ini: "51.2", fecha_ini: "2026-10-16" },
    { serie_id: "COBRE_CPER", valor_fin: "31.4", fecha_fin: "2026-10-23", valor_ini: null, fecha_ini: null },
    { serie_id: "IDX_SPX", valor_fin: "6834.72", fecha_fin: "2026-10-23", valor_ini: "6650.1", fecha_ini: "2026-10-16" },
    { serie_id: "ETF_UUP", valor_fin: "27.15", fecha_fin: "2026-10-23", valor_ini: "27.4", fecha_ini: "2026-10-16" },
  ];
}
