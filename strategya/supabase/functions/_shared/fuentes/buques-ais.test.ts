import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PASOS } from "../../../../lib/globo/pasos.ts";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { correrTarea } from "../ingesta.ts";
import {
  type AbrirSocket,
  CAJAS_PASOS,
  claseBuque,
  clasificarFalloAis,
  contarBuques,
  crearTareaBuquesAis,
  decodificarMarcoSync,
  esSobreAisReconocido,
  type EventosSocket,
  filasConteo,
  parsearMarcoAis,
  parsearRetryAfterMs,
  pasoDe,
  suscripcionAis,
  tomarMuestraAis,
} from "./buques-ais.ts";

// SINTÉTICA: mensajes construidos según el esquema público de AISStream (MMSI y nombres ficticios).
const MARCOS = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "aisstream", "mensajes.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("//"));

describe("cajas de los pasos", () => {
  it("hay una caja por cada paso de lib/globo/pasos.ts y contiene su marcador", () => {
    expect(Object.keys(CAJAS_PASOS).sort()).toEqual(PASOS.map((p) => p.id).sort());
    for (const p of PASOS) {
      expect(pasoDe(p.lat, p.lon)).toBe(p.id);
      expect(p.cajaAis).toEqual(CAJAS_PASOS[p.id]);
    }
  });
  it("la suscripción lleva la clave, las 9 cajas y solo los dos tipos pedidos", () => {
    const s = suscripcionAis("CLAVE");
    expect(s.APIKey).toBe("CLAVE");
    expect(s.BoundingBoxes).toHaveLength(9);
    expect(s.FilterMessageTypes).toEqual(["PositionReport", "ShipStaticData"]);
  });
});

describe("clasificarFalloAis (portado de classifyAisFailure)", () => {
  it("401/403 = clave rechazada; 429 = límite con su pausa; otros = transporte", () => {
    expect(clasificarFalloAis({ httpStatus: 401 }).tipo).toBe("auth");
    expect(clasificarFalloAis({ mensaje: "Unexpected server response: 403" }).tipo).toBe("auth");
    expect(clasificarFalloAis({ httpStatus: 429, retryAfter: "30" })).toMatchObject({ tipo: "rate-limit", reintentarEnMs: 30_000 });
    expect(clasificarFalloAis({ httpStatus: 502 }).tipo).toBe("transport");
    expect(clasificarFalloAis({ mensaje: "Api Key Is Not Valid" }).tipo).toBe("auth");
    expect(clasificarFalloAis({ mensaje: "too many connections" }).tipo).toBe("rate-limit");
    expect(clasificarFalloAis({ mensaje: "" })).toEqual({ tipo: "transport", mensaje: "error del WebSocket de AISStream" });
  });
  it("Retry-After en segundos o como fecha HTTP", () => {
    expect(parsearRetryAfterMs("5")).toBe(5000);
    expect(parsearRetryAfterMs("Thu, 15 Oct 2026 12:00:10 GMT", Date.parse("2026-10-15T12:00:00Z"))).toBe(10_000);
    expect(parsearRetryAfterMs("basura")).toBe(0);
    expect(parsearRetryAfterMs(null)).toBe(0);
  });
});

describe("marcos y sobres", () => {
  it("decodifica texto, ArrayBuffer, vistas y fragmentos", () => {
    const b = new TextEncoder().encode('{"a":1}');
    expect(decodificarMarcoSync('{"a":1}')).toBe('{"a":1}');
    expect(decodificarMarcoSync(b.buffer)).toBe('{"a":1}');
    expect(decodificarMarcoSync(b.subarray(0, 4))).toBe('{"a"');
    expect(decodificarMarcoSync([b.subarray(0, 4), b.subarray(4)])).toBe('{"a":1}');
    expect(decodificarMarcoSync(42)).toBeNull();
  });
  it("distingue datos, errores y basura", () => {
    expect(parsearMarcoAis("no")).toEqual({ tipo: "malformado" });
    expect(parsearMarcoAis("[]")).toEqual({ tipo: "malformado" });
    expect(parsearMarcoAis('{"error":"Api Key Is Not Valid"}')).toEqual({ tipo: "error", mensaje: "Api Key Is Not Valid" });
    expect(parsearMarcoAis('{"MessageType":"PositionReport"}').tipo).toBe("dato");
  });
  it("un sobre solo cuenta con tipo reconocido, cuerpo y MMSI", () => {
    expect(esSobreAisReconocido(JSON.parse(MARCOS[0]))).toBe(true);
    expect(esSobreAisReconocido({ MessageType: "PositionReport", Message: { PositionReport: {} } })).toBe(false);
    expect(esSobreAisReconocido({ MessageType: "Inventado", MetaData: { MMSI: 123456789 }, Message: { Inventado: {} } })).toBe(false);
  });
  it("tipo de buque AIS: 80–89 tanquero, 70–79 carga", () => {
    expect(claseBuque(80)).toBe("tanquero");
    expect(claseBuque(89)).toBe("tanquero");
    expect(claseBuque(70)).toBe("carga");
    expect(claseBuque(79)).toBe("carga");
    expect(claseBuque(60)).toBe("otro");
    expect(claseBuque("x")).toBeNull();
  });
});

describe("contarBuques · muestra sintética", () => {
  const c = contarBuques(MARCOS);

  it("cuenta buques DISTINTOS por paso y su tipo cuando se conoce", () => {
    expect(c.porPaso.ORMUZ).toEqual({ buques: 3, tanqueros: 1, carga: 1, conTipo: 2 });
    expect(c.porPaso.PANAMA).toEqual({ buques: 1, tanqueros: 1, carga: 0, conTipo: 1 });
    expect(c.porPaso.SUEZ).toEqual({ buques: 0, tanqueros: 0, carga: 0, conTipo: 0 });
  });

  it("descarta sin MMSI, tipos desconocidos y basura; lo de fuera de las cajas no se cuenta", () => {
    expect(c.reconocidos).toBe(9);
    expect(c.descartados).toBe(3);
    expect(Object.values(c.porPaso).reduce((s, p) => s + p.buques, 0)).toBe(4);
  });

  it("las filas solo llevan conteos: ningún MMSI ni nombre", () => {
    const filas = filasConteo(c, new Date("2026-10-15T12:20:40Z"));
    expect(filas).toHaveLength(27);
    expect(filas.find((f) => f.serie_id === "AIS_ORMUZ_BUQUES")).toEqual({
      serie_id: "AIS_ORMUZ_BUQUES",
      valor: "3",
      fecha_dato: "2026-10-15",
      hora_dato: "2026-10-15T12:20:00.000Z",
      url_dato: "https://aisstream.io/",
    });
    const texto = JSON.stringify(filas);
    expect(texto).not.toMatch(/538000001|SINTETICO/);
  });
});

/** Socket falso: guarda lo que se envía y deja disparar eventos. */
function socketFalso() {
  let ev: EventosSocket | null = null;
  const enviados: string[] = [];
  let cerrado = false;
  const abrir: AbrirSocket = (_url, eventos) => {
    ev = eventos;
    return { enviar: (t) => void enviados.push(t), cerrar: () => void (cerrado = true) };
  };
  return { abrir, enviados, eventos: () => ev!, cerrado: () => cerrado };
}

/** Temporizador manual. */
function reloj() {
  const pendientes: { fn: () => void; ms: number; id: number }[] = [];
  let n = 0;
  return {
    temporizador: (fn: () => void, ms: number) => {
      pendientes.push({ fn, ms, id: ++n });
      return n;
    },
    limpiar: (id: unknown) => {
      const i = pendientes.findIndex((p) => p.id === id);
      if (i >= 0) pendientes.splice(i, 1);
    },
    avanzar(ms: number) {
      for (const p of [...pendientes].sort((a, b) => a.ms - b.ms)) if (p.ms <= ms && pendientes.includes(p)) p.fn();
    },
  };
}

describe("tomarMuestraAis", () => {
  it("manda la suscripción al abrir, junta mensajes y cierra a los 40 s", async () => {
    const s = socketFalso();
    const r = reloj();
    const p = tomarMuestraAis({ abrir: s.abrir, suscripcion: { APIKey: "K" }, temporizador: r.temporizador, limpiar: r.limpiar });
    s.eventos().alAbrir();
    expect(JSON.parse(s.enviados[0])).toEqual({ APIKey: "K" });
    s.eventos().alMensaje(MARCOS[0]);
    s.eventos().alMensaje(new TextEncoder().encode(MARCOS[1]));
    r.avanzar(40_000);
    const m = await p;
    expect(m.marcos).toHaveLength(2);
    expect(m.fallo).toBeNull();
    expect(s.cerrado()).toBe(true);
  });

  it("un error de AISStream (clave inválida) corta la muestra y se clasifica", async () => {
    const s = socketFalso();
    const r = reloj();
    const p = tomarMuestraAis({ abrir: s.abrir, suscripcion: {}, temporizador: r.temporizador, limpiar: r.limpiar });
    s.eventos().alAbrir();
    s.eventos().alMensaje('{"error":"Api Key Is Not Valid"}');
    const m = await p;
    expect(m.fallo?.tipo).toBe("auth");
  });

  it("si no abre en 3 s, falla por transporte", async () => {
    const s = socketFalso();
    const r = reloj();
    const p = tomarMuestraAis({ abrir: s.abrir, suscripcion: {}, temporizador: r.temporizador, limpiar: r.limpiar });
    r.avanzar(3_000);
    const m = await p;
    expect(m).toMatchObject({ abierto: false, fallo: { tipo: "transport" } });
  });
});

describe("tarea buques-ais", () => {
  const ahora = () => new Date("2026-10-15T12:20:00Z");

  it("apagada por defecto: parcial «desactivado» sin conectar", async () => {
    let conecto = false;
    const tarea = crearTareaBuquesAis(() => {
      conecto = true;
      throw new Error("no debía conectar");
    });
    const { almacen, observaciones } = almacenMemoria();
    const r = await correrTarea(tarea, almacen, { ahora, obtener: async () => { throw new Error("sin red"); }, entorno: () => undefined });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/desactivado/);
    expect(r.error).toMatch(/Falta AISSTREAM_API_KEY/);
    expect(conecto).toBe(false);
    expect(observaciones).toEqual([]);
  });

  it("activa pero sin clave: tampoco conecta", async () => {
    const tarea = crearTareaBuquesAis(() => {
      throw new Error("no debía conectar");
    });
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tarea, almacen, {
      ahora,
      obtener: async () => { throw new Error("sin red"); },
      entorno: (n) => (n === "GLOBO_AIS_ACTIVO" ? "1" : undefined),
    });
    expect(r).toMatchObject({ estado: "parcial", detalle: { desactivado: true } });
  });

  it("activa y con clave: muestra, cuenta y registra solo conteos", async () => {
    const abrir: AbrirSocket = (_url, ev) => {
      queueMicrotask(() => {
        ev.alAbrir();
        for (const m of MARCOS) ev.alMensaje(m);
      });
      return { enviar: () => {}, cerrar: () => {} };
    };
    const tarea = crearTareaBuquesAis(abrir, 5);
    const { almacen, observaciones } = almacenMemoria();
    const r = await correrTarea(tarea, almacen, {
      ahora,
      obtener: async () => { throw new Error("sin red"); },
      entorno: (n) => ({ GLOBO_AIS_ACTIVO: "1", AISSTREAM_API_KEY: "clave-de-prueba" })[n],
    });
    expect(r.estado).toBe("ok");
    expect(observaciones).toHaveLength(27);
    expect(observaciones.find((o) => o.serie_id === "AIS_ORMUZ_TANQUEROS")?.valor).toBe("1");
    expect(JSON.stringify(r.detalle)).not.toMatch(/538000001|clave-de-prueba/);
  });

  it("sin mensajes reconocibles no registra ceros: error con el motivo", async () => {
    const abrir: AbrirSocket = (_url, ev) => {
      queueMicrotask(() => {
        ev.alAbrir();
        ev.alMensaje('{"error":"Api Key Is Not Valid"}');
      });
      return { enviar: () => {}, cerrar: () => {} };
    };
    const { almacen, observaciones } = almacenMemoria();
    const r = await correrTarea(crearTareaBuquesAis(abrir, 5), almacen, {
      ahora,
      obtener: async () => { throw new Error("sin red"); },
      entorno: (n) => ({ GLOBO_AIS_ACTIVO: "1", AISSTREAM_API_KEY: "k" })[n],
    });
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/rechazó la clave/);
    expect(observaciones).toEqual([]);
  });
});
