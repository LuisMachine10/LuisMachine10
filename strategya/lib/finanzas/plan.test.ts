// Manual, secciones C, D y E: el plan del mes en montos (fórmula del sobrante, líneas de ahorro hechas o parciales),
// varios pagos de tarjeta por ciclo con el uso del crédito y los cargos dentro de la cuota de un préstamo.
// Datos SINTÉTICOS (cifras redondas, de nadie).
import Big from "big.js";
import { describe, expect, it } from "vitest";
import { fechasDelCiclo } from "../caja/ciclo";
import { separarPago } from "../caja/deudas";
import { simular } from "../caja/motor";
import { estadoDeResultados } from "../caja/resultados";
import type { DatosCaja, Movimiento, Recurrente } from "../caja/tipos";
import { planTarjetas, usoAntesDespues } from "./credito";
import { aportesProyeccion, lineasDelMes, masOMenos, planDelMes } from "./plan";

const HOY = "2026-11-10";
const rec = (x: Partial<Recurrente> & Pick<Recurrente, "id" | "tipo" | "monto">): Recurrente => ({
  nombre: x.id, moneda: "DOP", pagoTotal: false, cuenta: "b", destino: null, categoria: null, frecuencia: "mensual", dias: "28", cadaN: null, fecha: null, desde: null, hasta: null, activo: true, ...x,
});
const mov = (x: Partial<Movimiento> & Pick<Movimiento, "id" | "tipo" | "monto" | "fecha">): Movimiento => ({
  moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: null, nota: null, recurrenteId: null, ...x,
});

/** Un mes de Mena (inventado): sueldo, otros ingresos, gastos (uno con tarjeta), dos líneas de ahorro y el pago de la tarjeta. */
function caja(movimientos: Movimiento[] = []): DatosCaja {
  return {
    config: { inicio: "2026-11-01", colchon: "0", margen: "0", tasaUSD: null },
    cuentas: [
      { id: "b", nombre: "Nómina", tipo: "banco", saldoInicial: "100000", limite: null, orden: 0 },
      { id: "cd", nombre: "Certificado", tipo: "ahorro", saldoInicial: "50000", limite: null, orden: 1, tipoFin: "certificado" },
      { id: "v", nombre: "Visa", tipo: "tarjeta", saldoInicial: "20000", limite: "80000", orden: 2, ciclo: { diaCorte: 15, diasParaPagar: 28, diaPago: 30 } },
    ],
    categorias: [
      { id: "su", nombre: "Sueldo", tipo: "ingreso", adicional: null },
      { id: "oi", nombre: "Intereses y dividendos", tipo: "otro_ingreso", adicional: "1000" },
      { id: "co", nombre: "Mercancía", tipo: "costo", adicional: "2000" },
      { id: "ga", nombre: "Casa", tipo: "gasto", adicional: "10000" },
      { id: "st", nombre: "Streaming", tipo: "gasto", adicional: null },
      { id: "ah", nombre: "Ahorro", tipo: "ahorro_inversion", adicional: null },
    ],
    recurrentes: [
      rec({ id: "sueldo", tipo: "ingreso", monto: "80000", categoria: "su", dias: "1" }),
      rec({ id: "netflix", tipo: "gasto", monto: "800", categoria: "st", cuenta: "v", dias: "5" }),
      rec({ id: "l-cd", tipo: "transferencia", monto: "10000", categoria: "ah", destino: "cd", dias: "2" }),
      rec({ id: "l-voo", tipo: "transferencia", monto: "200", moneda: "DOP", categoria: "ah", destino: null, registroDestino: "voo", dias: "3" }),
      rec({ id: "pago-v1", tipo: "pago_tarjeta", monto: "5000", destino: "v", dias: "20" }),
      rec({ id: "pago-v2", tipo: "pago_tarjeta", monto: "3000", destino: "v", dias: "30" }),
    ],
    movimientos,
    omitidos: [],
    saldos: [],
    notas: [],
  };
}

describe("C · plan del mes en montos", () => {
  it("SOBRANTE = Ingreso + Otros ingresos − Costos − Gastos − Ahorro e inversión − Pagos de tarjetas y préstamos", () => {
    const p = planDelMes(caja(), "2026-11", HOY);
    expect(p.ingresos.plan.toFixed()).toBe("80000");
    expect(p.otrosIngresos.plan.toFixed()).toBe("1000");
    expect(p.costos.plan.toFixed()).toBe("2000");
    // Casa 10,000; el streaming (800) se paga con la tarjeta: no sale de tu dinero hasta que pagas la tarjeta.
    expect(p.gastos.plan.toFixed()).toBe("10000");
    expect(p.conTarjeta.plan.toFixed()).toBe("800");
    expect(p.ahorro.plan.toFixed()).toBe("10200");
    expect(p.pagos.plan.toFixed()).toBe("8000");
    expect(p.sobrante.plan.toFixed()).toBe(new Big(80000).plus(1000).minus(2000).minus(10000).minus(10200).minus(8000).toFixed());
    expect(p.sobrante.plan.toFixed()).toBe("50800");
  });

  it("el sobrante no se planifica: es lo que queda en tus cuentas (doble partida)", () => {
    // Con todo hecho tal cual, el sobrante real = lo que quedó en efectivo y cuentas además de lo que había.
    const hechos = [
      mov({ id: "1", fecha: "2026-11-01", tipo: "ingreso", monto: "80000", categoria: "su", recurrenteId: "sueldo" }),
      mov({ id: "2", fecha: "2026-11-02", tipo: "transferencia", monto: "10000", categoria: "ah", destino: "cd", recurrenteId: "l-cd" }),
      mov({ id: "3", fecha: "2026-11-04", tipo: "gasto", monto: "10000", categoria: "ga" }),
    ];
    const p = planDelMes(caja(hechos), "2026-11", HOY);
    expect(p.sobrante.real.toFixed()).toBe("60000");
    const sim = simular(caja(hechos), { hoy: HOY, hasta: HOY });
    expect(new Big(sim.porFecha.get(HOY)!.posiciones.b).minus(100000).toFixed()).toBe("60000");
  });

  it("línea HECHA cuando se registra la transferencia; PARCIAL si fue menos; PENDIENTE si nada; al cierre, más o menos de lo planeado", () => {
    const l = lineasDelMes(caja([mov({ id: "1", fecha: "2026-11-02", tipo: "transferencia", monto: "10000", categoria: "ah", destino: "cd", recurrenteId: "l-cd" })]), "2026-11");
    expect(l.map((x) => [x.recurrente.id, x.estado])).toEqual([["l-cd", "hecha"], ["l-voo", "pendiente"]]);
    const parcial = lineasDelMes(caja([mov({ id: "1", fecha: "2026-11-02", tipo: "transferencia", monto: "4000", categoria: "ah", destino: "cd", recurrenteId: "l-cd" })]), "2026-11")[0];
    expect(parcial.estado).toBe("parcial");
    expect(parcial.diferencia.toFixed()).toBe("-6000");
    expect(masOMenos(parcial.diferencia)).toBe("menos");
    const mas = lineasDelMes(caja([mov({ id: "1", fecha: "2026-11-02", tipo: "transferencia", monto: "12000", categoria: "ah", destino: "cd", recurrenteId: "l-cd" })]), "2026-11")[0];
    expect([mas.estado, masOMenos(mas.diferencia), mas.diferencia.toFixed()]).toEqual(["hecha", "mas", "2000"]);
  });

  it("una transferencia suelta al mismo destino también cuenta para su línea (parcial permitido)", () => {
    const l = lineasDelMes(caja([mov({ id: "1", fecha: "2026-11-06", tipo: "transferencia", monto: "150", categoria: "ah", destino: null, registroDestino: "voo" })]), "2026-11");
    expect(l.find((x) => x.recurrente.id === "l-voo")).toMatchObject({ estado: "parcial" });
    expect(l.find((x) => x.recurrente.id === "l-voo")!.hecho.toFixed()).toBe("150");
  });

  it("orden de Mena: primero el ahorro, luego la tarjeta (el ahorro no depende del pago)", () => {
    const p = planDelMes(caja(), "2026-11", HOY);
    expect(Object.keys(p).indexOf("ahorro")).toBeLessThan(Object.keys(p).indexOf("pagos"));
  });

  it("el interés y los cargos que van dentro de un pago no se restan dos veces", () => {
    const p = planDelMes(caja([mov({ id: "1", fecha: "2026-11-20", tipo: "pago_tarjeta", monto: "5000", destino: "v", interes: "400", recurrenteId: "pago-v1" })]), "2026-11", HOY);
    expect(p.pagos.real.toFixed()).toBe("5000");
    expect(p.gastos.real.toFixed()).toBe("0");
  });

  it("las proyecciones usan EXACTAMENTE esas líneas: monto por instrumento", () => {
    const ap = aportesProyeccion(caja(), HOY, { cd: "reg-cd" });
    expect([...ap.entries()].map(([k, v]) => [k, v.monto.toFixed(), v.desdeMes])).toEqual([["reg-cd", "10000", 1], ["voo", "200", 1]]);
  });

  it("el ahorro presupuestado sin instrumento (monto adicional) no entra al plan y se avisa", () => {
    const d = caja();
    d.categorias.push({ id: "ah2", nombre: "Ahorro sin decir dónde", tipo: "ahorro_inversion", adicional: "3000" });
    const p = planDelMes(d, "2026-11", HOY);
    expect(p.sinInstrumento.toFixed()).toBe("3000");
    expect(p.ahorro.plan.toFixed()).toBe("10200");
  });
});

describe("D · tarjetas: varios pagos por ciclo y el uso del crédito", () => {
  it("fecha límite = corte + días (corte 15 nov + 28 = 13 dic); pago preferido el 30 → 30 nov", () => {
    expect(fechasDelCiclo("2026-11-15", { diaCorte: 15, diasParaPagar: 28, diaPago: 30 })).toMatchObject({ limite: "2026-12-13", pago: "2026-11-30" });
  });

  it("uso del crédito = saldo ÷ límite, antes y después de cada pago planificado", () => {
    const pasos = usoAntesDespues(new Big(40000), new Big(80000), [
      { fecha: "2026-11-30", monto: new Big(10000) },
      { fecha: "2026-11-20", monto: new Big(10000) },
    ]);
    expect(pasos.map((p) => [p.fecha, p.antes.uso!.toFixed(), p.despues.uso!.toFixed()])).toEqual([
      ["2026-11-20", "0.5", "0.375"],
      ["2026-11-30", "0.375", "0.25"],
    ]);
  });

  it("varios pagos en el mismo ciclo, desde el plan del Presupuesto", () => {
    const d = caja();
    const sim = simular(d, { hoy: "2026-11-16", hasta: "2026-12-31" });
    const [visa] = planTarjetas(sim, d.cuentas, "2026-11-16");
    expect(visa.hasta).toBe("2026-12-13");
    expect(visa.partes[0].pasos.map((p) => [p.fecha, p.monto.toFixed()])).toEqual([["2026-11-20", "5000"], ["2026-11-30", "3000"]]);
    // Hoy debe 20,000 (el streaming del 5 no se confirmó: no se aplica) de 80,000.
    expect(visa.partes[0].hoy.deuda.toFixed()).toBe("20000");
    expect(visa.partes[0].pasos.map((p) => [p.antes.uso!.toFixed(), p.despues.uso!.toFixed()])).toEqual([["0.25", "0.1875"], ["0.1875", "0.15"]]);
    expect(visa.partes[0].pasos[1].despues.deuda.toFixed()).toBe("12000");
  });

  it("comprar con tarjeta = gasto del mes y sube la deuda; pagarla = transferencia (no es gasto) que baja la deuda", () => {
    const d = caja([
      mov({ id: "1", fecha: "2026-11-06", tipo: "gasto", monto: "2000", categoria: "ga", cuenta: "v" }),
      mov({ id: "2", fecha: "2026-11-07", tipo: "pago_tarjeta", monto: "2000", destino: "v" }),
    ]);
    d.recurrentes = [];
    const e = estadoDeResultados(d, "2026-11");
    expect(e.secciones.gasto.real).toBe("2000");
    const sim = simular(d, { hoy: "2026-11-08", hasta: "2026-11-08" });
    expect(sim.porFecha.get("2026-11-06")!.posiciones.v).toBe("-22000");
    expect(sim.porFecha.get("2026-11-07")!.posiciones.v).toBe("-20000");
  });

  it("los intereses de la tarjeta son solo los que Mena anota de su estado de cuenta (nunca se calculan)", () => {
    const d = caja();
    d.cuentas[2].tasaAnual = "0.6";
    expect(separarPago(d, { monto: "5000", moneda: "DOP", destino: "v", fecha: "2026-11-20" }, undefined)).toMatchObject({ interes: null, capital: "5000" });
    expect(separarPago(d, { monto: "5000", moneda: "DOP", destino: "v", fecha: "2026-11-20" }, "650")).toMatchObject({ interes: "650", capital: "4350" });
  });
});

describe("E · préstamos: cuota = interés + capital; los cargos dentro de la cuota son gasto aparte", () => {
  const d = (): DatosCaja => ({
    config: { inicio: "2026-10-01", colchon: "0", margen: "0", tasaUSD: null },
    cuentas: [
      { id: "b", nombre: "Nómina", tipo: "banco", saldoInicial: "100000", limite: null, orden: 0 },
      { id: "p", nombre: "Préstamo del carro", tipo: "prestamo", saldoInicial: "320000", limite: null, orden: 1, tasaAnual: "0.12", cargosCuota: "1200" },
    ],
    categorias: [{ id: "seg", nombre: "Seguro del carro", tipo: "gasto", adicional: null }],
    recurrentes: [],
    movimientos: [],
    omitidos: [],
    saldos: [],
    notas: [],
  });

  it("interés = saldo anterior × tasa ÷ 12; cargos = los de la cuota; capital = cuota − interés − cargos", () => {
    const s = separarPago(d(), { monto: "10700", moneda: "DOP", destino: "p", fecha: "2026-10-20" }, undefined);
    expect(s).toMatchObject({ interes: "3200", cargos: "1200", capital: "6300", como: "tasa" });
  });

  it("los cargos no bajan la deuda y son gasto (su categoría); el interés es gasto financiero", () => {
    const datos = d();
    datos.movimientos = [mov({ id: "c", fecha: "2026-10-20", tipo: "pago_tarjeta", monto: "10700", destino: "p", interes: "3200", cargos: "1200", categoriaCargos: "seg" })];
    const sim = simular(datos, { hoy: "2026-10-21", hasta: "2026-10-21" });
    expect(sim.porFecha.get("2026-10-21")!.posiciones.p).toBe("-313700");
    const e = estadoDeResultados(datos, "2026-10");
    expect(e.secciones.gasto.lineas.find((l) => l.clave === "seg")!.real).toBe("1200");
    expect(e.secciones.gasto_financiero.real).toBe("3200");
  });

  it("si Mena escribe el capital, lo demás se reparte: primero los cargos, el resto es interés", () => {
    expect(separarPago(d(), { monto: "10700", moneda: "DOP", destino: "p", fecha: "2026-10-20" }, "4400")).toMatchObject({ interes: "3200", cargos: "1200", capital: "6300" });
  });
});
