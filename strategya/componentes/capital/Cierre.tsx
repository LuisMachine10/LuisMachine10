// Vista Cierre: el mes paso a paso (ingresos → gastos fijos → variables → aportes → tarjetas y deudas →
// cerrar), contra el presupuesto. Un solo formulario HTML con server actions: los pasos son bloques
// plegables (todos los campos viajan juntos), así funciona sin JavaScript y no se pierde nada.

import Big from "big.js";
import { desagregarCierre, guardarCierre, guardarParametros } from "@/app/capital/acciones";
import { fotoViva, indicadores, pasivosDe, usoTarjetas } from "@/lib/capital/cierres";
import { n } from "@/lib/capital/decimal";
import { mesLargo } from "@/lib/capital/fechas";
import { num, pct, rd, sg } from "@/lib/capital/formato";
import { type Cierre, LISTAS_PRESUPUESTO, type ListaPresupuesto, type Parametros } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { Icono } from "./Iconos";
import { Dato, Estado, Kpi, Mas, Mosaicos, Panel, SinDatos } from "./Piezas";
import { SelloRegistros } from "./Sellos";

const TITULOS: Record<ListaPresupuesto, string> = {
  ingresos: "Ingresos",
  fijos: "Gastos fijos",
  variables: "Gastos variables",
  aportes: "Aportes e inversiones",
};
const PISTAS: Record<ListaPresupuesto, string> = {
  ingresos: "Lo que entró este mes",
  fijos: "Lo que pagas todos los meses",
  variables: "Comida, salidas y demás",
  aportes: "Lo que pusiste a invertir o ahorrar",
};
const A_FAVOR: Record<ListaPresupuesto, boolean> = { ingresos: true, fijos: false, variables: false, aportes: true };

function llenas(p: Parametros, c: Cierre | null, grupo: ListaPresupuesto): number {
  return p[grupo].filter((i) => c?.[grupo]?.[i.id] != null && c[grupo][i.id] !== "").length;
}

function NumeroPaso({ i, hecho }: { i: number; hecho: boolean }) {
  return (
    <span className="cap-paso-num" aria-hidden="true">
      {hecho ? "✓" : i}
    </span>
  );
}

function Paso({ p, c, grupo, i, abierto }: { p: Parametros; c: Cierre | null; grupo: ListaPresupuesto; i: number; abierto: boolean }) {
  const montos = c?.[grupo] ?? {};
  const lista = p[grupo];
  const total = lista.reduce((s, x) => s.plus(n(montos[x.id])), new Big(0));
  const pres = lista.reduce((s, x) => s.plus(n(x.pres)), new Big(0));
  const k = llenas(p, c, grupo);
  const hecho = lista.length > 0 && k === lista.length;
  return (
    <li>
      <details className={`cap-grupo cap-paso${hecho ? " hecho" : ""}`} open={abierto}>
        <summary>
          <NumeroPaso i={i} hecho={hecho} />
          <span className="cap-paso-texto">
            <span>
              Paso {i} · {TITULOS[grupo]}
              <span className="sr-solo">{hecho ? " (completo)" : ""}</span>
            </span>
            <small>
              {lista.length ? `${k} de ${lista.length} partidas · presupuesto ${num(pres)}` : PISTAS[grupo]}
            </small>
          </span>
          <span className="total">{num(total)}</span>
        </summary>
        <div className="cuerpo">
          {lista.length === 0 ? (
            <p className="tenue chico" style={{ margin: 0 }}>
              Sin partidas. Agrégalas en «Presupuesto», abajo.
            </p>
          ) : (
            lista.map((x) => {
              const v = montos[x.id];
              const dv = n(v).minus(n(x.pres));
              const bien = A_FAVOR[grupo] ? dv.gte(0) : dv.lte(0);
              return (
                <div className="cap-partida" key={x.id}>
                  <label htmlFor={`c-${grupo}-${x.id}`}>
                    {x.nombre}
                    <i>ppto {num(x.pres)}</i>
                  </label>
                  <span className={`desvio ${v ? (bien ? "sube" : "baja") : ""}`} title="Desvío contra el presupuesto">
                    {v ? sg(dv) : ""}
                  </span>
                  <input id={`c-${grupo}-${x.id}`} name={`${grupo}.${x.id}`} inputMode="decimal" defaultValue={v ?? ""} placeholder="0" autoComplete="off" />
                </div>
              );
            })
          )}
          {lista.length ? (
            <div className="cap-botones" style={{ marginTop: 12 }}>
              <button className="boton secundario chico" type="submit" name="modo" value={`presupuesto:${grupo}`}>
                Copiar el presupuesto ({num(pres)})
              </button>
              <button className="boton secundario chico" type="submit" name="modo" value={`limpiar:${grupo}`}>
                Limpiar
              </button>
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function FormularioCierre({ datos, mes }: { datos: DatosCapital; mes: string }) {
  const { ctx } = datos;
  const c = ctx.cierres[mes] ?? null;
  const tc = usoTarjetas(ctx.p, c);
  const d = c?.deudas;
  const grupos = LISTAS_PRESUPUESTO;
  // Se abre el primer paso sin completar (si el mes no está cerrado).
  const primeroPendiente = c?.cerrado ? -1 : grupos.findIndex((g) => ctx.p[g].length && llenas(ctx.p, c, g) < ctx.p[g].length);
  const tarjetasHechas = !!c && (ctx.p.tarjetas.length ? ctx.p.tarjetas.every((t) => c.tarjetas?.[t.id]?.uso != null) : true) && (d?.tc != null || d?.prestamos != null || d?.otras != null);
  const pasoTarjetas = grupos.length + 1;
  const pasoCerrar = grupos.length + 2;
  return (
    // La llave cambia con el mes y con lo guardado: así los campos no conservan valores de otro mes.
    <form action={guardarCierre} className="cap-form cap-ancho" key={`${mes}|${JSON.stringify(c)}|${JSON.stringify(ctx.p.tarjetas)}`}>
      <input type="hidden" name="mes" value={mes} />
      {/* Botón por defecto: Enter en cualquier campo guarda (no copia el presupuesto del primer paso). */}
      <button type="submit" name="modo" value="guardar" className="sr-solo" tabIndex={-1} aria-hidden="true">
        Guardar
      </button>
      <ol className="cap-pasos">
        {grupos.map((g, i) => (
          <Paso key={g} p={ctx.p} c={c} grupo={g} i={i + 1} abierto={i === primeroPendiente} />
        ))}
        <li>
          <details className={`cap-grupo cap-paso${tarjetasHechas ? " hecho" : ""}`} open={primeroPendiente === -1 && !c?.cerrado}>
            <summary>
              <NumeroPaso i={pasoTarjetas} hecho={tarjetasHechas} />
              <span className="cap-paso-texto">
                <span>Paso {pasoTarjetas} · Tarjetas y deudas</span>
                <small>Uso de cada tarjeta y lo que debes al cierre</small>
              </span>
              <span className="total">{num(tc.uso.plus(pasivosDe(c)))}</span>
            </summary>
            <div className="cuerpo">
              <h3 className="cap-rotulo">Tarjetas de crédito · uso {num(tc.uso)}</h3>
              {ctx.p.tarjetas.length === 0 ? (
                <p className="tenue chico" style={{ margin: "6px 0 0" }}>
                  Sin tarjetas. Se agregan en Cartera → Ajustes.
                </p>
              ) : null}
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
                          {lim.gt(0) ? ` · ${pct(n(u?.uso).div(lim), 0)} usado` : " · sin límite cargado"}
                        </i>
                      </label>
                      <span />
                      <input id={`c-tc-${t.id}`} name={`tarjetas.${t.id}.uso`} inputMode="decimal" defaultValue={u?.uso ?? ""} placeholder="0" />
                    </div>
                    <label className="cap-campo casilla" style={{ marginBottom: 6 }}>
                      <input type="checkbox" name={`tarjetas.${t.id}.full`} defaultChecked={u ? u.full !== false : true} /> Pagada en full
                    </label>
                  </div>
                );
              })}
              <h3 className="cap-rotulo" style={{ marginTop: 14 }}>
                Pasivos al cierre · {num(pasivosDe(c))}
              </h3>
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
        </li>
        <li>
          <section className={`panel cap-paso${c?.cerrado ? " hecho" : ""}`} aria-labelledby="cap-t-paso-cerrar">
            <div className="panel-cuerpo cap-form">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <NumeroPaso i={pasoCerrar} hecho={!!c?.cerrado} />
                <span className="cap-paso-texto">
                  <span id="cap-t-paso-cerrar" style={{ fontWeight: 600 }}>
                    Paso {pasoCerrar} · {c?.cerrado ? "Mes cerrado" : "Revisar y cerrar"}
                  </span>
                  <small>Congela la foto del patrimonio de hoy con el tipo de cambio vigente</small>
                </span>
              </div>
              <label className="cap-campo">
                Nota del mes <span className="ayuda">opcional</span>
                <textarea name="nota" defaultValue={c?.nota ?? ""} rows={2} maxLength={2000} placeholder="Ej.: cobré el bono; cambié de seguro" />
              </label>
              <div className="cap-botones">
                <button className="boton" type="submit" name="modo" value="cerrar">
                  {c?.cerrado ? "Actualizar el cierre" : `Cerrar ${mesLargo(mes)}`}
                </button>
                <button className="boton secundario" type="submit" name="modo" value="guardar">
                  Guardar sin cerrar
                </button>
              </div>
              <p className="tenue chico" style={{ margin: 0 }}>
                Al cerrar se guarda lo escrito y se congela el patrimonio de hoy ({rd(fotoViva(ctx, mes).patrimonio)}, menos los pasivos que escribas).
                Actualiza Cartera antes de cerrar.
              </p>
            </div>
          </section>
        </li>
      </ol>
    </form>
  );
}

function Progreso({ datos, mes }: { datos: DatosCapital; mes: string }) {
  const { ctx } = datos;
  const c = ctx.cierres[mes] ?? null;
  const ind = indicadores(ctx, mes);
  const grupos = LISTAS_PRESUPUESTO.filter((g) => ctx.p[g].length);
  const hechos = grupos.filter((g) => llenas(ctx.p, c, g) === ctx.p[g].length).length + (c?.cerrado ? 1 : 0);
  const total = grupos.length + 1;
  const avance = total ? Math.round((hechos / total) * 100) : 0;
  return (
    <Panel
      titulo={`Cierre de ${mesLargo(mes)}`}
      id="cap-t-cierre"
      ancho
      extra={<Estado tono={c?.cerrado ? "ok" : "alerta"}>{c?.cerrado ? "✓ cerrado" : "abierto"}</Estado>}
    >
      <div className="cap-progreso">
        <div className="pista" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechos} aria-label="Pasos completos del cierre">
          <span style={{ width: `${avance}%` }} />
        </div>
        <span className="tenue chico">
          {hechos} de {total} pasos completos · registra lo que <strong>realmente</strong> pasó; la cifra junto a cada partida es el desvío contra tu
          presupuesto.
        </span>
      </div>
      {ind.ing.gt(0) ? (
        <p className="cap-nota">
          De cada RD$ 100 que entraron, <strong>{num(ind.gOp.div(ind.ing).times(100))}</strong> se fueron en gasto operativo y quedaron{" "}
          <strong>{num(ind.flujo.div(ind.ing).times(100))}</strong> de margen.{" "}
          {ind.efectivoResidual.lt(0)
            ? `Aportaste ${rd(ind.efectivoResidual.neg())} más de lo que generó el mes: salió de ahorros o de la tarjeta.`
            : `Después de aportar ${rd(ind.ap)} quedaron ${rd(ind.efectivoResidual)} en efectivo.`}
        </p>
      ) : null}
    </Panel>
  );
}

function MosaicosCierre({ datos, mes }: { datos: DatosCapital; mes: string }) {
  const ind = indicadores(datos.ctx, mes);
  const t = (v: Big) => (v.gt(0) ? "ok" : v.lt(0) ? "error" : "neutra");
  return (
    <>
      <Mosaicos etiqueta={`Resultado de ${mesLargo(mes)}`} columnas={6}>
        <Kpi rotulo="Ingresos" valor={num(ind.ing)} meta="lo que entró" tono="neutra" />
        <Kpi rotulo="Gasto operativo" valor={num(ind.gOp)} meta="fijos + variables" tono="neutra" />
        <Kpi rotulo="Flujo neto" valor={sg(ind.flujo)} meta="ingresos − gasto" tono={ind.ing.gt(0) ? t(ind.flujo) : "neutra"} />
        <Kpi rotulo="Aportado" valor={num(ind.ap)} meta="a invertir o ahorrar" tono="neutra" />
        <Kpi rotulo="Queda en efectivo" valor={sg(ind.efectivoResidual)} meta="flujo − aportes" tono={ind.ing.gt(0) ? t(ind.efectivoResidual) : "neutra"} />
        <Kpi rotulo="Tasa de ahorro" valor={pct(ind.tasaAhorro, 0)} meta={ind.tasaAhorro ? "flujo ÷ ingresos" : "sin ingresos"} tono="neutra" />
      </Mosaicos>
      <div className="cap-ancho cap-pie-mosaicos">
        <SelloRegistros foto={ind.foto} mesCierre={null} />
      </div>
    </>
  );
}

function Agregado({ c, mes }: { c: Cierre; mes: string }) {
  return (
    <Panel titulo="Mes histórico (agregado)" id="cap-t-agregado" ancho extra={<span className="tenue chico">cargado solo con totales</span>}>
      <div className="cap-dos" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <Dato rotulo="Ingresos">{c.totIngresos ? num(c.totIngresos) : "—"}</Dato>
        <Dato rotulo="Gasto fijo">{c.totFijos ? num(c.totFijos) : "—"}</Dato>
        <Dato rotulo="Gasto variable">{c.totVariables ? num(c.totVariables) : "—"}</Dato>
        <Dato rotulo="Aportes">{c.totAportes ? num(c.totAportes) : "—"}</Dato>
      </div>
      {c.nota ? <p className="cap-nota">{c.nota}</p> : null}
      <form action={desagregarCierre} className="cap-botones" style={{ marginTop: 12 }}>
        <input type="hidden" name="mes" value={mes} />
        <button className="boton secundario chico" type="submit">
          Convertir a desglose editable (prorrateo por presupuesto)
        </button>
      </form>
    </Panel>
  );
}

export function FormularioPresupuesto({ p, mes }: { p: Parametros; mes: string }) {
  return (
    <details className="cap-grupo cap-ancho">
      <summary>
        <Icono nombre="documento" />
        Presupuesto: las partidas del cierre
      </summary>
      <div className="cuerpo">
        <form action={guardarParametros} className="cap-form" key={JSON.stringify(LISTAS_PRESUPUESTO.map((l) => p[l]))}>
          <input type="hidden" name="seccion" value="presupuesto" />
          <input type="hidden" name="volver" value="/capital/cierre" />
          <input type="hidden" name="mes" value={mes} />
          {LISTAS_PRESUPUESTO.map((l) => {
            const filas = [...p[l], { id: "", nombre: "", pres: "" }, { id: "", nombre: "", pres: "" }];
            return (
              <fieldset key={l} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <legend className="cap-rotulo" style={{ marginBottom: 6 }}>
                  {TITULOS[l]}
                </legend>
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
                            <input
                              name={`${l}.${i}.nombre`}
                              defaultValue={f.nombre}
                              aria-label={`${TITULOS[l]}: nombre de la partida ${i + 1}`}
                              placeholder={f.id ? "" : "Nueva partida"}
                              maxLength={200}
                            />
                          </td>
                          <td>
                            <input
                              name={`${l}.${i}.pres`}
                              defaultValue={f.pres}
                              inputMode="decimal"
                              aria-label={`${TITULOS[l]}: presupuesto de la partida ${i + 1}`}
                              style={{ textAlign: "right" }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </fieldset>
            );
          })}
          <Mas titulo="Cómo quitar una partida">
            <p className="cap-nota">Deja el nombre vacío para quitarla. Los montos ya registrados de una partida quitada dejan de contar.</p>
          </Mas>
          <div className="cap-botones">
            <button className="boton chico" type="submit">
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
  const sinPartidas = datos.ctx.p.ingresos.length + datos.ctx.p.fijos.length + datos.ctx.p.variables.length + datos.ctx.p.aportes.length === 0;
  return (
    <>
      <Progreso datos={datos} mes={mes} />
      {c?.agregado ? (
        <Agregado c={c} mes={mes} />
      ) : sinPartidas ? (
        <section className="panel cap-ancho" aria-label="Sin presupuesto">
          <div className="panel-cuerpo">
            <SinDatos centro icono="calendario">
              Para guiarte en el cierre hacen falta tus partidas (ingresos, gastos y aportes). Créalas en «Presupuesto», abajo, o importa tu archivo.
            </SinDatos>
          </div>
        </section>
      ) : (
        <FormularioCierre datos={datos} mes={mes} />
      )}
      <MosaicosCierre datos={datos} mes={mes} />
      <FormularioPresupuesto p={datos.ctx.p} mes={mes} />
    </>
  );
}
