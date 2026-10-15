# Strategya

Terminal personal de inteligencia financiera de Mena: mercados globales, República Dominicana,
tasas y noticias, actualizada sola. Moneda base RD$, secundaria USD. Privada, de un solo usuario.

**Regla de la casa: ninguna cifra sale de un modelo de lenguaje.** Cada número viene de una
fuente con nombre, enlace y fecha del dato. Si un dato no llegó, la pantalla dice «sin datos» o
«desactualizado»; nunca rellena.

## Estado: Fase 1 (base) lista para desplegar

| Pieza | Qué hace |
| --- | --- |
| Esquema `mercado` | Todas las tablas del modelo de datos, con RLS de un solo dueño. Esquema `personal` reservado para Mena Capital. |
| Ingesta del Tesoro | Edge Function que lee el XML oficial de la curva par diaria (14 plazos), revisando robots.txt antes de leer. |
| Tareas programadas | pg_cron la llama 3 veces por día hábil; las corridas quedan registradas. |
| App | Login, terminal con la curva (gráfico + tabla, fuente y hora en cada cifra) y página `/estado`. |
| Pruebas | 58 unitarias + 19 contra Postgres real (migraciones, RLS, ingesta de punta a punta con el XML real). |

*Lista cuando:* abres la URL, inicias sesión y ves la curva del Tesoro con su fecha y hora.

---

## 1. Cuentas que necesitas

| Cuenta | Para qué | Plan |
| --- | --- | --- |
| GitHub | Código y despliegue de Supabase con un clic | Ya la tienes |
| [Supabase](https://supabase.com) | Base de datos, login, tareas programadas, Edge Functions | Free para empezar |
| [Vercel](https://vercel.com) | Publicar la app | Hobby (gratis, uso personal) |

Fases siguientes: proveedor de cotizaciones (Fase 2), Resend para correos (Fase 5), API de
Anthropic (Fase 6).

## 2. Desplegar (unos 20 minutos, una sola vez)

### 2.1 Supabase

1. Crea un proyecto nuevo. Guarda la **contraseña de la base**. Región sugerida: `us-east-1`.
2. **Project Settings → Data API → Exposed schemas**: agrega `mercado` y guarda.
3. **Authentication → Sign In / Providers**: deja Email activo y **desactiva «Allow new users to sign up»**.
4. **Authentication → Users → Add user**: crea tu usuario con tu correo y una contraseña larga
   (marca «Auto Confirm User»).
5. **Account → Access Tokens**: crea un token para GitHub.

### 2.2 GitHub → despliegue de Supabase

1. En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**:

   | Secreto | Valor |
   | --- | --- |
   | `SUPABASE_ACCESS_TOKEN` | el token del paso 2.1.5 |
   | `SUPABASE_PROJECT_REF` | lo que va antes de `.supabase.co` en la URL del proyecto |
   | `SUPABASE_DB_PASSWORD` | la contraseña de la base |
   | `STRATEGYA_SECRETO_TAREAS` | 64 caracteres al azar: `openssl rand -hex 32` (o cualquier generador; solo letras y números) |
   | `STRATEGYA_CONTACTO` | opcional; un correo para el User-Agent |

2. **Actions → «Strategya · desplegar Supabase» → Run workflow.** Aplica las migraciones, sube la
   Edge Function, guarda el secreto en Vault, programa las tareas y hace una primera lectura del
   Tesoro. El último paso imprime el resumen de esa lectura.

3. **Autorízate** (una sola vez). En Supabase → **SQL Editor**:

   ```sql
   insert into mercado.usuarios_autorizados (user_id)
   select id from auth.users where email = 'TU-CORREO';
   ```

   Sin esta fila, RLS no te muestra nada aunque inicies sesión.

### 2.3 Vercel

1. **Add New → Project →** importa este repositorio.
2. **Root Directory: `strategya`** (el repositorio también tiene otra app en la raíz).
3. **Environment Variables** (ver `.env.example`): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   `STRATEGYA_EMAIL_DUENO`.
4. Deploy. Abre la URL, inicia sesión, y deberías ver la curva.

### Sin GitHub Actions (alternativa con la CLI)

```bash
cd strategya
npx supabase login
npx supabase link --project-ref TU_REF
npx supabase db push
npx supabase secrets set STRATEGYA_SECRETO_TAREAS=... STRATEGYA_CONTACTO=...
npx supabase functions deploy ingesta-tesoro --no-verify-jwt
# y en el SQL Editor:
#   select mercado.configurar_tareas('https://TU_REF.supabase.co', 'EL-MISMO-SECRETO');
```

## 3. Variables de entorno

Todas documentadas en [`.env.example`](.env.example). Resumen:

| Dónde | Variable | Nota |
| --- | --- | --- |
| Vercel | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | La clave publicable es pública por diseño; RLS protege los datos. Aun así no se manda al navegador: todo se lee en el servidor. |
| Vercel | `STRATEGYA_EMAIL_DUENO` | El único correo que puede entrar. |
| Supabase (secrets) | `STRATEGYA_SECRETO_TAREAS` | Igual al guardado en Vault. Lo exige cada Edge Function de ingesta. |
| Supabase (secrets) | `STRATEGYA_CONTACTO` | Correo en el User-Agent (obligatorio para la SEC en la Fase 4). |

La clave de servidor (service role) **nunca** sale de Supabase: la usa solo la Edge Function.

## 4. Cómo funciona la ingesta

```
pg_cron (UTC) ──► mercado.invocar_tarea('ingesta-tesoro')
                     │  lee URL y secreto de Vault
                     ▼
              pg_net POST /functions/v1/ingesta-tesoro  (x-strategya-secreto)
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

Horarios del Tesoro (hora RD, UTC−4 todo el año): 6:15 PM y 7:45 PM de lunes a viernes, y
7:00 AM de lunes a sábado para recuperar lo que la noche no vio. Limpieza diaria a las 4:30 AM.

## 5. Cómo agregar una fuente nueva

1. **Sonda primero.** Agrega la URL a [`sondas/urls.txt`](sondas/urls.txt) y haz push: el workflow
   «Strategya · sonda de fuentes» confirma en GitHub Actions el endpoint, el formato y el robots.txt
   (este contenedor de desarrollo no tiene salida a esos sitios). Guarda la respuesta real en
   `pruebas/muestras/<fuente>/`.
2. **Catálogo.** Migración nueva en `supabase/migrations/` con la fila en `mercado.fuentes`
   (incluye `notas_de_uso` y `lectura_automatica`) y sus `mercado.series`.
3. **Parser.** `supabase/functions/_shared/fuentes/<fuente>.ts`: una función pura que recibe el
   texto y devuelve `FilaObservacion[]`, y un objeto `Tarea`. Pruebas con la muestra real al lado.
4. **Edge Function.** Copia `ingesta-tesoro/` (index.ts + deno.json) y cambia la tarea.
5. **Horario.** En la migración: `select cron.schedule('strategya-<fuente>', '<cron UTC>', $$select mercado.invocar_tarea('ingesta-<fuente>')$$);`
6. **Despliegue.** Agrega `supabase functions deploy ingesta-<fuente>` al workflow.

Dominios prohibidos (no se leen nunca, la regla está en código y en prueba):
`calculadora.apislab.bvrd.com.do`, `bhdfondos.com.do`. Sus datos entran por `mercado.carga_manual`.

## 6. Cómo cambiar un umbral de alerta

Las alertas llegan en la Fase 5 con su pantalla de Ajustes. La tabla `mercado.reglas_alerta` ya
existe y Mena puede editar `umbral`, `activa` y `nota` (RLS lo permite solo a ella). Mientras
tanto, desde el SQL Editor (ejemplo con la serie del dólar que se crea en la Fase 3):

```sql
update mercado.reglas_alerta set umbral = 63.50 where serie_id = 'USDDOP_VENTA' and tipo = 'nivel_sobre';
```

## 7. Pruebas

```bash
cd strategya
npm install
npm test              # parsers, robots.txt, cliente HTTP, formato de cifras, frescura, curva
npm run test:db       # migraciones + RLS + ingesta de punta a punta (necesita Postgres 15+)
npm run typecheck     # TypeScript estricto
npx deno check --config supabase/functions/ingesta-tesoro/deno.json supabase/functions/ingesta-tesoro/index.ts
npm run build
```

`test:db` crea bases temporales en el Postgres de `DATABASE_URL_PRUEBAS`, carga un simulador de
lo que Supabase trae de fábrica (`auth.uid()`, Vault, pg_net, pg_cron) y aplica las migraciones
reales. En GitHub corre todo en cada push («Strategya · pruebas»).

## 8. Costo mensual estimado

| Servicio | Fase 1 | Con todo funcionando (Fases 2–7) | Nota |
| --- | --- | --- | --- |
| Vercel Hobby | US$0 | US$0 | Uso personal no comercial. Su cron solo corre 1 vez al día, por eso los horarios viven en Supabase. |
| Supabase Free | US$0 | US$0 – 25 | Free: 500 MB de base y **pausa tras 7 días con poca actividad** (documentación oficial). 500 mil invocaciones de Edge Functions al mes según fuentes secundarias: confirmar en supabase.com/pricing. Pro (US$25) quita la pausa. |
| Proveedor de cotizaciones | — | por decidir | Ver preguntas de la Fase 2. |
| Resend (correo) | — | US$0 | Plan gratis. |
| Anthropic (IA) | — | ≤ US$10 | Tope mensual configurable (`IA_TOPE_MENSUAL_USD`). |
| GitHub Actions | US$0 | US$0 | Repositorio público. |

Uso esperado en Supabase Free: la Fase 1 hace ~70 invocaciones al mes. Con cotizaciones cada
5 minutos y el resto de fuentes, entre 15 y 40 mil al mes (3–8% de ese límite). El dato que más pesa
en la base serán las cotizaciones intradía: la Fase 2 incluye una política de retención
(intradía 7 días, luego un cierre por día) para no pasar de 500 MB.

## 9. Hallazgos de la sonda de fuentes (15 oct 2026)

| Fuente | Resultado | Consecuencia |
| --- | --- | --- |
| Tesoro EE. UU. | robots.txt `Allow: /`; XML con 14 plazos (incluye 6 semanas) | Fase 1 de punta a punta |
| SIMV | **403 de Cloudflare («Sorry, you have been blocked»)** incluso para robots.txt | No se esquiva: carga manual, o pedir acceso a la SIMV |
| SEC | robots.txt prohíbe `/cgi-bin/` (donde vive el feed Atom de 8-K/S-1) | Fase 4 usará los índices diarios de EDGAR (`/Archives/edgar/daily-index/`, permitidos) |
| BCE | Permite el RSS; pide `Crawl-delay: 5` | El lector espera 5 s entre llamadas al BCE |
| BCRD, Crédito Público | Sin robots.txt real (responden una página HTML) | Se pueden leer; se hará con la cortesía de 2 veces al día |
| MICM, Fed, BoJ, GDELT | Sin restricciones | — |

## 10. Estructura

```
strategya/
  app/                    páginas: terminal (/), /login, /estado
  componentes/            encabezado, curva (gráfico + tabla), sello de fuente
  lib/                    formato exacto de cifras, frescura, armado de la curva, acceso a datos
  proxy.ts                sesión de Supabase y acceso solo del dueño
  supabase/
    migrations/           esquema, catálogo, tareas programadas
    functions/_shared/    HTTP + robots.txt + orquestador + parsers (sin Deno ni Node: corre en ambos)
    functions/ingesta-tesoro/
  pruebas/
    muestras/             respuestas reales de las fuentes (no se editan a mano)
    db/                   pruebas contra Postgres
  sondas/                 verificación de endpoints en GitHub Actions
```
