# Calendario de Caja

Flujo de caja diario de Mena dentro de Strategya (`/caja`). Porta el artefacto «Calendario de Caja»
con el mismo comportamiento. Todas las cifras salen de los registros de Mena (saldos iniciales,
movimientos, recurrentes y cuadres con su banco); nada se estima ni se rellena.

## Pantallas

| Ruta | Qué hace |
| --- | --- |
| `/caja` | Resumen (puedes gastar hasta…, disponible hoy, deuda en tarjetas, ahorro, por confirmar), calendario del mes y panel del día |
| `/caja/movimientos` | Movimientos registrados del mes, totales y tasa de ahorro |
| `/caja/presupuesto` | Por grupo y categoría: presupuesto, real, viene (planificado), queda y barra de uso |
| `/caja/ajustes` | General (inicio, colchón, margen, tasa US$), cuentas, recurrentes y categorías |
| `/caja/importar` | Sube el JSON del artefacto: revisa, muestra el resumen y reemplaza todo en una transacción |

Para la terminal: `componentes/caja/ResumenCaja.tsx` (`ResumenCaja`, Server Component async).

## Cómo calcula (lib/caja/motor.ts)

- La simulación arranca en **config.inicio** con los saldos iniciales. En tarjetas el saldo inicial es
  la deuda (la posición interna es negativa). Corre día a día hasta el fin del mes visible o hoy + 62
  días, lo que sea más tarde.
- Cada día aplica, en este orden:
  1. Los **movimientos registrados** (ingreso suma a la cuenta, gasto resta, transferencia y pago de
     tarjeta pasan de la cuenta al destino). Si la cuenta ya no existe, el monto cuenta en
     entradas/salidas del día pero no mueve saldos (igual que el artefacto).
  2. Los **recurrentes** que tocan ese día:
     - días fijos del mes (`"15, 30"`; el 31 —o 29, 30— cae el último día en meses más cortos),
       cada N días (contados desde «desde», o desde el inicio) o una sola vez;
     - si está inactivo o fuera de desde/hasta, no ocurre;
     - si ya fue **confirmado** ese día (un movimiento con su `recurrente_id`), no se cuenta dos veces;
     - si está **omitido** ese día, se lista como omitido;
     - **desde hoy en adelante** es *planificado* y se aplica;
     - **antes de hoy sin confirmar** queda *por confirmar* y **no se aplica**.
     - Pago total de tarjeta: el monto es lo que se debe en la tarjeta destino en ese momento.
  3. Los **saldos reales** («cuadrar con tu banco») reemplazan la posición de esa cuenta y dejan la
     diferencia (real − esperado; en tarjeta, en términos de deuda).
- **Disponible** = banco + efectivo. **Estado**: bajo el colchón · cerca del colchón (menos de colchón +
  margen) · holgado.
- **Puedes gastar hasta el <próximo día con ingreso>**: el menor disponible entre hoy y el día antes de ese
  ingreso, menos el colchón (nunca negativo). Sin ingreso a la vista, usa todo el horizonte.
- **Tasa de ahorro** del mes = lo transferido a cuentas de ahorro ÷ ingresos registrados.
- **US$**: se convierte con la tasa propia del movimiento o, si no tiene, con la tasa general de Ajustes.
  *Diferencia con el artefacto*: allí, sin tasa general, se usaba 60. Aquí no se inventa una tasa: el monto
  no se aplica y la pantalla lo avisa.
- Todo con `big.js`; ningún monto pasa por float.

## Formato del JSON a importar

Es el que guarda el artefacto. Los ids se conservan como claves de texto, así las referencias entre
cuentas, categorías y recurrentes siguen valiendo.

```json
{
  "config": { "inicio": "2026-10-01", "colchon": 5000, "margen": 3000, "tasaUSD": 60.25 },
  "cuentas": {
    "<id>": { "nombre": "Banco", "tipo": "banco|efectivo|ahorro|tarjeta", "saldoInicial": 25000, "limite": null, "orden": 1 }
  },
  "categorias": {
    "<id>": { "nombre": "Comida", "grupo": "ingreso|fijo|variable|ahorro|deuda", "presupuesto": 12000 }
  },
  "recurrentes": {
    "<id>": {
      "nombre": "Quincena", "tipo": "ingreso|gasto|transferencia|pago_tarjeta", "monto": 40000, "moneda": "DOP|USD",
      "pagoTotal": false, "cuenta": "<id cuenta>", "destino": "<id cuenta>", "cat": "<id categoría>",
      "frecuencia": "mensual|cada_n|unica", "dias": "15, 30", "cadaN": 14, "fecha": "2026-11-02",
      "desde": "2026-10-01", "hasta": null, "activo": true
    }
  },
  "dias": {
    "2026-10-15": {
      "items": [
        { "id": "<id>", "tipo": "gasto", "monto": 845.37, "moneda": "DOP", "tasa": null, "cuenta": "<id>",
          "destino": null, "cat": "<id>", "nota": "Colmado", "rid": "<id recurrente que confirma>" }
      ],
      "omitidos": ["<id recurrente>"],
      "saldos": { "<id cuenta>": 59000.10 },
      "nota": "texto libre"
    }
  }
}
```

Reglas de lectura (`lib/caja/importar.ts`, con pruebas):

- Los números se leen con su texto exacto (`jsonExacto`); también se aceptan como texto (`"1,500"`,
  `"RD$ 2,000"`: la coma es separador de miles).
- **Errores (no se importa nada)**: JSON inválido, falta `config.inicio` o no es fecha, tipo de cuenta,
  grupo, tipo de movimiento, frecuencia o moneda desconocidos, clave de día que no es fecha, montos que no
  son números.
- **Avisos (se importa igual)**: `colchon` vacío (0), `margen` vacío (3000, el valor por defecto del
  artefacto), movimientos sin monto (0, como los trataba el artefacto), ids de movimiento repetidos (se
  renombran `id-2`), referencias a cuentas, categorías o recurrentes que no existen, montos en US$ sin
  tasa, recurrente «única» sin fecha.
- `frecuencia` vacía = `mensual`; `moneda` vacía = `DOP`; `activo` solo es falso si dice `false`.
- La importación **reemplaza todo** en una transacción (`personal.caja_importar`, SECURITY DEFINER que
  verifica `mercado.es_autorizado()`): si algo falla, no cambia nada.
- Límite práctico: ~900 KB por archivo (las server actions de Next aceptan 1 MB por defecto).

## Base de datos (`supabase/migrations/20261016000700_caja.sql`)

Esquema `personal`, todas con RLS (`mercado.es_autorizado()` para leer y escribir) y grants explícitos:
`caja_config` (una fila), `caja_cuentas`, `caja_categorias`, `caja_recurrentes`, `caja_movimientos`,
`caja_omitidos`, `caja_saldos_reales`, `caja_notas`. Montos en `numeric`. Las referencias entre tablas no
llevan llave foránea (como en el artefacto); la pantalla impide borrar cuentas o categorías en uso.

**Requisito en Supabase**: el esquema `personal` debe estar en *Project Settings → Data API → Exposed
schemas* (además de `mercado`).
