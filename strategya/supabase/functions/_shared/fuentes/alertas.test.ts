import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import type { OpcionesApi } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import { type AlertaPendiente, armarCorreo, cifraAlerta, datoCorto, pctConSigno, tareaAlertas, URL_RESEND } from "./alertas.ts";

const oro: AlertaPendiente = {
  id: 7,
  serie_id: "ORO",
  fecha: "2026-10-15",
  valor: "4312.5",
  mensaje: "cambio del día +2.35 % (umbral ±2 %)",
  tipo: "cambio_pct_dia",
  umbral: "2",
  nombre: "Oro",
  nombre_corto: "Oro",
  unidad: "US$/oz",
  categoria: "metal",
  fuente: "Financial Modeling Prep",
  fuente_url: "https://site.financialmodelingprep.com/",
  fecha_dato: "2026-10-15",
  hora_dato: "2026-10-15T18:15:00Z",
  recogido_en: "2026-10-15T18:16:00Z",
  url_dato: null,
  cambio_pct: "2.3456",
  cambio: "98.8",
};

describe("formato del correo", () => {
  it("cifras exactas con miles y signo", () => {
    expect(cifraAlerta("4312.5")).toBe("4,312.50");
    expect(cifraAlerta("63.1234567")).toBe("63.1235");
    expect(pctConSigno("-0.512")).toBe("−0.51 %");
    expect(datoCorto({ valor: "5.5", unidad: "%", cambio_pct: null })).toBe("5.50 %");
  });

  it("asunto y tres líneas: dato con fuente y hora · umbral · qué significa (sin IA)", () => {
    const c = armarCorreo(oro);
    expect(c.asunto).toBe("ALERTA · Oro · 4,312.50 US$/oz (+2.35 % en el día)");
    const lineas = c.texto.split("\n");
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toMatch(/^Oro: 4,312\.50 US\$\/oz \(\+2\.35 % en el día\) · Fuente: Financial Modeling Prep \(https:\/\/site\.financialmodelingprep\.com\/\) · dato de las 2:15/);
    expect(lineas[0]).toContain("(hora RD) del 15 oct 2026");
    expect(lineas[1]).toBe("Umbral cruzado: cambio del día +2.35 % (umbral ±2 %).");
    expect(lineas[2]).toMatch(/^Qué significa para Mena: los metales se cotizan en US\$/);
    expect(c.texto).not.toMatch(/\b(compre|venda)\b/i);
  });

  it("plantilla por activo: dólar del BCRD", () => {
    const c = armarCorreo({ ...oro, serie_id: "USDDOP_VENTA", nombre: "Dólar BCRD · venta", unidad: "RD$ por US$", categoria: "rd", hora_dato: null });
    expect(c.texto.split("\n")[2]).toMatch(/dólar del BCRD/);
    expect(c.texto.split("\n")[0]).toMatch(/dato del 15 oct 2026, verificado a las/);
  });
});

describe("tarea alertas", () => {
  const rpc = (funcion: string) => {
    if (funcion === "evaluar_alertas") return [{ id: 7 }];
    if (funcion === "alertas_pendientes") return [oro];
    return true;
  };

  it("sin RESEND_API_KEY: evalúa, no llama a nada y queda parcial con aviso", async () => {
    const { almacen, llamadasRpc } = almacenMemoria({ rpc });
    let llamadas = 0;
    const r = await correrTarea(tareaAlertas, almacen, {
      obtener: async () => Promise.reject(new Error("no")),
      api: async () => {
        llamadas++;
        throw new Error("no debió llamar");
      },
      entorno: () => undefined,
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/Falta RESEND_API_KEY/);
    expect(llamadas).toBe(0);
    expect(llamadasRpc.map((l) => l.funcion)).toEqual(["evaluar_alertas", "alertas_pendientes"]);
  });

  it("con clave: envía por Resend con clave de idempotencia y marca enviada", async () => {
    const { almacen, llamadasRpc } = almacenMemoria({ rpc });
    const pedidos: { url: string; op?: OpcionesApi }[] = [];
    const entorno: Record<string, string> = { RESEND_API_KEY: "re_prueba", ALERTAS_EMAIL_DESTINO: "destino@ejemplo.do" };
    const r = await correrTarea(tareaAlertas, almacen, {
      obtener: async () => Promise.reject(new Error("no")),
      api: async (url, op) => {
        pedidos.push({ url, op });
        return { url, status: 200, tipo: "application/json", texto: '{"id":"x"}', intentos: 1 };
      },
      entorno: (n) => entorno[n],
    });
    expect(r.estado).toBe("ok");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toBe(URL_RESEND);
    expect(pedidos[0].op?.encabezados).toMatchObject({ Authorization: "Bearer re_prueba", "Idempotency-Key": "strategya-alerta-7" });
    expect(pedidos[0].op?.cuerpo).toMatchObject({ from: "Strategya <onboarding@resend.dev>", to: ["destino@ejemplo.do"] });
    expect(llamadasRpc.at(-1)).toEqual({ funcion: "marcar_alerta_enviada", args: { p_id: 7, p_canal: "correo" } });
    expect(r.detalle).toMatchObject({ nuevas: 1, pendientes: 1, enviadas: 1 });
  });

  it("si Resend falla, no marca enviada y queda parcial", async () => {
    const { almacen, llamadasRpc } = almacenMemoria({ rpc });
    const r = await correrTarea(tareaAlertas, almacen, {
      obtener: async () => Promise.reject(new Error("no")),
      api: async () => {
        throw new Error("HTTP 422 en https://api.resend.com/emails");
      },
      entorno: (n) => ({ RESEND_API_KEY: "k", ALERTAS_EMAIL_DESTINO: "d@e.do" })[n],
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/Alerta 7 \(ORO\): HTTP 422/);
    expect(llamadasRpc.some((l) => l.funcion === "marcar_alerta_enviada")).toBe(false);
  });
});
