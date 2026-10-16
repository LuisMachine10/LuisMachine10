import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { correrTarea } from "../ingesta.ts";
import {
  CAPAS_GIS,
  clasificacionEs,
  filaCiclon,
  parsearEstadoCiclones,
  tareaCiclonesNhc,
  unirGeometria,
  URL_ESTADO_NHC,
  urlCapaGis,
} from "./ciclones-nhc.ts";

// SINTÉTICAS: reemplazar por reales (sondas/lotes/27-globo.txt). Forma tomada de la documentación del NHC
// y de las pruebas de God's Eye View (src/data/cyclonesProxy.test.mjs).
const muestra = (n: string) => readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "nhc", n), "utf8");
const ESTADO = muestra("CurrentStorms.json");
const VACIO = muestra("CurrentStorms-sin-tormentas.json");
const CAPAS = [muestra("gis-5-puntos.geojson"), muestra("gis-6-trayectoria.geojson"), muestra("gis-7-cono.geojson")];
const AHORA = Date.parse("2026-10-15T09:35:00Z");

const TIME = "2026-10-15T09:00:00.000Z";
function estado(cambios: Record<string, unknown> = {}) {
  return JSON.stringify({
    activeStorms: [
      {
        id: "ep152026",
        name: "Fifteen-E",
        classification: "PTC",
        intensity: "25",
        pressure: "1006",
        longitudeNumeric: -125.8,
        latitudeNumeric: 15.5,
        movementDir: 255,
        movementSpeed: 12,
        lastUpdate: TIME,
        forecastAdvisory: { advNum: "010", issuance: TIME, url: "https://www.nhc.noaa.gov/text/MIATCMEP5.shtml" },
        ...cambios,
      },
    ],
  });
}

describe("parsearEstadoCiclones (portado de parseCycloneStatus)", () => {
  it("lee la tormenta de la muestra con sus cifras exactas y enlaces oficiales", () => {
    const [c] = parsearEstadoCiclones(ESTADO, AHORA);
    expect(c).toMatchObject({
      id: "al142026",
      nombre: "Prueba",
      clasificacion: "HU",
      cuenca: "AL",
      lat: "16.5",
      lon: "-64",
      avisoNumero: "12",
      emitidoEn: TIME,
      vientoKt: "75",
      presionHpa: "987",
      movimiento: { direccionGrados: "280", velocidadKt: "12" },
      urlAviso: "https://www.nhc.noaa.gov/text/MIATCMAT4.shtml",
      urlPerspectiva: "https://www.nhc.noaa.gov/gtwo.php?basin=atlc&fdays=7",
      geometria: "pendiente",
    });
  });

  it("sin tormentas activas devuelve una lista vacía (lo dice el NHC, no se asume)", () => {
    expect(parsearEstadoCiclones(VACIO, AHORA)).toEqual([]);
  });

  it("valores fuera de rango quedan en null, nunca inventados", () => {
    const [c] = parsearEstadoCiclones(estado({ intensity: "9999", pressure: null, movementSpeed: "" }), AHORA);
    expect(c.vientoKt).toBeNull();
    expect(c.presionHpa).toBeNull();
    expect(c.movimiento.velocidadKt).toBeNull();
  });

  it("un enlace que no es del NHC se descarta", () => {
    const [c] = parsearEstadoCiclones(
      estado({ forecastAdvisory: { advNum: "10", issuance: TIME, url: "https://www.nhc.noaa.gov.evil/secret" } }),
      AHORA,
    );
    expect(c.urlAviso).toBeNull();
    expect(filaCiclon(c).url).toBe("https://www.nhc.noaa.gov/gtwo.php?basin=epac&fdays=7");
  });

  it("rechaza (no reporta vacío) documentos mal formados, repetidos, futuros o vencidos", () => {
    const una = JSON.parse(estado()).activeStorms[0];
    for (const cuerpo of [
      "{}",
      JSON.stringify({ activeStorms: null }),
      JSON.stringify({ activeStorms: Array(33).fill(una) }),
      JSON.stringify({ activeStorms: [una, una] }),
      estado({ id: "wp012026" }),
      estado({ name: "a".repeat(81) }),
      estado({ name: "<script>" }),
      estado({ latitudeNumeric: 91 }),
      estado({ lastUpdate: "2026-10-16T00:00:00.000Z" }),
      estado({ lastUpdate: "2026-02-30T00:00:00.000Z" }),
      estado({ forecastAdvisory: { advNum: "10", issuance: "2026-10-14T03:00:00.000Z" } }),
      "no es json",
    ]) {
      expect(() => parsearEstadoCiclones(cuerpo, AHORA)).toThrow();
    }
  });
});

describe("unirGeometria (portado de attachCycloneGeometry)", () => {
  const ciclones = parsearEstadoCiclones(ESTADO, AHORA);

  it("une puntos, trayectoria y cono del mismo aviso", () => {
    const [c] = unirGeometria(ciclones, CAPAS);
    expect(c.geometria).toBe("vigente");
    expect(c.puntos.map((p) => p.horas)).toEqual([0, 12, 24, 36, 48, 72, 96, 120]);
    expect(c.puntos[2]).toEqual({ lat: "17.2", lon: "-67.8", horas: 24, viento_kt: "85", rafaga_kt: "105" });
    expect(c.trayectoria?.type).toBe("LineString");
    expect(c.cono?.type).toBe("Polygon");
  });

  it("no rotula geometría de un aviso anterior con el aviso nuevo", () => {
    const viejas = CAPAS.map((t) => t.replaceAll("-012_5day", "-011_5day").replaceAll('"advisnum": "12"', '"advisnum": "11"'));
    const [c] = unirGeometria(ciclones, viejas);
    expect(c.geometria).toBe("pendiente");
    expect(c.puntos).toEqual([]);
    expect(c.trayectoria).toBeNull();
  });

  it("rechaza capas mal formadas o anillos sin cerrar", () => {
    expect(() => unirGeometria(ciclones, ["{}", CAPAS[1], CAPAS[2]])).toThrow();
    const abierto = JSON.parse(CAPAS[2]);
    abierto.features[0].geometry.coordinates[0].pop();
    expect(() => unirGeometria(ciclones, [CAPAS[0], CAPAS[1], JSON.stringify(abierto)])).toThrow(/anillo/);
  });
});

describe("rótulos", () => {
  it("clasificación en español", () => {
    expect(clasificacionEs("HU")).toBe("Huracán");
    expect(clasificacionEs("TS")).toBe("Tormenta tropical");
    expect(clasificacionEs("XX")).toBe("XX");
  });
});

describe("tarea ciclones-nhc (almacén en memoria)", () => {
  const ahora = () => new Date(AHORA);
  const obtener = (estadoTexto: string, fallarGis = false) => async (url: string) => {
    if (url === URL_ESTADO_NHC) return { url, status: 200, tipo: "application/json", texto: estadoTexto, intentos: 1 };
    if (fallarGis) throw new Error("HTTP 500");
    const i = CAPAS_GIS.findIndex((c) => url === urlCapaGis(c.id, c.tipo, c.cuenta));
    return { url, status: 200, tipo: "application/geo+json", texto: CAPAS[i], intentos: 1 };
  };

  it("reemplaza el conjunto de ciclones con su pronóstico", async () => {
    const { almacen, llamadasRpc } = almacenMemoria({ rpc: () => ({ vigentes: 1, borrados: 0 }) });
    const r = await correrTarea(tareaCiclonesNhc, almacen, { ahora, obtener: obtener(ESTADO) });
    expect(r.estado).toBe("ok");
    expect(llamadasRpc).toHaveLength(1);
    const filas = llamadasRpc[0].args!.p_filas as Array<Record<string, unknown>>;
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ tipo: "ciclon", id_externo: "al142026", titulo: "Huracán Prueba", magnitud: "75" });
    expect((filas[0].datos as { geometria: string }).geometria).toBe("vigente");
    expect(r.detalle).toMatchObject({ activos: 1, borrados: 0 });
  });

  it("sin tormentas: ok con lista vacía (borra los ciclones que ya no están)", async () => {
    const { almacen, llamadasRpc } = almacenMemoria({ rpc: () => ({ vigentes: 0, borrados: 1 }) });
    const r = await correrTarea(tareaCiclonesNhc, almacen, { ahora, obtener: obtener(VACIO) });
    expect(r.estado).toBe("ok");
    expect(llamadasRpc[0].args).toEqual({ p_filas: [] });
  });

  it("si el pronóstico falla, guarda la posición y queda parcial con el motivo", async () => {
    const { almacen, llamadasRpc } = almacenMemoria();
    const r = await correrTarea(tareaCiclonesNhc, almacen, { ahora, obtener: obtener(ESTADO, true) });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/Pronóstico/);
    const filas = llamadasRpc[0].args!.p_filas as Array<{ datos: { geometria: string } }>;
    expect(filas[0].datos.geometria).toBe("no_disponible");
  });

  it("un estado inválido termina en error y no toca la base", async () => {
    const { almacen, llamadasRpc } = almacenMemoria();
    const r = await correrTarea(tareaCiclonesNhc, almacen, { ahora, obtener: obtener("{}") });
    expect(r.estado).toBe("error");
    expect(llamadasRpc).toEqual([]);
  });
});

describe("muestras REALES del NHC (16 oct 2026: Trudy y Simon en el Pacífico oriental)", () => {
  const AHORA_REAL = Date.parse("2026-10-16T18:30:00Z");
  const ciclones = parsearEstadoCiclones(muestra("CurrentStorms-real-2026-10-16.json"), AHORA_REAL);

  it("lee las dos tormentas con su viento, presión y aviso oficial", () => {
    expect(ciclones.map((c) => [c.id, c.nombre, c.clasificacion, c.vientoKt, c.presionHpa])).toEqual([
      ["ep212026", "Trudy", "HU", "95", "963"],
      ["ep202026", "Simon", "TS", "35", "1002"],
    ]);
    expect(ciclones[0]).toMatchObject({ lat: "14.7", lon: "-102.5", avisoNumero: "13", urlAviso: "https://www.nhc.noaa.gov/text/MIATCMEP1.shtml" });
  });

  it("une puntos, trayectoria y cono del MapServer a la tormenta que corresponde", () => {
    const unidos = unirGeometria(ciclones, [
      muestra("gis-5-puntos-real-2026-10-16.geojson"),
      muestra("gis-6-trayectoria-real-2026-10-16.geojson"),
      muestra("gis-7-cono-real-2026-10-16.geojson"),
    ]);
    const simon = unidos.find((c) => c.id === "ep202026")!;
    expect(simon.geometria).toBe("vigente");
    expect(simon.puntos.length).toBeGreaterThan(0);
    expect(simon.cono).not.toBeNull();
  });
});
