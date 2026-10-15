// Tarea «alertas» (cada 5 min): evalúa las reglas en SQL (mercado.evaluar_alertas, solo datos
// confirmados) y envía por correo las alertas no enviadas con Resend.
// Documentación de Resend: https://resend.com/docs/api-reference/emails/send-email
//
// El correo tiene tres líneas: el dato con fuente y hora · el umbral cruzado · qué significa para Mena.
// La tercera línea es una plantilla fija por tipo de activo: sin IA y sin recomendaciones.

import Big from "big.js";
import type { Tarea } from "../ingesta.ts";

export const URL_RESEND = "https://api.resend.com/emails";
export const REMITENTE = "Strategya <onboarding@resend.dev>";
const ZONA_RD = "America/Santo_Domingo";

/** Lo que devuelve mercado.alertas_pendientes por cada alerta. */
export interface AlertaPendiente {
  id: number | string;
  serie_id: string;
  fecha: string;
  valor: string;
  mensaje: string;
  tipo: string;
  umbral: string | null;
  nombre: string;
  nombre_corto: string;
  unidad: string;
  categoria: string;
  fuente: string | null;
  fuente_url: string | null;
  fecha_dato: string | null;
  hora_dato: string | null;
  recogido_en: string | null;
  url_dato: string | null;
  cambio_pct: string | null;
  cambio: string | null;
}

// ───────────────────────────── Formato (sin float) ─────────────────────────────

function conMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "4312.5" → "4,312.50"; conserva hasta 4 decimales de la fuente, mínimo 2. */
export function cifraAlerta(texto: string): string {
  const dec = Math.min(Math.max((texto.split(".")[1] ?? "").length, 2), 4);
  const fijo = new Big(texto).toFixed(dec, Big.roundHalfUp);
  const neg = fijo.startsWith("-");
  const [e, f] = (neg ? fijo.slice(1) : fijo).split(".");
  return `${neg ? "−" : ""}${conMiles(e)}${f ? `.${f}` : ""}`;
}

export function pctConSigno(texto: string): string {
  const fijo = new Big(texto).toFixed(2, Big.roundHalfUp);
  const n = new Big(fijo);
  const cuerpo = n.abs().toFixed(2);
  return `${n.gt(0) ? "+" : n.lt(0) ? "−" : ""}${cuerpo} %`;
}

function horaRD(iso: string): string {
  return new Intl.DateTimeFormat("es-DO", { timeZone: ZONA_RD, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat("es-DO", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${fecha}T00:00:00Z`))
    .replace(/ de /g, " ")
    .replace(".", "");
}

/** «4,312.50 US$/oz (+2.35 % en el día)» o «5.50 %». */
export function datoCorto(a: Pick<AlertaPendiente, "valor" | "unidad" | "cambio_pct">): string {
  const unidad = a.unidad === "%" ? " %" : ` ${a.unidad}`;
  const base = `${cifraAlerta(a.valor)}${unidad}`;
  return a.cambio_pct ? `${base} (${pctConSigno(a.cambio_pct)} en el día)` : base;
}

// ───────────────────────────── Qué significa para Mena ─────────────────────────────

const POR_SERIE: Readonly<Record<string, string>> = {
  USDDOP_VENTA:
    "el dólar del BCRD fija lo que cuestan en pesos las compras, deudas y ahorros en US$; un cambio así mueve el valor en RD$ de todo lo que está en dólares.",
  USDDOP_COMPRA:
    "el dólar del BCRD fija lo que cuestan en pesos las compras, deudas y ahorros en US$; un cambio así mueve el valor en RD$ de todo lo que está en dólares.",
  TPM_BCRD:
    "la tasa del BCRD es la referencia del crédito y de los depósitos en pesos: los bancos suelen ajustar sus tasas activas y pasivas después de un cambio.",
  TASA_FED_SUP:
    "la tasa de la Fed es la referencia del dinero en dólares: mueve los rendimientos en US$, el dólar y el costo de financiamiento de RD en el exterior.",
  TASA_FED_INF:
    "la tasa de la Fed es la referencia del dinero en dólares: mueve los rendimientos en US$, el dólar y el costo de financiamiento de RD en el exterior.",
  UST_10A:
    "el bono a 10 años es la referencia del costo de la deuda en dólares, incluida la de los bonos soberanos dominicanos.",
  BRENT:
    "RD importa el petróleo que consume: el Brent influye en los precios de combustibles que fija el MICM cada semana y en la factura petrolera del país.",
  COBRE_CPER:
    "el cobre se sigue con el ETF CPER (no hay cotización directa del metal); su movimiento suele reflejar expectativas sobre la industria y la economía mundial.",
};

const POR_CATEGORIA: Readonly<Record<string, string>> = {
  metal:
    "los metales se cotizan en US$: el movimiento cambia el valor en RD$ de cualquier exposición a metales y suele reflejar cambios en la demanda de refugio o en el dólar.",
  energia:
    "RD importa sus combustibles: los precios de la energía pasan a los combustibles locales y a la inflación.",
  indice:
    "es el termómetro del mercado accionario: un movimiento grande suele acompañar cambios en las expectativas de tasas o de crecimiento.",
  divisa: "un movimiento así en las monedas cambia el valor relativo del dólar frente al resto del mundo.",
  tasa: "un cambio de tasas mueve el costo del dinero y el rendimiento de los instrumentos de renta fija.",
  rd: "es un dato de la economía dominicana que afecta precios, crédito o el valor del peso.",
  cripto: "las criptomonedas son muy volátiles: el movimiento cambia el valor en RD$ de cualquier exposición a ellas.",
};

export function significadoParaMena(serieId: string, categoria: string): string {
  return POR_SERIE[serieId] ?? POR_CATEGORIA[categoria] ?? "es un dato que Strategya sigue de cerca.";
}

// ───────────────────────────── Correo ─────────────────────────────

export interface Correo {
  asunto: string;
  texto: string;
}

export function armarCorreo(a: AlertaPendiente): Correo {
  const fuente = a.fuente ? `${a.fuente}${a.url_dato || a.fuente_url ? ` (${a.url_dato ?? a.fuente_url})` : ""}` : "fuente sin registrar";
  const cuando = a.hora_dato
    ? `dato de las ${horaRD(a.hora_dato)} (hora RD) del ${fechaLarga(a.fecha_dato ?? a.fecha)}`
    : `dato del ${fechaLarga(a.fecha_dato ?? a.fecha)}${a.recogido_en ? `, verificado a las ${horaRD(a.recogido_en)} (hora RD)` : ""}`;
  const lineas = [
    `${a.nombre}: ${datoCorto(a)} · Fuente: ${fuente} · ${cuando}.`,
    `Umbral cruzado: ${a.mensaje}.`,
    `Qué significa para Mena: ${significadoParaMena(a.serie_id, a.categoria)} (Información, no asesoría de inversión.)`,
  ];
  return { asunto: `ALERTA · ${a.nombre_corto} · ${datoCorto(a)}`, texto: lineas.join("\n") };
}

// ───────────────────────────── Tarea ─────────────────────────────

export const tareaAlertas: Tarea = {
  nombre: "alertas",
  fuenteId: "resend",
  async ejecutar(ctx) {
    const ahora = ctx.ahora.toISOString();
    const nuevas = (await ctx.rpc<unknown[] | null>("evaluar_alertas", { p_ahora: ahora })) ?? [];
    const pendientes = (await ctx.rpc<AlertaPendiente[] | null>("alertas_pendientes", { p_ahora: ahora })) ?? [];
    const detalle: Record<string, unknown> = { nuevas: nuevas.length, pendientes: pendientes.length, enviadas: 0 };

    const clave = ctx.entorno("RESEND_API_KEY")?.trim();
    const destino = ctx.entorno("ALERTAS_EMAIL_DESTINO")?.trim();
    if (!clave) {
      return { parcial: true, advertencias: ["Falta RESEND_API_KEY: las alertas se ven solo en pantalla"], detalle };
    }
    if (!destino) {
      return { parcial: true, advertencias: ["Falta ALERTAS_EMAIL_DESTINO: las alertas se ven solo en pantalla"], detalle };
    }

    const advertencias: string[] = [];
    let enviadas = 0;
    for (const a of pendientes) {
      const correo = armarCorreo(a);
      try {
        await ctx.api(URL_RESEND, {
          metodo: "POST",
          encabezados: {
            Authorization: `Bearer ${clave}`,
            // Si un reintento de la tarea repite el envío, Resend no manda el correo dos veces.
            "Idempotency-Key": `strategya-alerta-${a.id}`,
          },
          cuerpo: { from: REMITENTE, to: [destino], subject: correo.asunto, text: correo.texto },
        });
        await ctx.rpc("marcar_alerta_enviada", { p_id: a.id, p_canal: "correo" });
        enviadas++;
      } catch (e) {
        advertencias.push(`Alerta ${a.id} (${a.serie_id}): ${(e as Error).message}`);
      }
    }
    detalle.enviadas = enviadas;
    return { parcial: advertencias.length > 0, advertencias, detalle };
  },
};
