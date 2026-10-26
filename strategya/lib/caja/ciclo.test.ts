import { describe, expect, it } from "vitest";
import {
  avisoLimite,
  cicloDe,
  cicloDeFormulario,
  cicloVigente,
  diaEnMes,
  fechasDelCiclo,
  lineaCiclo,
  marcasEntre,
  notaCiclo,
  proximoCorte,
} from "./ciclo";

const VISA = { diaCorte: 15, diasParaPagar: 28, diaPago: 30 };

describe("ciclo de la tarjeta", () => {
  it("el ejemplo de Mena: corte 15 nov 2026, 28 días → límite 13 dic; quiere pagar el 30 → 30 nov, le sobran 13 días", () => {
    const f = fechasDelCiclo("2026-11-15", VISA);
    expect(f).toEqual({ corte: "2026-11-15", limite: "2026-12-13", pago: "2026-11-30", fueraDeRango: false, sugerido: "2026-11-30", sobran: 13 });
    expect(lineaCiclo(f, "2026-11-01")).toBe("Corte 15 nov · pagas el 30 nov · fecha límite 13 dic");
    expect(notaCiclo(f, VISA)).toBe("Te sobran 13 días antes de la fecha límite.");
  });

  it("próximo corte: el mismo mes si no ha pasado (hoy cuenta), si no el siguiente", () => {
    expect(proximoCorte("2026-10-26", 15)).toBe("2026-11-15");
    expect(proximoCorte("2026-11-15", 15)).toBe("2026-11-15");
    expect(proximoCorte("2026-11-03", 15)).toBe("2026-11-15");
  });

  it("corte 31: en meses de 30 y de 28/29 días corta el último día", () => {
    expect(diaEnMes("2026-11", 31)).toBe("2026-11-30");
    expect(diaEnMes("2026-02", 31)).toBe("2026-02-28");
    expect(diaEnMes("2028-02", 31)).toBe("2028-02-29"); // bisiesto
    expect(diaEnMes("2026-12", 31)).toBe("2026-12-31");
    expect(proximoCorte("2026-11-10", 31)).toBe("2026-11-30");
    expect(proximoCorte("2026-12-31", 31)).toBe("2026-12-31");
    expect(proximoCorte("2027-01-31", 31)).toBe("2027-01-31");
    expect(proximoCorte("2027-02-01", 31)).toBe("2027-02-28");
  });

  it("febrero (28 días): corte 30 → 28 feb; límite = corte + N días naturales", () => {
    const f = fechasDelCiclo(diaEnMes("2027-02", 30), { diaCorte: 30, diasParaPagar: 20, diaPago: 10 });
    expect(f.corte).toBe("2027-02-28");
    expect(f.limite).toBe("2027-03-20");
    expect(f.pago).toBe("2027-03-10");
    expect(f.sobran).toBe(10);
  });

  it("día preferido 31 en un mes de 30 días: paga el último día de ese mes", () => {
    const f = fechasDelCiclo("2026-11-05", { diaCorte: 5, diasParaPagar: 30, diaPago: 31 });
    expect(f.limite).toBe("2026-12-05");
    expect(f.pago).toBe("2026-11-30");
  });

  it("cruce de año: corte 15 dic 2026 + 28 días → límite 12 ene 2027; paga el 5 ene 2027", () => {
    const f = fechasDelCiclo("2026-12-15", { diaCorte: 15, diasParaPagar: 28, diaPago: 5 });
    expect(f).toMatchObject({ limite: "2027-01-12", pago: "2027-01-05", sobran: 7 });
    expect(lineaCiclo(f, "2026-12-01")).toBe("Corte 15 dic · pagas el 5 ene · fecha límite 12 ene");
  });

  it("día preferido fuera de rango: avisa y sugiere el último día posible (la fecha límite)", () => {
    const c = { diaCorte: 15, diasParaPagar: 10, diaPago: 30 };
    const f = fechasDelCiclo("2026-11-15", c);
    expect(f).toEqual({ corte: "2026-11-15", limite: "2026-11-25", pago: null, fueraDeRango: true, sugerido: "2026-11-25", sobran: null });
    expect(notaCiclo(f, c)).toBe("Tu día de pago (el 30) cae después de la fecha límite: lo último posible es el 25 nov.");
    expect(lineaCiclo(f, "2026-11-01")).toBe("Corte 15 nov · paga a más tardar el 25 nov · fecha límite 25 nov");
    // El mismo día del corte no cuenta (el rango es corte exclusivo, límite inclusivo).
    expect(fechasDelCiclo("2026-11-15", { diaCorte: 15, diasParaPagar: 10, diaPago: 15 }).fueraDeRango).toBe(true);
    // El día de la fecha límite sí cuenta.
    expect(fechasDelCiclo("2026-11-15", { diaCorte: 15, diasParaPagar: 10, diaPago: 25 })).toMatchObject({ pago: "2026-11-25", sobran: 0 });
  });

  it("sin día preferido: sin fecha elegida, se muestra la límite", () => {
    const f = fechasDelCiclo("2026-11-15", { diaCorte: 15, diasParaPagar: 28, diaPago: null });
    expect(f).toMatchObject({ pago: null, fueraDeRango: false, sugerido: "2026-12-13" });
    expect(lineaCiclo(f, "2026-11-20")).toBe("Cortó el 15 nov · fecha límite 13 dic");
  });

  it("ciclo vigente: el que ya cortó y aún no vence; si no, el del próximo corte", () => {
    expect(cicloVigente("2026-10-26", VISA)).toMatchObject({ corte: "2026-10-15", limite: "2026-11-12", pago: "2026-10-30" });
    expect(cicloVigente("2026-11-12", VISA).corte).toBe("2026-10-15"); // el día límite todavía cuenta
    expect(cicloVigente("2026-11-13", VISA).corte).toBe("2026-11-15"); // ya venció: el próximo
    expect(cicloVigente("2026-11-15", VISA).corte).toBe("2026-11-15");
    expect(lineaCiclo(cicloVigente("2026-10-26", VISA), "2026-10-26")).toBe("Cortó el 15 oct · pagas el 30 oct · fecha límite 12 nov");
  });

  it("marcas del calendario de un mes: corte, pago y límite de cada ciclo", () => {
    const m = marcasEntre("2026-11-01", "2026-11-30", VISA).map((x) => `${x.fecha} ${x.marca}`);
    expect(m).toEqual(["2026-11-12 limite", "2026-11-15 corte", "2026-11-30 pago"]);
  });

  it("aviso: faltan 3 días o menos para la fecha límite y no hay pago anotado después del corte", () => {
    expect(avisoLimite("2026-11-08", VISA, [])).toBeNull(); // faltan 4
    expect(avisoLimite("2026-11-09", VISA, [])).toMatchObject({ faltan: 3, ciclo: { limite: "2026-11-12" } });
    expect(avisoLimite("2026-11-12", VISA, [])).toMatchObject({ faltan: 0 });
    expect(avisoLimite("2026-11-10", VISA, ["2026-10-30"])).toBeNull(); // ya pagó en el ciclo
    expect(avisoLimite("2026-11-10", VISA, ["2026-10-15"])).toMatchObject({ faltan: 2 }); // el día del corte es del ciclo anterior
    expect(avisoLimite("2026-11-10", VISA, ["2026-11-11"])).toMatchObject({ faltan: 2 }); // un pago futuro no cuenta todavía
  });

  it("formulario: corte y días van juntos; rangos válidos; errores en palabras simples", () => {
    expect(cicloDeFormulario({ diaCorte: "15", diasParaPagar: "28", diaPago: "30" })).toEqual({ ok: true, valor: { dia_corte: 15, dias_para_pagar: 28, dia_pago: 30 } });
    expect(cicloDeFormulario({})).toEqual({ ok: true, valor: { dia_corte: null, dias_para_pagar: null, dia_pago: null } });
    expect(cicloDeFormulario({ diaPago: "28" })).toEqual({ ok: true, valor: { dia_corte: null, dias_para_pagar: null, dia_pago: 28 } });
    expect(cicloDeFormulario({ diaCorte: "15" })).toMatchObject({ ok: false });
    expect(cicloDeFormulario({ diaCorte: "32", diasParaPagar: "28" })).toMatchObject({ ok: false, error: expect.stringContaining("1 al 31") });
    expect(cicloDeFormulario({ diaCorte: "15", diasParaPagar: "61" })).toMatchObject({ ok: false, error: expect.stringContaining("1 al 60") });
    expect(cicloDeFormulario({ diaCorte: "15", diasParaPagar: "28", diaPago: "0" })).toMatchObject({ ok: false });
    expect(cicloDe({ diaCorte: 15, diasParaPagar: 28, diaPago: null })).toEqual({ diaCorte: 15, diasParaPagar: 28, diaPago: null });
    expect(cicloDe({ diaCorte: 15, diasParaPagar: null })).toBeNull();
  });
});
