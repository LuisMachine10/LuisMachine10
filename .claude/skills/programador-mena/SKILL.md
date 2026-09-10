---
name: programador-mena
description: Convenciones de código del repositorio Sistema Mena — arquitectura, nombres en español, dominio puro y probado, capa de datos sobre Dexie/IndexedDB, PWA offline. Úsala antes de escribir, modificar o revisar cualquier archivo de este repositorio: nueva pantalla, nuevo cálculo, nueva tabla, nueva prueba, cambio en el seed, o al explicarle al usuario cómo está armado el código. Se dispara con: "agrega una pantalla", "crea un cálculo", "nueva función", "modifica el puntaje", "regenera el seed", "escribe pruebas", "por qué está así el código".
---

# Programador — Sistema Mena

El usuario **no es programador**. Explícale las decisiones en términos de qué cambia para él,
no de qué patrón usaste. Pero el código sí se escribe con disciplina.

## Las tres capas, y la regla que las separa

```
src/dominio/     Lógica pura. Sin React. Sin base de datos. Sin fechas del sistema.
                 Entra un dato, sale un número. TODO probado.
src/datos/       Dexie sobre IndexedDB. Escrituras transaccionales. El seed.
src/pantallas/   React. Lee de datos, calcula con dominio, dibuja.
src/componentes/ Piezas visuales reutilizables.
```

**La regla:** si una función hace un cálculo, va en `dominio/` y lleva prueba. Si un
componente de React contiene una fórmula, está mal ubicada — sácala al dominio y pruébala.
El dominio no importa nada de `datos/` ni de React. Nunca al revés.

Por qué importa: son los cálculos que deciden el puntaje, los macros y las metas del usuario.
Si están enterrados en un componente, no se pueden probar y nadie sabe si están bien.

## Idioma

**Todo en español**: nombres de archivos, funciones, tipos, variables, comentarios, pruebas.
`calcularPuntaje`, no `calculateScore`. `RegistroDiario`, no `DailyLog`. Los tipos del dominio
usan el vocabulario del Excel original: mismos nombres, mismas unidades.

Excepción: lo que impone una librería (`useEffect`, `db.table`, `describe`/`it`).

## Fechas

`FechaISO` es un `string` `"2026-09-07"`. **Nunca un `Date` con hora** — la app se usa a las
5 a.m. y a las 11 p.m., y un `Date` con zona horaria corre los días. Toda manipulación de
fechas pasa por `dominio/dias.ts`. Si necesitas una función de fecha nueva, va ahí, con prueba.

## Números

- Libras para peso corporal, gramos para alimentos, centímetros para estatura, litros para
  agua, minutos para estudio, horas para sueño. **No conviertas unidades en silencio.**
- Los números se muestran con la clase `.cifra` (mono + tabulares) para que no bailen.
- Un dato que se puede calcular **no se pide dos veces**: si hay comidas registradas, los
  macros manuales quedan de solo lectura.

## Pruebas

`npm test` — 150 pruebas y subiendo. Vitest, con `fake-indexeddb` para la capa de datos.

- **Toda función nueva del dominio nace con su prueba**, en el archivo hermano
  (`macros.ts` → `macros.test.ts`).
- Los casos borde que importan aquí: día sin registrar (≠ día en cero), domingo (denominador
  79, no 100), día de ayuno, un movimiento prohibido, una meta sin fecha límite.
- `datos/integracion.test.ts` prueba flujos completos. Si tocas una escritura transaccional,
  revísalo.

Antes de dar por terminado cualquier cambio: `npm test && npm run build`. Sin excepción.

## El seed no se escribe a mano

`src/datos/seed/` es **generado** desde `Sistema_Mena_Plan_Integral.xlsx` por
`herramientas/generar_seed.py`. 44 alimentos, 46 ejercicios, 12 semanas de progresión,
9 menús, 102 bloques de horario.

Si un número del seed está mal, se arregla **en el Excel y se regenera**. Editar el archivo
generado a mano crea una discrepancia silenciosa entre lo que dice el plan y lo que hace la
app. Ningún número a mano.

## Datos del usuario: nada se asume, nada se pierde

- La app arranca vacía. `Perfil.completado` es `false` hasta que él lo confirme.
- Lo que sale del Excel se ofrece como **sugerencia con su procedencia** ("esto salió de la
  hoja NUTRICION"), nunca como dato ya guardado.
- Todo dato mostrado debe poder rastrearse hasta su origen. Si la app dice "tu meta son
  2,340 kcal", tiene que poder explicar la cadena: peso → masa magra → TMB → TDEE → déficit.
- Las escrituras van por `datos/registros.ts`, `datos/comidas.ts` o `datos/sesiones.ts`, que
  son transaccionales y recalculan lo que dependa. No escribas a `db` directamente desde una
  pantalla.
- Hay respaldo/restauración en JSON y exportación a CSV. Si agregas una tabla, agrégala al
  respaldo — si no, el respaldo miente.

## Offline es requisito, no adorno

Se usa en el gimnasio, donde no hay señal. PWA con `vite-plugin-pwa`. **Nada crítico puede
depender de la red.** Si una función nueva necesita internet (por ejemplo, el briefing de
noticias), tiene que degradar con gracia: mostrar lo último que se descargó y decir cuándo
fue, nunca una pantalla en blanco ni un error.

## Interfaz: se usa con el pulgar

- Botones de al menos 48px de alto (`.boton`), 56px los principales (`.boton-dorado`).
- Registrar algo frecuente no debe costar más de dos toques.
- `touch-action: manipulation` ya está puesto: nada de zoom accidental al registrar una serie.
- **Cero gamificación**: sin insignias, sin rachas, sin notificaciones motivacionales. La
  métrica es el promedio, no el día suelto. Si una propuesta suena a Duolingo, no entra.
  Esto no bloquea las notificaciones del briefing: avisar que salió el de las 6:00 o el de
  las 17:00 entrega información, no empuja una racha. La regla es contra la gamificación,
  no contra las notificaciones.

## Comandos

```bash
npm run dev        # desarrollo, http://localhost:5173
npm test           # pruebas
npm run build      # compila TypeScript y genera la PWA
npm run preview    # sirve la build — es la que se abre en el celular
```

## Al terminar

Explícale al usuario **qué cambió para él**, en una o dos frases, sin jerga. "Ahora la
pantalla de progreso te muestra los días que no registraste, separados de los días en cero"
es útil. "Refactoricé el hook de agregación" no.
