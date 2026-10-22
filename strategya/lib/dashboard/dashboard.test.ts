import { describe, expect, it } from "vitest";
import type { Noticia } from "@/lib/noticias";
import { cambiarTamano, iguales, mover, moverA, normalizar, ocultos, ponerVisible, porDefecto, visibles } from "./disposicion";
import { filtrarMisNoticias, mediosDisponibles, normalizarPref, partirPalabras, plano, sinFiltros } from "./noticias";
import { type FichaWidget, WIDGETS } from "./widgets";

const CAT: FichaWidget[] = [
  { id: "a", titulo: "A", que: "", grupo: "dia", tamano: 3, visible: true },
  { id: "b", titulo: "B", que: "", grupo: "cifras", tamano: 1, visible: true },
  { id: "c", titulo: "C", que: "", grupo: "cifras", tamano: 1, visible: true },
  { id: "d", titulo: "D", que: "", grupo: "rd", tamano: 2, visible: false },
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("Dashboard · catálogo", () => {
  it("ids únicos, tamaños válidos y todos visibles por defecto con una línea de qué es", () => {
    expect(new Set(WIDGETS.map((w) => w.id)).size).toBe(WIDGETS.length);
    for (const w of WIDGETS) {
      expect([1, 2, 3]).toContain(w.tamano);
      expect(w.que.length).toBeGreaterThan(10);
      expect(w.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("Dashboard · disposición", () => {
  it("por defecto sigue el catálogo", () => {
    const d = porDefecto(CAT);
    expect(d.widgets).toEqual([
      { id: "a", visible: true, tamano: 3 },
      { id: "b", visible: true, tamano: 1 },
      { id: "c", visible: true, tamano: 1 },
      { id: "d", visible: false, tamano: 2 },
    ]);
    expect(ids(visibles(d))).toEqual(["a", "b", "c"]);
    expect(ids(ocultos(d))).toEqual(["d"]);
  });

  it("sin valor guardado, o con basura, usa la de fábrica", () => {
    for (const v of [null, undefined, 3, "x", {}, { widgets: "no" }, { widgets: [] }, { widgets: [{ id: "zzz" }] }]) {
      expect(normalizar(v, CAT)).toEqual(porDefecto(CAT));
    }
  });

  it("ignora widgets desconocidos y repetidos, corrige tamaños y agrega los nuevos ocultos al final", () => {
    const d = normalizar(
      {
        widgets: [
          { id: "c", visible: false, tamano: 2 },
          { id: "borrado", visible: true, tamano: 1 },
          { id: "a", visible: true, tamano: 7 },
          { id: "c", visible: true, tamano: 3 },
          "basura",
          { id: "b", visible: "sí", tamano: 1 },
        ],
      },
      CAT,
    );
    expect(d.widgets).toEqual([
      { id: "c", visible: false, tamano: 2 },
      { id: "a", visible: true, tamano: 3 },
      { id: "b", visible: true, tamano: 1 },
      { id: "d", visible: false, tamano: 2 },
    ]);
  });

  it("mover sube y baja entre los visibles, sin salirse de los bordes", () => {
    const d = porDefecto(CAT);
    expect(ids(visibles(mover(d, "c", -1)))).toEqual(["a", "c", "b"]);
    expect(ids(visibles(mover(d, "a", 1)))).toEqual(["b", "a", "c"]);
    expect(ids(visibles(mover(d, "a", 5)))).toEqual(["b", "c", "a"]);
    expect(mover(d, "a", -1)).toBe(d);
    expect(mover(d, "nada", 1)).toBe(d);
  });

  it("mover salta los ocultos que estén en medio", () => {
    const d = normalizar({ widgets: [{ id: "a" }, { id: "d", visible: false }, { id: "b" }, { id: "c" }] }, CAT);
    const m = mover(d, "b", -1);
    expect(ids(visibles(m))).toEqual(["b", "a", "c"]);
    expect(ids(m.widgets)).toEqual(["b", "a", "d", "c"]);
  });

  it("moverA pone el widget en el lugar del destino (arrastrar y soltar)", () => {
    const d = porDefecto(CAT);
    expect(ids(moverA(d, "a", "c").widgets)).toEqual(["b", "c", "a", "d"]);
    expect(ids(moverA(d, "c", "a").widgets)).toEqual(["c", "a", "b", "d"]);
    expect(moverA(d, "a", "a")).toBe(d);
    expect(moverA(d, "a", "x")).toBe(d);
  });

  it("ocultar y mostrar: al mostrarlo queda al final de los visibles", () => {
    const d = porDefecto(CAT);
    const sinB = ponerVisible(d, "b", false);
    expect(ids(visibles(sinB))).toEqual(["a", "c"]);
    const conD = ponerVisible(sinB, "d", true);
    expect(ids(visibles(conD))).toEqual(["a", "c", "d"]);
    expect(ponerVisible(d, "a", true)).toBe(d);
  });

  it("cambiar tamaño acepta solo 1, 2 o 3", () => {
    const d = porDefecto(CAT);
    expect(cambiarTamano(d, "b", 2).widgets[1].tamano).toBe(2);
    expect(cambiarTamano(d, "b", 4)).toBe(d);
    expect(cambiarTamano(d, "b", 1)).toBe(d);
    expect(iguales(d, cambiarTamano(d, "b", 3))).toBe(false);
    expect(iguales(d, porDefecto(CAT))).toBe(true);
  });

  it("una disposición guardada y vuelta a leer queda igual", () => {
    const d = cambiarTamano(mover(porDefecto(), "alertas", -3), "fondos", 3);
    expect(normalizar(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});

const n = (id: number, medio: string, titular: string, categoria: Noticia["categoria"], fecha: string): Noticia => ({
  id, titular, url: `https://ejemplo.do/${id}`, medio, fecha, categoria, pais: null, lat: null, lon: null, lugar: null, fuente_id: null,
});
const NOTICIAS = [
  n(1, "El Dinero", "El petróleo sube por tensiones", "mercado", "2026-10-20T12:00:00Z"),
  n(2, "Diario Libre", "Banco Central mantiene la tasa", "rd", "2026-10-20T13:00:00Z"),
  n(3, "El Dinero", "Remesas récord en septiembre", "rd", "2026-10-20T11:00:00Z"),
  n(4, "CNBC", "Fed signals pause", "instituciones", "2026-10-20T14:00:00Z"),
];

describe("Mis noticias", () => {
  it("normaliza lo guardado: quita repetidos, vacíos y temas que no existen", () => {
    expect(normalizarPref(null)).toEqual({ medios: [], categorias: [], palabras: [] });
    expect(normalizarPref({ medios: ["CNBC", " cnbc ", "", 3], categorias: ["rd", "deportes", "rd"], palabras: "petróleo" })).toEqual({
      medios: ["CNBC"],
      categorias: ["rd"],
      palabras: [],
    });
    expect(partirPalabras(" petróleo, Banco Central;; fed \n Fed")).toEqual(["petróleo", "Banco Central", "fed"]);
  });

  it("sin filtros no hay nada que mostrar todavía", () => {
    expect(sinFiltros(normalizarPref({}))).toBe(true);
  });

  it("filtra por medio, tema y palabra (sin tildes), más recientes primero", () => {
    const p = (x: object) => normalizarPref(x);
    expect(filtrarMisNoticias(NOTICIAS, p({ medios: ["el dinero"] })).map((x) => x.id)).toEqual([1, 3]);
    expect(filtrarMisNoticias(NOTICIAS, p({ categorias: ["rd"] })).map((x) => x.id)).toEqual([2, 3]);
    expect(filtrarMisNoticias(NOTICIAS, p({ palabras: ["petroleo", "FED"] })).map((x) => x.id)).toEqual([4, 1]);
    expect(filtrarMisNoticias(NOTICIAS, p({ medios: ["El Dinero"], categorias: ["rd"] })).map((x) => x.id)).toEqual([3]);
    expect(filtrarMisNoticias(NOTICIAS, p({ palabras: ["oro"] }))).toEqual([]);
    expect(filtrarMisNoticias(NOTICIAS, p({ categorias: ["rd", "mercado", "instituciones"] }), 2).map((x) => x.id)).toEqual([4, 2]);
  });

  it("lista los medios con cuántos titulares tienen", () => {
    expect(mediosDisponibles(NOTICIAS)).toEqual([
      { medio: "El Dinero", n: 2 },
      { medio: "CNBC", n: 1 },
      { medio: "Diario Libre", n: 1 },
    ]);
    expect(plano("Petróleo ÁÉÍ")).toBe("petroleo aei");
  });
});
