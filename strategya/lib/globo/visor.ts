// Adaptado de God's Eye View (MIT, © 2026 Bilawal Sidhu) — src/app/viewer.js (createApplicationViewer:
// opciones del visor sin widgets ni capas de pago) y src/maps/imagery.js (mapa base Esri sin clave y su
// atribución). Portado a TypeScript como configuración pura: el visor Cesium la aplica en el navegador.
// Cambios: sin Cesium ion (ni token, ni terreno, ni geocodificador), sin mosaicos 3D de Google, con el
// globo visible y dos mapas base de Esri.

import { CAPAS, type CapaId, type PuntoGlobo, type Tono } from "./capas";

/**
 * ¿El punto es una alerta? (sismo cerca de una zona vigilada, ciclón cerca de RD o paso con alerta). Las
 * noticias de guerra y RD también salen resaltadas en el mapa, pero no cuentan como alerta.
 */
export function esAlerta(p: Pick<PuntoGlobo, "capa" | "destacado">): boolean {
  return p.destacado && (p.capa === "sismos" || p.capa === "ciclones" || p.capa === "pasos");
}

/** Una etiqueta candidata en pantalla: centro horizontal x, borde inferior y (px CSS), y su prioridad (0 = primero). */
export interface CajaEtiqueta {
  id: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  prioridad: number;
}

/**
 * Elige qué etiquetas se muestran sin que se encimen: recorre por prioridad (y por orden de llegada) y
 * descarta toda etiqueta que choque con una ya puesta. Devuelve los ids a mostrar.
 */
export function descongestionar(cajas: readonly CajaEtiqueta[], margen = 4): Set<string> {
  const puestas: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const mostrar = new Set<string>();
  const orden = cajas.map((c, i) => ({ c, i })).sort((a, b) => a.c.prioridad - b.c.prioridad || a.i - b.i);
  for (const { c } of orden) {
    const r = { x0: c.x - c.ancho / 2 - margen, x1: c.x + c.ancho / 2 + margen, y0: c.y - c.alto - margen, y1: c.y + margen };
    if (puestas.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
    puestas.push(r);
    mostrar.add(c.id);
  }
  return mostrar;
}

/** Ancho aproximado (px CSS) de una etiqueta en Inter 12 px seminegrita, con su relleno. */
export function anchoEtiqueta(texto: string): number {
  return Math.round(texto.length * 6.9 + 16);
}

/** Texto corto de la etiqueta de un punto en el mapa (para no amontonar). */
export function textoEtiqueta(p: Pick<PuntoGlobo, "capa" | "titulo">): string {
  const t = p.capa === "mercados" ? p.titulo.split(" (")[0] : p.titulo.replace("República Dominicana", "RD");
  return t.length > 34 ? `${t.slice(0, 33)}…` : t;
}

/** Opciones del Viewer de Cesium (todas las piezas que requieren ion o cuentas de pago, apagadas). */
export const OPCIONES_VISOR = {
  timeline: false,
  animation: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  vrButton: false,
  selectionIndicator: false,
  infoBox: false,
  baseLayer: false,
  scene3DOnly: true,
  requestRenderMode: true,
  maximumRenderTimeChange: Number.POSITIVE_INFINITY,
  // Nitidez: Cesium usa window.devicePixelRatio (no la resolución «recomendada», que en pantallas retina
  // dibuja a la mitad y se ve borroso) y suaviza bordes con MSAA ×4 donde WebGL2 lo permite.
  useBrowserRecommendedResolution: false,
  msaaSamples: 4,
} as const;

/** Tope de píxeles físicos por píxel CSS: más allá de 2 el costo crece y la vista no mejora. */
export const TOPE_PIXELES = 2;

/** Píxeles físicos por píxel CSS con que se dibuja el globo: devicePixelRatio con tope 2 (mínimo 1). */
export function pixelesPorPunto(dpr: number | undefined): number {
  const d = typeof dpr === "number" && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(Math.max(d, 1), TOPE_PIXELES);
}

/**
 * Valor de `viewer.resolutionScale`. Con useBrowserRecommendedResolution = false, Cesium ya multiplica por
 * window.devicePixelRatio; esta escala lo corrige para que el resultado final sea pixelesPorPunto(dpr):
 * 1 en pantallas normales y en retina (dpr 2), y menor que 1 solo en pantallas de dpr 3 (tope 2).
 */
export function escalaResolucion(dpr: number | undefined): number {
  const d = typeof dpr === "number" && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return pixelesPorPunto(d) / d;
}

/**
 * Las etiquetas de Cesium se rasterizan a su tamaño en píxeles CSS y luego se estiran a la pantalla:
 * en retina quedan borrosas. Se dibujan a este múltiplo (al menos 2) y se reducen con `scale = 1 / factor`.
 */
export function factorEtiqueta(dpr: number | undefined): number {
  return Math.max(2, Math.ceil(pixelesPorPunto(dpr)));
}

/** Tamaño de letra de las etiquetas del globo (px CSS). */
export const LETRA_ETIQUETA = 12;

/** Distancia de cámara (m) hasta la que se ven las etiquetas fijas; más lejos, solo al pasar o elegir. */
export const DISTANCIA_ETIQUETAS_M = 2.6e7;

/** Centro de la vista inicial: el Atlántico, con las Américas, Europa y África (y RD) a la vista. */
export const CENTRO_INICIAL = { lon: -45, lat: 18 } as const;

/**
 * Altura de cámara (m) para que el globo llene ~84 % del lado corto de la escena. Cesium aplica su campo de
 * visión de 60° al lado largo; con eso se calcula el ángulo del lado corto y la distancia al centro.
 */
export function alturaInicial(ancho: number, alto: number, radioM = 6_371_000): number {
  const w = ancho > 0 ? ancho : 1;
  const h = alto > 0 ? alto : 1;
  const fov = (60 * Math.PI) / 180;
  const corto = Math.min(w, h) / Math.max(w, h);
  const fovCorto = 2 * Math.atan(Math.tan(fov / 2) * corto);
  const angulo = fovCorto * 0.84;
  const distancia = radioM / Math.sin(angulo / 2);
  return Math.round(Math.min(Math.max(distancia - radioM, 6_000_000), 30_000_000));
}

export const RUTA_CESIUM = "/cesium";

export type MapaBaseId = "imagen" | "oscuro";

export interface MapaBase {
  id: MapaBaseId;
  nombre: string;
  /** Plantilla de mosaicos XYZ ({z}/{y}/{x}, servicio clásico de ArcGIS Online, sin clave). */
  url: string;
  maximoNivel: number;
  atribucion: string;
  enlaceTerminos: string;
}

export const ATRIBUCION_ESRI = "Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export const MAPAS_BASE: Readonly<Record<MapaBaseId, MapaBase>> = {
  imagen: {
    id: "imagen",
    nombre: "Satélite (Esri World Imagery)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maximoNivel: 19,
    atribucion: ATRIBUCION_ESRI,
    enlaceTerminos: "https://www.esri.com/en-us/legal/terms/full-master-agreement",
  },
  oscuro: {
    id: "oscuro",
    nombre: "Gris oscuro (Esri World Dark Gray)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    maximoNivel: 16,
    atribucion: "Powered by Esri — Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community",
    enlaceTerminos: "https://www.esri.com/en-us/legal/terms/full-master-agreement",
  },
};

/** Variable CSS de app/globals.css que pinta cada tono (el visor la lee con getComputedStyle). */
export const VARIABLE_TONO: Readonly<Record<Tono, string>> = {
  sube: "--sube",
  baja: "--baja",
  neutro: "--texto-3",
  guerra: "--baja",
  ambar: "--ambar",
  rd: "--rd",
  sismo: "--texto-2",
  ciclon: "--ambar",
  paso: "--texto",
  buques: "--texto-2",
};

/** Tamaño del marcador en píxeles por capa (los resaltados un poco más grandes). */
export function tamanoMarcador(capa: CapaId, destacado: boolean): number {
  const base: Record<CapaId, number> = { mercados: 11, noticias: 8, rd: 13, pasos: 10, sismos: 9, ciclones: 14, buques: 9 };
  return base[capa] + (destacado ? 3 : 0);
}

// ---------------------------------------------------------------------------
// Preferencias del visor (localStorage del navegador; solo comodidad)
// ---------------------------------------------------------------------------

export const CLAVE_PREFERENCIAS = "strategya.globo.v1";

export type VistaGlobo = "3d" | "2d";

export interface PreferenciasGlobo {
  capas: Record<CapaId, boolean>;
  mapa: MapaBaseId;
  /** Vista preferida. «3d» cae sola al mapa 2D si no hay WebGL. */
  vista: VistaGlobo;
}

export function preferenciasPorDefecto(): PreferenciasGlobo {
  return {
    capas: Object.fromEntries(CAPAS.map((c) => [c.id, c.porDefecto])) as Record<CapaId, boolean>,
    mapa: "oscuro",
    vista: "3d",
  };
}

/** Lee preferencias guardadas; cualquier valor raro vuelve al valor por defecto. */
export function leerPreferencias(texto: string | null | undefined): PreferenciasGlobo {
  const base = preferenciasPorDefecto();
  if (!texto) return base;
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return base;
  }
  if (!crudo || typeof crudo !== "object") return base;
  const o = crudo as { capas?: unknown; mapa?: unknown; vista?: unknown };
  const capas = { ...base.capas };
  if (o.capas && typeof o.capas === "object") {
    for (const c of CAPAS) {
      const v = (o.capas as Record<string, unknown>)[c.id];
      if (typeof v === "boolean") capas[c.id] = v;
    }
  }
  const mapa = o.mapa === "imagen" || o.mapa === "oscuro" ? o.mapa : base.mapa;
  const vista = o.vista === "2d" || o.vista === "3d" ? o.vista : base.vista;
  return { capas, mapa, vista };
}

export function escribirPreferencias(p: PreferenciasGlobo): string {
  return JSON.stringify({ capas: p.capas, mapa: p.mapa, vista: p.vista });
}

/** ¿El navegador puede dibujar WebGL? (Si no, el globo cae al mapa 2D.) */
export function hayWebGL(crearCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): boolean {
  try {
    const c = crearCanvas();
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}
