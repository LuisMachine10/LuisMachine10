# Strategya

Terminal personal de inteligencia financiera de Mena: mercados globales, República Dominicana,
tasas y noticias, actualizada sola. Moneda base RD$, secundaria USD. Privada, de un solo usuario.

**Regla de la casa: ninguna cifra sale de un modelo de lenguaje.** Cada número viene de una
fuente con nombre, enlace y fecha del dato. Si un dato no llegó, la pantalla dice «sin datos» o
«desactualizado»; nunca rellena.

> **¿Primera vez?** Lee [`docs/GUIA.md`](docs/GUIA.md): cómo activarla en 10 minutos y cómo usar cada pantalla.

## Estado: todas las fases construidas, listas para desplegar

| Módulo | Qué hace | Pantalla |
| --- | --- | --- |
| Terminal | Las 17 secciones en una página: cinta, mapa, Las 5 del día, guerras, índices, acciones, fusiones e IPO, metales, energía, tasas y divisas, RD, boletín de tasas, emisiones, instituciones, agenda, glosario y pie con fuentes y «no confirmado». | `/` |
| Mercado en vivo | FMP (índices, oro, plata, Brent, divisas, BTC; con presupuesto diario de llamadas) y Finnhub (ETF, cobre por CPER como sustituto). Tasas de la Fed y del BCE. | `/mercado` |
| República Dominicana | Dólar y TPM del BCRD, tasas activas y pasivas, combustibles del MICM, subastas de Hacienda, SIMV (solo su feed). | `/rd`, `/carga` |
| Noticias e instituciones | GDELT, RSS de prensa, Fed, BCE, BoJ, BoE, BIS, Tesoro, CEPAL, índice diario de la SEC (fusiones e IPO), agenda. | `/noticias` |
| Alertas e IA | Umbrales editables, correo con Resend, porqués y resúmenes con Claude (tope mensual; una cifra que no esté en los datos se rechaza). | `/ajustes` |
| Globo «ojo de Dios» | Globo 3D (adaptado de God's Eye View) con bolsas, noticias y guerras, RD, pasos marítimos, sismos (USGS), ciclones (NHC) y, opcional, buques en los pasos (AISStream). | `/globo` |
| Mena Capital | Patrimonio, cartera, cierres, retorno (TWR/TIR), riesgo y futuro; importa el JSON del artefacto. Sin recomendaciones. | `/capital` |
| Calendario de Caja | Calendario de flujo de caja con recurrentes, presupuesto y «puedes gastar hasta»; importa el JSON del artefacto. | `/caja` |
| Boletín | Bitácora AM, Cierre, Fin de semana y Tasas RD por correo (Resend), armados por reglas sin IA; lista, vista previa y prueba. Ver [`docs/boletin.md`](docs/boletin.md). | `/boletin` |
| Estado | Cada lectura automática con su última corrida, filas y error. | `/estado` |

---

## 1. Cuentas que necesitas

| Cuenta | Para qué | Plan |
| --- | --- | --- |
| GitHub | Código; despliega todo solo en cada push | Ya la tienes |
| [Supabase](https://supabase.com) | Base de datos, login, tareas programadas, Edge Functions | Free para empezar |
| [Vercel](https://vercel.com) | Publicar la app | Hobby (gratis, uso personal) |
| [FMP](https://financialmodelingprep.com) | Cotizaciones | La que ya tienes |
| [Finnhub](https://finnhub.io) | ETF (cobre por CPER) y precios de tu cartera | Free |
| [Resend](https://resend.com) | Correo de alertas | Free |
| [Anthropic](https://console.anthropic.com) | Porqués y resúmenes con IA (opcional) | Pago por uso, con tope |
| [AISStream](https://aisstream.io) | Buques en los pasos marítimos (opcional, apagado) | Free |

## 2. Desplegar

El trabajo `desplegar` de **«Strategya · pruebas»** (`.github/workflows/strategya-ci.yml`) despliega todo
después de que pasan las pruebas, en cada push a la rama de trabajo o a la principal. Si faltan los
secretos, avisa y no hace nada.

1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

   | Secreto | Valor | ¿Obligatorio? |
   | --- | --- | --- |
   | `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens | Sí |
   | `VERCEL_TOKEN` | Vercel → Account Settings → Tokens | Sí |
   | `STRATEGYA_EMAIL` | tu correo (para entrar y para recibir alertas) | Sí |
   | `STRATEGYA_CLAVE` | la contraseña con la que vas a entrar (larga) | Sí |
   | `FMP_API_KEY` | FMP → Dashboard | Sí, para cotizaciones |
   | `FINNHUB_API_KEY` | Finnhub → Dashboard | Sí, para ETF y cartera |
   | `RESEND_API_KEY` | Resend → API Keys | Para alertas por correo |
   | `ANTHROPIC_API_KEY` | Anthropic Console → API Keys | Para la IA |
   | `AISSTREAM_API_KEY` | AISStream → API Keys | Solo si activas los buques |
   | `BOLETIN_PARA` | correo(s) del Boletín, separados por coma | No: sin él va al correo del usuario dueño |
   | `SUPABASE_PROJECT_REF` | lo que va antes de `.supabase.co` | Solo si tienes varios proyectos |

   Variables (pestaña **Variables**, no secretos): `GLOBO_AIS_ACTIVO` = `1` para encender los buques
   (si no existe o vale otra cosa, la tarea no se conecta y no consume nada).

2. Haz un push (o vuelve a correr el último «Strategya · pruebas»). El despliegue:
   - crea el proyecto `strategya` en Supabase si no existe (o usa el único que tengas);
   - aplica las migraciones, expone los esquemas `mercado` y `personal`, desactiva el registro de usuarios;
   - crea tu usuario con `STRATEGYA_EMAIL` / `STRATEGYA_CLAVE` y lo autoriza;
   - sube la Edge Function `ingesta` con sus secretos y programa las tareas con pg_cron;
   - crea el proyecto en Vercel con sus variables y publica la app;
   - al final imprime la URL de Strategya.

## 3. Variables de entorno

Todas documentadas en [`.env.example`](.env.example). Las carga el despliegue; no hace falta tocarlas a mano.

| Dónde | Variable | Nota |
| --- | --- | --- |
| Vercel | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | La clave publicable es pública por diseño; RLS protege los datos. Llega al navegador solo para escuchar Realtime (la cinta se refresca sola). |
| Vercel | `STRATEGYA_EMAIL_DUENO` | El único correo que puede entrar. |
| Supabase (secrets) | `STRATEGYA_SECRETO_TAREAS` | Lo genera el despliegue; igual al guardado en Vault. |
| Supabase (secrets) | `STRATEGYA_CONTACTO`, `ALERTAS_EMAIL_DESTINO` | Tu correo (User-Agent para la SEC y destino de alertas). |
| Supabase (secrets) | `FMP_API_KEY`, `FMP_LLAMADAS_DIA` (240), `FINNHUB_API_KEY` | Sin clave, cada tarea queda «parcial» con el motivo y no llama a nada. |
| Supabase (secrets) | `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `IA_TOPE_MENSUAL_USD` (10) | Opcionales. |
| Supabase (secrets) | `AISSTREAM_API_KEY`, `GLOBO_AIS_ACTIVO` | Opcionales; los buques solo corren con ambos. |

La clave de servidor (service role) **nunca** sale de Supabase: la usa solo la Edge Function.

## 4. Cómo funciona la ingesta

```
pg_cron (UTC) ──► mercado.invocar_tarea('ingesta', '{"tarea":"<nombre>"}')
                     │  lee URL y secreto de Vault
                     ▼
              pg_net POST /functions/v1/ingesta  (x-strategya-secreto)
                     ▼
              Edge Function (Deno)
                ├─ abre una corrida en mercado.corridas
                ├─ robots.txt del sitio → ¿se permite?  (403 o caído = no se lee)
                ├─ GET con tiempo máximo y 3 reintentos con espera creciente
                ├─ parser → filas con los números como TEXTO (nunca float)
                ├─ mercado.registrar_observaciones(...)  inserta / corrige / ignora repetidas
                │     y calcula el cambio diario en numeric
                └─ cierra la corrida: ok · parcial · error, con el motivo
```

Si una fuente falla, el último dato bueno se queda en pantalla con su fecha y se marca
**DESACTUALIZADO** cuando pasa su antigüedad máxima (`series.max_antiguedad_min`). El error
aparece en `/estado`.

Cada tarea tiene su horario en su migración (en UTC; RD es UTC−4 todo el año). Ejemplos: Tesoro
6:15 PM y 7:45 PM de lunes a viernes y 7:00 AM de lunes a sábado; cotizaciones cada 5 minutos (el
planificador decide cuántas llamadas gastar); BCRD 9:00 AM y 4:00 PM; sismos cada 15 minutos.
`/estado` muestra la última corrida de cada una.

## 5. Cómo agregar una fuente nueva

1. **Sonda primero.** Agrega la URL a [`sondas/urls.txt`](sondas/urls.txt) y haz push: el workflow
   «Strategya · sonda de fuentes» confirma en GitHub Actions el endpoint, el formato y el robots.txt
   (este contenedor de desarrollo no tiene salida a esos sitios). Guarda la respuesta real en
   `pruebas/muestras/<fuente>/`.
2. **Catálogo.** Migración nueva en `supabase/migrations/` con la fila en `mercado.fuentes`
   (incluye `notas_de_uso` y `lectura_automatica`) y sus `mercado.series`.
3. **Parser.** `supabase/functions/_shared/fuentes/<fuente>.ts`: una función pura que recibe el
   texto y devuelve `FilaObservacion[]`, y un objeto `Tarea`. Pruebas con la muestra real al lado.
4. **Registro.** Importa la tarea en `supabase/functions/_shared/tareas.ts` y súmala a `LISTA`.
5. **Horario.** En la migración: `select cron.schedule('strategya-<fuente>', '<cron UTC>', $$select mercado.invocar_tarea('ingesta', '{"tarea":"<fuente>"}')$$);`
   Una prueba falla si programas una tarea que no está en el registro.
6. **Despliegue.** Nada que hacer: el siguiente push la sube con la función `ingesta`.

Dominios prohibidos (no se leen nunca, la regla está en código y en prueba):
`calculadora.apislab.bvrd.com.do`, `bhdfondos.com.do`. Sus datos entran por `mercado.carga_manual`.

## 6. Cómo cambiar un umbral de alerta

En **Ajustes** (`/ajustes`): cada regla tiene su umbral, un interruptor «Activa» y una nota. Se guarda
al instante y se usa en la siguiente evaluación (después de cada ingesta). Una alerta por activo y día.

## 7. Pruebas

```bash
cd strategya
npm install
npm test              # parsers de cada fuente, robots.txt, HTTP, planificador, motores de Capital y Caja, globo
npm run test:db       # migraciones + RLS + ingesta de punta a punta (necesita Postgres 15+)
npm run typecheck     # TypeScript estricto
npm run check:funciones   # deno check de la Edge Function ingesta
npm run build
```

`test:db` crea bases temporales en el Postgres de `DATABASE_URL_PRUEBAS`, carga un simulador de
lo que Supabase trae de fábrica (`auth.uid()`, Vault, pg_net, pg_cron) y aplica las migraciones
reales. En GitHub corre todo en cada push («Strategya · pruebas»).

## 8. Costo mensual estimado

| Servicio | Solo Tesoro | Con todo funcionando | Nota |
| --- | --- | --- | --- |
| Vercel Hobby | US$0 | US$0 | Uso personal no comercial. Su cron solo corre 1 vez al día, por eso los horarios viven en Supabase. |
| Supabase Free | US$0 | US$0 – 25 | Free: 500 MB de base y **pausa tras 7 días con poca actividad** (documentación oficial). 500 mil invocaciones de Edge Functions al mes según fuentes secundarias: confirmar en supabase.com/pricing. Pro (US$25) quita la pausa. |
| FMP | — | tu plan actual | 240 llamadas al día por defecto (`FMP_LLAMADAS_DIA`). |
| Finnhub | — | US$0 | Plan gratis (60 llamadas por minuto). |
| AISStream | — | US$0 | Opcional y apagado. |
| Resend (correo) | — | US$0 | Plan gratis. |
| Anthropic (IA) | — | ≤ US$10 | Tope mensual configurable (`IA_TOPE_MENSUAL_USD`). |
| GitHub Actions | US$0 | US$0 | Repositorio público. |

Uso esperado en Supabase Free: solo el Tesoro hace ~70 invocaciones al mes. Con cotizaciones cada
5 minutos y el resto de fuentes, entre 15 y 40 mil al mes (3–8% de ese límite). El dato que más pesa
en la base serán las cotizaciones intradía: hay una política de retención
(intradía 7 días, luego un cierre por día) para no pasar de 500 MB.

## 9. Hallazgos de la sonda de fuentes (15 oct 2026)

| Fuente | Resultado | Consecuencia |
| --- | --- | --- |
| Tesoro EE. UU. | robots.txt `Allow: /`; XML con 14 plazos (incluye 6 semanas) | Curva diaria de punta a punta |
| SIMV | **403 de Cloudflare** en las páginas y en robots.txt; su feed RSS (`/feed/`) sí responde | Se lee solo el feed (la vía que el sitio publica para máquinas); las resoluciones entran por carga manual |
| SEC | robots.txt prohíbe `/cgi-bin/` (donde vive el feed Atom de 8-K/S-1) | Se usan los índices diarios de EDGAR (`/Archives/edgar/daily-index/`, permitidos) |
| BCE | Permite el RSS; pide `Crawl-delay: 5` | El lector espera 5 s entre llamadas al BCE |
| BCRD, Crédito Público | Sin robots.txt real (responden una página HTML) | Se pueden leer; se hará con la cortesía de 2 veces al día |
| MICM, Fed, BoJ | Sin restricciones | — |
| GDELT | 429 desde las IP compartidas de GitHub | Una consulta por corrida cada 10 min; si responde 429, la corrida queda parcial con el motivo |
| FMI, OCDE, OFAC | 403 | No se leen; el panel de instituciones lo dice |
| FMP (tu plan) | Niega DAX, WTI, gas natural y DXY | Se muestran sus ETF sustitutos (USO, UNG, UUP), rotulados |

## 10. Estructura

```
strategya/
  app/                    páginas: /, /mercado, /rd, /carga, /noticias, /globo, /capital, /caja, /ajustes, /estado, /login
  componentes/            una carpeta por módulo + piezas comunes (encabezado, sello de fuente, error)
  lib/                    formato exacto de cifras, frescura, horarios de mercado, motores de Capital y Caja, acceso a datos
  estilos/                CSS de cada módulo (usa las variables de app/globals.css)
  proxy.ts                sesión de Supabase y acceso solo del dueño
  supabase/
    migrations/           esquema, catálogo, tareas programadas, un archivo por módulo
    functions/_shared/    HTTP + robots.txt + orquestador + una fuente por archivo en fuentes/
    functions/ingesta/    la única Edge Function: corre la tarea que pide pg_cron
  despliegue/             despliegue automático (Supabase + Vercel) desde GitHub Actions
  pruebas/
    muestras/             respuestas reales de las fuentes (las SINTÉTICAS lo dicen en el nombre)
    db/                   pruebas contra Postgres
  sondas/                 verificación de endpoints en GitHub Actions
  THIRD_PARTY_NOTICES.md  licencia de God's Eye View (MIT) y atribuciones de datos del globo
```

## 11. El globo y God's Eye View

`/globo` adapta piezas de [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) (MIT, © 2026
Bilawal Sidhu): el visor CesiumJS sin claves, la validación de los datos de USGS y NHC y el manejo de la
conexión con AISStream. Cada archivo adaptado lo dice arriba y la licencia completa está en
`THIRD_PARTY_NOTICES.md`. Se dejaron fuera, a propósito, las cámaras (CCTV y lectores de placas), Street
View, tráfico simulado, vuelos y satélites, la voz con OpenAI, los mosaicos 3D de Google (cuestan) y los
cables submarinos de TeleGeography (licencia no comercial). Cesium se copia a `public/cesium` al instalar
(`scripts/copiar-cesium.mjs`); si el navegador no tiene WebGL, el globo cae a un mapa 2D con las mismas capas.

## 12. Caché y mantenimiento (Fase F)

- **Caché de `mercado`** (`lib/supabase/cache-mercado.ts`): las lecturas del esquema `mercado` (iguales para todos:
  cotizaciones, dólar BCRD, RD, noticias, agenda, Tesoro, precios de la cartera) pasan por `unstable_cache` de Next
  con `revalidate` (60 s cotizaciones y movimientos, 120 s noticias y Portafolio, 300 s RD, Tesoro, agenda, dólar)
  y etiquetas (`mercado`, `mercado:rd`…). Se eligió el modelo sin Cache Components (`"use cache"` exige
  `cacheComponents`, incompatible con las páginas `force-dynamic` actuales). Antes de usar la caché se exige la sesión
  del dueño; dentro no se leen cookies (la consulta va con el token de esa sesión, que no es parte de la clave). La
  carga manual invalida la etiqueta (`revalidateTag(…, { expire: 0 })`); lo que trae la ingesta se ve al vencer el
  tiempo. **Nada del esquema `personal` se cachea entre peticiones**: solo se comparte dentro de la misma petición
  (React `cache`).
- **Limpieza de pg_cron** (`20261027000200_mantenimiento_cron.sql`): tarea semanal `strategya-limpiar-historial-cron`
  (domingo 04:17 UTC) que borra `cron.job_run_details` de más de 14 días. La limpieza diaria `strategya-limpieza` ya
  recortaba a 7 días; esta es la red de seguridad semanal.
