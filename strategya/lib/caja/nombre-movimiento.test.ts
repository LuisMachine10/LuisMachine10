import { describe, expect, it } from "vitest";
import { nombreDeMovimiento } from "./nombre-movimiento";

const cuentas = [
  { id: "b", tipo: "banco" as const, tipoFin: "corriente" as const },
  { id: "e", tipo: "efectivo" as const },
  { id: "u", tipo: "ahorro" as const, moneda: "USD" as const },
  { id: "cd", tipo: "ahorro" as const, tipoFin: "certificado" as const },
  { id: "v", tipo: "tarjeta" as const },
];
const categorias = [{ id: "k", tipo: "ahorro_inversion" as const }];

describe("nombre de cada movimiento según el formulario del manual", () => {
  it("una transferencia a una inversión es «Ahorro o inversión», no «Mover entre mis cuentas»", () => {
    expect(nombreDeMovimiento({ tipo: "transferencia", cuenta: "b", destino: "cd" }, cuentas)).toBe("Ahorro o inversión");
    expect(nombreDeMovimiento({ tipo: "transferencia", cuenta: "b", registroDestino: "etf" }, cuentas)).toBe("Ahorro o inversión");
  });
  it("sacar de una inversión es rescate; entre monedas es cambio; con categoría de ahorro es ahorro", () => {
    expect(nombreDeMovimiento({ tipo: "transferencia", cuenta: "cd", destino: "b" }, cuentas)).toBe("Rescate o venta de inversión");
    expect(nombreDeMovimiento({ tipo: "transferencia", cuenta: "b", destino: "u" }, cuentas)).toBe("Cambio de moneda");
    expect(nombreDeMovimiento({ tipo: "transferencia", cuenta: "b", destino: "e", categoria: "k" }, cuentas, categorias)).toBe("Ahorro o inversión");
    expect(nombreDeMovimiento({ tipo: "transferencia", cuenta: "b", destino: "e" }, cuentas, categorias)).toBe("Mover entre mis cuentas");
  });
  it("los demás tipos no cambian", () => {
    expect(nombreDeMovimiento({ tipo: "pago_tarjeta", cuenta: "b", destino: "v" }, cuentas)).toBe("Pago de tarjeta o préstamo");
    expect(nombreDeMovimiento({ tipo: "gasto", cuenta: "v" }, cuentas)).toBe("Gasto");
  });
});
