// Vista Cartera: agregar un instrumento (formulario simple), instrumentos por las 4 clases, asignación,
// precios de mercado, retorno realizado, P&L por posición, libro de transacciones y ajustes
// (tipo de cambio manual y tarjetas). Importar queda como opción secundaria en la cabecera.

import Link from "next/link";
import { agregarInstrumento, eliminarActivo, eliminarTransaccion, guardarActivo, registrarTransaccion } from "@/app/capital/acciones";
import { CERO, desdeFlotante, n } from "@/lib/capital/decimal";
import { aPct } from "@/lib/capital/formulario";
import { num, pct, pctSg } from "@/lib/capital/formato";
import { normalizarSimbolo, posicion, precioDe, valorDOP, valorMoneda } from "@/lib/capital/posicion";
import { retornoPosiciones, tirGlobal, twr } from "@/lib/capital/retorno";
import { duracionModificada } from "@/lib/capital/riesgo";
import { type Activo, type Clase, CLASES, MONEDAS, nombreTipoTx, TIPOS_TX } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { fechaCorta } from "@/lib/formato";
import { PanelAsignacion } from "./Asignacion";
import { Icono } from "./Iconos";
import { ConSigno, Dato, EXPLICA, Kpi, Mas, Mosaicos, Panel, SinDatos } from "./Piezas";
import { SelloFx, SelloPrecio } from "./Sellos";

type Props = { datos: DatosCapital; mes: string };

function MosaicosCartera({ datos }: { datos: DatosCapital }) {
  const { ctx, ahora } = datos;
  const pos = posicion(ctx);
  const ext = pos.total.gt(0) ? pos.extranjero.div(pos.total) : null;
  return (
    <>
      <Mosaicos etiqueta="Resumen de la cartera" columnas={4}>
        <Kpi rotulo="Activos totales" valor={num(pos.total)} unidad="RD$" meta={`${ctx.activos.length} instrumentos`} tono="neutra" />
        <Kpi
          rotulo="Renta anual devengada"
          valor={num(pos.rentaTotal)}
          unidad="RD$"
          meta={pos.total.gt(0) ? `${pct(pos.rentaTotal.div(pos.total), 2)} del total` : "sin instrumentos"}
          tono="neutra"
          ayuda="Lo que tus instrumentos prometen pagar al año según su tasa; no es lo que ganaste."
        />
        <Kpi rotulo="Líquidos" valor={num(pos.liquidos)} unidad="RD$" meta="efectivo + cuentas de ahorro" tono="neutra" />
        <Kpi rotulo="Cuánto dependes del dólar" valor={pct(ext, 1)} meta={`RD$ ${num(pos.extranjero)} en US$ y €`} tono="neutra" que={EXPLICA.dolar} />
      </Mosaicos>
      <div className="cap-ancho cap-pie-mosaicos">
        <SelloFx fx={ctx.mercado.fx.USD} moneda="USD" ahora={ahora} hoy={ctx.hoy} />
      </div>
      {pos.sinValorar.length ? (
        <p className="cap-aviso error cap-ancho" role="alert">
          <Icono nombre="error" />
          <span>
            {pos.sinValorar.length} instrumento(s) sin tipo de cambio quedan fuera del total: {pos.sinValorar.map((a) => a.nombre).join(", ")}. Cárgalo en
            Ajustes, abajo.
          </span>
        </p>
      ) : null}
    </>
  );
}

/** Formulario simple: nombre, clase, moneda, monto (o cantidad × precio) y fecha. Funciona sin JavaScript. */
function AgregarInstrumento({ datos, mes }: Props) {
  const vacio = datos.ctx.activos.length === 0;
  return (
    <details className="cap-agregar cap-ancho" open={vacio}>
      <summary>
        <span className="boton">
          <Icono nombre="mas" />
          Agregar instrumento
        </span>
        <span className="tenue chico">Nombre, clase, moneda y monto. Lo demás es opcional.</span>
      </summary>
      <div className="cuerpo">
        <form action={agregarInstrumento} className="cap-form cap-form-instrumento">
          <input type="hidden" name="mes" value={mes} />
          <div className="cap-campos">
            <label className="cap-campo">
              Nombre
              <input name="nombre" required maxLength={200} placeholder="Ej.: Certificado a 1 año" autoComplete="off" />
            </label>
            <label className="cap-campo">
              Clase
              <select name="clase" defaultValue="ahorros" required>
                {CLASES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="cap-campo">
              Moneda
              <select name="moneda" defaultValue="DOP">
                {MONEDAS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="cap-campo">
              Fecha de compra <span className="ayuda">opcional: la anota en el libro</span>
              <input type="date" name="fecha" />
            </label>
          </div>
          <fieldset className="cap-opciones">
            <legend>Cómo escribes el valor</legend>
            <label>
              <input type="radio" name="modo" value="monto" defaultChecked /> Monto
            </label>
            <label>
              <input type="radio" name="modo" value="unidades" /> Cantidad × precio
            </label>
          </fieldset>
          <div className="cap-campos">
            <label className="cap-campo solo-monto">
              Monto
              <input name="monto" inputMode="decimal" placeholder="Ej.: 25,000" autoComplete="off" />
            </label>
            <label className="cap-campo solo-unidades">
              Cantidad
              <input name="cantidad" inputMode="decimal" placeholder="Ej.: 10" autoComplete="off" />
            </label>
            <label className="cap-campo solo-unidades">
              Precio unitario
              <input name="precio" inputMode="decimal" placeholder="Ej.: 101.25" autoComplete="off" />
            </label>
          </div>
          <details className="cap-mas">
            <summary>Más detalles (opcional)</summary>
            <div className="cap-campos">
              <label className="cap-campo">
                Institución o emisor
                <input name="inst" maxLength={200} placeholder="Ej.: Banco, puesto de bolsa" />
              </label>
              <label className="cap-campo">
                Tasa o dividendo anual %
                <input name="tasa" inputMode="decimal" placeholder="Ej.: 8.5" />
              </label>
              <label className="cap-campo solo-rv">
                Símbolo <span className="ayuda">para el precio de mercado</span>
                <input name="simbolo" maxLength={15} autoCapitalize="characters" placeholder="Ej.: VOO" />
              </label>
              <label className="cap-campo solo-rf">
                Vencimiento
                <input type="date" name="venc" />
              </label>
              <label className="cap-campo solo-rf">
                Estructura
                <select name="tipoRF" defaultValue="acumula">
                  <option value="acumula">Acumula a vencimiento</option>
                  <option value="cupon">Paga cupón periódico</option>
                </select>
              </label>
            </div>
          </details>
          <div className="cap-botones">
            <button className="boton" type="submit">
              Agregar instrumento
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

function CamposActivo({ a }: { a: Activo }) {
  const pref = `ed-${a.id}`;
  return (
    <div className="cap-campos">
      <label className="cap-campo">
        Nombre
        <input name="nombre" defaultValue={a.nombre} required maxLength={200} id={`${pref}-nombre`} />
      </label>
      <label className="cap-campo">
        Clase
        <select name="clase" defaultValue={a.clase}>
          {CLASES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="cap-campo">
        Institución o emisor
        <input name="inst" defaultValue={a.inst} maxLength={200} />
      </label>
      {a.clase === "rentavariable" ? (
        <label className="cap-campo">
          Símbolo
          <input name="simbolo" defaultValue={a.simbolo ?? ""} maxLength={15} autoCapitalize="characters" />
        </label>
      ) : null}
      <label className="cap-campo">
        Moneda
        <select name="moneda" defaultValue={a.moneda}>
          {MONEDAS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="cap-campo">
        Cantidad (monto o unidades)
        <input type="hidden" name="cantidadMostrada" value={a.cantidad} />
        <input name="cantidad" defaultValue={a.cantidad} inputMode="decimal" required />
      </label>
      <label className="cap-campo">
        Precio unitario <span className="ayuda">1 para saldos</span>
        <input name="precio" defaultValue={a.precio} inputMode="decimal" />
      </label>
      <label className="cap-campo">
        Tasa o dividendo anual %
        <input name="tasa" defaultValue={aPct(a.tasa)} inputMode="decimal" />
      </label>
      {a.clase === "rentafija" ? (
        <>
          <label className="cap-campo">
            Vencimiento
            <input type="date" name="venc" defaultValue={a.venc ?? ""} />
          </label>
          <label className="cap-campo">
            Estructura
            <select name="tipoRF" defaultValue={a.tipoRF ?? "acumula"}>
              <option value="acumula">Acumula a vencimiento</option>
              <option value="cupon">Paga cupón periódico</option>
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}

function FilaInstrumento({ datos, mes, a }: Props & { a: Activo }) {
  const { ctx } = datos;
  const d = duracionModificada(a, ctx.hoy);
  const v = valorDOP(ctx, a);
  const p = precioDe(ctx, a);
  const detalle = [
    a.simbolo,
    a.inst,
    n(a.tasa).gt(0) ? pct(a.tasa, 2) : null,
    a.venc ? `vence ${fechaCorta(a.venc)}` : null,
    d ? `dur. ${num(d.toFixed(6), 2)}` : null,
    p.origen === "mercado" ? "precio de mercado" : null,
  ].filter(Boolean);
  return (
    <li>
      <details className="cap-instrumento" key={JSON.stringify(a)}>
        <summary>
          <span className="nombre">
            {a.nombre}
            {detalle.length ? <span className="detalle">{detalle.join(" · ")}</span> : null}
          </span>
          <span className="monto">
            {v === null ? <span className="cap-estado error">sin tipo de cambio</span> : num(v)}
            {a.moneda !== "DOP" ? (
              <span className="detalle">
                {a.moneda} {num(valorMoneda(ctx, a), 2)}
              </span>
            ) : null}
          </span>
        </summary>
        <div className="cuerpo">
          <form action={guardarActivo} className="cap-form">
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="mes" value={mes} />
            <CamposActivo a={a} />
            <div className="cap-botones">
              <button className="boton chico" type="submit">
                Guardar cambios
              </button>
            </div>
          </form>
          <form action={eliminarActivo} className="cap-botones" style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="mes" value={mes} />
            <button className="boton chico peligro" type="submit">
              <Icono nombre="basura" />
              Eliminar {a.nombre}
            </button>
          </form>
        </div>
      </details>
    </li>
  );
}

function Instrumentos({ datos, mes }: Props) {
  const { ctx } = datos;
  const pos = posicion(ctx);
  return (
    <section className="cap-ancho" aria-labelledby="cap-t-instrumentos">
      <h2 className="sr-solo" id="cap-t-instrumentos">
        Instrumentos por clase
      </h2>
      <div className="cap-rejilla-clases">
        {CLASES.map((c) => {
          const items = ctx.activos.filter((a) => a.clase === c.id);
          const sub = pos.porClase[c.id as Clase];
          return (
            <section key={c.id} className="panel" aria-labelledby={`cap-t-clase-${c.id}`}>
              <div className="panel-cabecera">
                <div className="cap-clase-cabeza" style={{ width: "100%" }} title={c.desc}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="panel-titulo" id={`cap-t-clase-${c.id}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={`cap-muestra ${c.id}`} aria-hidden="true" />
                      {c.nom}
                    </h3>
                    <span className="tenue chico">
                      {items.length} {items.length === 1 ? "instrumento" : "instrumentos"}
                      <span className="sr-solo"> · {c.desc}</span>
                    </span>
                  </div>
                  <span className="total">
                    {num(sub)}
                    <small>{pos.total.gt(0) ? `${pct(sub.div(pos.total), 1)} del total` : "—"}</small>
                  </span>
                </div>
              </div>
              {items.length ? (
                <ul className="cap-instrumentos">
                  {items.map((a) => (
                    <FilaInstrumento key={a.id} datos={datos} mes={mes} a={a} />
                  ))}
                </ul>
              ) : (
                <div className="panel-cuerpo">
                  <p className="tenue chico" style={{ margin: 0 }}>
                    Sin instrumentos en {c.nom}. Usa «Agregar instrumento», arriba.
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function PanelPrecios({ datos }: { datos: DatosCapital }) {
  const { ctx, ahora, tareaPrecios } = datos;
  const conSimbolo = ctx.activos.filter((a) => normalizarSimbolo(a.simbolo));
  if (!conSimbolo.length) return null;
  return (
    <Panel titulo="Precios de mercado" id="cap-t-precios" extra={tareaPrecios?.estado === "error" ? <span className="cap-estado error">la última lectura falló</span> : null}>
      <div className="desplazable">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Símbolo</th>
              <th scope="col" className="num">
                Precio US$
              </th>
              <th scope="col">Fuente</th>
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
      <Mas titulo="Cuándo se actualizan">
        <p className="cap-nota">
          Finnhub se lee de lunes a viernes a las 5:30 PM (hora RD), después del cierre de Nueva York. Sin cotización se usa el precio manual del
          instrumento.
          {tareaPrecios?.estado === "error" && tareaPrecios.error ? ` Último error: ${tareaPrecios.error}` : ""}
        </p>
      </Mas>
    </Panel>
  );
}

function PanelRetorno({ datos }: { datos: DatosCapital }) {
  const { ctx } = datos;
  const tw = twr(ctx);
  const ti = tirGlobal(ctx);
  const infl = n(ctx.p.inflacion);
  return (
    <Panel titulo="Retorno realizado" id="cap-t-retorno" extra={<span className="tenue chico">{tw ? `${tw.meses} meses cerrados` : "sin serie"}</span>}>
      {tw || ti ? (
        <>
          <div className="cap-dos">
            <Dato rotulo="TWR anualizado">{tw ? pct(tw.anualizado, 2) : "—"}</Dato>
            <Dato rotulo="TIR (tu experiencia)">{ti ? pct(ti.tir, 2) : "—"}</Dato>
            <Dato rotulo="Retorno acumulado">{tw ? pct(tw.total, 2) : "—"}</Dato>
            <Dato rotulo="Retorno real">{tw ? pctSg(desdeFlotante(tw.anualizado).minus(infl), 2) : "—"}</Dato>
          </div>
          <p className="cap-nota">
            {tw && ti
              ? Math.abs(ti.tir - tw.anualizado) > 0.01
                ? ti.tir > tw.anualizado
                  ? "Tu TIR va por encima del TWR: el momento de tus aportes te favoreció."
                  : "Tu TIR va por debajo del TWR: aportaste más justo antes de los períodos flojos."
                : "TWR y TIR van parejos: el momento de tus aportes no cambió el resultado."
              : ""}
            {tw && infl.gt(0) ? ` Inflación de referencia: ${pct(infl, 1)}.` : ""}
          </p>
          <Mas titulo="TWR y TIR, en corto">
            <p className="cap-nota">
              El <strong>TWR</strong> juzga la selección: aísla el efecto de cuándo aportaste. La <strong>TIR</strong> juzga tu experiencia real, porque
              pondera el momento de cada aporte. Son tasas aproximadas por método (Dietz modificado y bisección), redondeadas.
            </p>
          </Mas>
        </>
      ) : (
        <SinDatos accion={{ href: "/capital/cierre", texto: "Ir al cierre del mes" }}>
          Necesitas dos meses cerrados (con foto) para medir retorno. Se mide solo sobre meses cerrados: una foto a mitad de mes distorsiona la cifra.
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
    <Panel titulo="P&L por posición" id="cap-t-pl" ancho extra={<span className="tenue chico">desde tus transacciones · moneda de cada instrumento</span>}>
      <div className="cap-dos" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 12 }}>
        <Dato rotulo="No realizado" signo={suma("noRealizado")}>
          <ConSigno v={suma("noRealizado")} d={2} />
        </Dato>
        <Dato rotulo="Realizado" signo={suma("realizado")}>
          <ConSigno v={suma("realizado")} d={2} />
        </Dato>
        <Dato rotulo="Cobrado">{num(suma("cobrado"), 2)}</Dato>
      </div>
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
    </Panel>
  );
}

function Transacciones({ datos, mes }: Props) {
  const { ctx } = datos;
  const ord = [...ctx.tx].sort((a, b) => ((b.fecha ?? "") < (a.fecha ?? "") ? -1 : (b.fecha ?? "") > (a.fecha ?? "") ? 1 : 0));
  const visibles = ord.slice(0, 40);
  return (
    <Panel titulo="Libro de transacciones" id="cap-t-tx" ancho extra={<span className="tenue chico">{ctx.tx.length} registradas</span>}>
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
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>
                      {t.fecha ? fechaCorta(t.fecha) : "sin fecha"}
                    </td>
                    <th scope="row" style={{ whiteSpace: "normal" }}>
                      {nombreTipoTx(t.tipo)} · {a ? a.simbolo || a.nombre : <span className="tenue">instrumento eliminado</span>}
                    </th>
                    <td className="num">
                      {num(t.cantidad, 4).replace(/\.?0+$/, "")} × {num(t.precio, 2)}
                      {n(t.comision).gt(0) ? ` + com. ${num(t.comision, 2)}` : ""}
                    </td>
                    <td className="num">
                      {num(n(t.cantidad).times(n(t.precio)), 2)} <span className="tenue">{t.moneda ?? ""}</span>
                    </td>
                    <td>
                      <form action={eliminarTransaccion}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="mes" value={mes} />
                        <button type="submit" className="boton-icono" aria-label={`Eliminar la transacción del ${t.fecha ?? "sin fecha"}`} title="Eliminar">
                          <Icono nombre="basura" />
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
        <SinDatos>Todavía no hay transacciones. Con las compras (fecha y precio) se desbloquean base de costo, P&L realizado y TIR por posición.</SinDatos>
      )}
      {ord.length > 40 ? <p className="cap-nota">Mostrando las 40 más recientes de {ord.length}.</p> : null}
      {ctx.activos.length ? (
        <details className="cap-grupo" style={{ marginTop: 14 }}>
          <summary>
            <Icono nombre="mas" />
            Registrar transacción
          </summary>
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
                <button className="boton chico" type="submit">
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

export function VistaCartera({ datos, mes }: Props) {
  return (
    <>
      <AgregarInstrumento datos={datos} mes={mes} />
      {datos.ctx.activos.length ? <MosaicosCartera datos={datos} /> : null}
      <Instrumentos datos={datos} mes={mes} />
      <PanelAsignacion datos={datos} id="cap-t-asignacion-cartera" />
      <PanelRetorno datos={datos} />
      <PanelPrecios datos={datos} />
      <PanelPL datos={datos} />
      <Transacciones datos={datos} mes={mes} />
      <p className="cap-nota cap-ancho">
        Tus cuentas de banco, tarjetas y deudas se anotan en <Link href={`/capital/cuentas?mes=${mes}`}>Mis cuentas</Link>; el tipo de cambio manual y tus datos, en{" "}
        <Link href={`/capital/ajustes?mes=${mes}`}>Ajustes</Link>.
      </p>
    </>
  );
}
