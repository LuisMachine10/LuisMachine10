import { describe, expect, it } from "vitest";
import { cuandoEs, frasesDelDia, type UltimaCruda } from "./resumen-dia";

const u = (serie_id: string, valor: string, fecha_dato: string, cambio_pct: string | null = null, cambio: string | null = null): [string, UltimaCruda] => [
  serie_id,
  { serie_id, valor, fecha_dato, cambio_pct, cambio },
];

describe("cuandoEs", () => {
  it("hoy, ayer o la fecha", () => {
    expect(cuandoEs("2026-10-20", "2026-10-20")).toBe("hoy");
    expect(cuandoEs("2026-10-19", "2026-10-20")).toBe("ayer");
    expect(cuandoEs("2026-10-16", "2026-10-20")).toBe("el 16 oct");
  });
});

describe("frasesDelDia", () => {
  it("frases con el valor, la dirección y el día del dato", () => {
    const f = frasesDelDia(
      new Map([
        u("IDX_SPX", "7690.73", "2026-10-19", "0.4085"),
        u("USDDOP_VENTA", "61.8322", "2026-10-16", "0.097941"),
        u("BRENT", "126.55", "2026-10-14"),
        u("UST_10A", "5.15", "2026-10-19", "1.178782", "0.06"),
      ]),
      "2026-10-20",
    );
    expect(f).toEqual([
      "La bolsa de EE. UU. (S&P 500) subió 0.4 % ayer y quedó en 7,690.73 puntos.",
      "El dólar en RD está en RD$61.83 para la venta según el Banco Central (dato del 16 oct); subió 0.1 %.",
      "El petróleo Brent está en US$126.55 el barril (dato del 14 oct). Influye en los combustibles en RD.",
      "La tasa del bono de EE. UU. a 10 años está en 5.15 % (dato de ayer); subió 6 centésimas. Guía préstamos e hipotecas.",
    ]);
  });

  it("sin cifras no hay frases (nada se inventa)", () => {
    expect(frasesDelDia(new Map(), "2026-10-20")).toEqual([]);
  });

  it("caída y movimiento casi nulo", () => {
    expect(frasesDelDia(new Map([u("IDX_SPX", "7659.42", "2026-10-20", "-1.093")]), "2026-10-20")[0]).toBe(
      "La bolsa de EE. UU. (S&P 500) bajó 1.1 % hoy y quedó en 7,659.42 puntos.",
    );
    expect(frasesDelDia(new Map([u("IDX_SPX", "7659.42", "2026-10-20", "0.01")]), "2026-10-20")[0]).toBe(
      "La bolsa de EE. UU. (S&P 500) se mantuvo casi igual hoy, en 7,659.42 puntos.",
    );
  });
});
