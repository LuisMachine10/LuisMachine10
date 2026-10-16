// Vista Cierre: lo que realmente pasó en el mes, partida por partida, contra el presupuesto.
// Formularios HTML con server actions: funcionan sin JavaScript en el navegador.

import Big from "big.js";
import { desagregarCierre, guardarCierre, guardarParametros } from "@/app/capital/acciones";
import { fotoViva, indicadores, pasivosDe, usoTarjetas } from "@/lib/capital/cierres";
import { n } from "@/lib/capital/decimal";
import { mesLargo } from "@/lib/capital/fechas";
import { num, pct, rd, sg } from "@/lib/capital/formato";
import { type Cierre, LISTAS_PRESUPUESTO, type ListaPresupuesto, type Parametros } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { Dato, Panel, SinDatos } from "./Piezas";

const TITULOS: Record<ListaPresupuesto, string> = {
  ingresos: "Ingresos",
  fijos: "Gastos fijos",
  variables: "Gastos variables",
  aportes: "Aportes e inversiones",
};
const A_FAVOR: Record<ListaPresupuesto, boolean> = { ingresos: true, fijos: false, variables: false, aportes: true };

function Grupo({ p, c, grupo }: { p: Parametros; c: Cierre | null; grupo: ListaPresupuesto }) {
  const montos = c?.[grupo] ?? {};
  const lista = p[grupo];
  const total = lista.reduce((s, i) => s.plus(n(montos[i.id])), new Big(0));
  const pres = lista.reduce((s, i) => s.plus(n(i.pres)), new Big(0));
  return (
    <details className="cap-grupo" open={grupo === "ingresos"}>
      <summary>
        {TITULOS[grupo]}
        <span className="total">{num(total)}</span>
      </summary>
      <div className="cuerpo">
        {lista.length === 0 ? (
          <p className="cap-nota">Sin partidas. Agrégalas en «Presupuesto» abajo.</p>
        ) : (
          lista.map((i) => {
            const v = montos[i.id];
            const dv = n(v).minus(n(i.pres));
            const bien = A_FAVOR[grupo] ? dv.gte(0) : dv.lte(0);
            return (
              <div className="cap-partida" key={i.id}>
                <label htmlFor={`c-${grupo}-${i.id}`}>
                  {i.nombre}
                  <i>ppto {num(i.pres)}</i>
                </label>
                <span className={`desvio ${v ? (bien ? "sube" : "baja") : ""}`} aria-label="desvío contra el presupuesto">
                  {v ? sg(dv) : ""}
                </span>
                <input id={`c-${grupo}-${i.id}`} name={`${grupo}.${i.id}`} inputMode="decimal" defaultValue={v ?? ""} placeholder="0" autoComplete="off" />
              </div>
            );
          })
        )}
        {lista.length ? (
          <div className="cap-botones" style={{ marginTop: 8 }}>
            <button className="cap-boton" type="submit" name="modo" value={`presupuesto:${grupo}`}>
              Usar presupuesto ({num(pres)})
            </button>
            <button className="cap-boton" type="submit" name="modo" value={`limpiar:${grupo}`}>
              Limpiar
            </button>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function FormularioCierre({ datos, mes }: { datos: DatosCapital; mes: string }) {
  const { ctx } = datos;
  const c = ctx.cierres[mes] ?? null;
  const tc = usoTarjetas(ctx.p, c);
  const d = c?.deudas;
  return (
    // La llave cambia con el mes y con lo guardado: así los campos no conservan valores de otro mes.
    <form action={guardarCierre} className="cap-form cap-ancho" key={`${mes}|${JSON.stringify(c)}|${JSON.stringify(ctx.p.tarjetas)}`}>
      <input type="hidden" name="mes" value={mes} />
      {LISTAS_PRESUPUESTO.map((g) => (
        <Grupo key={g} p={ctx.p} c={c} grupo={g} />
      ))}
      <details className="cap-grupo">
        <summary>
          Tarjetas de crédito <span className="total">{num(tc.uso)}</span>
        </summary>
        <div className="cuerpo">
          {ctx.p.tarjetas.length === 0 ? <p className="cap-nota">Sin tarjetas. Se agregan en Cartera → Ajustes.</p> : null}
          {ctx.p.tarjetas.map((t) => {
            const u = c?.tarjetas?.[t.id];
            const lim = n(t.limite);
            return (
              <div key={t.id}>
                <div className="cap-partida">
                  <label htmlFor={`c-tc-${t.id}`}>
                    {t.nombre}
                    <i>
                      límite {num(lim)}
                      {lim.gt(0) ? ` · ${pct(n(u?.uso).div(lim), 0)}` : " · sin límite cargado"}
                    </i>
                  </label>
                  <span />
                  <input id={`c-tc-${t.id}`} name={`tarjetas.${t.id}.uso`} inputMode="decimal" defaultValue={u?.uso ?? ""} placeholder="0" />
                </div>
                <label className="cap-campo casilla">
                  <input type="checkbox" name={`tarjetas.${t.id}.full`} defaultChecked={u ? u.full !== false : true} /> Pagada en full
                </label>
              </div>
            );
          })}
        </div>
      </details>
      <details className="cap-grupo">
        <summary>
          Pasivos al cierre <span className="total">{num(pasivosDe(c))}</span>
        </summary>
        <div className="cuerpo">
          {(
            [
              ["tc", "Saldo en tarjetas"],
              ["prestamos", "Préstamos / hipoteca"],
              ["otras", "Otras deudas"],
            ] as const
          ).map(([k, l]) => (
            <div className="cap-partida" key={k}>
              <label htmlFor={`c-deuda-${k}`}>{l}</label>
              <span />
              <input id={`c-deuda-${k}`} name={`deudas.${k}`} inputMode="decimal" defaultValue={d?.[k] ?? ""} placeholder="0" />
            </div>
          ))}
        </div>
      </details>
      <label className="cap-campo">
        Nota del mes
        <textarea name="nota" defaultValue={c?.nota ?? ""} rows={2} maxLength={2000} />
      </label>
      <div className="cap-botones">
        <button className="cap-boton" type="submit" name="modo" value="guardar">
          Guardar
        </button>
        <button className="cap-boton primario" type="submit" name="modo" value="cerrar">
          {c?.cerrado ? "Actualizar cierre" : "Cerrar el mes"}
        </button>
      </div>
      <p className="cap-nota">
        Al cerrar se guarda lo escrito y se congela la foto del patrimonio de hoy ({rd(fotoViva(ctx, mes).patrimonio)}, menos los pasivos que
        escribas) junto con el tipo de cambio vigente. Actualiza Cartera antes de cerrar.
      </p>
    </form>
  );
}

function Resultado({ datos, mes }: { datos: DatosCapital; mes: string }) {
  const ind = indicadores(datos.ctx, mes);
  return (
    <Panel titulo="Resultado del mes" id="cap-t-resultado">
      <div className="cap-dos">
        <Dato rotulo="Gasto operativo">{num(ind.gOp)}</Dato>
        <Dato rotulo="Flujo neto" signo={ind.flujo}>
          {sg(ind.flujo)}
        </Dato>
        <Dato rotulo="Aportado">{num(ind.ap)}</Dato>
        <Dato rotulo="Queda en efectivo" signo={ind.efectivoResidual}>
          {sg(ind.efectivoResidual)}
        </Dato>
      </div>
      <p className="cap-nota">
        {ind.ing.gt(0) ? (
          <>
            De cada RD$ 100 que entraron: <strong>{num(ind.gOp.div(ind.ing).times(100))}</strong> se fueron en gasto operativo y quedaron{" "}
            <strong>{num(ind.flujo.div(ind.ing).times(100))}</strong> de margen.{" "}
            {ind.efectivoResidual.lt(0)
              ? `Aportaste ${rd(ind.efectivoResidual.neg())} más de lo que generó el mes: salió de ahorros o de la tarjeta.`
              : `Después de aportar ${rd(ind.ap)} quedaron ${rd(ind.efectivoResidual)} en efectivo.`}
          </>
        ) : (
          "Registra los ingresos para ver la tasa de ahorro del mes."
        )}
      </p>
    </Panel>
  );
}

function Agregado({ c, mes }: { c: Cierre; mes: string }) {
  return (
    <Panel titulo="Mes histórico (agregado)" id="cap-t-agregado" ancho>
      <p className="cap-nota" style={{ marginTop: 0 }}>
        Cargado solo con totales, sin desglose por partida.
      </p>
      <div className="cap-dos" style={{ marginTop: 8 }}>
        <Dato rotulo="Ingresos">{c.totIngresos ? num(c.totIngresos) : "—"}</Dato>
        <Dato rotulo="Gasto fijo">{c.totFijos ? num(c.totFijos) : "—"}</Dato>
        <Dato rotulo="Gasto variable">{c.totVariables ? num(c.totVariables) : "—"}</Dato>
        <Dato rotulo="Aportes">{c.totAportes ? num(c.totAportes) : "—"}</Dato>
      </div>
      {c.nota ? <p className="cap-nota">{c.nota}</p> : null}
      <form action={desagregarCierre} className="cap-botones" style={{ marginTop: 10 }}>
        <input type="hidden" name="mes" value={mes} />
        <button className="cap-boton" type="submit">
          Convertir a desglose editable (prorrateo por presupuesto)
        </button>
      </form>
    </Panel>
  );
}

export function FormularioPresupuesto({ p, mes }: { p: Parametros; mes: string }) {
  return (
    <details className="cap-grupo cap-ancho">
      <summary>Presupuesto (partidas del cierre)</summary>
      <div className="cuerpo">
        <form action={guardarParametros} className="cap-form" key={JSON.stringify(LISTAS_PRESUPUESTO.map((l) => p[l]))}>
          <input type="hidden" name="seccion" value="presupuesto" />
          <input type="hidden" name="volver" value="/capital/cierre" />
          <input type="hidden" name="mes" value={mes} />
          {LISTAS_PRESUPUESTO.map((l) => {
            const filas = [...p[l], { id: "", nombre: "", pres: "" }, { id: "", nombre: "", pres: "" }];
            return (
              <fieldset key={l} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <legend className="cap-rotulo">{TITULOS[l]}</legend>
                <div className="desplazable">
                  <table className="tabla cap-tabla-form">
                    <thead>
                      <tr>
                        <th scope="col">Partida</th>
                        <th scope="col" className="num">
                          Presupuesto
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f, i) => (
                        <tr key={`${l}-${i}`}>
                          <td>
                            <input type="hidden" name={`${l}.${i}.id`} value={f.id} />
                            <input name={`${l}.${i}.nombre`} defaultValue={f.nombre} aria-label={`${TITULOS[l]}: nombre de la partida ${i + 1}`} placeholder={f.id ? "" : "nueva partida"} maxLength={200} />
                          </td>
                          <td>
                            <input name={`${l}.${i}.pres`} defaultValue={f.pres} inputMode="decimal" aria-label={`${TITULOS[l]}: presupuesto de la partida ${i + 1}`} style={{ textAlign: "right" }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </fieldset>
            );
          })}
          <p className="cap-nota">Deja el nombre vacío para quitar una partida. Los montos ya registrados de una partida quitada dejan de contar.</p>
          <div className="cap-botones">
            <button className="cap-boton primario" type="submit">
              Guardar presupuesto
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

export function VistaCierre({ datos, mes }: { datos: DatosCapital; mes: string }) {
  const c = datos.ctx.cierres[mes] ?? null;
  return (
    <>
      <Panel
        titulo={`Cierre de ${mesLargo(mes)}`}
        id="cap-t-cierre"
        ancho
        extra={<span className={`etiqueta ${c?.cerrado ? "ok" : "alerta"}`}>{c?.cerrado ? "✓ cerrado" : "! abierto"}</span>}
      >
        <p className="cap-nota" style={{ marginTop: 0 }}>
          Registra lo que <strong>realmente</strong> pasó. La cifra junto a cada partida es la desviación contra tu presupuesto.
        </p>
      </Panel>
      {c?.agregado ? (
        <Agregado c={c} mes={mes} />
      ) : datos.ctx.p.ingresos.length + datos.ctx.p.fijos.length + datos.ctx.p.variables.length + datos.ctx.p.aportes.length === 0 ? (
        <section className="panel cap-ancho">
          <SinDatos>Todavía no hay partidas de presupuesto. Créalas abajo o importa tu archivo.</SinDatos>
        </section>
      ) : (
        <FormularioCierre datos={datos} mes={mes} />
      )}
      <Resultado datos={datos} mes={mes} />
      <FormularioPresupuesto p={datos.ctx.p} mes={mes} />
    </>
  );
}
