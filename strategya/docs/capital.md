# Mena Capital

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
