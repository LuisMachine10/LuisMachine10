---
name: briefing
description: Arma el briefing diario de Luis Mena — mercados, noticias que mueven su capital y la República Dominicana, y qué decisión pide cada cosa. Úsala cuando pida su briefing, el resumen de la mañana, "qué pasó en los mercados", "las noticias de hoy", "ponme al día", o al construir la pantalla de briefing dentro de la app. Toma datos de mercado con las herramientas FMP y noticias con búsqueda web.
---

# Briefing diario

El briefing ya existe en Sistema Mena como hábito diario (`briefing`, uno de los 8 toques de
la pantalla HOY). Hoy la app solo registra **si lo hiciste**. Esta skill es lo que hace que
la app **te lo entregue**.

## La prueba que tiene que pasar

Se lee de pie, antes de las 6 a.m., en menos de tres minutos, y al terminar sabes **si tienes
que hacer algo hoy**. Si no cambia ninguna decisión, no debió entrar.

**Filtro duro:** cada línea responde *"¿y esto qué me pide hacer?"*. Si la respuesta es
"nada", se corta. Un briefing de 12 titulares irrelevantes es peor que uno de 3 que importan
— entrena a saltárselo.

## Estructura

### 1. Mercados — cifras, no adjetivos

Índices, tasas, dólar/peso, materias primas relevantes y las posiciones que él siga.
**Cada cifra con su comparación** (día, mes, año) — nunca un nivel solo.

Usa las herramientas `mcp__FMP__*`: `quote`, `indexes`, `forex`, `commodity`, `economics`,
`marketPerformance`. Si el mercado está cerrado, dilo y muestra el último cierre con su fecha.

### 2. Lo que mueve su capital

Noticias con consecuencia sobre lo que él tiene o sigue: resultados, guías, tasas, cambios
regulatorios, riesgo de crédito, movimientos del sector.

### 3. República Dominicana

Economía, banca, tasas locales, tipo de cambio, política que afecte negocios, y el sector
donde trabaje o invierta. Este bloque no es opcional: casi ningún servicio se lo va a dar.

### 4. La lectura

Una o dos frases suyas, no de la fuente: **qué significa esto junto**. Aquí se aplica la
skill `analista-financiero` — busca la contradicción entre lo que dice el mercado y lo que
dicen los números, no repitas el titular.

### 5. Qué pide decisión hoy

Cero a tres puntos. Vacío está bien y es información: *"Nada pide acción hoy."*

## Reglas de honestidad

- **Toda cifra con fuente y hora.** Un dato sin sello de tiempo es un rumor.
- **Distingue el hecho del pronóstico.** "El BCRD subió la tasa" y "se espera que suba" no
  se escriben igual.
- **Distingue recurrente de extraordinario.** Un salto por un evento único no es tendencia.
- **Nunca inventes un número.** Si la herramienta no lo trajo, se dice que no está disponible.
  Un briefing con un dato inventado destruye la utilidad de todos los demás.
- **Nada de "los analistas dicen"** sin decir cuáles y cuándo.
- **Nunca es asesoría de inversión.** Es información organizada para que él decida.

## Estilo

Directo, sin relleno, sin "es importante notar que". Cifras en mono tabular alineadas.
Español dominicano, montos locales en RD$ y con su equivalente en US$ cuando la magnitud
lo pida. La longitud objetivo es una pantalla de celular, no más.

## Dentro de la app

- **El briefing se descarga y se guarda**, con la hora en que se trajo. Sin señal, muestra
  el último y dice de cuándo es. Nunca una pantalla en blanco. *(Ver `programador-mena`.)*
- Leer el briefing es lo que marca el hábito `briefing` del día. No se marca solo por abrir
  la pantalla.
- Visualmente sigue `disenador-mena`: cifras en `.cifra`, un solo acento dorado —el punto
  que pide decisión—, nada de rojo/verde parpadeando.
