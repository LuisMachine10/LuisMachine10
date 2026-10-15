# Convenciones de Strategya

Reglas para escribir código en este proyecto. Valen para personas y para agentes.

## 1. Reglas de la casa (no negociables)

1. **Ninguna cifra sale de un modelo de lenguaje.** Cada número viene de una fuente con nombre, enlace y
   fecha del dato. La IA solo redacta texto a partir de datos y titulares ya guardados.
2. **Nada inventado.** Si un dato no llegó, la pantalla dice «sin datos», «no confirmado» o
   «desactualizado». Nunca se rellena, interpola ni estima.
3. **Dinero y tasas exactos.** `numeric` en Postgres; en TypeScript, texto + `big.js`. Nunca `parseFloat`
   ni `Number()` para montos o tasas que se guardan o se muestran. (Se permite `Number()` solo para ubicar
   un punto en un gráfico.) Las APIs JSON se leen con `jsonExacto` y se normalizan con `aDecimal`
   (`supabase/functions/_shared/json.ts`).
4. **Respeto a las fuentes.** Páginas y archivos públicos se leen con `ctx.obtener()` (robots.txt +
   Crawl-delay + lista de dominios prohibidos). APIs con clave se llaman con `ctx.api()`. Si una fuente
   bloquea (403, Cloudflare, `Disallow`), no se esquiva: la tarea termina en `omitida` o `error` con el
   motivo, y el dato pasa a carga manual. Prohibido: cambiar el User-Agent para parecer un navegador,
   rotar IPs, usar navegadores sin cabeza, o leer Yahoo Finance / Google Finance.
5. **Español** en toda la interfaz y en los mensajes de error que ve Mena. Hora de RD
   (`America/Santo_Domingo`, UTC−4, sin horario de verano). Moneda base RD$, secundaria US$.
6. **Nada personal en el repositorio** (es público): ni cifras de Mena, ni correos, ni claves. Los datos de
   Mena Capital entran por la pantalla de importación, nunca por migraciones ni pruebas.
7. **No es asesoría de inversión.** Sin recomendaciones de compra o venta.

## 2. Dónde vive cada cosa

```
app/                      páginas (App Router). Server Components por defecto.
componentes/              componentes de UI. Los interactivos llevan "use client".
estilos/<modulo>.css      CSS de cada módulo, importado desde sus componentes. Usa los tokens de app/globals.css.
lib/                      lógica de la app (sin red): formato, frescura, armado de datos para pantalla.
lib/datos-<modulo>.ts     lecturas de Supabase de cada módulo ("server-only").
supabase/migrations/      SQL. Un archivo por módulo y fecha (ver §4).
supabase/functions/ingesta/index.ts        la ÚNICA Edge Function de ingesta.
supabase/functions/_shared/tareas.ts        registro de tareas.
supabase/functions/_shared/fuentes/<x>.ts   una tarea por fuente: parser puro + objeto Tarea.
pruebas/muestras/<fuente>/                  respuestas REALES de cada fuente (no se editan a mano).
pruebas/db/                                 pruebas contra Postgres.
pruebas/apoyo/                              almacenes de prueba (memoria y Postgres).
```

## 3. Ingesta

- Una tarea es `{ nombre, fuenteId, ejecutar(ctx) }` (`_shared/ingesta.ts`). `nombre` en minúsculas con
  guiones (`cotizaciones-fmp`). Se registra en `_shared/tareas.ts`.
- `ctx.obtener(url)` (GET público con robots), `ctx.api(url, {metodo, encabezados, cuerpo})` (API con
  clave), `ctx.entorno("FMP_API_KEY")`, `ctx.registrar(filas)` (observaciones), `ctx.guardar(tabla,
  filas, {conflicto, ignorarDuplicados})` (otras tablas de `mercado`), `ctx.rpc(funcion, args)`.
- El parser es una función pura `parsearX(texto, ...) → filas` con pruebas sobre la muestra real.
- Si falta una clave de API: la tarea devuelve `{ parcial: true, advertencias: ["Falta FMP_API_KEY"] }`
  sin llamar a nada. Nunca lanza por eso.
- Las claves nunca aparecen en errores: usa `ocultarClaves(url)`.
- Horario: en la migración del módulo,
  `select cron.schedule('strategya-<tarea>', '<cron UTC>', $$select mercado.invocar_tarea('ingesta', '{"tarea":"<tarea>"}')$$);`
  pg_cron corre en UTC; RD = UTC−4. Nueva York cambia de horario: si el horario depende del mercado,
  programa cada 5 min y decide dentro de la tarea con `lib/mercados.ts` / `_shared/mercados.ts`.
- Presupuesto de llamadas: FMP tiene `FMP_LLAMADAS_DIA` (por defecto 240). Cuenta las llamadas en la base
  y no lo pases.

## 4. Base de datos

- **Migraciones por módulo** (nombre = orden de aplicación):
  `20261016000100_catalogo` (base) · `…000200_mercado_vivo` · `…000300_rd` · `…000400_noticias` ·
  `…000500_alertas_ia` · `…000600_capital` · `…000700_caja`. Si un módulo necesita más, usa
  `…0002NN`, `…0003NN`, etc. dentro de su centena.
- **Ids de series del catálogo** (`20261016000100_catalogo.sql`): son el contrato entre módulos.
  Mercados: `IDX_SPX IDX_DJI IDX_IXIC IDX_RUT IDX_STOXX50E IDX_FTSE IDX_GDAXI IDX_N225 IDX_HSI ORO PLATA
  BRENT WTI GAS_NATURAL EURUSD USDJPY DXY BTC` (FMP) · `COBRE_CPER ETF_SPY ETF_QQQ ETF_DIA ETF_IWM ETF_GLD
  ETF_SLV ETF_USO ETF_BNO ETF_UNG ETF_UUP ETF_IBIT` (Finnhub) · `TASA_FED_SUP TASA_FED_INF TASA_BCE_DEP
  TASA_BOJ` · RD: `USDDOP_COMPRA USDDOP_VENTA TPM_BCRD INFLACION_RD` · Tesoro: `UST_1M … UST_30A`.
  Un módulo puede crear series nuevas en su migración (prefijo propio: `TASA_ACT_MN_*`, `COMB_*`…).
- Lectura: RLS `using ((select mercado.es_autorizado()))` en toda tabla nueva, también en `personal`.
  Escritura de datos de mercado: solo `service_role`. Tablas que Mena edita (carga manual, umbrales,
  Mena Capital, Caja): políticas de insert/update/delete con `mercado.es_autorizado()`.
- Permisos explícitos en cada migración (los esquemas propios no los heredan):
  `grant select on mercado.x to authenticated; grant all on mercado.x to service_role;`.
- Realtime: `alter publication supabase_realtime add table mercado.<tabla>;`.
- Explicaciones (`mercado.explicaciones`): `tipo='porque'` (por serie, 1–2 oraciones), `'cinco_del_dia'`,
  `'guerras'`. `fuentes` = `[{"titulo","url"}]`. La pantalla muestra la más reciente de las últimas 24 h.

## 5. Pantalla

- Datos: Server Components leen con `lib/datos-<modulo>.ts`, usando `mercado()` o `personal()` de
  `lib/supabase/servidor.ts`. Números siempre `col::text` en el `select`.
- Formato: `lib/formato.ts` (`cifra`, `cifraConSigno`, `puntosBasicos`, `fechaCorta`, `horaRD`, `hace`).
- Cada cifra lleva `SelloFuente` (fuente con enlace, fecha del dato, verificado hace X, DESACTUALIZADO).
- Estilo terminal: fondo `#0A0E13`, paneles `#10161D`, bordes `#1E2833`, ámbar `#F5A623`, sube `#4CC38A`,
  baja `#FF7A6E`, RD `#5AA9FF`. Plex Sans Condensed para texto, Plex Mono para cifras. Primero celular:
  sin scroll horizontal de página a 390 px; tablas anchas dentro de `.desplazable`.
- Sube/baja nunca solo por color: flecha ↑ ↓ y signo.
- Accesible: encabezados, `aria-label` en gráficos, tabla equivalente para cada gráfico.
- Un panel sin datos dice por qué y cuándo llegan, nunca muestra ceros inventados.

## 6. Pruebas

- `npm test` (unitarias), `npm run test:db` (Postgres real; cada archivo crea su propia base con nombre
  único `strategya_pruebas_<modulo>_<tema>`), `npm run typecheck`,
  `npm run check:funciones` (Deno), `npm run build`. Todo debe pasar antes de entregar.
- Parsers: prueba con la muestra real de `pruebas/muestras/` (nunca una inventada si hay real). Si no hay
  muestra real, construye la mínima según la documentación y márcala `// SINTÉTICA: reemplazar por real`.
