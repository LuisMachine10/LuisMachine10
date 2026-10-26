// Manual, sección A · monedas: el € se convierte con el cruce EUR/USD del BCE × US$ de venta del BCRD de la MISMA
// fecha, rotulado con sus dos fuentes; si falta alguna, «no confirmado» y no se suma. Cifras inventadas.
import { describe, expect, it } from "vitest";
import { activosEjemplo, contextoEjemplo, parametrosEjemplo } from "../capital/apoyo-pruebas";
import { armarFx, cruceEurDop, posicion, valorDOP } from "../capital/posicion";
import type { Activo } from "../capital/tipos";

const usd = [
  { valor: "62.00", fecha_dato: "2026-10-13", recogido_en: null, url_dato: "https://bcrd/13" },
  { valor: "62.50", fecha_dato: "2026-10-14", recogido_en: null, url_dato: "https://bcrd/14" },
];
const eur = [
  { valor: "1.1200", fecha_dato: "2026-10-13", recogido_en: "2026-10-13T13:20:00Z", url_dato: "https://bce" },
  { valor: "1.1300", fecha_dato: "2026-10-15", recogido_en: "2026-10-15T13:20:00Z", url_dato: "https://bce" },
];
const euros: Activo = { id: "e1", clase: "efectivo", nombre: "Euros", inst: "", simbolo: null, moneda: "EUR", cantidad: "100", precio: "1", tasa: "0", venc: null, tipoRF: null, tipo: "efectivo" };

describe("€ por cruce BCE × BCRD de la misma fecha", () => {
  it("usa la fecha más reciente en que hay LAS DOS tasas (no mezcla días) y guarda las dos fuentes", () => {
    const f = cruceEurDop(usd, eur);
    // El 15 hay BCE pero no BCRD; el 14 hay BCRD pero no BCE: se usa el 13 (1.12 × 62.00).
    expect(f).toMatchObject({ origen: "cruce", fecha: "2026-10-13", cruce: { eurusd: "1.1200", usddop: "62.00", urlBce: "https://bce", urlBcrd: "https://bcrd/13" } });
    expect(f.valor!.toFixed()).toBe("69.44");
  });

  it("si falta alguna de las dos: «no confirmado» (sin valor) y lo que está en € no se suma", () => {
    expect(cruceEurDop(usd, []).valor).toBeNull();
    expect(cruceEurDop([], eur).valor).toBeNull();
    const p = parametrosEjemplo();
    const { fx } = armarFx(usd, p, []);
    const ctx = { ...contextoEjemplo({ activos: [...activosEjemplo(), euros] }), mercado: { ...contextoEjemplo().mercado, fx } };
    expect(valorDOP(ctx, euros)).toBeNull();
    expect(posicion(ctx).sinValorar.map((a) => a.id)).toContain("e1");
  });

  it("con el cruce, el efectivo en € se suma en RD$", () => {
    const { fx } = armarFx(usd, parametrosEjemplo(), eur);
    const ctx = { ...contextoEjemplo({ activos: [euros] }), mercado: { ...contextoEjemplo().mercado, fx } };
    expect(valorDOP(ctx, euros)!.toFixed()).toBe("6944");
  });

  it("el € escrito a mano en Ajustes ya no se usa (no es una tasa oficial de la fecha)", () => {
    expect(armarFx(usd, { ...parametrosEjemplo(), fx: { USD: null, EUR: "70" } }, []).fx.EUR.valor).toBeNull();
  });
});
