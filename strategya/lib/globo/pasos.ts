// Pasos marítimos críticos para las materias primas. Datos ESTÁTICOS y solo descriptivos:
// nombre, ubicación, qué pasa por ahí (texto, sin cifras) y qué series del catálogo conviene vigilar.
// Ningún volumen ni porcentaje: esos datos viven en la fuente oficial enlazada en cada paso.
// Los ids coinciden con las series AIS_<ID>_* (migración 20261016000800_globo.sql) y con
// supabase/functions/_shared/fuentes/buques-ais.ts.

export interface EnlaceFuente {
  titulo: string;
  url: string;
}

export interface PasoMaritimo {
  id: string;
  nombre: string;
  /** Punto del marcador (grados decimales, WGS84). */
  lat: number;
  lon: number;
  /** Qué materias primas y cargas lo cruzan, en palabras. Sin cifras. */
  materias: string;
  /** Por qué le importa a RD o al mercado, en palabras. Sin cifras. */
  relevancia: string;
  /** Ids de mercado.series a vigilar. */
  series: string[];
  fuente: EnlaceFuente;
  /** Caja de vigilancia AIS [[lat_sur, lon_oeste], [lat_norte, lon_este]] (igual a CAJAS_PASOS de buques-ais.ts). */
  cajaAis: [[number, number], [number, number]];
}

export const EIA_CHOKEPOINTS: EnlaceFuente = {
  titulo: "EIA · World Oil Transit Chokepoints",
  url: "https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints",
};

export const PASOS: readonly PasoMaritimo[] = [
  {
    id: "ORMUZ",
    cajaAis: [[25.6, 55.6], [27.2, 57.2]],
    nombre: "Estrecho de Ormuz",
    lat: 26.57,
    lon: 56.25,
    materias:
      "Crudo y productos refinados de los productores del Golfo Pérsico (Arabia Saudita, Irak, Kuwait, EAU, Irán) y gas natural licuado de Catar y EAU.",
    relevancia: "El paso más sensible para el precio del petróleo: una amenaza de cierre mueve Brent y WTI.",
    series: ["BRENT", "WTI", "GAS_NATURAL"],
    fuente: EIA_CHOKEPOINTS,
  },
  {
    id: "BAB_EL_MANDEB",
    cajaAis: [[12.0, 42.8], [13.2, 44.0]],
    nombre: "Estrecho de Bab el-Mandeb",
    lat: 12.58,
    lon: 43.33,
    materias:
      "Crudo, productos refinados y GNL del Golfo hacia el canal de Suez y Europa, y contenedores entre Asia y Europa.",
    relevancia: "Los ataques a buques en el mar Rojo desvían la ruta por el cabo de Buena Esperanza y encarecen fletes.",
    series: ["BRENT", "GAS_NATURAL"],
    fuente: EIA_CHOKEPOINTS,
  },
  {
    id: "SUEZ",
    cajaAis: [[29.8, 32.2], [31.4, 32.7]],
    nombre: "Canal de Suez",
    lat: 30.6,
    lon: 32.33,
    materias:
      "Crudo y productos entre el Golfo y el Mediterráneo, GNL y contenedores Asia–Europa. En paralelo corre el oleoducto SUMED.",
    relevancia: "Un bloqueo del canal retrasa entregas a Europa y empuja fletes y primas de seguro.",
    series: ["BRENT", "GAS_NATURAL"],
    fuente: { titulo: "Autoridad del Canal de Suez", url: "https://www.suezcanal.gov.eg/" },
  },
  {
    id: "MALACA",
    cajaAis: [[1.0, 100.0], [3.5, 103.6]],
    nombre: "Estrecho de Malaca",
    lat: 2.5,
    lon: 101.2,
    materias:
      "Crudo del Golfo hacia China, Japón y Corea del Sur, GNL, carbón y contenedores; ruta de insumos y productos de la cadena de chips.",
    relevancia: "La arteria energética de Asia oriental; sus alternativas (Sonda, Lombok) son más largas.",
    series: ["BRENT", "GAS_NATURAL", "COBRE_CPER"],
    fuente: EIA_CHOKEPOINTS,
  },
  {
    id: "PANAMA",
    cajaAis: [[8.8, -80.0], [9.5, -79.4]],
    nombre: "Canal de Panamá",
    lat: 9.08,
    lon: -79.68,
    materias:
      "Granos de EE. UU. hacia Asia, gas licuado de petróleo y GNL de EE. UU., productos refinados y contenedores.",
    relevancia:
      "El más cercano a RD: las sequías que limitan sus esclusas y los ciclones del Caribe afectan fletes y abastecimiento regional.",
    series: ["GAS_NATURAL", "WTI"],
    fuente: { titulo: "Autoridad del Canal de Panamá", url: "https://pancanal.com/" },
  },
  {
    id: "BOSFORO",
    cajaAis: [[40.95, 28.9], [41.3, 29.2]],
    nombre: "Bósforo (estrechos turcos)",
    lat: 41.12,
    lon: 29.07,
    materias:
      "Crudo de Rusia y del mar Caspio hacia el Mediterráneo, y granos del mar Negro (trigo y maíz de Ucrania y Rusia).",
    relevancia: "La guerra en el mar Negro y las restricciones de paso afectan crudo ruso y granos.",
    series: ["BRENT"],
    fuente: EIA_CHOKEPOINTS,
  },
  {
    id: "GIBRALTAR",
    cajaAis: [[35.75, -6.1], [36.2, -5.2]],
    nombre: "Estrecho de Gibraltar",
    lat: 35.96,
    lon: -5.6,
    materias: "Todo el tráfico entre el Atlántico y el Mediterráneo: crudo, productos refinados, GNL y contenedores.",
    relevancia: "Puerta de entrada al Mediterráneo para la ruta Américas–Europa.",
    series: ["BRENT", "GAS_NATURAL"],
    fuente: { titulo: "Salvamento Marítimo (España) · tráfico del Estrecho", url: "https://www.salvamentomaritimo.es/" },
  },
  {
    id: "BUENA_ESPERANZA",
    cajaAis: [[-35.5, 17.5], [-33.5, 20.5]],
    nombre: "Cabo de Buena Esperanza",
    lat: -34.36,
    lon: 18.47,
    materias:
      "Ruta alterna a Suez y Bab el-Mandeb para crudo, GNL y contenedores; salida de minerales de Sudáfrica (platino, carbón, mineral de hierro).",
    relevancia: "Cuando el mar Rojo se cierra, el tráfico se desvía por aquí: viajes más largos y fletes más caros.",
    series: ["BRENT", "ORO", "PLATA"],
    fuente: EIA_CHOKEPOINTS,
  },
  {
    id: "DANESES",
    cajaAis: [[54.9, 10.4], [56.3, 13.0]],
    nombre: "Estrechos daneses",
    lat: 55.7,
    lon: 12.7,
    materias: "Crudo y productos refinados rusos desde los puertos del Báltico hacia Europa y el resto del mundo, y granos.",
    relevancia: "Ruta clave del petróleo ruso sujeto a sanciones y topes de precio.",
    series: ["BRENT"],
    fuente: EIA_CHOKEPOINTS,
  },
];

export function pasoPorId(id: string): PasoMaritimo | undefined {
  return PASOS.find((p) => p.id === id);
}
