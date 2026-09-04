# Sistema Mena

App personal para operar el plan de 12 semanas: disciplina, cuerpo, estudio y vida espiritual.
La especificación funcional es `Sistema_Mena_Plan_Integral.xlsx` — todos los números y reglas
salen de ahí, ninguno se inventó.

**Estado: Fase 1 (núcleo) terminada.**

## Cómo correrla

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # 73 pruebas de las funciones de cálculo
npm run build     # PWA lista para instalar
```

Para instalarla en el celular: `npm run build && npm run preview`, abrir la URL en el teléfono
y usar "Agregar a pantalla de inicio". Una vez instalada funciona sin conexión.

## Cómo está organizado

```
src/
  dominio/          Lógica pura, sin React ni base de datos. Todo probado.
    metas.ts          TMB → TDEE → déficit → macros (hoja NUTRICION)
    puntaje.ts        Los 100 puntos del día (§4.3) + la lectura "% del plan"
    macros.ts         kcal/prot/carb/grasa desde gramos (§4.2)
    promedios.ts      Promedios de 30 días, estado de resultados, media móvil
    restricciones.ts  Bloqueo duro de movimientos prohibidos (§4.6)
    dias.ts           Tipo de día, split, fechas sin líos de zona horaria
    horario.ts        El siguiente bloque del día
  datos/
    db.ts             Dexie sobre IndexedDB + siembra + respaldo JSON
    registros.ts      Escrituras transaccionales del registro diario
    seed/             Generado desde el Excel: 44 alimentos, 46 ejercicios,
                      12 semanas de progresión, 9 menús, 102 bloques de horario
herramientas/
  generar_seed.py   Regenera el seed desde el Excel. Ningún número a mano.
  pantallas/          HOY · PESO · PLAN · AJUSTES
  componentes/        Anillo, hábitos, agua, barras de macro
```

## Reglas que la app respeta al pie de la letra

- **Puntaje**: los 13 renglones de §4.3 suman 100 exactos. Un día sin ningún dato no cuenta
  en los promedios — no es lo mismo un día malo que un día no registrado. Si quieres que un
  día cuente como cero, hay un botón que lo cierra explícitamente.
- **Segunda lectura**: además del puntaje crudo (idéntico a la BITÁCORA), cada día muestra
  el porcentaje sobre lo que el plan sí pedía ese día. El domingo no pide pesas ni cardio,
  así que su denominador es 79, no 100. Si entrenas un día que no tocaba, cuenta en las dos.
- **Metas**: cada número tiene procedencia. En HOY, "¿De dónde salen estas metas?" muestra la
  cadena completa: peso → masa magra → TMB → TDEE → déficit → kcal → macros.
- **Restricciones médicas**: los nueve movimientos prohibidos están en `dominio/restricciones.ts`
  con su motivo y su alternativa. Nunca se bloquea en silencio.
- **Pesaje**: crudo para carne y pescado, seco para arroz, pasta y avena. El aviso viaja con
  cada alimento.

## Lo que falta

- **Fase 2 — Nutrición**: registro por gramos, menús guardados, macros calculados. Mientras
  tanto, proteína y calorías se escriben a mano en HOY, igual que en la BITÁCORA.
- **Fase 3 — Gimnasio**: registro de series con peso precargado desde PROGRESION.
- **Fase 4 — Análisis**: dashboard tipo estado de resultados, gráficas, analítica de lípidos.

## Dos cosas del Excel que conviene mirar

1. **El viernes de ayuno se castiga solo.** El puntaje juzga proteína y calorías contra un techo
   de 200 kcal, pero la cena de ruptura del propio menú del Excel son ≈717 kcal. Siguiendo el
   plan al pie de la letra, el viernes pierde 22 puntos. El techo es editable en Ajustes.
2. **La hoja GYM marca cinco levantamientos ancla**, no cuatro: banca, dominada lastrada,
   remo en máquina, press militar y prensa. La app usa los cinco, tal como dice la hoja.
