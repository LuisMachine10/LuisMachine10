---
name: disenador-mena
description: Sistema visual de Sistema Mena — paleta marino/dorado, tipografía, jerarquía, y las reglas de gráficas financieras (nunca ejes compartidos que mientan, la línea es señal y el punto es ruido). Úsala antes de diseñar o modificar cualquier pantalla, componente, gráfica, tarjeta, ícono o pieza visual del sistema, y al crear presentaciones o reportes con su identidad. Se dispara con: "diseña la pantalla", "cómo se debe ver", "qué colores", "haz una gráfica", "el layout", "mejora el diseño", "un ícono", "cómo presento estos datos".
---

# Diseñador — Sistema Mena

**La consigna de identidad, en una frase:** *terminal financiera, no app de fitness.*

Se ve como un instrumento de medición serio que alguien consulta a las 5 a.m., no como un
producto que quiere gustarte. Sobrio, oscuro, denso en información, sin adornos.

## Paleta — ya está en `tailwind.config.js`, no inventes colores

| Token | Hex | Para qué |
|---|---|---|
| `marino-950` | `#0C1826` | Fondo de la app |
| `marino-900` | `#122238` | Fondo de tarjetas |
| `marino-800` / `700` / `600` | `#1F3A5F` `#2B4E7C` `#3A6396` | Bordes, botones, elevación |
| `dorado-600` | `#B8860B` | **El acento. Uno por pantalla.** |
| `dorado-500` / `400` | `#CFA028` `#E0B84A` | Series en gráficas, énfasis suave |
| `pergamino` | `#EDE7DA` | Texto principal |
| `humo` | `#9AA7B8` | Texto secundario, rótulos |
| `verde` | `#3F7D5A` | Cumplido, dentro de meta |
| `rojo` | `#A34A3C` | Vencido, fuera de meta |

**El dorado es escaso.** Si todo brilla, nada destaca. Una pantalla tiene un elemento dorado
—el que dice qué hacer ahora— y el resto es marino y pergamino.

Verde y rojo son apagados a propósito: informan un estado, no gritan. Y **nunca son la única
señal** — siempre acompañados de texto o número, porque hay gente que no los distingue.

## Tipografía

- **Sans (Inter)** — interfaz, etiquetas, botones.
- **Mono tabular** — *todas* las cifras, vía la clase `.cifra`. Los números no bailan cuando
  cambian: es un instrumento, no un marcador.
- **Serif (Iowan/Georgia)** — reservada para lo que se lee, no lo que se mide: el calendario
  litúrgico, una cita, un texto de lectura.

Rótulos: `.rotulo` (11px, mayúsculas, tracking abierto, color humo). Nunca un título grande
donde basta un rótulo pequeño — el espacio es para los datos.

## Componentes que ya existen — reúsalos

`.tarjeta` · `.rotulo` · `.campo` · `.boton` · `.boton-dorado` ·
`AnilloPuntaje` · `BotonHabito` · `Temporizador` · `SelectorAlimento` · `Chispa`

Antes de crear un componente nuevo, revisa si uno de estos hace el trabajo. Un sistema con
tres formas de mostrar un progreso no es un sistema.

## Reglas de gráfica — aquí es donde se gana o se pierde la credibilidad

### 1. Nunca compartas un eje que mienta

Los cinco levantamientos ancla no comparten escala: la banca vive entre 215 y 245 lb, la
prensa entre 450 y 720, las dominadas se miden en series. Meterlos en un solo gráfico haría
ver la prensa como "lo importante" y las dominadas como una línea plana.

**Van en *small multiples*** — uno por levantamiento, cada uno con su propia escala, todos
del mismo tamaño, en cuadrícula. La misma regla aplica a cualquier grupo de series con
magnitudes distintas: ventas y margen %, monto y días, peso y porcentaje de grasa.

### 2. La línea es la señal, el punto es ruido

En la gráfica de peso: media móvil de 4 en dorado (la línea), pesajes sueltos en gris (los
puntos). El usuario debe ver la tendencia primero y el dato suelto como contexto.

Lo mismo con cualquier serie ruidosa. **Muestra ambos, jerarquiza el promedio.**

### 3. Un dato ausente no es un cero

Un día sin registrar y un día en cero son cosas distintas y **no se pueden ver iguales**.
El cero es un punto en la línea base; el ausente es un hueco. Nunca rellenes con ceros.

### 4. Ninguna cifra viaja sola

Todo número financiero o de progreso llega con al menos una comparación: contra el período
anterior, contra la meta, o contra su propia tendencia. Un monto solo no le dice nada a un
analista. *(Ver la skill `analista-financiero`.)*

### 5. Toda cifra dice de dónde salió

Si la pantalla dice "2,340 kcal", tiene que poder mostrar la cadena que la produjo. La
procedencia no es un extra: es lo que separa un instrumento de un adivino.

## Lo que no entra

- **Gamificación**: insignias, rachas, confeti, "¡vas increíble!". La métrica es el promedio.
- **Colores fuera de la paleta.** Si hace falta uno nuevo, se agrega al `tailwind.config.js`
  con una razón, no en el componente.
- **Animación decorativa.** Solo la funcional: el `active:scale-[0.98]` que confirma un toque,
  el temporizador que corre.
- **Densidad falsa.** Espacio en blanco donde ayuda a leer; sin espacio decorativo que
  obligue a hacer scroll para ver un dato que cabía.
- **Emoji como interfaz.** El ⚙ de ajustes es la excepción heredada.

## Se usa con el pulgar, de pie, en un gimnasio

Áreas táctiles de 48px mínimo (56px las principales). Lo que se registra a diario va donde
llega el pulgar sin recolocar la mano. Contraste alto: la pantalla se lee con luz de gimnasio
y a las 5 a.m. con los ojos a medio abrir. Nada crítico depende de un gesto que haya que
aprender.
