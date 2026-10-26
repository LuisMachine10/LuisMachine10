# Boletín y Bitácora por reglas (Etapa E)

Cuatro correos que se arman **solos, sin inteligencia artificial**: plantillas fijas + los datos que
Strategya ya guardó. Reemplazan las tareas programadas de Claude que hacían lo mismo gastando créditos.

| Edición | Cuándo sale (hora RD) | UTC (pg_cron) | Llega antes de | Largo |
| --- | --- | --- | --- | --- |
| Bitácora Financiera · AM | lunes a viernes 7:35 AM | `35 11 * * 1-5` | 8:00 AM | ~650 palabras |
| Bitácora Financiera · Cierre | lunes a viernes 5:05 PM | `5 21 * * 1-5` | 5:30 PM | ~650 |
| Bitácora Financiera · Fin de semana · Materias primas | sábado y domingo 7:35 AM | `35 11 * * 0,6` | 8:00 AM | ~650 |
| Boletín de Tasas RD | lunes 6:40 AM | `40 10 * * 1` | 7:00 AM | ~500 |

RD es UTC−4 todo el año. Cada edición tiene una **segunda pasada 10 minutos después** (`…-reintento`)
que solo reenvía si la primera falló.

## Reglas

- Ninguna cifra sale de un modelo de lenguaje: el texto es plantilla + datos. Una prueba revisa que el
  texto final no tenga ningún número que no esté en los datos de entrada (`verificar.ts › numerosAjenos`).
- Cada cifra lleva fuente (con enlace) y fecha del dato. Si falta: «no confirmado». Si es vieja según la
  misma lógica de frescura de la app (intradía: solo corre con el mercado abierto): «dato viejo» con su fecha.
- «¿Por qué?» de Las 5 del día = el titular guardado más reciente (24 h) que menciona el activo, según un
  diccionario fijo de palabras clave por serie (`diccionario.ts`). Si no hay: «causa no confirmada».
- No es asesoría: ninguna recomendación. El comparador de tasas dice que no lo es.
- Sin números de cuenta ni nombres de cuentas: «Tu dinero» lleva solo totales, con una excepción pedida para las
  tarjetas: «Pagos de tarjeta en los próximos 7 días» nombra cada tarjeta por el nombre que le puso Mena, sin
  ningún número (se quitan las secuencias de 3 o más dígitos; las tarjetas no aceptan 4 dígitos seguidos en el
  nombre), con la fecha elegida para pagar y la fecha límite.

## Contenido

- **AM**: resumen de 3 líneas, alertas de 24 h, Las 5 del día (|cambio %| frente a su umbral habitual:
  el de la regla de alerta, o 1 % índices, 1.5 % metales y tasas, 2 % energía, 0.5 % divisas), Mercados,
  RD (dólar BCRD compra/venta, TPM, inflación, 3 combustibles, última subasta, SIMV nuevo desde la edición
  anterior), Guerras y mundo (solo titular + enlace), Agenda 7 días, Tu dinero, Glosario, Fuentes y No confirmado.
- **Cierre**: qué cambió frente a la AM de hoy (diferencia de nivel; lo que no se movió no se repite),
  alertas desde la AM, Las 5, dólar BCRD si cambió, titulares nuevos, agenda de mañana.
- **Fin de semana**: cierre semanal viernes contra viernes anterior de energía y metales, S&P y dólar de
  contexto, combustibles MICM; el domingo empieza por la agenda de la semana que viene.
- **Tasas RD**: TPM, tasas activas y pasivas del BCRD con su mes, subastas, SIMV de la semana, fondos por
  SAFI (abiertos RD$, abiertos US$, cerrados) con 30 y 360/365 días y fecha de corte, comparador corto y
  «Pendiente».

Si el texto pasa del largo, se recorta lo menos importante (glosario, titulares, agenda…); el glosario solo
se quita si el exceso pasa de 5 %.

## Dónde vive cada cosa

```
supabase/functions/_shared/boletin/   armado puro (corre en Deno y en Next): tipos, formato, horario,
                                      diccionario, armar.ts, render.ts (texto y HTML), verificar.ts
supabase/functions/_shared/fuentes/boletin.ts   tareas boletin-am|cierre|finde|tasas|prueba
supabase/migrations/20261026000100_boletin.sql  tablas, funciones, RLS y horarios
lib/datos-boletin.ts, lib/boletin/*             lecturas, foto de «Tu dinero», preferencias
app/boletin/…                                   lista, edición, vista previa y el HTML del correo
componentes/boletin/…                           página de la edición, controles, panel de Ajustes
```

## Base de datos

- `mercado.boletin_ediciones`: una fila por edición (tipo, fecha RD, asunto, `contenido` JSON, texto, HTML,
  estado `armando | lista | enviada | sin_envio | error`, error). Índice único `(tipo, fecha)` fuera de las
  pruebas. **Por qué en `mercado`**: la prueba del esquema `personal` fija su lista de tablas y una edición
  es sobre todo información de mercado. Las que llevan «Tu dinero» tienen `dueno` y RLS: solo las lee su
  dueño (`dueno = auth.uid()`) y además debe estar autorizado.
- `mercado.boletin_tu_dinero`: la foto de «Tu dinero» (patrimonio y cambio del mes, aportes pendientes,
  riesgos altos y, desde las tarjetas con ciclo, el ciclo vigente y el siguiente de cada una: `tarjetas`) calculada por la app con el motor del Portafolio cada vez que abres el Dashboard, el
  Portafolio o el Boletín (como mucho cada 20 min). Misma RLS de dueño. La utilidad neta del mes sale en
  vivo de `personal.resultado_mes`. Si la foto tiene más de 48 h, el correo dice «dato viejo».
- `mercado.boletin_datos(tipo, ahora)`: todo lo que necesita una edición en un viaje (la usan la Edge
  Function y la vista previa). `boletin_reservar` da la idempotencia: una por tipo y día; si falló, se
  puede reintentar; si ya salió, no se repite. Resend recibe además `Idempotency-Key`.
- `mercado.boletin_pedir_prueba(tipo)`: «Enviar prueba» (una cada 2 min) → tarea `boletin-prueba`.
- Preferencias: `personal.preferencias`, clave `boletin` (`am`, `cierre`, `finde`, `tasas`, `tu_dinero`;
  lo no guardado vale «sí»).

## Secretos y variables

Ninguno nuevo es obligatorio. Usa `RESEND_API_KEY` (ya existía). El destino sale del secreto opcional
`BOLETIN_PARA` (uno o varios correos separados por coma) o, si no está, del correo del usuario dueño en la
base; nunca del código. Opcional: variable `STRATEGYA_URL_APP` (enlaces a la app en el correo). Sin
`RESEND_API_KEY`, la edición queda guardada como «Sin envío» y se ve en `/boletin`.

La prueba de humo del despliegue no corre las tareas del Boletín (no envía correos a deshora).
