# Portafolio Financiero (antes «Mis inversiones» / Mena Capital)

> **Novedades (oct. 2026):** registro único «Mis cuentas, activos y deudas» enlazado con el Presupuesto,
> Resumen con widgets editables, proyecciones con las líneas de ahorro del Plan del mes y matriz de riesgo 3×3. Ver la
> sección «Registro único» al final.


Finanzas personales de Mena dentro de Strategya: patrimonio, cartera, retorno, riesgo y futuro. Es el
artefacto «Mena Capital» llevado a la terminal: el mismo modelo de datos y el mismo motor, con montos
exactos (big.js), datos en Supabase con RLS y estilo terminal oscuro.

**Ninguna cifra de Mena vive en el repositorio.** Los datos entran por `/capital/importar` o por los
formularios de cada pestaña. Las pruebas usan ejemplos sintéticos.

## Pantallas

| Ruta | Qué muestra |
| --- | --- |
| `/capital` | Resumen: patrimonio (con cambio contra el mes anterior), movimiento del día (precio vs. tipo de cambio), indicadores clave (fondo de emergencia, tasa de ahorro, TWR, TIR, cobertura pasiva, flujo), puente de patrimonio, tipo de cambio usado y hallazgos. |
| `/capital/cierre` | Cierre del mes partida por partida contra el presupuesto, tarjetas, pasivos, «Cerrar el mes» (congela la foto del patrimonio) y edición del presupuesto. Los meses históricos agregados se pueden convertir a desglose prorrateado. |
| `/capital/cartera` | Posición por clase contra la meta, precios de mercado con su sello, retorno realizado, P&L por posición, instrumentos (alta, edición, baja), libro de transacciones y ajustes (tipo de cambio manual, metas de asignación, banda, máximo por emisor, tarjetas). |
| `/capital/analisis` | Asignación contra la meta, riesgo de tasa (duración modificada), concentración por emisor, escalera de vencimientos, exposición cambiaria, puente completo, indicadores y tus tasas contra las referencias oficiales (TPM e inflación del BCRD, si el módulo RD las guardó). |
| `/capital/futuro` | Proyección por escenario (nominal y real), sensibilidad ±20 % por variable, independencia financiera, edición de escenarios y parámetros generales. |
| `/capital/ips` | Política de inversión de 8 secciones; «marcar como revisada» guarda la fecha. |
| `/capital/importar` | Subir el archivo, revisar el resumen de lo que se va a importar y confirmar. |
| `/capital/exportar` | Descarga JSON en el mismo formato que se importa (respaldo). |

Todas aceptan `?mes=AAAA-MM`. La pestaña «Mercado» del artefacto quedó repartida: el tipo de cambio y
el movimiento del día en Resumen; los diferenciales y vencimientos contra la referencia en Análisis. Las
cotizaciones generales están en la terminal de Strategya.

Para la terminal principal se exportan dos Server Components async que leen sus propios datos:
`ResumenCapital` (patrimonio, cambio del mes, líquidos, fondo de emergencia en meses) y
`HallazgosCapital` (`componentes/capital/ResumenCapital.tsx`).

## Formato del archivo de importación

Exactamente la forma que guarda el artefacto. Cualquier clave puede faltar:

```json
{
  "parametros": {
    "fx": { "DOP": 1, "USD": 0, "EUR": 0 }, "fxUpdated": "AAAA-MM-DD",
    "inflacion": 0, "tasaRetiro": 0, "aporteMensual": 0, "retornoObjetivo": 0, "incrAporteAnual": 0,
    "horizonte": 0, "metaFondo": 0, "metaAhorro": 0, "metaUsoTC": 0,
    "metaAsignacion": { "efectivo": 0, "ahorros": 0, "rentafija": 0, "accionesusa": 0 },
    "bandaRebalanceo": 0, "maxEmisor": 0,
    "escenarios": [{ "id": "base", "nom": "Base", "retorno": 0, "inflacion": 0, "deprecFX": 0, "aporte": 0 }],
    "tarjetas": [{ "id": "tc-1", "nombre": "…", "limite": 0 }],
    "ingresos": [{ "id": "in-1", "nombre": "…", "pres": 0 }], "fijos": [], "variables": [], "aportes": []
  },
  "activos": [{ "id": "a1", "clase": "efectivo|ahorros|rentafija|accionesusa", "nombre": "…", "inst": "…",
                "simbolo": "solo acciones", "moneda": "DOP|USD|EUR", "cantidad": 0, "precio": 1, "tasa": 0,
                "venc": "AAAA-MM-DD", "tipoRF": "acumula|cupon" }],
  "transacciones": [{ "id": "t1", "activoId": "a1", "simbolo": "…", "tipo": "compra|venta|dividendo|interes",
                      "fecha": "AAAA-MM-DD", "cantidad": 0, "precio": 0, "comision": 0, "moneda": "USD" }],
  "cierres": { "AAAA-MM": { "agregado": false, "totIngresos": 0, "totFijos": 0, "totVariables": 0, "totAportes": 0,
                            "ingresos": { "in-1": 0 }, "fijos": {}, "variables": {}, "aportes": {},
                            "tarjetas": { "tc-1": { "uso": 0, "full": true } },
                            "deudas": { "tc": 0, "prestamos": 0, "otras": 0 },
                            "snap": { "activos": 0, "pasivos": 0, "patrimonio": 0, "liquidos": 0,
                                      "ingresoPasivoAnual": 0, "fecha": "AAAA-MM-DD", "fx": { "USD": 0, "EUR": 0 } },
                            "cerrado": true, "nota": "…" } },
  "ips": { "horizonte": "", "objetivo": "", "tolerancia": "", "liquidez": "", "restricciones": "",
           "rebalanceo": "", "emisores": "", "revision": "", "editadoPor": "borrador|mena", "revisadoEl": null }
}
```

- Tasas como **fracción** (0.045 = 4.5 %). En los formularios se escriben en %.
- Los números pueden venir como número JSON o como texto. Se leen **sin pasar por float**
  (`jsonExacto`) y se guardan como texto decimal (`aDecimal`): `60.25` sigue siendo `60.25`.
- También se aceptan los nombres del almacenamiento local del artefacto (`P`, `ACTIVOS`, `TX`,
  `CIERRES`, `IPS`). `MERCADO` se ignora: los datos de mercado los trae Strategya de sus fuentes.
- Validación completa antes de guardar (`lib/capital/validar.ts`): clase, moneda, tipo, fechas reales,
  meses `AAAA-MM`, ids únicos, rangos de tasas, booleanos. Cada error dice su ruta
  (`activos[3].cantidad: «uno» no es un número`). Con un solo error no se importa nada.
- Al confirmar, cada sección **presente** reemplaza por completo a la guardada; las ausentes no se
  tocan. Todo pasa en una transacción (`personal.importar_capital`, SECURITY DEFINER que verifica
  `mercado.es_autorizado()`): o entra todo o no entra nada.
- Límites: 2 MB, 500 activos, 5000 transacciones, 600 meses.

## Datos

Migración `supabase/migrations/20261016000600_capital.sql`.

| Tabla | Contenido |
| --- | --- |
| `personal.parametros` | Una fila (`id = 1`): el objeto P en jsonb, números como texto. |
| `personal.activos` | Un instrumento por fila: clase, nombre, institución, símbolo, moneda, cantidad, precio, tasa (numeric), vencimiento, tipo de renta fija. |
| `personal.transacciones` | Libro de compras, ventas, dividendos e intereses. Sin llave foránea a activos (sobrevive a la baja del instrumento, como en el artefacto). |
| `personal.cierres` | Un mes por fila (`AAAA-MM`), jsonb con montos por partida, tarjetas, deudas y la foto del patrimonio. |
| `personal.ips` | Una fila, jsonb con las 8 secciones. |
| `mercado.cotizaciones_cartera` | Precio por símbolo y día (Finnhub): precio, cierre anterior, cambio, hora del dato. |

RLS: todas las tablas `personal.*` con una política `for all` (`using` y `with check`
`mercado.es_autorizado()`); `mercado.cotizaciones_cartera` solo lectura para Mena, escritura
`service_role`. Los jsonb se validan en TypeScript al escribir y otra vez al leer.

`mercado.simbolos_cartera()` (SECURITY DEFINER, solo `service_role`) devuelve los símbolos de las acciones
de `personal.activos`: la ingesta nunca lee cifras personales.

## Tipo de cambio y precios

- **US$**: el último `USDDOP_VENTA` de `mercado.observaciones` (BCRD). Si no existe, el tipo manual de
  los parámetros. La pantalla siempre dice cuál se usó y de qué fecha; el manual se marca
  DESACTUALIZADO a los 45 días.
- **€**: no hay serie EUR/DOP en el catálogo; siempre el manual (dicho en pantalla).
- Una moneda sin tipo de cambio **no** vale 1 (el artefacto hacía eso): el instrumento queda fuera del
  total y aparece un hallazgo.
- **Acciones**: la cotización más reciente de `mercado.cotizaciones_cartera`; sin ella, el precio manual
  del instrumento, dicho en pantalla.

Tarea `precios-cartera` (`supabase/functions/_shared/fuentes/precios-cartera.ts`): Finnhub
`/api/v1/quote?symbol=<s>&token=<FINNHUB_API_KEY>`, respuesta `{c, d, dp, h, l, o, pc, t}` leída con
`jsonExacto`. Fecha del dato = día de Nueva York de `t`. Un símbolo desconocido (todo en 0) no produce
fila. Sin `FINNHUB_API_KEY` termina en `parcial` sin llamar a nada. Horario: 21:30 UTC (5:30 PM RD) de
lunes a viernes, después del cierre de Nueva York en verano y en invierno.

## Motor (`lib/capital/`)

| Archivo | Funciones |
| --- | --- |
| `posicion.ts` | tipo de cambio vigente, precio vigente, valor por activo, posición por clase/moneda/emisor |
| `cierres.ts` | totales por grupo, tarjetas, pasivos, fotos (congelada / en vivo), indicadores del mes, cambio del mes |
| `retorno.ts` | serie de retorno, TWR (Dietz modificado), XIRR (bisección), TIR global, base de costo y P&L, retorno por posición |
| `riesgo.ts` | duración modificada, riesgo, puente de patrimonio con efecto cambiario, asignación contra meta, diferenciales, vencimientos contra la referencia |
| `futuro.ts` | proyección, escenarios, sensibilidad ±20 % |
| `impacto.ts` | movimiento del día (precio vs. tipo de cambio) |
| `alertas.ts` | hallazgos del mes |
| `validar.ts`, `importar.ts`, `formulario.ts` | validación, importación/exportación, lectura de formularios |

Montos con big.js. Las potencias fraccionarias (anualización del TWR, tasa mensual equivalente,
duración, descuento por inflación) y la TIR por bisección usan float: son aproximaciones por método, se
convierten a Big con 15 cifras antes de multiplicar montos y se muestran redondeadas.

Diferencias deliberadas con el artefacto:

- Sin recomendaciones: «Comprar / Reducir / Mantener» pasó a «bajo meta / sobre meta / en banda», y los
  hallazgos describen la cifra y la meta sin decir qué hacer.
- Razones sin denominador (sin gasto, sin ingresos) se muestran «—», no 0.
- Un precio manual 0 vale 0 (el artefacto lo convertía en 1); vacío sigue valiendo 1 (saldos).
- Las alertas de una meta se apagan si la meta es 0 (no configurada).
- Sin el diagnóstico con IA del artefacto (ver el módulo de IA de Strategya).
- Sin semillas: sin datos, cada panel dice qué falta.

## Puesta en marcha

1. Supabase → Project Settings → Data API → **Exposed schemas**: agregar `personal` (además de `mercado`).
2. Supabase → Edge Functions → Secrets: `FINNHUB_API_KEY` (la misma clave del módulo de mercado sirve).
3. Abrir `/capital/importar`, subir el archivo del artefacto, revisar y confirmar.

## Registro único «Mis cuentas, activos y deudas» (migración `20261023000100_registro_unico.sql`)

**Una sola verdad.** `personal.activos` es el registro único: las 4 clases de inversión, `otros` (vehículo,
inmueble, otro bien; `subtipo`) y las deudas `tarjeta`, `prestamo`, `deuda` (en una deuda `cantidad` = lo que se
debe). Columnas nuevas: `subtipo` (ahorros: `corriente`/`ahorro`), `saldo_fecha` (saldo al EMPEZAR ese día; la app
guarda el de hoy como «empezar mañana»), `limite`, `dia_pago`, `cuota`, `origen` (`portafolio` | `presupuesto` |
`tarjetas`), `unido_a` (fila archivada al unir), y el plan: `capitaliza`, `frecuencia_pago`, `reinvierte`,
`aporte_pct`, `plan_inicio`. Las pruebas de esquema exigen que no haya tablas nuevas en `personal`: por eso todo
vive en tablas existentes.

**Enlace con el Presupuesto.** `personal.caja_cuentas.registro_id` (FK única a `personal.activos`, `on delete
restrict`). Triggers:

- `caja_cuentas_antes`: una cuenta creada desde el Presupuesto (asistente, Configuración, importación) sin
  `registro_id` se crea en el registro en el mismo paso; con `registro_id`, nombre/tipo/límite salen del registro
  (solo saldos en RD$: ni US$, ni acciones, ni bienes).
- `caja_cuentas_despues` y `activos_despues`: los cambios de nombre, tipo, límite y saldo pasan al otro lado. Un
  saldo escrito en el Portafolio entra a la línea de tiempo del Presupuesto como cuadre del día anterior (o como
  saldo inicial si es de la fecha de inicio). Bandera `personal.sinc` para no llamarse en bucle.
- Tipo del Presupuesto: efectivo → `efectivo`, ahorros/corriente → `banco`, demás ahorros y renta fija →
  `ahorro`, tarjeta → `tarjeta`, préstamo y otra deuda → `prestamo` (tipo nuevo en el Presupuesto, se mueve como
  deuda; la «deuda en tarjetas» sigue contando solo tarjetas).

**Saldo vigente** (`lib/capital/registro.ts · conSaldosVigentes`): para una fila enlazada, la posición de su cuenta
al cierre de hoy con el mismo motor del Presupuesto (`simular`) sin los fijos aún no confirmados; si no está
enlazada, lo escrito. El Portafolio y el Presupuesto muestran el mismo número.

**Conversión de lo que había** (sin adivinar): cada `caja_cuentas` se copia como fila del registro
(`origen = presupuesto`, con su id si está libre; si choca, `id-1`), cada tarjeta de `parametros.tarjetas` como
deuda con su MISMO id (los cierres guardan el uso por ese id; `cantidad 0`, `saldo_fecha` vacío = «sin dato»). Los
parámetros no se tocan. Nada se empareja solo: `sugerirUniones` propone pares (mismo nombre, palabras o institución
en común, único efectivo) y Mena confirma en «Unir cuentas repetidas» (`personal.unir_registro(queda, se_va,
saldo?, fecha?)`, SECURITY INVOKER): queda la fila del Portafolio con su id e historial; la otra se archiva
(`unido_a`), nunca se borra. Las decisiones «son distintas» y «ya revisé» viven en `personal.preferencias`
(clave `registro`, sin cifras).

**Importaciones:** `importar_capital` reemplaza solo instrumentos del Portafolio no enlazados y no pisa el saldo
de las cuentas que usa el Presupuesto; `caja_importar` conserva el enlace por id de cuenta y nunca borra filas del
registro.

## Resumen con widgets

`/capital` usa la rejilla del Dashboard (`componentes/dashboard/Rejilla.tsx`, ahora con `clave`) y el catálogo
`WIDGETS_PORTAFOLIO` (`lib/dashboard/widgets.ts`), guardado en `personal.preferencias` clave `portafolio`.
Componentes en `componentes/capital/WidgetsPortafolio.tsx`.

## Proyecciones con las líneas del Plan del mes (Núcleo v2, `lib/capital/proyeccion.ts`, con pruebas)

Reglas completas en [`manual-financiero.md`](manual-financiero.md). Cada fila de `personal.activos` tiene un `tipo`
del catálogo (`lib/finanzas/catalogo.ts`; columna `tipo`, `tipo_confirmado`, y lo elegible: `capitaliza`, `paga_a`,
`retencion`, `comision_admin`, `plazo_dias`, `renovaciones`, `tiene_debito`, `cargos_cuota`; cada cambio de tipo se
anota en `cambios_tipo`). El tipo decide cómo rinde en la proyección: cuenta de ahorro con tasa 0; alto rendimiento
capitaliza; certificado **elegible** (sin elegir, su interés no se proyecta y se pide elegir); mutuo con renovaciones
manuales (`lib/finanzas/mutuo.ts`); bono y acción pagan a una cuenta; fondo abierto implícito en el valor cuota.
Retención por defecto 10 % en certificados; comisión de puesto de bolsa opcional («no confirmada» si falta).

Aportes = **exactamente** las líneas de «Lo que planeaste ahorrar este mes» (`aportesProyeccion` en
`lib/finanzas/plan.ts`): cada fijo de ahorro e inversión del Presupuesto hacia un instrumento exacto, en su moneda.
Se acabaron el reparto por porcentajes (`parametros.planClases`, `aporte_pct`), «Sí, lo hice / Omitir este mes»,
«De meses anteriores» y «¿a dónde va su parte?» de los vencidos: esos datos viejos quedan en la base sin usarse (no se
borró nada; no se convirtieron a montos porque no había montos equivalentes) y la pantalla lo dice en una línea. Una
línea se marca hecha registrando la transferencia (`registrarLinea`).

El € se valora con el cruce BCE EUR/USD × BCRD USD/DOP de la misma fecha (`cruceEurDop`); el € manual de Ajustes ya
no se usa (se conserva lo guardado).

## Matriz de riesgo (`lib/capital/matriz.ts`, con pruebas)

Cuatro riesgos (liquidez y colchón, concentración, dólar, presupuesto y deuda) en impacto × probabilidad
(bajo/medio/alto). Umbrales en `parametros.umbrales` (Ajustes): colchón 6 meses, 25 % por instrumento, 40 % por
SAFI/emisor, dólar 20–50 %, gasto > 10 % sobre lo presupuestado = alto, tarjetas > 30 % del ingreso mensual = alto.
Cada riesgo dice qué evalúa, el dato que lo dispara con su fuente y qué se puede hacer, sin recomendar inversiones.
Los avisos puntuales de antes (vencimientos, tipo de cambio viejo…) siguen bajo «Otros avisos del mes».

## Fase F (oct. 2026)

- **Aportes del mes** y **vencidos «¿a dónde va su parte?»**: reemplazados en el Núcleo v2 por las líneas del Plan del
  mes (ver «Proyecciones…» arriba). `lib/capital/aportes.ts` ya no existe.
- **Préstamos y tarjetas**: el saldo de una deuda enlazada baja solo por el capital de cada pago (ver docs/caja.md).
- **Ajustes → «Revisar conexión con el Presupuesto»** (`lib/capital/conexion.ts`): por cada cuenta enlazada, el saldo
  de hoy en Mis cuentas y en el calendario del Presupuesto, ✓ o la diferencia y por qué (fijos de hoy sin confirmar,
  nombre/tipo/límite/moneda distintos, saldo escrito que no llegó). Solo lee.
- **Mis cuentas**: al pulsar Guardar, el botón cambia al instante a «Guardando…» con un aviso de lo que se guarda
  (`BotonEnviar`, `useFormStatus`); borrar una fila pide confirmación.
- **Velocidad**: `datosCapital()` y `leerCaja()` se leen una sola vez por petición (React `cache`) y cada página empieza a
  leerlos de inmediato (`precargarCapital`). Lo de `mercado` (dólar, precios, referencias) pasa por la caché
  compartida (README §12).

## Tarjetas: ciclo y doble moneda (migración `20261028000100_tarjetas_ciclo.sql`)

Pedido de Mena: el día de corte, los días para pagar y el día en que quiere pagar; y el límite en pesos y en dólares.

- **Columnas nuevas en `personal.activos`** (sin tablas nuevas: las pruebas de esquema fijan la lista): `dia_corte`
  (1–31), `dias_para_pagar` (1–60), `limite_usd`, `saldo_usd` y `saldo_usd_fecha` (el saldo en US$ al EMPEZAR ese
  día, como `cantidad`/`saldo_fecha`). Restricciones: el ciclo solo en tarjetas (`activos_ciclo_check`); la parte en
  US$ solo en tarjetas en RD$ (`activos_doble_moneda_check`).
- **`dia_pago` no se movió.** Ya decía «día del mes en que pagas»; en una tarjeta ahora se llama «día en que quieres
  pagar», que es lo mismo, así que el valor que estaba se queda tal cual (decisión: no copiar a otra columna para no
  tener dos verdades). En un préstamo sigue siendo el día de la cuota. Las tarjetas que ya existían (las dos de Mena)
  quedan en RD$ con las columnas nuevas vacías: nada cambia hasta que él las complete.
- **Fechas del ciclo** (`lib/caja/ciclo.ts`, puro, con pruebas): corte = ese día del mes (o el último día si el mes
  es más corto); fecha límite = corte + N días naturales; pago elegido = la primera fecha del rango (corte, límite]
  con el día elegido (el 31 cae el último día del mes, como los pagos fijos). Si no cae en el rango: «tu día de pago
  cae después de la fecha límite» y se sugiere la fecha límite. El ciclo que se muestra es el **vigente**: el que ya
  cortó y aún no vence o, si no hay, el del próximo corte. Ejemplo de las pruebas: corte 15 nov 2026, 28 días →
  límite 13 dic; quiere pagar el 30 → 30 nov, le sobran 13 días.
- **Mis cuentas**: la tarjeta pide límite en RD$ y en US$, lo que debes en cada moneda y el ciclo. La fila muestra
  «Corte 15 nov · pagas el 30 nov · fecha límite 13 dic»; la ficha, además, el uso del límite por moneda
  (saldo ÷ límite) y el total en RD$. No se aceptan nombres con 4 o más dígitos seguidos en tarjetas (ni los 4
  últimos).
- **Total en RD$** (`registro.ts · usoTarjeta`, `valorRegistro`): la parte en US$ × dólar de venta del BCRD
  (`dolarBcrdHoy`: solo si es del BCRD y de los últimos 7 días; un tipo escrito a mano no sirve). La pantalla dice
  tasa, fecha y fuente. Sin ese dato, la parte en US$ **no se suma** al patrimonio, a la deuda de tarjetas ni a la
  matriz de riesgo, y se dice «no confirmado» (balance, hallazgos y la celda «Presupuesto y deuda»).
- **Saldo vigente en US$**: si la tarjeta está en el Presupuesto, lo escrito + los pagos y cargos a su parte en US$
  (ver docs/caja.md); si no, lo escrito.
- **Hallazgos**: fecha límite en 3 días o menos sin pago anotado desde el corte (en tarjetas fuera del Presupuesto lo
  dice: no vemos sus pagos), día de pago fuera del ciclo y parte en US$ sin dólar del BCRD.
- `unir_registro` también conserva el ciclo y la parte en US$ de la que se archiva, y sus cuadres «<cuenta>#usd».
