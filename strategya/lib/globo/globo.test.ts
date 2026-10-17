import { describe, expect, it } from "vitest";
import {
  alertasPasos,
  armarCapas,
  distanciaCiclonASantoDomingo,
  type EntradaCapas,
  type EventoGlobo,
  fechaRD,
  type NoticiaGlobo,
  type SerieGlobo,
} from "./capas";
import { distanciaKm, distanciaMinimaKm, interpolar, kmParaMostrar, normalizarLon, SANTO_DOMINGO, sismoRelevante, zonasCercanas } from "./geo";
import { PASOS, pasoPorId } from "./pasos";
import { alturaInicial, anchoEtiqueta, descongestionar, esAlerta, escalaResolucion, escribirPreferencias, factorEtiqueta, leerPreferencias, pixelesPorPunto, textoEtiqueta } from "./visor";

const AHORA = new Date("2026-10-15T14:00:00Z");

describe("geo · distancias", () => {
  it("haversine con valores conocidos", () => {
    // Santo Domingo – San Juan (PR): ~ 380 km
    expect(distanciaKm(SANTO_DOMINGO, { lat: 18.4655, lon: -66.1057 })).toBeGreaterThan(395);
    expect(distanciaKm(SANTO_DOMINGO, { lat: 18.4655, lon: -66.1057 })).toBeLessThan(410);
    // Un grado de latitud ≈ 111.2 km
    expect(distanciaKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.19, 1);
    expect(distanciaKm(SANTO_DOMINGO, SANTO_DOMINGO)).toBe(0);
  });

  it("interpolación de gran círculo y distancia mínima a una línea", () => {
    const m = interpolar({ lat: 0, lon: 0 }, { lat: 0, lon: 10 }, 0.5);
    expect(m.lat).toBeCloseTo(0, 6);
    expect(m.lon).toBeCloseTo(5, 6);
    // Línea que pasa a 1° al sur de un punto: ~111 km
    const d = distanciaMinimaKm({ lat: 1, lon: 5 }, [{ lat: 0, lon: 0 }, { lat: 0, lon: 10 }]);
    expect(d!).toBeCloseTo(111.2, 0);
    expect(distanciaMinimaKm({ lat: 1, lon: 5 }, [])).toBeNull();
  });

  it("formato para mostrar: decenas de km", () => {
    expect(kmParaMostrar(124.6)).toBe("120");
    expect(kmParaMostrar(1236)).toBe("1,240");
    expect(kmParaMostrar(7.4)).toBe("7");
  });

  it("normaliza longitudes", () => {
    expect(normalizarLon(190)).toBe(-170);
    expect(normalizarLon(-190)).toBe(170);
    expect(normalizarLon(180)).toBe(180);
  });
});

describe("geo · zonas de vigilancia", () => {
  it("un sismo en el norte de Chile cae en la zona de cobre", () => {
    const z = zonasCercanas({ lat: -22.88, lon: -68.55 });
    expect(z[0].zona.id).toBe("chile-norte");
  });
  it("uno frente a Punta Cana cae en la zona RD", () => {
    expect(zonasCercanas({ lat: 18.89, lon: -68.23 }).map((c) => c.zona.id)).toEqual(["rd"]);
  });
  it("uno en mar abierto no es relevante", () => {
    expect(zonasCercanas({ lat: 4.1, lon: 126.8 })).toEqual([]);
  });
  it("por debajo de M4.5 o sin magnitud no se resalta", () => {
    expect(sismoRelevante({ lat: 23.9, lon: 122.0 }, 4.4)).toEqual([]);
    expect(sismoRelevante({ lat: 23.9, lon: 122.0 }, null)).toEqual([]);
    expect(sismoRelevante({ lat: 23.9, lon: 122.0 }, 5.8).map((c) => c.zona.id)).toEqual(["taiwan"]);
  });
});

describe("pasos marítimos estáticos", () => {
  it("los 9 pasos pedidos, cada uno con fuente oficial, series y sin cifras de volumen", () => {
    expect(PASOS.map((p) => p.id)).toEqual([
      "ORMUZ", "BAB_EL_MANDEB", "SUEZ", "MALACA", "PANAMA", "BOSFORO", "GIBRALTAR", "BUENA_ESPERANZA", "DANESES",
    ]);
    for (const p of PASOS) {
      expect(p.fuente.url).toMatch(/^https:\/\//);
      expect(p.series.length).toBeGreaterThan(0);
      // Ningún número en los textos descriptivos (ni volúmenes ni porcentajes).
      expect(p.materias).not.toMatch(/\d/);
      expect(p.relevancia).not.toMatch(/\d/);
    }
    expect(pasoPorId("ORMUZ")?.fuente.url).toBe("https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints");
  });
});

// ---------------------------------------------------------------------------

const serie = (id: string, extra: Partial<SerieGlobo> = {}): SerieGlobo => ({
  id,
  nombre: id,
  nombre_corto: id,
  categoria: "indice",
  unidad: "puntos",
  fuente_id: "fmp",
  max_antiguedad_min: 120,
  orden: 1,
  meta: {},
  ...extra,
});

const ciclon = (extra: Partial<EventoGlobo> = {}): EventoGlobo => ({
  id: 9,
  tipo: "ciclon",
  id_externo: "al142026",
  titulo: "Huracán Prueba",
  lat: "16.5",
  lon: "-64",
  magnitud: "75",
  fecha_evento: "2026-10-15T09:00:00.000Z",
  url: "https://www.nhc.noaa.gov/text/MIATCMAT4.shtml",
  recogido_en: "2026-10-15T13:37:00Z",
  datos: {
    aviso: "12",
    emitido: "2026-10-15T09:00:00.000Z",
    presion_hpa: "987",
    geometria: "vigente",
    puntos: [{ lat: "17.6", lon: "-69.6", horas: 36 }],
    trayectoria: { type: "LineString", coordinates: [[-64, 16.5], [-67.8, 17.2], [-69.6, 17.6], [-71.3, 18.1]] },
    cono: { type: "Polygon", coordinates: [[[-64, 16.3], [-72, 17.2], [-72, 19], [-64, 16.3]]] },
    url_perspectiva: "https://www.nhc.noaa.gov/gtwo.php?basin=atlc&fdays=7",
  },
  ...extra,
});

const entrada = (extra: Partial<EntradaCapas> = {}): EntradaCapas => ({
  ahora: AHORA,
  series: [
    serie("IDX_SPX", { nombre_corto: "S&P 500", orden: 201, meta: { lat: 40.71, lon: -74.01, bolsa: "Nueva York (NYSE / Nasdaq)" } }),
    serie("IDX_DJI", { nombre_corto: "Dow", orden: 202, meta: { lat: 40.71, lon: -74.01, bolsa: "Nueva York (NYSE / Nasdaq)" } }),
    serie("IDX_N225", { nombre_corto: "Nikkei", orden: 208, meta: { lat: 35.68, lon: 139.69, bolsa: "Tokio (JPX)" } }),
    serie("IDX_HSI", { nombre_corto: "Hang Seng", orden: 209, meta: { lat: 22.32, lon: 114.17 } }),
    serie("ORO", { categoria: "metal", unidad: "US$/oz", orden: 301 }),
    serie("BRENT", { categoria: "energia", unidad: "US$/bbl", nombre_corto: "Brent", orden: 401 }),
    serie("USDDOP_VENTA", { categoria: "rd", unidad: "RD$ por US$", nombre_corto: "US$ venta", fuente_id: "bcrd", max_antiguedad_min: 5760, meta: { lat: 18.47, lon: -69.89 } }),
    serie("TPM_BCRD", { categoria: "rd", unidad: "%", nombre_corto: "TPM", fuente_id: "bcrd_excel", max_antiguedad_min: 525600 }),
    serie("AIS_ORMUZ_BUQUES", { categoria: "otro", unidad: "buques", fuente_id: "aisstream", nombre: "Buques distintos observados (AIS) · Estrecho de Ormuz", meta: { paso: "ORMUZ", nota: "muestra de 40 s; la cobertura AIS terrestre es incompleta en alta mar" } }),
  ],
  ultimas: [
    { serie_id: "IDX_SPX", valor: "6712.4", cambio: "30.1", cambio_pct: "0.45", fecha_dato: "2026-10-15", hora_dato: "2026-10-15T13:55:00Z", recogido_en: "2026-10-15T13:56:00Z", url_dato: null, estado: "ok" },
    { serie_id: "IDX_N225", valor: "41000.12", cambio: "-200", cambio_pct: "-0.4855", fecha_dato: "2026-10-15", hora_dato: "2026-10-15T06:00:00Z", recogido_en: "2026-10-15T06:01:00Z", url_dato: null, estado: "ok" },
    { serie_id: "BRENT", valor: "78.1", cambio: null, cambio_pct: null, fecha_dato: "2026-10-15", hora_dato: "2026-10-15T13:55:00Z", recogido_en: "2026-10-15T13:56:00Z", url_dato: null, estado: "ok" },
    { serie_id: "USDDOP_VENTA", valor: "63.1544", cambio: null, cambio_pct: null, fecha_dato: "2026-10-15", hora_dato: null, recogido_en: "2026-10-15T12:00:00Z", url_dato: "https://www.bancentral.gov.do/", estado: "ok" },
    { serie_id: "AIS_ORMUZ_BUQUES", valor: "3", cambio: null, cambio_pct: null, fecha_dato: "2026-10-15", hora_dato: "2026-10-15T13:20:00Z", recogido_en: "2026-10-15T13:21:00Z", url_dato: "https://aisstream.io/", estado: "ok" },
  ],
  fuentes: [
    { id: "fmp", nombre: "Financial Modeling Prep", url: "https://site.financialmodelingprep.com/" },
    { id: "bcrd", nombre: "Banco Central RD · portada", url: "https://www.bancentral.gov.do/" },
    { id: "aisstream", nombre: "AISStream.io", url: "https://aisstream.io/" },
  ],
  noticias: [
    { id: 1, titular: "Ataque a un tanquero en el golfo de Omán", url: "https://medio.example/1", medio: "Medio A", fecha: "2026-10-15T10:00:00Z", categoria: "guerra", lat: "25.3", lon: "57.5", pais: "Omán" },
    { id: 2, titular: "La bolsa de Tokio cierra a la baja", url: "https://medio.example/2", medio: "Medio B", fecha: "2026-10-15T07:00:00Z", categoria: "mercado", lat: "35.68", lon: "139.69", pais: "Japón" },
    { id: 3, titular: "Noticia vieja", url: "https://medio.example/3", medio: "Medio C", fecha: "2026-10-12T07:00:00Z", categoria: "guerra", lat: "26", lon: "56", pais: null },
    { id: 4, titular: "Sin ubicación", url: "https://medio.example/4", medio: "Medio D", fecha: "2026-10-15T07:00:00Z", categoria: "rd", lat: null, lon: null, pais: null },
  ] satisfies NoticiaGlobo[],
  eventos: [
    {
      id: 1, tipo: "sismo", id_externo: "us7000r9b2", titulo: "M 5.1 - 62 km SE of Calama, Chile", lat: "-22.8789", lon: "-68.5501", magnitud: "5.1",
      fecha_evento: "2026-10-15T04:17:55.880Z", url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000r9b2", recogido_en: "2026-10-15T04:30:00Z",
      datos: { lugar: "62 km SE of Calama, Chile", profundidad_km: "112.03", tipo_magnitud: "mww" },
    },
    {
      id: 2, tipo: "sismo", id_externo: "us7000r9c3", titulo: "M 4.5 - Kepulauan Talaud, Indonesia", lat: "4.1022", lon: "126.8123", magnitud: "4.5",
      fecha_evento: "2026-10-14T22:03:40.000Z", url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000r9c3", recogido_en: "2026-10-14T22:30:00Z", datos: {},
    },
    {
      id: 3, tipo: "sismo", id_externo: "viejo", titulo: "viejo", lat: "0", lon: "0", magnitud: "6", fecha_evento: "2026-10-01T00:00:00Z",
      url: "https://earthquake.usgs.gov/earthquakes/eventpage/viejo", recogido_en: "2026-10-01T00:00:00Z", datos: {},
    },
    ciclon(),
  ],
  tareas: [
    { tarea: "sismos-usgs", estado: "ok", inicio: "2026-10-15T13:45:00Z", ultima_ok: "2026-10-15T13:45:00Z", error: null, detalle: {} },
    { tarea: "ciclones-nhc", estado: "ok", inicio: "2026-10-15T13:37:00Z", ultima_ok: "2026-10-15T13:37:00Z", error: null, detalle: {} },
    { tarea: "buques-ais", estado: "parcial", inicio: "2026-10-15T13:20:00Z", ultima_ok: null, error: "desactivado", detalle: { desactivado: true } },
  ],
  ...extra,
});

describe("armarCapas · mercados", () => {
  const c = armarCapas(entrada());
  const mercados = c.puntos.filter((p) => p.capa === "mercados");

  it("una marca por bolsa (series con las mismas coordenadas se agrupan)", () => {
    expect(mercados.map((p) => p.titulo)).toEqual(["Nueva York (NYSE / Nasdaq)", "Tokio (JPX)", "IDX_HSI"]);
    expect(mercados[0].cifras.map((x) => x.etiqueta)).toEqual(["S&P 500", "Dow"]);
  });

  it("verde si sube, rojo si baja, gris sin dato; cifra exacta con flecha y sello", () => {
    expect(mercados.map((p) => p.tono)).toEqual(["sube", "baja", "neutro"]);
    const spx = mercados[0].cifras[0];
    expect(spx).toMatchObject({ valor: "6,712.40", cambio: "↑ +0.45%", direccion: "sube" });
    expect(spx.sello).toMatchObject({ fuente: "Financial Modeling Prep", fechaDato: "2026-10-15", desactualizado: false });
    expect(mercados[0].cifras[1].valor).toBeNull(); // Dow sin dato: no se inventa
    expect(mercados[1].cifras[0].cambio).toBe("↓ −0.49%");
    expect(mercados[2].notas).toEqual(["Sin datos todavía de estas series."]);
  });

  it("la RD, las series sin coordenadas y las AIS no son marcas de mercado", () => {
    expect(mercados.some((p) => p.cifras.some((x) => ["US$ venta", "ORO"].includes(x.etiqueta)))).toBe(false);
  });

  it("un dato viejo se marca DESACTUALIZADO", () => {
    const c2 = armarCapas(entrada({ ahora: new Date("2026-10-15T20:00:00Z") }));
    expect(c2.puntos.find((p) => p.id.startsWith("mercados:40.71"))!.cifras[0].sello!.desactualizado).toBe(true);
  });
});

describe("armarCapas · RD, noticias, pasos", () => {
  const c = armarCapas(entrada());

  it("RD en Santo Domingo con el dólar y la TPM no confirmada si falta", () => {
    const rd = c.puntos.find((p) => p.capa === "rd")!;
    expect(rd.tono).toBe("rd");
    expect(rd.cifras[0]).toMatchObject({ etiqueta: "US$ venta", valor: "63.1544" });
    expect(rd.cifras[1]).toMatchObject({ etiqueta: "TPM", valor: null, sello: null });
    expect(rd.notas[0]).toMatch(/No confirmado: TPM/);
  });

  it("noticias: solo las de 48 h con ubicación, con color por categoría", () => {
    const n = c.puntos.filter((p) => p.capa === "noticias");
    expect(n.map((p) => p.id)).toEqual(["noticias:1", "noticias:2"]);
    expect(n.map((p) => p.tono)).toEqual(["guerra", "ambar"]);
    expect(n[0].enlaces).toEqual([{ titulo: "Leer en Medio A", url: "https://medio.example/1" }]);
    expect(n[0].notas[0].replace(/\s/g, " ")).toBe("Medio A · 15 oct, 6:00 a. m. (hora RD)");
  });

  it("Ormuz queda con alerta por la noticia de guerra cercana", () => {
    const ormuz = c.puntos.find((p) => p.id === "pasos:ORMUZ")!;
    expect(ormuz.tono).toBe("ambar");
    expect(ormuz.notas.join(" ")).toMatch(/1 noticia de guerra/);
    expect(ormuz.cifras.map((x) => x.etiqueta)).toContain("Brent");
    expect(c.puntos.find((p) => p.id === "pasos:SUEZ")!.tono).toBe("paso");
  });
});

describe("armarCapas · sismos y ciclones", () => {
  const c = armarCapas(entrada());

  it("sismos de los últimos 7 días; el de Chile se resalta por la zona de cobre", () => {
    const s = c.puntos.filter((p) => p.capa === "sismos");
    expect(s.map((p) => p.id)).toEqual(["sismos:us7000r9b2", "sismos:us7000r9c3"]);
    expect(s[0]).toMatchObject({ tono: "ambar", destacado: true });
    expect(s[0].cifras[0]).toMatchObject({ valor: "5.1", unidad: "mww" });
    expect(s[0].cifras[0].sello).toMatchObject({ fuente: "USGS", url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000r9b2", desactualizado: false });
    expect(s[0].notas[0]).toMatch(/Norte de Chile/);
    expect(s[1].destacado).toBe(false);
    expect(c.resumen.sismosRelevantes.map((p) => p.id)).toEqual(["sismos:us7000r9b2"]);
  });

  it("ciclón: viento, presión y distancia mínima del pronóstico a Santo Domingo", () => {
    const p = c.puntos.find((x) => x.capa === "ciclones")!;
    expect(p.tono).toBe("baja"); // pasa cerca de RD
    expect(p.cifras.map((x) => x.valor)).toEqual(["75", "987", expect.stringMatching(/^≈ \d/)]);
    expect(p.lineas![0]).toHaveLength(4);
    expect(p.areas![0]).toHaveLength(4);
    expect(c.resumen.ciclones[0].base).toBe("pronóstico");
    expect(c.resumen.ciclones[0].distanciaKm!).toBeLessThan(150);
    expect(c.resumen.ciclonesConsultadoEn).toBe("2026-10-15T13:37:00Z");
  });

  it("sin ciclones: «sin ciclones activos según NHC» con la hora de consulta", () => {
    const c2 = armarCapas(entrada({ eventos: [] }));
    expect(c2.estados.ciclones.mensaje!.replace(/\s/g, " ")).toBe("Sin ciclones activos según NHC (consultado 15 oct, 9:37 a. m. (hora RD)).");
  });

  it("sin lecturas del NHC no afirma que no haya ciclones", () => {
    const c2 = armarCapas(entrada({ eventos: [], tareas: [] }));
    expect(c2.estados.ciclones.mensaje).toMatch(/Sin lecturas del NHC/);
  });

  it("sismos con la tarea vencida se marcan DESACTUALIZADO", () => {
    const c2 = armarCapas(entrada({ ahora: new Date("2026-10-15T16:00:00Z") }));
    expect(c2.puntos.find((p) => p.capa === "sismos")!.cifras[0].sello!.desactualizado).toBe(true);
  });
});

describe("distanciaCiclonASantoDomingo", () => {
  it("con pronóstico: mínimo sobre la trayectoria", () => {
    const d = distanciaCiclonASantoDomingo(ciclon());
    expect(d.base).toBe("pronóstico");
    // La trayectoria pasa a ~0.8° al sur de Santo Domingo
    expect(d.km!).toBeGreaterThan(60);
    expect(d.km!).toBeLessThan(120);
  });
  it("sin pronóstico: desde la posición actual", () => {
    const d = distanciaCiclonASantoDomingo(ciclon({ datos: { geometria: "no_disponible" } }));
    expect(d.base).toBe("posición actual");
    expect(d.km!).toBeCloseTo(distanciaKm(SANTO_DOMINGO, { lat: 16.5, lon: -64 }), 6);
  });
});

describe("buques AIS", () => {
  it("con conteo guardado aparece en el centro de la caja del paso; sin datos, el estado dice «desactivado»", () => {
    const c = armarCapas(entrada());
    const b = c.puntos.filter((p) => p.capa === "buques");
    expect(b).toHaveLength(1);
    expect(b[0].cifras[0]).toMatchObject({ valor: "3", unidad: "buques" });
    expect(b[0].notas[0]).toMatch(/muestra de 40 s/);
    const c2 = armarCapas(entrada({ ultimas: [] }));
    expect(c2.estados.buques.mensaje).toMatch(/Desactivado/);
  });
});

describe("alertasPasos", () => {
  it("ciclón con trayectoria cerca del Canal de Panamá", () => {
    const ev = ciclon({ lat: "10", lon: "-77", datos: { geometria: "no_disponible" } });
    const a = alertasPasos(PASOS, [], [ev], AHORA);
    expect(a.map((x) => x.paso.id)).toEqual(["PANAMA"]);
    expect(a[0].motivos[0]).toMatch(/ciclón activo/);
  });
  it("sin eventos cercanos no hay alertas", () => {
    expect(alertasPasos(PASOS, [], [], AHORA)).toEqual([]);
  });
});

describe("fechaRD", () => {
  it("usa el día de RD (UTC−4)", () => {
    expect(fechaRD("2026-10-16T02:00:00Z")).toBe("2026-10-15");
  });
});

describe("visor · nitidez", () => {
  it("dibuja a la densidad del dispositivo con tope 2", () => {
    expect(pixelesPorPunto(1)).toBe(1);
    expect(pixelesPorPunto(2)).toBe(2);
    expect(pixelesPorPunto(3)).toBe(2);
    expect(pixelesPorPunto(undefined)).toBe(1);
    expect(pixelesPorPunto(0.5)).toBe(1);
  });
  it("resolutionScale compensa el devicePixelRatio que Cesium ya aplica", () => {
    for (const dpr of [1, 1.5, 2, 3]) expect(dpr * escalaResolucion(dpr)).toBeCloseTo(pixelesPorPunto(dpr), 10);
    expect(escalaResolucion(Number.NaN)).toBe(1);
  });
  it("las etiquetas se rasterizan al menos al doble", () => {
    expect(factorEtiqueta(1)).toBe(2);
    expect(factorEtiqueta(2)).toBe(2);
    expect(factorEtiqueta(3)).toBe(2);
  });
  it("la cámara inicial acerca más en escenas anchas que en angostas", () => {
    const celular = alturaInicial(358, 520);
    const escritorio = alturaInicial(900, 720);
    expect(celular).toBeGreaterThan(escritorio);
    expect(celular).toBeLessThan(22_000_000);
    expect(alturaInicial(0, 0)).toBeGreaterThanOrEqual(6_000_000);
  });
});

describe("visor · preferencias", () => {
  it("guarda y lee la vista; valores raros vuelven a 3D", () => {
    const p = leerPreferencias(null);
    expect(p.vista).toBe("3d");
    expect(leerPreferencias(escribirPreferencias({ ...p, vista: "2d" })).vista).toBe("2d");
    expect(leerPreferencias('{"vista":"4d","mapa":"imagen"}')).toMatchObject({ vista: "3d", mapa: "imagen" });
    expect(leerPreferencias("no es json").capas.buques).toBe(false);
  });
});

describe("visor · presentación", () => {
  it("solo sismos, ciclones y pasos resaltados cuentan como alerta", () => {
    expect(esAlerta({ capa: "sismos", destacado: true })).toBe(true);
    expect(esAlerta({ capa: "pasos", destacado: true })).toBe(true);
    expect(esAlerta({ capa: "rd", destacado: true })).toBe(false);
    expect(esAlerta({ capa: "noticias", destacado: true })).toBe(false);
    expect(esAlerta({ capa: "ciclones", destacado: false })).toBe(false);
  });
  it("etiquetas cortas", () => {
    expect(textoEtiqueta({ capa: "mercados", titulo: "Nueva York (NYSE / Nasdaq)" })).toBe("Nueva York");
    expect(textoEtiqueta({ capa: "rd", titulo: "República Dominicana · Santo Domingo" })).toBe("RD · Santo Domingo");
    expect(textoEtiqueta({ capa: "noticias", titulo: "x".repeat(50) })).toHaveLength(34);
  });
});

describe("visor · etiquetas sin encimarse", () => {
  it("gana la de mayor prioridad y se descartan las que chocan", () => {
    const m = descongestionar([
      { id: "noticia", x: 100, y: 100, ancho: 120, alto: 22, prioridad: 3 },
      { id: "paso", x: 110, y: 105, ancho: 80, alto: 22, prioridad: 0 },
      { id: "lejos", x: 400, y: 100, ancho: 80, alto: 22, prioridad: 4 },
    ]);
    expect([...m].sort()).toEqual(["lejos", "paso"]);
  });
  it("el ancho crece con el texto", () => {
    expect(anchoEtiqueta("Canal de Suez")).toBeGreaterThan(anchoEtiqueta("RD"));
  });
});
