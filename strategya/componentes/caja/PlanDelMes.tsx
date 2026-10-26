// Plan del mes EN MONTOS (Núcleo v2, manual sección C), en el orden de Mena: primero el ahorro y la inversión, luego la
// tarjeta. La fórmula a la vista:
//   Ingreso + Otros ingresos − Costos − Gastos − Ahorro e inversión − Pagos de tarjetas y préstamos = SOBRANTE
// El sobrante no se planifica: es lo que queda en la cuenta donde entró el dinero (o en efectivo). Cada línea de ahorro
// es un instrumento exacto con su monto; cada tarjeta muestra sus pagos del ciclo (uno o varios) con el uso del crédito
// antes y después de cada uno.

import type Big from "big.js";
import Link from "next/link";
import { eliminarRecurrente, guardarLineaAhorro, guardarRecurrente } from "@/app/caja/acciones";
import { type Fecha, fechaBreve, nombreMes } from "@/lib/caja/fechas";
import { enMoneda, rd } from "@/lib/caja/formato";
import type { Simulacion } from "@/lib/caja/motor";
import type { DatosCaja } from "@/lib/caja/tipos";
import type { PlanTarjeta } from "@/lib/finanzas/credito";
import { type LineaAhorro, masOMenos, type PlanDelMes } from "@/lib/finanzas/plan";
import { BotonEliminar, FormAccion } from "./FormAccion";
import { type OpcionCategoria, type OpcionCuenta } from "./CamposMovimiento";
import { CamposRecurrente } from "./CamposRecurrente";

import { Icono } from "./Iconos";

const pct = (x: Big | null) => (x === null ? "sin límite escrito" : `${x.times(100).round(0).toFixed(0)} %`);

function Fila({ signo, nombre, c, total = false, nota }: { signo: string; nombre: string; c: { plan: Big; real: Big }; total?: boolean; nota?: React.ReactNode }) {
  return (
    <tr className={total ? "plan-total" : undefined}>
      <th scope="row">
        <span className="plan-signo" aria-hidden="true">
          {signo}
        </span>{" "}
        {nombre}
        {nota ? <span className="chico tenue plan-nota-fila"> {nota}</span> : null}
      </th>
      <td className="num mono">{rd(c.plan.toString())}</td>
      <td className="num mono">{rd(c.real.toString())}</td>
    </tr>
  );
}

function EstadoLinea({ l, cerrado }: { l: LineaAhorro; cerrado: boolean }) {
  if (cerrado) {
    const k = masOMenos(l.diferencia);
    return <span className={`etiqueta ${k === "menos" ? "alerta" : "ok"}`}>{k === "igual" ? "justo lo planeado" : `${enMoneda(l.diferencia.abs().toFixed(2), l.moneda)} ${k === "mas" ? "más" : "menos"} de lo planeado`}</span>;
  }
  if (l.estado === "hecha") return <span className="etiqueta ok">hecha</span>;
  if (l.estado === "parcial") return <span className="etiqueta alerta">a medias: faltan {enMoneda(l.planeado.minus(l.hecho).toFixed(2), l.moneda)}</span>;
  return <span className="etiqueta neutra">por hacer</span>;
}

export function VistaPlanDelMes({
  plan,
  tarjetas,
  datos,
  cuentas,
  categorias,
  hoy,
  nombres,
}: {
  plan: PlanDelMes;
  tarjetas: PlanTarjeta[];
  datos: DatosCaja;
  cuentas: OpcionCuenta[];
  categorias: OpcionCategoria[];
  hoy: Fecha;
  sim?: Simulacion;
  /** Nombre de cada destino (cuenta del Presupuesto o «r:<id>» del registro). */
  nombres: Record<string, string>;
}) {
  const cerrado = plan.mes < hoy.slice(0, 7);
  const nombreDe = (l: LineaAhorro) => nombres[l.cajaId ?? `r:${l.recurrente.registroDestino ?? ""}`] ?? "Instrumento que ya no está";
  const cuentaDe = (id: string | null) => (id ? (datos.cuentas.find((c) => c.id === id)?.nombre ?? "—") : "—");
  const prestamos = plan.pagosDelMes.filter((p) => p.destino && datos.cuentas.find((c) => c.id === p.destino)?.tipo === "prestamo");
  return (
    <>
      <section className="panel panel-ancho plan-formula" aria-labelledby="t-plan-formula">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-plan-formula">
            Tu mes en montos · {nombreMes(plan.mes)}
          </h2>
          <span className="chico tenue">plan contra lo que de verdad pasó</span>
        </div>
        <div className="panel-cuerpo">
          <div className="desplazable">
            <table className="tabla plan-tabla">
              <thead>
                <tr>
                  <th scope="col">Cuenta del mes</th>
                  <th scope="col" className="num">
                    Plan
                  </th>
                  <th scope="col" className="num">
                    Real
                  </th>
                </tr>
              </thead>
              <tbody>
                <Fila signo="+" nombre="Ingreso" c={plan.ingresos} />
                <Fila signo="+" nombre="Otros ingresos" c={plan.otrosIngresos} nota="intereses, cupones, dividendos…" />
                <Fila signo="−" nombre="Costos" c={plan.costos} />
                <Fila
                  signo="−"
                  nombre="Gastos"
                  c={plan.gastos}
                  nota={plan.conTarjeta.plan.gt(0) || plan.conTarjeta.real.gt(0) ? `sin las compras con tarjeta (${rd(plan.conTarjeta.real.gt(0) ? plan.conTarjeta.real.toString() : plan.conTarjeta.plan.toString())}): se pagan con la tarjeta` : undefined}
                />
                <Fila signo="−" nombre="1.º Ahorro e inversión" c={plan.ahorro} nota="cada línea con su instrumento" />
                <Fila signo="−" nombre="2.º Pagos de tarjetas y préstamos" c={plan.pagos} />
                <Fila signo="=" nombre="SOBRANTE" c={plan.sobrante} total />
              </tbody>
            </table>
          </div>
          <p className="chico" style={{ marginBottom: 0 }}>
            <strong>El sobrante no se planifica:</strong> es lo que queda. Se queda en la cuenta donde entró el dinero o lo pasas a efectivo. Cada peso tiene cuenta de origen y
            de destino, así que el sobrante real es lo que de verdad quedó en tus cuentas.
          </p>
          {plan.sinTasa ? <p className="chico tenue">{plan.sinTasa} monto(s) en US$ sin dólar del BCRD de su fecha: no se sumaron (no confirmado).</p> : null}
        </div>
      </section>

      <section className="panel panel-ancho" aria-labelledby="t-plan-lineas" id="t-plan-lineas">
        <div className="panel-cabecera">
          <h2 className="panel-titulo">1.º Lo que planeaste ahorrar este mes</h2>
          <span className="chico tenue">
            {plan.lineas.filter((l) => l.estado === "hecha").length} de {plan.lineas.length} hechas
          </span>
        </div>
        <div className="panel-cuerpo">
          {plan.lineas.length ? (
            <ul className="caja-lista plan-lineas">
              {plan.lineas.map((l) => (
                <li key={l.recurrente.id} className="caja-item">
                  <div className="caja-item-fila">
                    <span className="caja-item-texto">
                      <span className="caja-item-nombre">
                        {nombreDe(l)} <EstadoLinea l={l} cerrado={cerrado} />
                      </span>
                      <span className="caja-item-detalle">
                        sale de {cuentaDe(l.recurrente.cuenta)} · {l.recurrente.frecuencia === "mensual" ? `día ${l.recurrente.dias}` : l.recurrente.frecuencia === "unica" ? `el ${l.recurrente.fecha}` : `cada ${l.recurrente.cadaN} días`}
                        {l.veces > 1 ? ` · ${l.veces} veces este mes` : ""}
                        {l.hecho.gt(0) ? ` · llevas ${enMoneda(l.hecho.toFixed(2), l.moneda)}` : ""}
                      </span>
                    </span>
                    <span className="caja-item-monto">{enMoneda(l.planeado.toFixed(2), l.moneda)}</span>
                  </div>
                  <details className="caja-desplegable">
                    <summary>Cambiar o quitar</summary>
                    <FormAccion accion={guardarRecurrente} boton="Guardar" etiqueta={`Editar ${l.recurrente.nombre}`}>
                      <input type="hidden" name="id" value={l.recurrente.id} />
                      <CamposRecurrente r={l.recurrente} cuentas={cuentas} categorias={categorias} />
                    </FormAccion>
                    <div className="caja-form">
                      <BotonEliminar accion={eliminarRecurrente} id={l.recurrente.id} que={`la línea ${l.recurrente.nombre} (lo que ya hiciste se queda)`} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chico">
              Todavía no escribiste cuánto vas a ahorrar ni en qué. Agrega una línea por instrumento: su monto se aparta primero (antes de la tarjeta) y tus proyecciones usan
              exactamente esos montos.
            </p>
          )}
          {plan.sinInstrumento.gt(0) ? (
            <p className="caja-aviso">
              <Icono n="aviso" tam={16} /> Tienes {rd(plan.sinInstrumento.toString())} de ahorro presupuestado sin decir a dónde va (monto adicional de una categoría de ahorro).
              No entra en este plan: conviértelo en una línea con su instrumento.
            </p>
          ) : null}
          {plan.ahorroSuelto.gt(0) ? <p className="chico tenue">Además, {rd(plan.ahorroSuelto.toString())} fueron a ahorro sin línea en el plan (cuenta en lo real).</p> : null}
          <details className="caja-desplegable caja-conf-nueva" open={!plan.lineas.length}>
            <summary>+ Agregar una línea de ahorro o inversión</summary>
            <FormAccion accion={guardarLineaAhorro} boton="Guardar línea" reiniciar etiqueta="Nueva línea de ahorro">
              <CamposRecurrente inicial={{ tipo: "transferencia", modo: "ahorro" }} cuentas={cuentas} categorias={categorias} />
            </FormAccion>
          </details>
        </div>
      </section>

      <section className="panel panel-ancho" aria-labelledby="t-plan-pagos">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-plan-pagos">
            2.º Pagos de tarjetas y préstamos
          </h2>
          <span className="chico tenue">puedes hacer varios pagos en el ciclo</span>
        </div>
        <div className="panel-cuerpo">
          {tarjetas.length ? (
            <ul className="caja-lista plan-tarjetas">
              {tarjetas.map((t) => (
                <li key={t.cuenta.id} className="caja-item">
                  <div className="caja-item-fila">
                    <span className="caja-item-texto">
                      <span className="caja-item-nombre">{t.cuenta.nombre}</span>
                      <span className="caja-item-detalle">
                        {t.ciclo ? `corte ${fechaBreve(t.ciclo.corte)} · fecha límite ${fechaBreve(t.ciclo.limite)}` : `próximos 31 días (escribe su corte en Mis cuentas)`}
                      </span>
                    </span>
                  </div>
                  {t.partes.map((p) => (
                    <div key={p.moneda} className="plan-uso">
                      <p className="chico" style={{ margin: "4px 0" }}>
                        {t.partes.length > 1 ? (p.moneda === "USD" ? "Parte en US$: " : "Parte en RD$: ") : ""}
                        hoy debes <span className="mono">{enMoneda(p.hoy.deuda.toFixed(2), p.moneda)}</span> · uso del crédito <strong>{pct(p.hoy.uso)}</strong>
                      </p>
                      {p.pasos.length ? (
                        <ol className="plan-pasos">
                          {p.pasos.map((x, k) => (
                            <li key={`${x.fecha}-${k}`}>
                              {fechaBreve(x.fecha)}: pagas <span className="mono">{enMoneda(x.monto.toFixed(2), p.moneda)}</span> · uso {pct(x.antes.uso)} → <strong>{pct(x.despues.uso)}</strong>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="chico tenue" style={{ margin: 0 }}>
                          Sin pagos planificados hasta la fecha límite.
                        </p>
                      )}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="chico tenue">No tienes tarjetas en el Presupuesto.</p>
          )}
          {prestamos.length ? (
            <>
              <h3 className="caja-subtitulo">Préstamos</h3>
              <ul className="plan-pasos">
                {prestamos.map((p, k) => (
                  <li key={`${p.fecha}-${k}`}>
                    {fechaBreve(p.fecha)}: {cuentaDe(p.destino)} · <span className="mono">{enMoneda(p.monto, p.moneda)}</span> {p.hecho ? "(hecho)" : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="chico tenue">
            Comprar con la tarjeta es gasto del mes y sube lo que debes; pagarla es «Pago de tarjeta o préstamo» (no es gasto) y la baja. Los intereses de la tarjeta son
            solo los que anotes de tu estado de cuenta.
          </p>
          <details className="caja-desplegable caja-conf-nueva">
            <summary>+ Agregar un pago (otro pago en el ciclo también)</summary>
            <FormAccion accion={guardarRecurrente} boton="Guardar pago" reiniciar etiqueta="Nuevo pago de tarjeta o préstamo">
              <CamposRecurrente inicial={{ tipo: "pago_tarjeta" }} cuentas={cuentas} categorias={categorias} />
            </FormAccion>
          </details>
          <p className="chico">
            <Link href="/capital/futuro#cap-t-aportes">Ver «Lo que planeaste ahorrar este mes» en el Portafolio</Link>
          </p>
        </div>
      </section>
    </>
  );
}
