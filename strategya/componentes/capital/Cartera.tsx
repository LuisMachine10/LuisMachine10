// Vista Cartera: posición, precios de mercado, retorno realizado, P&L por posición, instrumentos,
// libro de transacciones y ajustes (tipo de cambio manual, metas de asignación, tarjetas).

import Link from "next/link";
import { eliminarActivo, eliminarTransaccion, guardarActivo, guardarParametros, registrarTransaccion } from "@/app/capital/acciones";
import { CERO, desdeFlotante, n } from "@/lib/capital/decimal";
import { aPct } from "@/lib/capital/formulario";
import { num, pct, pctSg } from "@/lib/capital/formato";
import { normalizarSimbolo, posicion, precioDe, valorDOP, valorMoneda } from "@/lib/capital/posicion";
import { retornoPosiciones, tirGlobal, twr } from "@/lib/capital/retorno";
import { duracionModificada } from "@/lib/capital/riesgo";
import { type Activo, type Clase, CLASES, MONEDAS, nombreTipoTx, TIPOS_TX } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { fechaCorta } from "@/lib/formato";
import { Barra } from "./Graficos";
import { ConSigno, Dato, Panel, SinDatos } from "./Piezas";
import { SelloFx, SelloPrecio } from "./Sellos";

type Props = { datos: DatosCapital; mes: string };

function PanelPosicion({ datos }: { datos: DatosCapital }) {
  const { ctx, ahora } = datos;
  const pos = posicion(ctx);
  return (
    <Panel titulo="Posición" id="cap-t-posicion" extra={<span className="sello">{ctx.activos.length} instrumentos</span>}>
      <div className="desplazable">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Clase</th>
              <th scope="col" className="num">
                RD$
              </th>
              <th scope="col" className="num">
                Peso
              </th>
            </tr>
          </thead>
          <tbody>
            {CLASES.map((c) => {
              const v = pos.porClase[c.id];
              const p = pos.total.gt(0) ? v.div(pos.total) : null;
              return (
                <tr key={c.id}>
                  <th scope="row">
                    {c.nom}
                    <Barra pct={p} meta={n(ctx.p.metaAsignacion[c.id])} />
                  </th>
                  <td className="num">{num(v)}</td>
                  <td className="num">{pct(p, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="cap-dos" style={{ marginTop: 10 }}>
        <Dato rotulo="Activos totales">{num(pos.total)}</Dato>
        <Dato rotulo="Renta anual devengada">{num(pos.rentaTotal)}</Dato>
      </div>
      {pos.sinValorar.length ? (
        <p className="cap-nota baja">
          {pos.sinValorar.length} instrumento(s) sin tipo de cambio quedan fuera del total: {pos.sinValorar.map((a) => a.nombre).join(", ")}.
        </p>
      ) : null}
      <div style={{ marginTop: 8 }}>
        <SelloFx fx={ctx.mercado.fx.USD} moneda="USD" ahora={ahora} hoy={ctx.hoy} />
      </div>
      <p className="cap-nota">La marca vertical en cada barra es tu meta de asignación.</p>
    </Panel>
  );
}

function PanelPrecios({ datos }: { datos: DatosCapital }) {
  const { ctx, ahora, tareaPrecios } = datos;
  const conSimbolo = ctx.activos.filter((a) => normalizarSimbolo(a.simbolo));
  if (!conSimbolo.length) return null;
  return (
    <Panel
      titulo="Precios de mercado"
      id="cap-t-precios"
      extra={tareaPrecios?.estado === "error" ? <span className="etiqueta error">✕ la última lectura falló</span> : null}
    >
      <div className="desplazable">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Símbolo</th>
              <th scope="col" className="num">
                Precio US$
              </th>
              <th scope="col">Origen</th>
            </tr>
          </thead>
          <tbody>
            {conSimbolo.map((a) => {
              const p = precioDe(ctx, a);
              return (
                <tr key={a.id}>
                  <th scope="row">{a.simbolo}</th>
                  <td className="num">{num(p.precio, 2)}</td>
                  <td>
                    <SelloPrecio p={p.mercado} ahora={ahora} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="cap-nota">
        Finnhub se lee de lunes a viernes a las 5:30 PM (hora RD), después del cierre de Nueva York. Sin cotización se usa el precio manual del
        instrumento.
        {tareaPrecios?.estado === "error" && tareaPrecios.error ? ` Último error: ${tareaPrecios.error}` : ""}
      </p>
    </Panel>
  );
}

function PanelRetorno({ datos }: { datos: DatosCapital }) {
  const { ctx } = datos;
  const tw = twr(ctx);
  const ti = tirGlobal(ctx);
  const infl = n(ctx.p.inflacion);
  return (
    <Panel titulo="Retorno realizado" id="cap-t-retorno" extra={<span className="sello">{tw ? `${tw.meses} meses cerrados` : "sin serie"}</span>}>
      {tw || ti ? (
        <>
          <div className="cap-dos">
            <Dato rotulo="TWR anualizado">{tw ? pct(tw.anualizado, 2) : "—"}</Dato>
            <Dato rotulo="TIR (tu experiencia)">{ti ? pct(ti.tir, 2) : "—"}</Dato>
            <Dato rotulo="Retorno acumulado">{tw ? pct(tw.total, 2) : "—"}</Dato>
            <Dato rotulo="Retorno real">{tw ? pctSg(desdeFlotante(tw.anualizado).minus(infl), 2) : "—"}</Dato>
          </div>
          <p className="cap-nota">
            El <strong>TWR</strong> juzga la selección: aísla el efecto de cuándo aportaste. La <strong>TIR</strong> juzga tu experiencia real,
            porque pondera el momento de cada aporte.{" "}
            {tw && ti
              ? Math.abs(ti.tir - tw.anualizado) > 0.01
                ? ti.tir > tw.anualizado
                  ? "Tu TIR va por encima del TWR: el momento de tus aportes te favoreció."
                  : "Tu TIR va por debajo del TWR: aportaste más justo antes de los períodos flojos."
                : "Ambos van parejos: el momento de tus aportes no cambió el resultado."
              : ""}
            {tw && infl.gt(0) ? ` Contra una inflación de referencia de ${pct(infl, 1)}.` : ""} Tasas aproximadas por método, redondeadas.
          </p>
        </>
      ) : (
        <SinDatos>
          Necesitas al menos dos meses cerrados (con foto) para medir retorno. Se mide solo sobre meses cerrados: una foto a mitad de mes tiene
          el flujo incompleto y distorsiona la cifra.
        </SinDatos>
      )}
    </Panel>
  );
}

function PanelPL({ datos }: { datos: DatosCapital }) {
  const rp = retornoPosiciones(datos.ctx);
  if (!rp.length) return null;
  const suma = (k: "noRealizado" | "realizado" | "cobrado") => rp.reduce((s, r) => s.plus(r[k]), CERO);
  return (
    <Panel titulo="P&L por posición" id="cap-t-pl" ancho extra={<span className="sello">desde tus transacciones · moneda de cada instrumento</span>}>
      <div className="desplazable">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Posición</th>
              <th scope="col" className="num">
                Unidades
              </th>
              <th scope="col" className="num">
                Costo prom.
              </th>
              <th scope="col" className="num">
                P&L total
              </th>
              <th scope="col" className="num">
                %
              </th>
              <th scope="col" className="num">
                TIR
              </th>
            </tr>
          </thead>
          <tbody>
            {rp.map((r) => (
              <tr key={r.activo.id}>
                <th scope="row">{r.activo.simbolo || r.activo.nombre}</th>
                <td className="num">{num(r.cantidad, 4).replace(/\.?0+$/, "")}</td>
                <td className="num">{num(r.costoProm, 2)}</td>
                <td className="num">
                  <ConSigno v={r.totalPL} d={2} />
                </td>
                <td className="num">{pctSg(r.retPct, 1)}</td>
                <td className="num">{r.tir === null ? "—" : pct(r.tir, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap-nota">
        No realizado {num(suma("noRealizado"), 2)} · realizado {num(suma("realizado"), 2)} · cobrado {num(suma("cobrado"), 2)}.
      </p>
    </Panel>
  );
}

function CamposActivo({ a, clase }: { a: Activo | null; clase: Clase }) {
  const pref = a?.id ?? `nuevo-${clase}`;
  return (
    <div className="cap-campos">
      <label className="cap-campo">
        Nombre
        <input name="nombre" defaultValue={a?.nombre ?? ""} required maxLength={200} id={`${pref}-nombre`} />
      </label>
      <label className="cap-campo">
        Institución / emisor
        <input name="inst" defaultValue={a?.inst ?? ""} maxLength={200} />
      </label>
      {clase === "accionesusa" ? (
        <label className="cap-campo">
          Símbolo (para el precio de mercado)
          <input name="simbolo" defaultValue={a?.simbolo ?? ""} maxLength={15} autoCapitalize="characters" />
        </label>
      ) : null}
      <label className="cap-campo">
        Moneda
        <select name="moneda" defaultValue={a?.moneda ?? (clase === "accionesusa" ? "USD" : "DOP")}>
          {MONEDAS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="cap-campo">
        Cantidad (monto o acciones)
        <input name="cantidad" defaultValue={a?.cantidad ?? ""} inputMode="decimal" required />
      </label>
      <label className="cap-campo">
        Precio unitario (1 para saldos)
        <input name="precio" defaultValue={a?.precio ?? "1"} inputMode="decimal" />
      </label>
      <label className="cap-campo">
        Tasa o dividendo anual %
        <input name="tasa" defaultValue={aPct(a?.tasa ?? "0")} inputMode="decimal" />
      </label>
      {clase === "rentafija" ? (
        <>
          <label className="cap-campo">
            Vencimiento
            <input type="date" name="venc" defaultValue={a?.venc ?? ""} />
          </label>
          <label className="cap-campo">
            Estructura (define la duración)
            <select name="tipoRF" defaultValue={a?.tipoRF ?? "acumula"}>
              <option value="acumula">Acumula a vencimiento</option>
              <option value="cupon">Paga cupón periódico</option>
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}

function Instrumentos({ datos, mes }: Props) {
  const { ctx } = datos;
  return (
    <section className="cap-ancho" aria-labelledby="cap-t-instrumentos">
      <h2 className="panel-titulo" id="cap-t-instrumentos" style={{ margin: "4px 0 8px" }}>
        Instrumentos
      </h2>
      {CLASES.map((c) => {
        const items = ctx.activos.filter((a) => a.clase === c.id);
        const sub = items.reduce((s, a) => s.plus(valorDOP(ctx, a) ?? CERO), CERO);
        return (
          <details className="cap-grupo" key={c.id}>
            <summary>
              <span>
                {c.nom} <span className="tenue chico">· {c.desc}</span>
              </span>
              <span className="total">{num(sub)}</span>
            </summary>
            <div className="cuerpo">
              {items.length === 0 ? <p className="cap-nota">Sin instrumentos en esta clase.</p> : null}
              {items.map((a) => {
                const d = duracionModificada(a, ctx.hoy);
                const v = valorDOP(ctx, a);
                const p = precioDe(ctx, a);
                return (
                  <details className="cap-grupo" key={`${a.id}|${JSON.stringify(a)}`}>
                    <summary>
                      <span style={{ minWidth: 0 }}>
                        {a.nombre}
                        <span className="tenue chico" style={{ display: "block", fontWeight: 400 }}>
                          {[a.inst, n(a.tasa).gt(0) ? pct(a.tasa, 2) : null, a.venc ? `vence ${fechaCorta(a.venc)}` : null, d ? `dur ${num(d.toFixed(6), 2)}` : null, p.origen === "mercado" ? "precio de mercado" : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="total">
                        {v === null ? "sin tipo de cambio" : num(v)}
                        {a.moneda !== "DOP" ? (
                          <span className="tenue chico" style={{ display: "block", fontWeight: 400 }}>
                            {a.moneda} {num(valorMoneda(ctx, a), 2)}
                          </span>
                        ) : null}
                      </span>
                    </summary>
                    <div className="cuerpo">
                      <form action={guardarActivo} className="cap-form">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="clase" value={a.clase} />
                        <input type="hidden" name="mes" value={mes} />
                        <CamposActivo a={a} clase={a.clase} />
                        <div className="cap-botones">
                          <button className="cap-boton primario" type="submit">
                            Guardar
                          </button>
                        </div>
                      </form>
                      <form action={eliminarActivo} className="cap-botones" style={{ marginTop: 8 }}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="mes" value={mes} />
                        <button className="cap-boton peligro" type="submit">
                          Eliminar {a.nombre}
                        </button>
                      </form>
                    </div>
                  </details>
                );
              })}
              <details className="cap-grupo">
                <summary>+ Añadir instrumento</summary>
                <div className="cuerpo">
                  <form action={guardarActivo} className="cap-form">
                    <input type="hidden" name="clase" value={c.id} />
                    <input type="hidden" name="mes" value={mes} />
                    <CamposActivo a={null} clase={c.id} />
                    <div className="cap-botones">
                      <button className="cap-boton primario" type="submit">
                        Añadir
                      </button>
                    </div>
                  </form>
                </div>
              </details>
            </div>
          </details>
        );
      })}
    </section>
  );
}

function Transacciones({ datos, mes }: Props) {
  const { ctx } = datos;
  const ord = [...ctx.tx].sort((a, b) => ((b.fecha ?? "") < (a.fecha ?? "") ? -1 : (b.fecha ?? "") > (a.fecha ?? "") ? 1 : 0));
  const visibles = ord.slice(0, 40);
  return (
    <Panel titulo="Libro de transacciones" id="cap-t-tx" ancho extra={<span className="sello">{ctx.tx.length} · sin esto no hay base de costo ni TIR</span>}>
      {visibles.length ? (
        <div className="desplazable">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Tipo · instrumento</th>
                <th scope="col" className="num">
                  Cant. × precio
                </th>
                <th scope="col" className="num">
                  Monto
                </th>
                <th scope="col">
                  <span className="sr-solo">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((t) => {
                const a = ctx.activos.find((x) => x.id === t.activoId);
                return (
                  <tr key={t.id}>
                    <td className="mono">{t.fecha ?? "sin fecha"}</td>
                    <th scope="row">
                      {nombreTipoTx(t.tipo)} · {a ? a.simbolo || a.nombre : <span className="tenue">instrumento eliminado</span>}
                    </th>
                    <td className="num">
                      {num(t.cantidad, 4).replace(/\.?0+$/, "")} × {num(t.precio, 2)}
                      {n(t.comision).gt(0) ? ` + com. ${num(t.comision, 2)}` : ""}
                    </td>
                    <td className="num">
                      {num(n(t.cantidad).times(n(t.precio)), 2)} {t.moneda ?? ""}
                    </td>
                    <td>
                      <form action={eliminarTransaccion}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="mes" value={mes} />
                        <button type="submit" className="boton-texto" aria-label={`Eliminar la transacción del ${t.fecha ?? "sin fecha"}`}>
                          ×
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <SinDatos>Todavía no hay transacciones. Carga las compras con fecha y precio y se desbloquean base de costo, P&L realizado y TIR por posición.</SinDatos>
      )}
      {ord.length > 40 ? <p className="cap-nota">Mostrando las 40 más recientes de {ord.length}.</p> : null}
      {ctx.activos.length ? (
        <details className="cap-grupo" style={{ marginTop: 10 }}>
          <summary>+ Registrar transacción</summary>
          <div className="cuerpo">
            <form action={registrarTransaccion} className="cap-form">
              <input type="hidden" name="mes" value={mes} />
              <div className="cap-campos">
                <label className="cap-campo">
                  Instrumento
                  <select name="activoId" required>
                    {ctx.activos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.simbolo || a.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cap-campo">
                  Tipo
                  <select name="tipo">
                    {TIPOS_TX.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nom}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cap-campo">
                  Fecha
                  <input type="date" name="fecha" defaultValue={ctx.hoy} required />
                </label>
                <label className="cap-campo">
                  Cantidad
                  <input name="cantidad" inputMode="decimal" placeholder="0" />
                </label>
                <label className="cap-campo">
                  Precio unitario
                  <input name="precio" inputMode="decimal" placeholder="0" />
                </label>
                <label className="cap-campo">
                  Comisión
                  <input name="comision" inputMode="decimal" placeholder="0" />
                </label>
              </div>
              <div className="cap-botones">
                <button className="cap-boton primario" type="submit">
                  Guardar transacción
                </button>
              </div>
            </form>
          </div>
        </details>
      ) : null}
    </Panel>
  );
}

function Ajustes({ datos, mes }: Props) {
  const { p } = datos.ctx;
  const comun = (seccion: string) => (
    <>
      <input type="hidden" name="seccion" value={seccion} />
      <input type="hidden" name="volver" value="/capital/cartera" />
      <input type="hidden" name="mes" value={mes} />
    </>
  );
  const tarjetas = [...p.tarjetas, { id: "", nombre: "", limite: "" }];
  return (
    <details className="cap-grupo cap-ancho" key={JSON.stringify([p.fx, p.fxUpdated, p.metaAsignacion, p.bandaRebalanceo, p.maxEmisor, p.tarjetas])}>
      <summary>Ajustes</summary>
      <div className="cuerpo cap-form">
        <form action={guardarParametros} className="cap-form">
          {comun("fx")}
          <h3 className="cap-rotulo">Tipo de cambio manual (RD$ por unidad)</h3>
          <p className="cap-nota" style={{ marginTop: 0 }}>
            Para US$ se usa el dólar de venta del BCRD cuando está guardado; el manual queda de respaldo. Para € siempre es el manual.
          </p>
          <div className="cap-campos">
            <label className="cap-campo">
              US$ → RD$
              <input name="fx.USD" defaultValue={p.fx.USD ?? ""} inputMode="decimal" />
            </label>
            <label className="cap-campo">
              € → RD$
              <input name="fx.EUR" defaultValue={p.fx.EUR ?? ""} inputMode="decimal" />
            </label>
            <label className="cap-campo">
              Actualizado el
              <input type="date" name="fxUpdated" defaultValue={p.fxUpdated ?? ""} />
            </label>
          </div>
          <div className="cap-botones">
            <button className="cap-boton" type="submit">
              Guardar tipo de cambio
            </button>
          </div>
        </form>
        <form action={guardarParametros} className="cap-form">
          {comun("asignacion")}
          <h3 className="cap-rotulo">Asignación objetivo y límites (%)</h3>
          <div className="cap-campos">
            {CLASES.map((c) => (
              <label className="cap-campo" key={c.id}>
                Meta {c.nom}
                <input name={`meta.${c.id}`} defaultValue={aPct(p.metaAsignacion[c.id])} inputMode="decimal" />
              </label>
            ))}
            <label className="cap-campo">
              Banda de rebalanceo (pp)
              <input name="bandaRebalanceo" defaultValue={aPct(p.bandaRebalanceo)} inputMode="decimal" />
            </label>
            <label className="cap-campo">
              Máximo por emisor
              <input name="maxEmisor" defaultValue={aPct(p.maxEmisor)} inputMode="decimal" />
            </label>
          </div>
          <div className="cap-botones">
            <button className="cap-boton" type="submit">
              Guardar metas
            </button>
          </div>
        </form>
        <form action={guardarParametros} className="cap-form">
          {comun("tarjetas")}
          <h3 className="cap-rotulo">Tarjetas de crédito</h3>
          <div className="desplazable">
            <table className="tabla cap-tabla-form">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col" className="num">
                    Límite RD$
                  </th>
                </tr>
              </thead>
              <tbody>
                {tarjetas.map((t, i) => (
                  <tr key={`tc-${i}`}>
                    <td>
                      <input type="hidden" name={`tarjetas.${i}.id`} value={t.id} />
                      <input name={`tarjetas.${i}.nombre`} defaultValue={t.nombre} placeholder={t.id ? "" : "nueva tarjeta"} aria-label={`Nombre de la tarjeta ${i + 1}`} maxLength={200} />
                    </td>
                    <td>
                      <input name={`tarjetas.${i}.limite`} defaultValue={t.limite} inputMode="decimal" aria-label={`Límite de la tarjeta ${i + 1}`} style={{ textAlign: "right" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cap-nota">Deja el nombre vacío para quitar una tarjeta.</p>
          <div className="cap-botones">
            <button className="cap-boton" type="submit">
              Guardar tarjetas
            </button>
          </div>
        </form>
        <p className="cap-nota">
          <Link href="/capital/exportar">Descargar mis datos (JSON, mismo formato que se importa)</Link>
        </p>
      </div>
    </details>
  );
}

export function VistaCartera({ datos, mes }: Props) {
  return (
    <>
      <PanelPosicion datos={datos} />
      <PanelRetorno datos={datos} />
      <PanelPrecios datos={datos} />
      <PanelPL datos={datos} />
      <Instrumentos datos={datos} mes={mes} />
      <Transacciones datos={datos} mes={mes} />
      <Ajustes datos={datos} mes={mes} />
    </>
  );
}

