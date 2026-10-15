import { describe, expect, it } from "vitest";
import { respuestaHttp, respuestaSintetica } from "../../../../pruebas/apoyo/anthropic-sintetica.ts";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { CAUSA_NO_CONFIRMADA } from "../ia.ts";
import { correrTarea } from "../ingesta.ts";
import { mensajePorque, tareaIaPorque } from "./ia-porque.ts";
import { mensajeResumen, tareaIaResumen } from "./ia-resumen.ts";

const oro = {
  serie_id: "ORO", nombre: "Oro", unidad: "US$/oz", valor: "4312.5", cambio: "98.8", cambio_pct: "2.35",
  fecha_dato: "2026-10-15", hora_dato: null, fuente: "Financial Modeling Prep", categoria: "metal", umbral: "1.5",
};
const titular = { id: 1, titular: "Gold jumps as Fed signals pause", url: "https://e.org/oro", medio: "M", fecha: "2026-10-15T12:00:00Z", pais: null, categoria: "mercado" };
const sinRed = () => Promise.reject(new Error("no"));

describe("ia-porque", () => {
  it("sin titulares guardados: «causa no confirmada» sin gastar una llamada", async () => {
    const { almacen, tablas } = almacenMemoria({
      rpc: (f) => (f === "gasto_ia_mes" ? "0" : f === "ia_candidatos_porque" ? [oro] : []),
    });
    let llamadas = 0;
    const r = await correrTarea(tareaIaPorque, almacen, {
      obtener: sinRed,
      api: async () => {
        llamadas++;
        throw new Error("no");
      },
      entorno: (n) => (n === "ANTHROPIC_API_KEY" ? "k" : undefined),
    });
    expect(r.estado).toBe("ok");
    expect(llamadas).toBe(0);
    expect(tablas.explicaciones).toEqual([
      expect.objectContaining({ serie_id: "ORO", texto: CAUSA_NO_CONFIRMADA, modelo: "sin-llamada", costo_usd: "0", confirmada: false }),
    ]);
  });

  it("error HTTP: no guarda nada y queda parcial (se reintenta en la próxima corrida)", async () => {
    const { almacen, tablas } = almacenMemoria({
      rpc: (f) => (f === "gasto_ia_mes" ? "0" : f === "ia_candidatos_porque" ? [oro] : [titular]),
    });
    const r = await correrTarea(tareaIaPorque, almacen, {
      obtener: sinRed,
      api: () => Promise.reject(new Error("HTTP 529 en https://api.anthropic.com/v1/messages")),
      entorno: (n) => (n === "ANTHROPIC_API_KEY" ? "k" : undefined),
    });
    expect(r.estado).toBe("parcial");
    expect(tablas.explicaciones).toBeUndefined();
  });

  it("el mensaje lleva solo datos guardados y los enlaces de los titulares", () => {
    const m = mensajePorque(oro, [titular]);
    expect(m).toContain("valor 4312.5 US$/oz · cambio 98.8 · cambio % 2.35 · fecha 2026-10-15 · fuente Financial Modeling Prep");
    expect(m).toContain("— https://e.org/oro");
  });
});

describe("ia-resumen", () => {
  it("sin ANTHROPIC_API_KEY: parcial sin llamar", async () => {
    const { almacen, llamadasRpc } = almacenMemoria();
    const r = await correrTarea(tareaIaResumen, almacen, { obtener: sinRed, api: sinRed, entorno: () => undefined });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(llamadasRpc).toEqual([]);
  });

  it("salida inválida: guarda «no confirmado» con su costo y la pantalla cae a titulares", async () => {
    const { almacen, tablas } = almacenMemoria({
      rpc: (f, a) => (f === "gasto_ia_mes" ? "0" : f === "ia_observaciones_dia" ? [oro] : (a?.p_categorias as string[]).includes("guerra") ? [] : [titular]),
    });
    const r = await correrTarea(tareaIaResumen, almacen, {
      obtener: sinRed,
      api: async (url) => respuestaHttp(url, respuestaSintetica('{"items":[{"titulo":"x"}]}', { model: "claude-sonnet-5-5" })),
      entorno: (n) => (n === "ANTHROPIC_API_KEY" ? "k" : undefined),
    });
    expect(r.estado).toBe("parcial");
    expect(tablas.explicaciones).toEqual([expect.objectContaining({ tipo: "cinco_del_dia", confirmada: false, costo_usd: "0.003900" })]);
    expect(r.error).toMatch(/guerras: no hay titulares/);
  });

  it("el mensaje incluye las observaciones del día y los titulares", () => {
    const m = mensajeResumen([oro], [titular]);
    expect(m.split("\n")[0]).toBe("DATOS (último dato confirmado de cada serie):");
    expect(m).toContain("Gold jumps as Fed signals pause");
  });
});
