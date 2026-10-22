// Disposición del Dashboard: en qué orden van los widgets, cuáles se ven y cuánto ancho ocupan.
// Funciones puras (sin red ni React): lo que llega de la base se normaliza siempre, así un valor
// viejo, roto o con widgets que ya no existen nunca rompe la pantalla.

import { type FichaWidget, type Tamano, WIDGETS } from "./widgets";

export const VERSION_DISPOSICION = 1;

export interface WidgetColocado {
  id: string;
  visible: boolean;
  tamano: Tamano;
}

export interface Disposicion {
  version: typeof VERSION_DISPOSICION;
  widgets: WidgetColocado[];
}

function esTamano(v: unknown): v is Tamano {
  return v === 1 || v === 2 || v === 3;
}

/** La disposición de la primera vez: el orden, tamaño y visibilidad del catálogo. */
export function porDefecto(catalogo: readonly FichaWidget[] = WIDGETS): Disposicion {
  return { version: VERSION_DISPOSICION, widgets: catalogo.map((w) => ({ id: w.id, visible: w.visible, tamano: w.tamano })) };
}

/**
 * Convierte cualquier valor guardado en una disposición válida:
 * - ids que no están en el catálogo se ignoran; repetidos, solo cuenta el primero;
 * - un tamaño inválido toma el del catálogo; `visible` que no sea booleano se toma como visible;
 * - los widgets del catálogo que faltan (nuevos) se agregan al final, ocultos, para que Mena los
 *   encuentre en «Agregar widgets» sin que le cambie lo que ya ordenó.
 * Sin valor guardado (o irreconocible): la disposición por defecto.
 */
export function normalizar(valor: unknown, catalogo: readonly FichaWidget[] = WIDGETS): Disposicion {
  const lista = valor && typeof valor === "object" ? (valor as { widgets?: unknown }).widgets : undefined;
  if (!Array.isArray(lista)) return porDefecto(catalogo);
  const fichas = new Map(catalogo.map((w) => [w.id, w]));
  const vistos = new Set<string>();
  const widgets: WidgetColocado[] = [];
  for (const crudo of lista) {
    if (!crudo || typeof crudo !== "object") continue;
    const { id, visible, tamano } = crudo as Record<string, unknown>;
    if (typeof id !== "string" || vistos.has(id)) continue;
    const ficha = fichas.get(id);
    if (!ficha) continue;
    vistos.add(id);
    widgets.push({ id, visible: typeof visible === "boolean" ? visible : true, tamano: esTamano(tamano) ? tamano : ficha.tamano });
  }
  if (!widgets.length) return porDefecto(catalogo);
  for (const w of catalogo) if (!vistos.has(w.id)) widgets.push({ id: w.id, visible: false, tamano: w.tamano });
  return { version: VERSION_DISPOSICION, widgets };
}

/** Mueve un widget `pasos` lugares (negativo = hacia arriba) entre los widgets visibles. */
export function mover(d: Disposicion, id: string, pasos: number): Disposicion {
  const visibles = d.widgets.filter((w) => w.visible);
  const desde = visibles.findIndex((w) => w.id === id);
  if (desde < 0 || pasos === 0) return d;
  const hasta = Math.max(0, Math.min(visibles.length - 1, desde + pasos));
  if (hasta === desde) return d;
  return moverA(d, id, visibles[hasta].id);
}

/** Pone el widget `id` en el lugar que ocupa `destino` (arrastrar y soltar). */
export function moverA(d: Disposicion, id: string, destino: string): Disposicion {
  const desde = d.widgets.findIndex((w) => w.id === id);
  const hasta = d.widgets.findIndex((w) => w.id === destino);
  if (desde < 0 || hasta < 0 || desde === hasta) return d;
  const widgets = d.widgets.slice();
  const [w] = widgets.splice(desde, 1);
  widgets.splice(hasta, 0, w);
  return { ...d, widgets };
}

/** Muestra u oculta un widget. Al mostrarlo vuelve al final de los visibles. */
export function ponerVisible(d: Disposicion, id: string, visible: boolean): Disposicion {
  const i = d.widgets.findIndex((w) => w.id === id);
  if (i < 0 || d.widgets[i].visible === visible) return d;
  const widgets = d.widgets.slice();
  const [w] = widgets.splice(i, 1);
  const cambiado = { ...w, visible };
  if (visible) {
    const ultimoVisible = widgets.reduce((u, x, j) => (x.visible ? j : u), -1);
    widgets.splice(ultimoVisible + 1, 0, cambiado);
  } else {
    widgets.splice(i, 0, cambiado);
  }
  return { ...d, widgets };
}

export function cambiarTamano(d: Disposicion, id: string, tamano: number): Disposicion {
  if (!esTamano(tamano)) return d;
  let cambio = false;
  const widgets = d.widgets.map((w) => {
    if (w.id !== id || w.tamano === tamano) return w;
    cambio = true;
    return { ...w, tamano };
  });
  return cambio ? { ...d, widgets } : d;
}

export function visibles(d: Disposicion): WidgetColocado[] {
  return d.widgets.filter((w) => w.visible);
}

export function ocultos(d: Disposicion): WidgetColocado[] {
  return d.widgets.filter((w) => !w.visible);
}

export function iguales(a: Disposicion, b: Disposicion): boolean {
  return JSON.stringify(a.widgets) === JSON.stringify(b.widgets);
}
