# Presupuesto (antes «Calendario de Caja»)

Presupuesto de Mena dentro de Strategya (`/caja`, en el menú «Presupuesto»): su mes como un **estado de
resultados** (presupuestado contra real) y el **calendario de caja** día por día. El calendario porta el
artefacto «Calendario de Caja» con el mismo comportamiento. Todas las cifras salen de los registros de Mena (saldos iniciales,
movimientos, recurrentes y cuadres con su banco); nada se estima ni se rellena.

## Pantallas

| Ruta | Pestaña | Qué hace |
| --- | --- | --- |
| `/caja` | Calendario | Puedes gastar hasta…, disponible hoy, deuda en tarjetas, «¿Ya se hizo?», calendario del mes y panel del día |
| `/caja/plan` | Plan del mes | Núcleo v2 (manual, sección C): Ingreso + Otros ingresos − Costos − Gastos − 1.º Ahorro e inversión − 2.º Pagos = SOBRANTE, plan contra real; líneas de ahorro (instrumento + monto, hecha / a medias / por hacer); cobros de inversiones como Otros ingresos; pagos de tarjeta (varios por ciclo) con el uso del crédito antes y después |
| `/caja/movimientos` | Movimientos | Lo anotado o marcado como hecho en el mes, por día; asignar categoría a lo que no la tiene |
| `/caja/resultados` | Estado de resultados | El mes: presupuestado, real, diferencia (a favor / en contra) y % cumplido, con barras |
| `/caja/ajustes` | Configuración | **El único lugar** de las categorías (por tipo) con sus fijos y su monto adicional; cuentas; general; importar |
| `/caja/presupuesto` | — | Ruta vieja: lleva a `/caja/resultados` |
| `/caja/importar` | — | Ruta vieja: lleva a Configuración → Avanzado |

Para el Dashboard y News: `componentes/caja/ResumenCaja.tsx` (`ResumenCaja({ ahora? })`, Server Component
async): utilidad neta del mes (presupuestado vs. real), ingresos, gastos, puedes gastar, «¿Ya se hizo?» y
lo que viene en 7 días.

## Las cuentas salen del Portafolio (registro único)

Las cuentas del Presupuesto son las de Portafolio → Mis cuentas (`caja_cuentas.registro_id`, ver docs/capital.md).
Núcleo v2: **todas** las filas del registro de tipos que pagan o reciben dinero se enlazan **solas**
(`personal.enlazar_registro()`, trigger al crear o cambiar una fila; la migración `20261029000100_nucleo_v2.sql` enlazó
las existentes sin borrar nada). Ya no existen «Usar una cuenta que ya está en tu Portafolio» ni «Quitar del
Presupuesto». Cada formulario muestra solo las cuentas que sirven según su tipo (`lib/finanzas/catalogo.ts`, la misma
tabla que valida la base: trigger `caja_validar_cuentas`). Las inversiones por unidades (acciones, fondos por cuotas)
no viven en el Presupuesto: se eligen como destino de un ahorro o origen de un rescate («r:<id>» → `registro_destino` /
`registro_origen`). El asistente ya no pide un monto de ahorro: el ahorro se arma en Plan del mes, línea por línea.
Tipo de cuenta `prestamo` (deuda, como la tarjeta); los **cargos dentro de la cuota** (`caja_movimientos.cargos`) son
gasto aparte y no bajan la deuda. El saldo de hoy es el mismo en las dos pantallas. Reglas completas en
[`manual-financiero.md`](manual-financiero.md).

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
- **US$** (Fase F, `lib/caja/tasas.ts`): se convierte con la tasa propia del movimiento o, si no tiene, con el
  **dólar de venta oficial del BCRD de la fecha** (`USDDOP_VENTA`: el último publicado hasta esa fecha, como
  mucho 7 días antes; una fecha futura usa el de hoy). Sin ninguna: «no confirmado», no se aplica ni se suma, y
  la pantalla lo avisa. La pantalla dice qué tasa se usó (propia o «BCRD del AAAA-MM-DD», con enlace). La tasa
  general de Configuración ya no se usa para convertir (queda guardada solo para importar/exportar). El € no
  aplica: no hay serie oficial EUR/DOP y `caja_movimientos` solo admite DOP y US$.
- Todo con `big.js`; ningún monto pasa por float.

## Fase F: cuentas en US$ y pagos de deudas (migración `20261027000100_deudas_y_dolares.sql`)

- **Cuentas en US$.** `caja_cuentas.moneda` (`DOP` | `USD`) sale del registro único: una cuenta en US$ de Mis cuentas
  se puede usar en el Presupuesto. Su saldo inicial, cuadres y posición van en US$; sus movimientos se guardan en su
  moneda. Mover entre una cuenta en RD$ y una en US$ usa la tasa del movimiento o la del BCRD del día. El disponible,
  los totales y el estado de resultados van en RD$ (la cuenta en US$ × dólar BCRD del día; sin dato, no se suma y se
  avisa). La moneda no cambia mientras el Presupuesto usa la cuenta (trigger `activos_despues`). € no se enlaza.
- **Pago de tarjeta o préstamo** (`tipo = pago_tarjeta`, destino = tarjeta o préstamo). `caja_movimientos.interes` =
  la parte que fue interés o cargos: la deuda baja solo por `monto − interes` y el interés es **gasto financiero**
  (en la categoría de gasto financiero del pago, o en «Intereses de tus deudas»). Al guardar
  (`lib/caja/deudas.ts · separarPago`): si Mena escribe «¿cuánto fue capital?», manda eso; si no, en un **préstamo con
  tasa** en el Portafolio, interés = lo que se debía al cierre del día anterior × tasa ÷ 12 (a centavos, nunca más que
  el pago); sin tasa (o tarjeta): todo capital. El interés queda guardado en el movimiento: el Presupuesto, Mis cuentas
  y los cierres usan la misma cifra. `personal.resultado_mes` suma ese interés como gasto financiero (las pruebas de base
  comparan SQL y TypeScript).
- `personal.tasa_usd_bcrd(fecha)`: el dólar del BCRD vigente en esa fecha (misma regla que `tasaBcrd`).

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

## Tarjetas: ciclo y doble moneda (migración `20261028000100_tarjetas_ciclo.sql`)

- **Lo que viene del registro.** `leerCaja` pide, por cada cuenta enlazada, su fila del registro (`COLUMNAS_ENLACE`)
  y `filas.ts · conRegistro` le pone a cada tarjeta su `ciclo`, su `diaPago` y, si es una tarjeta en RD$ con parte en
  dólares, `usd = { saldoInicial, limite }`. El saldo en US$ escrito en Mis cuentas después del inicio entra como un
  cuadre **sintético** de «<id>#usd» (no se guarda en `caja_saldos_reales` y no se exporta).
- **Motor**: la parte en US$ es una segunda posición en US$ (clave `claveUSD(id)` = «<id>#usd»). Un pago va a la parte
  que diga `parte` (`caja_movimientos.parte` y `caja_recurrentes.parte`: `DOP` | `USD`; vacío = según la moneda del
  monto); un cargo en US$ a la tarjeta va a su parte en US$. Pagar la parte en US$ desde una cuenta en RD$ convierte
  con la tasa del movimiento o el dólar del BCRD de la fecha; sin ninguna, no se aplica y se avisa. Pago total a la
  parte en US$ = lo que se debe en dólares ese día. «Deuda en tarjetas» del día suma las dos partes (US$ × dólar del
  BCRD del día; sin él, esa parte no se suma y se avisa). La parte en US$ se cuadra en el panel del día («<tarjeta>
  (parte en US$)»).
- **Formulario**: si el destino de un «Pago de tarjeta o préstamo» (o de un pago fijo) es una tarjeta en dos monedas,
  aparece «¿A qué parte de la tarjeta va el pago?» (RD$ / US$); con la parte en US$ desde pesos se pide la tasa
  (opcional: vacía = BCRD del día).
- **Calendario**: cada tarjeta con ciclo marca **C** (corte), **P** (día en que quieres pagar) y **L** (fecha límite);
  el panel del día lo explica y dice si ya hay un pago anotado del ciclo. Arriba, el aviso «la fecha límite de pago es
  en N días… y no hay pago anotado desde el corte» cuando faltan 3 días o menos (`vista.ts · avisosTarjetas`).
- **El pago fijo sigue al día elegido**: el trigger `activos_dia_pago` cambia el día de los pagos fijos mensuales de UN
  solo día de esa tarjeta cuando cambia su «día en que quieres pagar» (los de varios días, como «15, 30», no se tocan).
- **Configuración → Tus cuentas**: al editar una tarjeta se escriben el límite en US$ y el ciclo (se guardan en el
  registro); lo que debes en US$ se escribe en Mis cuentas.
- `personal.caja_importar` guarda también `parte` de pagos y fijos. `resultado_mes` no cambia: la parte no mueve el
  estado de resultados (el monto del pago y su interés siguen igual).
