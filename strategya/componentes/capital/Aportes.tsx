// Aportes del plan (Fase F): los del mes y los de meses anteriores sin responder, con «Sí, lo hice» y
// «Omitir este mes» (motivo opcional) uno al lado del otro; y, si un instrumento venció, la propuesta de a
// dónde pasar su parte del ahorro, con pantalla de confirmación (nada se reparte solo).

import Link from "next/link";
import { confirmarAporte, deshacerOmisionAporte, omitirAporte, reubicarAporte } from "@/app/capital/acciones";
import { type AporteDelMes, aportesDeMes, partesVencidas, pendientesAnteriores, reubicarParte } from "@/lib/capital/aportes";
import { CERO } from "@/lib/capital/decimal";
import { mesLargo } from "@/lib/capital/fechas";
import { num, pct, rd } from "@/lib/capital/formato";
import { ahorroPresupuestado, aportesDelPlan } from "@/lib/capital/proyeccion";
import { nombreClase } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { esDeuda as esDeudaCaja } from "@/lib/caja/tipos";
import { Icono } from "./Iconos";
import { Panel, SinDatos } from "./Piezas";

type Props = { datos: DatosCapital; mes: string };

function Ocultos({ x, mes, volver }: { x: AporteDelMes; mes: string; volver: string }) {
  return (
    <>
      <input type="hidden" name="activoId" value={x.activo.id} />
      <input type="hidden" name="aporteMes" value={x.mes} />
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="volver" value={volver} />
    </>
  );
}

function ItemAporte({ x, datos, mes, volver, compacto, conMes }: { x: AporteDelMes; datos: DatosCapital; mes: string; volver: string; compacto: boolean; conMes: boolean }) {
  const unidades = x.activo.clase === "rentavariable";
  // Solo cuentas en la misma moneda del instrumento (RD$ o US$) y que no sean deudas.
  const cuentas = (datos.caja.datos?.cuentas ?? []).filter((c) => !esDeudaCaja(c.tipo) && (c.moneda ?? "DOP") === x.activo.moneda && c.id !== x.activo.cajaId);
  const moneda = x.activo.moneda === "DOP" ? "RD$" : x.activo.moneda === "USD" ? "US$" : x.activo.moneda;
  return (
    <li className={`ap-item${x.estado === "hecho" ? " hecho" : x.estado === "omitido" ? " omitido" : ""}`}>
      <div className="ap-cabeza">
        <span className={`cap-muestra ${x.activo.clase}`} aria-hidden="true" />
        <span className="ap-nombre">
          <strong>{x.activo.nombre}</strong>
          <span className="chico tenue">
            {conMes ? `${mesLargo(x.mes)} · ` : ""}
            {nombreClase(x.activo.clase)} · {pct(x.pct, 0)} de tu ahorro
          </span>
        </span>
        <span className="mono ap-monto">{rd(x.monto)}</span>
      </div>
      {x.estado === "hecho" ? (
        <p className="ap-estado sube">
          <Icono nombre="ok" /> Hecho{x.hecho?.fecha ? ` el ${x.hecho.fecha}` : ""}: {x.activo.moneda === "DOP" ? rd(x.hecho?.monto ?? "0") : `${moneda} ${num(x.hecho?.monto ?? "0", 2)}`}
        </p>
      ) : x.estado === "omitido" ? (
        <div className="ap-estado tenue">
          <span>Omitido este mes{x.omision?.motivo ? `: ${x.omision.motivo}` : ""}</span>
          {compacto ? null : (
            <form action={deshacerOmisionAporte}>
              <Ocultos x={x} mes={mes} volver={volver} />
              <button type="submit" className="boton secundario chico">
                Deshacer
              </button>
            </form>
          )}
        </div>
      ) : compacto ? (
        <p className="ap-estado tenue chico">Pendiente</p>
      ) : (
        <div className="ap-acciones">
          <details className="ap-confirmar">
            <summary className="boton chico">Sí, lo hice</summary>
            <form action={confirmarAporte} className="cap-form">
              <Ocultos x={x} mes={mes} volver={volver} />
              <div className="reg-campos">
                {unidades ? (
                  <>
                    <label className="cap-campo">
                      Unidades que compraste
                      <input name="cantidad" inputMode="decimal" required placeholder="Ej.: 2" autoComplete="off" />
                    </label>
                    <label className="cap-campo">
                      Precio de cada una ({moneda})
                      <input name="precio" inputMode="decimal" required placeholder="Ej.: 101.25" autoComplete="off" />
                    </label>
                  </>
                ) : (
                  <label className="cap-campo">
                    Monto real ({moneda})
                    <input name="monto" inputMode="decimal" required defaultValue={x.activo.moneda === "DOP" ? x.monto.toFixed(2) : ""} placeholder="Ej.: 5,000" autoComplete="off" />
                  </label>
                )}
                <label className="cap-campo">
                  Fecha
                  <input type="date" name="fecha" defaultValue={datos.ctx.hoy} required />
                </label>
                <label className="cap-campo">
                  ¿De qué cuenta salió?
                  <select name="cuenta" defaultValue={cuentas.find((c) => c.tipo === "banco")?.id ?? ""}>
                    <option value="">De ninguna del Presupuesto</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
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
          <details className="ap-confirmar">
            <summary className="boton secundario chico">Omitir este mes</summary>
            <form action={omitirAporte} className="cap-form">
              <Ocultos x={x} mes={mes} volver={volver} />
              <label className="cap-campo">
                ¿Por qué? <span className="ayuda">(opcional)</span>
                <input name="motivo" maxLength={200} placeholder="Ej.: este mes pagué el seguro" autoComplete="off" />
              </label>
              <p className="tenue chico" style={{ margin: 0 }}>
                No mueve dinero: solo deja de pedírtelo este mes. Puedes deshacerlo.
              </p>
              <div className="cap-botones">
                <button type="submit" className="boton secundario">
                  Omitir el aporte de {mesLargo(x.mes)}
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </li>
  );
}

/** Lo que el plan manda a invertir: el mes en curso y lo que quedó sin responder de meses anteriores. */
export function PanelAportesMes({ datos, mes, volver = "/capital/futuro", compacto = false }: Props & { volver?: string; compacto?: boolean }) {
  const { ctx } = datos;
  const mesHoy = ctx.hoy.slice(0, 7);
  const ahorro = ahorroPresupuestado(ctx);
  const confirmados = datos.aportesConfirmados;
  const plan = aportesDeMes(ctx, mesHoy, ahorro, confirmados, datos.prefAportes);
  const anteriores = pendientesAnteriores(ctx, datos.caja.datos, confirmados, datos.prefAportes);
  const titulo = "Aportes de este mes";
  if (!plan.length && !anteriores.length) {
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
  const hechos = plan.filter((x) => x.estado !== "pendiente");
  const cuentas = (datos.caja.datos?.cuentas ?? []).filter((c) => !esDeudaCaja(c.tipo));
  return (
    <Panel titulo={titulo} id="cap-t-aportes" ancho={!compacto} extra={<span className="tenue chico">{hechos.length} de {plan.length} respondidos</span>}>
      {plan.length ? (
        <p className="cap-nota" style={{ marginTop: 0 }}>
          Tu plan manda <strong>{rd(total)}</strong> este mes. Cada aporte queda pendiente hasta que confirmes que lo hiciste (así se suma al Portafolio
          {cuentas.length ? " y, si sale de una cuenta, al ahorro del Presupuesto" : ""}, una sola vez) o lo omitas.
        </p>
      ) : null}
      {plan.length ? (
        <ul className={`ap-lista${compacto ? " compacta" : ""}`}>
          {(compacto ? plan.slice(0, 4) : plan).map((x) => (
            <ItemAporte key={x.activo.id} x={x} datos={datos} mes={mes} volver={volver} compacto={compacto} conMes={false} />
          ))}
        </ul>
      ) : null}
      {anteriores.length ? (
        compacto ? (
          <p className="cap-aviso" role="status">
            <Icono nombre="info" /> {anteriores.length} {anteriores.length === 1 ? "aporte de un mes anterior sigue" : "aportes de meses anteriores siguen"} sin responder.{" "}
            <Link href="/capital/futuro#cap-t-aportes-antes">Revisar</Link>
          </p>
        ) : (
          <section className="ap-anteriores" aria-labelledby="cap-t-aportes-antes-titulo" id="cap-t-aportes-antes">
            <h3 id="cap-t-aportes-antes-titulo">De meses anteriores, sin responder ({anteriores.length})</h3>
            <p className="tenue chico" style={{ margin: "0 0 8px" }}>
              Según lo que tu Presupuesto apartó cada mes y tu reparto de hoy. Dime si lo hiciste o si lo omites: nada se anota solo.
            </p>
            <ul className="ap-lista">
              {anteriores.map((x) => (
                <ItemAporte key={`${x.mes}-${x.activo.id}`} x={x} datos={datos} mes={mes} volver={volver} compacto={false} conMes />
              ))}
            </ul>
          </section>
        )
      ) : null}
      {compacto && plan.length > 4 ? (
        <p className="cap-nota">
          <Link href="/capital/futuro#cap-t-aportes">Ver los {plan.length} aportes</Link>
        </p>
      ) : null}
      <span className="sello">Fuente: tu Presupuesto · el reparto de tu plan</span>
    </Panel>
  );
}

/**
 * Instrumentos que vencieron con una parte del ahorro: se propone a dónde pasarla. Elegir el destino lleva a
 * la pantalla de confirmación (con el antes y el después); solo «Sí, pasar» cambia el reparto.
 */
export function PanelVencidos({ datos, mes }: Props) {
  const { ctx } = datos;
  const ahorro = ahorroPresupuestado(ctx);
  const vencidos = partesVencidas(ctx, ahorro);
  if (!vencidos.length) return null;
  const destinos = ctx.activos.filter((a) => !(a.venc && a.venc < ctx.hoy));
  return (
    <Panel titulo="Venció una inversión: ¿a dónde va su parte?" id="cap-t-vencidos" ancho>
      <p className="cap-nota" style={{ marginTop: 0 }}>
        Mientras no decidas, esa parte de tu ahorro queda <strong>sin destino</strong> (no se reparte sola entre las demás y no entra en la proyección).
      </p>
      <ul className="ap-lista">
        {vencidos.map((v) => (
          <li key={v.activo.id} className="ap-item">
            <div className="ap-cabeza">
              <span className={`cap-muestra ${v.activo.clase}`} aria-hidden="true" />
              <span className="ap-nombre">
                <strong>{v.activo.nombre}</strong>
                <span className="chico tenue">
                  venció el {v.activo.venc} · tenía {pct(v.pct, 1)} de tu ahorro{ahorro ? ` (${rd(v.monto)} al mes)` : ""}
                </span>
              </span>
            </div>
            {destinos.length ? (
              <form method="get" action="/capital/futuro" className="ap-reubicar">
                <input type="hidden" name="mes" value={mes} />
                <input type="hidden" name="reubicar" value={v.activo.id} />
                <label className="cap-campo">
                  Pasar su parte a
                  <select name="a" required defaultValue="">
                    <option value="" disabled>
                      Elige…
                    </option>
                    {destinos.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre} · {nombreClase(d.clase)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="boton secundario chico">
                  Revisar el cambio
                </button>
              </form>
            ) : (
              <p className="tenue chico">No tienes otra inversión vigente: agrega una en Mis cuentas para pasarle esta parte.</p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Pantalla de confirmación: el reparto antes y después. Nada cambia hasta «Sí, pasar su parte». */
export function ConfirmarReubicacion({ datos, mes, vencidoId, destinoId }: Props & { vencidoId: string; destinoId: string }) {
  const { ctx } = datos;
  const r = reubicarParte(ctx, vencidoId, destinoId);
  const v = ctx.activos.find((a) => a.id === vencidoId);
  const d = ctx.activos.find((a) => a.id === destinoId);
  if (!r || !v || !d) {
    return (
      <p className="cap-aviso cap-ancho" role="status">
        <Icono nombre="info" /> Ese cambio ya no se puede hacer (¿ya lo hiciste?). <Link href={`/capital/futuro?mes=${mes}`}>Volver</Link>
      </p>
    );
  }
  const ahorro = ahorroPresupuestado(ctx);
  const tocados = ctx.activos.filter((a) => !r.antes[a.id]?.eq(r.despues[a.id] ?? CERO));
  const plan = aportesDelPlan(ctx, ahorro);
  return (
    <Panel titulo="Confirma el cambio de tu reparto" id="cap-t-reubicar" ancho>
      <p className="cap-nota" style={{ marginTop: 0 }}>
        La parte de <strong>{v.nombre}</strong> ({pct(r.parte, 1)} de tu ahorro{ahorro ? `, ${rd(ahorro.times(r.parte).round(2))} al mes` : ""}) pasa a <strong>{d.nombre}</strong>
        {v.clase !== d.clase ? ` (de ${nombreClase(v.clase)} a ${nombreClase(d.clase)}: tu reparto por categoría queda escrito como plan propio)` : ""}. No se mueve dinero.
      </p>
      <div className="desplazable">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Inversión</th>
              <th scope="col" className="num">
                Antes
              </th>
              <th scope="col" className="num">
                Después
              </th>
            </tr>
          </thead>
          <tbody>
            {tocados.map((a) => (
              <tr key={a.id}>
                <th scope="row">{a.nombre}</th>
                <td className="num">{pct(r.antes[a.id] ?? CERO, 1)}</td>
                <td className="num">{pct(r.despues[a.id] ?? CERO, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={reubicarAporte} className="cap-botones" style={{ marginTop: 12 }}>
        <input type="hidden" name="vencidoId" value={v.id} />
        <input type="hidden" name="destinoId" value={d.id} />
        <input type="hidden" name="mes" value={mes} />
        <button type="submit" className="boton">
          Sí, pasar su parte
        </button>
        <Link href={`/capital/futuro?mes=${mes}#cap-t-vencidos`} className="boton secundario">
          Cancelar
        </Link>
      </form>
      {plan.length ? <span className="sello">Porcentajes del ahorro mensual de tu Presupuesto · tu plan de aportes</span> : null}
    </Panel>
  );
}
