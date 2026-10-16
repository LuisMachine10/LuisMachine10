// Adaptado de God's Eye View (MIT, © 2026 Bilawal Sidhu) — src/app/viewer.js (createApplicationViewer:
// opciones del visor sin widgets ni capas de pago) y src/maps/imagery.js (mapa base Esri sin clave y su
// atribución). Portado a TypeScript como configuración pura: el visor Cesium la aplica en el navegador.
// Cambios: sin Cesium ion (ni token, ni terreno, ni geocodificador), sin mosaicos 3D de Google, con el
// globo visible y dos mapas base de Esri.

import { CAPAS, type CapaId, type Tono } from "./capas";

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
} as const;

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

export interface PreferenciasGlobo {
  capas: Record<CapaId, boolean>;
  mapa: MapaBaseId;
}

export function preferenciasPorDefecto(): PreferenciasGlobo {
  return {
    capas: Object.fromEntries(CAPAS.map((c) => [c.id, c.porDefecto])) as Record<CapaId, boolean>,
    mapa: "oscuro",
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
  const o = crudo as { capas?: unknown; mapa?: unknown };
  const capas = { ...base.capas };
  if (o.capas && typeof o.capas === "object") {
    for (const c of CAPAS) {
      const v = (o.capas as Record<string, unknown>)[c.id];
      if (typeof v === "boolean") capas[c.id] = v;
    }
  }
  const mapa = o.mapa === "imagen" || o.mapa === "oscuro" ? o.mapa : base.mapa;
  return { capas, mapa };
}

export function escribirPreferencias(p: PreferenciasGlobo): string {
  return JSON.stringify({ capas: p.capas, mapa: p.mapa });
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
