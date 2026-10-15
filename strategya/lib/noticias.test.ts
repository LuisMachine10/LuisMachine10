import { describe, expect, it } from "vitest";
import { conceptosDelDia, GLOSARIO } from "./glosario";
import { geometriaMapa, proyectarPines } from "./mapa";
import {
  agruparOperaciones,
  type ComunicadoInstitucion,
  esDeHoy,
  estadoInstituciones,
  type EventoAgenda,
  filtrarNoticias,
  masMovidas,
  type Movimiento,
  type Noticia,
  type OperacionSec,
  pinesDeNoticias,
  pinesDeSeries,
  proximosEventos,
} from "./noticias";

const AHORA = new Date("2026-10-15T16:00:00Z"); // 12:00 PM RD

const noticia = (p: Partial<Noticia>): Noticia => ({
  id: 1, titular: "t", url: "https://a.com/1", medio: "a.com", fecha: "2026-10-15T12:00:00.000Z",
  categoria: "mercado", pais: null, lat: null, lon: null, lugar: null, fuente_id: "gdelt", ...p,
});

const mov = (p: Partial<Movimiento>): Movimiento => ({
  serie_id: "X", nombre: "X", nombre_corto: "X", categoria: "indice", unidad: "puntos", sustituto_de: null,
  max_antiguedad_min: 120, meta: {}, valor: "100", cambio: null, cambio_pct: null, fecha_dato: "2026-10-15",
  hora_dato: null, recogido_en: "2026-10-15T15:59:00Z", url_dato: null, estado: "ok", fuente_nombre: "FMP",
  fuente_url: "https://fmp", ...p,
});

const evento = (p: Partial<EventoAgenda>): EventoAgenda => ({
  id: 1, fecha_hora: "2026-10-28T18:00:00Z", institucion: "Fed", evento: "FOMC", importancia: 3,
  confirmado: false, url: null, hora_conocida: true, zona: "America/New_York", nota: null, ...p,
});

describe("noticias", () => {
  it("filtra por categoría y ordena de la más nueva a la más vieja", () => {
    const lista = [
      noticia({ id: 1, fecha: "2026-10-15T10:00:00Z", categoria: "rd" }),
      noticia({ id: 2, fecha: "2026-10-15T12:00:00Z", categoria: "rd" }),
      noticia({ id: 3, fecha: "2026-10-15T13:00:00Z", categoria: "guerra" }),
    ];
    expect(filtrarNoticias(lista).map((n) => n.id)).toEqual([3, 2, 1]);
    expect(filtrarNoticias(lista, "rd", 1).map((n) => n.id)).toEqual([2]);
  });
});

describe("instituciones", () => {
  const items: ComunicadoInstitucion[] = [
    { institucion: "Fed", titulo: "Viejo", url: "https://f/1", fecha: "2026-10-01T10:00:00Z", solo_fecha: false, fuente_id: "fed_rss" },
    { institucion: "Fed", titulo: "Nuevo", url: "https://f/2", fecha: "2026-10-13T18:00:00Z", solo_fecha: false, fuente_id: "fed_rss" },
  ];

  it("lo último de cada una, en el orden del catálogo; FMI, OCDE y OFAC rotuladas como bloqueadas", () => {
    const e = estadoInstituciones(items);
    expect(e[0]).toMatchObject({ institucion: "Fed", via: "rss", ultimo: { titulo: "Nuevo" } });
    expect(e[0].anteriores.map((a) => a.titulo)).toEqual(["Viejo"]);
    for (const nombre of ["FMI", "OCDE", "OFAC"]) {
      const f = e.find((x) => x.institucion === nombre)!;
      expect(f.via).toBe("bloqueada");
      expect(f.motivo).toMatch(/bloquea la lectura automática/);
      expect(f.ultimo).toBeNull();
    }
    expect(e.find((x) => x.institucion === "Banco Mundial")?.via).toBe("sin_feed");
    expect(e.find((x) => x.institucion === "BCE")?.ultimo).toBeNull();
  });

  it("si la base marca una fuente como bloqueada, se rotula y no se muestra lo viejo", () => {
    const f = estadoInstituciones(items, new Set(["fed_rss"]))[0];
    expect(f).toMatchObject({ via: "bloqueada", ultimo: null });
  });
});

describe("SEC", () => {
  it("separa IPO y fusiones, de la más reciente a la más vieja", () => {
    const op = (p: Partial<OperacionSec>): OperacionSec => ({
      form: "S-1", tipo: "ipo", empresa: "A", cik: "1", fecha: "2026-10-14", url: "u", indice_fecha: "2026-10-14", recogido_en: "", ...p,
    });
    const g = agruparOperaciones([op({ empresa: "B", fecha: "2026-10-13" }), op({ empresa: "C" }), op({ tipo: "fusion", form: "425", indice_fecha: "2026-10-15" })]);
    expect(g.ipo.map((o) => o.empresa)).toEqual(["C", "B"]);
    expect(g.fusion).toHaveLength(1);
    expect(g.ultimoIndice).toBe("2026-10-15");
  });
});

describe("agenda", () => {
  const agenda = [
    evento({ id: 1, fecha_hora: "2026-10-28T18:00:00Z" }),
    evento({ id: 2, fecha_hora: "2026-10-27T15:00:00Z", institucion: "BoJ", hora_conocida: false, zona: "Asia/Tokyo" }),
    evento({ id: 3, fecha_hora: "2026-10-29T13:15:00Z", institucion: "BCE" }),
    evento({ id: 4, fecha_hora: "2026-12-09T19:00:00Z" }),
    evento({ id: 5, fecha_hora: "2026-10-14T18:00:00Z" }),
  ];

  it("próximos N días en orden; lo de ayer no sale", () => {
    expect(proximosEventos(agenda, AHORA, 30).map((e) => e.id)).toEqual([2, 1, 3]);
    expect(proximosEventos(agenda, AHORA, 90).map((e) => e.id)).toEqual([2, 1, 3, 4]);
  });

  it("«Qué vigilar»: los 3 próximos de 7 días", () => {
    const desde = new Date("2026-10-24T12:00:00Z");
    expect(proximosEventos(agenda, desde, 7, 3).map((e) => e.id)).toEqual([2, 1, 3]);
    expect(proximosEventos(agenda, AHORA, 7, 3)).toEqual([]);
  });

  it("un evento con solo el día sigue «próximo» durante ese día", () => {
    const enTokio = new Date("2026-10-27T23:00:00Z"); // 8:00 AM del 28 en Tokio
    expect(proximosEventos(agenda, enTokio, 1).map((e) => e.id)).toContain(2);
  });
});

describe("qué vigilar · más movidas", () => {
  it("ordena por |cambio %| exacto, solo las de hoy en RD y con cambio publicado", () => {
    const movs = [
      mov({ serie_id: "A", cambio_pct: "-1.250000" }),
      mov({ serie_id: "B", cambio_pct: "1.249999" }),
      mov({ serie_id: "C", cambio_pct: "3.1", fecha_dato: "2026-10-14" }), // de ayer
      mov({ serie_id: "D", cambio_pct: null }),
      mov({ serie_id: "E", cambio_pct: "0" }),
      mov({ serie_id: "F", cambio_pct: "0.5", fecha_dato: "2026-10-14", hora_dato: "2026-10-15T13:30:00Z" }), // hora de hoy
    ];
    expect(masMovidas(movs, AHORA).map((m) => m.serie_id)).toEqual(["A", "B", "F"]);
  });

  it("a las 9 PM RD (01:00 UTC del día siguiente) sigue siendo «hoy» en RD", () => {
    const noche = new Date("2026-10-16T01:00:00Z");
    expect(esDeHoy({ fecha_dato: "2026-10-15", hora_dato: null }, noche)).toBe(true);
    // 00:30 UTC del 16 = 8:30 PM RD del 15: es de hoy aunque la fecha del dato (de la fuente) diga 16.
    expect(esDeHoy({ fecha_dato: "2026-10-16", hora_dato: "2026-10-16T00:30:00Z" }, noche)).toBe(true);
    expect(esDeHoy({ fecha_dato: "2026-10-14", hora_dato: "2026-10-14T20:00:00Z" }, noche)).toBe(false);
  });
});

describe("mapa", () => {
  it("noticias con lugar → pines agrupados por lugar y tipo; sin lugar no hay pin", () => {
    const pines = pinesDeNoticias([
      noticia({ id: 1, categoria: "guerra", lat: "31.50", lon: "34.47", lugar: "Gaza", titular: "Uno" }),
      noticia({ id: 2, categoria: "guerra", lat: "31.50", lon: "34.47", lugar: "Gaza", titular: "Dos", fecha: "2026-10-15T13:00:00Z" }),
      noticia({ id: 3, categoria: "rd", lat: "18.47", lon: "-69.89", lugar: "Santo Domingo" }),
      noticia({ id: 4, categoria: "mercado", lat: "40.71", lon: "-74.01", lugar: "Nueva York" }),
      noticia({ id: 5, categoria: "mercado" }),
    ]);
    expect(pines.map((p) => [p.tipo, p.lugar, p.elementos.length])).toEqual([
      ["guerra", "Gaza", 2],
      ["rd", "Santo Domingo", 1],
      ["noticia", "Nueva York", 1],
    ]);
    expect(pines[0].elementos[0].texto).toBe("Dos"); // la más reciente primero
  });

  it("series con meta.lat/lon: verde si sube, rojo si baja; sin cambio o sin lugar no hay pin", () => {
    const pines = pinesDeSeries([
      mov({ serie_id: "IDX_SPX", nombre_corto: "S&P 500", cambio_pct: "0.42", meta: { lat: 40.71, lon: -74.01, pais: "EE. UU." } }),
      mov({ serie_id: "IDX_DJI", nombre_corto: "Dow", cambio_pct: "-0.10", meta: { lat: 40.71, lon: -74.01, pais: "EE. UU." } }),
      mov({ serie_id: "IDX_IXIC", nombre_corto: "Nasdaq", cambio_pct: "1.05", meta: { lat: 40.71, lon: -74.01, pais: "EE. UU." } }),
      mov({ serie_id: "ORO", cambio_pct: "1" }),
      mov({ serie_id: "IDX_N225", cambio_pct: null, meta: { lat: 35.68, lon: 139.69 } }),
    ]);
    expect(pines.map((p) => [p.tipo, p.elementos.map((e) => e.texto)])).toEqual([
      ["baja", ["Dow ↓ −0.10%"]],
      ["sube", ["Nasdaq ↑ +1.05%", "S&P 500 ↑ +0.42%"]],
    ]);
  });

  it("proyecta dentro del lienzo y separa pines superpuestos", () => {
    const base = { elementos: [], lugar: "x" };
    const p = proyectarPines([
      { ...base, id: "a", tipo: "rd", lat: 18.47, lon: -69.89 },
      { ...base, id: "b", tipo: "sube", lat: 18.47, lon: -69.89 },
    ]);
    expect(p).toHaveLength(2);
    for (const x of p) {
      expect(x.x).toBeGreaterThan(0);
      expect(x.x).toBeLessThan(960);
      expect(x.y).toBeGreaterThan(0);
      expect(x.y).toBeLessThan(468);
    }
    expect(Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)).toBeGreaterThanOrEqual(9);
  });

  it("la geometría del mundo trae los países de world-atlas 110m", () => {
    const g = geometriaMapa();
    expect(g.paises.length).toBeGreaterThan(150);
    expect(g.esfera).toMatch(/^M/);
  });
});

describe("glosario", () => {
  it("entre 40 y 60 conceptos, ids únicos, una línea, sin cifras", () => {
    expect(GLOSARIO.length).toBeGreaterThanOrEqual(40);
    expect(GLOSARIO.length).toBeLessThanOrEqual(60);
    expect(new Set(GLOSARIO.map((c) => c.id)).size).toBe(GLOSARIO.length);
    for (const c of GLOSARIO) {
      expect(c.definicion).not.toMatch(/\n/);
      expect(c.definicion.length).toBeLessThan(200);
      // Sin cifras de mercado: solo se permiten nombres de formularios, índices y plazos de ejemplo.
      expect(c.definicion.replace(/S&P 500|Russell 2000|10 años|2 años|S-1|F-1|425|DEFM14A|SC TO-T|III|un año|un día/g, "")).not.toMatch(/\d/);
    }
  });

  it("conceptos del día: deterministas, de 3 a 5, primero lo que se movió", () => {
    const e = { seriesMovidas: ["BRENT", "UST_10A"], categorias: ["guerra" as const], fecha: "2026-10-15" };
    const a = conceptosDelDia(e).map((c) => c.id);
    expect(a).toEqual(conceptosDelDia(e).map((c) => c.id));
    expect(a.slice(0, 3)).toEqual(["brent-wti", "rendimiento-par", "refugio"]);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a.length).toBeLessThanOrEqual(5);
  });

  it("sin contexto, rota según el día (otro día, otros conceptos)", () => {
    const hoy = conceptosDelDia({ seriesMovidas: [], categorias: [], fecha: "2026-10-15" }).map((c) => c.id);
    const manana = conceptosDelDia({ seriesMovidas: [], categorias: [], fecha: "2026-10-16" }).map((c) => c.id);
    expect(hoy).toHaveLength(3);
    expect(hoy).not.toEqual(manana);
  });
});
