# Strategya · guía

Dos partes: **activar** (una sola vez, unos 10 minutos, se puede hacer desde el celular) y **usar**
(el día a día).

---

## Parte 1 · Activar (una sola vez)

Necesitas 5 datos. Los 2 primeros salen de dos cuentas gratuitas; los otros 3 ya los tienes.
Todos se guardan en GitHub como «secretos» (GitHub los cifra; nadie los ve, ni siquiera en el código,
que es público). **Nunca los pegues en un chat ni en un correo.**

### Paso 1 · Token de Supabase (la base de datos) — 2 minutos

1. Abre <https://supabase.com/dashboard/sign-up> y entra con **Continue with GitHub** (usa tu misma
   cuenta de GitHub; no hay que crear contraseña).
2. Abre <https://supabase.com/dashboard/account/tokens> → **Generate new token** → nombre: `strategya`
   → **Generate token**.
3. **Copia** el token (empieza con `sbp_`). Solo se muestra una vez.

Si Supabase te pide crear una **organización**, ponle cualquier nombre y elige el plan **Free**.
No crees ningún proyecto: Strategya lo crea solo.

### Paso 2 · Token de Vercel (la página web) — 2 minutos

1. Abre <https://vercel.com/signup> → **Hobby** → **Continue with GitHub**.
2. Abre <https://vercel.com/account/settings/tokens> → nombre: `strategya` → Scope: tu cuenta →
   Expiration: **No Expiration** → **Create**.
3. **Copia** el token.

### Paso 3 · Tu clave de FMP — 1 minuto

Entra a <https://site.financialmodelingprep.com/developer/docs/dashboard> y copia tu **API Key**.

### Paso 4 · Guardar los 5 secretos en GitHub — 5 minutos

Abre esta dirección (desde el navegador, no desde la app de GitHub):

<https://github.com/LuisMachine10/LuisMachine10/settings/secrets/actions/new>

Cada secreto es un formulario: **Name** (copia el nombre exacto de la tabla) y **Secret** (el valor).
Pulsa **Add secret** y vuelve a abrir la misma dirección para el siguiente.

| Name (exacto) | Secret (el valor) |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | el token del paso 1 (`sbp_…`) |
| `VERCEL_TOKEN` | el token del paso 2 |
| `STRATEGYA_EMAIL` | tu correo (con el que vas a entrar y donde llegan las alertas) |
| `STRATEGYA_CLAVE` | la contraseña que quieras para entrar a Strategya (larga; no la de tu correo) |
| `FMP_API_KEY` | la clave del paso 3 |

### Paso 5 · Avísame

Escribe **«listo»**. Yo lanzo el despliegue y te paso la dirección de tu terminal. Tarda unos
15 minutos. Antes de que llegue ese «listo» no hace falta nada más.

### Opcionales (cuando quieras, mismo formulario del paso 4)

| Name | Para qué | Dónde se saca |
| --- | --- | --- |
| `FINNHUB_API_KEY` | ETF (cobre por CPER) y precios de tu cartera en Mena Capital | <https://finnhub.io/register> → Dashboard → API Key |
| `RESEND_API_KEY` | que las alertas lleguen a tu correo | <https://resend.com/signup> → API Keys → Create |
| `ANTHROPIC_API_KEY` | «Las 5 del día», «Guerras» y los «¿por qué?» redactados (tope US$10 al mes) | <https://console.anthropic.com> → API Keys |
| `AISSTREAM_API_KEY` | barcos en los pasos marítimos del Globo | <https://aisstream.io> → API Keys |

Sin estas, Strategya funciona igual: esas secciones dicen «no activo» y explican qué falta.

---

## Parte 2 · Usar Strategya

### Entrar

Abre la dirección que te paso, escribe tu correo y la contraseña de `STRATEGYA_CLAVE`. Solo tu correo
puede entrar. **Salir** está arriba a la derecha.

### Cómo leer cada cifra

Cada número trae debajo su **sello**: fuente (con enlace), fecha del dato y «verificado hace X».

- **DESACTUALIZADO** (rojo): la fuente no ha actualizado dentro de su tiempo normal. La cifra que ves es
  la última buena; no se rellena nada.
- **cierre del vie 16 oct**: el mercado está cerrado; es el último cierre, no un error.
- **sustituto**: no hay acceso al dato directo y se muestra su ETF (por ejemplo, cobre → CPER, WTI → USO).
- **no confirmado / sin datos**: no llegó el dato. Strategya nunca lo inventa.
- Flecha ↑ verde sube, ↓ roja baja.

La página se actualiza sola (precios en vivo y, de respaldo, cada 60 segundos).

### Las pantallas (menú de arriba)

| Pantalla | Qué hay | Cuándo usarla |
| --- | --- | --- |
| **Terminal** | Todo en una página: alertas de hoy, cinta de precios, mapa, Las 5 del día, guerras, índices, acciones, fusiones e IPO, metales, energía, tasas y divisas, curva del Tesoro, RD, boletín de tasas, emisiones, instituciones, agenda, glosario, y el resumen de tu Capital y tu Caja. Al pie: fuentes y todo lo «no confirmado». | Lectura de la mañana y de la tarde. |
| **Mercado** | Índices, metales (oro, plata, cobre), energía, tasas y divisas, mayores alzas y bajas. | Para ver un mercado en detalle. |
| **RD** | Dólar del BCRD (compra/venta y cambio), TPM, inflación, tasas activas y pasivas, combustibles del MICM, subastas de Hacienda (monto, tasa de corte, cobertura), avisos de la SIMV. | Para el día a día dominicano. |
| **Noticias** | Titulares por categoría (mercado, guerra, RD, instituciones), comunicados de Fed, BCE, BoJ, BoE, BIS, Tesoro y CEPAL, fusiones e IPO (SEC), agenda y «qué vigilar». | Para entender el porqué del día. |
| **Globo** | Globo 3D: bolsas (verde/rojo), noticias y guerras, RD, pasos marítimos (Ormuz, Suez, Panamá…), sismos y huracanes. Toca un punto para ver su tarjeta; el botón **Capas** enciende o apaga cada capa. En el celular hay una lista debajo con todos los puntos. | Para ver el mundo de un vistazo y lo que puede mover materias primas. |
| **Capital** | Tu patrimonio (Mena Capital): Resumen, Cierre del mes, Cartera, Análisis, Futuro, Política (IPS) e Importar. Arriba eliges el mes. | Al cierre de cada mes y cuando muevas tu cartera. |
| **Caja** | Tu calendario de caja: «puedes gastar hasta…», disponible, deuda en tarjetas, por confirmar; el calendario del mes, movimientos, presupuesto y ajustes. | A diario o cada vez que cobres o pagues. |
| **Carga** | Formularios para datos que no se leen solos: cualquier serie (por ejemplo, tasa del BoJ), rendimientos de fondos por SAFI, resoluciones de la SIMV y hechos de la BVRD, combustibles. Siempre con el enlace de la fuente. | Cuando veas un dato oficial que Strategya no trae. |
| **Ajustes** | Umbrales de alerta (cámbialos y pulsa Guardar), historial de alertas y gasto de IA del mes. | Para afinar las alertas. |
| **Estado** | Cada lectura automática: cuándo corrió, si salió bien y, si no, por qué. | Si algo se ve desactualizado. |

### Tus datos personales (cuando quieras)

Strategya arranca vacío en Capital y Caja. Tienes dos caminos:

- **Importar** lo que ya tienes en los artefactos: Capital → **Importar** (archivo de Mena Capital) y
  Caja → **Importar** (archivo del Calendario de Caja). Primero te muestra un resumen; nada se guarda
  hasta que confirmas.
- **Escribirlo a mano**:
  - **Capital → Cartera** para tus instrumentos.
  - **Capital → Cierre** para el cierre de cada mes.
  - **Caja → Ajustes** para cuentas, recurrentes, categorías, colchón y tasa del dólar.

En Caja, al tocar un día puedes:
- confirmar, ajustar u omitir lo planificado;
- registrar gastos, ingresos y transferencias;
- usar **Cuadrar con tu banco** para poner el saldo real.

Tus datos personales solo los ves tú (están protegidos por tu usuario) y no forman parte del código.

### Alertas

Se revisan después de cada lectura. Llega una por activo y día:
- en la Terminal (arriba);
- en tu correo, si activaste Resend.

Para cambiar un umbral: **Ajustes** → cambia el número → **Guardar**.

### Horarios (hora RD)

| Qué | Cuándo |
| --- | --- |
| Precios de mercado | cada 5 minutos con el mercado abierto (FMP reparte 240 consultas al día) |
| Dólar y tasas del BCRD | 9:00 AM y 4:00 PM |
| Las 5 del día y Guerras (si activas la IA) | 7:35 AM y 5:05 PM, y con el botón «Actualizar resumen con IA» |
| Noticias | cada 10 minutos |
| Sismos / huracanes | cada 15 / 30 minutos |
| Curva del Tesoro | 6:15 PM y 7:45 PM los días hábiles; 7:00 AM para recuperar |

### Si algo no se ve bien

1. Mira el sello de la cifra (fecha y fuente).
2. Abre **Estado**: dice qué lectura falló y por qué (por ejemplo, «falta la clave» o «el sitio respondió 429»).
3. Escríbeme lo que ves. Si la fuente está caída, Strategya espera y lo vuelve a intentar sola.

**Importante:** el plan gratis de Supabase se pausa si pasan 7 días sin uso. Si un día la terminal no
carga, entra a <https://supabase.com/dashboard>, abre el proyecto `strategya` y pulsa **Restore**.

Strategya no es asesoría de inversión. Ninguna cifra sale de un modelo de lenguaje: la IA solo
redacta explicaciones con datos y titulares guardados, y se rechaza si inventa un número.
