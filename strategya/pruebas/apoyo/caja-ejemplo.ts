// SINTÉTICA: ejemplo inventado con la forma del JSON del artefacto «Calendario de Caja». Los datos
// reales de Mena nunca entran al repositorio (es público); los trae ella por /caja/importar.
export const EJEMPLO = `{
  "config": { "inicio": "2026-10-01", "colchon": 5000, "margen": "", "tasaUSD": 60.25 },
  "cuentas": {
    "c1": { "nombre": "Banco A", "tipo": "banco", "saldoInicial": 25000.10, "limite": null, "orden": 1 },
    "c2": { "nombre": "Cartera", "tipo": "efectivo", "saldoInicial": "1,500", "orden": 2 },
    "c3": { "nombre": "Visa", "tipo": "tarjeta", "saldoInicial": 7000, "limite": 50000, "orden": 3 },
    "c4": { "nombre": "Fondo", "tipo": "ahorro", "saldoInicial": 0.1, "orden": 4 }
  },
  "categorias": {
    "k1": { "nombre": "Salario", "grupo": "ingreso", "presupuesto": 0 },
    "k2": { "nombre": "Comida", "grupo": "variable", "presupuesto": 12000.5 }
  },
  "recurrentes": {
    "r1": { "nombre": "Quincena", "tipo": "ingreso", "monto": 40000, "moneda": "DOP", "cuenta": "c1", "cat": "k1",
            "frecuencia": "mensual", "dias": "15, 30", "activo": true },
    "r2": { "nombre": "Pago Visa", "tipo": "pago_tarjeta", "monto": 0, "pagoTotal": true, "cuenta": "c1", "destino": "c3",
            "frecuencia": "mensual", "dias": "28" },
    "r3": { "nombre": "Nube", "tipo": "gasto", "monto": 2.99, "moneda": "USD", "cuenta": "c3", "frecuencia": "cada_n", "cadaN": 30,
            "desde": "2026-10-05" },
    "r4": { "nombre": "Seguro", "tipo": "gasto", "monto": 3200, "cuenta": "c1", "frecuencia": "unica", "fecha": "2026-11-02", "activo": false }
  },
  "dias": {
    "2026-10-02": { "fecha": "2026-10-02", "items": [
        { "id": "i1", "tipo": "gasto", "monto": 845.37, "moneda": "DOP", "cuenta": "c2", "cat": "k2", "nota": "Colmado" },
        { "id": "i2", "tipo": "gasto", "monto": 20, "moneda": "USD", "tasa": 59.8, "cuenta": "c3", "cat": "k2" }
      ], "omitidos": [], "saldos": {}, "nota": "" },
    "2026-10-15": { "items": [
        { "id": "i3", "tipo": "ingreso", "monto": 40000, "cuenta": "c1", "cat": "k1", "rid": "r1" },
        { "id": "i1", "tipo": "transferencia", "monto": 5000, "cuenta": "c1", "destino": "c4" }
      ], "omitidos": ["r3"], "saldos": { "c1": 59000.10, "c3": "7020" }, "nota": "Cuadré con el banco" }
  }
}`;
