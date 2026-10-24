// Proyecciones con los aportes del Presupuesto: cuánto va a cada inversión cada mes, el crecimiento con
// interés compuesto («lo que aportaste» y «lo que ganaron tus intereses»), los aportes del mes por
// confirmar («Sí, lo hice») y el plan de cada instrumento. Son cálculos con tus supuestos, no pronósticos.

import Link from "next/link";
import { confirmarAporte, guardarParametros, guardarPlan } from "@/app/capital/acciones";
import { CERO, n } from "@/lib/capital/decimal";
import { sumarMeses } from "@/lib/capital/fechas";
import { aPct } from "@/lib/capital/formulario";
import { num, pct, rd } from "@/lib/capital/formato";
import { ahorroPresupuestado, aportesDelPlan, horizonteMeses, proyectarPortafolio, repartoClases } from "@/lib/capital/proyeccion";
import { CLASES, FRECUENCIAS_PAGO, nombreClase } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { esDeuda as esDeudaCaja } from "@/lib/caja/tipos";
import { GraficoSerie } from "./GraficoSerie";
import { Icono } from "./Iconos";
import { Kpi, Mosaicos, Panel, SinDatos } from "./Piezas";

type Props = { datos: DatosCapital; mes: string; anios?: string | null };

const HORIZONTES = ["1", "3", "5", "10", "20"];

function OrigenAhorro({ datos }: { datos: DatosCapital }) {
  const a = ahorroPresupuestado(datos.ctx);
  if (!a) return null;
  return (
    <span className="sello">
      Fuente: tu Presupuesto ({datos.ctx.presupuesto?.mes}) · categorías de ahorro e inversión · <Link href="/caja/resultados">ver</Link>
    </span>
  );
}

export function PanelProyeccion({ datos, mes, anios, compacto = false }: Props & { compacto?: boolean }) {
  const { ctx } = datos;
  const meses = horizonteMeses(ctx, anios);
  const ahorro = ahorroPresupuestado(ctx);
  const pr = proyectarPortafolio(ctx, meses, ahorro);
  const hoy = pr.puntos[0];
  const fin = pr.puntos[meses];
  const anos = meses / 12;
  if (!ctx.activos.length) {
    return (
      <Panel titulo="Cómo crecería tu dinero" id="cap-t-proy" ancho>
        <SinDatos centro icono="calendario" accion={{ href: "/capital/cuentas", texto: "Agregar mis cuentas e inversiones" }}>
          Aquí verás tu dinero crecer mes a mes con lo que ahorras y el interés compuesto. Primero anota tus cuentas e inversiones.
        </SinDatos>
      </Panel>
    );
  }
  const puntos = pr.puntos.filter((p) => p.mes % (meses > 60 ? 3 : 1) === 0 || p.mes === meses);
  const fecha = (m: number) => sumarMeses(ctx.hoy, m);
  return (
    <>
      {compacto ? null : (
        <Mosaicos etiqueta="Proyección del portafolio" columnas={4}>
          <Kpi rotulo="Hoy" valor={num(hoy.total)} unidad="RD$" meta="lo que tienes invertido" tono="neutra" />
          <Kpi rotulo={`En ${num(anos, 0)} ${anos === 1 ? "año" : "años"}`} valor={num(fin.total)} unidad="RD$" meta="proyección con tus supuestos" tono="neutra" />
          <Kpi rotulo="Lo que aportarías" valor={num(fin.aportado.minus(hoy.aportado))} unidad="RD$" meta={ahorro ? `${rd(ahorro)} al mes` : "sin ahorro en tu Presupuesto"} tono="neutra" />
          <Kpi rotulo="Lo que ganarían tus intereses" valor={num(fin.interes)} unidad="RD$" meta={fin.total.gt(0) ? `${pct(fin.interes.div(fin.total), 0)} del total` : "—"} tono="neutra" />
        </Mosaicos>
      )}
      <Panel
        titulo="Cómo crecería tu dinero"
        id="cap-t-proy"
        ancho
        extra={
          <nav className="cap-horizontes" aria-label="Años de la proyección">
            {HORIZONTES.map((h) => (
              <Link key={h} href={`/capital/futuro?mes=${mes}&anios=${h}`} aria-current={Number(h) * 12 === meses ? "true" : undefined}>
                {h} {h === "1" ? "año" : "años"}
              </Link>
            ))}
          </nav>
        }
      >
        <p className="cap-nota" style={{ marginTop: 0 }}>
          {ahorro ? (
            <>
              Cada mes entran <strong>{rd(ahorro)}</strong> de tu Presupuesto, repartidos por categoría. El área clara es lo que tú pones; la de arriba, lo que ganan tus
              intereses (interés compuesto).
            </>
          ) : (
            <>
              Tu Presupuesto todavía no aparta nada para ahorro e inversión: la proyección solo muestra cómo crece lo que ya tienes.{" "}
              <Link href="/caja/ajustes">Agrega una categoría de ahorro en el Presupuesto</Link>.
            </>
          )}
        </p>
        <ul className="leyenda">
          <li>
            <span className="clave-linea" style={{ background: "var(--serie-1)", height: 3, borderRadius: 2 }} />
            Total (lo que aportaste + intereses)
          </li>
          <li>
            <span className="clave-linea" style={{ background: "var(--serie-2)", height: 3, borderRadius: 2 }} />
            Lo que aportaste
          </li>
        </ul>
        <GraficoSerie
          series={[
            { nombre: "Total", color: "var(--serie-1)", area: true, puntos: puntos.map((p) => ({ t: fecha(p.mes), v: p.total.toFixed(2) })) },
            { nombre: "Lo que aportaste", color: "var(--serie-2)", area: true, puntos: puntos.map((p) => ({ t: fecha(p.mes), v: p.aportado.toFixed(2) })) },
          ]}
          etiqueta={`Proyección a ${num(anos, 0)} años: total y lo que aportaste. La tabla por categoría tiene las cifras.`}
          alto={compacto ? 200 : 280}
        />
        <div className="desplazable">
          <table className="tabla" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col" className="num">
                  Hoy
                </th>
                <th scope="col" className="num">
                  En {num(anos, 0)} {anos === 1 ? "año" : "años"}
                </th>
                <th scope="col" className="num">
                  Tus intereses
                </th>
              </tr>
            </thead>
            <tbody>
              {pr.porClase
                .filter((c) => c.hoy.gt(0) || c.final.gt(0))
                .map((c) => (
                  <tr key={c.clase}>
                    <th scope="row">
                      <span className={`cap-muestra ${c.clase}`} aria-hidden="true" /> {nombreClase(c.clase)}
                    </th>
                    <td className="num">{num(c.hoy)}</td>
                    <td className="num">{num(c.final)}</td>
                    <td className="num">{num(c.interes)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="cap-pie-proy">
          <OrigenAhorro datos={datos} />
          <span className="sello">Proyección con tus tasas y reglas: tasa anual ÷ 12 cada mes, en pesos de hoy, sin cambiar el dólar. No es un pronóstico.</span>
          {pr.porInstrumento.some((x) => x.reglas.supuesto) ? (
            <span className="sello">{pr.porInstrumento.filter((x) => x.reglas.supuesto).length} instrumento(s) sin plan: se supone que capitalizan (los de cupón, que cobras cada mes). Ajústalo abajo.</span>
          ) : null}
        </div>
      </Panel>
    </>
  );
}

/** Lo que el plan manda a invertir este mes: pendiente hasta «Sí, lo hice» (con monto real y fecha). */
export function PanelAportesMes({ datos, mes, volver = "/capital/futuro", compacto = false }: Props & { volver?: string; compacto?: boolean }) {
  const { ctx } = datos;
  const mesHoy = ctx.hoy.slice(0, 7);
  const ahorro = ahorroPresupuestado(ctx);
  const plan = aportesDelPlan(ctx, ahorro).filter((x) => x.monto.gt(0));
  const confirmados = datos.aportesConfirmados.filter((x) => x.mes === mesHoy);
  const cuentas = (datos.caja.datos?.cuentas ?? []).filter((c) => !esDeudaCaja(c.tipo));
  const titulo = "Aportes de este mes";
  if (!plan.length) {
    return (
      <Panel titulo={titulo} id="cap-t-aportes">
        <SinDatos accion={ahorro ? { href: "/capital/futuro#cap-t-plan", texto: "Repartir mi ahorro" } : { href: "/caja/ajustes", texto: "Apartar ahorro en mi Presupuesto" }}>
          {ahorro
            ? "Tu Presupuesto aparta ahorro, pero falta decir a qué categorías va. Escribe el reparto en el plan."
            : "Cuando tu Presupuesto aparte dinero para ahorro e inversión, aquí verás cuánto toca a cada inversión cada mes."}
        </SinDatos>
      </Panel>
    );
  }
  const total = plan.reduce((s, x) => s.plus(x.monto), CERO);
  const hechos = plan.filter((x) => confirmados.some((c) => c.activoId === x.activo.id));
  return (
    <Panel titulo={titulo} id="cap-t-aportes" ancho={!compacto} extra={<span className="tenue chico">{hechos.length} de {plan.length} hechos</span>}>
      <p className="cap-nota" style={{ marginTop: 0 }}>
        Tu plan manda <strong>{rd(total)}</strong> este mes. Cada aporte queda pendiente hasta que confirmes que lo hiciste: así se suma al Portafolio{cuentas.length ? " y, si sale de una cuenta, al ahorro del Presupuesto" : ""}, una sola vez.
      </p>
      <ul className={`ap-lista${compacto ? " compacta" : ""}`}>
        {(compacto ? plan.slice(0, 4) : plan).map((x) => {
          const hecho = confirmados.find((c) => c.activoId === x.activo.id);
          const unidades = x.activo.clase === "rentavariable";
          return (
            <li key={x.activo.id} className={`ap-item${hecho ? " hecho" : ""}`}>
              <div className="ap-cabeza">
                <span className={`cap-muestra ${x.activo.clase}`} aria-hidden="true" />
                <span className="ap-nombre">
                  <strong>{x.activo.nombre}</strong>
                  <span className="chico tenue">
                    {nombreClase(x.activo.clase)} · {pct(x.pctClase.times(x.pctEnClase), 0)} de tu ahorro
                  </span>
                </span>
                <span className="mono ap-monto">{rd(x.monto)}</span>
              </div>
              {hecho ? (
                <p className="ap-estado sube">
                  <Icono nombre="ok" /> Hecho{hecho.fecha ? ` el ${hecho.fecha}` : ""}: {x.activo.moneda === "DOP" ? rd(hecho.monto) : `${x.activo.moneda} ${num(hecho.monto, 2)}`}
                </p>
              ) : compacto ? (
                <p className="ap-estado tenue chico">Pendiente</p>
              ) : (
                <details className="ap-confirmar">
                  <summary className="boton chico">Sí, lo hice</summary>
                  <form action={confirmarAporte} className="cap-form">
                    <input type="hidden" name="activoId" value={x.activo.id} />
                    <input type="hidden" name="aporteMes" value={mesHoy} />
                    <input type="hidden" name="mes" value={mes} />
                    <input type="hidden" name="volver" value={volver} />
                    <div className="reg-campos">
                      {unidades ? (
                        <>
                          <label className="cap-campo">
                            Unidades que compraste
                            <input name="cantidad" inputMode="decimal" required placeholder="Ej.: 2" autoComplete="off" />
                          </label>
                          <label className="cap-campo">
                            Precio de cada una ({x.activo.moneda})
                            <input name="precio" inputMode="decimal" required placeholder="Ej.: 101.25" autoComplete="off" />
                          </label>
                        </>
                      ) : (
                        <label className="cap-campo">
                          Monto real ({x.activo.moneda === "DOP" ? "RD$" : x.activo.moneda})
                          <input name="monto" inputMode="decimal" required defaultValue={x.activo.moneda === "DOP" ? x.monto.toFixed(2) : ""} placeholder="Ej.: 5,000" autoComplete="off" />
                        </label>
                      )}
                      <label className="cap-campo">
                        Fecha
                        <input type="date" name="fecha" defaultValue={ctx.hoy} required />
                      </label>
                      <label className="cap-campo">
                        ¿De qué cuenta salió?
                        <select name="cuenta" defaultValue={x.activo.moneda === "DOP" ? (cuentas.find((c) => c.tipo === "banco")?.id ?? "") : ""}>
                          <option value="">De ninguna del Presupuesto</option>
                          {x.activo.moneda === "DOP"
                            ? cuentas.filter((c) => c.id !== x.activo.cajaId).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nombre}
                                </option>
                              ))
                            : null}
                        </select>
                      </label>
                    </div>
                    <div className="cap-botones">
                      <button type="submit" className="boton">
                        Confirmar aporte
                      </button>
                    </div>
                  </form>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      {compacto && plan.length > 4 ? (
        <p className="cap-nota">
          <Link href="/capital/futuro#cap-t-aportes">Ver los {plan.length} aportes</Link>
        </p>
      ) : null}
      <span className="sello">Fuente: tu Presupuesto · el reparto de tu plan</span>
    </Panel>
  );
}

/** Reparto por categoría y reglas de cada instrumento (tasa, capitaliza, pagos, reinversión, % del aporte). */
export function PanelPlan({ datos, mes }: Props) {
  const { ctx } = datos;
  const rep = repartoClases(ctx);
  const ahorro = ahorroPresupuestado(ctx);
  const plan = ctx.p.planClases;
  const suma = plan ? CLASES.reduce((s, c) => s.plus(n(plan[c.id])), CERO) : null;
  const aportes = new Map(aportesDelPlan(ctx, ahorro).map((x) => [x.activo.id, x.monto]));
  return (
    <Panel titulo="Tu plan de aportes" id="cap-t-plan" ancho extra={<span className="tenue chico">{rep?.origen === "plan" ? "reparto propio" : "según tu Política"}</span>}>
      <form action={guardarParametros} className="cap-form" key={JSON.stringify(plan)}>
        <input type="hidden" name="seccion" value="planClases" />
        <input type="hidden" name="volver" value="/capital/futuro" />
        <input type="hidden" name="mes" value={mes} />
        <h3 className="cap-rotulo">1. Cuánto de tu ahorro va a cada categoría</h3>
        <div className="reg-campos">
          {CLASES.map((c) => (
            <label className="cap-campo" key={c.id}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span className={`cap-muestra ${c.id}`} aria-hidden="true" /> {c.nom} %
              </span>
              <input
                name={`plan.${c.id}`}
                inputMode="decimal"
                defaultValue={plan ? aPct(plan[c.id]) : ""}
                placeholder={`Ej.: ${aPct(ctx.p.metaAsignacion[c.id] || "0") || "25"}`}
              />
              <span className="ayuda">{ahorro && rep ? `${rd(ahorro.times(rep.pct[c.id]).round(0))} al mes` : "—"}</span>
            </label>
          ))}
        </div>
        <p className="tenue chico" style={{ margin: 0 }}>
          {plan ? `Tu reparto suma ${pct(suma, 0)}${suma && !suma.eq(1) ? ": se reparte en proporción" : ""}.` : "Vacío = se usa la meta por categoría de tu Política."} Dentro de cada categoría, el reparto
          entre instrumentos se escribe abajo (vacío = partes iguales).
        </p>
        <div className="cap-botones">
          <button type="submit" className="boton">
            Guardar reparto
          </button>
          {plan ? (
            <button type="submit" name="planClases" value="meta" className="boton secundario">
              Usar la meta de mi Política
            </button>
          ) : null}
        </div>
      </form>
      <h3 className="cap-rotulo" style={{ marginTop: 18 }}>
        2. Las reglas de cada instrumento
      </h3>
      <details className="cap-mas">
        <summary>¿Qué es capitalizar?</summary>
        <p className="cap-nota">
          <strong>Capitaliza</strong> cuando el interés se queda dentro del instrumento y al mes siguiente gana interés también (interés compuesto). Si <strong>no capitaliza</strong>,
          te paga los intereses cada cierto tiempo: si los <strong>reinviertes</strong> (por ejemplo, cada mes en el mismo fondo), tú misma creas el interés compuesto; si no,
          solo cobras.
        </p>
      </details>
      <ul className="cap-instrumentos plan-lista">
        {ctx.activos.map((a) => {
          const pl = a.plan;
          const cap = pl?.capitaliza === true ? "si" : pl?.capitaliza === false ? "no" : "";
          return (
            <li key={a.id}>
              <details className="cap-instrumento" key={JSON.stringify(pl)}>
                <summary>
                  <span className="nombre">
                    {a.nombre}
                    <span className="detalle">
                      {nombreClase(a.clase)} · {pct(a.tasa, 2)} al año ·{" "}
                      {pl?.capitaliza === null || pl?.capitaliza === undefined
                        ? "sin plan (supuesto)"
                        : pl.capitaliza
                          ? "capitaliza"
                          : `paga ${FRECUENCIAS_PAGO.find((f) => f.id === pl.frecuenciaPago)?.nom.toLowerCase() ?? "cada mes"}${pl.reinvierte ? " y reinviertes" : ""}`}
                    </span>
                  </span>
                  <span className="monto">
                    {rd(aportes.get(a.id) ?? CERO)}
                    <span className="detalle">al mes</span>
                  </span>
                </summary>
                <div className="cuerpo">
                  <form action={guardarPlan} className="cap-form plan-form">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="mes" value={mes} />
                    <div className="reg-campos">
                      <label className="cap-campo">
                        Tasa al año %
                        <input name="tasa" inputMode="decimal" defaultValue={n(a.tasa).gt(0) ? aPct(a.tasa) : ""} placeholder="Ej.: 9.5" />
                      </label>
                      <label className="cap-campo">
                        ¿Capitaliza dentro del instrumento?
                        <select name="capitaliza" defaultValue={cap}>
                          <option value="">No lo sé (usar supuesto)</option>
                          <option value="si">Sí, el interés se queda adentro</option>
                          <option value="no">No, me paga los intereses</option>
                        </select>
                      </label>
                      <label className="cap-campo p-nocap">
                        ¿Cada cuánto te paga?
                        <select name="frecuenciaPago" defaultValue={pl?.frecuenciaPago ?? "mensual"}>
                          {FRECUENCIAS_PAGO.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.nom}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="cap-campo p-nocap">
                        ¿Reinviertes lo que te paga?
                        <select name="reinvierte" defaultValue={pl?.reinvierte ? "si" : "no"}>
                          <option value="si">Sí, lo vuelvo a invertir</option>
                          <option value="no">No, lo cobro</option>
                        </select>
                      </label>
                      <label className="cap-campo">
                        % del aporte de {nombreClase(a.clase)}
                        <input name="aportePct" inputMode="decimal" defaultValue={pl?.aportePct ? aPct(pl.aportePct) : ""} placeholder="Ej.: 50 (vacío = partes iguales)" />
                      </label>
                      <label className="cap-campo">
                        Recibe aportes desde
                        <input type="date" name="inicio" defaultValue={pl?.inicio ?? ""} />
                      </label>
                      <label className="cap-campo">
                        Vence el <span className="ayuda">(opcional)</span>
                        <input type="date" name="venc" defaultValue={a.venc ?? ""} />
                      </label>
                    </div>
                    <div className="cap-botones">
                      <button type="submit" className="boton">
                        Guardar reglas
                      </button>
                    </div>
                  </form>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
