import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { correrTarea } from "../ingesta.ts";
import { FEEDS_USGS, parsearFeedUsgs, tareaSismosUsgs, unirSismos, urlOficialUsgs } from "./sismos-usgs.ts";

// SINTÉTICAS: reemplazar por reales (sondas/lotes/27-globo.txt). Construidas según la documentación de USGS.
const muestra = (n: string) => readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "usgs", n), "utf8");
const DIA = muestra("4.5_day.geojson");
const SEMANA = muestra("significant_week.geojson");

const feed = (features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });
const evento = (props: Record<string, unknown> = {}, coords: unknown = [-69.1, 18.5, 10], id: unknown = "us7000aaaa") => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: coords },
  properties: {
    mag: 4.8,
    place: "lugar",
    time: 1760500000000,
    updated: 1760500100000,
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000aaaa",
    type: "earthquake",
    title: "M 4.8 - lugar",
    ...props,
  },
});

describe("parsearFeedUsgs · muestra 4.5_day", () => {
  const l = parsearFeedUsgs(DIA, "4.5_day");

  it("lee los 4 sismos con su página oficial", () => {
    expect(l.filas.map((f) => f.id_externo)).toEqual(["us7000r9a1", "us7000r9b2", "us7000r9c3", "us7000r9d4"]);
    expect(l.filas.every((f) => f.url.startsWith("https://earthquake.usgs.gov/earthquakes/eventpage/"))).toBe(true);
    expect(l.omitidos).toBe(0);
  });

  it("conserva magnitud, coordenadas y profundidad como texto exacto", () => {
    const rd = l.filas[0];
    expect(rd).toMatchObject({ tipo: "sismo", magnitud: "4.7", lat: "18.8902", lon: "-68.2311", fuente_id: "usgs" });
    expect(rd.datos.profundidad_km).toBe("35.5");
    expect(l.filas[1].datos.profundidad_km).toBe("112.03");
    expect(rd.fecha_evento).toBe("2026-10-15T09:41:12.120Z");
    expect(rd.titulo).toBe("M 4.7 - 38 km NNE of Punta Cana, Dominican Republic");
  });

  it("lee alerta PAGER y tsunami", () => {
    expect(l.filas[3].datos).toMatchObject({ alerta_pager: "green", tsunami: false, feeds: ["4.5_day"] });
  });
});

describe("parsearFeedUsgs · validación (portada de God's Eye View)", () => {
  it("rechaza todo el feed si una entrada está mal formada", () => {
    expect(() => parsearFeedUsgs(feed([evento(), evento({}, [200, 10])]), "4.5_day")).toThrow(/longitud/);
    expect(() => parsearFeedUsgs(feed([evento({}, [-69, 91])]), "4.5_day")).toThrow(/latitud/);
    expect(() => parsearFeedUsgs(feed([evento({ mag: 11 })]), "4.5_day")).toThrow(/magnitud/);
    expect(() => parsearFeedUsgs(feed([evento({}, [-69, 18, "x"])]), "4.5_day")).toThrow(/profundidad/);
    expect(() => parsearFeedUsgs(feed([evento(), evento()]), "4.5_day")).toThrow(/repetido/);
    expect(() => parsearFeedUsgs(JSON.stringify({ type: "FeatureCollection" }), "4.5_day")).toThrow(/FeatureCollection/);
    expect(() => parsearFeedUsgs("<html>", "4.5_day")).toThrow(/JSON/);
  });

  it("omite sin magnitud, por debajo de M2.5, sin página oficial o que no son terremotos", () => {
    const l = parsearFeedUsgs(
      feed([
        evento({ mag: null }, undefined, "a1"),
        evento({ mag: 2.4 }, undefined, "a2"),
        evento({ url: "https://otro.example/x" }, undefined, "a3"),
        evento({ type: "quarry blast" }, undefined, "a4"),
        evento({}, undefined, "a5"),
      ]),
      "4.5_day",
    );
    expect(l.filas.map((f) => f.id_externo)).toEqual(["a5"]);
    expect(l.omitidos).toBe(4);
  });

  it("solo acepta enlaces del propio USGS", () => {
    expect(urlOficialUsgs("https://earthquake.usgs.gov/earthquakes/eventpage/us1")).toBe("https://earthquake.usgs.gov/earthquakes/eventpage/us1");
    expect(urlOficialUsgs("http://earthquake.usgs.gov/earthquakes/eventpage/us1")).toBeNull();
    expect(urlOficialUsgs("https://earthquake.usgs.gov.evil/earthquakes/eventpage/us1")).toBeNull();
    expect(urlOficialUsgs(42)).toBeNull();
  });
});

describe("unirSismos", () => {
  it("un evento en los dos feeds queda una vez, con la versión más actualizada y ambos feeds", () => {
    const u = unirSismos([parsearFeedUsgs(DIA, "4.5_day").filas, parsearFeedUsgs(SEMANA, "significant_week").filas]);
    expect(u).toHaveLength(5);
    const taiwan = u.find((f) => f.id_externo === "us7000r9d4")!;
    expect(taiwan.datos.feeds).toEqual(["4.5_day", "significant_week"]);
    expect(taiwan.datos.significancia).toBe("651");
    // Ordenados del más reciente al más viejo
    expect(u[0].id_externo).toBe("us7000r9a1");
    expect(u.at(-1)!.id_externo).toBe("us7000r8z9");
  });
});

describe("tarea sismos-usgs (almacén en memoria)", () => {
  const ahora = () => new Date("2026-10-15T12:15:00Z");
  const obtener = async (url: string) => ({
    url,
    status: 200,
    tipo: "application/geo+json",
    texto: url === FEEDS_USGS["4.5_day"] ? DIA : SEMANA,
    intentos: 1,
  });

  it("guarda los sismos sin repetir, purga lo viejo y cierra en ok", async () => {
    const { almacen, tablas, llamadasRpc } = almacenMemoria({ rpc: () => 2 });
    const r = await correrTarea(tareaSismosUsgs, almacen, { ahora, obtener });
    expect(r.estado).toBe("ok");
    expect(tablas.eventos_geo).toHaveLength(5);
    expect(llamadasRpc).toEqual([{ funcion: "globo_purgar_sismos", args: { p_dias: 14, p_ahora: "2026-10-15T12:15:00.000Z" } }]);
    expect(r.detalle).toMatchObject({ sismos: 5, purgados: 2 });
  });

  it("si un feed falla guarda el otro y queda parcial", async () => {
    const { almacen, tablas } = almacenMemoria();
    const r = await correrTarea(tareaSismosUsgs, almacen, {
      ahora,
      obtener: async (url) => {
        if (url === FEEDS_USGS.significant_week) throw new Error("HTTP 503");
        return obtener(url);
      },
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/significant_week: HTTP 503/);
    expect(tablas.eventos_geo).toHaveLength(4);
  });

  it("si robots.txt lo prohíbe o los dos feeds fallan, error y nada guardado", async () => {
    const { almacen, tablas } = almacenMemoria();
    const r = await correrTarea(tareaSismosUsgs, almacen, {
      ahora,
      obtener: async () => {
        throw new Error("Lectura no permitida: robots.txt de earthquake.usgs.gov no permite /earthquakes/feed");
      },
    });
    expect(r.estado).toBe("error");
    expect(tablas.eventos_geo).toBeUndefined();
  });

  it("no vuelve a guardar sismos más viejos que la retención", async () => {
    const { almacen, tablas } = almacenMemoria();
    await correrTarea(tareaSismosUsgs, almacen, { ahora: () => new Date("2026-10-26T00:00:00Z"), obtener });
    expect(tablas.eventos_geo.map((f) => f.id_externo)).not.toContain("us7000r8z9");
  });
});
