// Tareas del Boletín con un contexto falso: idempotencia (una edición por tipo y día), envío por Resend,
// falla de Resend guardada con su error, preferencias de Ajustes y destino que nunca sale del código.
import { describe, expect, it } from "vitest";
import { datosEjemplo } from "../../../../pruebas/apoyo/boletin-ejemplo.ts";
import type { DatosBoletin } from "../boletin/tipos.ts";
import type { ContextoTarea } from "../ingesta.ts";
import { correrEdicion, tareaBoletinAm, tareaBoletinPrueba, tareaBoletinTasas } from "./boletin.ts";

interface Edicion {
  id: number;
  tipo: string;
  fecha: string;
  prueba: boolean;
  estado: string;
  error: string | null;
  asunto?: string;
  html?: string;
  texto?: string;
}

/** Imita mercado.boletin_reservar / guardar / marcar con la misma regla de la migración. */
function contexto(op: { ahora: string; datos?: Partial<DatosBoletin>; entorno?: Record<string, string>; resendFalla?: boolean; dueno?: string | null }) {
  const ediciones: Edicion[] = [];
  const envios: { cuerpo: Record<string, unknown>; encabezados: Record<string, string> }[] = [];
  const pedidos = [{ id: 1, tipo: "am" }];
  const atendidos: unknown[] = [];
  let siguiente = 1;
  const ctx: ContextoTarea = {
    ahora: new Date(op.ahora),
    obtener: () => Promise.reject(new Error("sin red")),
    entorno: (n) => (op.entorno ?? { RESEND_API_KEY: "re_prueba" })[n],
    registrar: () => Promise.resolve({ recibidas: 0, insertadas: 0, actualizadas: 0 }),
    guardar: () => Promise.resolve(0),
    async api(_url, o) {
      if (op.resendFalla) throw new Error("HTTP 500 en https://api.resend.com/emails");
      envios.push({ cuerpo: o?.cuerpo as Record<string, unknown>, encabezados: o?.encabezados ?? {} });
      return { url: _url, status: 200, tipo: "application/json", texto: '{"id":"re_123"}', intentos: 1 };
    },
    async rpc<T>(f: string, a: Record<string, unknown> = {}): Promise<T> {
      switch (f) {
        case "boletin_datos":
          return { ...datosEjemplo(a.p_tipo as "am", op.ahora), ...op.datos } as T;
        case "boletin_reservar": {
          if (a.p_prueba) {
            ediciones.push({ id: siguiente, tipo: String(a.p_tipo), fecha: String(a.p_fecha), prueba: true, estado: "armando", error: null });
            return siguiente++ as T;
          }
          const ya = ediciones.find((e) => !e.prueba && e.tipo === a.p_tipo && e.fecha === a.p_fecha);
          if (!ya) {
            ediciones.push({ id: siguiente, tipo: String(a.p_tipo), fecha: String(a.p_fecha), prueba: false, estado: "armando", error: null });
            return siguiente++ as T;
          }
          if (ya.estado === "error") {
            ya.estado = "armando";
            return ya.id as T;
          }
          return null as T;
        }
        case "boletin_guardar": {
          const e = ediciones.find((x) => x.id === a.p_id)!;
          Object.assign(e, { estado: "lista", asunto: a.p_asunto, html: a.p_html, texto: a.p_texto });
          return null as T;
        }
        case "boletin_marcar": {
          const e = ediciones.find((x) => x.id === a.p_id)!;
          Object.assign(e, { estado: a.p_estado, error: a.p_error ?? null });
          return null as T;
        }
        case "boletin_destino":
          return (op.dueno === undefined ? "dueno@ejemplo.do" : op.dueno) as T;
        case "boletin_pedidos_pendientes":
          return pedidos.splice(0) as T;
        case "boletin_atender_pedido":
          atendidos.push(a);
          return null as T;
        default:
          throw new Error(`rpc inesperada: ${f}`);
      }
    },
  };
  return { ctx, ediciones, envios, atendidos };
}

const LUNES_AM = "2026-10-26T11:35:00+00:00";

describe("tareas del Boletín", () => {
  it("arma, guarda y envía la AM una sola vez; la segunda pasada no repite", async () => {
    const { ctx, ediciones, envios } = contexto({ ahora: LUNES_AM });
    const r1 = await tareaBoletinAm.ejecutar(ctx);
    expect(r1.parcial).toBeFalsy();
    expect(envios).toHaveLength(1);
    expect(envios[0].encabezados["Idempotency-Key"]).toBe("strategya-boletin-am-2026-10-26");
    expect(envios[0].cuerpo).toMatchObject({ to: ["dueno@ejemplo.do"], subject: "Bitácora Financiera · AM · 26 oct · Plata −3.10 %" });
    expect(String(envios[0].cuerpo.html)).toContain("<!doctype html>");
    expect(String(envios[0].cuerpo.text)).toContain("Fuentes:");
    expect(envios[0].cuerpo).not.toHaveProperty("attachments");
    expect(ediciones[0]).toMatchObject({ estado: "enviada", error: null });

    const r2 = await tareaBoletinAm.ejecutar(ctx);
    expect(r2.detalle?.omitida).toMatch(/no se repite/);
    expect(envios).toHaveLength(1);
    expect(ediciones).toHaveLength(1);
  });

  it("si Resend falla, la edición queda guardada con el error; la segunda pasada la reintenta", async () => {
    const c = contexto({ ahora: LUNES_AM, resendFalla: true });
    const r = await tareaBoletinAm.ejecutar(c.ctx);
    expect(r.parcial).toBe(true);
    expect(c.ediciones[0]).toMatchObject({ estado: "error" });
    expect(c.ediciones[0].error).toMatch(/Resend: HTTP 500/);
    expect(c.ediciones[0].html).toContain("Bitácora Financiera · AM");
    // Reintento con Resend ya respondiendo.
    const ok = contexto({ ahora: LUNES_AM });
    const reintento = { ...ok.ctx, rpc: c.ctx.rpc, api: ok.ctx.api };
    await tareaBoletinAm.ejecutar(reintento);
    expect(ok.envios).toHaveLength(1);
    expect(c.ediciones).toHaveLength(1);
    expect(c.ediciones[0].estado).toBe("enviada");
  });

  it("sin RESEND_API_KEY la guarda como «sin envío» y lo dice", async () => {
    const { ctx, ediciones, envios } = contexto({ ahora: LUNES_AM, entorno: {} });
    const r = await tareaBoletinAm.ejecutar(ctx);
    expect(r.parcial).toBe(true);
    expect(r.advertencias?.[0]).toMatch(/Falta RESEND_API_KEY/);
    expect(envios).toHaveLength(0);
    expect(ediciones[0].estado).toBe("sin_envio");
  });

  it("el destino sale de BOLETIN_PARA o del dueño en la base, nunca del código", async () => {
    const a = contexto({ ahora: LUNES_AM, entorno: { RESEND_API_KEY: "k", BOLETIN_PARA: "otro@ejemplo.do" } });
    await tareaBoletinAm.ejecutar(a.ctx);
    expect(a.envios[0].cuerpo.to).toEqual(["otro@ejemplo.do"]);
    const b = contexto({ ahora: LUNES_AM, dueno: null, entorno: { RESEND_API_KEY: "k" } });
    const r = await tareaBoletinAm.ejecutar(b.ctx);
    expect(r.advertencias?.[0]).toMatch(/Sin destino/);
    expect(b.ediciones[0].estado).toBe("sin_envio");
  });

  it("respeta Ajustes: una edición desactivada no se arma", async () => {
    const { ctx, ediciones } = contexto({ ahora: LUNES_AM, datos: { preferencias: { am: false } } });
    const r = await tareaBoletinAm.ejecutar(ctx);
    expect(r.detalle?.omitida).toBe("Desactivada en Ajustes");
    expect(ediciones).toHaveLength(0);
  });

  it("no sale en un día que no le toca (Tasas solo los lunes)", async () => {
    const { ctx, ediciones } = contexto({ ahora: "2026-10-27T10:40:00+00:00" });
    const r = await tareaBoletinTasas.ejecutar(ctx);
    expect(r.detalle?.omitida).toMatch(/no sale hoy/);
    expect(ediciones).toHaveLength(0);
  });

  it("«Enviar prueba» crea una edición aparte (marcada como prueba) y no bloquea la del día", async () => {
    const { ctx, ediciones, envios, atendidos } = contexto({ ahora: LUNES_AM });
    await tareaBoletinPrueba.ejecutar(ctx);
    expect(ediciones[0]).toMatchObject({ prueba: true, estado: "enviada" });
    expect(envios[0].cuerpo.subject).toMatch(/^\[Prueba\] /);
    expect(envios[0].encabezados["Idempotency-Key"]).toBe("strategya-boletin-am-prueba-1");
    expect(atendidos).toHaveLength(1);
    const r = await correrEdicion(ctx, { tipo: "am", prueba: false });
    expect(r.id).not.toBeNull();
    expect(envios).toHaveLength(2);
  });
});
