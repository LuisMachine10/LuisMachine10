// Tarjetas en dos monedas y su ciclo en el Presupuesto, el registro único, la matriz y el Boletín.
// Datos SINTÉTICOS (cifras redondas inventadas; los nombres «Visa A» y «Visa B» no son de nadie).

import Big from "big.js";
import { describe, expect, it } from "vitest";
import { contextoEjemplo } from "../capital/apoyo-pruebas";
import { registroDeFormulario } from "../capital/formulario-registro";
import { matrizRiesgo } from "../capital/matriz";
import { hallazgos } from "../capital/alertas";
import { balance, conSaldosVigentes, deudaTarjetas, filaARegistro, type ItemRegistro, usoTarjeta, valorRegistro } from "../capital/registro";
import { ciclosTarjetas, fotoTuDinero, nombreSeguro } from "../boletin/foto";
import { leerFoto, pagosTarjetaProximos } from "../../supabase/functions/_shared/boletin/armar";
import { conRegistro } from "./filas";
import { aJsonSQL } from "./importar";
import { simular } from "./motor";
import type { TasasUSD } from "./tasas";
import { claveUSD, type Cuenta, type DatosCaja, type Movimiento } from "./tipos";
import { validarCuenta, validarMovimiento, validarRecurrente } from "./validar";
import { armarVistaMes, avisosTarjetas } from "./vista";

const TASAS: TasasUSD = { hoy: "2026-11-20", serie: [{ fecha: "2026-11-02", valor: "60.00", url: null }, { fecha: "2026-11-16", valor: "62.00", url: null }] };

const cuenta = (id: string, tipo: Cuenta["tipo"], saldoInicial: string, extra: Partial<Cuenta> = {}): Cuenta => ({ id, nombre: id, tipo, saldoInicial, limite: null, orden: 0, ...extra });
const mov = (p: Partial<Movimiento> & { id: string }): Movimiento => ({
  fecha: "2026-11-05", tipo: "gasto", monto: "100", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: null, nota: null, recurrenteId: null, ...p,
});
const CICLO = { diaCorte: 15, diasParaPagar: 28, diaPago: 30 };
function datos(p: Partial<DatosCaja> = {}): DatosCaja {
  return {
    config: { inicio: "2026-11-01", colchon: "0", margen: "0", tasaUSD: null },
    cuentas: [cuenta("b", "banco", "100000"), cuenta("u", "banco", "1000", { moneda: "USD" }), cuenta("v", "tarjeta", "12000", { usd: { saldoInicial: "300", limite: "2000" }, ciclo: CICLO })],
    categorias: [{ id: "c", nombre: "Compras", tipo: "gasto", adicional: null }],
    recurrentes: [],
    movimientos: [],
    omitidos: [],
    saldos: [],
    notas: [],
    tasasUSD: TASAS,
    ...p,
  };
}
const dia = (d: DatosCaja, f: string, hoy = "2026-11-20") => simular(d, { hoy, hasta: f }).porFecha.get(f)!;

describe("Presupuesto · tarjeta en RD$ y US$", () => {
  it("la parte en US$ es otra posición; la deuda en tarjetas del día suma las dos (US$ × dólar del BCRD del día)", () => {
    const d1 = dia(datos(), "2026-11-03");
    expect(d1.posiciones).toMatchObject({ v: "-12000", [claveUSD("v")]: "-300" });
    expect(d1.deuda).toBe(new Big(12000).plus(new Big(300).times(60)).toString()); // BCRD del 2 nov
  });

  it("pagar la parte en US$ desde una cuenta en RD$: se convierte con el dólar del BCRD de la fecha; la parte en RD$ no cambia", () => {
    const d = datos({ movimientos: [mov({ id: "1", fecha: "2026-11-16", tipo: "pago_tarjeta", cuenta: "b", destino: "v", monto: "6200", parte: "USD" })] });
    const x = dia(d, "2026-11-16");
    expect(x.posiciones).toMatchObject({ b: "93800", v: "-12000", [claveUSD("v")]: "-200" }); // 6,200 / 62 = 100 US$
  });

  it("…o con la tasa propia del movimiento", () => {
    const d = datos({ movimientos: [mov({ id: "1", fecha: "2026-11-16", tipo: "pago_tarjeta", cuenta: "b", destino: "v", monto: "6100", tasa: "61", parte: "USD" })] });
    expect(dia(d, "2026-11-16").posiciones[claveUSD("v")]).toBe("-200");
  });

  it("sin «parte»: un pago en RD$ va a la parte en RD$; uno en US$ desde la cuenta en dólares, a la parte en US$", () => {
    const d = datos({
      movimientos: [
        mov({ id: "1", fecha: "2026-11-05", tipo: "pago_tarjeta", cuenta: "b", destino: "v", monto: "2000" }),
        mov({ id: "2", fecha: "2026-11-05", tipo: "pago_tarjeta", cuenta: "u", destino: "v", monto: "50", moneda: "USD" }),
      ],
    });
    expect(dia(d, "2026-11-05").posiciones).toMatchObject({ b: "98000", u: "950", v: "-10000", [claveUSD("v")]: "-250" });
  });

  it("un cargo en US$ a la tarjeta va a su parte en dólares", () => {
    const d = datos({ movimientos: [mov({ id: "1", fecha: "2026-11-05", cuenta: "v", monto: "40", moneda: "USD", categoria: "c" })] });
    expect(dia(d, "2026-11-05").posiciones).toMatchObject({ v: "-12000", [claveUSD("v")]: "-340" });
  });

  it("pago total a la parte en US$: paga lo que se debe en dólares ese día", () => {
    const d = datos({
      recurrentes: [{ id: "r", nombre: "Pagar dólares", tipo: "pago_tarjeta", monto: "0", moneda: "DOP", pagoTotal: true, parte: "USD", cuenta: "u", destino: "v", categoria: null, frecuencia: "mensual", dias: "30", cadaN: null, fecha: null, desde: null, hasta: null, activo: true }],
    });
    const x = dia(d, "2026-11-30");
    expect(x.planificados[0]).toMatchObject({ monto: "300", moneda: "USD", parte: "USD" });
    expect(x.posiciones).toMatchObject({ u: "700", [claveUSD("v")]: "0", v: "-12000" });
  });

  it("sin dólar del BCRD: el pago desde pesos a la parte en US$ no se aplica y la deuda en US$ no se suma (se avisa)", () => {
    const d = datos({ tasasUSD: null, movimientos: [mov({ id: "1", fecha: "2026-11-16", tipo: "pago_tarjeta", cuenta: "b", destino: "v", monto: "6200", parte: "USD" })] });
    const sim = simular(d, { hoy: "2026-11-20", hasta: "2026-11-16" });
    const x = sim.porFecha.get("2026-11-16")!;
    expect(x.posiciones[claveUSD("v")]).toBe("-300");
    expect(x.deuda).toBe("12000");
    expect(sim.advertencias.join(" ")).toMatch(/no se sumó a tu deuda en tarjetas/);
  });

  it("cuadre de la parte en US$ («v#usd»)", () => {
    const d = datos({ saldos: [{ fecha: "2026-11-10", cuentaId: claveUSD("v"), saldo: "275" }] });
    const x = dia(d, "2026-11-10");
    expect(x.posiciones[claveUSD("v")]).toBe("-275");
    expect(x.ajustes).toEqual([{ cuentaId: claveUSD("v"), real: "275", esperado: "300", diferencia: "-25" }]);
  });

  it("del registro: saldo en US$ escrito después del inicio entra como cuadre sintético (no se exporta)", () => {
    const d = datos({ cuentas: [cuenta("b", "banco", "100000"), cuenta("v", "tarjeta", "12000")] });
    const enl = conRegistro(d, [
      { id: "v", registro_id: "r-v", activos: { clase: "tarjeta", moneda: "DOP", tasa: "0", dia_corte: 15, dias_para_pagar: 28, dia_pago: 30, limite_usd: "2000", saldo_usd: "450", saldo_usd_fecha: "2026-11-11" } },
      { id: "b", registro_id: "r-b", activos: { clase: "ahorros", moneda: "DOP", tasa: "0.01" } },
    ]);
    expect(enl).toEqual({ v: "r-v", b: "r-b" });
    const v = d.cuentas.find((c) => c.id === "v")!;
    expect(v).toMatchObject({ usd: { saldoInicial: "0", limite: "2000" }, ciclo: CICLO, diaPago: 30 });
    expect(d.saldos).toEqual([{ fecha: "2026-11-10", cuentaId: "v#usd", saldo: "450", sintetico: true }]);
    expect(dia(d, "2026-11-10").posiciones["v#usd"]).toBe("-450");
    expect(aJsonSQL({ ...d, config: d.config! }).saldos).toEqual([]);
    // Saldo en US$ de antes del inicio: es lo que se debía al empezar. Sin parte en US$: nada cambia.
    const d2 = datos({ cuentas: [cuenta("v", "tarjeta", "12000"), cuenta("w", "tarjeta", "0")] });
    conRegistro(d2, [
      { id: "v", registro_id: "r-v", activos: { clase: "tarjeta", moneda: "DOP", limite_usd: null, saldo_usd: "80", saldo_usd_fecha: "2026-10-20" } },
      { id: "w", registro_id: "r-w", activos: { clase: "tarjeta", moneda: "DOP", limite_usd: null, saldo_usd: null } },
    ]);
    expect(d2.cuentas[0].usd).toEqual({ saldoInicial: "80", limite: null });
    expect(d2.cuentas[1].usd).toBeUndefined();
    expect(d2.saldos).toEqual([]);
  });

  it("formularios: la parte se guarda solo si se elige; el pago fijo también la lleva", () => {
    const base = { fecha: "2026-11-16", tipo: "pago_tarjeta", monto: "6200", moneda: "DOP", cuenta: "b", destino: "v" };
    expect(validarMovimiento({ ...base, parte: "USD" })).toMatchObject({ ok: true, valor: { parte: "USD" } });
    const sin = validarMovimiento(base);
    expect(sin.ok && "parte" in sin.valor).toBe(false);
    expect(validarRecurrente({ nombre: "Visa", tipo: "pago_tarjeta", pagoTotal: "on", cuenta: "b", destino: "v", frecuencia: "mensual", dias: "30", parte: "USD" })).toMatchObject({ ok: true, valor: { parte: "USD" } });
    expect(validarCuenta({ nombre: "Visa 4521", tipo: "tarjeta", saldoInicial: "0" })).toMatchObject({ ok: false, error: expect.stringContaining("4 últimos") });
  });
});

describe("Presupuesto · calendario y avisos del ciclo", () => {
  it("el calendario marca corte, pago elegido y fecha límite; el panel lo explica", () => {
    const d = datos();
    const sim = simular(d, { hoy: "2026-11-20", hasta: "2026-12-31" });
    const v = armarVistaMes(d, sim, "2026-11");
    const celda = (f: string) => v.semanas.flat().find((c) => c.fecha === f)!;
    expect(celda("2026-11-15").tarjeta).toEqual(["corte"]);
    expect(celda("2026-11-30").tarjeta).toEqual(["pago"]);
    expect(celda("2026-11-12").tarjeta).toEqual(["limite"]);
    expect(celda("2026-11-30").etiqueta).toMatch(/pago de tarjeta planificado v/);
    expect(v.paneles["2026-11-15"].tarjetas[0].texto).toBe("Corta hoy. Fecha límite: 13 dic · quieres pagar el 30 nov.");
    expect(v.paneles["2026-11-12"].tarjetas[0].texto).toMatch(/Sin pago anotado de este ciclo/);
    // La parte en US$ se puede cuadrar en el panel del día.
    expect(v.paneles["2026-11-03"].cuentas.map((c) => c.id)).toEqual(["b", "u", "v", "v#usd"]);
  });

  it("aviso 3 días antes de la fecha límite si no hay pago anotado del ciclo", () => {
    const d = datos();
    expect(avisosTarjetas(d, "2026-12-10")).toEqual(["«v»: la fecha límite de pago es en 3 días (13 dic) y no hay pago anotado desde el corte del 15 nov."]);
    expect(avisosTarjetas(d, "2026-12-09")).toEqual([]);
    const pagado = datos({ movimientos: [mov({ id: "1", fecha: "2026-11-30", tipo: "pago_tarjeta", cuenta: "b", destino: "v", monto: "12000" })] });
    expect(avisosTarjetas(pagado, "2026-12-10")).toEqual([]);
  });
});

// ───────────────────────── Registro único, patrimonio y matriz ─────────────────────────

const fila = (extra: Record<string, unknown>) =>
  filaARegistro(
    {
      id: "t1", clase: "tarjeta", subtipo: null, nombre: "Visa A", institucion: "", simbolo: null, moneda: "DOP", cantidad: "12000", precio: "1", tasa: "0",
      saldo_fecha: "2026-10-01", limite: "80000", dia_pago: 30, origen: "portafolio", orden: 0, dia_corte: 15, dias_para_pagar: 28,
      limite_usd: "2000", saldo_usd: "500", saldo_usd_fecha: "2026-10-01", ...extra,
    },
    null,
  );
const BCRD = [{ valor: "62.00", fecha_dato: "2026-10-14", recogido_en: null, url_dato: "https://www.bancentral.gov.do/" }];

describe("Mis cuentas · doble moneda", () => {
  it("las tarjetas de antes (sin columnas nuevas) quedan en RD$ sin cambiar nada", () => {
    const vieja = filaARegistro({ id: "t0", clase: "tarjeta", nombre: "Visa B", moneda: "DOP", cantidad: "9000", precio: "1", tasa: "0", limite: "50000", dia_pago: 28 }, null);
    expect(vieja).toMatchObject({ limiteUsd: null, saldoUsd: null, diaCorte: null, diasParaPagar: null, diaPago: 28 });
    const ctx = { ...contextoEjemplo({ usd: BCRD }), registro: [vieja] };
    expect(valorRegistro(ctx, vieja)!.toString()).toBe("9000");
    expect(usoTarjeta(ctx, vieja)).toMatchObject({ usd: null, usdNoConfirmado: false });
  });

  it("uso del límite por moneda y total en RD$ con el dólar de venta del BCRD de hoy", () => {
    const t = fila({});
    const ctx = { ...contextoEjemplo({ usd: BCRD }), registro: [t] };
    const u = usoTarjeta(ctx, t);
    expect(u.principal.uso!.toString()).toBe("0.15");
    expect(u.usd!.uso!.toString()).toBe("0.25");
    expect(u.totalDOP!.toString()).toBe("43000"); // 12,000 + 500 × 62
    expect(u.tasa).toMatchObject({ origen: "bcrd", fecha: "2026-10-14" });
    expect(deudaTarjetas(ctx, [t]).toString()).toBe("43000");
    const b = balance(ctx, [t]);
    expect(b.deudas.toString()).toBe("43000");
    expect(b.usdNoConfirmado).toEqual([]);
  });

  it("sin dólar del BCRD (o con uno escrito a mano, o de hace más de 7 días): la parte en US$ no se suma y se dice", () => {
    const t = fila({});
    for (const ctx0 of [contextoEjemplo(), contextoEjemplo({ usd: BCRD, hoy: "2026-10-25" })]) {
      const ctx = { ...ctx0, registro: [t] };
      expect(usoTarjeta(ctx, t)).toMatchObject({ usdNoConfirmado: true });
      expect(valorRegistro(ctx, t)!.toString()).toBe("12000");
      expect(balance(ctx, [t]).usdNoConfirmado.map((x) => x.id)).toEqual(["t1"]);
      expect(matrizRiesgo(ctx).find((r) => r.id === "presupuesto")!.dato).toMatch(/Lo que debes en US\$ en Visa A no está sumado/);
      expect(hallazgos(ctx, "2026-10").some((h) => /no se sumó/.test(h.t))).toBe(true);
    }
  });

  it("matriz de riesgo: la deuda de tarjetas contra el ingreso usa el total con la parte en US$", () => {
    const t = fila({});
    const ctx = {
      ...contextoEjemplo({ usd: BCRD }),
      registro: [t],
      presupuesto: { mes: "2026-10", presupuestado: { ingresos: "100000", gastos_totales: "50000", utilidad_neta: "50000" }, real: { gastos_totales: "40000" }, ahorroMensual: null },
    };
    const r = matrizRiesgo(ctx).find((x) => x.id === "presupuesto")!;
    expect(r.dato).toMatch(/Debes RD\$ 43,000 en tarjetas: 43% de tu ingreso del mes/);
    expect(r.fuente).toMatch(/dólar de venta del BCRD del 2026-10-14/);
    expect(r.impacto).toBe("alto"); // 43 % > 30 %
  });

  it("saldo vigente de la parte en US$: lo escrito + lo que anotó el Presupuesto; y las fechas de los pagos", () => {
    const t = { ...fila({}), cajaId: "v" } as ItemRegistro;
    const d = datos({ movimientos: [mov({ id: "1", fecha: "2026-11-16", tipo: "pago_tarjeta", cuenta: "b", destino: "v", monto: "6200", parte: "USD" })] });
    const [x] = conSaldosVigentes([t], d, "2026-11-20");
    expect(x).toMatchObject({ cantidad: "12000", saldoUsd: "200", pagos: ["2026-11-16"] });
  });

  it("formulario: ciclo, límites y lo que debes en US$; no se pisa el saldo en US$ si no se tocó", () => {
    const r = registroDeFormulario({ tipo: "tarjeta", nombre: "Visa A", moneda: "DOP", saldo: "12,000", limite: "80,000", limiteUsd: "2,000", saldoUsd: "500", diaCorte: "15", diasParaPagar: "28", diaPagoTarjeta: "30" }, "2026-10-26");
    expect(r).toMatchObject({ ok: true, valor: { limite: "80000", limite_usd: "2000", saldo_usd: "500", saldo_usd_fecha: "2026-10-27", dia_corte: 15, dias_para_pagar: 28, dia_pago: 30 } });
    const sinTocar = registroDeFormulario({ tipo: "tarjeta", nombre: "Visa A", moneda: "DOP", saldo: "12000", saldoMostrado: "12000", saldoUsd: "500", saldoUsdMostrado: "500" }, "2026-10-26");
    expect(sinTocar.ok && "saldo_usd" in sinTocar.valor).toBe(false);
    expect(registroDeFormulario({ tipo: "tarjeta", nombre: "Visa A", moneda: "USD", saldo: "10", limiteUsd: "500" }, "2026-10-26")).toMatchObject({ ok: false });
    expect(registroDeFormulario({ tipo: "tarjeta", nombre: "Visa A", saldo: "10", diaCorte: "15" }, "2026-10-26")).toMatchObject({ ok: false, error: expect.stringContaining("los dos") });
    expect(registroDeFormulario({ tipo: "tarjeta", nombre: "Visa 4521", saldo: "10" }, "2026-10-26")).toMatchObject({ ok: false, error: expect.stringContaining("4 últimos") });
    // Un préstamo no lleva ciclo ni parte en US$ (las restricciones de la base lo exigen).
    expect(registroDeFormulario({ tipo: "prestamo", nombre: "Carro", saldo: "300000", diaPago: "5" }, "2026-10-26")).toMatchObject({
      ok: true,
      valor: { dia_pago: 5, dia_corte: null, dias_para_pagar: null, limite_usd: null, saldo_usd: null },
    });
  });

  it("hallazgo: fecha límite en 3 días o menos sin pago anotado", () => {
    const t = { ...fila({}), cajaId: "v" } as ItemRegistro;
    const ctx = { ...contextoEjemplo({ usd: BCRD, hoy: "2026-11-10" }), registro: [t] };
    const h = hallazgos(ctx, "2026-11").find((x) => /fecha límite/.test(x.t))!;
    expect(h).toMatchObject({ n: "error", t: "Visa A: la fecha límite de pago es en 2 días (12 nov)" });
    const pagada = { ...t, pagos: ["2026-10-30"] };
    expect(hallazgos({ ...ctx, registro: [pagada] }, "2026-11").some((x) => /fecha límite/.test(x.t))).toBe(false);
  });
});

describe("Boletín · pagos de tarjeta de los próximos 7 días", () => {
  it("la foto lleva el ciclo vigente y el siguiente; el correo muestra los de 7 días, sin números de tarjeta", () => {
    const t = { ...fila({ nombre: "Visa 123456" }), pagos: [] } as ItemRegistro;
    expect(nombreSeguro("Visa 123456")).toBe("Visa …");
    const ciclos = ciclosTarjetas([t], "2026-11-25");
    expect(ciclos).toEqual([
      { nombre: "Visa …", corte: "2026-11-15", pago: "2026-11-30", limite: "2026-12-13", pagado: false },
      { nombre: "Visa …", corte: "2026-12-15", pago: "2026-12-30", limite: "2027-01-12", pagado: false },
    ]);
    const ctx = { ...contextoEjemplo({ usd: BCRD, hoy: "2026-11-25" }), registro: [t] };
    const foto = fotoTuDinero({ ctx, configurado: true, registroCompleto: [t], aportesConfirmados: [] });
    expect(leerFoto(foto)).toEqual(foto);
    expect(pagosTarjetaProximos(leerFoto(foto)!, "2026-11-25")).toEqual([{ nombre: "Visa …", pago: "2026-11-30", limite: "2026-12-13", pagado: false }]);
    expect(pagosTarjetaProximos(leerFoto(foto)!, "2026-12-08")).toEqual([{ nombre: "Visa …", pago: null, limite: "2026-12-13", pagado: false }]);
    expect(pagosTarjetaProximos(leerFoto(foto)!, "2026-11-01")).toEqual([]);
  });
});
