# Manual de lógica financiera (Núcleo v2)

> Versión en el repositorio del manual que aprobó el dueño. Es la especificación del Portafolio y del Presupuesto:
> si el código y este documento no coinciden, el código está mal. Cada regla tiene su prueba (al final).
> No es asesoría de inversión: son las reglas con que Strategya ordena **tus** números.

## A. Cada cuenta tiene un tipo

Todo lo que anotas en **Portafolio → Mis cuentas** tiene un **tipo**. El tipo decide cómo rinde, si sirve para pagar y si
puede recibir ahorro. Lo marcado «elegible» lo decides tú, y cada cambio queda anotado (fecha, antes y después).

| Tipo | Cómo rinde | ¿Capitaliza? | ¿Sirve para pagar? | ¿Recibe ahorro? |
| --- | --- | --- | --- | --- |
| Efectivo (cualquier moneda) | no rinde | — | sí | sí |
| Cuenta corriente o de nómina | no paga interés | — | sí | no |
| Cuenta de ahorro | interés mínimo: **por ahora no se cuenta** (tasa 0) | no | sí | sí |
| Cuenta de alto rendimiento | tasa anotada; el interés entra a la misma cuenta; se muestra «te deja X al mes» | sí | solo si marcas «tiene tarjeta de débito» | sí |
| Certificado financiero | tasa fija por plazo | **elegible**: capitaliza o te paga a una cuenta (mientras no elijas, su interés no se proyecta) | no | sí |
| Mutuo o reporto (puesto de bolsa) | tasa por cada plazo (típico 30 días) | no solo: al vencer **tú** lo renuevas (nueva tasa, dejas o retiras el interés, aportas más) | no | sí |
| Bono | cupón pagado a una cuenta | no | no | sí |
| Fondo abierto | valor cuota | implícito en el valor cuota | no | sí |
| Fondo cerrado | según su reglamento | elegible | no | sí |
| Acción o ETF | precio + dividendos pagados a una cuenta | no | no | sí |
| Fideicomiso | según su contrato | elegible | no | sí |
| Tarjeta de crédito | — | — | sí | no (recibe abonos) |
| Préstamo | cuota = interés + capital | — | no | no (recibe pagos) |
| Bien (casa, terreno, carro) | no rinde | — | no | no |

- **La moneda no depende del tipo** (RD$, US$ o €). El euro se pasa a pesos **cruzando** el EUR/USD del Banco Central
  Europeo con el dólar de venta del BCRD **de la misma fecha**, rotulado «cruce» con sus dos fuentes. Si falta alguna de
  las dos, el monto queda «no confirmado» y no se suma. El € escrito a mano ya no se usa.
- **Retención y comisión**: los certificados bancarios retienen el **10 %** del interés (editable por certificado). Los
  puestos de bolsa no retienen, pero cobran una comisión de administración: es un campo opcional; si no la escribes,
  queda «no confirmada» y no se descuenta nada inventado.
- **Una inversión nunca se usa para pagar.** Para gastar de una inversión, primero se anota «Rescate o venta» hacia una cuenta.
- Lo que **no capitaliza** paga interés, cupón o dividendo a una cuenta tuya: ese cobro entra al Presupuesto como
  **Otros ingresos** (en «Plan del mes» se puede agregar como cobro fijo con un clic).

## B. Las listas de cada formulario

Todas tus cuentas aparecen **solas** en el Presupuesto según su tipo (ya no existe «Usar una cuenta del Portafolio»).
Cada formulario muestra solo las que sirven:

| Formulario | Aparecen | No aparecen |
| --- | --- | --- |
| ¿Con qué pagaste? | efectivo, corriente, ahorro, alto rendimiento con débito, tarjetas | inversiones, préstamos, bienes |
| ¿A qué cuenta entra? (ingreso) | efectivo y cuentas (corriente, ahorro, alto rendimiento) | tarjetas, inversiones, préstamos |
| ¿A dónde va el ahorro? | todo tipo que recibe ahorro | corriente, tarjetas, préstamos |
| Pago de tarjeta o préstamo | sale de efectivo o cuentas; va a tarjetas y préstamos | inversiones |
| Cambio de moneda | efectivo y cuentas de monedas distintas, con la tasa usada | inversiones |
| Rescate o venta de inversión | sale de la inversión; va a una cuenta | tarjetas, préstamos |

Estas reglas viven en **un solo módulo** (`lib/finanzas/catalogo.ts`). La base de datos usa la misma tabla (generada
desde ese módulo) y rechaza un movimiento que no cumpla, con el mismo mensaje que el formulario.

## C. El plan del mes, en montos

En **Presupuesto → Plan del mes**:

```
  Ingreso
+ Otros ingresos (intereses, cupones, dividendos)
− Costos
− Gastos (sin las compras con tarjeta: esas se pagan con la tarjeta)
− 1.º Ahorro e inversión (líneas con instrumento y monto)
− 2.º Pagos de tarjetas y préstamos
= SOBRANTE
```

- El **sobrante no se planifica**: es lo que queda en la cuenta donde entró el dinero (o en efectivo).
- Primero el ahorro, luego la tarjeta.
- Cada **línea de ahorro** tiene un instrumento exacto y un monto en su moneda. Queda **hecha** cuando anotas la
  transferencia a ese destino; **a medias** si fue menos. Al cerrar el mes dice «más o menos de lo planeado».
- Las **proyecciones** del Portafolio usan exactamente esas líneas como aportes de cada instrumento. La Política de
  inversión solo compara; nunca reparte.
- El reparto por porcentajes y los «aportes del mes» que decidía el sistema ya no existen. El plan viejo no se
  convirtió a montos (no había montos equivalentes) y no se borró.
- En pantalla se llama **«Lo que planeaste ahorrar este mes»**.

## D. Tarjetas

- Fecha límite = día de corte + días para pagar (corte 15 nov + 28 = 13 dic). El día en que quieres pagar es tuyo
  (por ejemplo, el 30 → 30 nov).
- Puedes planificar **varios pagos en el mismo ciclo**. Para cada uno se muestra el **uso del crédito** (lo que debes ÷
  límite, por moneda) antes y después.
- Comprar con tarjeta = gasto del mes y sube lo que debes. Pagarla = pago (no es gasto) y baja lo que debes.
- Los intereses de la tarjeta son solo los que anotas de tu estado de cuenta.

## E. Préstamos

- Interés = saldo anterior × tasa ÷ 12; capital = cuota − interés − cargos.
- Los **cargos dentro de la cuota** (seguro y otros) son un **gasto aparte** y **no bajan la deuda**. Se escriben una vez
  en Mis cuentas («Cargos dentro de la cuota») y se pueden cambiar en cada pago.

## Dónde está cada regla y su prueba

| Regla | Código | Prueba |
| --- | --- | --- |
| A · catálogo de tipos | `lib/finanzas/catalogo.ts` | `lib/finanzas/catalogo.test.ts` («A · catálogo…») |
| A · € por cruce | `lib/capital/posicion.ts` (`cruceEurDop`) | `lib/finanzas/euro.test.ts` |
| A · cobros como Otros ingresos | `lib/finanzas/cobros.ts` | `lib/finanzas/cobros.test.ts` |
| A · proyección por tipo, retención, comisión | `lib/capital/proyeccion.ts` | `lib/finanzas/proyeccion.test.ts` |
| A · mutuo con renovaciones | `lib/finanzas/mutuo.ts` | `lib/finanzas/proyeccion.test.ts` |
| B · listas (tabla de verdad) | `lib/finanzas/catalogo.ts` + migración `20261029000100_nucleo_v2.sql` | `catalogo.test.ts` («B · …») y `pruebas/db/nucleo-v2.test.ts` |
| B · enlace automático sin pérdida | migración `20261029000100_nucleo_v2.sql` | `pruebas/db/nucleo-v2.test.ts` (forma de producción, 19 filas) |
| C · plan del mes y sobrante | `lib/finanzas/plan.ts` | `lib/finanzas/plan.test.ts` («C · …») |
| C · tres cifras del manual | `lib/capital/proyeccion.ts` | `proyeccion.test.ts` (125,655.68 · 110,471.31 · 10,000 / 9,000) |
| D · tarjetas | `lib/finanzas/credito.ts` | `plan.test.ts` («D · …») |
| E · cargos del préstamo | `lib/caja/deudas.ts` | `plan.test.ts` («E · …») y `pruebas/db/nucleo-v2.test.ts` |
