# Sistema Mena

App personal para operar el plan de 12 semanas: disciplina, cuerpo, estudio y vida espiritual.
La especificación funcional es `Sistema_Mena_Plan_Integral.xlsx` — todos los números y reglas
salen de ahí, ninguno se inventó.

**Estado: las cuatro fases terminadas.** 110 pruebas.

## Cómo correrla

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # pruebas de todas las funciones de cálculo
npm run build     # PWA lista para instalar
```

Para instalarla en el celular: `npm run build && npm run preview`, abrir la URL en el teléfono
y usar "Agregar a pantalla de inicio". Una vez instalada funciona sin conexión, incluida la
pantalla de gimnasio, que es donde no hay señal.

## Las cinco pantallas

| | |
|---|---|
| **HOY** | Anillo de puntaje, 8 hábitos de un toque, agua en 8 vasos, macros contra la meta, estudio y sueño, el próximo bloque del horario y el promedio de 30 días. |
| **COMER** | Buscador con favoritos arriba, gramos → macros en vivo, medidas caseras, y los menús modelo del Excel cargados de un toque. |
| **ENTRENAR** | El día del split que toca, con el peso de la semana ya precargado desde PROGRESION. Dos toques por serie, temporizador de descanso automático, anclas destacadas y bloqueo de movimientos prohibidos. |
| **PROGRESO** | Estado de resultados de la disciplina, peso con media móvil de 4, progresión de los levantamientos ancla, analítica de lípidos y exportación a CSV. |
| **PLAN** | Solo lectura: horario, gimnasio, tabla de alimentos y calendario litúrgico. |

Ajustes está detrás del ⚙ en HOY y en PROGRESO.

## Cómo está organizado

```
src/
  dominio/          Lógica pura, sin React ni base de datos. Todo probado.
    metas.ts          TMB → TDEE → déficit → macros (hoja NUTRICION)
    puntaje.ts        Los 100 puntos del día (§4.3) + la lectura "% del plan"
    macros.ts         kcal/prot/carb/grasa desde gramos (§4.2)
    comidas.ts        Búsqueda, menús modelo, macros del día
    cargas.ts         Lectura de la hoja PROGRESION ("225 lb x 5", "5.0 x 10"…)
    promedios.ts      Promedios, estado de resultados, media móvil
    restricciones.ts  Bloqueo duro de movimientos prohibidos (§4.6)
    dias.ts           Tipo de día, split, semana del plan, fechas sin líos de zona horaria
    horario.ts        El siguiente bloque del día
    exportar.ts       CSV de bitácora, peso y sesiones
  datos/
    db.ts             Dexie sobre IndexedDB + siembra + respaldo JSON
    registros.ts      Escrituras transaccionales del registro diario
    comidas.ts        Comidas → macros del día, con recálculo automático
    sesiones.ts       Series del gimnasio; cerrar la primera marca el entrenamiento
    seed/             Generado desde el Excel: 44 alimentos, 46 ejercicios,
                      12 semanas de progresión, 9 menús, 102 bloques de horario
  pantallas/          Hoy · Comer · Entrenar · Progreso · Plan · Peso · Ajustes
  componentes/        Anillo, hábitos, agua, barras, selector de alimento,
                      temporizador, gráfica de peso, small multiples
herramientas/
  generar_seed.py   Regenera el seed desde el Excel. Ningún número a mano.
```

## Reglas que la app respeta al pie de la letra

- **Puntaje**: los 13 renglones de §4.3 suman 100 exactos. Un día sin ningún dato no cuenta
  en los promedios — no es lo mismo un día malo que un día no registrado. Si quieres que un
  día cuente como cero, hay un botón que lo cierra explícitamente.
- **Segunda lectura**: además del puntaje crudo (idéntico a la BITÁCORA), cada día muestra
  el porcentaje sobre lo que el plan sí pedía. El domingo no pide pesas ni cardio, así que su
  denominador es 79, no 100. Si entrenas un día que no tocaba, cuenta en las dos lecturas.
  En PROGRESO puedes cambiar de lente con un toque.
- **Un solo dato, una sola vez**: pesas 250 g de pollo y la app calcula kcal, proteína, carbs
  y grasa. Mientras haya comidas registradas, los campos manuales quedan de solo lectura.
- **Metas con procedencia**: en HOY, "¿De dónde salen estas metas?" muestra la cadena completa,
  de peso → masa magra → TMB → TDEE → déficit → kcal → macros.
- **Restricciones médicas**: los nueve movimientos prohibidos están en `dominio/restricciones.ts`
  con su motivo y su alternativa. Si escribes uno en el campo libre, la app explica por qué no
  entra. Nunca se bloquea en silencio.
- **Pesaje**: crudo para carne y pescado, seco para arroz, pasta y avena. El aviso viaja con
  cada alimento y aparece al pesarlo.
- **Nada de gamificación**: sin insignias, sin rachas, sin notificaciones. La métrica es el
  promedio, no el día suelto.

## Decisiones de gráfica

Los cinco levantamientos ancla no comparten eje: la banca vive entre 215 y 245 lb, la prensa
entre 450 y 720, y las dominadas se miden en series. Meterlos en un solo gráfico sería mentir,
así que van en *small multiples* — uno por levantamiento, cada uno con su propia escala. El
peso sí es un solo gráfico: la línea dorada es la media móvil de 4 y los puntos grises son los
pesajes sueltos. La línea es la señal; el punto es ruido.

## Tres cosas del Excel que conviene mirar

1. **El viernes de ayuno se castiga solo.** El puntaje juzga proteína y calorías contra un techo
   de 200 kcal, pero la cena de ruptura del propio menú del Excel son ≈717 kcal. Siguiendo el
   plan al pie de la letra, el viernes pierde 22 puntos. El techo es editable en Ajustes.
2. **La hoja GYM marca cinco levantamientos ancla**, no cuatro: banca, dominada lastrada,
   remo en máquina, press militar y prensa. La app usa los cinco, tal como dice la hoja.
3. **Falta tu press militar de pie.** Es el único ancla sin PR declarado. Anótalo la primera
   semana y la progresión de hombro se puede recalcular.

## Nota médica

El CoQ10 no baja el LDL: sirve para los síntomas musculares de la estatina, no la sustituye.
Haz el perfil lipídico + ALT/AST antes de cambiar nada — sin dato base no hay experimento, hay
apuesta — y avísale al médico que la prescribió. La pantalla PROGRESO tiene la tabla de
seguimiento con las referencias.
