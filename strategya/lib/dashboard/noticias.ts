// «Mis noticias»: Mena elige medios, temas y palabras clave; aquí se normaliza lo guardado y se
// filtran los titulares ya guardados. Puro: no lee la base ni inventa titulares.

import type { CategoriaNoticia, Noticia } from "@/lib/noticias";

export const CATEGORIAS: readonly CategoriaNoticia[] = ["mercado", "rd", "guerra", "instituciones"];

export interface PrefNoticias {
  medios: string[];
  categorias: CategoriaNoticia[];
  palabras: string[];
}

export const PREF_NOTICIAS_VACIA: PrefNoticias = { medios: [], categorias: [], palabras: [] };

const MAX_PALABRAS = 20;
const MAX_MEDIOS = 40;

function textos(v: unknown, max: number, largo: number): string[] {
  if (!Array.isArray(v)) return [];
  const salida: string[] = [];
  const vistos = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim().replace(/\s+/g, " ").slice(0, largo);
    const k = t.toLocaleLowerCase("es");
    if (!t || vistos.has(k)) continue;
    vistos.add(k);
    salida.push(t);
    if (salida.length >= max) break;
  }
  return salida;
}

export function normalizarPref(valor: unknown): PrefNoticias {
  if (!valor || typeof valor !== "object") return { ...PREF_NOTICIAS_VACIA };
  const v = valor as Record<string, unknown>;
  const categorias = textos(v.categorias, CATEGORIAS.length, 20).filter((c): c is CategoriaNoticia =>
    (CATEGORIAS as readonly string[]).includes(c),
  );
  return { medios: textos(v.medios, MAX_MEDIOS, 80), categorias, palabras: textos(v.palabras, MAX_PALABRAS, 40) };
}

/** «petróleo, Banco Central;  FED» → ["petróleo", "Banco Central", "FED"]. */
export function partirPalabras(texto: string): string[] {
  return textos(texto.split(/[,;\n]/), MAX_PALABRAS, 40);
}

/** Minúsculas y sin tildes, para comparar «petroleo» con «Petróleo». */
export function plano(t: string): string {
  return t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
}

export function sinFiltros(p: PrefNoticias): boolean {
  return !p.medios.length && !p.categorias.length && !p.palabras.length;
}

/**
 * Titulares que coinciden: dentro de cada filtro basta una coincidencia (medio A o B); entre filtros,
 * deben cumplirse todos los que Mena llenó (medio y tema y palabra). Más recientes primero.
 */
export function filtrarMisNoticias(noticias: readonly Noticia[], p: PrefNoticias, limite = 8): Noticia[] {
  const medios = new Set(p.medios.map(plano));
  const palabras = p.palabras.map(plano);
  return noticias
    .filter((n) => !medios.size || medios.has(plano(n.medio)))
    .filter((n) => !p.categorias.length || p.categorias.includes(n.categoria))
    .filter((n) => {
      if (!palabras.length) return true;
      const t = plano(n.titular);
      return palabras.some((w) => t.includes(w));
    })
    .slice()
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .slice(0, limite);
}

/** Medios presentes en los titulares guardados, con cuántos tiene cada uno (para elegir). */
export function mediosDisponibles(noticias: readonly Noticia[]): { medio: string; n: number }[] {
  const c = new Map<string, number>();
  for (const n of noticias) c.set(n.medio, (c.get(n.medio) ?? 0) + 1);
  return [...c.entries()].map(([medio, n]) => ({ medio, n })).sort((a, b) => b.n - a.n || a.medio.localeCompare(b.medio, "es"));
}
