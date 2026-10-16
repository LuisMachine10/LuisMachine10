// Geometría del globo: distancias sobre la esfera y reglas de cercanía.
// Las coordenadas y distancias son geometría (para ubicar y comparar), no dinero ni tasas: aquí sí se usa
// aritmética de punto flotante. Las cifras que se muestran se redondean a decenas de km y se rotulan
// como «aproximadas».

export const RADIO_TIERRA_KM = 6371.0088; // radio medio (IUGG)

export interface Punto {
  lat: number;
  lon: number;
}

export const SANTO_DOMINGO: Punto & { nombre: string } = { nombre: "Santo Domingo", lat: 18.4861, lon: -69.9312 };

const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia de gran círculo (haversine), en km. */
export function distanciaKm(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Punto intermedio de gran círculo entre a y b (f entre 0 y 1). */
export function interpolar(a: Punto, b: Punto, f: number): Punto {
  const φ1 = rad(a.lat);
  const λ1 = rad(a.lon);
  const φ2 = rad(b.lat);
  const λ2 = rad(b.lon);
  const δ = distanciaKm(a, b) / RADIO_TIERRA_KM;
  if (δ < 1e-12) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI, lon: (Math.atan2(y, x) * 180) / Math.PI };
}

/**
 * Distancia mínima (km) de un punto a una línea quebrada sobre la esfera. Cada tramo se recorre en pasos
 * de ~`pasoKm` km (por defecto 5 km): el error queda muy por debajo del redondeo que se muestra.
 */
export function distanciaMinimaKm(p: Punto, linea: readonly Punto[], pasoKm = 5): number | null {
  if (linea.length === 0) return null;
  let min = distanciaKm(p, linea[0]);
  for (let i = 1; i < linea.length; i++) {
    const a = linea[i - 1];
    const b = linea[i];
    const largo = distanciaKm(a, b);
    const pasos = Math.max(1, Math.ceil(largo / pasoKm));
    for (let k = 1; k <= pasos; k++) min = Math.min(min, distanciaKm(p, interpolar(a, b, k / pasos)));
  }
  return min;
}

/** Redondeo para mostrar: a decenas de km (a unidades por debajo de 10 km). */
export function kmParaMostrar(km: number): string {
  const r = km < 10 ? Math.round(km) : Math.round(km / 10) * 10;
  return r.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// Zonas de vigilancia (definidas por Strategya, no por la fuente)
// ---------------------------------------------------------------------------

export type TipoZona = "materias" | "rd";

export interface ZonaVigilancia {
  id: string;
  nombre: string;
  tipo: TipoZona;
  /** Qué se vigila ahí, en palabras. */
  motivo: string;
  centro: Punto;
  radioKm: number;
  series: string[];
}

export const ZONAS_VIGILANCIA: readonly ZonaVigilancia[] = [
  {
    id: "rd",
    nombre: "República Dominicana",
    tipo: "rd",
    motivo: "cerca de RD",
    centro: { lat: SANTO_DOMINGO.lat, lon: SANTO_DOMINGO.lon },
    radioKm: 500,
    series: ["USDDOP_VENTA"],
  },
  {
    id: "chile-norte",
    nombre: "Norte de Chile",
    tipo: "materias",
    motivo: "zona de minas de cobre",
    centro: { lat: -23.5, lon: -69.5 },
    radioKm: 600,
    series: ["COBRE_CPER"],
  },
  {
    id: "chile-centro",
    nombre: "Centro de Chile",
    tipo: "materias",
    motivo: "zona de minas de cobre",
    centro: { lat: -33.5, lon: -70.5 },
    radioKm: 400,
    series: ["COBRE_CPER"],
  },
  {
    id: "peru-sur",
    nombre: "Sur del Perú",
    tipo: "materias",
    motivo: "zona de minas de cobre",
    centro: { lat: -15.5, lon: -72.0 },
    radioKm: 500,
    series: ["COBRE_CPER"],
  },
  {
    id: "golfo-persico",
    nombre: "Golfo Pérsico",
    tipo: "materias",
    motivo: "producción y exportación de petróleo y gas",
    centro: { lat: 27.0, lon: 51.0 },
    radioKm: 700,
    series: ["BRENT", "WTI", "GAS_NATURAL"],
  },
  {
    id: "japon",
    nombre: "Japón",
    tipo: "materias",
    motivo: "manufactura y cadena de chips",
    centro: { lat: 36.0, lon: 138.5 },
    radioKm: 700,
    series: ["IDX_N225", "USDJPY"],
  },
  {
    id: "taiwan",
    nombre: "Taiwán",
    tipo: "materias",
    motivo: "fabricación de chips",
    centro: { lat: 23.7, lon: 121.0 },
    radioKm: 350,
    series: ["IDX_IXIC", "ETF_QQQ"],
  },
];

export interface Cercania {
  zona: ZonaVigilancia;
  distanciaKm: number;
}

/** Zonas de vigilancia dentro de cuyo radio cae el punto, de la más cercana a la más lejana. */
export function zonasCercanas(p: Punto, zonas: readonly ZonaVigilancia[] = ZONAS_VIGILANCIA): Cercania[] {
  return zonas
    .map((zona) => ({ zona, distanciaKm: distanciaKm(p, zona.centro) }))
    .filter((c) => c.distanciaKm <= c.zona.radioKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}

/** Un sismo es relevante si cae en una zona de vigilancia y su magnitud es al menos `minimo` (por defecto 4.5). */
export function sismoRelevante(p: Punto, magnitud: number | null, minimo = 4.5): Cercania[] {
  if (magnitud === null || !Number.isFinite(magnitud) || magnitud < minimo) return [];
  return zonasCercanas(p);
}

/** Normaliza una longitud a [-180, 180]. */
export function normalizarLon(lon: number): number {
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  return l === -180 && lon > 0 ? 180 : l;
}
