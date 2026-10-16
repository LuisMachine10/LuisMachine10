// Nomenclátor y categorización de titulares (función pura, sin red; corre en Deno y en Node).
//
// · ubicar(texto): busca países y lugares clave en inglés y español y devuelve dónde va el pin.
// · categorizar(titular, opciones): guerra · mercado · rd · instituciones, con reglas explícitas.
//
// Las coordenadas son de geografía (capital o centro del lugar), redondeadas a 2 decimales: sirven
// solo para ubicar el pin en el mapa. No son datos financieros.

export type Categoria = "guerra" | "mercado" | "rd" | "instituciones";

export interface Lugar {
  /** Nombre que se muestra (español). */
  nombre: string;
  /** País al que pertenece (español). Para mares y estrechos: la zona. */
  pais: string;
  /** Texto con 2 decimales, listo para numeric(8,5). */
  lat: string;
  lon: string;
  /** lugar = ciudad, región, mar o estrecho (más específico que el país); pais = el país entero. */
  nivel: "lugar" | "pais";
}

interface Entrada extends Lugar {
  terminos: string[];
}

const RD = "República Dominicana";

// prettier-ignore
const ENTRADAS: Entrada[] = [
  // ── Europa del Este ──
  { nombre: "Ucrania", pais: "Ucrania", lat: "50.45", lon: "30.52", nivel: "pais", terminos: ["ukraine", "ucrania", "ukrainian", "ukrainians", "ucraniano", "ucraniana", "ucranianos", "ucranianas", "zelensky", "zelenski"] },
  { nombre: "Kyiv", pais: "Ucrania", lat: "50.45", lon: "30.52", nivel: "lugar", terminos: ["kyiv", "kiev"] },
  { nombre: "Donbás", pais: "Ucrania", lat: "48.00", lon: "37.80", nivel: "lugar", terminos: ["donbas", "donbass", "donetsk", "luhansk", "lugansk"] },
  { nombre: "Járkov", pais: "Ucrania", lat: "49.99", lon: "36.23", nivel: "lugar", terminos: ["kharkiv", "kharkov", "jarkov"] },
  { nombre: "Zaporiyia", pais: "Ucrania", lat: "47.84", lon: "35.14", nivel: "lugar", terminos: ["zaporizhzhia", "zaporiyia", "zaporozhie"] },
  { nombre: "Odesa", pais: "Ucrania", lat: "46.48", lon: "30.72", nivel: "lugar", terminos: ["odesa", "odessa"] },
  { nombre: "Crimea", pais: "Ucrania", lat: "45.30", lon: "34.40", nivel: "lugar", terminos: ["crimea"] },
  { nombre: "Rusia", pais: "Rusia", lat: "55.76", lon: "37.62", nivel: "pais", terminos: ["russia", "rusia", "russian", "russians", "ruso", "rusa", "rusos", "rusas", "kremlin", "moscow", "moscu", "putin"] },
  { nombre: "Mar Negro", pais: "Mar Negro", lat: "43.40", lon: "34.30", nivel: "lugar", terminos: ["black sea", "mar negro"] },
  { nombre: "Bielorrusia", pais: "Bielorrusia", lat: "53.90", lon: "27.56", nivel: "pais", terminos: ["belarus", "bielorrusia", "minsk", "lukashenko"] },
  { nombre: "Polonia", pais: "Polonia", lat: "52.23", lon: "21.01", nivel: "pais", terminos: ["poland", "polonia", "polish", "warsaw", "varsovia"] },
  { nombre: "Moldavia", pais: "Moldavia", lat: "47.01", lon: "28.86", nivel: "pais", terminos: ["moldova", "moldavia"] },
  { nombre: "Armenia", pais: "Armenia", lat: "40.18", lon: "44.51", nivel: "pais", terminos: ["armenia", "armenian"] },
  { nombre: "Azerbaiyán", pais: "Azerbaiyán", lat: "40.41", lon: "49.87", nivel: "pais", terminos: ["azerbaijan", "azerbaiyan"] },
  { nombre: "Serbia", pais: "Serbia", lat: "44.79", lon: "20.45", nivel: "pais", terminos: ["serbia", "belgrade", "belgrado"] },
  { nombre: "Kosovo", pais: "Kosovo", lat: "42.66", lon: "21.17", nivel: "pais", terminos: ["kosovo"] },
  // ── Medio Oriente ──
  { nombre: "Gaza", pais: "Palestina", lat: "31.50", lon: "34.47", nivel: "lugar", terminos: ["gaza", "hamas", "rafah", "khan younis", "jan yunis"] },
  { nombre: "Cisjordania", pais: "Palestina", lat: "31.95", lon: "35.30", nivel: "lugar", terminos: ["west bank", "cisjordania", "jenin", "yenin"] },
  { nombre: "Palestina", pais: "Palestina", lat: "31.90", lon: "35.20", nivel: "pais", terminos: ["palestine", "palestina", "palestinian", "palestinians", "palestino", "palestinos"] },
  { nombre: "Israel", pais: "Israel", lat: "31.77", lon: "35.21", nivel: "pais", terminos: ["israel", "israeli", "israelis", "israeli s", "israelí", "israelies", "netanyahu", "tel aviv", "jerusalem", "jerusalen", "idf"] },
  { nombre: "Líbano", pais: "Líbano", lat: "33.89", lon: "35.50", nivel: "pais", terminos: ["lebanon", "libano", "lebanese", "libanes", "libanesa", "hezbollah", "hezbola", "hizbula", "beirut"] },
  { nombre: "Siria", pais: "Siria", lat: "33.51", lon: "36.28", nivel: "pais", terminos: ["syria", "siria", "syrian", "sirio", "siria s", "damascus", "damasco", "aleppo", "alepo"] },
  { nombre: "Irán", pais: "Irán", lat: "35.69", lon: "51.39", nivel: "pais", terminos: ["iran", "iranian", "iranians", "irani", "irania", "tehran", "teheran", "khamenei", "jamenei"] },
  { nombre: "Irak", pais: "Irak", lat: "33.32", lon: "44.36", nivel: "pais", terminos: ["iraq", "irak", "iraqi", "iraqui", "baghdad", "bagdad"] },
  { nombre: "Yemen", pais: "Yemen", lat: "15.37", lon: "44.19", nivel: "pais", terminos: ["yemen", "yemeni", "houthi", "houthis", "huti", "hutis", "hutie", "huties", "sanaa"] },
  { nombre: "Mar Rojo", pais: "Mar Rojo", lat: "20.00", lon: "38.50", nivel: "lugar", terminos: ["red sea", "mar rojo", "bab el mandeb", "bab al mandab"] },
  { nombre: "Estrecho de Ormuz", pais: "Golfo Pérsico", lat: "26.57", lon: "56.25", nivel: "lugar", terminos: ["strait of hormuz", "hormuz", "estrecho de ormuz", "ormuz"] },
  { nombre: "Arabia Saudita", pais: "Arabia Saudita", lat: "24.71", lon: "46.68", nivel: "pais", terminos: ["saudi arabia", "arabia saudita", "arabia saudi", "saudi", "riyadh", "riad"] },
  { nombre: "Emiratos Árabes Unidos", pais: "Emiratos Árabes Unidos", lat: "24.45", lon: "54.38", nivel: "pais", terminos: ["united arab emirates", "emiratos arabes unidos", "uae", "abu dhabi", "dubai"] },
  { nombre: "Catar", pais: "Catar", lat: "25.29", lon: "51.53", nivel: "pais", terminos: ["qatar", "catar", "doha"] },
  { nombre: "Turquía", pais: "Turquía", lat: "39.93", lon: "32.86", nivel: "pais", terminos: ["turkey", "turkiye", "turquia", "turkish", "ankara", "istanbul", "estambul", "erdogan"] },
  { nombre: "Egipto", pais: "Egipto", lat: "30.04", lon: "31.24", nivel: "pais", terminos: ["egypt", "egipto", "egyptian", "cairo", "el cairo", "suez"] },
  // ── África ──
  { nombre: "Sudán del Sur", pais: "Sudán del Sur", lat: "4.85", lon: "31.58", nivel: "pais", terminos: ["south sudan", "sudan del sur", "juba"] },
  { nombre: "Sudán", pais: "Sudán", lat: "15.50", lon: "32.56", nivel: "pais", terminos: ["sudan", "sudanese", "sudanes", "khartoum", "jartum"] },
  { nombre: "Darfur", pais: "Sudán", lat: "13.50", lon: "24.00", nivel: "lugar", terminos: ["darfur", "el fasher", "al fashir"] },
  { nombre: "Etiopía", pais: "Etiopía", lat: "9.03", lon: "38.74", nivel: "pais", terminos: ["ethiopia", "etiopia", "ethiopian", "etiope", "addis ababa", "adis abeba"] },
  { nombre: "Tigray", pais: "Etiopía", lat: "14.03", lon: "38.32", nivel: "lugar", terminos: ["tigray"] },
  { nombre: "Eritrea", pais: "Eritrea", lat: "15.34", lon: "38.93", nivel: "pais", terminos: ["eritrea", "eritrean", "asmara"] },
  { nombre: "Somalia", pais: "Somalia", lat: "2.05", lon: "45.32", nivel: "pais", terminos: ["somalia", "somali", "mogadishu", "mogadiscio", "al shabaab"] },
  { nombre: "Libia", pais: "Libia", lat: "32.89", lon: "13.19", nivel: "pais", terminos: ["libya", "libia", "libyan", "tripoli"] },
  { nombre: "Malí", pais: "Malí", lat: "12.64", lon: "-8.00", nivel: "pais", terminos: ["mali", "bamako"] },
  { nombre: "Burkina Faso", pais: "Burkina Faso", lat: "12.37", lon: "-1.52", nivel: "pais", terminos: ["burkina faso", "ouagadougou", "uagadugu"] },
  { nombre: "Nigeria", pais: "Nigeria", lat: "9.08", lon: "7.40", nivel: "pais", terminos: ["nigeria", "nigerian", "abuja"] },
  { nombre: "RD del Congo", pais: "RD del Congo", lat: "-4.32", lon: "15.31", nivel: "pais", terminos: ["congo", "drc", "kinshasa", "goma", "m23"] },
  { nombre: "Sudáfrica", pais: "Sudáfrica", lat: "-25.75", lon: "28.19", nivel: "pais", terminos: ["south africa", "sudafrica", "pretoria", "johannesburg", "johannesburgo"] },
  // ── Asia y Pacífico ──
  { nombre: "Taiwán", pais: "Taiwán", lat: "25.03", lon: "121.57", nivel: "pais", terminos: ["taiwan", "taiwanese", "taiwanes", "taipei"] },
  { nombre: "Estrecho de Taiwán", pais: "Taiwán", lat: "24.50", lon: "119.50", nivel: "lugar", terminos: ["taiwan strait", "estrecho de taiwan"] },
  { nombre: "Corea del Norte", pais: "Corea del Norte", lat: "39.04", lon: "125.76", nivel: "pais", terminos: ["north korea", "north korean", "corea del norte", "norcorea", "norcoreano", "norcoreana", "pyongyang", "kim jong un"] },
  { nombre: "Corea del Sur", pais: "Corea del Sur", lat: "37.57", lon: "126.98", nivel: "pais", terminos: ["south korea", "south korean", "corea del sur", "surcorea", "surcoreano", "seoul", "seul"] },
  { nombre: "China", pais: "China", lat: "39.90", lon: "116.41", nivel: "pais", terminos: ["china", "chinese", "chino", "china s", "beijing", "pekin", "xi jinping", "shanghai"] },
  { nombre: "Hong Kong", pais: "China", lat: "22.32", lon: "114.17", nivel: "lugar", terminos: ["hong kong"] },
  { nombre: "Mar de China Meridional", pais: "Mar de China Meridional", lat: "12.00", lon: "114.00", nivel: "lugar", terminos: ["south china sea", "mar de china meridional", "mar de la china meridional"] },
  { nombre: "Japón", pais: "Japón", lat: "35.68", lon: "139.69", nivel: "pais", terminos: ["japan", "japon", "japanese", "japones", "japonesa", "tokyo", "tokio"] },
  { nombre: "Filipinas", pais: "Filipinas", lat: "14.60", lon: "120.98", nivel: "pais", terminos: ["philippines", "filipinas", "philippine", "manila"] },
  { nombre: "India", pais: "India", lat: "28.61", lon: "77.21", nivel: "pais", terminos: ["india", "indian", "new delhi", "nueva delhi", "modi"] },
  { nombre: "Cachemira", pais: "India / Pakistán", lat: "34.08", lon: "74.80", nivel: "lugar", terminos: ["kashmir", "cachemira"] },
  { nombre: "Pakistán", pais: "Pakistán", lat: "33.69", lon: "73.06", nivel: "pais", terminos: ["pakistan", "pakistani", "paquistani", "islamabad"] },
  { nombre: "Afganistán", pais: "Afganistán", lat: "34.56", lon: "69.21", nivel: "pais", terminos: ["afghanistan", "afganistan", "afghan", "afgano", "kabul", "taliban", "talibanes"] },
  { nombre: "Myanmar", pais: "Myanmar", lat: "19.76", lon: "96.07", nivel: "pais", terminos: ["myanmar", "birmania", "burma"] },
  { nombre: "Australia", pais: "Australia", lat: "-35.28", lon: "149.13", nivel: "pais", terminos: ["australia", "australian", "australiano"] },
  // ── Europa occidental ──
  { nombre: "Reino Unido", pais: "Reino Unido", lat: "51.51", lon: "-0.13", nivel: "pais", terminos: ["united kingdom", "reino unido", "britain", "british", "britanico", "britanica", "london", "londres"] },
  { nombre: "Alemania", pais: "Alemania", lat: "52.52", lon: "13.41", nivel: "pais", terminos: ["germany", "alemania", "german", "aleman", "alemana", "berlin"] },
  { nombre: "Fráncfort", pais: "Alemania", lat: "50.11", lon: "8.68", nivel: "lugar", terminos: ["frankfurt", "francfort"] },
  { nombre: "Francia", pais: "Francia", lat: "48.86", lon: "2.35", nivel: "pais", terminos: ["france", "francia", "french", "frances", "francesa", "paris", "macron"] },
  { nombre: "Groenlandia", pais: "Groenlandia", lat: "64.18", lon: "-51.69", nivel: "pais", terminos: ["greenland", "groenlandia"] },
  // ── Américas ──
  { nombre: RD, pais: RD, lat: "18.47", lon: "-69.89", nivel: "pais", terminos: ["dominican republic", "republica dominicana", "rep dominicana", "dominicano", "dominicana", "dominicanos", "dominicanas", "abinader", "punta cana", "bcrd", "banreservas"] },
  { nombre: "Santo Domingo", pais: RD, lat: "18.47", lon: "-69.89", nivel: "lugar", terminos: ["santo domingo"] },
  { nombre: "Santiago de los Caballeros", pais: RD, lat: "19.45", lon: "-70.69", nivel: "lugar", terminos: ["santiago de los caballeros"] },
  { nombre: "Haití", pais: "Haití", lat: "18.54", lon: "-72.34", nivel: "pais", terminos: ["haiti", "haitian", "haitians", "haitiano", "haitiana", "haitianos", "port au prince", "puerto principe"] },
  { nombre: "Cuba", pais: "Cuba", lat: "23.11", lon: "-82.37", nivel: "pais", terminos: ["cuba", "cuban", "cubano", "cubana", "havana", "la habana"] },
  { nombre: "Puerto Rico", pais: "Puerto Rico", lat: "18.47", lon: "-66.11", nivel: "pais", terminos: ["puerto rico", "puerto rican", "puertorriqueno", "puertorriquena"] },
  { nombre: "Venezuela", pais: "Venezuela", lat: "10.48", lon: "-66.90", nivel: "pais", terminos: ["venezuela", "venezuelan", "venezolano", "venezolana", "venezolanos", "caracas", "maduro"] },
  { nombre: "Colombia", pais: "Colombia", lat: "4.71", lon: "-74.07", nivel: "pais", terminos: ["colombia", "colombian", "colombiano", "colombiana", "bogota"] },
  { nombre: "Panamá", pais: "Panamá", lat: "8.98", lon: "-79.52", nivel: "pais", terminos: ["panama", "panameno", "panamena"] },
  { nombre: "México", pais: "México", lat: "19.43", lon: "-99.13", nivel: "pais", terminos: ["mexico", "mexican", "mexicano", "mexicana", "sheinbaum"] },
  { nombre: "Brasil", pais: "Brasil", lat: "-15.79", lon: "-47.88", nivel: "pais", terminos: ["brazil", "brasil", "brazilian", "brasileno", "brasilena", "lula"] },
  { nombre: "Argentina", pais: "Argentina", lat: "-34.60", lon: "-58.38", nivel: "pais", terminos: ["argentina", "argentine", "argentino", "buenos aires", "milei"] },
  { nombre: "Chile", pais: "Chile", lat: "-33.45", lon: "-70.67", nivel: "pais", terminos: ["chile", "chilean", "chileno", "chilena"] },
  { nombre: "Perú", pais: "Perú", lat: "-12.05", lon: "-77.04", nivel: "pais", terminos: ["peru", "peruvian", "peruano", "peruana"] },
  { nombre: "Ecuador", pais: "Ecuador", lat: "-0.18", lon: "-78.47", nivel: "pais", terminos: ["ecuador", "ecuadorian", "ecuatoriano", "ecuatoriana"] },
  { nombre: "Canadá", pais: "Canadá", lat: "45.42", lon: "-75.70", nivel: "pais", terminos: ["canada", "canadian", "canadiense", "ottawa"] },
  { nombre: "Estados Unidos", pais: "Estados Unidos", lat: "38.90", lon: "-77.04", nivel: "pais", terminos: ["united states", "estados unidos", "ee uu", "eeuu", "washington", "white house", "casa blanca", "pentagon", "pentagono", "trump"] },
  { nombre: "Nueva York", pais: "Estados Unidos", lat: "40.71", lon: "-74.01", nivel: "lugar", terminos: ["wall street", "new york", "nueva york"] },
];

/** Minúsculas, sin tildes ni signos, espacios simples: «¿Irán, EE. UU.?» → "iran ee uu". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface Coincidencia {
  entrada: Entrada;
  inicio: number;
  fin: number;
}

const TERMINOS: { termino: string; entrada: Entrada }[] = ENTRADAS.flatMap((entrada) =>
  entrada.terminos.map((t) => ({ termino: normalizar(t), entrada })),
);

/** Todas las apariciones de una frase normalizada, respetando límites de palabra. */
function apariciones(texto: string, frase: string): number[] {
  const t = ` ${texto} `;
  const buscada = ` ${frase} `;
  const posiciones: number[] = [];
  let desde = 0;
  for (;;) {
    const i = t.indexOf(buscada, desde);
    if (i < 0) return posiciones;
    posiciones.push(i);
    desde = i + 1;
  }
}

function coincidencias(textoNormalizado: string): Coincidencia[] {
  const todas: Coincidencia[] = [];
  for (const { termino, entrada } of TERMINOS) {
    for (const inicio of apariciones(textoNormalizado, termino)) {
      todas.push({ entrada, inicio, fin: inicio + termino.length });
    }
  }
  // Una coincidencia contenida en otra más larga no cuenta («sudan» dentro de «south sudan»,
  // «dominicana» dentro de «republica dominicana»).
  return todas.filter(
    (c) => !todas.some((o) => o !== c && o.inicio <= c.inicio && o.fin >= c.fin && o.fin - o.inicio > c.fin - c.inicio),
  );
}

/**
 * Dónde va el pin de un titular.
 * Regla: gana un «lugar» (ciudad, región, mar, estrecho) sobre un país; entre iguales, el que aparece primero.
 * «Israel strikes Gaza» → Gaza · «Russian drones hit Kyiv» → Kyiv · «Iran and Israel…» → Irán.
 */
export function ubicar(texto: string): Lugar | null {
  const lista = coincidencias(normalizar(texto));
  if (lista.length === 0) return null;
  lista.sort((a, b) => {
    const nivel = (c: Coincidencia) => (c.entrada.nivel === "lugar" ? 0 : 1);
    return nivel(a) - nivel(b) || a.inicio - b.inicio;
  });
  const { terminos: _t, ...lugar } = lista[0].entrada;
  return lugar;
}

/** Todos los países que menciona un texto, en orden de aparición y sin repetir. */
export function paisesMencionados(texto: string): string[] {
  const lista = coincidencias(normalizar(texto)).sort((a, b) => a.inicio - b.inicio);
  return [...new Set(lista.map((c) => c.entrada.pais))];
}

export const LUGAR_RD: Lugar = { nombre: "Santo Domingo", pais: RD, lat: "18.47", lon: "-69.89", nivel: "lugar" };

// ───────────────────────── Categorías ─────────────────────────

/** Frases que llevan «guerra» pero son de economía: cuentan como mercado, nunca como guerra. */
export const GUERRA_ECONOMICA = [
  "trade war", "trade wars", "tariff war", "price war", "currency war", "chip war", "tech war",
  "guerra comercial", "guerra arancelaria", "guerra de precios", "guerra de divisas", "guerra tecnologica",
].map(normalizar);

export const PALABRAS_GUERRA = [
  "war", "wars", "warfare", "wartime", "guerra", "guerras", "missile", "missiles", "misil", "misiles",
  "airstrike", "airstrikes", "air strike", "air strikes", "bombardeo", "bombardeos", "bombardea", "bombing",
  "bombings", "bombed", "shelling", "ceasefire", "cease fire", "alto el fuego", "tregua", "truce",
  "troops", "tropas", "invasion", "invade", "invaded", "offensive", "ofensiva", "drone strike", "drone strikes",
  "drone attack", "drone attacks", "ataque con drones", "ataques con drones", "military", "militar", "militares",
  "army", "ejercito", "insurgents", "rebels", "rebeldes", "militia", "militias", "milicia", "milicias",
  "hostage", "hostages", "rehenes", "frontline", "front line", "armed conflict", "conflicto armado",
  "genocide", "genocidio", "artillery", "artilleria", "warship", "warships", "nuclear test", "prueba nuclear",
  "soldiers", "soldados", "guerrilla",
].map(normalizar);

export const PALABRAS_RD = [
  "republica dominicana", "dominican republic", "dominicano", "dominicana", "dominicanos", "dominicanas",
  "santo domingo", "bcrd", "dgii", "simv", "bvrd", "banreservas", "peso dominicano", "abinader", "punta cana",
].map(normalizar);

/** Siglas que solo cuentan en MAYÚSCULAS (o con su forma exacta): «BID» sí, «bid» (oferta) no. */
export const SIGLAS_INSTITUCIONES = ["Fed", "FOMC", "ECB", "BCE", "BoJ", "BOJ", "BoE", "IMF", "FMI", "BIS", "BPI", "OECD", "OCDE", "BID", "IDB", "CEPAL", "ECLAC", "SEC", "OFAC"];

export const PALABRAS_INSTITUCIONES = [
  "federal reserve", "reserva federal", "european central bank", "banco central europeo", "bank of japan",
  "banco de japon", "bank of england", "banco de inglaterra", "international monetary fund",
  "fondo monetario internacional", "world bank", "banco mundial", "treasury department", "us treasury",
  "departamento del tesoro", "tesoro de estados unidos", "central bank", "central banks", "banco central",
  "bancos centrales", "powell", "lagarde", "georgieva", "bank for international settlements",
  "banco de pagos internacionales", "inter american development bank", "banco interamericano de desarrollo",
].map(normalizar);

export const PALABRAS_MERCADO = [
  "stock", "stocks", "stock market", "shares", "equities", "bolsa", "bolsas", "wall street", "s p 500", "nasdaq",
  "dow jones", "oil price", "oil prices", "crude", "brent", "wti", "petroleo", "gold", "oro", "bitcoin", "crypto",
  "cripto", "criptomonedas", "bond", "bonds", "bonos", "yield", "yields", "rendimiento", "rendimientos",
  "treasuries", "dollar", "dolar", "yen", "inflation", "inflacion", "interest rate", "interest rates",
  "tasa de interes", "tasas de interes", "rate cut", "rate cuts", "rate hike", "recorte de tasas", "alza de tasas",
  "gdp", "pib", "recession", "recesion", "earnings", "ipo", "opv", "merger", "mergers", "fusion", "fusiones",
  "acquisition", "acquisitions", "adquisicion", "tariff", "tariffs", "arancel", "aranceles", "markets",
  "mercados", "investors", "inversionistas", "inversores", "commodities", "materias primas", "opec", "opep",
  "economy", "economia", "economic", "economica", "exports", "exportaciones", "imports", "importaciones",
].map(normalizar);

function contiene(textoNormalizado: string, frases: readonly string[]): boolean {
  return frases.some((f) => apariciones(textoNormalizado, f).length > 0);
}

function tieneSigla(texto: string): boolean {
  return SIGLAS_INSTITUCIONES.some((s) => new RegExp(`(^|[^A-Za-z0-9])${s}([^A-Za-z0-9]|$)`).test(texto));
}

export interface OpcionesCategoria {
  /** Categoría de la consulta que trajo el titular (p. ej. la consulta de guerras de GDELT). */
  pista?: Categoria;
  /** El medio es dominicano: lo suyo es «rd» salvo que hable de una guerra. */
  medioRD?: boolean;
}

/**
 * Reglas, en este orden (la primera que se cumple gana):
 *  1. guerra: alguna palabra de guerra, después de quitar las frases de «guerra económica».
 *  2. rd: medio dominicano, o menciona RD (país, ciudades, BCRD, DGII, peso dominicano…).
 *  3. instituciones: banco central, FMI, Banco Mundial, Tesoro… (siglas solo en mayúsculas).
 *  4. mercado: bolsa, petróleo, bonos, dólar, inflación, tasas, aranceles, fusiones… o una «guerra comercial».
 *  5. la pista de la consulta que lo trajo, si la hay.
 *  6. ninguna → null (el titular no se guarda).
 * Una guerra en un medio dominicano es guerra: el panel de guerras la necesita con su lugar.
 * «killed»/«muertos» no cuentan como guerra: en la prensa local son sobre todo accidentes y sucesos.
 */
export function categorizar(titular: string, opciones: OpcionesCategoria = {}): Categoria | null {
  const n = normalizar(titular);
  const sinEconomica = GUERRA_ECONOMICA.reduce((t, f) => ` ${t} `.split(` ${f} `).join(" "), n).trim();
  const guerraEconomica = sinEconomica !== n;
  if (contiene(sinEconomica, PALABRAS_GUERRA)) return "guerra";
  if (opciones.medioRD || contiene(n, PALABRAS_RD)) return "rd";
  if (contiene(n, PALABRAS_INSTITUCIONES) || tieneSigla(titular)) return "instituciones";
  if (guerraEconomica || contiene(n, PALABRAS_MERCADO)) return "mercado";
  return opciones.pista ?? null;
}

export interface Clasificacion {
  categoria: Categoria;
  lugar: Lugar | null;
}

/**
 * Categoría + lugar del pin. Si el titular es «rd» y no nombra ningún lugar, el pin va a Santo Domingo
 * (regla explícita: el tema es RD por el medio o por una palabra de RD).
 */
export function clasificar(titular: string, opciones: OpcionesCategoria = {}): Clasificacion | null {
  const categoria = categorizar(titular, opciones);
  if (!categoria) return null;
  const lugar = ubicar(titular) ?? (categoria === "rd" ? LUGAR_RD : null);
  return { categoria, lugar };
}

export const NOMENCLATOR: readonly Lugar[] = ENTRADAS.map(({ terminos: _t, ...l }) => l);
