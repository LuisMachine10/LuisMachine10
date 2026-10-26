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

La primera vez que entras, una bienvenida de 3 pasos explica cómo funciona. Puedes volver a verla en
**Más → Ayuda** (también en **Ajustes → Guía de uso**): una guía por preguntas y respuestas, agrupada por
pantalla y con buscador, más «Cómo leer una cifra».

### Entrar

Abre la dirección que te paso, escribe tu correo y tu contraseña. Solo tu correo puede entrar.
**Salir** está arriba a la derecha (en el celular, dentro de **Más**).

### Cómo leer cada cifra

- **La cifra grande** es el último valor que publicó la fuente.
- **La pastilla de color** dice cuánto se movió: verde sube, rojo baja, gris sin cambio.
- **En pequeño, debajo**: la fuente (con enlace), la fecha del dato y hace cuánto se revisó.
- **Dato viejo** (píldora roja): la fuente no ha publicado en su horario normal; ves la última cifra buena.
- **Cierre del vie 16 oct**: el mercado está cerrado; es el último cierre, no un error.
- **Sin dato**: no llegó la cifra. Strategya nunca la inventa.

La página se actualiza sola.

### Las pantallas

| Pantalla | Qué hay |
| --- | --- |
| **Dashboard** (inicio) | Tu portada armada a tu gusto con tarjetas: las 6 cifras del día (cada una por separado), «Hoy en 30 segundos», Mis noticias, alertas, curva del Tesoro, dólar BCRD, combustibles, fondos, agenda y el rendimiento de tu presupuesto y tu portafolio. Pulsa **Editar mi dashboard** para moverlas (arrastrando o con ↑ ↓), cambiarles el tamaño (S, M, L), ocultarlas o agregarlas; **Listo** guarda. |
| **News** | Cómo amaneció el día en una sola página: «Hoy en 30 segundos», las 6 cifras que más mueven tu dinero, mercados, RD, el mundo y tu dinero. Desde aquí, **Todos los titulares**. |
| **Mercados** | Bolsas del mundo, oro y metales, petróleo, tasas de interés y monedas, con su porqué. |
| **RD** | Dólar del Banco Central, tasas de los bancos, combustibles, subastas de bonos del Gobierno y rendimientos de fondos de inversión (Excel y AFI Reservas se leen solos). |
| **News → Todos los titulares** | Titulares de WSJ, FT, CNBC, Bloomberg Línea, elEconomista, Expansión y prensa dominicana, por tema, más la agenda. |
| **Mapa** | Globo 3D: bolsas, conflictos, rutas de barcos, sismos y huracanes. Toca un punto para ver su tarjeta. |
| **Portafolio Financiero** | Tus finanzas en un solo lugar. **Mis cuentas**: anotas una sola vez tus cuentas, efectivo, inversiones, bienes, tarjetas y préstamos (el Presupuesto usa esas mismas). **Resumen**: tablero de tarjetas que mueves a tu gusto (patrimonio, participación por categoría, retorno esperado, futuro de cada categoría, aportes del mes, puente e indicadores, riesgos). **Proyecciones**: cómo crece tu dinero con el ahorro de tu Presupuesto y el interés compuesto; confirmas cada aporte con «Sí, lo hice». **Riesgos**: matriz de impacto × probabilidad. También Cartera, Cierre, Política (IPS) y Ajustes. |
| **Presupuesto** | Cuánto puedes gastar hoy sin pasarte, los pagos que vienen y el saldo de tus cuentas. La primera vez te guía en 4 pasos; en el paso de cuentas eliges las de tu Portafolio (o agregas una nueva, que queda guardada allí). |
| **Más → Boletín** | Los boletines que te llegan al correo: Bitácora AM (7:35 AM), Cierre (5:05 PM), Fin de semana (sábado y domingo 7:35 AM) y Tasas RD (lunes 6:40 AM). Cada uno se ve igual que el correo. **Vista previa ahora** lo arma con los datos de este momento sin enviarlo; **Enviar prueba** te lo manda solo a ti. Se arman por reglas, sin IA. Detalle en [`boletin.md`](boletin.md). |
| **Más → Agregar un dato** | Para escribir a mano una cifra oficial que no llega sola (por ejemplo, un fondo de BHD), siempre con su enlace. |
| **Más → Ajustes y alertas** | Cuándo quieres que te avisemos (por ejemplo, si el oro sube más de 2 %). |
| **Más → Estado de las fuentes** | Si una cifra se ve vieja, aquí ves qué fuente falló y por qué. |
| **Más → Ayuda** | La guía de uso por preguntas, con buscador. |

En el celular, la barra de abajo trae Dashboard, News, Mercados, Presupuesto, Portafolio y **Más** (RD y Mapa
están dentro de Más).

### Mis noticias (en el Dashboard)

En la tarjeta **Mis noticias** pulsa **Elegir mis noticias**: marca medios y temas, o escribe palabras clave
separadas por comas (por ejemplo: *petróleo, Banco Central*). Solo se muestran titulares ya guardados que
coincidan; si llenas varias partes, el titular debe cumplirlas todas.

### Tus datos personales

Strategya arranca vacío en **Portafolio Financiero** y **Presupuesto**: cada pantalla te dice qué anotar y tiene un
botón azul para empezar. Nunca se piden números de cuenta, tarjeta ni cédula: basta un nombre que reconozcas.
Tus datos solo los ves tú.

**Una sola vez:** las cuentas se anotan en Portafolio → Mis cuentas. El saldo que escribes es el de hoy; lo que
anotes después en el Presupuesto (gastos, ingresos, pagos, «cuadrar con tu banco») lo mueve solo, y las dos
pantallas muestran el mismo saldo. Si antes tenías una cuenta anotada en los dos lugares, Mis cuentas te muestra
una sola vez «Unir cuentas repetidas»: confirmas cada par y nada se borra.

### Boletín por correo

En **Más → Ajustes y alertas → Boletín por correo** marcas qué ediciones quieres recibir y si llevan
«Tu dinero» (tu utilidad del mes, patrimonio, aportes pendientes y riesgos altos; solo te llega a ti).
Necesita `RESEND_API_KEY`; sin ella, las ediciones se guardan y se ven en **Más → Boletín**.

### Alertas

Se revisan después de cada lectura. Llega una por activo y día:
- en News (arriba) y en la tarjeta «Alertas de hoy» del Dashboard;
- en tu correo, si activaste Resend.

Para cambiar un umbral: **Más → Ajustes y alertas** → cambia el número → **Guardar**.

### Horarios (hora RD)

| Qué | Cuándo |
| --- | --- |
| Precios de mercado | cada 5 minutos con el mercado abierto (FMP; sin su clave, Cboe con 15 min de retraso) |
| Fondos de inversión (Excel, AFI Reservas) | 9:10 AM y 6:10 PM |
| Dólar y tasas del BCRD | 9:00 AM y 4:00 PM |
| Las 5 del día y Guerras (si activas la IA) | 7:35 AM y 5:05 PM, y con el botón «Actualizar resumen con IA» |
| Noticias | cada 10 minutos |
| Sismos / huracanes | cada 15 / 30 minutos |
| Curva del Tesoro | 6:15 PM y 7:45 PM los días hábiles; 7:00 AM para recuperar |

### Si algo no se ve bien

1. Mira el sello de la cifra (fecha y fuente).
2. Abre **Más → Estado de las fuentes**: dice qué lectura falló y por qué (por ejemplo, «falta la clave» o «el sitio respondió 429»).
3. Escríbeme lo que ves. Si la fuente está caída, Strategya espera y lo vuelve a intentar sola.

**Importante:** el plan gratis de Supabase se pausa si pasan 7 días sin uso. Si un día la terminal no
carga, entra a <https://supabase.com/dashboard>, abre el proyecto `strategya` y pulsa **Restore**.

Strategya no es asesoría de inversión. Ninguna cifra sale de un modelo de lenguaje: la IA solo
redacta explicaciones con datos y titulares guardados, y se rechaza si inventa un número.
