# Presupuesto (antes «Calendario de Caja»)

Presupuesto de Mena dentro de Strategya (`/caja`, en el menú «Presupuesto»): su mes como un **estado de
resultados** (presupuestado contra real) y el **calendario de caja** día por día. El calendario porta el
artefacto «Calendario de Caja» con el mismo comportamiento. Todas las cifras salen de los registros de Mena (saldos iniciales,
movimientos, recurrentes y cuadres con su banco); nada se estima ni se rellena.

## Pantallas

| Ruta | Pestaña | Qué hace |
| --- | --- | --- |
| `/caja` | Calendario | Puedes gastar hasta…, disponible hoy, deuda en tarjetas, «¿Ya se hizo?», calendario del mes y panel del día |
| `/caja/movimientos` | Movimientos | Lo anotado o marcado como hecho en el mes, por día; asignar categoría a lo que no la tiene |
| `/caja/resultados` | Estado de resultados | El mes: presupuestado, real, diferencia (a favor / en contra) y % cumplido, con barras |
| `/caja/ajustes` | Configuración | **El único lugar** de las categorías (por tipo) con sus fijos y su monto adicional; cuentas; general; importar |
| `/caja/presupuesto` | — | Ruta vieja: lleva a `/caja/resultados` |
| `/caja/importar` | — | Ruta vieja: lleva a Configuración → Avanzado |

Para el Dashboard y News: `componentes/caja/ResumenCaja.tsx` (`ResumenCaja({ ahora? })`, Server Component
async): utilidad neta del mes (presupuestado vs. real), ingresos, gastos, puedes gastar, «¿Ya se hizo?» y
lo que viene en 7 días.

## Todo enlazado: la categoría es la única fuente

- Cada categoría tiene un **tipo** = su línea del estado de resultados: `ingreso`, `costo`, `gasto`,
  `gasto_financiero`, `otro_ingreso`, `otro_gasto` y `ahorro_inversion` (destino de la utilidad: lo que va al
  Portafolio).
- Cada pago o cobro fijo (recurrente) y cada movimiento de ingreso o gasto **lleva su categoría**
  (obligatoria en la pantalla). «Mover entre mis cuentas» y el pago de tarjeta no la necesitan; si van a
  ahorro, pueden llevar una de ahorro e inversión.
- **Presupuestado** de una categoría = suma de sus fijos que caen en el mes (RD$) + un **monto adicional**
  opcional que escribe Mena (por ejemplo, la comida del mes).
- **Real** = movimientos del mes (anotados o confirmados con «Sí, ya se hizo»). Un ingreso en una categoría
  de gasto (un reembolso) resta, y al revés.
- Lo que no tiene categoría no se pierde: cae en «Sin categoría» de Ingresos o Gastos, con el aviso
  «Asígnale una categoría» (selector en línea en Configuración, Movimientos y en el «¿Ya se hizo?» del
  calendario). Al enlazar un fijo viejo, si la categoría ya tenía escrito un monto que lo incluía, su
  adicional baja en lo que el fijo pone al mes (para no contarlo dos veces) y se avisa.
- Mover dinero a una cuenta de ahorro sin categoría cuenta como ahorro realizado («Pasado a tus cuentas de
  ahorro»).
- Cálculo: `lib/caja/resultados.ts` (`estadoDeResultados`, con pruebas). En SQL, la misma cuenta en
  `personal.resultado_mes` (las pruebas de base comparan las dos).

```
Ingresos − Costos = Utilidad bruta − Gastos = Utilidad operativa
− Gastos financieros + Otros ingresos − Otros gastos = UTILIDAD NETA
Destino: − Ahorro e inversión = Te queda disponible
```

Diferencia siempre «a favor» positiva: en ingresos, utilidades y ahorro = real − presupuestado; en costos y
gastos = presupuestado − real. % cumplido = real ÷ presupuestado (sin presupuesto: «—»).

## Contrato SQL para el Portafolio

Ambas en `supabase/migrations/20261021000400_presupuesto.sql`, `security invoker` (leen con la RLS de quien
llama: un usuario no autorizado ve ceros; `anon` no puede ejecutarlas), `grant execute` a `authenticated` y
`service_role`. `p_mes` es cualquier día del mes.

- `personal.presupuesto_ahorro_mensual(p_mes date) returns numeric` — lo presupuestado ese mes en las
  categorías `ahorro_inversion` (fijos del mes + adicional), en RD$. Es lo que el Portafolio espera recibir.
- `personal.resultado_mes(p_mes date) returns jsonb` — montos como **texto decimal exacto** (léelos con
  big.js, nunca con `Number`):

```json
{ "mes": "2026-10",
  "presupuestado": { "ingresos": "92000", "costos": "0", "gastos": "75600", "gastos_financieros": "8400",
                     "otros_ingresos": "0", "otros_gastos": "0", "gastos_totales": "84000",
                     "utilidad_bruta": "92000", "utilidad_operativa": "16400", "utilidad_neta": "8000",
                     "ahorro": "5000", "disponible": "3000" },
  "real": { "…las mismas claves…": "", "ahorro": "ahorro realizado" } }
```

`gastos_totales` = costos + gastos + gastos financieros + otros gastos (el ahorro no es gasto).
Auxiliar: `personal.caja_fijos_mes(p_mes)` (fijos que caen en el mes, veces y total en RD$).

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
- **Tasa de ahorro** del mes (Movimientos) = lo transferido a cuentas de ahorro ÷ ingresos registrados.
- **«¿Ya se hizo?»** (antes «por confirmar»): los fijos se planifican solos; en el día, «Sí, ya se hizo» los anota como movimiento (con su categoría) y «Este mes no» los omite.
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
    // o, en el formato nuevo: { "nombre": "Comida", "tipo": "gasto", "adicional": 12000 }
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

## Conversión de la versión anterior (migración `20261021000400_presupuesto.sql`)

Grupos: ingreso→ingreso, fijo→gasto, variable→gasto, ahorro→ahorro_inversion, deuda→gasto_financiero. El
presupuesto viejo (total del mes) pasa a `adicional` descontando lo que ya ponen sus fijos mensuales en RD$
(monto × días distintos; sin bajar de 0). El grupo y el presupuesto de antes quedan en `grupo_v1` y
`presupuesto_v1` (solo referencia). Cuentas, fijos y movimientos no se tocan; los fijos sin categoría se
muestran con el aviso. La importación del JSON del artefacto aplica la misma conversión
(`adicionalDesdeV1`).

## Base de datos (`supabase/migrations/20261016000700_caja.sql` y `20261021000400_presupuesto.sql`)

Esquema `personal`, todas con RLS (`mercado.es_autorizado()` para leer y escribir) y grants explícitos:
`caja_config` (una fila), `caja_cuentas`, `caja_categorias`, `caja_recurrentes`, `caja_movimientos`,
`caja_omitidos`, `caja_saldos_reales`, `caja_notas`. Montos en `numeric`. Las referencias entre tablas no
llevan llave foránea (como en el artefacto); la pantalla impide borrar cuentas o categorías en uso.

**Requisito en Supabase**: el esquema `personal` debe estar en *Project Settings → Data API → Exposed
schemas* (además de `mercado`).
